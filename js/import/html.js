/* QualiCotty — HTML / noScribe import → plain text */
(function (global) {
    'use strict';

    function decodeEntities(str) {
        const ta = document.createElement('textarea');
        ta.innerHTML = str;
        return ta.value;
    }

    /**
     * Convert HTML (including noScribe WordSection transcripts) to plain text.
     * Keeps speaker labels and in-text [hh:mm:ss] cues; strips tags/styles/scripts.
     */
    function htmlToPlainText(html) {
        let s = String(html == null ? '' : html);

        // Drop non-content sections early.
        s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
        s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
        s = s.replace(/<head[\s\S]*?<\/head>/gi, '');

        // Block / break → newlines (before stripping tags).
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/p>/gi, '\n');
        s = s.replace(/<\/div>/gi, '\n');
        s = s.replace(/<\/h[1-6]>/gi, '\n');
        s = s.replace(/<\/li>/gi, '\n');
        s = s.replace(/<\/tr>/gi, '\n');

        // Remove remaining tags.
        s = s.replace(/<[^>]+>/g, '');

        s = decodeEntities(s);

        // Normalise whitespace / newlines.
        s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        s = s.replace(/[ \t]+\n/g, '\n');
        s = s.replace(/\n{3,}/g, '\n\n');
        s = s.replace(/[ \t]{2,}/g, ' ');
        return s.trim();
    }

    function parseHtml(raw, fileName) {
        return {
            name: fileName || 'document.html',
            text: htmlToPlainText(raw),
            sourceFormat: 'html'
        };
    }

    global.QualiCottyImportHtml = {
        parse: parseHtml,
        extensions: ['.html', '.htm']
    };
})(window);
