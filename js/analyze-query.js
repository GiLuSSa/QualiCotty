/* QualiCotty — Analyze custom query language
 * code: / text: / doctype: / persons: / keywords: / indoc:
 * with and/or/not and parentheses.
 * Exposes window.QualiCottyAnalyzeQuery.
 */
(function (global) {
    'use strict';

    function QueryError(message, index) {
        this.name = 'QueryError';
        this.message = message;
        this.index = typeof index === 'number' ? index : 0;
    }
    QueryError.prototype = Object.create(Error.prototype);
    QueryError.prototype.constructor = QueryError;

    function normalizeKey(s) {
        return String(s == null ? '' : s).trim().toLowerCase();
    }

    function containsCI(haystack, needle) {
        return normalizeKey(haystack).indexOf(normalizeKey(needle)) !== -1;
    }

    /* ---- Tokenizer ---- */

    function tokenize(input) {
        const src = String(input == null ? '' : input);
        const tokens = [];
        let i = 0;

        function peek() { return src[i]; }
        function advance() { return src[i++]; }

        while (i < src.length) {
            const ch = peek();
            if (/\s/.test(ch)) {
                i += 1;
                continue;
            }

            if (ch === '(' || ch === ')' || ch === ',') {
                tokens.push({ type: ch, index: i });
                i += 1;
                continue;
            }

            if (ch === '"' || ch === "'") {
                const quote = ch;
                const start = i;
                i += 1;
                let value = '';
                let closed = false;
                while (i < src.length) {
                    const c = advance();
                    if (c === '\\' && i < src.length) {
                        value += advance();
                        continue;
                    }
                    if (c === quote) {
                        closed = true;
                        break;
                    }
                    value += c;
                }
                if (!closed) {
                    throw new QueryError('Unterminated string.', start);
                }
                tokens.push({ type: 'STRING', value: value, index: start });
                continue;
            }

            // Keyword or typed prefix: code: text: doctype: persons: keywords: indoc:
            if (/[A-Za-z_]/.test(ch)) {
                const start = i;
                let word = '';
                while (i < src.length && /[A-Za-z_]/.test(peek())) {
                    word += advance();
                }
                const lower = word.toLowerCase();

                if (peek() === ':') {
                    i += 1; // consume ':'
                    if (lower === 'code' || lower === 'text' || lower === 'indoc' ||
                        lower === 'doctype' || lower === 'persons' || lower === 'keywords') {
                        tokens.push({ type: 'PREFIX', value: lower, index: start });
                        continue;
                    }
                    throw new QueryError(
                        'Unknown prefix “' + word + ':”. Use code:, text:, doctype:, persons:, keywords:, or indoc:.',
                        start
                    );
                }

                if (lower === 'and' || lower === 'or' || lower === 'not') {
                    tokens.push({ type: lower.toUpperCase(), index: start });
                    continue;
                }

                throw new QueryError(
                    'Unexpected word “' + word + '”. Use quoted names, code:/text:/doctype:/persons:/keywords:/indoc:, and/or/not.',
                    start
                );
            }

            throw new QueryError('Unexpected character “' + ch + '”.', i);
        }

        tokens.push({ type: 'EOF', index: src.length });
        return tokens;
    }

    /* ---- Parser ---- */

    function parseTokens(tokens) {
        let pos = 0;

        function current() { return tokens[pos]; }
        function match(type) {
            if (current().type === type) {
                pos += 1;
                return true;
            }
            return false;
        }
        function expect(type, label) {
            if (current().type === type) {
                const t = current();
                pos += 1;
                return t;
            }
            throw new QueryError(
                'Expected ' + (label || type) + '.',
                current().index
            );
        }

        function parseExpr() {
            return parseOr();
        }

        function parseOr() {
            let left = parseAnd();
            while (match('OR')) {
                left = { type: 'Or', left: left, right: parseAnd() };
            }
            return left;
        }

        function parseAnd() {
            let left = parseUnary();
            while (match('AND')) {
                left = { type: 'And', left: left, right: parseUnary() };
            }
            return left;
        }

        function parseUnary() {
            if (match('NOT')) {
                return { type: 'Not', arg: parseUnary() };
            }
            return parsePrimary();
        }

        function parseScopedBool(kind) {
            // Same and/or/not structure; STRING → kind predicate
            function scopedOr() {
                let left = scopedAnd();
                while (match('OR')) {
                    left = { type: 'Or', left: left, right: scopedAnd() };
                }
                return left;
            }
            function scopedAnd() {
                let left = scopedUnary();
                while (match('AND')) {
                    left = { type: 'And', left: left, right: scopedUnary() };
                }
                return left;
            }
            function scopedUnary() {
                if (match('NOT')) {
                    return { type: 'Not', arg: scopedUnary() };
                }
                return scopedPrimary();
            }
            function scopedPrimary() {
                if (match('(')) {
                    const inner = scopedOr();
                    expect(')', '“)”');
                    return inner;
                }
                const str = expect('STRING', 'a quoted string');
                if (kind === 'code') return { type: 'Code', name: str.value };
                if (kind === 'text') return { type: 'Text', value: str.value };
                if (kind === 'doctype' || kind === 'persons' || kind === 'keywords') {
                    return { type: 'Field', field: kind, value: str.value };
                }
                throw new QueryError('Internal: bad scoped kind.', str.index);
            }
            return scopedOr();
        }

        function parseIndocList() {
            const positives = [];
            const negatives = [];

            function parseItem() {
                let negated = false;
                if (match('NOT')) negated = true;
                const str = expect('STRING', 'a quoted document name');
                if (negated) negatives.push(str.value);
                else positives.push(str.value);
            }

            parseItem();
            while (match(',')) {
                parseItem();
            }

            // (doc:p1 or doc:p2 or …) and not doc:n1 and not doc:n2 …
            let node = null;
            positives.forEach(name => {
                const d = { type: 'Doc', value: name, via: 'indoc' };
                node = node ? { type: 'Or', left: node, right: d } : d;
            });
            negatives.forEach(name => {
                const d = { type: 'Not', arg: { type: 'Doc', value: name, via: 'indoc' } };
                node = node ? { type: 'And', left: node, right: d } : d;
            });

            if (!node) {
                throw new QueryError('indoc: list cannot be empty.', current().index);
            }
            return node;
        }

        function parsePrimary() {
            const t = current();

            if (t.type === 'STRING') {
                pos += 1;
                return { type: 'Code', name: t.value };
            }

            if (t.type === 'PREFIX') {
                pos += 1;
                const kind = t.value;

                if (kind === 'indoc') {
                    // indoc:"doc 1"  or  indoc:("doc1", "doc2", not "doc3")
                    if (current().type === '(') {
                        pos += 1;
                        const node = parseIndocList();
                        expect(')', '“)”');
                        return node;
                    }
                    const str = expect('STRING', 'a quoted document name after indoc:');
                    return { type: 'Doc', value: str.value, via: 'indoc' };
                }

                // code: / text: / doctype: / persons: / keywords:
                if (current().type === '(') {
                    pos += 1;
                    const inner = parseScopedBool(kind);
                    expect(')', '“)”');
                    return inner;
                }
                const str = expect('STRING', 'a quoted string after ' + kind + ':');
                if (kind === 'code') return { type: 'Code', name: str.value };
                if (kind === 'text') return { type: 'Text', value: str.value };
                return { type: 'Field', field: kind, value: str.value };
            }

            if (match('(')) {
                const inner = parseExpr();
                expect(')', '“)”');
                return inner;
            }

            throw new QueryError(
                'Expected a predicate (code:/text:/doctype:/persons:/keywords:/indoc: or a quoted code name).',
                t.index
            );
        }

        if (tokens.length === 1 && tokens[0].type === 'EOF') {
            return null;
        }

        const ast = parseExpr();
        if (current().type !== 'EOF') {
            throw new QueryError('Unexpected input after expression.', current().index);
        }
        return ast;
    }

    function collectIndocTerms(ast, positives, negatives) {
        if (!ast) return;
        switch (ast.type) {
            case 'And':
            case 'Or':
                collectIndocTerms(ast.left, positives, negatives);
                collectIndocTerms(ast.right, positives, negatives);
                break;
            case 'Not':
                if (ast.arg && ast.arg.type === 'Doc' && ast.arg.via === 'indoc') {
                    negatives.push(ast.arg.value);
                } else {
                    collectIndocTerms(ast.arg, positives, negatives);
                }
                break;
            case 'Doc':
                if (ast.via === 'indoc') positives.push(ast.value);
                break;
            default:
                break;
        }
    }

    function hasIndoc(ast) {
        if (!ast) return false;
        if (ast.type === 'Doc') return ast.via === 'indoc';
        if (ast.type === 'Not') return hasIndoc(ast.arg);
        if (ast.type === 'And' || ast.type === 'Or') {
            return hasIndoc(ast.left) || hasIndoc(ast.right);
        }
        return false;
    }

    /**
     * Human-readable indoc: terms from an AST, or null if no indoc: was used.
     * e.g. '"doc1", "doc2", not "doc3"'
     */
    function formatIndocScope(ast) {
        if (!hasIndoc(ast)) return null;
        const positives = [];
        const negatives = [];
        collectIndocTerms(ast, positives, negatives);
        const parts = [];
        positives.forEach(name => {
            parts.push('"' + String(name).replace(/"/g, '\\"') + '"');
        });
        negatives.forEach(name => {
            parts.push('not "' + String(name).replace(/"/g, '\\"') + '"');
        });
        return parts.length ? parts.join(', ') : null;
    }

    /* ---- Validate known codes ---- */

    function collectCodeNames(ast, out) {
        if (!ast) return;
        switch (ast.type) {
            case 'And':
            case 'Or':
                collectCodeNames(ast.left, out);
                collectCodeNames(ast.right, out);
                break;
            case 'Not':
                collectCodeNames(ast.arg, out);
                break;
            case 'Code':
                out.push(ast.name);
                break;
            default:
                break;
        }
    }

    function validateCodes(ast, knownCodeNames) {
        if (!ast || !knownCodeNames) return;
        const known = new Set(
            Array.from(knownCodeNames).map(normalizeKey)
        );
        const used = [];
        collectCodeNames(ast, used);
        for (let i = 0; i < used.length; i++) {
            const name = used[i];
            if (!known.has(normalizeKey(name))) {
                throw new QueryError('Unknown code “' + name + '”.', 0);
            }
        }
    }

    /* ---- Evaluate ---- */

    function evaluate(ast, ctx) {
        if (!ast) return false;
        switch (ast.type) {
            case 'And':
                return evaluate(ast.left, ctx) && evaluate(ast.right, ctx);
            case 'Or':
                return evaluate(ast.left, ctx) || evaluate(ast.right, ctx);
            case 'Not':
                return !evaluate(ast.arg, ctx);
            case 'Code': {
                const want = normalizeKey(ast.name);
                const names = ctx.codeNames || [];
                for (let i = 0; i < names.length; i++) {
                    if (normalizeKey(names[i]) === want) return true;
                }
                return false;
            }
            case 'Text':
                return containsCI(ctx.text || '', ast.value);
            case 'Doc':
                return containsCI(ctx.docName || '', ast.value);
            case 'Field': {
                const fields = ctx.fields || {};
                return containsCI(fields[ast.field] || '', ast.value);
            }
            default:
                return false;
        }
    }

    /**
     * Parse and optionally validate.
     * @returns {{ ok: true, ast: object|null } | { ok: false, error: string, index: number }}
     */
    function compile(query, options) {
        const opts = options || {};
        const trimmed = String(query == null ? '' : query).trim();
        if (!trimmed) {
            return { ok: true, ast: null, empty: true };
        }
        try {
            const tokens = tokenize(trimmed);
            const ast = parseTokens(tokens);
            if (opts.knownCodeNames) {
                validateCodes(ast, opts.knownCodeNames);
            }
            return { ok: true, ast: ast, empty: false };
        } catch (err) {
            return {
                ok: false,
                error: err && err.message ? err.message : String(err),
                index: err && typeof err.index === 'number' ? err.index : 0
            };
        }
    }

    function matches(query, ctx, options) {
        const compiled = compile(query, options);
        if (!compiled.ok) return { ok: false, error: compiled.error, match: false };
        if (compiled.empty || !compiled.ast) return { ok: true, match: false, empty: true };
        return { ok: true, match: evaluate(compiled.ast, ctx) };
    }

    global.QualiCottyAnalyzeQuery = {
        compile: compile,
        evaluate: evaluate,
        matches: matches,
        hasIndoc: hasIndoc,
        formatIndocScope: formatIndocScope,
        QueryError: QueryError
    };
})(window);
