# Human playtest sheet 2026-11-05: star clocks from human timings (AUD-B4 / A13), the 2★ floor past 16 (AUD-B5), bands 5–6 and the AI engagement flag

Owner: Game Designer. Feeds: AUD-Q1 / AUD-A2 (the first recorded human playtest), AUD-B4 / A13, AUD-B5, memo [`2026-11-03-difficulty-and-stars.md`](2026-11-03-difficulty-and-stars.md) §4.3, AUD-A3 (AI memo [`2026-11-05-ai-engagement.md`](2026-11-05-ai-engagement.md), landing today). Protocol base: [`2026-10-29-audit-ai-levels.md`](2026-10-29-audit-ai-levels.md) §4, session B (Quick Protocol, N = 1–3). It does not replace the device checklist [`../publishing/TESTFLIGHT_TEST_PLAN.md`](../publishing/TESTFLIGHT_TEST_PLAN.md): that one checks the phone, this one measures difficulty and the clock. No step here repeats a TF check. Nothing under `tower-clash/src/` changes for this sheet.

Bot numbers were measured today, 2026-11-05, on `e2b6044` with `npm run playtest -- --seeds 20` (reference player, 73 s) and `npm run playtest -- --naive --seeds 20 --tie both` (first-time line, 4 s reactions, 87 s). The shared tree had uncommitted edits in `src/ai/` and `013-crossfire.json` during the run, so both runs were repeated on a `git archive e2b6044` export in the scratchpad. The rows are byte-identical. They match Appendix A of the 2026-11-03 memo on every sampled level except 13, 32 and 41, which changed with the LV-1.0.1a levers on 2026-11-04 (§B.2 lists both). Level 13 changed again with AUD-A15. Its row carries the Level Designer's re-measure at K = 20, which a quick `--level 13 --seeds 20` run reproduced (bot worst 47.9 s, 3★ 0/20). Bot 3★ is now **80 / 1 000** runs (audit 71, memo 73; the rise is 41 at 8/20 after its lever). Raw output: `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/b4/ref20.txt` and `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/b4/naive20.txt`.

The Azerbaijani part comes first, the English part follows. The capture table (§B.1) appears once, with headers in both languages.

---

## AZ — İnsan sınağı: ulduz saatları (≈ 40 dəqiqə, iPhone 17 Pro Max)

**Nə üçün.** 3★ və 2★ saatlarını indiyə qədər yalnız botlar ölçüb. Bu sınaqda 15 səviyyə oynayırsan və hər səviyyədə nəticə kartındakı **vaxtı** yazırsan. Komanda sənin vaxtını botun vaxtının yanına qoyur, qərarı isə hazır qayda ilə verir: 3★ saatı dəyişirmi (AUD-B4), 17-dən sonra 2★ saatı uzanırmı (AUD-B5), 33–50-ci səviyyələrə yenidən baxılırmı. Bu sınaq TestFlight yoxlamasını əvəz etmir: o, telefonu yoxlayır, bu isə çətinliyi ölçür.

> **Vacib:** bu sınaq yalnız **build 27 və ya daha böyük** üçündür. Build 26-da ölçülən vaxtlar müqayisə olunmur.

### 1. Başlamazdan əvvəl (3 dəq)

1. **Build 27 və ya daha böyük olmalıdır** (TestFlight-da tətbiqin adının altındakı rəqəm). Build 26-da dərs kartı açıq olanda da saat işləyir, ona görə vaxtları botla müqayisə etmək olmur. Build 26-dırsa dayan və çata `build 26 — sınaq gözləyir` yaz.
2. Bu sınağı **İRƏLİLƏYİŞİ SIFIRLA-dan (TF-28) əvvəl** et, çünki sıfırlama səviyyələri yenidən bağlayır.
3. Təyyarə rejimi açıq olsun (reklam və bildiriş gəlmir), Aşağı enerji rejimi isə söndürülsün.
4. **Addım 0, birinci səviyyədən əvvəl: Ayarlar → Haqqında → Diaqnostika**: yandır və bütün sınaq boyu **yanıq saxla**. Hər səviyyənin vaxtı, ulduzu, cəhd sayı, oyun sürəti (×1 / ×2) və ən yeni 20 matçın təkrar qeydi telefonda yazılır (15 səviyyə və təkrarlar buna sığır). Özü heç yerə getmir: sonda mətni sən göndərirsən (§6).
5. Xəritəni aç və **açıq olan ən böyük səviyyənin nömrəsini** yaz (məs. `açıq: 34`).
6. İstənilən səviyyəni aç, **II**-yə toxun: FASİLƏ kartında **SÜRƏT ×1** yazılmalıdır. ×2 yazılıbsa, bir dəfə toxun. Sürət saatı dəyişmir, amma sənin reaksiya vaxtını dəyişir, ona görə bütün sınaq ×1 sürətlə oynanır.
7. Qaydalar:
   - **gücləndirici işlətmə** (Sürətləndirmə, Dondurma, Hava zərbəsi);
   - məğlubiyyətdən sonra **KÖMƏK / DAVAM ET-ə toxunma**, yalnız **YENİDƏN**;
   - **SƏVİYYƏNİ KEÇ-ə toxunma**;
   - hər səviyyəyə **ən çox 3 cəhd** et: ilk qələbədən sonra növbəti səviyyəyə keç.
8. **Ekran yazısı mikrofonla**: İdarəetmə mərkəzində dairəli nöqtəni basıb saxla, sonra **Mikrofon: açıq**. Bunu yalnız **17, 33 və 49**-da yaz və oynayarkən fikrini səsli de. Yazıda yalnız ekran olur, üz görünmür. Təhlildən sonra silinir.
9. Qeydlər (Notes) tətbiqini aç və başlama saatını yaz.

### 2. Vaxtı haradan oxumaq (alət lazım deyil)

- **QƏLƏBƏ kartı:** iri **QƏLƏBƏ** sözünün altında qalın qara sətir var: **"Vaxt 01:23"** (dəqiqə:saniyə). Bu sənin vaxtındır. Altında üç ulduz, ulduzların altında isə kiçik boz sətir gəlir: **"3 ulduz: 00:25-dək · 2 ulduz: 00:50-dək"**. Bunlar səviyyənin saatlarıdır.
- **MƏĞLUBİYYƏT kartı:** "Vaxt" sətri eyni yerdədir, sadəcə ulduz yoxdur. Onu da yaz.
- Saat **sənin ilk toxunuşunla** başlayır: dərs kartını oxuyanda saat getmir. FASİLƏ zamanı saat dayanır. Döyüş vaxtı saatı FASİLƏ kartının yuxarısında da görə bilərsən: "Səviyyə 17 · 00:41".
- Hər nəticə kartının **skrinşotunu çək** (yan düymə + səs artırma). Yazmağa macal tapmasan da rəqəm şəkildə qalır.
- Kart saniyəni aşağı yuvarlaqlaşdırır: "Vaxt 00:25" əslində 25,4 s ola bilər və o zaman 2★ verir. Ulduzu kartda gördüyün kimi yaz.
- Döyüş uzun müddət dəyişməyəndə "Heç nə dəyişmir" kartı çıxa bilər. Orada **OYNAMAĞA DAVAM ET** seçmək olar. **GERİ ÇƏKİL** isə məğlubiyyət sayılır (qeyd: `G`).

### 3. Səviyyələr: bu ardıcıllıqla oyna

| # | Səviyyə | Bir cəhd ≈ | Əlavə |
|---|---|---|---|
| 1 | 3 Sahibsiz Torpaq | 1 dəq | |
| 2 | 5 Divarı Dolan | 1,5 dəq | |
| 3 | 9 Daş Divarlar | 1 dəq | |
| 4 | 13 Çarpaz Atəş | 1,5 dəq | |
| 5 | 16 Son Bastion | 1 dəq | |
| 6 | 17 Mina Sahəsi | 1 dəq | ekran yazısı + rəng sualı |
| 7 | 23 İlk Qan | 1,5 dəq | |
| 8 | 27 Zireh Yarışı | 1 dəq | |
| 9 | 32 Mühasirə | 1,5 dəq | |
| 10 | 33 Üç Kral | 1 dəq | ekran yazısı + rəng sualı |
| 11 | 38 Atəş Halqası | 1,5 dəq | |
| 12 | 41 Əkiz Çaylar | 2 dəq | |
| 13 | 45 Üç Cəbhə | 1,5 dəq | |
| 14 | 49 Son İşıq | 1,5 dəq | ekran yazısı + rəng sualı |
| 15 | 50 Tacın Dönüşü | 1,5 dəq | sonra 3 sual (§5) |

Təxmini vaxt: oyunun özü ≈ 18 dəq, kart, qeyd və xəritə ≈ 15 dəq, məğlubiyyətlər ≈ 5–10 dəq. Cəmi **35–45 dəqiqə**.

- **Vaxt çatmırsa:** 30-cu dəqiqədə 33-ü hələ bitirməmisənsə, 38 və 41-i burax, birbaşa 45, 49 və 50-yə keç. 3, 5, 16 və 38 ilk buraxılanlardır. 17, 23, 27, 32, 33, 45, 49 və 50 isə buraxılmır.
- **Səviyyə bağlıdırsa** (açıq olan ən böyük səviyyədən sonrakılar): cədvəldən yalnız açıq olanları oyna. Sonra kampaniyanı açıq olan sonuncu səviyyədən ardıcıl davam etdir və hər yeni səviyyəni eyni qaydada bir sətirlə yaz (bunların hamısı əsl ilk keçiddir, ən qiymətli məlumat da budur). 45 dəqiqə dolanda dayan. Qalan cədvəl səviyyələrini başqa gün eyni qaydalarla oyna.
- **Əlavə (məcburi deyil, yalnız 35 dəqiqədən az vaxt getdisə):** 3★-a 20 saniyədən az çatmadığın səviyyələri bir dəfə **"bacardığın qədər tez"** yenidən oyna və vaxtı `sürət` sözü ilə yaz.

### 4. Hər səviyyədən sonra yaz (bir sətir)

1. **Əvvəl:** səviyyəyə girməzdən əvvəl xəritədə onun altında neçə ulduz var idi (`0` = ilk dəfədir).
2. **Hər cəhd:** nəticə (`Q` = qələbə, `M` = məğlubiyyət, `G` = geri çəkil), kartdakı **Vaxt**, ulduz sayı.
3. **Düşmənin nə etdiyini başa düşdünmü?** `bəli` / `qismən` / `yox`.
4. **Yalnız 17, 33, 49:** kart çıxan kimi, başqa heç nəyə baxmadan yaz: **"Sənin üstünə ilk hansı rəng gəldi?"** Cavab: `qırmızı` / `yaşıl` / `sarı` / `heç kim`.
5. **Bir sətir:** nə hiss etdin, harada çətin oldu, nə gözləmirdin.

Nümunə: `23 · əvvəl 0 · M 01:40, Q 01:10 2★ · qismən · "sağdakı qırmızı birdən gəldi"`

### 5. Sonda üç sual (2 dəq, səsli de və ya yaz)

1. Dayanmaq istədiyin an oldumu? O vaxt nə baş verirdi?
2. Digər rənglər barədə danış. Onlar nə edirdilər?
3. Daha yaxşı oynaya biləcəyini hiss etdinmi, yoxsa bu şans idi?

### 6. Hesabat (bir mesaj)

```
Sınaq: build 27 · açıq: 50 · başlama 20:10 · bitiş 20:52
3 · əvvəl 3 · Q 00:24 3★ · bəli · "asan"
17 · əvvəl 0 · Q 00:41 2★ · qismən · rəng: qırmızı · "minalar çox idi"
…
Suallar: 1) … 2) … 3) …
```

Sınaqdan sonra: **Ayarlar → Haqqında → JURNALI KOPYALA** et və **bütün mətni** doldurulmuş cədvəllə birlikdə **fayl və ya e-poçt** kimi göndər (çata yapışdırma: mətn 400 kB-a qədər ola bilər). Mətndə CSV sətirləri və `#replay N {…}` sətirləri var (ən yeni 20 matç). Komanda matçı bu mətndən yenidən oynadır. Jurnal həm də hər səviyyənin **ulduzunu (`stars`), vaxtını (`timeMs`), cəhd sayını (`attempt`)**, nəticəni (`outcome`), ilk keçidi (`first`) və oyun sürətini (`speed`) saxlayır: bununla əllə yazdığın cədvəlin həmin sütunları yoxlanılır. Sonra nəticə kartlarının skrinşotlarını və 17, 33, 49-un üç ekran yazısını əlavə et.

### 7. Komanda bununla nə edəcək (qısa)

- **N = 1** (yalnız sən) olanda sınaq fərziyyə verir, saatları özü dəyişmir. Hesablanan təkliflər cədvələ yazılır və sən "qəbul" deyə bilərsən. Avtomatik dəyişiklik **3 nəfərdən** sonra olur: sən və oyunu heç görməmiş 2 nəfər.
- **3★ saatı (AUD-B4):** sən botdan 15 %-dən çox sürətlisənsə, 3★ saatı sənin vaxtının 1,1 qatına endirilir. Botdan 10 %-dən çox yavaşsansa, 3★ saatı botun vaxtına qədər uzadılır ("3★ = botu keç"). Ortada qalırsa, heç nə dəyişmir.
- **17-dən sonra 2★ saatı (AUD-B5):** standart cavab "qəbul et"dir. 16 səviyyədə 2★ saatı 5–30 saniyə uzanır. Bunun üçün iqtisadiyyat cədvəli (ECONOMY §6) yenidən hesablanır və qızıl ±10 %-dən çox dəyişməməlidir.
- **33–50 və düşmənin hücumu (AUD-A3):** üç nəfərdən ikisi 45, 49 və 50-ni ilk cəhddə keçirsə, eyni zamanda 23, 27 və ya 32-də ilişirsə, üstəlik finalı "asan" adlandırırsa və ya üstünə hansı rəngin gəldiyini deyə bilmirsə, əvvəlcə düşmənin oyunçuya hücumu gücləndirilir.

---

## B. Capture table / Qeyd cədvəli

### B.1 One row per level (the human cells are empty; the bot cells are today's)

`3★ / 2★` = today's clocks in the level JSON (`star3` / `star2`, seconds; the result card shows them as "3 ulduz: 00:25-dək · 2 ulduz: 00:50-dək"). `Bot` = reference player median, K = 20. `Naive asc / desc` = the first-time line's median over both tie orders, K = 20, 4 s. "Cəhd" cells hold `Q|M|G · mm:ss · ★`.

| Lvl | 3★ / 2★ | Bot | Naive asc / desc | Əvvəl ★ / before | Cəhd 1 / Try 1 | Cəhd 2 / Try 2 | Cəhd 3 / Try 3 | Düşmən? / Enemy understood | Rəng / First colour (17, 33, 49) | Bir sətir / One line |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 25 / 60 | 27.8 | 52.4 / 57.6 | | | | | | — | |
| 5 | 30 / 110 | 37.4 | 71.3 / 108.0 | | | | | | — | |
| 9 | 25 / 60 | 30.7 | 57.8 / 57.8 | | | | | | — | |
| 13 (13 re-measured 2026-11-05 after AUD-A15) | 35 / 80 | 47.3 | 75.3 / 75.6 | | | | | | — | |
| 16 | 20 / 75 | 30.5 | 63.6 / 70.0 | | | | | | — | |
| 17 | 25 / 50 | 28.4 | 54.4 / 54.1 | | | | | | | |
| 23 | 30 / 75 | 37.0 | 81.2 / 74.3 | | | | | | — | |
| 27 | 40 / 80 | 50.0 | 65.3 / 65.0 | | | | | | — | |
| 32 | 40 / 80 | 48.2 | 93.3 / 87.8 | | | | | | — | |
| 33 | 35 / 70 | 38.5 | 57.4 / 56.8 | | | | | | | |
| 38 | 25 / 50 | 32.6 | 73.9 / 74.6 | | | | | | — | |
| 41 | 70 / 120 | 72.9 | 106.3 / 107.6 | | | | | | — | |
| 45 | 40 / 95 | 48.2 | 71.3 / 92.7 | | | | | | — | |
| 49 | 25 / 50 | 33.1 | 70.9 / 70.9 | | | | | | | |
| 50 | 40 / 90 | 49.6 | 77.1 / 77.1 | | | | | | — | |

Session header (fill once): tester · fresh / stakeholder · build · highest open level · start / end time · diagnostics on (y/n) · screen recordings 17 / 33 / 49 (y/n). Interview answers Q3 / Q6 / Q8 are recorded verbatim below the table. Extra campaign rows (levels played past the open level) go in the same format under the table.

### B.2 Team reference for the same rows

| Lvl | Band | Role in the sample | Bot 3★ of 20 | Bot worst | Naive asc: wins, 2★ | Naive desc: wins, 2★ | GD-12 `star2` if B5 adopted | Change against memo Appendix A |
|---|---|---|---|---|---|---|---|---|
| 3 | 1 | tutorial clock, naive floor; `tie desc` exempt (GD-7h) | 5 | 31.9 | 20/20, 20 | 20/20, 18 | — | none |
| 5 | 1 | widest rung 30 / 110 s = 3.7 × (AUD-B10 floor) | 2 | 47.6 | 20/20, 20 | 20/20, 13 | — | none |
| 9 | 2 | first fortress, first L2 home | 3 | 32.0 | 20/20, 13 | 20/20, 13 | — | none |
| 13 (13 re-measured 2026-11-05 after AUD-A15) | 2 | LV-1.0.1a lever (`outpost` 3 → 6 u) + AUD-A15 (`guns` x 360 → 420, `east2` 6 → 8 u; clocks unchanged) | 0 | 47.9 | 20/20, 17 | 20/20, 16 | — | bot 47.9 → 47.3; naive 84.7 / 80.1 → 75.3 / 75.6; 2★ 9 / 10 → 17 / 16; idle player alive 20/20 → eliminated 20/20, median 86.8 s |
| 16 | 2 | last naive-floored level: one side of the "past 16" cliff | 0 | 37.0 | 20/20, 19 | 20/20, 14 | — | none |
| 17 | 3 | the other side of the cliff; GD-12 floor; H2 question | 2 | 32.4 | 20/20, 2 | 20/20, 3 | 55 | none |
| 23 | 3 | learning level (item 9); GD-12 floor; §4.3 (i) | 0 | 53.8 | 19/20, 5 | 19/20, 11 | 85 | none |
| 27 | 4 | learning level; §4.3 (i) | 1 | 61.1 | 20/20, 20 | 20/20, 20 | — | none |
| 32 | 4 | learning level; LV-1.0.1a lever; GD-12 floor; §4.3 (i) | 2 | 70.2 | 18/20, 5 | 18/20, 4 | 90 | bot 48.7 → 48.2; naive 14 / 14 → 18 / 18 wins, 99.5 / 94.9 → 93.3 / 87.8 s; 2★ 2 / 2 → 5 / 4 |
| 33 | 5 | third enemy; pinned clock (`reclock.ts` KEEP); §4.3 (ii) yardstick; H2 question | 4 | 48.8 | 20/20, 20 | 20/20, 20 | — | none |
| 38 | 5 | band-5 B4 point (33 cannot move); GD-12 floor, naive 2★ 0 / 0 | 0 | 47.8 | 20/20, 0 | 20/20, 0 | 70 | none |
| 41 | 6 | LV-1.0.1a lever (`home` 18 → 22 u); band-6 opener | 8 | 88.8 | 20/20, 14 | 19/20, 17 | — | bot 77.3 → 72.9; naive 17 / 16 → 20 / 19 wins, 131.8 / 140.9 → 106.3 / 107.6 s; `star2` 140 → 120 (AUD-Q13); 2★ 12 / 7 → 14 / 17 |
| 45 | 6 | §4.3 (i); AUD-B10 floor 95 | 4 | 59.1 | 20/20, 20 | 20/20, 14 | — | none |
| 49 | 6 | §4.3 (i)–(iii); GD-12 floor, naive 2★ 0 / 0; H2 question | 0 | 41.1 | 20/20, 0 | 20/20, 0 | 70 | none |
| 50 | 6 | finale; §4.3 (i), (ii) | 9 | 88.6 | 20/20, 19 | 20/20, 19 | — | none |

**Why these 15 levels** (the suggested 1, 3, 5, 9, 13, 16, 17, 23, 27, 32, 41, 45, 50, minus 1, plus 33, 38, 49):
- **Every band, weighted to the decisions.** There are 2 / 3 / 2 / 2 / 2 / 4 levels per band. Band 6 gets four because the §4.3 rule reads 45, 49 and 50 together.
- **Memo §4.3 session B is inside it.** All of 17, 23, 27, 32, 33, 41, 45, 49 and 50 are in the sample, so H1, H2 and the re-open rule can be judged from this session alone. 33 and 49 were not in the suggested list. The rule cannot run without them: (ii) compares 49 / 50 with the same tester's 33, and H2 asks its question on 17, 33 and 49.
- **B5 gets five of the 16 GD-12 floor levels, one or two per band past 16:** 17, 23, 32, 38 and 49. On 38 and 49 the naive line reaches 2★ on 0 of 40 runs. **16 → 17** is the cliff itself: the last naive-floored level, then the first that is not (naive 2★ 19 / 14 → 2 / 3).
- **B4 gets non-pinned points in every band.** Levels 1 and 33 are pinned in `reclock.ts` (`KEEP`), so 1 was dropped (bot 9.1 s, nothing depends on it) and 38 was added to give band 5 a level whose clock can move. Six of the levels are in the weekly pool, where `star3` is the 3★ target: 33, 38, 41, 45, 49, 50.
- **The three LV-1.0.1a levers (13, 32, 41) get their first human check.**
- **What it does not cover:** levels 1–2, 4, 6–8 (H4 onboarding needs a fresh tester's session A), the daily, the weekly, the twists, boosters and commander upgrades. Device performance is TF-13's job.

---

## EN — Human playtest: star clocks (≈ 40 minutes, iPhone 17 Pro Max)

**Why.** Every star clock so far comes from bots. In this session you play 15 levels and write down the **time** from each result card. The team sets your time next to the bot's, and pre-agreed rules give the decision: does the 3★ clock move (AUD-B4), does the 2★ clock past 16 get the floor (AUD-B5), do levels 33–50 re-open. This session does not replace the TestFlight checklist. That one checks the phone; this one measures difficulty.

### 1. Before you start (3 min)

1. **Build 27 or later** (the number under the app name in TestFlight). On build 26 the clock runs while the lesson card is up, so its times cannot be compared with the bot's. If the build is 26, stop and send `build 26 — playtest waits`.
2. Run this **before RESET PROGRESS (TF-28)**, because the reset locks the levels again.
3. Turn airplane mode on (no ads, no notifications) and Low Power Mode off.
4. **Step 0, before the first level: Settings → About → Diagnostics**: turn it on and **leave it on** for the whole session. The phone records each level's time, stars, attempt count, game speed (×1 / ×2) and the replay record of the newest 20 matches (the 15 levels and their retries fit). Nothing is sent by itself: you send the text at the end (§6).
5. Open the map and write down the **highest open level**.
6. Open any level and tap **II**. The PAUSED card must read **SPEED ×1**; if it reads ×2, tap it once. Speed does not change the clock, but it does change how fast you have to react. The whole session is played at ×1.
7. Rules:
   - **no boosters** (Overdrive, Freeze, Airstrike);
   - after a defeat, **no REINFORCEMENTS / CONTINUE**, only **RETRY**;
   - **no SKIP LEVEL**;
   - **at most 3 tries** per level, and go to the next level after the first win.
8. **Screen recording with the microphone on**: in Control Centre, long-press the record button, then **Microphone: on**. Record only **17, 33 and 49**, and think aloud while you play. The recording shows the screen only, never your face, and it is deleted after analysis.
9. Open Notes and write the start time.

### 2. Where the time is (no tools needed)

- **VICTORY card:** under the big **VICTORY** word there is a bold black line, **"Time 01:23"** (minutes:seconds). That is your time. Below it come the three stars, then a small grey line, **"3 stars under 00:25 · 2 under 00:50"**: the level's clocks.
- **DEFEAT card:** "Time" is in the same place, with no stars. Write it down too.
- The clock **starts at your first tap**, so it does not run while you read the lesson card, and it stops while the game is paused. During a match the PAUSED card shows it at the top as well: "Level 17 · 00:41".
- **Take a screenshot of every result card.** The number survives even when you had no time to write it.
- The card rounds the seconds down, so "Time 00:25" can be 25.4 s and give 2★. Write the stars the card shows.
- If a match stops changing for a long time, the "Nothing is changing" card can appear. **KEEP PLAYING** is fine there. **RETREAT** counts as a defeat (write `R`).

### 3. Levels, in this order

The order is 3, 5, 9, 13, 16, **17**, 23, 27, 32, **33**, 38, 41, 45, **49**, 50 (bold = screen recording + the colour question; the three questions of §5 come after 50). Times per try are as in the AZ table: about 1–2 min each. Estimate: ≈ 18 min of play, ≈ 15 min of cards, notes and the map, ≈ 5–10 min of defeats, **35–45 min** in all.

- **Running late:** if 33 is not finished at minute 30, drop 38 and 41 and go straight to 45, 49 and 50. 3, 5, 16 and 38 are dropped first. Never drop 17, 23, 27, 32, 33, 45, 49 or 50.
- **Locked level** (beyond the highest open one): play the sample levels that are open. Then go on through the campaign from the last open level, in order, one line per new level in the same format. These are true first clears, the most valuable data there is. Stop at 45 min, and play the remaining sample levels on another day under the same rules.
- **Extra (optional, only if under 35 min so far):** replay once, "as fast as you can", each level where you missed 3★ by less than 20 s. Mark that time `speed`.

### 4. After each level, one line

1. **Before:** how many stars the level showed on the map before you started (`0` = first time).
2. **Each try:** result (`W` = win, `L` = defeat, `R` = retreat), the card's **Time**, the stars.
3. **Did you understand what the enemy was doing?** `yes` / `partly` / `no`.
4. **Only on 17, 33 and 49**, as soon as the card is up and before looking at anything else: **"Which colour came for you first?"** Answer `red` / `green` / `yellow` / `nobody`.
5. **One line, in your own words:** what you felt, what was hard, what you did not expect.

### 5. Three questions at the end (2 min, aloud or written)

1. Was there a moment you wanted to stop? What was happening?
2. Tell me about the other colours. What were they doing?
3. Did you feel you could get better, or was it luck?

### 6. Report (one message)

Use the same format as the AZ example in §6. After the session, tap **Settings → About → COPY LOG** and send the **whole text** with the filled sheet as a **file or e-mail** (do not paste it into a chat: it can be up to 400 kB). It holds CSV rows plus `#replay N {…}` lines (newest 20 matches, each ≤ 32 kB; text up to 400 kB), from which the team re-plays a match headlessly. The log also carries each level's **stars (`stars`), time (`timeMs`), attempt count (`attempt`)**, outcome (`outcome`), first clear (`first`) and game speed (`speed`), which cross-checks those columns of your hand-written table. Then attach the result-card screenshots and the three recordings (17, 33, 49).

---

## C. Decision rules (team; mechanical)

### C.0 What counts

- **Tester count N.** These rules move numbers only at **N ≥ 3**: the stakeholder plus two people who have never seen the game, each counted on ≥ 2 of 3 testers. This is the bar from the audit's §4 and the memo's §4.3. Below N = 5 it is still a directional pattern, not a statistic (`metrics-and-benchmarks.md` §C). At **N = 1** (the stakeholder alone, who is not a first-timer) every rule is run anyway. Its output goes into the sheet as **"proposed"**, and nothing changes in JSON unless the stakeholder signs a specific row off in their own message. The default is the stakeholder alone; two fresh testers are recommended, not required (the stakeholder decides).
- **Valid time.** A try counts when it was won at ×1, with 0 boosters and no REINFORCEMENTS. Use the Diagnostics `timeMs` when the log is pasted (its `boosters` and `continued` columns confirm validity); otherwise use the card's mm:ss. A build without LV-1.0.1a (earlier than 27) makes the 13 / 32 / 41 rows pre-lever: compare them with Appendix A's columns, not §B.1's.
- **H** (per level) = the median over testers of each tester's **fastest valid win**, the `speed` retry included. **First win** = the tester's first won try in this session, whatever its validity; its attempt number is "attempts to first clear".
- **B** = the bot median (reference player, K = 20) on the build's level files. **S3 / S2** = today's `star3` / `star2`. `round5` = to the nearest 5 s (`roundStep` in `scripts/lib/reclockRule.ts`).

### C.1 AUD-B4 / A13: when `star3` moves

For each sampled level with an H (r = H / B):

| Zone | Condition | New `star3` | Meaning |
|---|---|---|---|
| **F**, human fast | r < 0.85 (the human beats the bot by more than 15 %) | min(S3, round5(1.1 × H)) | 3★ = within 10 % of a strong human's pace (it only tightens) |
| **M**, matched | 0.85 ≤ r ≤ 1.10 | S3 (no change) | the bot clock already fits humans |
| **S**, human slow | r > 1.10 | max(S3, round5(B)) | AUD-A13's fix: 3★ = "beat the bot's median" (it only loosens) |

- **Guards.** New `star3` < S2 (else S2 − 5). Levels 1 and 33 never move (`KEEP`). The boundary step (≥ 80 % of 10 max-upgrade runs at 3★ → −5 s) then runs as usual.
- **Unsampled levels.** When ≥ 2 non-pinned sampled levels of one band land in the same zone F or S, every other non-pinned level of that band moves too, with the band's median r (F: min(S3, round5(1.1 × r_band × B)); S: max(S3, round5(B))). Otherwise they stay.
- **Shipping.** `star3` is the weekly 3★ target on 33–50 and part of the daily score on 9–50. Ship it in a version update with a release note, never mid-week (GDD GD-12 risk (iv)), in the same version as B5 so the ladder changes once.
- **The other half of A13.** If H3 holds (3★ on ≤ 10 % of valid first wins), no new 3★-gated reward is added (memo §7.3).

### C.2 AUD-B5: when the 2★ card-reader floor past 16 is adopted

**Adopt** the GD-12 table (16 levels, `star2` +5 … +30 s; in the sample 17 → 55, 23 → 85, 32 → 90, 38 → 70, 49 → 70; the stakeholder's default) when both hold:

1. **The economy half.** The Monetization Designer has re-run ECONOMY §6 with memo §5.2's floored column (first-clear stars ≈ 90.0 instead of 81.3), and the **day-15 and day-30 cumulative gold** each move by **≤ ±10 %** against §6's rows restated per memo §5.3 (≈ 2 443 at day 15 and ≈ 4 348 at day 30, i.e. today's rows + ≈ 170).
   - Designer's bound, for Monetization to confirm: +8.7 first-clear 2★ × 10 gold, at most doubled by the ×2 ad, is ≤ +174 by day 15 (≤ +7.1 %). The Producer adopted this ±10 % gate as the rule on 2026-11-05. By day 30 it is about zero, because the same rungs are paid earlier, not more often.
   - The 130 → ≈ 116 a day tail (memo §5.3) is not the gate. It exists without the floor too and only moves from about day 32 to about day 23.
   - **ECONOMY §6.4 re-run 2026-11-06: day-15 +6.2 %, day-30 +1.7 % → gate passed.** Measured at K = 20 on `122d0e8`. The baseline is today's restated rows, 2 484 / 4 415. The floored column is 2 637 / 4 488, with 90.8 first-clear stars where memo §5.2 had ≈ 90.0. The worst corner is +7.6 % / +3.2 %. Against the 2 443 / 4 348 above it is +7.9 % / +3.2 %. Crystals do not change.
2. **The human half does not refute it.** Refuted = N ≥ 3 and ≥ 2 testers win their first try of ≥ 4 of the 5 floored sample levels (17, 23, 32, 38, 49) at ≥ 2★ on today's clocks. In that case there is no cliff for humans: hold the floor for the GD-12 diagnostics / telemetry trigger (first-clear 2★ share < 30 %).
   - At N = 1 the human half cannot refute, so the default (adopt) stands once the economy half is met.
   - A first-win 2★ share under 30 % on the floored levels is the GD-12 trigger firing: it confirms the floor.

If the economy half fails (> ±10 %), the floor goes back to the stakeholder as a decision with the re-run's numbers. It is not dropped silently.

### C.3 Bands 5–6 re-open (memo §4.3, unchanged; restated as a check)

- **Re-open when** N ≥ 3 and, for ≥ 2 of 3 testers: **(i)** first win on attempt 1 on each of 45, 49 and 50, **and** attempt ≥ 2 (or no win within 3) on at least one of 23, 27, 32; **and one of**:
  - **(ii)** 49 or 50 first won at ≥ 2★ (on the `star2` of the build played: if B5 is already in, 49's clock is 70 s), or both won faster than the same tester's 33;
  - **(iii)** H2 fails on 49: 49's colour answer does not match the recording, and ≤ 1 of 17 / 33 / 49 match;
  - **(iv)** interview Q3 / Q8 call a finale "easy", "nothing happened" or "luck", and no F1+ frustration code was logged on 45–50.
- **Do not re-open when** ≥ 2 testers need ≥ 2 attempts on any of 45–50 (H1 refuted for the finales).
- **When re-opened**, the order of work is AUD-A3 first (C.4), re-measured with the memo's §2 table, and a re-layout of 49 / 50 only if A3 leaves the naive line at ≥ 19/20 there.
- **The LV-1.0.1a levers are already applied** (2026-11-04). The memo's "drop the 32 / 41 lever" rules were written for a build without them. On build ≥ 27 the playtest sees the levered levels, so the drop rules do not apply. If ≥ 2 of 3 testers fail to win 32 within 3 tries, or fail to win 41 within 2, the Level Designer files that as a finding. Nothing is reverted automatically: no acceptance rule was set for human rows on levered levels.

### C.4 AUD-A3: when the engagement flag is switched on

**Switch on** the enemy "front" term described in [`2026-11-05-ai-engagement.md`](2026-11-05-ai-engagement.md) (the flag name, its acceptance and the reference-player floor of ≥ 95 % on 17–50 are that memo's) when N ≥ 3 and either:
- **(a)** C.3 re-opens bands 5–6, or
- **(b)** **H2 fails** for ≥ 2 of 3 testers: ≤ 1 of the three colour answers on 17 / 33 / 49 matches the recording (coded by someone who did not author those levels). This is the audit's "P1 if §4 H2 confirms" condition.

At N = 1, H2 failing is a hypothesis: the flag stays off and AUD-A3 stays P2. It stays off as well if the AI memo's own acceptance fails, whatever this sheet says.

### C.5 Side outputs (recorded, not decided here)

- H3: the share of valid first wins at 3★.
- The first-win 2★ share past 16. Memo §7.3: ≥ 60 % makes the 15-gold 2★ rung the 1.1 candidate.
- Attempts to first clear per level, against Appendix A's naive wins. A human slower than the naive line on a level is a readability finding, not a balance one (audit §4 analysis (4)).

---

## D. What the Producer does with a filled sheet

1. **Transcribe.** Turn the chat lines into `docs/reviews/<play date>-playtest.md` (§B.1 filled in, with the interview answers verbatim). Also make a CSV for the helper with one row per try:
   - header `tester,level,bot,attempt,result,time,stars,first_ever,speed,boosters,help,named,log,iv,note` (optional `time_ms`);
   - `bot` = §B.1's "Bot" (seconds); `result` W / L / R; `time` mm:ss; `first_ever` 1 when "before" was 0;
   - `named` = the tester's colour, `log` = the colour from the recording;
   - `iv` 1 on the level-50 row when C.3 (iv) holds.
   
   When the Diagnostics log is pasted, take `timeMs`, `boosters` and `continued` from its CSV rows (`lvl`, `attempt`, `outcome`) instead of the card. Step 2a writes those rows of the CSV for you.
2. **Check the build against today's numbers.** Run `git diff --stat e2b6044 <build commit> -- tower-clash/src/levels tower-clash/src/ai tower-clash/src/sim`. If anything moved, re-run both `npm run playtest -- --seeds 20` and `npm run playtest -- --naive --seeds 20 --tie both` on the build's tree and put the new reference medians into the CSV's `bot` column.
2a. **Turn the log into the CSV.** `cd tower-clash && npm run playtest:log -- <log.txt> --tester <name> --out <play date>-playtest.csv --verify` (`scripts/playtestLog.ts`, QA-39). It writes one row per try, with `bot` measured on this tree (reference player, seeds 1–20), and verifies every `#replay` line (step 3a). Daily and weekly rows are left out. Fill `named`, `log`, `iv` and `note` by hand from the chat lines, then run step 3 on the file.
   - **AZ.** Jurnalı CSV-yə çevir: `cd tower-clash && npm run playtest:log -- <log.txt> --tester <ad> --out <sınaq tarixi>-playtest.csv --verify`. Hər cəhd bir sətirdir, `bot` bu ağacda ölçülür, hər `#replay` sətri yoxlanılır. `named`, `log`, `iv` və `note` sütunlarını əllə doldur, sonra 3-cü addımı işlət.
3. **Run the rules.** `cd tower-clash && npm run -s playtest:decide -- <sheet.csv> [--date <play date>]` (`scripts/playtestDecide.ts`, QA-36; `-s` keeps npm's banner out of the pasted markdown) prints markdown for the playtest review: the C.1 table (zone, proposed `star3`, band moves), H3, C.2's human half, C.3 per tester, C.4, the C.5 side outputs and a JSON block for `reclock.ts`'s `HUMAN` pin table. Each line is tagged `DECISION` (N ≥ 3) or `PROVISIONAL`. The JSON is a proposal: a row becomes a pin by hand, after the sign-off. Without the helper, apply §C by hand: take each row's bot median and clocks from §B.1 / §B.2, compute r, and read the zone tables.
   - **AZ.** CSV-də hər cəhd bir sətirdir, sütunlar yuxarıdakı 1-ci addımdakı kimidir. `bot` sütunu məcburidir: bu, §B.1-dəki "Bot" rəqəmidir (saniyə), hər səviyyənin ən azı bir sətrində olmalıdır. Saatlar (`star3` / `star2`) `src/levels/*.json`-dan oxunur. Hazır fayl `--levels <json>` ilə verilə bilər (`{ id: { s3, s2, bot } }`, saniyə). Qrup dəyişikliyi nümunədə olmayan səviyyələrin bot medianını tələb edəndə skript onu istinad oyunçusu ilə özü ölçür (K = 20). Səhv CSV sətir nömrəsi ilə rədd edilir (çıxış kodu 1).
   - **EN.** The CSV is one row per try with the step 1 columns. `bot` is required: §B.1's "Bot" (seconds), on at least one row of each level. The clocks (`star3` / `star2`) are read from `src/levels/*.json`, or from a pre-computed `--levels <json>` (`{ id: { s3, s2, bot } }`, seconds). When a band move needs the bot median of an unsampled level, the script measures it with the reference player (K = 20). A malformed CSV is rejected with its line number (exit 1).
3a. **Verify each interesting match.** `cd tower-clash && npx tsx scripts/replay.ts --from-log <log.txt> [--row N]` must print MATCH. A mismatch means the build differs from the record's rules id: compare the build numbers first (the `build` column of the log row against the tested build).
   - **AZ.** Maraqlı hər matç üçün yuxarıdakı əmri işlət: MATCH çıxmalıdır. Uyğunsuzluq qeydin qayda identifikatorundan fərqli build deməkdir: əvvəlcə build nömrələrini müqayisə et.
4. **Code the recordings** (17 / 33 / 49: who attacked first, when a king's colour vanished on 33 / 49) by someone who did not author those levels, at 2× speed, into the `log` column, then re-run step 3.
5. **Act on each `DECISION` line.**
   - **B4.** The Level Designer writes the new `star3` values into the level JSON. Before that, `scripts/reclock.ts` needs a human-clock pin table beside `KEEP` (gameplay / level-designer change in `scripts/`), or the next `reclock.ts --write` puts the bot clocks back. Then run `npx tsx scripts/reclock.ts --seeds 20` as a dry run (only the boundary step may move), `npm run levels:manifest`, `npm run check`, `npm run playtest -- --seeds 20` and the weekly gate (`--weekly <Monday> --weeks 26 --seeds 5`). Docs: GDD §3 star-clock bullet and items 8 / 10 (the meaning of 3★); How to Play and store text if zone S makes 3★ "beat the bot"; `TESTFLIGHT_TEST_PLAN.md` §0 item 10's clock list (Publisher); `RELEASE_NOTES.md`; ECONOMY's 3★-gated rows (Monetization).
   - **B5.** First the ECONOMY §6 re-run (Monetization). Then the card-spec floor in `reclock.ts` (GD-12: "each level's card spec beside `NAIVE_FLOOR_LAST_LEVEL`"; not implemented yet), then `reclock.ts --seeds 20 --write`, `npm run levels:manifest` and the gates. Then update the GD-12 status line in the GDD, the TF plan and the release notes. It ships on a release day (the daily scores re-map).
   - **Bands 5–6 / A3.** File the AI Engineer's flag change per the AI memo, re-measure with the memo's §2 table, and update the GDD §3 band table.
6. **Bookkeeping.** In `docs/BACKLOG.md`, mark the AUD-Q1 / AUD-A2 line with the recorded session, and put the B4 / B5 result on its line. Update the daily report (AZ) and the office page per the daily-sprint skill.

**Producer decisions (2026-11-05)**
1. **Build.** The sheet applies to build 27 or later. Times from build 26 are not comparable.
2. **Order and locked levels.** Play before TF-28. A locked sample level is replaced by first clears, and the remainder is played on another day.
3. **Testers.** By default the stakeholder plays alone, so every output row is "proposed". Two fresh testers are recommended but not required; the stakeholder decides.
4. **B5 gate.** The ±10 % gate on day-15 and day-30 cumulative gold (§C.2 item 1) is the rule.
5. **Tooling.** The Producer files two backlog tickets: the `reclock.ts` human-clock pin table and the GD-12 floor. `decide.mjs` was a scratch helper on 2026-11-05. On 2026-11-06 it moved into the repo as `scripts/playtestDecide.ts` with tests (QA-36, step 3). The §C rules can still be applied by hand from the §B.1 / §B.2 tables.

**What this protocol covers and misses.**
- **Covers:** pace against the bot on 15 levels across six bands, 2★ on five floored levels and on the 16 → 17 cliff, first-try difficulty on the §4.3 levels, enemy readability on three levels, and three interview answers.
- **Misses:** onboarding (H4 needs session A with a fresh tester), retention, the economy and shop, the daily and weekly, twists, boosters, and device performance.
- **Confidence:** at N = 1 every output is a hypothesis; at N = 3 it is a directional pattern; balance numbers move at N = 3 only because the audit and the memo set that bar. No event injection.
