# AGENTS.md

Operational expectations for humans and AI agents working in this repository.

## Purpose

**Syntxd** is a client-side viewer and formatter for structured data (JSON today; CSV/YAML/XML on the roadmap). Everything runs in the browser: paste JSON, format/minify it, and browse/search an interactive tree. No backend, no data leaves the page; the session is cached only in the browser's localStorage.

## Tech stack

- **React 19** + **Vite 8** + **TypeScript** (SPA, static build)
- **Vitest** for unit tests
- **oxlint** for linting
- **Renovate** (managers: `npm`, `asdf`, `github-actions`) + **GitHub Actions** for CI/release
- **MIT License**

## Structure

```
.
├── .github/workflows/        # CI, Renovate, and label-driven SemVer releases
├── public/                   # Static assets (favicon)
├── src/
│   ├── components/           # React components (JsonTreeNode, dashboard/ SVG panels + editor)
│   ├── lib/                  # Pure logic (json, jsonpath, frame, dashboard, scale) — unit-tested
│   ├── App.tsx               # App shell, state, layout
│   ├── main.tsx              # Entry point
│   └── index.css             # Theme + layout styles
├── .tool-versions            # Single source of truth for tool versions (mise/asdf)
├── renovate.json             # Renovate settings
└── vite.config.ts            # Vite + Vitest config
```

## Commands

Check `.tool-versions` and use those versions (install via `mise install`).

```bash
npm install        # install dependencies
npm run dev        # start dev server (HMR)
npm run lint       # oxlint
npm run test       # Vitest (single run)
npm run test:watch # Vitest (watch)
npm run build      # typecheck (tsc -b) + production build to dist/
npm run preview    # serve the production build locally
```

## Conventions

- `.tool-versions` is the single source of truth for language/tool versions. Pin a new tool there **before** using it; never assume a globally installed version.
- Keep pure logic (JSON parsing, tree building, search, formatting, JSONPath querying, data frames, chart data shaping, axis ticks) in `src/lib/` with unit tests; keep React components presentational and thin.
- **Persistence is local-only and deliberate**: the input, dashboard, and current view are cached in `localStorage` via `src/lib/storage.ts` (keys `syntxd:v1:*`), and users can wipe them with **Clear local data**. Don't add cookies, other storage, or anything that sends data off-device without an explicit decision. Any new persisted key must be added to `STORAGE_KEYS` so clearing removes it, and storage access must tolerate being unavailable (private mode, blocked site data). Bump the `v1` prefix only with a migration plan.
- Charts are hand-rolled SVG (no charting dependency). Series colors come from the `--series-1..8` tokens in `index.css`, assigned in fixed order and never cycled.
- Versioning follows [SemVer](https://semver.org/) as bare `X.Y.Z` (no `v` prefix). The release workflow derives bumps from PR labels (`major`/`minor`/`patch`, default `patch`).
- Branch protection: never push directly to `main`; all changes go through PRs with review.
- Match existing code style; `npm run lint` and `npm test` must pass before requesting review.

## Testing

Unit tests live next to the code they cover (`src/lib/*.test.ts`). Run `npm run test`. Add tests for any new pure logic (parsing, formatting, search, JSONPath, frames, dashboard mapping) and keep them deterministic — no browser/network access.