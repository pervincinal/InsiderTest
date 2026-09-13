---
name: daily-report
description: Write the Tower Clash daily report in Azerbaijani for the human stakeholder (reports/YYYY-MM-DD.md). Use at the end of every daily sprint or when asked for a gündəlik report.
---
# Daily report

File: `reports/YYYY-MM-DD.md` (UTC date). Language: Azerbaijani, plain and short; technical terms may stay English. The reader is not a developer and will not reply — every open question must carry the default the team will apply.

Template:
```markdown
# Gündəlik hesabat — YYYY-MM-DD (Gün N)

**Mərhələ:** M? — <ad> (<x>% hazırdır)
**Branch:** claude/tower-war-game-plan-weqwpb · **Yoxlamalar:** ✅/❌ `npm run check`, `npm run playtest`

## Bu gün nə edildi
- <rol>: <nəticə, bir cümlə> (commit `abc1234`)

## Oyunun vəziyyəti
- Oynanıla bilən səviyyələr: N/40 · Testlər: N unit, N e2e · Referans bot: N/N səviyyəni keçir
- Necə oynamaq: `cd tower-clash && npm install && npm run dev` → brauzerdə http://localhost:5173

## Problemlər / bloklar
- <problem> → <komandanın həlli və ya sabahkı plan>

## Sabah
- <3–5 maddə, backlog-dan>

## Qərar lazımdır (cavab olmasa default tətbiq olunur)
- <sual> — default: <...>

## Rəqəmlər
| Göstərici | Dünən | Bu gün |
|---|---|---|
| Səviyyə sayı | | |
| Unit test | | |
| Playtest keçən səviyyə | | |
```
Keep to one screen. Include screenshot paths from `tower-clash/e2e/__screenshots__/` when UI changed.
