/* QualiCotty — .cotty project save / load
 * All file save & load logic lives here (loaded before index.js).
 */
(function (global) {
    'use strict';

    const QUALICOTTY_VERSION = '0.01a';

    function newSaveTimestamp() {
        const now = new Date();
        const pad = (n, len) => String(n).padStart(len || 2, '0');
        const datePart =
            now.getFullYear() +
            pad(now.getMonth() + 1) +
            pad(now.getDate());
        const timePart =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let rand = '';
        for (let i = 0; i < 8; i++) {
            rand += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return datePart + '_' + timePart + '_' + rand;
    }

    function safeFilename(name) {
        const base = String(name || 'project')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^\.+|\.+$/g, '');
        return (base || 'project') + '.cotty';
    }

    /**
     * Build a .cotty payload, append a new save timestamp at the end of `saves`,
     * download the file, and return the updated saves list (so the app can persist it).
     */
    function downloadCottyFile(options) {
        const stamp = newSaveTimestamp();
        const previous = Array.isArray(options.saves) ? options.saves.slice() : [];
        const saves = previous.concat([stamp]);
        const project = options.project || {};

        // Key order matters for readability: saves is last.
        const payload = {
            project: {
                timestamp: project.timestamp || newSaveTimestamp(),
                name: project.name || 'Untitled project',
                description: project.description || '',
                userName: project.userName || '',
                version: project.version || QUALICOTTY_VERSION
            },
            codebook: {
                name: (options.codebook && options.codebook.name) || 'Untitled codebook',
                description: (options.codebook && options.codebook.description) || '',
                codes: (options.codebook && options.codebook.codes) || []
            },
            documents: Array.isArray(options.documents) ? options.documents : [],
            segments: Array.isArray(options.segments) ? options.segments : [],
            saves: saves
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFilename(payload.project.name);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return saves;
    }

    /**
     * Normalize a parsed .cotty JSON object into a consistent project snapshot.
     * @returns {{project, codebook, documents, segments, saves}|null}
     */
    function parseCottyPayload(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const codebookSrc = raw.codebook && typeof raw.codebook === 'object' ? raw.codebook : {};
        const projectSrc = raw.project && typeof raw.project === 'object' ? raw.project : null;

        // Prefer project.timestamp; fall back to legacy codebook.timestamp.
        const projectTimestamp = (projectSrc && projectSrc.timestamp)
            || codebookSrc.timestamp
            || newSaveTimestamp();

        const project = projectSrc
            ? {
                timestamp: projectTimestamp,
                name: projectSrc.name || 'Untitled project',
                description: projectSrc.description || '',
                userName: projectSrc.userName || '',
                version: projectSrc.version || QUALICOTTY_VERSION
            }
            : {
                timestamp: projectTimestamp,
                name: codebookSrc.project || 'Untitled project',
                description: '',
                userName: '',
                version: QUALICOTTY_VERSION
            };

        const codebook = {
            name: codebookSrc.name || 'Untitled codebook',
            description: typeof codebookSrc.description === 'string' ? codebookSrc.description : '',
            codes: Array.isArray(codebookSrc.codes) ? codebookSrc.codes : []
        };

        if (codebook.codes.length === 0) {
            codebook.codes = [{
                timestamp: newSaveTimestamp(),
                name: 'Code 1',
                colour: (global.QualiCottyPalette && global.QualiCottyPalette.getDefaultColour())
                    || '#ffe066',
                description: 'type your description here...'
            }];
        }

        return {
            project: project,
            codebook: codebook,
            documents: Array.isArray(raw.documents) ? raw.documents : [],
            segments: Array.isArray(raw.segments) ? raw.segments : [],
            saves: Array.isArray(raw.saves) ? raw.saves : []
        };
    }

    /**
     * Read a File as text and parse it as a .cotty project.
     * @param {File} file
     * @returns {Promise<object>} normalized project snapshot
     */
    function readCottyFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file selected.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    const raw = JSON.parse(String(reader.result));
                    const parsed = parseCottyPayload(raw);
                    if (!parsed) {
                        reject(new Error('Invalid .cotty file.'));
                        return;
                    }
                    resolve(parsed);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function () {
                reject(new Error('Failed to read file.'));
            };
            reader.readAsText(file);
        });
    }

    /**
     * Open an OS file picker (via a hidden <input type="file">) and load a .cotty file.
     * @param {HTMLInputElement} fileInput
     * @returns {Promise<object|null>} normalized snapshot, or null if cancelled
     */
    function pickAndLoadCottyFile(fileInput) {
        return new Promise((resolve, reject) => {
            if (!fileInput) {
                reject(new Error('File input is missing.'));
                return;
            }

            const onChange = function () {
                fileInput.removeEventListener('change', onChange);
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = '';
                if (!file) {
                    resolve(null);
                    return;
                }
                readCottyFile(file).then(resolve).catch(reject);
            };

            fileInput.addEventListener('change', onChange);
            fileInput.click();
        });
    }

    function safeCodebookFilename(name) {
        const base = String(name || 'codebook')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^\.+|\.+$/g, '');
        return (base || 'codebook') + '.cottybook';
    }

    /**
     * Export codebook as .cottybook — same codes shape as in .cotty, plus QualiCotty version.
     */
    function downloadCottybookFile(options) {
        const version = (options && options.version) || QUALICOTTY_VERSION;
        const src = (options && options.codebook) || {};
        const codes = Array.isArray(src.codes) ? src.codes : [];
        const payload = {
            version: version,
            codebook: {
                name: src.name || 'Untitled codebook',
                description: typeof src.description === 'string' ? src.description : '',
                codes: codes
            }
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeCodebookFilename(options && options.filenameBase);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return payload;
    }

    /**
     * Normalize a .cottybook (or codebook-bearing JSON) into { version, name, description, codes }.
     */
    function parseCottybookPayload(raw) {
        if (!raw || typeof raw !== 'object') return null;

        let codebookSrc = null;
        if (raw.codebook && typeof raw.codebook === 'object') {
            codebookSrc = raw.codebook;
        } else if (Array.isArray(raw.codes)) {
            codebookSrc = raw;
        }
        if (!codebookSrc) return null;

        const codesSrc = Array.isArray(codebookSrc.codes) ? codebookSrc.codes : null;
        if (!codesSrc) return null;

        const normalized = [];
        codesSrc.forEach(c => {
            if (!c || typeof c !== 'object') return;
            if (!c.timestamp || !c.name) return;
            normalized.push({
                timestamp: String(c.timestamp),
                name: String(c.name),
                colour: c.colour
                    ? ((global.QualiCottyPalette && global.QualiCottyPalette.normalizeHex(c.colour))
                        || String(c.colour))
                    : ((global.QualiCottyPalette && global.QualiCottyPalette.getDefaultColour())
                        || '#ffe066'),
                description: typeof c.description === 'string' ? c.description : ''
            });
        });

        return {
            version: raw.version || (raw.project && raw.project.version) || QUALICOTTY_VERSION,
            name: codebookSrc.name || 'Untitled codebook',
            description: typeof codebookSrc.description === 'string' ? codebookSrc.description : '',
            codes: normalized
        };
    }

    function readCottybookFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file selected.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    const raw = JSON.parse(String(reader.result));
                    const parsed = parseCottybookPayload(raw);
                    if (!parsed) {
                        reject(new Error('Invalid .cottybook file.'));
                        return;
                    }
                    resolve(parsed);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function () {
                reject(new Error('Failed to read file.'));
            };
            reader.readAsText(file);
        });
    }

    function pickAndLoadCottybookFile(fileInput) {
        return new Promise((resolve, reject) => {
            if (!fileInput) {
                reject(new Error('File input is missing.'));
                return;
            }

            const onChange = function () {
                fileInput.removeEventListener('change', onChange);
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = '';
                if (!file) {
                    resolve(null);
                    return;
                }
                readCottybookFile(file).then(resolve).catch(reject);
            };

            fileInput.addEventListener('change', onChange);
            fileInput.click();
        });
    }

    global.QualiCottySave = {
        QUALICOTTY_VERSION: QUALICOTTY_VERSION,
        newSaveTimestamp: newSaveTimestamp,
        downloadCottyFile: downloadCottyFile,
        parseCottyPayload: parseCottyPayload,
        readCottyFile: readCottyFile,
        pickAndLoadCottyFile: pickAndLoadCottyFile,
        downloadCottybookFile: downloadCottybookFile,
        parseCottybookPayload: parseCottybookPayload,
        readCottybookFile: readCottybookFile,
        pickAndLoadCottybookFile: pickAndLoadCottybookFile
    };
})(window);
