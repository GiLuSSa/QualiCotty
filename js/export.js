/* QualiCotty — analyze-mode export (CSV + PDF)
 * Exposes window.QualiCottyExport.
 */
(function (global) {
    'use strict';

    function pad(n, len) {
        return String(n).padStart(len || 2, '0');
    }

    function formatExportStamp(date) {
        const d = date || new Date();
        const day =
            d.getFullYear() + '-' +
            pad(d.getMonth() + 1) + '-' +
            pad(d.getDate());
        const time = pad(d.getHours()) + '-' + pad(d.getMinutes());
        return { day: day, time: time };
    }

    function safeBaseName(name) {
        const base = String(name || 'qualicotty')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^\.+|\.+$/g, '');
        return base || 'qualicotty';
    }

    function escapeCsvCell(value) {
        const s = String(value == null ? '' : value);
        if (/[",\r\n]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function csvLine(cells) {
        return cells.map(escapeCsvCell).join(',');
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function displayColour(hex) {
        if (global.QualiCottyPalette && typeof global.QualiCottyPalette.displayColour === 'function') {
            return global.QualiCottyPalette.displayColour(hex);
        }
        return hex || '#cccccc';
    }

    function downloadBlob(filename, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    /**
     * Build the shared export snapshot from current analyze view.
     * @param {object} ctx
     * @returns {object}
     */
    function buildExportSnapshot(ctx) {
        const state = ctx.getState();
        const Seg = ctx.getSeg && ctx.getSeg();
        const getCodeByTimestamp = ctx.getCodeByTimestamp;

        const stamp = formatExportStamp(new Date());
        const author = (state.codebook && state.codebook.userName)
            ? String(state.codebook.userName).trim()
            : '';
        const authorLabel = author || 'Anonymous';

        const codes = (state.codebook && Array.isArray(state.codebook.codes))
            ? state.codebook.codes.slice()
            : [];

        // Documents currently represented on screen (same rules as the view).
        let docs = [];
        if (state.mergeSegments && state.isolateSegments) {
            docs = state.documents.slice();
        } else {
            const activeTs = state.activeDocumentTimestamp;
            const active = state.documents.find(d => d.timestamp === activeTs);
            if (active) docs = [active];
        }

        const rows = [];
        const docsWithRows = [];

        docs.forEach(doc => {
            if (!Seg || typeof Seg.computeAnalyzeDisplayUnits !== 'function') return;
            const units = Seg.computeAnalyzeDisplayUnits(doc);
            if (!units.length) return;
            docsWithRows.push(doc);
            units.forEach(unit => {
                const text = doc.text.slice(unit.start, unit.end);
                const codeSet = {};
                (unit.codes || []).forEach(ts => { codeSet[ts] = true; });
                rows.push({
                    documentName: doc.name || 'Untitled',
                    documentTimestamp: doc.timestamp,
                    text: text,
                    codeSet: codeSet,
                    start: unit.start,
                    end: unit.end,
                    codes: (unit.codes || []).slice()
                });
            });
        });

        // Filter expression for the header line.
        let filterPhrase = '';
        if (state.analyzeQueryMode) {
            const box = document.getElementById('analyzeQueryBox');
            const expr = box ? String(box.value || '').trim() : '';
            filterPhrase = expr || '(empty query)';
        } else {
            const tags = Array.from(state.analyzeFilterTags || []);
            if (tags.length === 0) {
                filterPhrase = 'all codes';
            } else {
                const names = tags.map(ts => {
                    const c = getCodeByTimestamp ? getCodeByTimestamp(ts) : null;
                    return c ? c.name : ts;
                });
                const joiner = state.analyzeLogic === 'or' ? ' or ' : ' and ';
                filterPhrase = names.join(joiner);
            }
        }

        const docNames = docsWithRows.map(d => d.name || 'Untitled');

        const metaLine =
            'Exported by QualiCotty, ' + stamp.day + ' at ' + stamp.time +
            ' by ' + authorLabel + '. Codes ' + filterPhrase +
            '. Documents ' + (docNames.length ? docNames.join(', ') : '(none)') + '.';

        return {
            stamp: stamp,
            author: authorLabel,
            metaLine: metaLine,
            filterPhrase: filterPhrase,
            codes: codes,
            documents: docsWithRows,
            allDocumentsForMeta: docsWithRows,
            rows: rows,
            projectName: (state.codebook && state.codebook.project) || 'Untitled project',
            isolate: !!(state.mode === 'analyze' && state.isolateSegments),
            merge: !!(state.mergeSegments && state.isolateSegments),
            state: state,
            getCodeByTimestamp: getCodeByTimestamp,
            getSeg: function () { return Seg; }
        };
    }

    function buildCsvString(snapshot) {
        const lines = [];

        const header = ['document name', 'text'].concat(
            snapshot.codes.map(c => c.name || 'Code')
        );
        lines.push(csvLine(header));

        snapshot.rows.forEach(row => {
            const cells = [row.documentName, row.text];
            snapshot.codes.forEach(code => {
                cells.push(row.codeSet[code.timestamp] ? '1' : '');
            });
            lines.push(csvLine(cells));
        });

        lines.push('');
        lines.push(escapeCsvCell(snapshot.metaLine));
        lines.push('');

        snapshot.codes.forEach(code => {
            lines.push(csvLine([
                code.name || 'Code',
                typeof code.description === 'string' ? code.description : ''
            ]));
        });

        // Trailing newline for friendlier CSV tools.
        return lines.join('\r\n') + '\r\n';
    }

    function downloadCsv(ctx) {
        const snapshot = buildExportSnapshot(ctx);
        const csv = buildCsvString(snapshot);
        const filename = safeBaseName(snapshot.projectName) + '_export.csv';
        downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        return snapshot;
    }

    /**
     * Build highlighted HTML for one document as currently analyzable on screen.
     */
    function buildDocumentBodyHtml(doc, snapshot) {
        const Seg = snapshot.getSeg();
        const getCodeByTimestamp = snapshot.getCodeByTimestamp;
        if (!Seg) return '<p></p>';

        const units = Seg.computeAnalyzeDisplayUnits(doc);
        const text = doc.text;
        const isolate = snapshot.isolate;

        function highlightSlice(slice, codeTs) {
            const colours = codeTs.map(ts => {
                const code = getCodeByTimestamp ? getCodeByTimestamp(ts) : null;
                return code ? displayColour(code.colour) : '#ffe066';
            });
            let bg = colours[0] || '#ffe066';
            if (colours.length > 1 && global.QualiCottyPalette &&
                typeof global.QualiCottyPalette.blendColours === 'function') {
                bg = global.QualiCottyPalette.blendColours(colours);
            }
            return '<mark style="background-color:' + escapeHtml(bg) +
                ';color:#111;padding:0 0.05em;">' + escapeHtml(slice) + '</mark>';
        }

        function paintUnitHtml(unit) {
            const segs = snapshot.state.segments.filter(s =>
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
            let html = '';
            for (let i = 0; i < boundaries.length - 1; i++) {
                const a = boundaries[i];
                const b = boundaries[i + 1];
                if (b <= a) continue;
                const covering = segs.filter(s =>
                    s.coordinates.start <= a && s.coordinates.end >= b
                );
                const codeTs = Seg.collectCodeTimestamps(covering);
                const slice = text.slice(a, b);
                if (codeTs.length === 0) {
                    html += escapeHtml(slice);
                } else {
                    html += highlightSlice(slice, codeTs);
                }
            }
            return html;
        }

        if (units.length === 0) {
            return isolate
                ? '<p class="muted">No visible segments.</p>'
                : '<div class="doc-body"><div class="seg">' + escapeHtml(text) + '</div></div>';
        }

        // One block per segment so each starts on its own line.
        if (isolate) {
            return '<div class="doc-body">' + units.map(unit =>
                '<div class="seg">' + paintUnitHtml(unit) + '</div>'
            ).join('') + '</div>';
        }

        let html = '';
        let cursor = 0;
        units.forEach(unit => {
            if (unit.start > cursor) {
                const gap = text.slice(cursor, unit.start);
                if (gap.trim()) {
                    html += '<div class="ctx">' + escapeHtml(gap) + '</div>';
                }
            }
            html += '<div class="seg">' + paintUnitHtml(unit) + '</div>';
            cursor = unit.end;
        });
        if (cursor < text.length) {
            const tail = text.slice(cursor);
            if (tail.trim()) {
                html += '<div class="ctx">' + escapeHtml(tail) + '</div>';
            }
        }
        return '<div class="doc-body">' + html + '</div>';
    }

    function buildPdfHtml(snapshot) {
        const codeBlocks = snapshot.codes.map(code => {
            const col = displayColour(code.colour || '#ffe066');
            return (
                '<div class="entry">' +
                '<div class="entry-title" style="background-color:' + escapeHtml(col) + ';">' +
                escapeHtml(code.name || 'Code') + '</div>' +
                '<div class="entry-desc">' +
                escapeHtml(typeof code.description === 'string' ? code.description : '') +
                '</div></div>'
            );
        }).join('');

        const merged = !!snapshot.merge;
        let bodyHtml = '';

        if (snapshot.documents.length === 0) {
            bodyHtml = '<p class="muted">No documents with visible segments to export.</p>';
        } else if (merged) {
            // Continuous flow: document headers inline, no page breaks between docs.
            bodyHtml = snapshot.documents.map(doc =>
                '<div class="doc-block">' +
                '<h2 class="doc-page-title">' + escapeHtml(doc.name || 'Untitled') + '</h2>' +
                buildDocumentBodyHtml(doc, snapshot) +
                '</div>'
            ).join('');
        } else {
            bodyHtml = snapshot.documents.map(doc =>
                '<section class="doc-page">' +
                '<h2 class="doc-page-title">' + escapeHtml(doc.name || 'Untitled') + '</h2>' +
                buildDocumentBodyHtml(doc, snapshot) +
                '</section>'
            ).join('');
        }

        const pageTitle = 'QualiCotty - ' + (snapshot.projectName || 'Untitled project');

        return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>' + escapeHtml(pageTitle) + '</title>' +
            '<style>' +
            '@page { size: A4; margin: 16mm; }' +
            'html, body { margin: 0; padding: 0; }' +
            'body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; color: #111; line-height: 1.45; }' +
            '.front { page-break-after: always; }' +
            '.doc-page { page-break-before: always; }' +
            '.doc-page:first-of-type { page-break-before: auto; }' +
            '.doc-block { margin: 0 0 18px; page-break-inside: auto; }' +
            'h1 { font-size: 16pt; margin: 0 0 10px; }' +
            '.meta { margin: 0 0 18px; font-size: 10pt; color: #333; }' +
            'h2.section { font-size: 13pt; margin: 18px 0 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }' +
            '.entry { margin: 0 0 12px; }' +
            '.entry-title { display: inline-block; font-weight: 700; font-size: 11pt; padding: 2px 8px; border-radius: 3px; color: #111; }' +
            '.entry-desc { margin-top: 4px; font-weight: 400; white-space: pre-wrap; }' +
            '.doc-page-title { font-size: 14pt; margin: 0 0 10px; }' +
            '.doc-body { word-wrap: break-word; }' +
            '.seg { display: block; margin: 0 0 0.85em; white-space: pre-wrap; }' +
            '.ctx { display: block; margin: 0 0 0.85em; white-space: pre-wrap; color: #444; }' +
            'mark { border-radius: 2px; }' +
            '.muted { color: #666; font-style: italic; }' +
            '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }' +
            '</style></head><body>' +
            '<section class="front">' +
            '<h1>' + escapeHtml(pageTitle) + '</h1>' +
            '<p class="meta">' + escapeHtml(snapshot.metaLine) + '</p>' +
            '<h2 class="section">Codebook</h2>' +
            (codeBlocks || '<p class="muted">No codes.</p>') +
            '</section>' +
            '<section class="content">' + bodyHtml + '</section>' +
            '</body></html>';
    }

    function printHtmlInHiddenFrame(html, title) {
        let iframe = document.getElementById('qualicottyPrintFrame');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'qualicottyPrintFrame';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.cssText =
                'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
            document.body.appendChild(iframe);
        }
        const win = iframe.contentWindow;
        const doc = win.document;
        doc.open();
        doc.write(html);
        doc.close();
        doc.title = title || 'QualiCotty export';
        setTimeout(function () {
            try {
                win.focus();
                win.print();
            } catch (err) {
                console.error(err);
                alert('Could not open the print dialog for PDF export.');
            }
        }, 250);
    }

    function downloadPdf(ctx) {
        const snapshot = buildExportSnapshot(ctx);
        const html = buildPdfHtml(snapshot);
        printHtmlInHiddenFrame(html, 'QualiCotty - ' + (snapshot.projectName || 'Untitled project'));
        return snapshot;
    }

    global.QualiCottyExport = {
        buildExportSnapshot: buildExportSnapshot,
        buildCsvString: buildCsvString,
        downloadCsv: downloadCsv,
        downloadPdf: downloadPdf
    };
})(window);
