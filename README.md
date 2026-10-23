# Syntxd

A client-side viewer and formatter for structured data — JSON today, CSV/YAML/XML on the roadmap. Paste JSON, format or minify it, and quickly search and explore an interactive tree — everything runs locally in your browser with no backend and no data leaving the page.

## Features

- **Paste & auto-parse** — debounced, live validation with line/column error messages
- **Format / Minify** — pretty-print (2-space indent) or collapse to a single line
- **Interactive tree** — collapsible nodes, type-aware syntax coloring, expand/collapse all
- **Search** — case-insensitive matching across keys *and* values with match highlighting, a live match counter, and ↑/↓ navigation that auto-expands to each hit
- **JSONPath & filters** — query the document with JSONPath (member/index/wildcard/slice/union/recursive descent) and filter expressions (`[?(@.price > 20)]`); results are listed and highlighted in the tree
- **Dashboards** — build panels from your JSON (table, stat, time series, bar chart, timeline), Grafana-Infinity style; export/import dashboard configs as JSON
- **Copy** — copy the formatted JSON to your clipboard
- **Local cache** — your input and dashboard are saved in this browser and restored next visit; **Clear local data** wipes them
- **Responsive** — side-by-side panes on wide screens, stacked on narrow ones; light and dark themes

## Getting started

Requires the Node version pinned in [`.tool-versions`](.tool-versions) (install via `mise install` or `asdf install`).

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server with HMR |
| `npm run build` | Typecheck (`tsc -b`) and build the static site to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint |
| `npm run test` | Run Vitest unit tests |

## Deployment

`npm run build` emits a fully static site in `dist/`. Asset paths are relative (`base: './'`), so the build can be hosted from any path — GitHub Pages, S3, Netlify, or a plain file server — without additional configuration.

### Self-hosting

Every GitHub release includes `syntxd-<version>.tar.gz` and `syntxd-<version>.zip`, each containing the built static site (unpacked contents of `dist/`). Download either archive, extract it, and serve the directory from any static file host — nginx, Apache, S3, Netlify, caddy, etc. No build step or runtime is required.

### GitHub Pages (automated)

The [release workflow](.github/workflows/release.yaml) builds the site and publishes it to GitHub Pages after every successful release (i.e. every merge to `main`). To enable it, do this once:

1. Repo **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
2. Merge to `main` (or run the workflow manually); the site appears at `https://<owner>.github.io/<repo>/`.

## Querying

Switch the toolbar to **JSONPath** to run structured queries. Supported syntax:

```
$                      root
$.a.b                  dot member access
$['a']['b']            bracket member access
$[0]  $[-1]            array index (negative counts from the end)
$[*]  $.*              wildcard
$[0,2,'name']          union of indices and names
$[1:3]  $[::2]         array slices (Python-style, negatives supported)
$..price               recursive descent (also bare `..` and `..*`)
$[?(@.price > 20)]     filter selectors
```

Filter expressions support `@` (current node) and `$` (root) paths, comparison
(`== != < <= > >=`), regex `=~ /pattern/flags`, and boolean `&& || !` with
parentheses. `==`/`!=` are strict deep-equality (no type coercion). A bare
`@.prop` condition is truthy unless missing, `null`, or `false`. The engine is a
dependency-free, no-`eval` implementation in
[`src/lib/jsonpath.ts`](src/lib/jsonpath.ts).

## Dashboards

Switch the header to **Dashboard** to build a grid of panels over the current input — similar to Grafana's Infinity data source, but entirely client-side. Each panel is:

1. **Rows** — a JSONPath query selecting the rows (e.g. `$.metrics`, `$..events[?(@.level == 'error')]`). Empty uses the whole document, or its items when it's an array. A query returning a single array is unwrapped into its items.
2. **Columns** — optional per-row selectors (`user.name`, `tags[0]`, `['odd key']`) with an alias and type (`string`, `number`, `time`, `boolean`, or `auto`). Leave empty to auto-detect: keys are unioned across rows and nested objects flattened (`latency.p95`).
3. **Visualization** — field mappings default to *auto* and can be overridden:

| Visualization | Uses |
| --- | --- |
| Table | every column; click headers to sort |
| Stat | one or more numeric fields reduced by `last`/`first`/`sum`/`mean`/`min`/`max`/`count` |
| Time series | a time field + one or more numeric fields (one shared axis, up to 8 series) |
| Bar chart | a category field + a numeric field, aggregated per category |
| Timeline | a start time, optional end time (bars vs. instant markers), and a lane field |

Time values may be ISO-8601 strings or epoch seconds/milliseconds; with `auto`, epoch numbers are treated as time only when the field name looks like one (`time`, `timestamp`, `created_at`, `startedAt`, …). Times render in the browser's local timezone.

From **Explore → JSONPath**, **Visualize** turns the current query into a new panel. **Load example** fills in sample data and a dashboard that uses every visualization.

Dashboards are cached in your browser along with the input (see [Local data](#local-data)). To move one to another browser or share it, use **Export** to download the config as `*.dashboard.json` and **Import** to load it again.

## Local data

Your JSON input, dashboard, and current view (Explore or Dashboard) are saved to this browser's `localStorage` as you work, and restored the next time you open Syntxd. Nothing is sent to a server.

- The header shows the save status. Very large inputs can exceed the browser's storage quota (usually around 5 MB). When that happens the dashboard is still saved, but the input isn't.
- **Clear local data** (click twice to confirm) deletes everything Syntxd stored and resets the app to the sample.
- If storage is blocked (some private-browsing modes, disabled site data), the app still works; it just won't remember anything.
- Open tabs don't sync with each other. If two tabs are open, whichever saves last wins.

## How it works

- **State** lives in React component state; [`src/lib/storage.ts`](src/lib/storage.ts) caches the input, dashboard, and view in `localStorage` (debounced) and restores them on load.
- **Parsing & search logic** is pure and lives in [`src/lib/json.ts`](src/lib/json.ts): the JSON value is walked once to produce a renderable tree plus an ordered list of search matches (keys and primitive values, never array indices).
- **JSONPath** ([`src/lib/jsonpath.ts`](src/lib/jsonpath.ts)) is a hand-rolled parser + evaluator (tokenizer → AST → evaluation, no `eval`).
- **Dashboards** are pure data shaping plus thin SVG components: [`src/lib/frame.ts`](src/lib/frame.ts) turns a document + query into a typed data frame, [`src/lib/dashboard.ts`](src/lib/dashboard.ts) holds the panel model, auto field mapping, and import/export, and [`src/lib/scale.ts`](src/lib/scale.ts) computes axis ticks and labels. Charts in [`src/components/dashboard/`](src/components/dashboard/) are dependency-free SVG.
- **Rendering** is a recursive component ([`src/components/JsonTreeNode.tsx`](src/components/JsonTreeNode.tsx)) that highlights matches and auto-expands ancestors when you navigate between hits.

## Testing

```bash
npm run test
```

Unit tests cover parsing (including error location), formatting, the tree/search builder in [`src/lib/json.test.ts`](src/lib/json.test.ts), the JSONPath engine in [`src/lib/jsonpath.test.ts`](src/lib/jsonpath.test.ts), and the dashboard data layer in [`src/lib/frame.test.ts`](src/lib/frame.test.ts), [`src/lib/dashboard.test.ts`](src/lib/dashboard.test.ts), [`src/lib/scale.test.ts`](src/lib/scale.test.ts), and the local cache in [`src/lib/storage.test.ts`](src/lib/storage.test.ts).

## License

[MIT](LICENSE)