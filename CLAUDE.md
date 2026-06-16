# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WriteFlow POC — a Microsoft Word add-in (Office.js / TypeScript) that measures whether writing production can be tracked reliably inside Word. It answers a GO/NO-GO question, so correctness of measurement matters more than features. It is a deliberately throwaway testbed: no production auth/db beyond Supabase sync, no real dashboards.

## Commands

- `npm start` — generate HTTPS certs, build, and sideload the add-in into Word (local dev).
- `npm stop` — unload the sideloaded add-in.
- `npm run dev-server` — webpack dev server on `https://localhost:3000` (needs local HTTPS certs).
- `npm run build` / `npm run build:dev` — production / dev webpack build to `dist/`.
- `npm run typecheck` — `tsc --noEmit`. This is the main correctness check; run it after edits.
- `npm run lint` — ESLint (flat config, `eslint.config.js`). `npm run lint:fix` auto-fixes. Run after edits.
- `npm run validate` — validate `manifest.xml` against the Office add-in schema.

There is no formatter or unit-test runner. Testing is manual: run the add-in, export CSV/JSON from the task pane, and compare against hand-recorded ground truth.

## Deploy

Push to `main` auto-deploys via GitHub Actions (`.github/workflows/deploy.yml`): `npm ci` → build → generate the cloud manifest → deploy `dist/` to GitHub Pages. There is no separate release step.

## Gotchas

- **Two manifests, two GUIDs.** `manifest.xml` (local dev, points to localhost:3000) and `manifest.github.xml` (cloud, GitHub Pages). Different GUIDs let both install in parallel — never copy a GUID between them.
- **French UI.** All UI strings, comments, and console logs are in French (fr-FR). Match this when adding user-facing text.
- **Separate localStorage per host.** Localhost and GitHub Pages don't share data; expect different stats when testing in each.
- **Document identity** is a GUID stored in Word's settings (survives moves/OneDrive sync). Clearing it generates a new one.
- **Supabase creds in `src/supabase/config.ts` are public** (URL + anon key, protected by RLS) — not secrets. Supabase sync is optional; the add-in works local-only.

## Measurement engine

- Core code lives in `src/tracking/`. Tunable thresholds are `DEFAULT_CONFIG` in `src/tracking/types.ts` — the POC exists to validate these empirically, so don't treat them as final.
- The tracker runs **three classification models in parallel** for comparison: VITESSE (speed), EVENEMENT (per-event volume), COMBINE (volume + temporal isolation). Each event logs all three plus cumulative counters so models can be compared against ground truth.
- Measurement is hybrid: 30s polling of `body.text` plus WordApi 1.5 paragraph/selection events when the platform supports them (polling-only fallback otherwise). Baseline is WordApi 1.3.
- Paste detection is heuristic (Office.js has no native paste event); expect false positives/negatives. `body.text` excludes footnotes, headers/footers, and text boxes.
