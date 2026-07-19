/* QualiCotty — palette generator (sole colour authority)
 * Default palette (≥20) with colourblind alternatives.
 * Beyond the default set, generates random colours not already in use.
 */
(function (global) {
    'use strict';

    /** Default highlight colour for the first / fallback code. */
    const DEFAULT_COLOUR = '#ffe066';

    /**
     * Built-in palette: each entry has a primary colour and a colourblind-safe
     * alternative (deuteranopia / protanopia friendly pairing).
     * At least 20 unique primary colours.
     */
    const DEFAULT_PALETTE = [
        { colour: '#ffe066', colourblind: '#e69f00' }, // yellow
        { colour: '#7ed957', colourblind: '#009e73' }, // green
        { colour: '#5ce1e6', colourblind: '#56b4e9' }, // cyan
        { colour: '#ff66c4', colourblind: '#cc79a7' }, // pink
        { colour: '#ffa500', colourblind: '#e69f00' }, // orange
        { colour: '#c084fc', colourblind: '#0072b2' }, // purple
        { colour: '#ff6b6b', colourblind: '#d55e00' }, // red
        { colour: '#a0e548', colourblind: '#009e73' }, // lime
        { colour: '#63b3ed', colourblind: '#0072b2' }, // blue
        { colour: '#f6ad55', colourblind: '#e69f00' }, // peach
        { colour: '#48bb78', colourblind: '#009e73' }, // emerald
        { colour: '#ed8936', colourblind: '#d55e00' }, // amber
        { colour: '#9f7aea', colourblind: '#0072b2' }, // violet
        { colour: '#fc8181', colourblind: '#d55e00' }, // coral
        { colour: '#38b2ac', colourblind: '#009e73' }, // teal
        { colour: '#ecc94b', colourblind: '#e69f00' }, // gold
        { colour: '#f687b3', colourblind: '#cc79a7' }, // rose
        { colour: '#4fd1c5', colourblind: '#56b4e9' }, // mint
        { colour: '#b794f4', colourblind: '#0072b2' }, // lavender
        { colour: '#68d391', colourblind: '#009e73' }, // spring
        { colour: '#fbd38d', colourblind: '#e69f00' }, // sand
        { colour: '#90cdf4', colourblind: '#56b4e9' }, // sky
        { colour: '#feb2b2', colourblind: '#d55e00' }, // blush
        { colour: '#9ae6b4', colourblind: '#009e73' }  // seafoam
    ];

    // Runtime map for randomly generated colours → colourblind alternative.
    const generatedAlternatives = Object.create(null);

    /** View-only flag: does not affect saved/stored code colours. */
    let colourblindMode = false;

    function setColourblindMode(on) {
        colourblindMode = !!on;
        return colourblindMode;
    }

    function isColourblindMode() {
        return colourblindMode;
    }

    /**
     * Colour to show in the UI. Uses colourblind alternative when mode is on;
     * stored/saved colours always remain the normal primary.
     */
    function displayColour(hex) {
        const n = normalizeHex(hex);
        if (!colourblindMode) return n;
        return getColourblindAlternative(n);
    }

    function normalizeHex(colour) {
        if (typeof colour !== 'string') return DEFAULT_COLOUR;
        let h = colour.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(h)) return h;
        if (/^#[0-9a-f]{3}$/.test(h)) {
            return ('#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]);
        }
        // rgb(r,g,b) → hex when possible
        const m = h.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (m) {
            const toHex = n => {
                const v = Math.max(0, Math.min(255, parseInt(n, 10)));
                return v.toString(16).padStart(2, '0');
            };
            return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
        }
        return DEFAULT_COLOUR;
    }

    function getDefaultColour() {
        return DEFAULT_COLOUR;
    }

    function getDefaultPalette() {
        return DEFAULT_PALETTE.map(e => ({
            colour: e.colour,
            colourblind: e.colourblind
        }));
    }

    function usedSet(existingColours) {
        const set = Object.create(null);
        (existingColours || []).forEach(c => {
            set[normalizeHex(c)] = true;
        });
        return set;
    }

    function isColourUsed(hex, existingColours) {
        return !!usedSet(existingColours)[normalizeHex(hex)];
    }

    function hexToRgb(hex) {
        const h = normalizeHex(hex).slice(1);
        const num = parseInt(h, 16);
        if (isNaN(num)) return null;
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    function rgbToHex(r, g, b) {
        const toHex = n => {
            const v = Math.max(0, Math.min(255, Math.round(n)));
            return v.toString(16).padStart(2, '0');
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s = Math.max(0, Math.min(1, s));
        l = Math.max(0, Math.min(1, l));
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }

    function randomColourHex() {
        // Prefer mid-lightness saturated hues so highlights stay readable on white text.
        const h = Math.floor(Math.random() * 360);
        const s = 0.55 + Math.random() * 0.35;
        const l = 0.45 + Math.random() * 0.25;
        const rgb = hslToRgb(h, s, l);
        return rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    /**
     * Derive a colourblind-friendly alternative for an arbitrary colour
     * (used when the colour is not in the default palette).
     */
    function deriveColourblindAlternative(hex) {
        const rgb = hexToRgb(hex);
        if (!rgb) return DEFAULT_COLOUR;
        // Shift toward blue–yellow axis (reduce red/green confusion):
        // boost blue channel, average red/green toward luminance.
        const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        const r = Math.round(lum * 0.35 + rgb.b * 0.25 + 40);
        const g = Math.round(lum * 0.45 + rgb.b * 0.15 + 30);
        const b = Math.round(Math.min(255, rgb.b * 0.55 + lum * 0.35 + 50));
        let alt = rgbToHex(r, g, b);
        if (alt === normalizeHex(hex)) {
            alt = rgbToHex(rgb.b, rgb.r, rgb.g);
        }
        return alt;
    }

    function findPaletteEntry(hex) {
        const n = normalizeHex(hex);
        for (let i = 0; i < DEFAULT_PALETTE.length; i++) {
            if (DEFAULT_PALETTE[i].colour === n) return DEFAULT_PALETTE[i];
        }
        return null;
    }

    /**
     * Colourblind alternative for a primary colour.
     */
    function getColourblindAlternative(hex) {
        const n = normalizeHex(hex);
        const entry = findPaletteEntry(n);
        if (entry) return entry.colourblind;
        if (generatedAlternatives[n]) return generatedAlternatives[n];
        const alt = deriveColourblindAlternative(n);
        generatedAlternatives[n] = alt;
        return alt;
    }

    /**
     * Next primary colour for a new code.
     * Uses unused default-palette colours first (in order);
     * past that, generates a random colour not already in `existingColours`.
     * @param {string[]} existingColours - colours already used by codes
     * @returns {string} hex colour
     */
    function nextColour(existingColours) {
        return nextColourPair(existingColours).colour;
    }

    /**
     * Next colour pair { colour, colourblind }.
     */
    function nextColourPair(existingColours) {
        const used = usedSet(existingColours);

        for (let i = 0; i < DEFAULT_PALETTE.length; i++) {
            const entry = DEFAULT_PALETTE[i];
            if (!used[entry.colour]) {
                return { colour: entry.colour, colourblind: entry.colourblind };
            }
        }

        // Beyond default palette: random, never colliding with used primaries.
        for (let attempt = 0; attempt < 400; attempt++) {
            const colour = randomColourHex();
            if (used[colour]) continue;
            const colourblind = deriveColourblindAlternative(colour);
            generatedAlternatives[colour] = colourblind;
            return { colour: colour, colourblind: colourblind };
        }

        // Extremely unlikely exhaustion fallback.
        const colour = randomColourHex();
        const colourblind = deriveColourblindAlternative(colour);
        generatedAlternatives[colour] = colourblind;
        return { colour: colour, colourblind: colourblind };
    }

    /**
     * Average several hex colours (legacy / fallback).
     */
    function blendColours(colours) {
        let r = 0, g = 0, b = 0, count = 0;
        (colours || []).forEach(hex => {
            const rgb = hexToRgb(hex);
            if (rgb) {
                r += rgb.r; g += rgb.g; b += rgb.b; count += 1;
            }
        });
        if (count === 0) return DEFAULT_COLOUR;
        return rgbToHex(r / count, g / count, b / count);
    }

    function rgbaFromHex(hex, alpha) {
        const rgb = hexToRgb(hex);
        const a = Math.max(0, Math.min(1, Number(alpha)));
        if (!rgb || isNaN(a)) return 'rgba(255, 224, 102, ' + (isNaN(a) ? 1 : a) + ')';
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + a + ')';
    }

    /**
     * CSS background-image value: repeating diagonal stripes of each colour.
     * Preserves exact code colours on multi-code highlights.
     * @param {string[]} colours
     * @param {number} [bandPx=6]
     * @param {number} [alpha=1] - 0–1 opacity for each stripe colour
     * @returns {string} solid colour (1 colour) or repeating-linear-gradient(...)
     */
    function stripeBackground(colours, bandPx, alpha) {
        const list = [];
        const seen = Object.create(null);
        (colours || []).forEach(hex => {
            const n = normalizeHex(hex);
            if (seen[n]) return;
            seen[n] = true;
            list.push(n);
        });
        if (list.length === 0) return DEFAULT_COLOUR;
        const a = alpha == null || alpha === 1 ? 1 : Math.max(0, Math.min(1, Number(alpha)));
        const paint = (hex) => (a >= 1 ? hex : rgbaFromHex(hex, a));
        if (list.length === 1) return paint(list[0]);

        const band = Math.max(3, Math.round(bandPx || 6));
        const stops = [];
        list.forEach((c, i) => {
            const start = i * band;
            const end = (i + 1) * band;
            const col = paint(c);
            stops.push(col + ' ' + start + 'px', col + ' ' + end + 'px');
        });
        return 'repeating-linear-gradient(45deg, ' + stops.join(', ') + ')';
    }

    global.QualiCottyPalette = {
        DEFAULT_COLOUR: DEFAULT_COLOUR,
        getDefaultColour: getDefaultColour,
        getDefaultPalette: getDefaultPalette,
        normalizeHex: normalizeHex,
        nextColour: nextColour,
        nextColourPair: nextColourPair,
        getColourblindAlternative: getColourblindAlternative,
        setColourblindMode: setColourblindMode,
        isColourblindMode: isColourblindMode,
        displayColour: displayColour,
        isColourUsed: isColourUsed,
        blendColours: blendColours,
        stripeBackground: stripeBackground,
        hexToRgb: hexToRgb
    };
})(window);
