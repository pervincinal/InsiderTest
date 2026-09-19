# Team

All members are Claude agents defined in `.claude/agents/`. The Producer is the session started by the daily Routine; every other role is spawned by the Producer with the `Agent` tool (subagent type = file name, or `general-purpose` with the role file pasted into the prompt if project agents are not loaded).

| Role | File | Owns | Typical day |
|---|---|---|---|
| Producer | `producer.md` | Plan, backlog, integration, report; `docs/PLAN.md`, `docs/BACKLOG.md`, `docs/TEAM.md`, `reports/` | Runs `daily-sprint`, assigns work, merges, writes report |
| Game Designer | `game-designer.md` | `docs/GDD.md`, balance numbers (`src/sim/constants.ts` together with the GDD table), level bands, rulings for other roles' proposals (economy, daily) | Tunes constants, reviews levels, writes design notes |
| Gameplay Engineer | `gameplay-engineer.md` | `tower-clash/src/sim/`, `tests/sim/` | Sim rules, determinism, unit tests |
| Frontend Engineer | `frontend-engineer.md` | `src/render/`, `src/ui/`, `src/input/`, `src/daily/`, `src/native/`, `src/main.ts`, `index.html`, `public/` | Canvas rendering, screens, HUD, input, save, PWA, daily challenge UI |
| AI Engineer | `ai-engineer.md` | `src/ai/`, `tests/ai/`, `scripts/playtest.ts` and its `--seeds` / `--upgrades` / `--daily` / `--twist` modes | Enemy personalities, difficulty scaling, reference player bot, headless sweeps |
| Level Designer | `level-designer.md` | `src/levels/` (JSON + generated `manifest.ts`) | Authoring & validating levels with `level-authoring`; star clocks; daily-pool robustness |
| QA Engineer | `qa-engineer.md` | `tests/`, `e2e/`, `.github/workflows/`, the "Bugs" section of `docs/BACKLOG.md` | Vitest, Playwright smoke/screenshots, CI gates, regression triage |
| Mobile Engineer | `mobile-engineer.md` | `capacitor.config.ts`, `android/`, `ios/`, `resources/`, mobile CI, `docs/MOBILE.md` | Native shells, APK/IPA builds, store prep, Phase B plugins |
| Monetization Designer | `monetization-designer.md` | `docs/ECONOMY.md`, `src/economy/catalog.ts` (engineers consume it; `src/economy/*` logic is Frontend's), `docs/research/monetization-market.md` | Currencies, IAP catalog and prices, ads strategy, offers, earn/sink model, LiveOps proposals |
| Publisher | `publisher.md` | `docs/publishing/`, `tower-clash/store/`, version number (`package.json` + native version codes with Mobile), `tower-clash/README.md` | Store listings (EN/AZ/RU/TR), screenshots, privacy policy, release notes, launch checklist |
| Tech Artist | `tech-artist.md` | `docs/ART_DIRECTION.md`, visual style inside `src/render/` (`palette.ts`, `particles.ts`, sprites, skins), `src/audio/` | Juice, palette, colour-blind mode, WebAudio sfx, store frames' look |

Added since the original plan: Mobile Engineer (2026-09-13), Publisher (2026-09-13), Monetization Designer (2026-09-13). No role was removed.

Working agreements:
- One owner per directory; cross-directory changes go through the Producer.
- Every change ships with a test or a reason it can't.
- Commit messages: `area: what` (`sim: add fortress defence`, `levels: add 17-24`).
- Docs follow the code: a rule is not shipped until `docs/GDD.md` (rules), `docs/ECONOMY.md` (prices) or `docs/ART_DIRECTION.md` (look) says it; a constant lives in one code file and one doc table, changed together.
- Proposals flow designer → designer: Monetization proposes rewards and products in ECONOMY.md, the Game Designer rules on them in the GDD (e.g. §7 attempts, boosters in the daily); the Publisher reads anything that changes store disclosures.
- The human reads `reports/` only; questions for the human go into the report's "Qərar lazımdır" section with a default the team will use if no answer arrives. Stakeholder-gated items (accounts, devices, Pages, tags) are listed in `docs/PLAN.md` and never block other work.
