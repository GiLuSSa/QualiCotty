/* QualiCotty — GUI interactions (fonts, mode, nav, right bar, project modal, DnD, keyboard)
 * Loaded before index.js. Exposes window.QualiCottyGui.
 */
(function (global) {
    'use strict';

    const FONT_FAMILIES = {
        georgia: "'Georgia', 'Times New Roman', serif",
        times: "'Times New Roman', 'Times', serif",
        garamond: "'Garamond', 'Baskerville', 'Times New Roman', serif",
        arial: "'Arial', 'Helvetica', sans-serif",
        helvetica: "'Helvetica', 'Arial', sans-serif",
        verdana: "'Verdana', 'Geneva', sans-serif"
    };

    const PT_SIZES = [6, 7, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 96];
    const MIN_PT = 6;
    const MAX_PT = 96;

    function ptToPx(pt) {
        return pt * 96 / 72;
    }

    function formatPt(pt) {
        return (Number.isInteger(pt) ? pt : Math.round(pt * 10) / 10) + ' pt';
    }

    function snapUp(pt) {
        for (let i = 0; i < PT_SIZES.length; i++) {
            if (PT_SIZES[i] > pt + 0.001) return PT_SIZES[i];
        }
        return PT_SIZES[PT_SIZES.length - 1];
    }

    function snapDown(pt) {
        for (let i = PT_SIZES.length - 1; i >= 0; i--) {
            if (PT_SIZES[i] < pt - 0.001) return PT_SIZES[i];
        }
        return PT_SIZES[0];
    }

    /**
     * @param {object} ctx
     */
    function create(ctx) {
        const {
            getState,
            getEls,
            saveState,
            saveView,
            getDocs,
            getSeg,
            getCbk,
            getCodeByName,
            getCodeByTimestamp,
            createCode,
            defaultDescription,
            qualicottyVersion,
            byTimestamp,
            createEmptyCodebook
        } = ctx;

        function clamp(v, min, max) {
            const Docs = getDocs();
            return Docs && Docs.clamp ? Docs.clamp(v, min, max) : Math.max(min, Math.min(max, v));
        }

        /* ---- Font & mode ---- */

        function applyFontSettings() {
            const state = getState();
            const els = getEls();
            const root = document.documentElement;
            root.style.setProperty('--doc-font-size', ptToPx(state.fontSizePt) + 'px');
            root.style.setProperty('--document-font-family', FONT_FAMILIES[state.fontFamily] || FONT_FAMILIES.georgia);
            applyTextAlign(state.textAlign || 'justify-left');
            if (document.activeElement !== els.fontSizeBox) {
                els.fontSizeBox.value = formatPt(state.fontSizePt);
            }
            els.fontSelector.value = state.fontFamily;
        }

        function applyTextAlign(align) {
            const state = getState();
            const els = getEls();
            const mode = align || 'justify-left';
            state.textAlign = mode;

            let textAlign = 'left';
            let textAlignLast = 'auto';
            if (mode === 'right') {
                textAlign = 'right';
            } else if (mode === 'justify-left') {
                textAlign = 'justify';
                textAlignLast = 'left';
            } else if (mode === 'justify-right') {
                textAlign = 'justify';
                textAlignLast = 'right';
            }

            const root = document.documentElement;
            root.style.setProperty('--doc-text-align', textAlign);
            root.style.setProperty('--doc-text-align-last', textAlignLast);

            const buttons = [
                els.alignLeft,
                els.alignJustifyLeft,
                els.alignJustifyRight,
                els.alignRight
            ];
            buttons.forEach(btn => {
                if (!btn) return;
                btn.classList.toggle('active', btn.dataset.align === mode);
            });
        }

        function commitFontSize() {
            const state = getState();
            const els = getEls();
            const parsed = parseFloat(String(els.fontSizeBox.value).replace(/[^0-9.]/g, ''));
            if (!isNaN(parsed)) {
                state.fontSizePt = clamp(parsed, MIN_PT, MAX_PT);
                saveView();
            }
            els.fontSizeBox.value = formatPt(state.fontSizePt);
            applyFontSettings();
        }

        function setupFontControls() {
            const state = getState();
            const els = getEls();

            els.fontSizeBox.addEventListener('focus', () => {
                els.fontSizeBox.value = String(state.fontSizePt);
                els.fontSizeBox.select();
            });
            els.fontSizeBox.addEventListener('blur', commitFontSize);
            els.fontSizeBox.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    els.fontSizeBox.blur();
                }
            });

            els.fontDec.addEventListener('click', () => {
                state.fontSizePt = snapDown(state.fontSizePt);
                saveView();
                applyFontSettings();
            });
            els.fontInc.addEventListener('click', () => {
                state.fontSizePt = snapUp(state.fontSizePt);
                saveView();
                applyFontSettings();
            });

            els.fontSelector.addEventListener('change', () => {
                state.fontFamily = els.fontSelector.value;
                saveView();
                applyFontSettings();
            });

            const alignButtons = [
                els.alignLeft,
                els.alignJustifyLeft,
                els.alignJustifyRight,
                els.alignRight
            ];
            alignButtons.forEach(btn => {
                if (!btn) return;
                btn.addEventListener('click', () => {
                    applyTextAlign(btn.dataset.align);
                    saveView();
                });
            });
        }

        function updateModeButtons() {
            const state = getState();
            const els = getEls();
            els.modeCode.classList.toggle('active', state.mode === 'code');
            els.modeAnalyze.classList.toggle('active', state.mode === 'analyze');
        }

        function setMode(mode) {
            const state = getState();
            state.mode = mode;
            updateModeButtons();
            renderRightBar();
            getDocs().renderDocumentView();
        }

        function setupModeToggle() {
            const els = getEls();
            els.modeCode.addEventListener('click', () => setMode('code'));
            els.modeAnalyze.addEventListener('click', () => setMode('analyze'));
        }

        /* ---- View history / navigation ---- */

        function getScrollTop() {
            const els = getEls();
            return els.centerColumn ? els.centerColumn.scrollTop : 0;
        }

        function setScrollTop(v) {
            const els = getEls();
            if (els.centerColumn) els.centerColumn.scrollTop = v || 0;
        }

        function snapshotNow(focusOffset) {
            const state = getState();
            return {
                mode: state.mode,
                docTs: state.activeDocumentTimestamp,
                isolate: state.isolateSegments,
                merge: state.mergeSegments,
                scrollTop: getScrollTop(),
                focusOffset: (typeof focusOffset === 'number') ? focusOffset : null
            };
        }

        function renderCurrentView() {
            updateModeButtons();
            renderRightBar();
            getDocs().renderDocumentList();
            getDocs().renderDocumentView();
        }

        function applyViewChange(mutator, focusOffset) {
            const state = getState();
            const Docs = getDocs();

            if (state.viewHistory.length === 0) {
                state.viewHistory.push(snapshotNow());
                state.viewIndex = 0;
            }
            if (!state.navigating && state.viewIndex >= 0) {
                state.viewHistory[state.viewIndex].scrollTop = getScrollTop();
            }

            if (typeof mutator === 'function') mutator();

            renderCurrentView();

            if (typeof focusOffset === 'number') {
                requestAnimationFrame(() => Docs.scrollToOffset(focusOffset));
            }

            if (!state.navigating) {
                const snap = snapshotNow(focusOffset);
                state.viewHistory = state.viewHistory.slice(0, state.viewIndex + 1);
                state.viewHistory.push(snap);
                state.viewIndex = state.viewHistory.length - 1;
                updateNavButtons();
            }
        }

        function restoreView(snap) {
            const state = getState();
            const Docs = getDocs();
            state.navigating = true;
            state.mode = snap.mode;
            state.activeDocumentTimestamp = snap.docTs;
            state.isolateSegments = snap.isolate;
            state.mergeSegments = snap.merge;
            renderCurrentView();
            if (typeof snap.focusOffset === 'number') {
                requestAnimationFrame(() => Docs.scrollToOffset(snap.focusOffset));
            } else {
                requestAnimationFrame(() => setScrollTop(snap.scrollTop));
            }
            state.navigating = false;
        }

        function navBack() {
            const state = getState();
            if (state.viewIndex <= 0) return;
            state.viewHistory[state.viewIndex].scrollTop = getScrollTop();
            state.viewIndex -= 1;
            restoreView(state.viewHistory[state.viewIndex]);
            updateNavButtons();
        }

        function navForward() {
            const state = getState();
            if (state.viewIndex >= state.viewHistory.length - 1) return;
            state.viewHistory[state.viewIndex].scrollTop = getScrollTop();
            state.viewIndex += 1;
            restoreView(state.viewHistory[state.viewIndex]);
            updateNavButtons();
        }

        function updateNavButtons() {
            const state = getState();
            const els = getEls();
            els.navBack.disabled = state.viewIndex <= 0;
            els.navForward.disabled = state.viewIndex >= state.viewHistory.length - 1;
        }

        function setupNavButtons() {
            const els = getEls();
            els.navBack.addEventListener('click', navBack);
            els.navForward.addEventListener('click', navForward);
        }

        /* ---- Right bar (Code / Analyze) ---- */

        function isCodeVisible(codeTimestamp) {
            const state = getState();
            if (state.mode === 'analyze') return true;
            return !state.hiddenCodes.has(codeTimestamp);
        }

        function renderRightBar() {
            const state = getState();
            if (state.mode === 'analyze') {
                renderAnalyzeBar();
            } else {
                renderTagBar();
            }
        }

        function renderTagBar() {
            const state = getState();
            const els = getEls();
            const Docs = getDocs();
            const Cbk = getCbk();

            els.rightPanelTitle.textContent = 'Codes';
            els.tagBar.innerHTML = '';

            const scroll = document.createElement('div');
            scroll.className = 'code-list-scroll';

            state.codebook.codes.forEach((code, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tag-button';
                btn.style.backgroundColor = global.QualiCottyPalette
                    ? global.QualiCottyPalette.displayColour(code.colour)
                    : code.colour;
                if (code.timestamp === state.activeCodeTimestamp) {
                    btn.classList.add('active');
                }

                const checkbox = document.createElement('span');
                checkbox.className = 'tag-checkbox';
                if (isCodeVisible(code.timestamp)) {
                    checkbox.classList.add('checked');
                }
                checkbox.title = 'Show/hide highlights for this code';
                checkbox.addEventListener('click', e => {
                    e.stopPropagation();
                    if (state.hiddenCodes.has(code.timestamp)) {
                        state.hiddenCodes.delete(code.timestamp);
                    } else {
                        state.hiddenCodes.add(code.timestamp);
                    }
                    renderRightBar();
                    Docs.renderDocumentView();
                });

                btn.appendChild(checkbox);

                const label = document.createElement('span');
                label.className = 'tag-name';
                label.textContent = code.name;
                btn.appendChild(label);

                if (index < 10) {
                    const shortcut = document.createElement('span');
                    shortcut.className = 'tag-shortcut';
                    const keyLabel = (index === 9) ? '0' : String(index + 1);
                    shortcut.textContent = '(' + keyLabel + ')';
                    btn.title = (code.description || code.name) + ' — press ' + keyLabel + ' with a selection';
                    btn.appendChild(shortcut);
                } else {
                    btn.title = code.description;
                }

                btn.addEventListener('click', () => {
                    state.activeCodeTimestamp =
                        (state.activeCodeTimestamp === code.timestamp) ? null : code.timestamp;
                    renderTagBar();
                });

                scroll.appendChild(btn);
            });

            const newBtn = document.createElement('button');
            newBtn.type = 'button';
            newBtn.className = 'new-tag-button';
            newBtn.textContent = '+ New code';
            newBtn.addEventListener('click', addNewTag);
            scroll.appendChild(newBtn);

            els.tagBar.appendChild(scroll);

            const codebookBtn = document.createElement('button');
            codebookBtn.type = 'button';
            codebookBtn.className = 'codebook-open-btn';
            codebookBtn.textContent = 'Codebook';
            codebookBtn.addEventListener('click', () => {
                if (Cbk) Cbk.openModal();
            });
            els.tagBar.appendChild(codebookBtn);
        }

        function renderAnalyzeBar() {
            const state = getState();
            const els = getEls();
            const Docs = getDocs();
            const Seg = getSeg();

            els.rightPanelTitle.textContent = 'Analyze';
            els.tagBar.innerHTML = '';

            const isolateBtn = document.createElement('button');
            isolateBtn.type = 'button';
            isolateBtn.className = 'mode-button analyze-tool';
            if (state.isolateSegments) isolateBtn.classList.add('active');
            isolateBtn.textContent = 'Isolate segments';
            isolateBtn.title = 'Hide all text that is not highlighted';
            isolateBtn.addEventListener('click', () => {
                applyViewChange(() => {
                    state.isolateSegments = !state.isolateSegments;
                });
            });
            els.tagBar.appendChild(isolateBtn);

            const mergeBtn = document.createElement('button');
            mergeBtn.type = 'button';
            mergeBtn.className = 'mode-button analyze-tool';
            if (state.mergeSegments) mergeBtn.classList.add('active');
            mergeBtn.textContent = 'Merge';
            mergeBtn.title = 'Show all documents in one view (turns on isolate when first enabled)';
            mergeBtn.addEventListener('click', () => {
                applyViewChange(() => {
                    state.mergeSegments = !state.mergeSegments;
                    if (state.mergeSegments && !state.isolateSegments) {
                        state.isolateSegments = true;
                    }
                });
            });
            els.tagBar.appendChild(mergeBtn);

            const spacer1 = document.createElement('div');
            spacer1.className = 'analyze-spacer';
            els.tagBar.appendChild(spacer1);

            const logicRow = document.createElement('div');
            logicRow.className = 'analyze-logic-row';

            const andBtn = document.createElement('button');
            andBtn.type = 'button';
            andBtn.className = 'mode-button analyze-logic-btn';
            andBtn.textContent = 'and';
            if (state.analyzeLogic === 'and' && !state.analyzeQueryMode) andBtn.classList.add('active');
            andBtn.addEventListener('click', () => {
                state.analyzeLogic = 'and';
                state.analyzeQueryMode = false;
                renderAnalyzeBar();
                Docs.renderDocumentView();
                if (Seg) Seg.updateAnalyzeStats();
            });

            const orBtn = document.createElement('button');
            orBtn.type = 'button';
            orBtn.className = 'mode-button analyze-logic-btn';
            orBtn.textContent = 'or';
            if (state.analyzeLogic === 'or' && !state.analyzeQueryMode) orBtn.classList.add('active');
            orBtn.addEventListener('click', () => {
                state.analyzeLogic = 'or';
                state.analyzeQueryMode = false;
                renderAnalyzeBar();
                Docs.renderDocumentView();
                if (Seg) Seg.updateAnalyzeStats();
            });

            const queryBtn = document.createElement('button');
            queryBtn.type = 'button';
            queryBtn.className = 'mode-button analyze-logic-btn';
            queryBtn.textContent = '|';
            queryBtn.title = 'Custom query (code:/text:/doctype:/persons:/keywords:/indoc:)';
            if (state.analyzeQueryMode) queryBtn.classList.add('active');
            queryBtn.addEventListener('click', () => {
                state.analyzeQueryMode = !state.analyzeQueryMode;
                renderAnalyzeBar();
                if (state.analyzeQueryMode) {
                    const box = document.getElementById('analyzeQueryBox');
                    if (box) box.focus();
                }
                Docs.renderDocumentView();
                if (Seg) Seg.updateAnalyzeStats();
            });

            logicRow.appendChild(andBtn);
            logicRow.appendChild(orBtn);
            logicRow.appendChild(queryBtn);
            els.tagBar.appendChild(logicRow);

            const grid = document.createElement('div');
            grid.className = 'analyze-tag-grid';
            if (state.analyzeQueryMode) grid.classList.add('disabled');

            state.codebook.codes.forEach(code => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'analyze-tag-btn';
                btn.style.backgroundColor = global.QualiCottyPalette
                    ? global.QualiCottyPalette.displayColour(code.colour)
                    : code.colour;
                btn.title = code.description;
                btn.textContent = code.name;
                if (state.analyzeFilterTags.has(code.timestamp)) btn.classList.add('selected');
                btn.disabled = state.analyzeQueryMode;
                btn.addEventListener('click', () => {
                    if (state.analyzeQueryMode) return;
                    if (state.analyzeFilterTags.has(code.timestamp)) {
                        state.analyzeFilterTags.delete(code.timestamp);
                    } else {
                        state.analyzeFilterTags.add(code.timestamp);
                    }
                    renderAnalyzeBar();
                    Docs.renderDocumentView();
                    if (Seg) Seg.updateAnalyzeStats();
                });
                grid.appendChild(btn);
            });
            els.tagBar.appendChild(grid);

            const queryBox = document.createElement('textarea');
            queryBox.id = 'analyzeQueryBox';
            queryBox.className = 'analyze-query-box';
            if (state.analyzeQueryMode) {
                queryBox.placeholder = 'code:"Code 1" and text:"cat"';
                queryBox.title =
                    'Query syntax:\n' +
                    '  code:"Name"   code:("A" and "B")   code:("A" or "B" and not "C")\n' +
                    '  text:"cat"    text:("cat" and "dog")\n' +
                    '  doctype:"interview"\n' +
                    '  persons:"mr pidgeon"   persons:("cat" or "dog")\n' +
                    '  keywords:"mobility"   keywords:("care" and "trust")\n' +
                    '  indoc:"Smith"\n' +
                    '  indoc:("doc1", "doc2", not "doc3")\n' +
                    '  and / or / not / ( )\n' +
                    'Bare "Name" is shorthand for code:"Name".';
                queryBox.value = typeof state.analyzeQuery === 'string' ? state.analyzeQuery : '';
            } else {
                queryBox.placeholder = 'Filter by text in segments…';
                queryBox.title =
                    'Plain text filter (and/or mode).\n' +
                    'Keeps only passages that contain this text (case-insensitive),\n' +
                    'combined with the selected codes via and/or.\n' +
                    'Remembered when switching between and and or; separate from | query.';
                queryBox.value = typeof state.analyzeTextFilter === 'string'
                    ? state.analyzeTextFilter
                    : '';
            }
            queryBox.addEventListener('input', () => {
                if (state.analyzeQueryMode) {
                    state.analyzeQuery = queryBox.value;
                    const Q = global.QualiCottyAnalyzeQuery;
                    if (Q && typeof Q.compile === 'function') {
                        const knownNames = state.codebook.codes.map(c => c.name);
                        const compiled = Q.compile(state.analyzeQuery || '', { knownCodeNames: knownNames });
                        state.analyzeQueryError = compiled.ok ? '' : (compiled.error || 'Invalid query.');
                    }
                } else {
                    state.analyzeTextFilter = queryBox.value;
                    state.analyzeQueryError = '';
                }
                Docs.renderDocumentView();
                if (Seg) Seg.updateAnalyzeStats();
                const errEl = document.getElementById('analyzeQueryError');
                if (errEl) {
                    const msg = state.analyzeQueryMode ? (state.analyzeQueryError || '') : '';
                    errEl.textContent = msg;
                    errEl.hidden = !msg;
                }
            });
            els.tagBar.appendChild(queryBox);

            const queryErr = document.createElement('div');
            queryErr.id = 'analyzeQueryError';
            queryErr.className = 'analyze-query-error';
            if (state.analyzeQueryMode && state.analyzeQueryError) {
                queryErr.textContent = state.analyzeQueryError;
            } else {
                queryErr.hidden = true;
            }
            els.tagBar.appendChild(queryErr);

            // Refresh error from a compile pass when entering/staying in query mode.
            if (state.analyzeQueryMode && Seg) {
                // Force error field via a dry compile for empty/invalid without needing a doc.
                const Q = global.QualiCottyAnalyzeQuery;
                if (Q && typeof Q.compile === 'function') {
                    const knownNames = state.codebook.codes.map(c => c.name);
                    const compiled = Q.compile(state.analyzeQuery || '', { knownCodeNames: knownNames });
                    state.analyzeQueryError = compiled.ok ? '' : (compiled.error || 'Invalid query.');
                    if (state.analyzeQueryError) {
                        queryErr.textContent = state.analyzeQueryError;
                        queryErr.hidden = false;
                    } else {
                        queryErr.textContent = '';
                        queryErr.hidden = true;
                    }
                }
            }

            const stats = document.createElement('div');
            stats.id = 'analyzeStats';
            stats.className = 'analyze-stats';
            els.tagBar.appendChild(stats);

            const spacer2 = document.createElement('div');
            spacer2.className = 'analyze-spacer';
            els.tagBar.appendChild(spacer2);

            function exportCtx() {
                return {
                    getState: getState,
                    getSeg: getSeg,
                    getCodeByTimestamp: getCodeByTimestamp
                };
            }

            const dlCsvBtn = document.createElement('button');
            dlCsvBtn.type = 'button';
            dlCsvBtn.className = 'mode-button analyze-tool analyze-download';
            dlCsvBtn.textContent = '\u2193.csv';
            dlCsvBtn.title = 'Download visible segments as .csv';
            dlCsvBtn.addEventListener('click', () => {
                if (!global.QualiCottyExport || typeof global.QualiCottyExport.downloadCsv !== 'function') {
                    alert('Export module is not available.');
                    return;
                }
                global.QualiCottyExport.downloadCsv(exportCtx());
            });
            els.tagBar.appendChild(dlCsvBtn);

            const dlPdfBtn = document.createElement('button');
            dlPdfBtn.type = 'button';
            dlPdfBtn.className = 'mode-button analyze-tool analyze-download';
            dlPdfBtn.textContent = '\u2193.pdf';
            dlPdfBtn.title = 'Export visible view as .pdf (print dialog — choose Save as PDF)';
            dlPdfBtn.addEventListener('click', () => {
                if (!global.QualiCottyExport || typeof global.QualiCottyExport.downloadPdf !== 'function') {
                    alert('Export module is not available.');
                    return;
                }
                global.QualiCottyExport.downloadPdf(exportCtx());
            });
            els.tagBar.appendChild(dlPdfBtn);

            if (Seg) Seg.updateAnalyzeStats();
        }

        function addNewTag() {
            const state = getState();
            let n = state.codebook.codes.length + 1;
            let name = 'Code ' + n;
            while (getCodeByName(name)) {
                n += 1;
                name = 'Code ' + n;
            }
            const used = state.codebook.codes.map(c => c.colour);
            const colour = global.QualiCottyPalette.nextColour(used);
            const code = createCode(name, colour, defaultDescription);
            state.codebook.codes.push(code);
            state.activeCodeTimestamp = code.timestamp;
            saveState();
            renderTagBar();
        }

        /* ---- Project modal ---- */

        function updateProjectNameButton() {
            const state = getState();
            const els = getEls();
            const name = state.codebook.project || 'Untitled project';
            els.projectNameBtn.textContent = name;
            els.projectNameBtn.title = name + ' — Project properties';
            document.title = 'QualiCotty - ' + name;
        }

        function openProjectModal() {
            const state = getState();
            const els = getEls();
            els.projectPropName.value = state.codebook.project || '';
            els.projectPropDescription.value = state.codebook.projectDescription || '';
            els.projectPropUser.value = state.codebook.userName || '';
            els.projectModal.classList.add('visible');
            els.projectPropName.focus();
            els.projectPropName.select();
        }

        function closeProjectModal() {
            const state = getState();
            const els = getEls();
            state.codebook.project = els.projectPropName.value.trim() || 'Untitled project';
            state.codebook.projectDescription = els.projectPropDescription.value;
            state.codebook.userName = els.projectPropUser.value;
            updateProjectNameButton();
            saveState();
            els.projectModal.classList.remove('visible');
        }

        function saveProjectToCotty() {
            const state = getState();
            const els = getEls();
            state.codebook.project = els.projectPropName.value.trim() || 'Untitled project';
            state.codebook.projectDescription = els.projectPropDescription.value;
            state.codebook.userName = els.projectPropUser.value;
            updateProjectNameButton();

            if (!global.QualiCottySave || typeof global.QualiCottySave.downloadCottyFile !== 'function') {
                alert('Save module is not available.');
                return;
            }

            state.documents.sort(byTimestamp);
            state.segments.sort(byTimestamp);

            const updatedSaves = global.QualiCottySave.downloadCottyFile({
                project: {
                    timestamp: state.codebook.projectTimestamp,
                    name: state.codebook.project,
                    description: state.codebook.projectDescription,
                    userName: state.codebook.userName,
                    version: state.codebook.version || qualicottyVersion
                },
                codebook: {
                    name: state.codebook.name || 'Untitled codebook',
                    description: state.codebook.description || '',
                    codes: state.codebook.codes
                },
                documents: state.documents,
                segments: state.segments,
                saves: state.codebook.saves
            });

            state.codebook.saves = updatedSaves;
            saveState();
        }

        function resetViewUiState() {
            const state = getState();
            state.mode = 'code';
            state.isolateSegments = false;
            state.mergeSegments = false;
            state.hiddenCodes = new Set();
            state.analyzeLogic = 'and';
            state.analyzeFilterTags = new Set();
            state.analyzeQueryMode = false;
            state.analyzeQueryError = '';
            state.analyzeTextFilter = '';
            state.analyzeQuery = '';
            state.activeCodeTimestamp = (state.codebook.codes[0] && state.codebook.codes[0].timestamp) || null;
            state.activeDocumentTimestamp = state.documents.length
                ? state.documents[0].timestamp
                : null;
            state.editingSegment = null;
            state.viewHistory = [snapshotNow()];
            state.viewIndex = 0;
            state.navigating = false;
            updateModeButtons();
            updateNavButtons();
            updateProjectNameButton();
            renderCurrentView();
        }

        function applyLoadedProject(snapshot) {
            const state = getState();
            const els = getEls();
            state.codebook = {
                projectTimestamp: snapshot.project.timestamp,
                project: snapshot.project.name,
                projectDescription: snapshot.project.description,
                userName: snapshot.project.userName,
                version: snapshot.project.version || qualicottyVersion,
                name: (snapshot.codebook && snapshot.codebook.name) || 'Untitled codebook',
                description: (snapshot.codebook && snapshot.codebook.description) || '',
                codes: snapshot.codebook.codes,
                saves: snapshot.saves
            };
            state.documents = snapshot.documents;
            state.segments = snapshot.segments;
            if (global.QualiCottyDocuments && global.QualiCottyDocuments.normalizeDocuments) {
                global.QualiCottyDocuments.normalizeDocuments(state.documents);
            }
            global.QualiCottySegments.migrateSegmentCodes(state.segments, state.codebook);
            state.documents.sort(byTimestamp);
            state.segments.sort(byTimestamp);
            saveState();
            resetViewUiState();
            els.projectPropName.value = state.codebook.project || '';
            els.projectPropDescription.value = state.codebook.projectDescription || '';
            els.projectPropUser.value = state.codebook.userName || '';
        }

        function loadProjectFromCotty() {
            const els = getEls();
            if (!confirm('This will delete your current project, are you sure?')) return;

            if (!global.QualiCottySave || typeof global.QualiCottySave.pickAndLoadCottyFile !== 'function') {
                alert('Load module is not available.');
                return;
            }

            global.QualiCottySave.pickAndLoadCottyFile(els.projectLoadInput)
                .then(snapshot => {
                    if (!snapshot) return;
                    applyLoadedProject(snapshot);
                })
                .catch(err => {
                    console.error(err);
                    alert('Could not load .cotty file: ' + (err && err.message ? err.message : err));
                });
        }

        function newOrDeleteProject() {
            const state = getState();
            const els = getEls();
            if (!confirm('This will delete your current project, are you sure?')) return;

            state.codebook = createEmptyCodebook('Untitled project');
            state.documents = [];
            state.segments = [];
            saveState();
            resetViewUiState();
            els.projectPropName.value = state.codebook.project || '';
            els.projectPropDescription.value = '';
            els.projectPropUser.value = '';
        }

        function setupAboutModal() {
            const els = getEls();
            if (!els.aboutModal) return;

            const ver = qualicottyVersion || global.QualiCottyVersion || '';
            if (els.appVersion) els.appVersion.textContent = ver;
            if (els.aboutModalTitle) {
                els.aboutModalTitle.textContent = 'QualiCotty ' + ver;
            }
            if (els.aboutModal.setAttribute) {
                els.aboutModal.setAttribute('aria-label', 'QualiCotty ' + ver);
            }

            function openAboutModal() {
                els.aboutModal.classList.add('visible');
            }

            function closeAboutModal() {
                els.aboutModal.classList.remove('visible');
            }

            if (els.appBrandInfo) {
                els.appBrandInfo.addEventListener('click', openAboutModal);
                els.appBrandInfo.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openAboutModal();
                    }
                });
            }

            if (els.appFavicon) {
                els.appFavicon.addEventListener('click', e => {
                    e.stopPropagation();
                    els.appFavicon.classList.remove('pet');
                    // Retrigger animation if clicked again quickly.
                    void els.appFavicon.offsetWidth;
                    els.appFavicon.classList.add('pet');
                });
                els.appFavicon.addEventListener('animationend', () => {
                    els.appFavicon.classList.remove('pet');
                });
            }

            els.aboutModalClose.addEventListener('click', closeAboutModal);
            let aboutDownOnOverlay = false;
            els.aboutModal.addEventListener('mousedown', e => {
                aboutDownOnOverlay = (e.target === els.aboutModal);
            });
            els.aboutModal.addEventListener('click', e => {
                if (e.target === els.aboutModal && aboutDownOnOverlay) closeAboutModal();
                aboutDownOnOverlay = false;
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && els.aboutModal.classList.contains('visible')) {
                    closeAboutModal();
                }
            });
        }

        function setupProjectModal() {
            const els = getEls();
            updateProjectNameButton();
            els.projectNameBtn.addEventListener('click', openProjectModal);
            els.projectModalClose.addEventListener('click', closeProjectModal);
            let projectDownOnOverlay = false;
            els.projectModal.addEventListener('mousedown', e => {
                projectDownOnOverlay = (e.target === els.projectModal);
            });
            els.projectModal.addEventListener('click', e => {
                if (e.target === els.projectModal && projectDownOnOverlay) closeProjectModal();
                projectDownOnOverlay = false;
            });
            els.projectSaveBtn.addEventListener('click', saveProjectToCotty);
            els.projectLoadBtn.addEventListener('click', loadProjectFromCotty);
            els.projectNewBtn.addEventListener('click', newOrDeleteProject);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && els.projectModal.classList.contains('visible')) {
                    closeProjectModal();
                }
            });
        }

        /* ---- Drag & drop / keyboard ---- */

        function handleDroppedFiles(fileList) {
            const files = Array.from(fileList || []);
            if (files.length === 0) return;

            const cottyFiles = files.filter(f => /\.cotty$/i.test(f.name));
            const cottybookFiles = files.filter(f => /\.cottybook$/i.test(f.name));
            const Docs = getDocs();
            const Cbk = getCbk();

            // A .cotty replaces the whole project — take the first one only.
            if (cottyFiles.length > 0) {
                if (!confirm('Loading a .cotty file will replace your current project. Continue?')) {
                    return;
                }
                if (!global.QualiCottySave || typeof global.QualiCottySave.readCottyFile !== 'function') {
                    alert('Save module is not available.');
                    return;
                }
                global.QualiCottySave.readCottyFile(cottyFiles[0])
                    .then(snapshot => {
                        if (!snapshot) return;
                        applyLoadedProject(snapshot);
                    })
                    .catch(err => {
                        console.error(err);
                        alert('Could not load .cotty file: ' + (err && err.message ? err.message : err));
                    });
                return;
            }

            const docFiles = files.filter(f =>
                !/\.cotty$/i.test(f.name) && !/\.cottybook$/i.test(f.name)
            );

            const bookPromise = cottybookFiles.length === 0
                ? Promise.resolve(null)
                : (Cbk && typeof Cbk.importCodebookFromFile === 'function'
                    ? Promise.all(cottybookFiles.map(f =>
                        Cbk.importCodebookFromFile(f).catch(err => {
                            console.error(err);
                            alert('Could not import codebook “' + f.name + '”: ' +
                                (err && err.message ? err.message : err));
                            return { added: 0, skipped: 0 };
                        })
                    )).then(results => {
                        let added = 0;
                        let skipped = 0;
                        results.forEach(r => {
                            if (!r) return;
                            added += r.added || 0;
                            skipped += r.skipped || 0;
                        });
                        const parts = [];
                        if (added) parts.push(added + ' code' + (added === 1 ? '' : 's') + ' added');
                        if (skipped) parts.push(skipped + ' skipped (already present)');
                        if (parts.length) alert(parts.join('. ') + '.');
                        else if (cottybookFiles.length) {
                            alert('Codebook metadata updated; no new codes to import.');
                        }
                    })
                    : Promise.reject(new Error('Codebook module is not available.')));

            bookPromise.catch(err => {
                alert('Could not import codebook: ' + (err && err.message ? err.message : err));
            }).then(() => {
                if (Docs && typeof Docs.importFiles === 'function') {
                    Docs.importFiles(docFiles);
                }
            });
        }

        function setupDragAndDrop() {
            const els = getEls();
            let dragDepth = 0;

            window.addEventListener('dragenter', e => {
                e.preventDefault();
                dragDepth += 1;
                els.dropOverlay.classList.add('visible');
            });

            window.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            });

            window.addEventListener('dragleave', e => {
                e.preventDefault();
                dragDepth -= 1;
                if (dragDepth <= 0) {
                    dragDepth = 0;
                    els.dropOverlay.classList.remove('visible');
                }
            });

            window.addEventListener('drop', e => {
                e.preventDefault();
                dragDepth = 0;
                els.dropOverlay.classList.remove('visible');
                if (e.dataTransfer && e.dataTransfer.files) {
                    handleDroppedFiles(e.dataTransfer.files);
                }
            });
        }

        function setupKeyboard() {
            const state = getState();
            const digitIndex = {
                '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
                '6': 5, '7': 6, '8': 7, '9': 8, '0': 9
            };

            document.addEventListener('keydown', e => {
                if (e.ctrlKey && e.altKey && !e.shiftKey) {
                    const k = e.key.toLowerCase();
                    if (k === 'z') { e.preventDefault(); navBack(); return; }
                    if (k === 'y') { e.preventDefault(); navForward(); return; }
                }

                const target = e.target;
                if (target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable
                )) {
                    return;
                }

                if (state.mode !== 'code') return;
                const Seg = getSeg();
                if (!Seg) return;

                if (e.key === 'Enter') {
                    const offsets = Seg.getSelectionOffsets();
                    if (!offsets) return;
                    e.preventDefault();
                    Seg.applyActiveCodeToSelection();
                    return;
                }

                if (digitIndex[e.key] === undefined) return;
                if (e.ctrlKey || e.altKey || e.metaKey) return;

                const offsets = Seg.getSelectionOffsets();
                if (!offsets) return;

                const code = state.codebook.codes[digitIndex[e.key]];
                if (!code) return;

                e.preventDefault();
                Seg.applyCodeToSelection(code.timestamp);
            });
        }

        function setup() {
            setupAboutModal();
            setupProjectModal();
            setupFontControls();
            setupModeToggle();
            setupNavButtons();
            setupDragAndDrop();
            setupKeyboard();
            applyFontSettings();
        }

        return {
            setup: setup,
            applyFontSettings: applyFontSettings,
            updateModeButtons: updateModeButtons,
            setMode: setMode,
            isCodeVisible: isCodeVisible,
            renderRightBar: renderRightBar,
            renderCurrentView: renderCurrentView,
            applyViewChange: applyViewChange,
            snapshotNow: snapshotNow,
            updateNavButtons: updateNavButtons,
            updateProjectNameButton: updateProjectNameButton,
            resetViewUiState: resetViewUiState,
            navBack: navBack,
            navForward: navForward
        };
    }

    global.QualiCottyGui = {
        create: create,
        FONT_FAMILIES: FONT_FAMILIES,
        PT_SIZES: PT_SIZES
    };
})(window);
