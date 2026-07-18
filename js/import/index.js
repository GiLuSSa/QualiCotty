/* QualiCotty — document import hub
 * Detects format by extension, dispatches to format parsers.
 * Exposes window.QualiCottyImport.
 */
(function (global) {
    'use strict';

    const SUPPORTED = /\.(txt|html?|vtt)$/i;

    function extensionOf(fileName) {
        const m = String(fileName || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
        return m ? m[1] : '';
    }

    function isSupportedFileName(fileName) {
        return SUPPORTED.test(String(fileName || ''));
    }

    function parseRaw(fileName, raw) {
        const ext = extensionOf(fileName);
        let parsed = null;

        if (ext === '.txt' && global.QualiCottyImportTxt) {
            parsed = global.QualiCottyImportTxt.parse(raw, fileName);
        } else if ((ext === '.html' || ext === '.htm') && global.QualiCottyImportHtml) {
            parsed = global.QualiCottyImportHtml.parse(raw, fileName);
        } else if (ext === '.vtt' && global.QualiCottyImportVtt) {
            parsed = global.QualiCottyImportVtt.parse(raw, fileName);
        }

        if (!parsed) {
            return {
                name: fileName || 'document',
                text: String(raw == null ? '' : raw),
                sourceFormat: ext.replace(/^\./, '') || 'unknown'
            };
        }
        return parsed;
    }

    /**
     * Read a File and return { name, text, sourceFormat }.
     * @param {File} file
     * @returns {Promise<{name:string,text:string,sourceFormat:string}>}
     */
    function readAndParseFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file.'));
                return;
            }
            if (!isSupportedFileName(file.name)) {
                reject(new Error('Unsupported file type: ' + file.name));
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    resolve(parseRaw(file.name, String(reader.result)));
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function () {
                reject(new Error('Failed to read ' + file.name));
            };
            reader.readAsText(file);
        });
    }

    /**
     * Filter a FileList / File[] to supported import formats.
     */
    function filterSupportedFiles(fileList) {
        return Array.from(fileList || []).filter(f => f && isSupportedFileName(f.name));
    }

    global.QualiCottyImport = {
        SUPPORTED: SUPPORTED,
        isSupportedFileName: isSupportedFileName,
        filterSupportedFiles: filterSupportedFiles,
        parseRaw: parseRaw,
        readAndParseFile: readAndParseFile
    };
})(window);
