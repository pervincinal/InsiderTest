# Tower Clash

A Tower War–style capture-the-towers RTS for the browser. Mobile-first, no engine, no assets: TypeScript + Canvas 2D.

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + unit tests + level validation
npm run playtest   # reference-player bot on every level
npm run e2e        # Playwright smoke test (Chromium)
```

Rules: `../docs/GDD.md`. Plan: `../docs/PLAN.md`. Work: `../docs/BACKLOG.md`. Daily reports: `../reports/`.

## How to play
Tap one of your (blue) towers, then tap a connected tower to send every unit there. Units reinforce friendly towers and fight hostile ones; when a tower's count reaches zero it is yours. Tap a selected tower again to upgrade it (faster production, bigger garrison). Capture every enemy tower to win.
