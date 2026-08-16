## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Development

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server (default: http://localhost:5173)
- `npm run build` — typecheck and build a production bundle to `dist/` (includes the PWA manifest and service worker)
- `npm run preview` — serve the production build locally
- `npm run lint` — run oxlint
- `npm run test` — run the Vitest suite once (non-watch)
