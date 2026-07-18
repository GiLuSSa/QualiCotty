/* QualiCotty — plain .txt import (passthrough) */
(function (global) {
    'use strict';

    function parseTxt(raw, fileName) {
        return {
            name: fileName || 'document.txt',
            text: String(raw == null ? '' : raw),
            sourceFormat: 'txt'
        };
    }

    global.QualiCottyImportTxt = {
        parse: parseTxt,
        extensions: ['.txt']
    };
})(window);
