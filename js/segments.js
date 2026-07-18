/* QualiCotty — segment model, coding, properties modal, highlight helpers
 * Loaded before index.js. Exposes window.QualiCottySegments.
 * Colours are managed exclusively by QualiCottyPalette.
 */
(function (global) {
    'use strict';

    function defaultColour() {
        return global.QualiCottyPalette
            ? global.QualiCottyPalette.getDefaultColour()
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

    /**
     * Segment codes store code timestamps (not names) so renames stay stable.
     * @param {string} documentTimestamp
     * @param {number} start
     * @param {number} end
     * @param {string} codeTimestamp
     */
    class QSegment {
        constructor(documentTimestamp, start, end, codeTimestamp) {
            this.timestamp = newTimestamp();
            this.documentTimestamp = documentTimestamp;
            this.type = 'simple';
            this.coordinates = { start: start, end: end };
            this.codes = [codeTimestamp];
            this.comment = '';
        }
    }

    /**
     * Migrate legacy name-based segment.codes → code timestamps.
     * Safe to run repeatedly on already-migrated data.
     */
    function migrateSegmentCodes(segments, codebook) {
        if (!Array.isArray(segments) || !codebook || !Array.isArray(codebook.codes)) return;

        const byName = Object.create(null);
        const byTs = Object.create(null);
        codebook.codes.forEach(c => {
            if (c && c.timestamp) byTs[c.timestamp] = c;
            if (c && c.name) byName[c.name] = c.timestamp;
        });

        const fallback = codebook.codes[0] && codebook.codes[0].timestamp;

        segments.forEach(seg => {
            if (typeof seg.comment !== 'string') seg.comment = '';
            const raw = Array.isArray(seg.codes) ? seg.codes : [];
            const mapped = [];
            raw.forEach(ref => {
                let ts = null;
                if (byTs[ref]) ts = ref;
                else if (byName[ref]) ts = byName[ref];
                if (ts && mapped.indexOf(ts) === -1) mapped.push(ts);
            });
            if (mapped.length === 0 && fallback) mapped.push(fallback);
            seg.codes = mapped;
        });
    }

    /**
     * Bind segment functionality to the live app context.
     * @param {object} ctx
     */
    function create(ctx) {
        const {
            getState,
            getEls,
            saveState,
            getDocument,
            getActiveDocument,
            getCodeByTimestamp,
            renderDocumentView,
            exitIsolationToContext,
            clamp,
            blendColours
        } = ctx;

        function collectCodeTimestamps(segments) {
            const set = new Set();
            segments.forEach(s => (s.codes || []).forEach(c => set.add(c)));
            return Array.from(set);
        }

        function codeLabels(timestamps) {
            return timestamps.map(ts => {
                const c = getCodeByTimestamp(ts);
                return c ? c.name : ts;
            });
        }

        function createHighlightSpan(slice, codeTimestamps, docTs, start, end) {
            const span = document.createElement('span');
            span.className = 'hl';
            const colours = codeTimestamps
                .map(ts => getCodeByTimestamp(ts))
                .filter(Boolean)
                .map(c => global.QualiCottyPalette
                    ? global.QualiCottyPalette.displayColour(c.colour)
                    : c.colour);

            if (colours.length <= 1) {
                span.style.backgroundColor = colours[0] || defaultColour();
            } else {
                span.classList.add('multi');
                span.style.backgroundColor = blendColours(colours);
            }
            span.title = codeLabels(codeTimestamps).join(', ');
            span.dataset.docTs = docTs;
            span.dataset.start = String(start);
            span.dataset.end = String(end);
            span.textContent = slice;
            return span;
        }

        function createOmittedSep() {
            const sep = document.createElement('span');
            sep.className = 'omitted';
            sep.textContent = '\u22ef';
            return sep;
        }

        function computeAnalyzeDisplayUnits(doc) {
            const state = getState();
            const tags = Array.from(state.analyzeFilterTags); // code timestamps
            const segs = state.segments.filter(s => s.documentTimestamp === doc.timestamp);
            const textLen = doc.text.length;

            if (segs.length === 0) return [];

            function segmentsToUnits(list) {
                return list
                    .slice()
                    .sort((a, b) => a.coordinates.start - b.coordinates.start)
                    .map(s => ({
                        start: clamp(s.coordinates.start, 0, textLen),
                        end: clamp(s.coordinates.end, 0, textLen),
                        codes: (s.codes || []).slice()
                    }))
                    .filter(u => u.end > u.start);
            }

            function unitContainsText(unit, needle) {
                const n = String(needle || '').trim().toLowerCase();
                if (!n) return true;
                const slice = doc.text.slice(unit.start, unit.end).toLowerCase();
                return slice.indexOf(n) !== -1;
            }

            function applyTextFilter(units) {
                const needle = typeof state.analyzeTextFilter === 'string'
                    ? state.analyzeTextFilter
                    : '';
                if (!String(needle).trim()) return units;
                return units.filter(u => unitContainsText(u, needle));
            }

            // Custom `|` query: whole-segment boolean filter.
            if (state.analyzeQueryMode) {
                const Q = global.QualiCottyAnalyzeQuery;
                const raw = typeof state.analyzeQuery === 'string' ? state.analyzeQuery : '';
                if (!Q || typeof Q.compile !== 'function') return [];

                const knownNames = (state.codebook && state.codebook.codes || []).map(c => c.name);
                const compiled = Q.compile(raw, { knownCodeNames: knownNames });
                state.analyzeQueryError = compiled.ok ? '' : (compiled.error || 'Invalid query.');
                if (!compiled.ok || compiled.empty || !compiled.ast) return [];

                const matched = segs.filter(s => {
                    const codeNames = (s.codes || []).map(ts => {
                        const code = getCodeByTimestamp(ts);
                        return code ? code.name : '';
                    }).filter(Boolean);
                    const slice = doc.text.slice(
                        clamp(s.coordinates.start, 0, textLen),
                        clamp(s.coordinates.end, 0, textLen)
                    );
                    return Q.evaluate(compiled.ast, {
                        codeNames: codeNames,
                        text: slice,
                        docName: doc.name || ''
                    });
                });
                return segmentsToUnits(matched);
            }

            if (tags.length === 0) {
                return applyTextFilter(segmentsToUnits(segs));
            }

            const relevant = segs.filter(s =>
                (s.codes || []).some(c => tags.indexOf(c) !== -1)
            );
            if (relevant.length === 0) return [];

            const boundarySet = new Set();
            relevant.forEach(s => {
                boundarySet.add(clamp(s.coordinates.start, 0, textLen));
                boundarySet.add(clamp(s.coordinates.end, 0, textLen));
            });
            const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

            function filterTagsAt(rangeStart, rangeEnd) {
                const present = new Set();
                segs.forEach(s => {
                    if (s.coordinates.start <= rangeStart && s.coordinates.end >= rangeEnd) {
                        (s.codes || []).forEach(c => {
                            if (tags.indexOf(c) !== -1) present.add(c);
                        });
                    }
                });
                return present;
            }

            function allCodesAt(rangeStart, rangeEnd) {
                const set = new Set();
                segs.forEach(s => {
                    if (s.coordinates.start <= rangeStart && s.coordinates.end >= rangeEnd) {
                        (s.codes || []).forEach(c => set.add(c));
                    }
                });
                return Array.from(set);
            }

            const logic = state.analyzeLogic;
            const qualifying = [];

            for (let i = 0; i < boundaries.length - 1; i++) {
                const a = boundaries[i];
                const b = boundaries[i + 1];
                if (b <= a) continue;
                const present = filterTagsAt(a, b);
                const ok = (logic === 'and')
                    ? present.size === tags.length
                    : present.size >= 1;
                if (!ok) continue;
                qualifying.push({ start: a, end: b, codes: allCodesAt(a, b) });
            }

            const units = [];
            qualifying.forEach(q => {
                const last = units[units.length - 1];
                if (last && last.end === q.start) {
                    last.end = q.end;
                    q.codes.forEach(c => {
                        if (last.codes.indexOf(c) === -1) last.codes.push(c);
                    });
                } else {
                    units.push({ start: q.start, end: q.end, codes: q.codes.slice() });
                }
            });

            return applyTextFilter(units);
        }

        function paintDisplayUnit(frag, doc, unit) {
            const state = getState();
            const segs = state.segments.filter(s =>
                s.documentTimestamp === doc.timestamp &&
                s.coordinates.start < unit.end && s.coordinates.end > unit.start
            );
            const boundarySet = new Set([unit.start, unit.end]);
            segs.forEach(s => {
                const a = Math.max(s.coordinates.start, unit.start);
                const b = Math.min(s.coordinates.end, unit.end);
                if (b > a) {
                    boundarySet.add(a);
                    boundarySet.add(b);
                }
            });
            const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

            for (let i = 0; i < boundaries.length - 1; i++) {
                const a = boundaries[i];
                const b = boundaries[i + 1];
                if (b <= a) continue;
                const covering = segs.filter(s =>
                    s.coordinates.start <= a && s.coordinates.end >= b
                );
                const codeTs = collectCodeTimestamps(covering);
                if (codeTs.length === 0) {
                    frag.appendChild(document.createTextNode(doc.text.slice(a, b)));
                } else {
                    frag.appendChild(createHighlightSpan(
                        doc.text.slice(a, b), codeTs, doc.timestamp, a, b
                    ));
                }
            }
        }

        function formatAnalyzeStats(units) {
            if (units.length === 0) return '0 segments';

            const perCode = {};
            let totalLen = 0;
            units.forEach(u => {
                totalLen += (u.end - u.start);
                (u.codes || []).forEach(ts => {
                    const code = getCodeByTimestamp(ts);
                    const label = code ? code.name : ts;
                    perCode[label] = (perCode[label] || 0) + 1;
                });
            });
            const avg = Math.round(totalLen / units.length);
            const parts = Object.keys(perCode)
                .sort()
                .map(name => perCode[name] + ' ' + name);
            return units.length + ' segment' + (units.length === 1 ? '' : 's') +
                (parts.length ? ': ' + parts.join(', ') : '') +
                '. Average length ' + avg + ' characters.';
        }

        function updateAnalyzeStats() {
            const els = getEls();
            const state = getState();
            const el = document.getElementById('analyzeStats');
            if (!el) return;

            if (state.mode !== 'analyze') {
                el.textContent = '';
                return;
            }

            let units = [];
            if (state.mergeSegments && state.isolateSegments) {
                state.documents.forEach(doc => {
                    computeAnalyzeDisplayUnits(doc).forEach(u => units.push(u));
                });
            } else {
                const doc = getActiveDocument();
                if (doc) units = computeAnalyzeDisplayUnits(doc);
            }

            el.textContent = formatAnalyzeStats(units);
        }

        function getOffsetWithinView(node, offset) {
            const els = getEls();
            const walker = document.createTreeWalker(
                els.documentView,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let total = 0;
            let current;
            while ((current = walker.nextNode())) {
                if (current === node) {
                    return total + offset;
                }
                total += current.textContent.length;
            }
            return -1;
        }

        function getSelectionOffsets() {
            const els = getEls();
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

            const range = sel.getRangeAt(0);
            if (!els.documentView.contains(range.startContainer) ||
                !els.documentView.contains(range.endContainer)) {
                return null;
            }

            let start = getOffsetWithinView(range.startContainer, range.startOffset);
            let end = getOffsetWithinView(range.endContainer, range.endOffset);

            if (start < 0 || end < 0) return null;
            if (start === end) return null;
            if (start > end) {
                const tmp = start; start = end; end = tmp;
            }
            return { start: start, end: end };
        }

        function clearSelection() {
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
        }

        function applyCodeToSelection(codeTs) {
            const state = getState();
            if (state.mode !== 'code') return;
            const doc = getActiveDocument();
            if (!doc) return;
            if (!codeTs) {
                alert('Select a tag on the right first, then select text and press Enter.');
                return;
            }

            const offsets = getSelectionOffsets();
            if (!offsets) return;

            const codeObj = getCodeByTimestamp(codeTs);
            const codeLabel = codeObj ? codeObj.name : codeTs;

            const existing = state.segments.find(s =>
                s.documentTimestamp === doc.timestamp &&
                s.coordinates.start === offsets.start &&
                s.coordinates.end === offsets.end
            );

            if (existing) {
                if (existing.codes.indexOf(codeTs) !== -1) {
                    alert('This exact span is already coded with "' + codeLabel + '".');
                    return;
                }
                existing.codes.push(codeTs);
            } else {
                state.segments.push(new QSegment(doc.timestamp, offsets.start, offsets.end, codeTs));
            }

            saveState();
            clearSelection();
            renderDocumentView();
        }

        function applyActiveCodeToSelection() {
            applyCodeToSelection(getState().activeCodeTimestamp);
        }

        function resolveSegmentFromSpan(hl) {
            const state = getState();
            const docTs = hl.dataset.docTs || null;
            const start = parseInt(hl.dataset.start, 10);
            const end = parseInt(hl.dataset.end, 10);
            if (!docTs || isNaN(start) || isNaN(end)) return null;

            const covering = state.segments.filter(s =>
                s.documentTimestamp === docTs &&
                s.coordinates.start <= start && s.coordinates.end >= end
            );
            if (covering.length === 0) return null;

            covering.sort((a, b) =>
                (a.coordinates.end - a.coordinates.start) - (b.coordinates.end - b.coordinates.start));
            return covering[0];
        }

        function renderSegmentTags(seg) {
            const state = getState();
            const els = getEls();
            els.segmentTags.innerHTML = '';
            state.codebook.codes.forEach(code => {
                const row = document.createElement('label');
                row.className = 'segment-tag-row';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = seg.codes.indexOf(code.timestamp) !== -1;

                const swatch = document.createElement('span');
                swatch.className = 'swatch';
                swatch.style.backgroundColor = global.QualiCottyPalette
                    ? global.QualiCottyPalette.displayColour(code.colour)
                    : code.colour;

                const name = document.createElement('span');
                name.className = 'name';
                name.textContent = code.name;

                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        if (seg.codes.indexOf(code.timestamp) === -1) {
                            seg.codes.push(code.timestamp);
                        }
                    } else {
                        if (seg.codes.length <= 1) {
                            cb.checked = true;
                            alert('A segment must keep at least one tag.');
                            return;
                        }
                        seg.codes = seg.codes.filter(c => c !== code.timestamp);
                    }
                    saveState();
                    renderDocumentView();
                });

                row.appendChild(cb);
                row.appendChild(swatch);
                row.appendChild(name);
                els.segmentTags.appendChild(row);
            });
        }

        function openSegmentModal(seg) {
            const state = getState();
            const els = getEls();
            state.editingSegment = seg;

            const doc = getDocument(seg.documentTimestamp);
            const start = clamp(seg.coordinates.start, 0, doc ? doc.text.length : seg.coordinates.start);
            const end = clamp(seg.coordinates.end, 0, doc ? doc.text.length : seg.coordinates.end);
            els.segmentSnippet.textContent = doc ? doc.text.slice(start, end) : '';

            renderSegmentTags(seg);
            els.segmentComment.value = seg.comment || '';
            els.segmentModal.classList.add('visible');
        }

        function closeSegmentModal() {
            const state = getState();
            const els = getEls();
            els.segmentModal.classList.remove('visible');
            state.editingSegment = null;
        }

        function deleteEditingSegment() {
            const state = getState();
            const seg = state.editingSegment;
            if (!seg) return;

            const ts = seg.timestamp;
            state.segments = state.segments.filter(s => s.timestamp !== ts);
            saveState();
            closeSegmentModal();
            renderDocumentView();
        }

        function setupSegmentClick() {
            const els = getEls();
            els.documentView.addEventListener('dblclick', e => {
                const state = getState();
                const hl = e.target.closest('.hl');
                if (!hl || !els.documentView.contains(hl)) return;
                e.preventDefault();

                if (state.mode === 'analyze' && state.isolateSegments) {
                    const docTs = hl.dataset.docTs || null;
                    const start = parseInt(hl.dataset.start, 10);
                    exitIsolationToContext(docTs, isNaN(start) ? null : start);
                    return;
                }

                const seg = resolveSegmentFromSpan(hl);
                if (seg) openSegmentModal(seg);
            });
        }

        function setupSegmentModal() {
            const els = getEls();
            const state = getState();
            els.segmentModalClose.addEventListener('click', closeSegmentModal);
            els.segmentModal.addEventListener('click', e => {
                if (e.target === els.segmentModal) closeSegmentModal();
            });
            els.segmentComment.addEventListener('input', () => {
                if (state.editingSegment) {
                    state.editingSegment.comment = els.segmentComment.value;
                    saveState();
                }
            });
            els.segmentDeleteBtn.addEventListener('click', deleteEditingSegment);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && els.segmentModal.classList.contains('visible')) {
                    closeSegmentModal();
                }
            });
        }

        return {
            createHighlightSpan: createHighlightSpan,
            createOmittedSep: createOmittedSep,
            collectCodeTimestamps: collectCodeTimestamps,
            computeAnalyzeDisplayUnits: computeAnalyzeDisplayUnits,
            paintDisplayUnit: paintDisplayUnit,
            updateAnalyzeStats: updateAnalyzeStats,
            getSelectionOffsets: getSelectionOffsets,
            applyActiveCodeToSelection: applyActiveCodeToSelection,
            applyCodeToSelection: applyCodeToSelection,
            setupSegmentClick: setupSegmentClick,
            setupSegmentModal: setupSegmentModal,
            openSegmentModal: openSegmentModal,
            closeSegmentModal: closeSegmentModal,
            deleteEditingSegment: deleteEditingSegment
        };
    }

    /**
     * Replace one code timestamp with another across all segments.
     * If a segment already has the target timestamp, just drops the source.
     * @returns {{updated:number}}
     */
    function reassignCodeInSegments(segments, fromTs, toTs) {
        let updated = 0;
        if (!Array.isArray(segments) || !fromTs || !toTs || fromTs === toTs) {
            return { updated: 0 };
        }
        segments.forEach(seg => {
            const codes = Array.isArray(seg.codes) ? seg.codes : [];
            if (codes.indexOf(fromTs) === -1) return;
            const next = [];
            codes.forEach(c => {
                const mapped = (c === fromTs) ? toTs : c;
                if (next.indexOf(mapped) === -1) next.push(mapped);
            });
            seg.codes = next;
            updated += 1;
        });
        return { updated: updated };
    }

    /**
     * Remove a code timestamp from all segments.
     * Segments left with no codes are deleted from the array.
     * @returns {{stripped:number, removedSegments:number}}
     */
    function removeCodeFromSegments(segments, codeTs) {
        let stripped = 0;
        let removedSegments = 0;
        if (!Array.isArray(segments) || !codeTs) {
            return { stripped: 0, removedSegments: 0 };
        }
        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i];
            const codes = Array.isArray(seg.codes) ? seg.codes : [];
            if (codes.indexOf(codeTs) === -1) continue;
            const next = codes.filter(c => c !== codeTs);
            stripped += 1;
            if (next.length === 0) {
                segments.splice(i, 1);
                removedSegments += 1;
            } else {
                seg.codes = next;
            }
        }
        return { stripped: stripped, removedSegments: removedSegments };
    }

    global.QualiCottySegments = {
        QSegment: QSegment,
        newTimestamp: newTimestamp,
        migrateSegmentCodes: migrateSegmentCodes,
        reassignCodeInSegments: reassignCodeInSegments,
        removeCodeFromSegments: removeCodeFromSegments,
        create: create
    };
})(window);
