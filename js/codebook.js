/* QualiCotty — codebook editing (rename, colour, description, delete/reassign)
 * Loaded before index.js. Exposes window.QualiCottyCodebook.
 * Segment reassignment / stripping is delegated to QualiCottySegments.
 * Colours are managed exclusively by QualiCottyPalette.
 */
(function (global) {
    'use strict';

    const DEFAULT_DESCRIPTION = 'type your description here...';

    function defaultColour() {
        return global.QualiCottyPalette
            ? global.QualiCottyPalette.getDefaultColour()
            : '#ffe066';
    }

    function normalizeHex(colour) {
        return global.QualiCottyPalette
            ? global.QualiCottyPalette.normalizeHex(colour)
            : defaultColour();
    }

    function create(ctx) {
        const {
            getState,
            getEls,
            saveState,
            saveView,
            renderDocumentView,
            renderCodeBar,
            getCodeByName,
            getCodeByTimestamp,
            onCodesChanged,
            onColourblindModeChanged
        } = ctx;

        let openDeleteTs = null;

        function openModal() {
            const els = getEls();
            const state = getState();
            openDeleteTs = null;
            els.codebookPropName.value = state.codebook.name || '';
            els.codebookPropDescription.value = state.codebook.description || '';
            if (els.codebookColourblindToggle) {
                els.codebookColourblindToggle.checked = !!state.colourblindMode;
            }
            renderCodebookList();
            els.codebookModal.classList.add('visible');
            els.codebookPropName.focus();
            els.codebookPropName.select();
        }

        function closeModal() {
            const els = getEls();
            applyMetaFromInputs();
            openDeleteTs = null;
            els.codebookModal.classList.remove('visible');
        }

        function applyMetaFromInputs() {
            const state = getState();
            const els = getEls();
            state.codebook.name = (els.codebookPropName.value || '').trim() || 'Untitled codebook';
            state.codebook.description = els.codebookPropDescription.value || '';
            els.codebookPropName.value = state.codebook.name;
            saveState();
        }

        function countSegmentsUsingCode(codeTs) {
            const state = getState();
            let n = 0;
            state.segments.forEach(seg => {
                if (Array.isArray(seg.codes) && seg.codes.indexOf(codeTs) !== -1) n += 1;
            });
            return n;
        }

        function renameCode(code, newName) {
            const trimmed = (newName || '').trim();
            if (!trimmed) return false;
            const other = getCodeByName(trimmed);
            if (other && other.timestamp !== code.timestamp) {
                alert('A code named "' + trimmed + '" already exists.');
                return false;
            }
            code.name = trimmed;
            saveState();
            if (onCodesChanged) onCodesChanged();
            return true;
        }

        function setColour(code, colour) {
            if (!colour) return;
            code.colour = normalizeHex(colour);
            saveState();
            if (onCodesChanged) onCodesChanged();
        }

        function setDescription(code, description) {
            code.description = description;
            saveState();
            if (onCodesChanged) onCodesChanged();
        }

        /**
         * Delete a code from the codebook.
         * mode: 'strip' | 'reassign' | 'unused'
         * reassignToTs: required when mode === 'reassign'
         */
        function deleteCode(codeTs, mode, reassignToTs) {
            const state = getState();
            const SegApi = global.QualiCottySegments;
            if (!SegApi) {
                alert('Segment module is not available.');
                return false;
            }

            if (state.codebook.codes.length <= 1) {
                alert('You must keep at least one code in the codebook.');
                return false;
            }

            const code = getCodeByTimestamp(codeTs);
            if (!code) return false;

            if (mode === 'reassign') {
                if (!reassignToTs || reassignToTs === codeTs) {
                    alert('Choose a different code to reassign to.');
                    return false;
                }
                if (!getCodeByTimestamp(reassignToTs)) {
                    alert('Target code not found.');
                    return false;
                }
                SegApi.reassignCodeInSegments(state.segments, codeTs, reassignToTs);
            } else if (mode === 'strip') {
                SegApi.removeCodeFromSegments(state.segments, codeTs);
            }
            // mode === 'unused': no segment work needed

            state.codebook.codes = state.codebook.codes.filter(c => c.timestamp !== codeTs);

            if (state.activeCodeTimestamp === codeTs) {
                state.activeCodeTimestamp = state.codebook.codes[0]
                    ? state.codebook.codes[0].timestamp
                    : null;
            }
            state.hiddenCodes.delete(codeTs);
            state.analyzeFilterTags.delete(codeTs);

            saveState();
            if (onCodesChanged) onCodesChanged();
            return true;
        }

        function beginDelete(code) {
            const state = getState();
            const others = state.codebook.codes.filter(c => c.timestamp !== code.timestamp);
            if (others.length === 0) {
                alert('You must keep at least one code in the codebook.');
                return;
            }

            // Unused code: delete immediately.
            if (countSegmentsUsingCode(code.timestamp) === 0) {
                deleteCode(code.timestamp, 'unused');
                openDeleteTs = null;
                renderCodebookList();
                return;
            }

            // Toggle inline delete panel under this row.
            openDeleteTs = (openDeleteTs === code.timestamp) ? null : code.timestamp;
            renderCodebookList();
        }

        function moveCode(codeTs, direction) {
            const state = getState();
            const codes = state.codebook.codes;
            const idx = codes.findIndex(c => c.timestamp === codeTs);
            if (idx < 0) return false;
            const target = idx + direction;
            if (target < 0 || target >= codes.length) return false;
            const tmp = codes[idx];
            codes[idx] = codes[target];
            codes[target] = tmp;
            saveState();
            if (onCodesChanged) onCodesChanged();
            renderCodebookList();
            return true;
        }

        function uniqueImportedName(desired, existingNames) {
            let name = (desired || 'Code').trim() || 'Code';
            if (!existingNames.has(name.toLowerCase())) return name;
            let n = 2;
            while (existingNames.has((name + ' (' + n + ')').toLowerCase())) n += 1;
            return name + ' (' + n + ')';
        }

        function exportCodebook() {
            const state = getState();
            const SaveApi = global.QualiCottySave;
            if (!SaveApi || typeof SaveApi.downloadCottybookFile !== 'function') {
                alert('Save module is not available.');
                return;
            }
            SaveApi.downloadCottybookFile({
                version: state.codebook.version || SaveApi.QUALICOTTY_VERSION,
                codebook: {
                    name: state.codebook.name || 'Untitled codebook',
                    description: state.codebook.description || '',
                    codes: state.codebook.codes
                },
                filenameBase: (state.codebook.name || state.codebook.project || 'codebook')
            });
        }

        function applyImportedCodebook(parsed) {
            if (!parsed) return { added: 0, skipped: 0 };
            const state = getState();
            const els = getEls();

            if (els.codebookPropName && els.codebookModal &&
                els.codebookModal.classList.contains('visible')) {
                applyMetaFromInputs();
            }

            if (parsed.name) {
                state.codebook.name = parsed.name;
                if (els.codebookPropName) els.codebookPropName.value = state.codebook.name;
            }
            if (typeof parsed.description === 'string') {
                state.codebook.description = parsed.description;
                if (els.codebookPropDescription) {
                    els.codebookPropDescription.value = state.codebook.description;
                }
            }

            const existingTs = new Set(state.codebook.codes.map(c => c.timestamp));
            const existingNames = new Set(
                state.codebook.codes.map(c => String(c.name).toLowerCase())
            );
            let added = 0;
            let skipped = 0;

            parsed.codes.forEach(incoming => {
                if (existingTs.has(incoming.timestamp)) {
                    skipped += 1;
                    return;
                }
                const name = uniqueImportedName(incoming.name, existingNames);
                existingNames.add(name.toLowerCase());
                existingTs.add(incoming.timestamp);
                state.codebook.codes.push({
                    timestamp: incoming.timestamp,
                    name: name,
                    colour: incoming.colour
                        ? normalizeHex(incoming.colour)
                        : defaultColour(),
                    description: incoming.description || DEFAULT_DESCRIPTION
                });
                added += 1;
            });

            saveState();
            if (onCodesChanged) onCodesChanged();
            if (els.codebookModal && els.codebookModal.classList.contains('visible')) {
                renderCodebookList();
            }
            return { added: added, skipped: skipped };
        }

        function importCodebook() {
            const els = getEls();
            const SaveApi = global.QualiCottySave;
            if (!SaveApi || typeof SaveApi.pickAndLoadCottybookFile !== 'function') {
                alert('Save module is not available.');
                return;
            }
            SaveApi.pickAndLoadCottybookFile(els.codebookImportInput)
                .then(parsed => {
                    if (!parsed) return;
                    const result = applyImportedCodebook(parsed);
                    const parts = [];
                    if (result.added) {
                        parts.push(result.added + ' code' + (result.added === 1 ? '' : 's') + ' added');
                    }
                    if (result.skipped) {
                        parts.push(result.skipped + ' skipped (already present)');
                    }
                    if (parts.length === 0) {
                        alert('Codebook metadata updated; no new codes to import.');
                    } else {
                        alert(parts.join('. ') + '.');
                    }
                })
                .catch(err => {
                    alert('Could not import codebook: ' + (err && err.message ? err.message : err));
                });
        }

        function importCodebookFromFile(file) {
            const SaveApi = global.QualiCottySave;
            if (!SaveApi || typeof SaveApi.readCottybookFile !== 'function') {
                return Promise.reject(new Error('Save module is not available.'));
            }
            return SaveApi.readCottybookFile(file).then(parsed => {
                const result = applyImportedCodebook(parsed);
                return result;
            });
        }

        function buildInlineDeletePanel(code) {
            const state = getState();
            const others = state.codebook.codes.filter(c => c.timestamp !== code.timestamp);
            const usedBy = countSegmentsUsingCode(code.timestamp);

            const panel = document.createElement('div');
            panel.className = 'codebook-inline-delete';

            const msg = document.createElement('p');
            msg.className = 'codebook-delete-msg';
            msg.textContent =
                '“' + code.name + '” is used by ' + usedBy + ' segment' + (usedBy === 1 ? '' : 's') + '. ' +
                'You can reassign those segments to another code, or delete the code and remove any segments left with no codes.';
            panel.appendChild(msg);

            const label = document.createElement('div');
            label.className = 'modal-field-label';
            label.textContent = 'Delete code… and reassign?';
            panel.appendChild(label);

            const reassignRow = document.createElement('div');
            reassignRow.className = 'codebook-reassign-row';

            const select = document.createElement('select');
            select.className = 'modal-text-input codebook-reassign-select';
            others.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.timestamp;
                opt.textContent = c.name;
                select.appendChild(opt);
            });

            const reassignBtn = document.createElement('button');
            reassignBtn.type = 'button';
            reassignBtn.className = 'modal-primary-btn';
            reassignBtn.textContent = 'Delete code and reassign';
            reassignBtn.addEventListener('click', () => {
                deleteCode(code.timestamp, 'reassign', select.value);
                openDeleteTs = null;
                renderCodebookList();
            });

            reassignRow.appendChild(select);
            reassignRow.appendChild(reassignBtn);
            panel.appendChild(reassignRow);

            const stripBtn = document.createElement('button');
            stripBtn.type = 'button';
            stripBtn.className = 'modal-danger-btn codebook-inline-full';
            stripBtn.textContent = 'Delete code and segments';
            stripBtn.addEventListener('click', () => {
                deleteCode(code.timestamp, 'strip');
                openDeleteTs = null;
                renderCodebookList();
            });
            panel.appendChild(stripBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'modal-secondary-btn codebook-inline-full';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => {
                openDeleteTs = null;
                renderCodebookList();
            });
            panel.appendChild(cancelBtn);

            return panel;
        }

        function renderCodebookList() {
            const state = getState();
            const els = getEls();
            const list = els.codebookList;
            list.innerHTML = '';

            state.codebook.codes.forEach((code, index) => {
                const row = document.createElement('div');
                row.className = 'codebook-row';
                row.dataset.ts = code.timestamp;

                const main = document.createElement('div');
                main.className = 'codebook-row-main';

                const moveWrap = document.createElement('div');
                moveWrap.className = 'codebook-move';

                const upBtn = document.createElement('button');
                upBtn.type = 'button';
                upBtn.className = 'codebook-move-btn';
                upBtn.title = 'Move up';
                upBtn.setAttribute('aria-label', 'Move up');
                upBtn.disabled = index === 0;
                upBtn.textContent = '△';
                upBtn.addEventListener('click', () => moveCode(code.timestamp, -1));

                const downBtn = document.createElement('button');
                downBtn.type = 'button';
                downBtn.className = 'codebook-move-btn';
                downBtn.title = 'Move down';
                downBtn.setAttribute('aria-label', 'Move down');
                downBtn.disabled = index === state.codebook.codes.length - 1;
                downBtn.textContent = '▽';
                downBtn.addEventListener('click', () => moveCode(code.timestamp, 1));

                moveWrap.appendChild(upBtn);
                moveWrap.appendChild(downBtn);

                const colourWrap = document.createElement('div');
                colourWrap.className = 'codebook-colour-wrap';

                const colourInput = document.createElement('input');
                colourInput.type = 'color';
                colourInput.className = 'codebook-colour';
                colourInput.value = normalizeHex(code.colour);
                colourInput.title = 'Change colour (saved as normal palette)';
                colourInput.addEventListener('input', () => {
                    setColour(code, colourInput.value);
                    if (preview) {
                        preview.style.backgroundColor =
                            global.QualiCottyPalette.displayColour(code.colour);
                    }
                    renderCodeBar();
                    renderDocumentView();
                });
                colourWrap.appendChild(colourInput);

                let preview = null;
                if (global.QualiCottyPalette && global.QualiCottyPalette.isColourblindMode()) {
                    preview = document.createElement('span');
                    preview.className = 'codebook-colour-preview';
                    preview.style.backgroundColor =
                        global.QualiCottyPalette.displayColour(code.colour);
                    preview.title = 'Colourblind display';
                    colourWrap.appendChild(preview);
                }

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'codebook-name';
                nameInput.value = code.name;
                nameInput.title = 'Rename code';
                nameInput.addEventListener('change', () => {
                    if (!renameCode(code, nameInput.value)) {
                        nameInput.value = code.name;
                    } else {
                        renderCodeBar();
                        renderDocumentView();
                    }
                });

                const descBtn = document.createElement('button');
                descBtn.type = 'button';
                descBtn.className = 'codebook-action-btn';
                descBtn.textContent = 'Description';
                descBtn.title = 'Edit description';

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'codebook-action-btn codebook-delete-btn';
                delBtn.textContent = 'Delete';
                delBtn.title = 'Delete code';
                delBtn.addEventListener('click', () => beginDelete(code));

                main.appendChild(moveWrap);
                main.appendChild(colourWrap);
                main.appendChild(nameInput);
                main.appendChild(descBtn);
                main.appendChild(delBtn);
                row.appendChild(main);

                const descWrap = document.createElement('div');
                descWrap.className = 'codebook-desc-wrap';
                descWrap.hidden = true;
                const descArea = document.createElement('textarea');
                descArea.className = 'codebook-desc';
                descArea.placeholder = DEFAULT_DESCRIPTION;
                descArea.value = code.description || '';
                descArea.addEventListener('input', () => {
                    setDescription(code, descArea.value);
                    renderCodeBar();
                });
                descWrap.appendChild(descArea);
                row.appendChild(descWrap);

                descBtn.addEventListener('click', () => {
                    const open = descWrap.hidden;
                    list.querySelectorAll('.codebook-desc-wrap').forEach(w => {
                        w.hidden = true;
                    });
                    list.querySelectorAll('.codebook-action-btn.active-desc').forEach(b => {
                        b.classList.remove('active-desc');
                    });
                    if (open) {
                        // Close any open delete panel when editing description.
                        if (openDeleteTs) {
                            openDeleteTs = null;
                            list.querySelectorAll('.codebook-inline-delete').forEach(p => p.remove());
                        }
                        descWrap.hidden = false;
                        descBtn.classList.add('active-desc');
                        descArea.focus();
                    }
                });

                // Inline delete panel sits between this code and the next (sibling, not nested).
                list.appendChild(row);
                if (openDeleteTs === code.timestamp) {
                    list.appendChild(buildInlineDeletePanel(code));
                }
            });
        }

        function setup() {
            const els = getEls();
            els.codebookModalClose.addEventListener('click', closeModal);
            let downOnOverlay = false;
            els.codebookModal.addEventListener('mousedown', e => {
                downOnOverlay = (e.target === els.codebookModal);
            });
            els.codebookModal.addEventListener('click', e => {
                if (e.target === els.codebookModal && downOnOverlay) closeModal();
                downOnOverlay = false;
            });
            els.codebookPropName.addEventListener('change', applyMetaFromInputs);
            els.codebookPropDescription.addEventListener('change', applyMetaFromInputs);
            if (els.codebookColourblindToggle) {
                els.codebookColourblindToggle.addEventListener('change', () => {
                    const state = getState();
                    state.colourblindMode = !!els.codebookColourblindToggle.checked;
                    if (global.QualiCottyPalette) {
                        global.QualiCottyPalette.setColourblindMode(state.colourblindMode);
                    }
                    if (saveView) saveView();
                    renderCodebookList();
                    if (onColourblindModeChanged) onColourblindModeChanged();
                });
            }
            els.codebookExportBtn.addEventListener('click', () => {
                applyMetaFromInputs();
                exportCodebook();
            });
            els.codebookImportBtn.addEventListener('click', importCodebook);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && els.codebookModal.classList.contains('visible')) {
                    if (openDeleteTs) {
                        openDeleteTs = null;
                        renderCodebookList();
                        return;
                    }
                    closeModal();
                }
            });
        }

        return {
            openModal: openModal,
            closeModal: closeModal,
            setup: setup,
            renderCodebookList: renderCodebookList,
            renameCode: renameCode,
            setColour: setColour,
            setDescription: setDescription,
            deleteCode: deleteCode,
            moveCode: moveCode,
            exportCodebook: exportCodebook,
            importCodebook: importCodebook,
            importCodebookFromFile: importCodebookFromFile,
            applyImportedCodebook: applyImportedCodebook
        };
    }

    global.QualiCottyCodebook = {
        create: create,
        DEFAULT_DESCRIPTION: DEFAULT_DESCRIPTION
    };
})(window);
