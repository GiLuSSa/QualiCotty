/* QualiCotty - Web QCA Tool
 * No backend. Codebook + segments persist to localStorage; documents to IndexedDB.
 * Modules: js/palette.js, js/save.js, js/idb-documents.js, js/segments.js, js/documents.js, js/codebook.js, js/gui.js
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'qualicotty_project';
    const VIEW_KEY = 'qualicotty_view';
    const QUALICOTTY_VERSION = window.QualiCottyVersion || '0.00';
    const DEFAULT_DESCRIPTION = 'type your description here...';
    const DOC_SAVE_DEBOUNCE_MS = 300;

    function defaultColour() {
        return window.QualiCottyPalette
            ? window.QualiCottyPalette.getDefaultColour()
            : '#ffe066';
    }

    function newTimestamp() {
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

    class QCode {
        constructor(name, colour, description) {
            this.timestamp = newTimestamp();
            this.name = name;
            this.colour = colour || defaultColour();
            this.description = description || DEFAULT_DESCRIPTION;
        }
    }

    class QCodebook {
        constructor(project) {
            this.projectTimestamp = newTimestamp();
            this.project = project || 'Untitled project';
            this.projectDescription = '';
            this.userName = '';
            this.version = QUALICOTTY_VERSION;
            this.name = 'Untitled codebook';
            this.description = '';
            this.codes = [new QCode('Code 1', defaultColour(), DEFAULT_DESCRIPTION)];
            this.saves = [];
        }
    }

    const state = {
        codebook: null,
        documents: [],
        segments: [],
        activeDocumentTimestamp: null,
        activeCodeTimestamp: null,
        mode: 'code',
        isolateSegments: false,
        mergeSegments: false,
        hiddenCodes: new Set(),
        analyzeLogic: 'and',
        analyzeFilterTags: new Set(),
        analyzeQueryMode: false,
        analyzeQuery: '',
        analyzeTextFilter: '',
        analyzeQueryError: '',
        fontSizePt: 11,
        fontFamily: 'georgia',
        textAlign: 'justify-left',
        colourblindMode: false,
        viewHistory: [],
        viewIndex: -1,
        navigating: false,
        editingSegment: null
    };

    let Seg = null;
    let Docs = null;
    let Cbk = null;
    let Gui = null;

    let documentsDirty = false;
    let documentsSaving = false;
    let docSaveTimer = null;
    let docSaveChain = Promise.resolve();
    let docSaveInFlight = 0;
    let syncAllowClose = false;

    function byTimestamp(a, b) {
        if (a.timestamp < b.timestamp) return -1;
        if (a.timestamp > b.timestamp) return 1;
        return 0;
    }

    function documentsSyncPending() {
        return documentsDirty || documentsSaving;
    }

    function getBootOverlayEls() {
        return {
            overlay: document.getElementById('bootLoadingOverlay'),
            message: document.getElementById('bootLoadingMessage')
        };
    }

    function getSyncOverlayEls() {
        return {
            overlay: document.getElementById('syncPendingOverlay'),
            message: document.getElementById('syncPendingMessage')
        };
    }

    function showBootLoading(projectName) {
        const elsBoot = getBootOverlayEls();
        if (!elsBoot.overlay) return;
        const name = projectName || 'Untitled project';
        if (elsBoot.message) {
            elsBoot.message.textContent = 'Loading "' + name + '" documents…';
        }
        elsBoot.overlay.classList.add('visible');
        elsBoot.overlay.setAttribute('aria-hidden', 'false');
    }

    function hideBootLoading() {
        const elsBoot = getBootOverlayEls();
        if (!elsBoot.overlay) return;
        elsBoot.overlay.classList.remove('visible');
        elsBoot.overlay.setAttribute('aria-hidden', 'true');
    }

    function showSyncOverlay(text) {
        const elsSync = getSyncOverlayEls();
        if (!elsSync.overlay) return;
        if (elsSync.message) elsSync.message.textContent = text;
        elsSync.overlay.classList.add('visible');
        elsSync.overlay.setAttribute('aria-hidden', 'false');
    }

    function hideSyncOverlay() {
        const elsSync = getSyncOverlayEls();
        if (!elsSync.overlay) return;
        elsSync.overlay.classList.remove('visible');
        elsSync.overlay.setAttribute('aria-hidden', 'true');
    }

    function saveState() {
        state.segments.sort(byTimestamp);
        const data = {
            codebook: state.codebook,
            segments: state.segments
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (err) {
            console.error('QualiCotty: failed to save to localStorage', err);
        }
    }

    function saveDocuments() {
        if (docSaveTimer) {
            clearTimeout(docSaveTimer);
            docSaveTimer = null;
        }
        documentsSaving = true;
        documentsDirty = false;
        syncAllowClose = false;
        docSaveInFlight += 1;

        const Idb = window.QualiCottyIdb;
        if (!Idb || typeof Idb.setDocuments !== 'function') {
            docSaveInFlight = Math.max(0, docSaveInFlight - 1);
            documentsSaving = docSaveInFlight > 0;
            documentsDirty = true;
            console.error('QualiCotty: IndexedDB module is not available');
            return Promise.reject(new Error('IndexedDB module is not available'));
        }

        docSaveChain = docSaveChain.catch(function () {}).then(function () {
            state.documents.sort(byTimestamp);
            if (window.QualiCottyDocuments && window.QualiCottyDocuments.normalizeDocuments) {
                window.QualiCottyDocuments.normalizeDocuments(state.documents);
            }
            const snapshot = state.documents.slice();
            return Idb.setDocuments(snapshot).then(function () {
                docSaveInFlight = Math.max(0, docSaveInFlight - 1);
                if (docSaveInFlight === 0) {
                    documentsSaving = false;
                    if (documentsDirty) {
                        return saveDocuments();
                    }
                }
            }).catch(function (err) {
                docSaveInFlight = Math.max(0, docSaveInFlight - 1);
                documentsSaving = docSaveInFlight > 0;
                documentsDirty = true;
                console.error('QualiCotty: failed to save documents to IndexedDB', err);
                throw err;
            });
        });
        return docSaveChain;
    }

    function scheduleSaveDocuments() {
        documentsDirty = true;
        syncAllowClose = false;
        if (docSaveTimer) clearTimeout(docSaveTimer);
        docSaveTimer = setTimeout(function () {
            docSaveTimer = null;
            saveDocuments();
        }, DOC_SAVE_DEBOUNCE_MS);
    }

    function flushSaveDocuments() {
        if (docSaveTimer) {
            clearTimeout(docSaveTimer);
            docSaveTimer = null;
        }
        return saveDocuments();
    }

    function normalizeCodebookFields() {
        if (typeof state.codebook.userName !== 'string') state.codebook.userName = '';
        if (!Array.isArray(state.codebook.saves)) state.codebook.saves = [];
        if (!state.codebook.projectTimestamp) {
            state.codebook.projectTimestamp = state.codebook.timestamp || newTimestamp();
        }
        if (state.codebook.timestamp !== undefined) {
            delete state.codebook.timestamp;
        }
        if (typeof state.codebook.version !== 'string' || !state.codebook.version) {
            state.codebook.version = QUALICOTTY_VERSION;
        }
        if (typeof state.codebook.projectDescription !== 'string') {
            state.codebook.projectDescription =
                typeof state.codebook.description === 'string' ? state.codebook.description : '';
            state.codebook.description = '';
        }
        if (typeof state.codebook.description !== 'string') state.codebook.description = '';
        if (typeof state.codebook.name !== 'string' || !state.codebook.name.trim()) {
            state.codebook.name = 'Untitled codebook';
        }
        if (typeof state.codebook.project !== 'string' || !state.codebook.project.trim()) {
            state.codebook.project = 'Untitled project';
        }
    }

    function loadLocalProjectMeta() {
        let data = null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) data = JSON.parse(raw);
        } catch (err) {
            console.error('QualiCotty: failed to load from localStorage', err);
        }

        if (data && data.codebook) {
            state.codebook = data.codebook;
            state.segments = Array.isArray(data.segments) ? data.segments : [];
        } else {
            state.codebook = new QCodebook('Untitled project');
            state.segments = [];
            saveState();
        }

        normalizeCodebookFields();
        window.QualiCottySegments.migrateSegmentCodes(state.segments, state.codebook);
        state.segments.sort(byTimestamp);

        if (state.codebook.codes.length > 0) {
            state.activeCodeTimestamp = state.codebook.codes[0].timestamp;
        }

        return state.codebook.project || 'Untitled project';
    }

    function loadState() {
        const projectName = loadLocalProjectMeta();
        showBootLoading(projectName);

        const Idb = window.QualiCottyIdb;
        const docsPromise = (Idb && typeof Idb.getDocuments === 'function')
            ? Idb.getDocuments()
            : Promise.resolve([]);

        return docsPromise.then(function (docs) {
            state.documents = Array.isArray(docs) ? docs : [];
            if (window.QualiCottyDocuments && window.QualiCottyDocuments.normalizeDocuments) {
                window.QualiCottyDocuments.normalizeDocuments(state.documents);
            }
            state.documents.sort(byTimestamp);
            if (state.documents.length > 0) {
                state.activeDocumentTimestamp = state.documents[0].timestamp;
            } else {
                state.activeDocumentTimestamp = null;
            }
            documentsDirty = false;
            documentsSaving = false;
        }).catch(function (err) {
            console.error('QualiCotty: failed to load documents from IndexedDB', err);
            state.documents = [];
            state.activeDocumentTimestamp = null;
        }).then(function () {
            hideBootLoading();
        });
    }

    function setupDocumentsSyncGuard() {
        window.addEventListener('beforeunload', function (event) {
            if (syncAllowClose || !documentsSyncPending()) return;
            showSyncOverlay('One sec. to synchronize everything…');
            flushSaveDocuments().then(function () {
                syncAllowClose = true;
                showSyncOverlay('Ok, you can close QualiCotty');
                setTimeout(function () {
                    if (!documentsSyncPending()) hideSyncOverlay();
                }, 2500);
            }).catch(function () {
                showSyncOverlay('One sec. to synchronize everything…');
            });
            event.preventDefault();
            event.returnValue = '';
        });

        window.addEventListener('pagehide', function () {
            if (documentsSyncPending()) {
                flushSaveDocuments();
            }
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden' && documentsSyncPending()) {
                flushSaveDocuments();
            }
        });
    }

    function saveView() {
        try {
            localStorage.setItem(VIEW_KEY, JSON.stringify({
                fontSizePt: state.fontSizePt,
                fontFamily: state.fontFamily,
                textAlign: state.textAlign || 'justify-left',
                colourblindMode: !!state.colourblindMode
            }));
        } catch (err) {
            console.error('QualiCotty: failed to save view prefs', err);
        }
    }

    function loadView() {
        try {
            const raw = localStorage.getItem(VIEW_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (typeof data.fontSizePt === 'number') state.fontSizePt = data.fontSizePt;
            if (typeof data.fontFamily === 'string') state.fontFamily = data.fontFamily;
            if (typeof data.textAlign === 'string' &&
                ['left', 'justify-left', 'justify-right', 'right'].indexOf(data.textAlign) !== -1) {
                state.textAlign = data.textAlign;
            }
            if (typeof data.colourblindMode === 'boolean') {
                state.colourblindMode = data.colourblindMode;
            }
        } catch (err) {
            console.error('QualiCotty: failed to load view prefs', err);
        }
        if (window.QualiCottyPalette) {
            window.QualiCottyPalette.setColourblindMode(state.colourblindMode);
        }
    }

    function getCodeByName(name) {
        return state.codebook.codes.find(c => c.name === name) || null;
    }

    function getCodeByTimestamp(ts) {
        return state.codebook.codes.find(c => c.timestamp === ts) || null;
    }

    const els = {
        appBrand: document.getElementById('appBrand'),
        appFavicon: document.getElementById('appFavicon'),
        appBrandInfo: document.getElementById('appBrandInfo'),
        appVersion: document.getElementById('appVersion'),
        aboutModal: document.getElementById('aboutModal'),
        aboutModalTitle: document.getElementById('aboutModalTitle'),
        aboutModalClose: document.getElementById('aboutModalClose'),
        bootLoadingOverlay: document.getElementById('bootLoadingOverlay'),
        bootLoadingMessage: document.getElementById('bootLoadingMessage'),
        syncPendingOverlay: document.getElementById('syncPendingOverlay'),
        syncPendingMessage: document.getElementById('syncPendingMessage'),
        projectNameBtn: document.getElementById('projectNameBtn'),
        projectModal: document.getElementById('projectModal'),
        projectModalClose: document.getElementById('projectModalClose'),
        projectPropName: document.getElementById('projectPropName'),
        projectPropDescription: document.getElementById('projectPropDescription'),
        projectPropUser: document.getElementById('projectPropUser'),
        projectSaveBtn: document.getElementById('projectSaveBtn'),
        projectLoadBtn: document.getElementById('projectLoadBtn'),
        projectNewBtn: document.getElementById('projectNewBtn'),
        projectLoadInput: document.getElementById('projectLoadInput'),
        documentList: document.getElementById('documentList'),
        documentView: document.getElementById('documentView'),
        documentModal: document.getElementById('documentModal'),
        documentModalClose: document.getElementById('documentModalClose'),
        documentPropName: document.getElementById('documentPropName'),
        documentPropDescription: document.getElementById('documentPropDescription'),
        documentPropType: document.getElementById('documentPropType'),
        documentPropPersons: document.getElementById('documentPropPersons'),
        documentPropKeywords: document.getElementById('documentPropKeywords'),
        documentPropColour: document.getElementById('documentPropColour'),
        documentPropColourPreview: document.getElementById('documentPropColourPreview'),
        documentDeleteBtn: document.getElementById('documentDeleteBtn'),
        centerColumn: document.querySelector('.center-column'),
        tagBar: document.getElementById('tagBar'),
        rightPanelTitle: document.getElementById('rightPanelTitle'),
        dropOverlay: document.getElementById('dropOverlay'),
        modeCode: document.getElementById('modeCode'),
        modeAnalyze: document.getElementById('modeAnalyze'),
        navBack: document.getElementById('navBack'),
        navForward: document.getElementById('navForward'),
        fontSizeBox: document.getElementById('fontSizeBox'),
        fontDec: document.getElementById('fontDec'),
        fontInc: document.getElementById('fontInc'),
        fontSelector: document.getElementById('fontSelector'),
        alignLeft: document.getElementById('alignLeft'),
        alignJustifyLeft: document.getElementById('alignJustifyLeft'),
        alignJustifyRight: document.getElementById('alignJustifyRight'),
        alignRight: document.getElementById('alignRight'),
        segmentModal: document.getElementById('segmentModal'),
        segmentModalClose: document.getElementById('segmentModalClose'),
        segmentSnippet: document.getElementById('segmentSnippet'),
        segmentTags: document.getElementById('segmentTags'),
        segmentComment: document.getElementById('segmentComment'),
        segmentDeleteBtn: document.getElementById('segmentDeleteBtn'),
        codebookModal: document.getElementById('codebookModal'),
        codebookModalClose: document.getElementById('codebookModalClose'),
        codebookPropName: document.getElementById('codebookPropName'),
        codebookPropDescription: document.getElementById('codebookPropDescription'),
        codebookColourblindToggle: document.getElementById('codebookColourblindToggle'),
        codebookList: document.getElementById('codebookList'),
        codebookImportBtn: document.getElementById('codebookImportBtn'),
        codebookExportBtn: document.getElementById('codebookExportBtn'),
        codebookImportInput: document.getElementById('codebookImportInput')
    };

    function init() {
        setupDocumentsSyncGuard();

        loadState().then(function () {
            loadView();

            Docs = window.QualiCottyDocuments.create({
                getState: function () { return state; },
                getEls: function () { return els; },
                saveState: saveState,
                scheduleSaveDocuments: scheduleSaveDocuments,
                flushSaveDocuments: flushSaveDocuments,
                getSeg: function () { return Seg; },
                isCodeVisible: function (ts) { return Gui.isCodeVisible(ts); },
                applyViewChange: function (mutator, focusOffset) {
                    return Gui.applyViewChange(mutator, focusOffset);
                }
            });

            Gui = window.QualiCottyGui.create({
                getState: function () { return state; },
                getEls: function () { return els; },
                saveState: saveState,
                saveView: saveView,
                flushSaveDocuments: flushSaveDocuments,
                getDocs: function () { return Docs; },
                getSeg: function () { return Seg; },
                getCbk: function () { return Cbk; },
                getCodeByName: getCodeByName,
                getCodeByTimestamp: getCodeByTimestamp,
                createCode: function (name, colour, description) {
                    return new QCode(name, colour, description);
                },
                defaultDescription: DEFAULT_DESCRIPTION,
                qualicottyVersion: QUALICOTTY_VERSION,
                byTimestamp: byTimestamp,
                createEmptyCodebook: function (project) {
                    return new QCodebook(project);
                }
            });

            Seg = window.QualiCottySegments.create({
                getState: function () { return state; },
                getEls: function () { return els; },
                saveState: saveState,
                getDocument: function (ts) { return Docs.getDocument(ts); },
                getActiveDocument: function () { return Docs.getActiveDocument(); },
                getCodeByTimestamp: getCodeByTimestamp,
                renderDocumentView: function () { Docs.renderDocumentView(); },
                exitIsolationToContext: function (docTs, scrollStart) {
                    Docs.exitIsolationToContext(docTs, scrollStart);
                },
                clamp: Docs.clamp,
                stripeBackground: function (colours, bandPx, alpha) {
                    return window.QualiCottyPalette.stripeBackground(colours, bandPx, alpha);
                }
            });

            Cbk = window.QualiCottyCodebook.create({
                getState: function () { return state; },
                getEls: function () { return els; },
                saveState: saveState,
                saveView: saveView,
                renderDocumentView: function () { Docs.renderDocumentView(); },
                renderCodeBar: function () { Gui.renderRightBar(); },
                getCodeByName: getCodeByName,
                getCodeByTimestamp: getCodeByTimestamp,
                onCodesChanged: function () {
                    Gui.renderRightBar();
                    Docs.renderDocumentView();
                },
                onColourblindModeChanged: function () {
                    Gui.renderRightBar();
                    Docs.renderDocumentList();
                    Docs.renderDocumentView();
                    if (Docs.syncDocumentColourPreview) Docs.syncDocumentColourPreview();
                }
            });
            Cbk.setup();

            Gui.setup();
            Docs.setupDocumentModal();
            Gui.renderCurrentView();
            Seg.setupSegmentClick();
            Seg.setupSegmentModal();

            state.viewHistory = [Gui.snapshotNow()];
            state.viewIndex = 0;
            Gui.updateNavButtons();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
