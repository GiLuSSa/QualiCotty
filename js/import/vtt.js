/* QualiCotty — WebVTT import → plain text lines */
(function (global) {
    'use strict';

    function stripCueTags(text) {
        // Remove simple VTT/HTML-ish cue tags: <c>, <v Speaker>, <b>, etc.
        return String(text)
            .replace(/<\/?[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Parse WebVTT into one line per cue: "[start] cue text"
     * Skips WEBVTT header and NOTE blocks.
     */
    function vttToPlainText(raw) {
        const src = String(raw == null ? '' : raw).replace(/^\uFEFF/, '');
        const lines = src.split(/\r\n|\n|\r/);
        const out = [];

        let i = 0;
        // Skip optional WEBVTT header and blank lines after it.
        if (lines[0] && /^WEBVTT/i.test(lines[0].trim())) {
            i = 1;
            while (i < lines.length && lines[i].trim() !== '') i += 1;
            while (i < lines.length && lines[i].trim() === '') i += 1;
        }

        const timeRe = /^(\d{1,2}:)?\d{1,2}:\d{2}\.\d{3}\s+-->\s+/;

        while (i < lines.length) {
            let line = lines[i].trim();

            // NOTE blocks: until blank line.
            if (/^NOTE(\s|$)/i.test(line) || line === 'NOTE') {
                i += 1;
                while (i < lines.length && lines[i].trim() !== '') i += 1;
                while (i < lines.length && lines[i].trim() === '') i += 1;
                continue;
            }

            // STYLE / REGION blocks (WebVTT): skip until blank.
            if (/^(STYLE|REGION)\b/i.test(line)) {
                i += 1;
                while (i < lines.length && lines[i].trim() !== '') i += 1;
                while (i < lines.length && lines[i].trim() === '') i += 1;
                continue;
            }

            if (line === '') {
                i += 1;
                continue;
            }

            // Optional cue identifier (non-timing line before -->).
            if (!timeRe.test(line) && i + 1 < lines.length && timeRe.test(lines[i + 1].trim())) {
                i += 1;
                line = lines[i].trim();
            }

            if (!timeRe.test(line)) {
                i += 1;
                continue;
            }

            const start = line.split(/\s+-->\s+/)[0].trim();
            i += 1;

            const cueLines = [];
            while (i < lines.length && lines[i].trim() !== '') {
                cueLines.push(lines[i]);
                i += 1;
            }
            const cueText = stripCueTags(cueLines.join(' '));
            if (cueText) {
                out.push('[' + start + '] ' + cueText);
            }

            while (i < lines.length && lines[i].trim() === '') i += 1;
        }

        return out.join('\n');
    }

    function parseVtt(raw, fileName) {
        return {
            name: fileName || 'document.vtt',
            text: vttToPlainText(raw),
            sourceFormat: 'vtt'
        };
    }

    global.QualiCottyImportVtt = {
        parse: parseVtt,
        extensions: ['.vtt']
    };
})(window);
