# Tower Clash

**Capture every tower.** A one-thumb, capture-the-towers real-time strategy game for phones and browsers. Tap one of your towers, tap a target, and your soldiers march; when an enemy garrison hits zero the tower is yours. 40 hand-made levels, fortresses, artillery, tanks, mines, barriers, bridges you can cut, up to three enemies at once, three-star timers — fully offline, no ads, no purchases, no account.

Play in the browser: **https://pervincinal.github.io/InsiderTest/** (active once GitHub Pages is enabled in repo settings — see [`../docs/DEPLOY.md`](../docs/DEPLOY.md))

<p align="center">
  <img src="store/screenshots/en/02.png" width="30%" alt="Level 1 with the tutorial hint: One tap to attack">
  <img src="store/screenshots/en/04.png" width="30%" alt="Level 9 with a fortress: Storm the fortress">
  <img src="store/screenshots/en/06.png" width="30%" alt="Result screen with three stars: Three-star every level">
</p>

## How to play

1. Tap a **blue** tower to select it, then tap any tower connected by a road. Everyone marches there.
2. Friendly towers are reinforced; hostile towers lose one defender per attacker. Reduce a garrison below zero and the tower flips to you.
3. Tap a selected tower again to **upgrade** it (levels 1–3): faster production, bigger garrison. It costs soldiers from that tower.
4. **SEND 100 % / 50 %** toggles how many soldiers leave on each order.
5. **Fortresses** (level 9 onwards) halve the damage of every attack; **artillery** (level 12 onwards) shoots soldiers that walk into its range.
6. From level 17 you face **two enemies** (three from level 33) who also fight each other; **mines** kill the first soldiers to cross a road and **barriers** must be worn down or walked around.
7. **Tank factories** (level 25 onwards) build tanks that weigh five soldiers but crawl; **bridges** can be cut with a long press — the column on it drowns and the enemy behind it is stranded.
8. Win faster for more stars (3 / 2 / 1). Stars unlock the next level and pay coins on the first clear.

Keyboard on desktop: `P` / `Space` pause, `Esc` back to the level list, `M` mute.

## Install on a phone (PWA — no store needed)

The web build is an installable Progressive Web App: it works offline and opens fullscreen from the home screen.

- **iPhone / iPad (Safari only):** open the play link → Share → **Add to Home Screen** → Add.
- **Android (Chrome):** open the play link → ⋮ menu → **Install app** (or *Add to Home screen*) → Install.

## Android APK from CI

Every push that touches `tower-clash/` runs the **tower-clash-android** GitHub Actions workflow and attaches an unsigned debug APK.

1. GitHub → **Actions** → **tower-clash-android** → latest green run → **Artifacts** → `tower-clash-debug-apk`.
2. Unzip, copy `app-debug.apk` to the phone, tap it, allow installs from that source, and choose *Install anyway* if Play Protect warns (debug builds are unverified).

Step-by-step details, local Android/iOS builds and what a real store release needs: [`../docs/MOBILE.md`](../docs/MOBILE.md). Store texts, privacy policy, launch checklist and release notes: [`../docs/publishing/`](../docs/publishing/).

## Build from source

Requires Node 22.

```bash
cd tower-clash
npm ci
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run check      # typecheck + lint + unit tests + level validation
npm run playtest   # reference-player bot on every level
npm run e2e        # Playwright smoke test (Chromium)
npm run cap:sync   # copy dist/ into the android/ and ios/ Capacitor projects
```

Store screenshots and the feature graphic are rendered from the real game: `npm run build && node store/tools/renderStoreShots.mjs` (Google Play set) or `--apple` (App Store 6.7" / 6.5" sets); `--all` renders both.

No engine, no art assets: TypeScript, HTML5 Canvas 2D and WebAudio. The simulation (`src/sim/`) is deterministic and DOM-free; rendering, input and AI sit on top of it. Design rules: [`../docs/GDD.md`](../docs/GDD.md).

## Credits and license

Built by an autonomous Claude agent team (producer, engineers, level designer, QA, publisher) with a human stakeholder reading daily reports. Version 0.2.0 — see [`../docs/publishing/RELEASE_NOTES.md`](../docs/publishing/RELEASE_NOTES.md).

License: All rights reserved (placeholder).

---

# Tower Clash (Azərbaycanca)

**Bütün qüllələri tut.** Telefon və brauzer üçün bir barmaqla oynanan qüllə tutma real vaxt strategiya oyunu. Öz qüllənə toxun, hədəfə toxun — əsgərlərin yola düşür; düşmən qarnizonu sıfıra düşəndə qüllə sənindir. 40 əl ilə hazırlanmış səviyyə, qalalar, toplar, tanklar, minalar, sədlər, kəsilə bilən körpülər, eyni anda üçə qədər rəqib, üç ulduzlu vaxt limiti — tam oflayn, reklamsız, alışsız, hesabsız.

Brauzerdə oyna: **https://pervincinal.github.io/InsiderTest/** (repo parametrlərində GitHub Pages aktivləşdirilən kimi işləyir — bax [`../docs/DEPLOY.md`](../docs/DEPLOY.md))

## Necə oynanır

1. **Mavi** qülləyə toxunub seç, sonra yolla bağlı istənilən qülləyə toxun. Hamı ora gedir.
2. Dost qüllələr güclənir; düşmən qüllələrində hər hücumçu bir müdafiəçini aparır. Qarnizon sıfırın altına düşəndə qüllə sənə keçir.
3. Seçilmiş qülləyə bir daha toxun — **təkmilləşdirmə** (1–3 səviyyə): daha sürətli istehsal, daha böyük qarnizon. Həmin qüllənin əsgərləri ilə ödənilir.
4. **SEND 100 % / 50 %** hər əmrlə neçə əsgərin çıxacağını dəyişir.
5. **Qalalar** (9-cu səviyyədən) hər hücumun zərərini yarıya endirir; **toplar** (12-ci səviyyədən) mənzilinə girən əsgərləri vurur.
6. 17-ci səviyyədən **iki rəqib** (33-cü səviyyədən üç) — onlar bir-biri ilə də vuruşur; **minalar** yoldan ilk keçən əsgərləri məhv edir, **sədlər** aşındırılmalı və ya yan keçilməlidir.
7. **Tank zavodları** (25-ci səviyyədən) beş əsgər ağırlığında, amma yavaş tanklar istehsal edir; **körpülər** uzun basışla kəsilir — körpüdəki kolon batır, arxadakı düşmən ilişib qalır.
8. Tez qalib gəl — daha çox ulduz (3 / 2 / 1). Ulduzlar növbəti səviyyəni açır və ilk keçiddə sikkə qazandırır.

Masaüstündə klaviatura: `P` / `Space` pauza, `Esc` səviyyə siyahısına, `M` səsi söndürür. Oyunun interfeysi ingilis dilindədir.

## Telefona quraşdırma (PWA — mağaza lazım deyil)

- **iPhone / iPad (yalnız Safari):** oyun linkini aç → Paylaş → **Ana ekrana əlavə et** → Əlavə et.
- **Android (Chrome):** oyun linkini aç → ⋮ menyu → **Tətbiqi quraşdır** (və ya *Ana ekrana əlavə et*) → Quraşdır.

Quraşdırıldıqdan sonra oyun oflayn işləyir və ana ekrandan tam ekran açılır.

## CI-dan Android APK

Hər push-dan sonra **tower-clash-android** GitHub Actions workflow-u imzasız debug APK hazırlayır: GitHub → **Actions** → **tower-clash-android** → son yaşıl run → **Artifacts** → `tower-clash-debug-apk`. Zipi aç, `app-debug.apk` faylını telefona köçür, üstünə toxun, naməlum mənbədən quraşdırmağa icazə ver; Play Protect xəbərdarlıq etsə *Yenə də quraşdır* seç. Ətraflı: [`../docs/MOBILE.md`](../docs/MOBILE.md).

## Mənbədən qurmaq

Node 22 lazımdır. `tower-clash/` qovluğunda: `npm ci`, sonra `npm run dev` (yerli server), `npm run build` (istehsal build-i `dist/`-ə), `npm run check` (tip yoxlaması + lint + testlər + səviyyə yoxlaması), `npm run playtest` (bot bütün səviyyələri oynayır), `npm run e2e` (Playwright smoke testi).

## Müəlliflər və lisenziya

Avtonom Claude agent komandası tərəfindən hazırlanıb (prodüser, mühəndislər, səviyyə dizayneri, QA, nəşriyyatçı); insan tərəf gündəlik hesabatları oxuyur. Versiya 0.2.0 — bax [`../docs/publishing/RELEASE_NOTES.md`](../docs/publishing/RELEASE_NOTES.md).

Lisenziya: Bütün hüquqlar qorunur (müvəqqəti qeyd).
