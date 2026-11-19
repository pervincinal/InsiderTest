# Team

All members are Claude agents defined in `.claude/agents/`. The Producer is the session started by the daily Routine; every other role is spawned by the Producer with the `Agent` tool (subagent type = file name, or `general-purpose` with the role file pasted into the prompt if project agents are not loaded).

| Role | File | Owns | Typical day |
|---|---|---|---|
| Producer | `producer.md` | Plan, backlog, integration, report; `docs/PLAN.md`, `docs/BACKLOG.md`, `docs/TEAM.md`, `reports/`, `docs/office/` (office page), `tower-clash/scripts/producer/` (chain, artifact sync) | Runs `daily-sprint`, picks each agent's model, assigns work, verifies with `chain.sh`, commits and pushes item by item, writes the report, republishes the office page and play artifact |
| Game Designer | `game-designer.md` | `docs/GDD.md`, balance numbers (`src/sim/constants.ts` together with the GDD table), level bands, rulings for other roles' proposals (economy, daily, playtest findings), the human playtest sheet and its decision rules (`docs/reviews/2026-11-05-human-playtest-sheet.md`) | Tunes constants, reviews levels, writes design notes and rulings, keeps the playtest sheet current |
| Gameplay Engineer | `gameplay-engineer.md` | `tower-clash/src/sim/`, `tests/sim/` | Sim rules, determinism, unit tests |
| Frontend Engineer | `frontend-engineer.md` | `src/render/`, `src/ui/`, `src/input/`, `src/daily/`, `src/native/`, `src/main.ts`, `index.html`, `public/` | Canvas rendering, screens, HUD, input, save, PWA, daily challenge UI |
| AI Engineer | `ai-engineer.md` | `src/ai/`, `tests/ai/`, `scripts/playtest.ts` and its `--seeds` / `--upgrades` / `--tier-gate` / `--daily` / `--weekly` / `--twist` / `--naive` modes | Enemy personalities, difficulty scaling, reference player bot, headless sweeps |
| Level Designer | `level-designer.md` | `src/levels/` (JSON + generated `manifest.ts`), `.claude/skills/level-authoring/` incl. the difficulty-list procedure | Authoring & validating levels with `level-authoring`; star clocks; daily-pool robustness; difficulty-list findings after the human playtest |
| QA Engineer | `qa-engineer.md` | `tests/`, `e2e/` (incl. `e2e/tools/hunt.mjs`), `.github/workflows/`, the "Bugs" section of `docs/BACKLOG.md`, the sweep and dry-run reviews in `docs/reviews/` | Vitest, Playwright smoke/screenshots, CI gates, regression triage, flake sweeps, hang hunts, playtest-day dry runs |
| Mobile Engineer | `mobile-engineer.md` | `capacitor.config.ts`, `android/`, `ios/`, `resources/`, mobile CI (native lanes in `.github/workflows/`), `docs/MOBILE.md`, `scripts/buildNative.mjs` | Native shells, APK/IPA builds, native-lane checks, build-number request dry runs, Phase B plugins |
| Monetization Designer | `monetization-designer.md` | `docs/ECONOMY.md`, `src/economy/catalog.ts` (engineers consume it; `src/economy/*` logic is Frontend's), `docs/research/monetization-market.md` | Currencies, IAP catalog and prices, ads strategy, offers, earn/sink model, LiveOps proposals |
| Publisher | `publisher.md` | `docs/publishing/`, `tower-clash/store/`, version number (`package.json` + native version codes with Mobile), `tower-clash/README.md` | Store listings (EN/AZ/RU/TR), screenshots, privacy policy, release notes (EN/AZ parity), launch checklist status |
| Tech Artist | `tech-artist.md` | `docs/ART_DIRECTION.md`, visual style inside `src/render/` (`palette.ts`, `particles.ts`, sprites, skins), `src/audio/`, the feel-pass and perf reviews (`docs/reviews/*feel-pass*`, `*perf*`) | Juice, palette, colour-blind mode, WebAudio sfx, feel passes (FEEL-n), perf-gate checks, store frames' look |

Added since the original plan: Mobile Engineer (2026-09-13), Publisher (2026-09-13), Monetization Designer (2026-09-13). No role was removed. No role was added or removed since.

Working rules as of 2026-11-19 (from `daily-sprint` and the Producer's practice):
- Model per task: the Producer picks each agent's model, whatever the session itself runs on. `fable` for sim, AI, balance / clock decisions, CI root cause and save data; `opus` is the default; `sonnet` for mechanical and document work; `haiku` for lookups. Never a cheaper model on `src/sim`, `src/ai` or `src/ui/save.ts`.
- Playwright: each agent runs on its own port (4190–4196) with its own `PW_OUTPUT`; the Producer's chain uses 4197–4199 and runs the final `npm run e2e`.
- Agents never commit, build into `dist/`, or run git state commands; they Edit files in place rather than rewrite them.
- Since 2026-11-14 (a container restart lost a day's uncommitted work) the Producer commits and pushes each finished item on its own, not once at the end of the day.
- The Producer's verification chain (`chain.sh`) and artifact publish (`syncArtifact.mjs`) live in `tower-clash/scripts/producer/`.
- Reports are in Azerbaijani per the `daily-report` skill, and the office page ("Tower Clash Ofisi", `docs/office/`) is republished every sprint.

Working agreements:
- One owner per directory; cross-directory changes go through the Producer.
- Every change ships with a test or a reason it can't.
- Commit messages: `area: what` (`sim: add fortress defence`, `levels: add 17-24`).
- Docs follow the code: a rule is not shipped until `docs/GDD.md` (rules), `docs/ECONOMY.md` (prices) or `docs/ART_DIRECTION.md` (look) says it; a constant lives in one code file and one doc table, changed together.
- Proposals flow designer → designer: Monetization proposes rewards and products in ECONOMY.md, the Game Designer rules on them in the GDD (e.g. §7 attempts, boosters in the daily); the Publisher reads anything that changes store disclosures.
- The human reads `reports/` only; questions for the human go into the report's "Qərar lazımdır" section with a default the team will use if no answer arrives. Stakeholder-gated items (accounts, devices, Pages, tags) are listed in `docs/PLAN.md` and never block other work.
