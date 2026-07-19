# QualiCotty

**QualiCotty** is a lightweight qualitative content analysis (QCA) tool that runs entirely in the browser. It helps researchers import transcripts and texts, build a codebook, code passages, filter and query coded material, and export results — without a server, account, or network round-trip for analysis data.

Current version: **0.02a**

---

## Overview

QualiCotty is designed for desktop browser use in qualitative research workflows:

- Import plain text, HTML transcripts (including noScribe-style exports), and WebVTT files
- Maintain a project codebook with named codes, colours, and descriptions
- Code selections in documents and review segments in context
- Analyse coded material with and/or filters, free-text filters, custom queries, isolation, and cross-document merge
- Save and reload projects as `.cotty` files; share codebooks as `.cottybook`
- Export the current Analyse view as CSV or PDF

Everything needed to run the application is static: download the repository and open `index.html` in a modern browser or go to https://gilussa.github.io/QualiCotty/

---

## Privacy and local storage

QualiCotty does **not** upload your documents, codes, or segments to any remote service for analysis. Work stays on the machine that runs the browser.

Project state is also persisted continuously in the browser’s **local storage**. Sensitive material may therefore remain in that browser profile after you close the page. On a shared or untrusted computer, clear the workspace when you finish: open the project name in the ribbon, then choose **New / Delete**.

Prefer exporting a `.cotty` file to a secure location if you need a durable backup under your own control.

---

## Getting started

1. Open `index.html` or https://gilussa.github.io/QualiCotty/ in a current desktop browser (Chrome, Edge, Firefox, or Safari).
2. Set the **project name**, description, and user name via the project button in the ribbon (used in exports and saved files).
3. Drag and drop one or more documents onto the window, or drop a `.cotty` / `.cottybook` file.
4. Create or adjust codes in the right-hand panel and via **Codebook**.
5. In **Code** mode, select text and apply codes; then use **Analyze** to filter, query, and export.

---

## Working with documents

### Supported imports

| Format | Behaviour |
|--------|-----------|
| `.txt` | Stored as plain text |
| `.html` / `.htm` | Converted to plain text (tags stripped; structure preserved as newlines where appropriate) |
| `.vtt` | Cues imported as `[start] text` lines |
| `.cotty` | Loads a full project (replaces the current project after confirmation) |
| `.cottybook` | Merges codebook entries into the current project |

Document list entries can be renamed, described, given a colour, and annotated with metadata via right-click (**Document properties**):

- **Document type** — e.g. `interview`, `focus group`.
- **Persons** — people referenced by the document.
- **Keywords** — free descriptors for the document.

Persons and Keywords are lists written comma-separated (a following space is optional), for example `cat, dog, mr pidgeon` or `cat,dog,mr pidgeon`. These fields are searchable in the custom query (`doctype:`, `persons:`, `keywords:`).

WARNING! Document properties are not printed directly. However, metadata such as **Persons** may appear in query strings within exported .pdf and .csv files. Furthermore, these data points are stored unencrypted within the .cotty project file. Ensure you anonymize or pseudonymize participant data as appropriate, and maintain the master cross-reference sheet outside of QualiCotty.

---

## Coding

1. Select **Code** in the ribbon.
2. Choose the active code in the right column.
3. Select a span of text in the document and press **Enter** to apply the active code.
3b. Or select a span and press `1`–`9` and `0` to apply the first ten codes without active the code button.
4. Double-click a highlight to open **Segment properties** (codes, comment, delete).

Use **Codebook** to rename codes, change colours, edit descriptions, reorder, delete/reassign, and import or export a `.cottybook`. An optional colourblind display mode remaps colours on screen only; saved colours remain unchanged.

N.B. The text color is #222222, so you can "censor" text by coding it with this color. Remember that this will work only if the document is printed on paper; otherwise, it will always be possible to copy and paste it!

---

## Analyse mode

Select **Analyze** to filter and explore coded passages.

### and / or

- Select one or more codes in the tag grid.
- **and** — passages that carry all selected codes (intersection logic on overlapping ranges).
- **or** — passages that carry at least one selected code.
- type plain text in the textbox to keep only passages that also contain that string (case-insensitive), as if combined with `and text:"…"`. The plain-text filter is shared between **and** and **or**.

### Custom query (`|`)

The `|` mode enables a boolean query language. The query string is stored separately from the and/or text filter.

Examples:

```text
code:"Paws" and text:"policy"
code:("Paws" or "Mouse") and not text:"maybe"
doctype:"interview" and code:"Paws"
persons:("cat" or "mr pidgeon") and keywords:"mobility"
indoc:"Interview Dr Kitty" and code:"Paws"
indoc:("Interview Dr Kitty", "Interview Mr Fur", not "Focus Group Kittens") and code:"Paws"
```

| Construct | Meaning |
|-----------|---------|
| `code:"Name"` | Segment has that code |
| `code:(…)` | Boolean combination of code names (`and` / `or` / `not`) |
| `text:"…"` / `text:(…)` | Segment text contains the string(s) |
| `doctype:"…"` / `doctype:(…)` | Document type field contains the string(s) |
| `persons:"…"` / `persons:(…)` | Document persons field contains the string(s) |
| `keywords:"…"` / `keywords:(…)` | Document keywords field contains the string(s) |
| `indoc:"…"` / `indoc:(…)` | Restrict to named documents (list form: positives are OR; `not "…"` excludes) |
| Bare `"Name"` | Shorthand for `code:"Name"` |

The `doctype:`, `persons:`, and `keywords:` predicates match against the corresponding **Document properties** fields (case-insensitive substring). The previous simple `doc:` key has been removed; use `indoc:` to restrict by document name.

Operators: `and`, `or`, `not`, and parentheses. Matching is case-insensitive. Empty `|` queries show no segments.

### Isolate and merge

- **Isolate** — show matching passages with omitted context between them.
- **Merge** — with isolate, combine matching passages across all documents in one view.

### Export

From Analyse, use **↓.csv** and **↓.pdf** to export the current visible results. Exports include metadata (time, author, code/query filter, and document search scope), segment rows (CSV) or formatted pages (PDF), and the codebook.

---

## Projects and files

| Action | How |
|--------|-----|
| Save project | Project properties → **Save** (downloads a `.cotty` JSON file) |
| Load project | Project properties → **Load**, or drag and drop a `.cotty` file |
| New / clear | Project properties → **New / Delete** (clears the in-browser project) |
| Export codebook | Codebook → **Export codebook** (`.cottybook`) |
| Import codebook | Codebook → **Import codebook**, or drop a `.cottybook` |

View navigation (**wb** / **wf**, or Ctrl+Alt+Z / Ctrl+Alt+Y) steps through recent Analyse/Code view states.

Click **QualiCotty** in the ribbon for the in-app About panel; the cat icon is decorative.

---

## Technical notes

- No build step is required for use: static HTML, CSS, and JavaScript.
- The application version is defined once in `js/version.js`.
- Colour handling is centralised in `js/palette.js`.

---

## Credits

**Giulia Arena**  
[giulia.arena@cchs.csic.es](mailto:giulia.arena@cchs.csic.es)

**Giulio Lucio Sergio Sacco** - GiLuSSa  
[giulioluciosergio.sacco@edu.unige.it](mailto:giulioluciosergio.sacco@edu.unige.it)
