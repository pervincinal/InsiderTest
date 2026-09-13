# Deploying Tower Clash to GitHub Pages

The web build is published by `.github/workflows/tower-clash-pages.yml` (MM-5 / M4-1).

## One manual step (once per repository)

GitHub only lets a workflow publish to Pages after the source is switched to Actions:

1. Open the repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not "Deploy from a branch").
3. Save. No branch, folder, or token needs to be configured; the workflow uses the built-in
   `GITHUB_TOKEN` with `pages: write` + `id-token: write` on the `github-pages` environment.

If the environment is protected, add the working branch `claude/tower-war-game-plan-weqwpb`
(and `main`) to the environment's allowed deployment branches, otherwise the `deploy` job is rejected.

## What triggers a deploy

- A push to `claude/tower-war-game-plan-weqwpb` or `main` that touches `tower-clash/**`.
- Manually: **Actions → tower-clash-pages → Run workflow**.

The `build` job runs `npm ci && npm run build` (typecheck + Vite production build) and uploads
`tower-clash/dist` with `actions/upload-pages-artifact@v3`; the `deploy` job publishes it with
`actions/deploy-pages@v4`. Deploys are serialised by the `pages` concurrency group.

## Resulting URL

    https://pervincinal.github.io/InsiderTest/

The game is served from the `/InsiderTest/` sub-path. This works without any configuration because:

- `vite.config.ts` sets `base: './'`, so `dist/index.html` references `./assets/…`.
- `public/manifest.webmanifest` uses `"start_url": "./"` and `"scope": "./"`.
- `src/main.ts` registers the service worker as `./sw.js`, and `public/sw.js` precaches relative
  `./…` paths and derives the runtime asset prefix from `self.registration.scope`.

A local check of the sub-path build: `cd tower-clash && npm run build`, serve `dist/` under a prefix
(for example `npx serve -l 4173` with the folder renamed, or the script in `e2e/`), open
`http://localhost:4173/InsiderTest/` and confirm the title screen renders and `sw.js` registers with
scope `/InsiderTest/`.

## Verifying a deploy

1. Wait for the `tower-clash-pages` run to go green; the `deploy` job prints the page URL.
2. Open the URL on a phone: the title screen must render, "Add to Home Screen" must offer the
   Tower Clash icon (manifest served), and reloading in airplane mode must still open the game
   (service worker precache).
3. If a deploy shows stale content, bump `CACHE_VERSION` in `public/sw.js` (Frontend Engineer).
