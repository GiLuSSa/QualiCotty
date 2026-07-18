/* QualiCotty — document model, list, view rendering, file import
 * Loaded before index.js. Exposes window.QualiCottyDocuments.
 */
(function (global) {
    'use strict';

    /** How many document rows fit in the left bar before scrolling. */
    const VISIBLE_DOCUMENT_ROWS = 10;

    /** Default document accent (matches CSS --accent). */
    const DEFAULT_DOCUMENT_COLOUR = '#4a90e2';

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

    function normalizeHex(colour) {
        if (global.QualiCottyPalette && typeof global.QualiCottyPalette.normalizeHex === 'function') {
            return global.QualiCottyPalette.normalizeHex(colour);
        }
        if (typeof colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(colour.trim())) {
            return colour.trim().toLowerCase();
        }
        return DEFAULT_DOCUMENT_COLOUR;
    }

    function displayDocColour(colour) {
        if (global.QualiCottyPalette && typeof global.QualiCottyPalette.displayColour === 'function') {
            return global.QualiCottyPalette.displayColour(colour);
        }
        return normalizeHex(colour);
    }

    /** Ensure a document object has name, text, description, colour. */
    function normalizeDocument(doc) {
        if (!doc || typeof doc !== 'object') return doc;
        if (typeof doc.name !== 'string') doc.name = 'Untitled';
        if (typeof doc.text !== 'string') doc.text = '';
        if (typeof doc.description !== 'string') doc.description = '';
        doc.colour = normalizeHex(doc.colour || DEFAULT_DOCUMENT_COLOUR);
        if (!doc.timestamp) doc.timestamp = newTimestamp();
        return doc;
    }

    function normalizeDocuments(docs) {
        if (!Array.isArray(docs)) return [];
        docs.forEach(normalizeDocument);
        return docs;
    }

    class QDocument {
        constructor(name, text, description, colour) {
            this.timestamp = newTimestamp();
            this.name = name;
            this.text = text;
            this.description = typeof description === 'string' ? description : '';
            this.colour = normalizeHex(colour || DEFAULT_DOCUMENT_COLOUR);
        }
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    /**
     * @param {object} ctx
     */
    function create(ctx) {
        const {
            getState,
            getEls,
            saveState,
            getSeg,
            isCodeVisible,
            applyViewChange
        } = ctx;

        function getDocument(ts) {
            return getState().documents.find(d => d.timestamp === ts) || null;
        }

        function getActiveDocument() {
            return getDocument(getState().activeDocumentTimestamp);
        }

        let editingDocument = null;

        function docListTitle(doc) {
            const name = doc.name || 'Untitled';
            const desc = (doc.description || '').trim();
            return desc ? name + '\n' + desc : name;
        }

        function renderDocumentList() {
            const state = getState();
            const els = getEls();
            els.documentList.innerHTML = '';
            state.documents.forEach(doc => {
                normalizeDocument(doc);
                const li = document.createElement('li');
                li.textContent = doc.name;
                li.title = docListTitle(doc);
                li.dataset.ts = doc.timestamp;
                li.style.setProperty('--doc-colour', displayDocColour(doc.colour));
                if (doc.timestamp === state.activeDocumentTimestamp) {
                    li.classList.add('active');
                }
                li.addEventListener('click', () => {
                    if (doc.timestamp === state.activeDocumentTimestamp) return;
                    applyViewChange(() => {
                        state.activeDocumentTimestamp = doc.timestamp;
                    });
                });
                li.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    openDocumentModal(doc);
                });
                els.documentList.appendChild(li);
            });
        }

        function syncDocumentColourPreview() {
            const els = getEls();
            if (!els.documentPropColourPreview) return;
            const colourblindOn = global.QualiCottyPalette
                && typeof global.QualiCottyPalette.isColourblindMode === 'function'
                && global.QualiCottyPalette.isColourblindMode();
            if (!colourblindOn || !editingDocument) {
                els.documentPropColourPreview.hidden = true;
                return;
            }
            els.documentPropColourPreview.hidden = false;
            els.documentPropColourPreview.style.backgroundColor =
                displayDocColour(editingDocument.colour);
            els.documentPropColourPreview.title = 'Colourblind display';
        }

        function openDocumentModal(doc) {
            const els = getEls();
            if (!els.documentModal || !doc) return;
            normalizeDocument(doc);
            editingDocument = doc;
            els.documentPropName.value = doc.name || '';
            els.documentPropDescription.value = doc.description || '';
            els.documentPropColour.value = normalizeHex(doc.colour);
            syncDocumentColourPreview();
            els.documentModal.classList.add('visible');
            els.documentPropName.focus();
            els.documentPropName.select();
        }

        function closeDocumentModal() {
            const els = getEls();
            if (editingDocument && els.documentPropName) {
                const name = els.documentPropName.value.trim();
                editingDocument.name = name || editingDocument.name || 'Untitled';
                editingDocument.description = els.documentPropDescription.value;
                editingDocument.colour = normalizeHex(els.documentPropColour.value);
                saveState();
                renderDocumentList();
            }
            editingDocument = null;
            if (els.documentModal) els.documentModal.classList.remove('visible');
        }

        function setupDocumentModal() {
            const els = getEls();
            if (!els.documentModal) return;

            els.documentModalClose.addEventListener('click', closeDocumentModal);
            els.documentModal.addEventListener('click', e => {
                if (e.target === els.documentModal) closeDocumentModal();
            });

            els.documentPropName.addEventListener('input', () => {
                if (!editingDocument) return;
                const name = els.documentPropName.value.trim();
                editingDocument.name = name || editingDocument.name || 'Untitled';
                saveState();
                renderDocumentList();
            });
            els.documentPropDescription.addEventListener('input', () => {
                if (!editingDocument) return;
                editingDocument.description = els.documentPropDescription.value;
                saveState();
                renderDocumentList();
            });
            els.documentPropColour.addEventListener('input', () => {
                if (!editingDocument) return;
                editingDocument.colour = normalizeHex(els.documentPropColour.value);
                syncDocumentColourPreview();
                saveState();
                renderDocumentList();
            });

            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && els.documentModal.classList.contains('visible')) {
                    closeDocumentModal();
                }
            });
        }

        function appendDocText(frag, doc, isolate) {
            const state = getState();
            const Seg = getSeg();

            if (state.mode !== 'analyze') {
                const text = doc.text;
                const segments = state.segments.filter(s => s.documentTimestamp === doc.timestamp);

                const boundarySet = new Set([0, text.length]);
                segments.forEach(s => {
                    const start = clamp(s.coordinates.start, 0, text.length);
                    const end = clamp(s.coordinates.end, 0, text.length);
                    boundarySet.add(start);
                    boundarySet.add(end);
                });
                const boundaries = Array.from(boundarySet).sort((a, b) => a - b);
                let lastWasOmitted = false;

                for (let i = 0; i < boundaries.length - 1; i++) {
                    const rangeStart = boundaries[i];
                    const rangeEnd = boundaries[i + 1];
                    if (rangeEnd <= rangeStart) continue;

                    const slice = text.slice(rangeStart, rangeEnd);
                    const covering = segments.filter(s =>
                        s.coordinates.start <= rangeStart && s.coordinates.end >= rangeEnd
                    );
                    const codeTs = Seg.collectCodeTimestamps(covering).filter(isCodeVisible);

                    if (codeTs.length === 0) {
                        if (isolate) {
                            if (!lastWasOmitted) {
                                frag.appendChild(Seg.createOmittedSep());
                                lastWasOmitted = true;
                            }
                        } else {
                            frag.appendChild(document.createTextNode(slice));
                            lastWasOmitted = false;
                        }
                        continue;
                    }

                    frag.appendChild(Seg.createHighlightSpan(slice, codeTs, doc.timestamp, rangeStart, rangeEnd));
                    lastWasOmitted = false;
                }
                return;
            }

            const units = Seg.computeAnalyzeDisplayUnits(doc);
            const text = doc.text;

            if (isolate) {
                units.forEach((unit, idx) => {
                    if (idx > 0) frag.appendChild(Seg.createOmittedSep());
                    Seg.paintDisplayUnit(frag, doc, unit);
                });
                return;
            }

            if (units.length === 0) {
                frag.appendChild(document.createTextNode(text));
                return;
            }

            let cursor = 0;
            units.forEach(unit => {
                if (unit.start > cursor) {
                    frag.appendChild(document.createTextNode(text.slice(cursor, unit.start)));
                }
                Seg.paintDisplayUnit(frag, doc, unit);
                cursor = unit.end;
            });
            if (cursor < text.length) {
                frag.appendChild(document.createTextNode(text.slice(cursor)));
            }
        }

        function renderMergedIsolatedView() {
            const state = getState();
            const els = getEls();
            const Seg = getSeg();
            const frag = document.createDocumentFragment();
            let anyShown = false;

            state.documents.forEach(doc => {
                const units = Seg.computeAnalyzeDisplayUnits(doc);
                if (units.length === 0) return;

                const header = document.createElement('div');
                header.className = 'merge-doc-header';
                header.textContent = doc.name;
                frag.appendChild(header);

                units.forEach((unit, idx) => {
                    if (idx > 0) frag.appendChild(Seg.createOmittedSep());
                    Seg.paintDisplayUnit(frag, doc, unit);
                });

                anyShown = true;
            });

            if (!anyShown) {
                const empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.innerHTML = '<p>No visible segments to merge.</p>';
                frag.appendChild(empty);
            }

            els.documentView.innerHTML = '';
            els.documentView.appendChild(frag);
            els.documentView.classList.add('isolating');
            Seg.updateAnalyzeStats();
        }

        function scrollToOffset(offset) {
            const els = getEls();
            if (typeof offset !== 'number' || isNaN(offset)) return;
            const spans = els.documentView.querySelectorAll('.hl');
            for (let i = 0; i < spans.length; i++) {
                const s = parseInt(spans[i].dataset.start, 10);
                const e = parseInt(spans[i].dataset.end, 10);
                if (!isNaN(s) && !isNaN(e) && s <= offset && offset < e) {
                    spans[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    spans[i].classList.add('hl-focus');
                    setTimeout(() => spans[i].classList.remove('hl-focus'), 1600);
                    return;
                }
            }
        }

        function exitIsolationToContext(docTs, scrollStart) {
            const state = getState();
            applyViewChange(() => {
                state.isolateSegments = false;
                state.mergeSegments = false;
                if (docTs) {
                    state.activeDocumentTimestamp = docTs;
                }
            }, (typeof scrollStart === 'number') ? scrollStart : undefined);
        }

        function renderDocumentView() {
            const state = getState();
            const els = getEls();
            const Seg = getSeg();
            const isolate = state.mode === 'analyze' && state.isolateSegments;
            const merge = isolate && state.mergeSegments;

            if (merge) {
                if (state.documents.length === 0) {
                    els.documentView.classList.remove('isolating');
                    els.documentView.innerHTML =
                        '<div class="empty-state">' +
                        '<p>No document loaded.</p>' +
                        '<p>Drag &amp; drop one or more <strong>.txt</strong>, <strong>.html</strong>, or <strong>.vtt</strong> files here to begin.</p>' +
                        '</div>';
                    return;
                }
                renderMergedIsolatedView();
                return;
            }

            const doc = getActiveDocument();
            if (!doc) {
                els.documentView.classList.remove('isolating');
                els.documentView.innerHTML =
                    '<div class="empty-state">' +
                    '<p>No document loaded.</p>' +
                    '<p>Drag &amp; drop one or more <strong>.txt</strong>, <strong>.html</strong>, or <strong>.vtt</strong> files here to begin.</p>' +
                    '</div>';
                return;
            }

            const frag = document.createDocumentFragment();
            appendDocText(frag, doc, isolate);
            els.documentView.innerHTML = '';
            els.documentView.appendChild(frag);
            els.documentView.classList.toggle('isolating', !!isolate);

            if (state.mode === 'analyze' && Seg) Seg.updateAnalyzeStats();
        }

        function importFiles(fileList) {
            const state = getState();
            const Imp = global.QualiCottyImport;
            const files = Imp
                ? Imp.filterSupportedFiles(fileList)
                : Array.from(fileList || []).filter(f => /\.txt$/i.test(f.name));
            if (files.length === 0) return;

            let pending = files.length;
            const finish = () => {
                saveState();
                applyViewChange(function () {});
            };
            files.forEach(file => {
                if (Imp && Imp.readAndParseFile) {
                    Imp.readAndParseFile(file).then(parsed => {
                        const doc = new QDocument(parsed.name, parsed.text);
                        state.documents.push(doc);
                        state.activeDocumentTimestamp = doc.timestamp;
                        pending -= 1;
                        if (pending === 0) finish();
                    }).catch(() => {
                        pending -= 1;
                        if (pending === 0) finish();
                    });
                    return;
                }
                const reader = new FileReader();
                reader.onload = e => {
                    const doc = new QDocument(file.name, String(e.target.result));
                    state.documents.push(doc);
                    state.activeDocumentTimestamp = doc.timestamp;
                    pending -= 1;
                    if (pending === 0) finish();
                };
                reader.onerror = () => {
                    pending -= 1;
                    if (pending === 0) finish();
                };
                reader.readAsText(file);
            });
        }

        return {
            getDocument: getDocument,
            getActiveDocument: getActiveDocument,
            renderDocumentList: renderDocumentList,
            renderDocumentView: renderDocumentView,
            scrollToOffset: scrollToOffset,
            exitIsolationToContext: exitIsolationToContext,
            importFiles: importFiles,
            setupDocumentModal: setupDocumentModal,
            openDocumentModal: openDocumentModal,
            syncDocumentColourPreview: syncDocumentColourPreview,
            clamp: clamp
        };
    }

    global.QualiCottyDocuments = {
        create: create,
        QDocument: QDocument,
        VISIBLE_DOCUMENT_ROWS: VISIBLE_DOCUMENT_ROWS,
        DEFAULT_DOCUMENT_COLOUR: DEFAULT_DOCUMENT_COLOUR,
        normalizeDocument: normalizeDocument,
        normalizeDocuments: normalizeDocuments,
        clamp: clamp
    };
})(window);
