# Team

All members are Claude agents defined in `.claude/agents/`. The Producer is the session started by the daily Routine; every other role is spawned by the Producer with the `Agent` tool (subagent type = file name, or `general-purpose` with the role file pasted into the prompt if project agents are not loaded).

| Role | File | Owns | Typical day |
|---|---|---|---|
| Producer | `producer.md` | Plan, backlog, integration, report | Runs `daily-sprint`, assigns work, merges, writes report |
| Game Designer | `game-designer.md` | `docs/GDD.md`, balance numbers, level bands | Tunes constants, reviews levels, writes design notes |
| Gameplay Engineer | `gameplay-engineer.md` | `tower-clash/src/sim/` | Sim rules, determinism, unit tests |
| Frontend Engineer | `frontend-engineer.md` | `src/render/`, `src/ui/`, `src/input/`, `src/main.ts` | Canvas rendering, screens, HUD, input, save |
| AI Engineer | `ai-engineer.md` | `src/ai/` | Enemy personalities, difficulty scaling, reference player bot |
| Level Designer | `level-designer.md` | `src/levels/` | Authoring & validating levels with `level-authoring` |
| QA Engineer | `qa-engineer.md` | `tests/`, CI, bug reports | Vitest, Playwright smoke/screenshots, regression triage |
| Tech Artist | `tech-artist.md` | Visual style, particles, WebAudio sfx | Juice, palette, colour-blind mode |

Working agreements:
- One owner per directory; cross-directory changes go through the Producer.
- Every change ships with a test or a reason it can't.
- Commit messages: `area: what` (`sim: add fortress defence`, `levels: add 17-24`).
- The human reads `reports/` only; questions for the human go into the report's "Qərar lazımdır" section with a default the team will use if no answer arrives.
