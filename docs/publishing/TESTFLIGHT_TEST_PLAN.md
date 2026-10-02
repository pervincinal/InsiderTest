# TestFlight test plan — Tower Clash 1.0.0 (7) on the stakeholder's iPhone (QA-12)

Owner: QA Engineer · written 2026-10-02 against branch head `e237f06` · first real-device pass for **QA-2** (iOS half) and **MM-1 for iOS**, plus the on-device halves of **MM-4** (memory / DPR cap) and **M3-5** (performance).
Build: **1.0.0 (7)** from the `tower-clash-ios-release` workflow, lane **testflight**, made **without** `RC_IOS_KEY` (store unavailable, LAUNCH_CHECKLIST §0b variant B) and **without** real AdMob ids (Google "Test Ad" placeholders).
Install path: LAUNCH_CHECKLIST.md §0b step 6. Severities: POST_LAUNCH.md §5.1. Day boundary: GDD §7.4 (00:00 UTC = **04:00 Baku**).

The Azerbaijani part comes first; the English mirror (same ids, same order) follows it.

---

## AZ — iPhone-da TestFlight yoxlaması (≈ 30 dəqiqə)

### 0. Başlamazdan əvvəl (2 dəq)

1. iPhone modelini və iOS versiyasını yaz: **Ayarlar → Ümumi → Haqqında** (*Model adı*, *iOS versiyası*). Hesabatın ilk sətri bu olacaq.
2. Batareya ≥ 50 %, **Aşağı enerji rejimi söndürülü** olsun (batareya ikonu sarı olmamalıdır) — bu rejim oyunu 30 kadra endirir və TF-13-ün nəticəsini korlayır.
3. Səs: yan açar (Ring/Silent) **zəng** rejimində olsun (iPhone 15 Pro və sonrakılarda Action düyməsi ilə səssiz rejim söndürülsün), səs düymələri ilə səsi ucalt. *Səssiz rejimdə oyunun səsi çıxmır — bu iOS-un normal davranışıdır, xəta deyil.*
4. İdarəetmə mərkəzi (sağ yuxarı küncdən aşağı sürüşdür) → **ekran fırlanma kilidi (kilidli dairəvi ox) SÖNDÜRÜLÜ** olsun (TF-04 üçün).
5. Başlama saatını yaz.
6. **Skrinşot:** yan düymə + səs artırma düyməsini eyni anda bas (Home düyməli iPhone-da: Home + yan düymə). Şəkil *Şəkillər* tətbiqinə düşür; çatda adi şəkil kimi əlavə et. **Ekran yazısı** (titrəmə / donma üçün): İdarəetmə mərkəzi → dairəli nöqtə düyməsi → 3 saniyə sonra yazır; dayandırmaq üçün yuxarıdakı qırmızı nişana toxun.
7. **Tətbiq çöksə** və TestFlight "Share additional information?" / "Əlavə məlumat paylaşılsın?" soruşsa: **Share** → şərhə yoxlamanın id-sini yaz (məs. `TF-12`). Sonra çatda da yaz — TestFlight rəyini yalnız sən App Store Connect-də görürsən, komanda görmür.
8. **Vaxt çatmasa**, bu ardıcıllıqla et: TF-01, 02, 03, 05, 06, 07, 10, 12, 13, 15, 17, 18. Qalanları sonra.

Rəng adları: **sənin qüllələrin göy**, düşmən **qırmızı**, neytral **boz**. "Çentik / Dynamic Island" = ekranın yuxarısındakı qara kəsik və ya qara "ada"; "ev xətti" = ekranın ən aşağısındakı nazik üfüqi xətt.

### Xülasə

| ID | Yoxlama | Dəq | Bağlayır | Alınmasa ciddilik |
|---|---|---|---|---|
| TF-01 | Quraşdırma və ilk açılış vaxtı | 2 | QA-2 | S1 açılmır / çökür · S2 > 10 s və ya izləmə sorğusu |
| TF-02 | Başlıq ekranı çentikdən və ev xəttindən təmiz; ilk dil | 1 | MM-1 | S2 · S3 (yalnız dil) |
| TF-03 | Səs ilk toxunuşda başlayır | 1 | MM-1 | S2 |
| TF-04 | Ekran yalnız şaquli (portret) qalır | 0,5 | MM-1 | S2 |
| TF-05 | Səviyyə 1 bir barmaqla + təlim ipucları | 2 | QA-2 | S1 keçilmir · S2 |
| TF-06 | Oyun paneli (HUD) və FASİLƏ kartı çentikdən təmiz | 1 | MM-1 | S2 |
| TF-07 | Nəticə kartı (QƏLƏBƏ) ev xəttindən təmiz | 0,5 | MM-1 | S2 |
| TF-08 | Səviyyə 2: seçimi ləğv et, axını dayandır, zoom yoxdur | 2 | QA-2 | S2 |
| TF-09 | Səviyyə 3: "25-ə dolsun" ipucu, qüllə L2 olur | 2 | QA-2 | S2 |
| TF-10 | Döyüş zamanı arxa plana çıx: səs kəsilir, oyun fasilədə qalır | 1 | MM-1 | S2 |
| TF-11 | "Axın ilişib" ipucu (səviyyə 2 təkrarı, istəyə bağlı) | 3 | QA-2 | S3 |
| TF-12 | Səviyyə 4–8 ardıcıl + iki dəfə arxa plan (yaddaş / çökmə) | 6 | QA-2, MM-4 | S1 çökmə / döyüşdə reklam · S2 özü başlığa qayıdır |
| TF-13 | Səviyyə 9 (və ya 10–12) ×1 sürətdə: səlistlik, istilik, kəskinlik | 3 | M3-5, MM-4 | S2 daim titrəyir / qızır · S3 arabir |
| TF-14 | GÜNLÜK kart: geri sayım, bugünkü səviyyə, oyun | 2 | QA-2 | S1 açılmır · S2 səhv səviyyə / vaxt |
| TF-15 | Mağaza "mağaza əlçatan deyil" halında | 2 | MM-1, QA-2 | S1 Apple ödəniş pəncərəsi · S2 · S3 mətn |
| TF-16 | Ayarlar: AZ dili, rəng korluğu, az hərəkət, "Necə oynanır", məxfilik | 3 | QA-2 | S2 · S3 |
| TF-17 | Tətbiqi tam bağla, yenidən aç — irəliləyiş qalır | 1 | QA-2 | S1 |
| TF-18 | Təyyarə rejimi: oyun və GÜNLÜK kart işləyir | 2 | QA-2 | S1 açılmır · S2 kart |
| TF-19 | 04:00 (Bakı) günlük dəyişmə (istəyə bağlı) | 3 | QA-2 | S2 |

Ciddilik (POST_LAUNCH §5.1): **S1** — çökmə, keçilməyən / açılmayan səviyyə, irəliləyişin itməsi, döyüş zamanı və ya 1–5-ci səviyyələrdə reklam → eyni gün düzəliş. **S2** — funksiya bəzi istifadəçilərdə işləmir (dil, cihaz, mağaza) → 2 sessiya ərzində. **S3** — kosmetik, mətn, bir cihaza aid xırda şey → növbəti buraxılış.

### Yoxlamalar

#### TF-01 · Quraşdırma və ilk açılış vaxtı (2 dəq)
- **Toxun:** TestFlight tətbiqi → **Tower Clash** → **Install** (Quraşdır). Bitəndə **Open** (Aç) düyməsinə toxun və saniyəni saymağa başla — böyük **PLAY / OYNA** düyməli başlıq ekranı görünənə qədər.
- **Gözlənilən:** ana ekranda "Tower Clash" ikonu; qısa tünd-göy açılış ekranı, sonra ≤ 5 saniyədə başlıq ekranı. **Heç bir sorğu çıxmır**: nə "Tower Clash-ə fəaliyyətinizi izləməyə icazə verilsin?", nə bildiriş icazəsi, nə Google reklam razılığı forması (bu forma yalnız AB / Böyük Britaniyada çıxır).
- **Alınmasa yaz:** `TF-01 FAIL: açılış N s / çökdü / "izləmə" sorğusu çıxdı`. Uğurlu olsa da saniyəni yaz: `TF-01 OK 3 s`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — açılmır və ya çökür; S2 — 10 saniyədən uzun və ya izləmə sorğusu çıxır.

#### TF-02 · Başlıq ekranı çentikdən və ev xəttindən təmiz; ilk dil (1 dəq)
- **Toxun:** hələ heç nəyə toxunma — yalnız bax. Skrinşot çək.
- **Gözlənilən:** sağ yuxarı küncdəki dil düyməsi (EN / AZ / RU / TR) tam görünür, çentiyin / Dynamic Island-ın altında deyil; ekranın aşağısındakı qızıl / kristal zolağı ev xəttinin üstündədir, kəsilmir. Çentiyin ətrafında və ən aşağıda sadə rəngli zolaq olması **normaldır**. Dil: telefonun dili AZ / RU / TR / EN-dirsə, oyun da həmin dildə açılmalıdır.
- **Alınmasa yaz:** `TF-02 FAIL: <nə> çentiyin / ev xəttinin altındadır` və ya `TF-02 dil: oyun EN açıldı, telefon AZ-dır`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2 — düymə / mətn çentiyin və ya ev xəttinin altındadır; S3 — yalnız ilk dil səhvdir (Ayarlardan dəyişmək olur).

#### TF-03 · Səs ilk toxunuşda başlayır (1 dəq)
- **Toxun:** tətbiqdə **ilk toxunuşun** sağ yuxarıdakı dil düyməsi olsun. Mətnlər Azərbaycanca olana qədər toxunmağa davam et (düymədə **AZ**, böyük düymədə **OYNA** yazılır). Sonra **Səs açıq / Səs bağlı** düyməsinə iki dəfə toxun.
- **Gözlənilən:** **elə ilk toxunuşda** qısa "klik" səsi eşidilir, sonrakı hər toxunuşda da. "Səs bağlı" olanda klik yoxdur, "Səs açıq" olanda qayıdır. (Səs ümumiyyətlə yoxdursa, əvvəlcə 0-cı bölmənin 3-cü bəndini yoxla.)
- **Alınmasa yaz:** `TF-03 FAIL: ilk toxunuş səssiz, səs N-ci toxunuşdan` və ya `TF-03 FAIL: heç səs yoxdur (zəng rejimi açıq)`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-04 · Ekran yalnız şaquli qalır (0,5 dəq)
- **Toxun:** başlıq ekranında telefonu 3 saniyəlik yan çevir (üfüqi), sonra geri. Sonra TF-05-də, döyüş zamanı bir daha.
- **Gözlənilən:** oyun dönmür, şaquli qalır, heç nə dartılmır və kəsilmir.
- **Alınmasa yaz:** `TF-04 FAIL: ekran yana döndü / görüntü pozuldu`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-05 · Səviyyə 1 bir barmaqla + təlim ipucları (2 dəq)
- **Toxun:** **OYNA** → **SƏVİYYƏLƏR** xəritəsi → **1** yazılan dairə ("İlk Toxunuş"). Yuxarıda "DƏRS" kartı görünür. Yalnız **bir barmaqla**: ipucu **"Öz qüllənə toxun"** çıxanda halqa ilə göstərilən göy qülləyə toxun → ipucu **"İndi boz qülləyə toxun — axın özü davam edir"** olur → boz qülləyə toxun. Sonra öz qülləndən qırmızı qülləyə axın aç (öz qüllən, sonra qırmızı) və qalib gəl.
- **Gözlənilən:** toxunuş barmağın düz altındakı qülləyə düşür (sürüşmə yoxdur); seçilən qüllə işıqlanır; əsgərlər axınla gedir; qüllə sənin olanda telefon yüngülcə titrəyir (Ayarlar → Səslər və Haptika → Sistem haptikası açıqdırsa). Səviyyə **QƏLƏBƏ** kartı ilə bitir.
- **Alınmasa yaz:** `TF-05 FAIL: toxunuş qəbul olunmur / başqa qülləyə düşür / ipucu görünmədi`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — səviyyə 1 keçilmir və ya toxunuşlar işləmir; S2 — toxunuş sürüşür, ipucu yoxdur.

#### TF-06 · Oyun paneli (HUD) və FASİLƏ kartı çentikdən təmiz (1 dəq)
- **Toxun:** səviyyə 1 və ya 2 gedərkən skrinşot çək. Sonra sağ yuxarıdakı **II** (fasilə) düyməsinə toxun → **FASİLƏ** kartı → skrinşot → **DAVAM ET**.
- **Gözlənilən:** yuxarı zolaq (solda "SƏVİYYƏ 1", ortada vaxt, səs düyməsi, **II**) tamamilə çentiyin / Dynamic Island-ın **altında**dır, üstündə deyil; aşağı zolaq ("AXINLAR", gücləndiricilər, sikkələr, **MENYU**) ev xəttinin üstündədir. FASİLƏ kartında **DAVAM ET, SÜRƏT ×1, SƏS, AYARLAR, YENİDƏN, MENYU, NECƏ OYNANIR** hamısı görünür və toxunulur.
- **Alınmasa yaz:** `TF-06 FAIL: <düymə> çentiyin / ev xəttinin altındadır` (+ skrinşot).
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-07 · Nəticə kartı ev xəttindən təmiz (0,5 dəq)
- **Toxun:** səviyyə 1-i udanda kartın skrinşotunu çək.
- **Gözlənilən:** **QƏLƏBƏ**, ulduzlar, "Vaxt …", "3 ulduz: …-dək · 2 ulduz: …-dək" və **NÖVBƏTİ / YENİDƏN / MENYU** düymələri tam görünür. **×2 QIZIL** düyməsi varsa (istəyə bağlı): toxun → Google-un **"Test Ad"** videosu açılır, bitəndə bağla → qızıl ikiqat olur. TestFlight-da "Test Ad" **normaldır**.
- **Alınmasa yaz:** `TF-07 FAIL: <düymə> kəsilib / ev xəttinin altındadır`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-08 · Səviyyə 2: seçimi ləğv et, axını dayandır, zoom yoxdur (2 dəq)
- **Toxun:** **NÖVBƏTİ** → səviyyə 2 "Təchizat Xətti".
  1. İpucu **"Öz qüllənə, sonra boz qülləyə toxun"** (halqa ortadakı boz qüllədə) → öz qüllənə, sonra ortadakı boz qülləyə toxun.
  2. İpucu **"Axını dayandırmaq üçün hədəfə yenə toxun"** → ortadakı qülləyə yenə toxun (heç nə olmasa: əvvəl öz qüllənə, sonra ortadakına).
  3. **Seçimi ləğv et:** öz qüllənə bir dəfə toxun (işıqlanır, aşağıda "Axın üçün xətti açıq olan qülləyə toxun · …" yazısı çıxır) → **eyni qülləyə yenə toxun**.
  4. Bir qülləyə **cəld iki dəfə** toxun; sonra bir qülləni **1 saniyə basılı saxla**.
  5. Səviyyəni udmağa davam et.
- **Gözlənilən:** 1 — axın başlayır; 2 — axın dayanır, ipucu yox olur; 3 — işıq və aşağıdakı yazı yox olur, axın açılmır; 4 — ekran **böyümür (zoom yoxdur)**, böyüdücü şüşə, "Kopyala" menyusu və ya mətn seçimi **çıxmır**.
- **Alınmasa yaz:** `TF-08 FAIL: addım N — <nə oldu>`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2.

#### TF-09 · Səviyyə 3: "25-ə dolsun" ipucu, qüllə L2 olur (2 dəq)
- **Toxun:** **NÖVBƏTİ** → səviyyə 3 "Sahibsiz Torpaq". İki boz qülləni al; sonra axınları dayandır ki, öz qüllən dolsun.
- **Gözlənilən:** ipucu **"Qoy qüllə 25-ə dolsun və yüksəlsin — L2 iki hədəfə hücum edir"**; qüllə 25-ə çatanda böyüyür (2-ci səviyyə), ipucu yox olur; səviyyə **QƏLƏBƏ** ilə bitir.
- **Alınmasa yaz:** `TF-09 FAIL: ipucu çıxmadı / qüllə 25-də böyümədi / ipucu qaldı`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2 (yalnız mətn səhvdirsə S3).

#### TF-10 · Döyüş zamanı arxa plana çıx: səs kəsilir, oyun fasilədə qalır (1 dəq)
- **Toxun:** səviyyə 3 və ya 4-də, əsgərlər hərəkətdə və səs gələrkən yuxarıdakı vaxtı yadda saxla → ekranın aşağısından yuxarı sürüşdür (ana ekrana çıx) → 10 saniyə gözlə, qulaq as → Tower Clash-i yenidən aç.
- **Gözlənilən:** ana ekranda oyun səsi **eşidilmir**; qayıdanda oyun **FASİLƏ** kartında dayanıb, vaxt irəli getməyib, səviyyə uduzulmayıb; **DAVAM ET** → oyun davam edir, səs növbəti toxunuşda qayıdır; yuxarı / aşağı zolaq yenə çentikdən təmizdir (TF-06 kimi).
- **Alınmasa yaz:** `TF-10 FAIL: səs arxa planda davam etdi / qayıdanda oyun getmişdi / səs qayıtmadı`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-11 · "Axın ilişib" ipucu — istəyə bağlı (3 dəq)
- **Toxun:** **MENYU** → xəritədə **2** (artıq keçilib, təlim ipucu yoxdur). Səviyyə başlayan kimi (ilk 3 saniyədə): öz aşağı qüllənə, sonra **sağdakı** boz qülləyə toxun. Ortadakı boz qülləni qırmızı alacaq. Təxminən **0:12**-də ortadakı qüllədən sənin qülləyə qırmızı axın gəlir → dərhal (2 saniyə ərzində): öz qüllənə → sağdakı qülləyə (axın dayanır) → **ortadakı** qülləyə toxun (sənin axının qırmızıya qarşı gedir).
- **Gözlənilən:** ~8–10 saniyə sonra bir dəfə qırmızı yazı: **"Axın ilişib — dayandır və başqa tərəfdən vur"**. Sonra səviyyəni adi qaydada bitir.
- **Alınmasa yaz:** vəziyyət yaranmadısa (qırmızı hücum etmədi) — `TF-11 alınmadı` (bu xəta **deyil**); addımları etdin, axınlar 15 saniyədən çox bir-birini yeyir, yazı yoxdur — `TF-11 FAIL: ipucu çıxmadı`.
- **Bağlayır:** QA-2 · **Ciddilik:** S3.

#### TF-12 · Səviyyə 4–8 ardıcıl + iki dəfə arxa plan (yaddaş / çökmə) (6 dəq)
- **Toxun:** vaxta qənaət üçün **II → SÜRƏT ×1** düyməsinə toxun ki, **×2** olsun. Hər qələbədən sonra **NÖVBƏTİ**; uduzsan **YENİDƏN**. Səviyyə 5-də: ana ekrana çıx, 10 s gözlə, qayıt, **DAVAM ET**. Səviyyə 7-də: ana ekrana çıx, **Kamera** və ya **Safari**-ni 30 s işlət, qayıt, **DAVAM ET**.
- **Gözlənilən:** çökmə yoxdur; oyun **özü başlıq ekranına qayıtmır** (bu, iPhone-un oyunu yaddaş üçün bağladığının əlamətidir); qayıdanda FASİLƏ kartı görünür. Altıncı bitmiş səviyyədən sonra (qələbə də, məğlubiyyət də sayılır) səviyyələr **arasında** tam ekran Google **"Test Ad"** reklamı çıxa bilər — TestFlight-da normaldır, × ilə bağla. Döyüş **zamanı** reklam heç vaxt, ilk 5 bitmiş səviyyədən sonra da reklam **olmamalıdır**. Səviyyə 8-dən sonra GÜNLÜK kart açılır.
- **Alınmasa yaz:** `TF-12 FAIL: səviyyə N-də çökdü / özü başlığa qayıtdı / döyüş vaxtı reklam`.
- **Bağlayır:** QA-2, MM-4 · **Ciddilik:** S1 — çökmə, döyüş zamanı reklam və ya ilk 5 bitmiş səviyyədə reklam; S2 — özü başlığa qayıdır (irəliləyiş qalsa da).

#### TF-13 · Səviyyə 9 (və ya 10–12) ×1 sürətdə: səlistlik, istilik, kəskinlik (3 dəq)
- **Toxun:** **II → SÜRƏT ×2**-yə toxun ki, yenə **×1** olsun. Səviyyə 9 "Daş Divarlar"-ı (və ya 10 "Xətti Saxla", 11 "Qalanı Ac Qoy", 12 "Top Postu") **2 dəqiqə** oyna, ən çox əsgərin toqquşduğu anlara diqqət et. Sonda telefonun arxasına toxun.
- **Gözlənilən — həmişə cavab yaz:** (a) səlistlik **1–5** (5 = video kimi axıcı, 1 = qırıq-qırıq); (b) telefon **soyuq / ilıq / isti**; (c) qüllə rəqəmləri və yazılar adi məsafədən **aydın**dır, yoxsa bulanıq? Gözlənilən: 4–5, ən çox ilıq, aydın. *İstəyə bağlı müqayisə:* Safari-də `https://pervincinal.github.io/InsiderTest/?dprcap=3` aç (veb versiya, ayrıca irəliləyiş) — başlıq yazıları tətbiqdəkindən yalnız "burnunu ekrana dirəyəndə" fərqlənməlidir.
- **Cavab nümunəsi:** `TF-13: səlistlik 4/5, ilıq, mətn aydın`; problem varsa ekran yazısı əlavə et.
- **Bağlayır:** M3-5, MM-4 · **Ciddilik:** S2 — daim titrəyir (≤ 2/5) və ya telefon isti olur; S3 — arabir ilişmə (3/5) və ya mətn yaxından bir az yumşaq.

#### TF-14 · GÜNLÜK kart: geri sayım, bugünkü səviyyə, oyun (2 dəq)
- **Toxun:** **MENYU** → **SƏVİYYƏLƏR** xəritəsi; yuxarıdakı **GÜNLÜK** karta bax. Səviyyə 8 keçilibsə karta toxun və oyna.
- **Gözlənilən:** səviyyə 8-dən əvvəl kartda qıfıl, **"Səviyyə 8 keçiləndə açılır"** və **"Yenisi N saata (00:00 UTC)"**. N = Bakı vaxtı ilə 04:00-a qalan saat, yuxarı yuvarlaqlaşdırılmış (məs. 21:15-də → 7); son saatda "Yenisi 12:34 sonra (00:00 UTC)". Açıldıqdan sonra 2-ci sətir: **səviyyə adı · çətinlik** aşağıdakı cədvəldəki kimi. Qələbə → **"Günlük çağırış keçildi · +… qızıl +5 kristal · seriya 1"**; kart **TAMAM** və "Rekord …★ · vaxt" göstərir. Kartın altında **"Dünənki xəritə"** sətri görünsə — yeni əlavədir, istəyə bağlı.
- **Alınmasa yaz:** `TF-14 FAIL: kartda X yazılıb, cədvəldə Y / geri sayım N saat, gözlənilən M / açılmadı`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — günlük səviyyə açılmır və ya çökür; S2 — səhv səviyyə və ya səhv geri sayım.

Günlük cədvəl (tarix UTC-dir: Bakıda həmin gün **04:00**-dan növbəti gün **03:59**-a qədər):

| Tarix (UTC) | Səviyyə | Kartda | Tarix (UTC) | Səviyyə | Kartda |
|---|---|---|---|---|---|
| 2026-10-02 | 13 | Çarpaz Atəş · Nazik divarlar | 2026-10-09 | 47 | Yanmış Torpaq · Güclü qarnizon |
| 2026-10-03 | 10 | Xətti Saxla · Az ərzaq | 2026-10-10 | 38 | Atəş Halqası · Az ərzaq |
| 2026-10-04 | 24 | Sınaq Keçidi · Klassik | 2026-10-11 | 14 | Top və Divar · İti addım |
| 2026-10-05 | 25 | Ağır Metal · Nazik divarlar | 2026-10-12 | 33 | Üç Kral · Klassik |
| 2026-10-06 | 23 | İlk Qan · Güclü qarnizon | 2026-10-13 | 15 | Sitadel · İti addım |
| 2026-10-07 | 17 | Mina Sahəsi · İti addım | 2026-10-14 | 30 | Bir Cəbhə · Güclü qarnizon |
| 2026-10-08 | 39 | Uzun Gecə · Az ərzaq | | | |

#### TF-15 · Mağaza "mağaza əlçatan deyil" halında (2 dəq)
- **Toxun:** başlıq ekranı → **MAĞAZA**. Tablar: **KRİSTAL / DƏSTLƏR / GÖRÜNÜŞ / TƏLİM**.
  1. **KRİSTAL**: qiymət düymələrinə bax ($0.99 …), birinə toxun. Aşağı sürüşdür, **ALIŞLARI BƏRPA ET**-ə toxun. Kristalın ≥ 20-dirsə: **ÇEVİR** → təsdiq et.
  2. **DƏSTLƏR**: bir dəstin qiymətinə toxun; **Gücləndirici sandığı**-na toxun.
  3. **GÖRÜNÜŞ**: **Şifer** (80 kristal) və "YALNIZ DƏSTDƏ" yazılan bir görünüşə toxun.
  4. **TƏLİM**: qızılın çatırsa bir təkmilləşdirmə al.
- **Gözlənilən:** 1 — qiymət düymələri **boz**dur, ən aşağıda **"Mağaza bu platformada mümkün deyil."** yazılıb; toxunanda qırmızı yazı **"Mağaza bu platformada mümkün deyil"**; **Apple ödəniş pəncərəsi, Apple ID parolu sorğusu çıxmır**; ÇEVİR → "… kristal … qızıla çevrildi". 2 — eyni; sandıq: 60 kristalın yoxdursa "Sandıq üçün 60 kristal lazımdır". 3 — 30 dəqiqəlik oyunla kristal azdır, ona görə **"Kristal çatmır"** düzgün nəticədir, kristal sayı dəyişmir (≥ 80-dirsə: "Şifer dam açıldı və taxıldı"); "YALNIZ DƏSTDƏ" → "Başlanğıc dəsti ilə gəlir" və ya "Premium dəsti ilə gəlir". 4 — "<ad> pillə 1: …" yazısı, qızıl azalır.
- **Alınmasa yaz:** `TF-15 FAIL: Apple ödəniş pəncərəsi açıldı / düymələr boz deyil / <tab> çökdü / mətn: …`.
- **Bağlayır:** MM-1, QA-2 · **Ciddilik:** S1 — Apple ödəniş pəncərəsi və ya pul tələbi; S2 — çökmə, düymələr aktiv görünür, yazı yoxdur; S3 — mətn / tərcümə.

#### TF-16 · Ayarlar (3 dəq)
- **Toxun:** başlıq ekranı → **Ayarlar**. **İRƏLİLƏYİŞİ SIFIRLA**-ya **toxunma**.
  1. **Dil** sətrində **Azərbaycanca** seçili olsun (deyilsə seç).
  2. **Rəng korluğu** → **AÇIQ** → **GERİ** → **OYNA** → istənilən səviyyəni aç, bax → **MENYU**. Sonra yenə **Ayarlar**-da istədiyin kimi qoy.
  3. **Az hərəkət** → **AÇIQ** → **GERİ**, başlıq ekranına bax → **Ayarlar** → **AVTO**.
  4. **Necə oynanır** → kart → **ANLADIM**.
  5. Aşağıdakı "Haqqında" kartına bax: versiya və **MƏXFİLİK SEÇİMLƏRİ** düyməsi (varsa toxun).
- **Gözlənilən:** 1 — bütün menyular Azərbaycanca. 2 — düşmən qüllələri **qırmızıdan narıncıya** keçir, səninkilər göy qalır. 3 — başlıq ekranında yeriyən əsgərlər dayanır, partlayış effektləri azalır; AVTO iPhone-un *Hərəkəti azalt* ayarına uyğundur. 4 — **NECƏ OYNANIR** kartında 5 qayda, hamısı ekrana sığır, **ANLADIM** Ayarlara qaytarır. 5 — **"Versiya 1.0.0 (build 7)"** və "İrəliləyiş bu cihazda saxlanılır". Azərbaycanda **MƏXFİLİK SEÇİMLƏRİ** düyməsinin **olmaması normaldır** (Google onu yalnız AB / Böyük Britaniyada göstərir); varsa, toxunanda Google forması açılıb oyuna qayıtmalıdır. "Dəstək ID" sətri bu buildda **yoxdur** — normaldır.
- **Alınmasa yaz:** `TF-16 FAIL: addım N — <nə oldu>`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2 — ayar tətbiq olunmur, versiya fərqlidir, məxfilik düyməsi xəta verir; S3 — görünüş / mətn.

#### TF-17 · Tətbiqi tam bağla, yenidən aç — irəliləyiş qalır (1 dəq)
- **Toxun:** ekranın aşağısından yuxarı sürüşdür və ortada saxla (tətbiq dəyişdirici) → Tower Clash kartını yuxarı at. İkonla yenidən aç → **OYNA**.
- **Gözlənilən:** dil yenə **Azərbaycanca**; aşağıdakı qızıl / kristal əvvəlki kimi; xəritədə keçdiyin səviyyələrin ulduzları yerində; Rəng korluğu ayarı necə qoymusansa elədir.
- **Alınmasa yaz:** `TF-17 FAIL: ulduzlar / qızıl / dil itdi`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 (məlumat itkisi).

#### TF-18 · Təyyarə rejimi: oyun və GÜNLÜK kart işləyir (2 dəq)
- **Toxun:** İdarəetmə mərkəzi → **Təyyarə rejimi AÇIQ**, Wi-Fi ikonu da sönük olsun. Tətbiqi TF-17 kimi tam bağla və yenidən aç → **OYNA** → istənilən səviyyəni sona qədər oyna → xəritədə GÜNLÜK karta bax (açıqdırsa toxun, bir az oyna). Sonda Təyyarə rejimini **söndür**.
- **Gözlənilən:** başlıq ekranı adi vaxtda açılır; səviyyə yüklənir, **"Yüklənmədi — bağlantını yoxla"** yazısı çıxmır; GÜNLÜK kart geri sayımı göstərir və səviyyəni açır. Nəticə kartında **×2 QIZIL** olmaya bilər və ya "Hazırda video yoxdur" yaza bilər — internetsiz normaldır.
- **Alınmasa yaz:** `TF-18 FAIL: internetsiz açılmadı / səviyyə yüklənmədi / günlük kart: …`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — tətbiq və ya səviyyə internetsiz açılmır; S2 — yalnız GÜNLÜK kart işləmir.

#### TF-19 · 04:00 (Bakı) günlük dəyişmə — istəyə bağlı (3 dəq)
- **Toxun (A, təbii):** Bakı vaxtı ilə 03:57-də oyunu aç, **SƏVİYYƏLƏR** xəritəsində GÜNLÜK karta bax və 04:01-ə qədər gözlə.
- **Toxun (B, saatı dəyiş — bütün başqa yoxlamalardan sonra):** iPhone **Ayarlar → Ümumi → Tarix və Vaxt** → **Avtomatik təyin et SÖNDÜR** → vaxtı **03:58** et (sabahın tarixi də olar) → oyunu aç → xəritə → 2–3 dəqiqə gözlə → sonra **Avtomatik təyin et-i yenə AÇ**. Saatı dəyişmək bu test qurğusunda seriyanı / gündəlik mükafatı qarışdıra bilər — bu xəta **deyil**.
- **Gözlənilən:** 04:00-a az qalanda kartda "Yenisi 01:59 sonra (00:00 UTC)" kimi geri sayım; tam 04:00-da kart **növbəti günün** səviyyəsinə keçir (cədvəl), əgər bugünkü keçilmişdisə **TAMAM** yox olur. Kart qıfıllıdırsa, yalnız geri sayımın sıfırlanıb ~24 saata qayıtmasına bax.
- **Alınmasa yaz:** `TF-19 FAIL: 04:00-da kart dəyişmədi / başqa saatda dəyişdi (HH:MM)`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2.

### Necə hesabat vermək

1. Bütün nəticələri **bir mesajla** çata yaz. Hər uğursuz yoxlama üçün **bir sətir**: yoxlamanın id-si + nə oldu, altında skrinşot (və ya ekran yazısı). Uğurlu yoxlamaları sadəcə siyahı ilə yaz — sətirlərin bağlanması üçün bu da lazımdır.
2. Nümunə:
   ```
   Cihaz: iPhone 15, iOS 18.6, build 1.0.0 (7), başlama 21:10
   OK: TF-01 (3 s), TF-03, TF-04, TF-05, TF-07, TF-09, TF-10, TF-14, TF-16, TF-17, TF-18
   TF-02 dil: oyun EN açıldı, telefon AZ-dır
   TF-06 FAIL: II düyməsi Dynamic Island-a toxunur [skrinşot]
   TF-13: səlistlik 4/5, ilıq, mətn aydın
   TF-11 alınmadı · TF-19 edilmədi
   ```
3. Hər **FAIL** sətrini Producer **BUG** kimi qeydə alır (təkrar addımları, cihaz, iOS, ciddilik ilə), QA reqressiya testi əlavə edir. Sənin əlavə heç nə etməyinə ehtiyac yoxdur; sual olsa çatda soruşacağıq.

---

## EN — TestFlight check on the iPhone (≈ 30 minutes)

### 0. Before you start (2 min)

1. Note the iPhone model and iOS version: **Settings → General → About** (*Model Name*, *iOS Version*). This is the first line of the report.
2. Battery ≥ 50 %, **Low Power Mode off** (battery icon not yellow) — it caps the game at 30 frames per second and spoils TF-13.
3. Sound: Ring/Silent switch on **ring** (iPhone 15 Pro and later: Silent mode off via the Action button), volume up. *In Silent mode the game is silent — that is normal iOS behaviour, not a bug.*
4. Control Center (swipe down from the top-right corner) → **Portrait Orientation Lock off** (for TF-04).
5. Note the start time.
6. **Screenshot:** side button + volume up together (Home-button iPhones: Home + side). It lands in *Photos*; attach it in the chat like any picture. **Screen recording** (for stutter / freezes): Control Center → the dot-in-a-circle button → records after 3 s; tap the red pill at the top to stop.
7. **If the app crashes** and TestFlight asks "Share additional information?": **Share** → put the check id in the comment (e.g. `TF-12`). Also write it in the chat — TestFlight feedback is visible only to you in App Store Connect, not to the team.
8. **Short on time:** do TF-01, 02, 03, 05, 06, 07, 10, 12, 13, 15, 17, 18 first, the rest later.

Colours: **your towers are blue**, the enemy's **red**, neutral **grey**. "Notch / Dynamic Island" = the black cut-out or black "island" at the top of the screen; "home indicator" = the thin horizontal bar at the very bottom.

### Summary

| ID | Check | Min | Closes | Severity if it fails |
|---|---|---|---|---|
| TF-01 | Install and first launch time | 2 | QA-2 | S1 no start / crash · S2 > 10 s or tracking prompt |
| TF-02 | Title screen clear of notch and home indicator; first language | 1 | MM-1 | S2 · S3 (language only) |
| TF-03 | Sound starts on the first tap | 1 | MM-1 | S2 |
| TF-04 | Screen stays portrait | 0.5 | MM-1 | S2 |
| TF-05 | Level 1 with one finger + tutorial hints | 2 | QA-2 | S1 not winnable · S2 |
| TF-06 | HUD and PAUSED card clear of the notch | 1 | MM-1 | S2 |
| TF-07 | Result card (VICTORY) clear of the home indicator | 0.5 | MM-1 | S2 |
| TF-08 | Level 2: cancel a selection, stop a stream, no zoom | 2 | QA-2 | S2 |
| TF-09 | Level 3: "fill to 25" hint, tower becomes L2 | 2 | QA-2 | S2 |
| TF-10 | Background during a battle: sound stops, game stays paused | 1 | MM-1 | S2 |
| TF-11 | Stalemate hint (level 2 replay, optional) | 3 | QA-2 | S3 |
| TF-12 | Levels 4–8 in a row + background twice (memory / crash) | 6 | QA-2, MM-4 | S1 crash / ad in battle · S2 jumps back to title |
| TF-13 | Level 9 (or 10–12) at ×1: smoothness, warmth, sharpness | 3 | M3-5, MM-4 | S2 constant stutter / hot · S3 occasional |
| TF-14 | DAILY card: countdown, today's level, play | 2 | QA-2 | S1 does not open · S2 wrong level / time |
| TF-15 | Shop with the store unavailable | 2 | MM-1, QA-2 | S1 Apple payment sheet · S2 · S3 wording |
| TF-16 | Settings: AZ, colour-blind, reduced motion, How to play, privacy | 3 | QA-2 | S2 · S3 |
| TF-17 | Kill and relaunch — progress kept | 1 | QA-2 | S1 |
| TF-18 | Airplane mode: game and DAILY card work | 2 | QA-2 | S1 no start · S2 card |
| TF-19 | 04:00 Baku daily rollover (optional) | 3 | QA-2 | S2 |

Severity (POST_LAUNCH §5.1): **S1** — crash, a level that cannot be won or loaded, progress lost, an ad during a battle or in levels 1–5 → fixed the same day. **S2** — a feature blocked for some users (a language, a device, the shop) → within 2 sessions. **S3** — cosmetic, wording, a single-device quirk → next release.

### Checks

#### TF-01 · Install and first launch time (2 min)
- **Tap:** TestFlight app → **Tower Clash** → **Install**. When done, tap **Open** and start counting seconds until the title screen with the big **PLAY / OYNA** button is visible.
- **Expected:** a "Tower Clash" icon on the home screen; a short dark-blue launch screen, then the title in ≤ 5 s. **No prompt at all**: no "Allow Tower Clash to track your activity…", no notification permission, no Google ad-consent form (that form appears only in the EU / UK).
- **If it fails, write:** `TF-01 FAIL: launch N s / crashed / tracking prompt shown`. Write the seconds on success too: `TF-01 OK 3 s`.
- **Closes:** QA-2 · **Severity:** S1 — does not start or crashes; S2 — longer than 10 s or a tracking prompt.

#### TF-02 · Title screen clear of the notch and home indicator; first language (1 min)
- **Tap:** nothing yet — just look. Take a screenshot.
- **Expected:** the language chip in the top-right corner (EN / AZ / RU / TR) is fully visible, not under the notch / Dynamic Island; the gold / crystal strip at the bottom sits above the home indicator, not cut. A plain coloured band around the notch and at the very bottom is **normal**. Language: if the phone is set to AZ / RU / TR / EN, the game opens in that language.
- **If it fails, write:** `TF-02 FAIL: <what> under the notch / home indicator` or `TF-02 language: game opened in EN, phone is AZ`.
- **Closes:** MM-1 · **Severity:** S2 — a button / text under the notch or home indicator; S3 — only the first language is wrong (it can be changed in Settings).

#### TF-03 · Sound starts on the first tap (1 min)
- **Tap:** make the language chip (top right) your **first tap** in the app. Keep tapping until the texts are Azerbaijani (chip **AZ**, big button **OYNA**). Then tap **Səs açıq / Səs bağlı** (Sound on / off) twice.
- **Expected:** a short "click" on **the very first tap**, and on every tap after it. With "Səs bağlı" no click; with "Səs açıq" it is back. (No sound at all: re-check item 3 of section 0 first.)
- **If it fails, write:** `TF-03 FAIL: first tap silent, sound from tap N` or `TF-03 FAIL: no sound at all (ring mode on)`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-04 · Screen stays portrait (0.5 min)
- **Tap:** on the title screen turn the phone sideways (landscape) for 3 s, then back. Repeat once during a battle in TF-05.
- **Expected:** the game does not rotate, stays upright; nothing stretched or cut.
- **If it fails, write:** `TF-04 FAIL: screen rotated / picture broken`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-05 · Level 1 with one finger + tutorial hints (2 min)
- **Tap:** **OYNA** → the **SƏVİYYƏLƏR** (levels) map → the circle **1** ("İlk Toxunuş" / First Taps). A "DƏRS" (lesson) card shows at the top. **One finger only**: when the hint **"Öz qüllənə toxun"** (Tap your tower) appears, tap the blue tower with the ring → the hint becomes **"İndi boz qülləyə toxun — axın özü davam edir"** (Now tap the grey tower — the stream keeps flowing) → tap the grey tower. Then stream from your tower to the red tower (your tower, then the red one) and win.
- **Expected:** the tap lands on the tower right under the finger (no offset); the selected tower lights up; soldiers flow along the stream; a light vibration when a tower becomes yours (if Settings → Sounds & Haptics → System Haptics is on). The level ends with the **QƏLƏBƏ** (VICTORY) card.
- **If it fails, write:** `TF-05 FAIL: tap not registered / lands on another tower / hint missing`.
- **Closes:** QA-2 · **Severity:** S1 — level 1 cannot be won or taps do not work; S2 — offset taps, missing hint.

#### TF-06 · HUD and PAUSED card clear of the notch (1 min)
- **Tap:** during level 1 or 2 take a screenshot. Then tap **II** (pause, top right) → the **FASİLƏ** (PAUSED) card → screenshot → **DAVAM ET** (RESUME).
- **Expected:** the top bar ("SƏVİYYƏ 1" on the left, the timer, the speaker button, **II**) sits entirely **below** the notch / Dynamic Island; the bottom bar ("AXINLAR" streams pill, boosters, coins, **MENYU**) sits above the home indicator. On the PAUSED card **DAVAM ET, SÜRƏT ×1, SƏS, AYARLAR, YENİDƏN, MENYU, NECƏ OYNANIR** are all visible and tappable.
- **If it fails, write:** `TF-06 FAIL: <button> under the notch / home indicator` (+ screenshot).
- **Closes:** MM-1 · **Severity:** S2.

#### TF-07 · Result card clear of the home indicator (0.5 min)
- **Tap:** when you win level 1, screenshot the card.
- **Expected:** **QƏLƏBƏ**, the stars, "Vaxt …" (Time), "3 ulduz: …-dək · 2 ulduz: …-dək" and the **NÖVBƏTİ / YENİDƏN / MENYU** (NEXT / RETRY / MENU) buttons are fully visible. If a **×2 QIZIL** (×2 GOLD) button is shown (optional): tap → a Google **"Test Ad"** video plays; close it when it ends → the gold doubles. "Test Ad" is **normal** on TestFlight.
- **If it fails, write:** `TF-07 FAIL: <button> cut / under the home indicator`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-08 · Level 2: cancel a selection, stop a stream, no zoom (2 min)
- **Tap:** **NÖVBƏTİ** → level 2 "Təchizat Xətti" (Supply Line).
  1. Hint **"Öz qüllənə, sonra boz qülləyə toxun"** (Tap your tower, then the grey tower; ring on the middle grey tower) → tap your tower, then the middle grey tower.
  2. Hint **"Axını dayandırmaq üçün hədəfə yenə toxun"** (Tap the target again to stop the stream) → tap the middle tower again (if nothing happens: your tower first, then the middle one).
  3. **Cancel a selection:** tap your tower once (it lights up, a line "Axın üçün xətti açıq olan qülləyə toxun · …" appears at the bottom) → **tap the same tower again**.
  4. **Double-tap** a tower quickly; then **press and hold** a tower for 1 s.
  5. Go on and win the level.
- **Expected:** 1 — a stream starts; 2 — the stream stops and the hint goes away; 3 — the highlight and the bottom line disappear, no stream starts; 4 — the screen does **not zoom**, no magnifier, no "Copy" menu, no text selection.
- **If it fails, write:** `TF-08 FAIL: step N — <what happened>`.
- **Closes:** QA-2 · **Severity:** S2.

#### TF-09 · Level 3: "fill to 25" hint, tower becomes L2 (2 min)
- **Tap:** **NÖVBƏTİ** → level 3 "Sahibsiz Torpaq" (Free Real Estate). Take both grey towers; then stop your streams so your tower can fill.
- **Expected:** the hint **"Qoy qüllə 25-ə dolsun və yüksəlsin — L2 iki hədəfə hücum edir"** (Let a tower fill to 25 to upgrade it — L2 can attack 2 targets); when the tower reaches 25 it grows (level 2) and the hint disappears; the level ends with **QƏLƏBƏ**.
- **If it fails, write:** `TF-09 FAIL: hint missing / tower did not grow at 25 / hint stayed`.
- **Closes:** QA-2 · **Severity:** S2 (S3 if only the wording is off).

#### TF-10 · Background during a battle: sound stops, game stays paused (1 min)
- **Tap:** in level 3 or 4, while soldiers move and sounds play, remember the timer at the top → swipe up from the bottom edge (go to the home screen) → wait 10 s and listen → open Tower Clash again.
- **Expected:** **no** game sound on the home screen; back in the game it waits on the **FASİLƏ** card, the timer has not moved on, the level is not lost; **DAVAM ET** → the game continues, sound comes back on the next tap; the top / bottom bars are still clear of the notch (as in TF-06).
- **If it fails, write:** `TF-10 FAIL: sound kept playing in background / game had moved on / sound did not come back`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-11 · Stalemate hint — optional (3 min)
- **Tap:** **MENYU** → map → **2** (already cleared, no tutorial hints). As soon as it starts (first 3 s): tap your bottom tower, then the grey tower on the **right**. The red will take the middle grey tower. At about **0:12** a red stream comes from the middle tower to your tower → at once (within 2 s): your tower → the right tower (that stream stops) → the **middle** tower (your stream now runs against the red one).
- **Expected:** after ~8–10 s, once, a red line: **"Axın ilişib — dayandır və başqa tərəfdən vur"** (Stalemate — stop the stream and hit from another side). Then finish the level normally.
- **If it fails, write:** situation never came up (the red did not attack) — `TF-11 not reached` (this is **not** a bug); you did the steps, the streams cancel for more than 15 s and no line appears — `TF-11 FAIL: hint did not show`.
- **Closes:** QA-2 · **Severity:** S3.

#### TF-12 · Levels 4–8 in a row + background twice (memory / crash) (6 min)
- **Tap:** to save time tap **II → SÜRƏT ×1** so it reads **×2**. After each win **NÖVBƏTİ**; after a loss **YENİDƏN**. In level 5: go to the home screen, wait 10 s, come back, **DAVAM ET**. In level 7: go to the home screen, use **Camera** or **Safari** for 30 s, come back, **DAVAM ET**.
- **Expected:** no crash; the game does **not jump back to the title screen by itself** (that is the sign iOS closed the game for memory); on return the PAUSED card shows. From the sixth finished level on (wins and losses both count) a full-screen Google **"Test Ad"** may appear **between** levels — normal on TestFlight, close it with ×. There must **never** be an ad **during** a battle, and none after the first 5 finished levels. After level 8 the DAILY card unlocks.
- **If it fails, write:** `TF-12 FAIL: crashed in level N / jumped back to title / ad during a battle`.
- **Closes:** QA-2, MM-4 · **Severity:** S1 — crash, an ad during a battle or within the first 5 finished levels; S2 — jumps back to the title by itself (even if progress is kept).

#### TF-13 · Level 9 (or 10–12) at ×1: smoothness, warmth, sharpness (3 min)
- **Tap:** **II → SÜRƏT ×2** so it reads **×1** again. Play level 9 "Daş Divarlar" (Stone Walls) — or 10 "Xətti Saxla", 11 "Qalanı Ac Qoy", 12 "Top Postu" — for **2 minutes**, watching the moments when most soldiers clash. At the end touch the back of the phone.
- **Expected — always answer:** (a) smoothness **1–5** (5 = smooth like a video, 1 = choppy); (b) the phone is **cool / warm / hot**; (c) tower numbers and texts are **crisp** at normal distance, or blurry? Expected: 4–5, warm at most, crisp. *Optional comparison:* open `https://pervincinal.github.io/InsiderTest/?dprcap=3` in Safari (the web version, separate progress) — the title texts should differ from the app's only "with the nose on the glass".
- **Answer example:** `TF-13: smoothness 4/5, warm, text crisp`; attach a screen recording if something is off.
- **Closes:** M3-5, MM-4 · **Severity:** S2 — constant stutter (≤ 2/5) or the phone gets hot; S3 — an occasional hitch (3/5) or text slightly soft up close.

#### TF-14 · DAILY card: countdown, today's level, play (2 min)
- **Tap:** **MENYU** → the **SƏVİYYƏLƏR** map; look at the **GÜNLÜK** (DAILY) card at the top. If level 8 is cleared, tap the card and play.
- **Expected:** before level 8 the card shows a lock, **"Səviyyə 8 keçiləndə açılır"** (Clear level 8 to unlock) and **"Yenisi N saata (00:00 UTC)"** (New in N h). N = hours left until 04:00 Baku, rounded up (e.g. at 21:15 → 7); in the last hour "Yenisi 12:34 sonra (00:00 UTC)". Once unlocked, line 2 shows **level name · twist** as in the table below. A win → **"Günlük çağırış keçildi · +… qızıl +5 kristal · seriya 1"**; the card then shows **TAMAM** (DONE) and "Rekord …★ · time". If a **"Dünənki xəritə"** (Yesterday's map) row shows under the card — that is a newer addition, optional.
- **If it fails, write:** `TF-14 FAIL: card says X, table says Y / countdown N h, expected M / did not open`.
- **Closes:** QA-2 · **Severity:** S1 — the daily level does not open or crashes; S2 — wrong level or wrong countdown.

Daily table (the date is UTC: in Baku from **04:00** that day to **03:59** the next day):

| Date (UTC) | Level | On the card | Date (UTC) | Level | On the card |
|---|---|---|---|---|---|
| 2026-10-02 | 13 | Çarpaz Atəş · Nazik divarlar (Crossfire · Thin walls) | 2026-10-09 | 47 | Yanmış Torpaq · Güclü qarnizon (Scorched Earth · Reinforced) |
| 2026-10-03 | 10 | Xətti Saxla · Az ərzaq (Hold the Line · Lean rations) | 2026-10-10 | 38 | Atəş Halqası · Az ərzaq (Ring of Fire · Lean rations) |
| 2026-10-04 | 24 | Sınaq Keçidi · Klassik (The Gauntlet · Classic) | 2026-10-11 | 14 | Top və Divar · İti addım (Guns and Walls · Fast feet) |
| 2026-10-05 | 25 | Ağır Metal · Nazik divarlar (Heavy Metal · Thin walls) | 2026-10-12 | 33 | Üç Kral · Klassik (Three Kings · Classic) |
| 2026-10-06 | 23 | İlk Qan · Güclü qarnizon (First Blood · Reinforced) | 2026-10-13 | 15 | Sitadel · İti addım (The Citadel · Fast feet) |
| 2026-10-07 | 17 | Mina Sahəsi · İti addım (Minefield · Fast feet) | 2026-10-14 | 30 | Bir Cəbhə · Güclü qarnizon (One Front · Reinforced) |
| 2026-10-08 | 39 | Uzun Gecə · Az ərzaq (The Long Night · Lean rations) | | | |

#### TF-15 · Shop with the store unavailable (2 min)
- **Tap:** title screen → **MAĞAZA** (SHOP). Tabs: **KRİSTAL / DƏSTLƏR / GÖRÜNÜŞ / TƏLİM** (CRYSTALS / BUNDLES / SKINS / UPGRADES).
  1. **KRİSTAL**: look at the price buttons ($0.99 …), tap one. Scroll down, tap **ALIŞLARI BƏRPA ET** (RESTORE PURCHASES). If you have ≥ 20 crystals: **ÇEVİR** (CONVERT) → confirm.
  2. **DƏSTLƏR**: tap a bundle's price; tap the **Gücləndirici sandığı** (Booster Crate).
  3. **GÖRÜNÜŞ**: tap **Şifer** (Slate, 80 crystals) and one skin marked "YALNIZ DƏSTDƏ" (PACK ONLY).
  4. **TƏLİM**: buy one upgrade if you have enough gold.
- **Expected:** 1 — the price buttons are **greyed out**, at the bottom **"Mağaza bu platformada mümkün deyil."** (Store unavailable on this platform.); a tap shows the red line **"Mağaza bu platformada mümkün deyil"**; **no Apple payment sheet, no Apple ID password prompt**; CONVERT → "… kristal … qızıla çevrildi". 2 — the same; the crate without 60 crystals → "Sandıq üçün 60 kristal lazımdır". 3 — after 30 minutes of play there are few crystals, so **"Kristal çatmır"** (Not enough crystals) is the correct result and the crystal count does not change (with ≥ 80: "Şifer dam açıldı və taxıldı"); PACK ONLY → "Başlanğıc dəsti ilə gəlir" or "Premium dəsti ilə gəlir". 4 — a "<name> pillə 1: …" line (tier 1), the gold goes down.
- **If it fails, write:** `TF-15 FAIL: Apple payment sheet opened / buttons not grey / <tab> crashed / wording: …`.
- **Closes:** MM-1, QA-2 · **Severity:** S1 — an Apple payment sheet or any request for money; S2 — crash, buttons look active, the line is missing; S3 — wording / translation.

#### TF-16 · Settings (3 min)
- **Tap:** title screen → **Ayarlar** (Settings). Do **not** tap **İRƏLİLƏYİŞİ SIFIRLA** (RESET PROGRESS).
  1. In the **Dil** (Language) row make sure **Azərbaycanca** is selected (select it if not).
  2. **Rəng korluğu** (Colour-blind) → **AÇIQ** (ON) → **GERİ** → **OYNA** → open any level and look → **MENYU**. Afterwards set it the way you like in Settings.
  3. **Az hərəkət** (Reduced motion) → **AÇIQ** → **GERİ**, look at the title screen → **Ayarlar** → **AVTO**.
  4. **Necə oynanır** (How to play) → the card → **ANLADIM** (GOT IT).
  5. Look at the "About" card at the bottom: the version and the **MƏXFİLİK SEÇİMLƏRİ** (PRIVACY OPTIONS) button (tap it if it is there).
- **Expected:** 1 — all menus in Azerbaijani. 2 — enemy towers change from **red to orange**, yours stay blue. 3 — the marching soldiers on the title stop, capture bursts are reduced; AVTO follows the iPhone's *Reduce Motion* setting. 4 — the **NECƏ OYNANIR** card with 5 rules, all on screen, **ANLADIM** returns to Settings. 5 — **"Versiya 1.0.0 (build 7)"** and "İrəliləyiş bu cihazda saxlanılır" (Progress is stored on this device). In Azerbaijan **no PRIVACY OPTIONS button is normal** (Google shows it only in the EU / UK); if it is there, a tap opens a Google form that returns to the game. No "Dəstək ID" (Support ID) row in this build — normal.
- **If it fails, write:** `TF-16 FAIL: step N — <what happened>`.
- **Closes:** QA-2 · **Severity:** S2 — a setting does not apply, a different version, the privacy button errors; S3 — looks / wording.

#### TF-17 · Kill and relaunch — progress kept (1 min)
- **Tap:** swipe up from the bottom and hold in the middle (app switcher) → flick the Tower Clash card up. Open it again from the icon → **OYNA**.
- **Expected:** still **Azerbaijani**; gold / crystals at the bottom as before; the stars of the cleared levels on the map; the colour-blind setting as you left it.
- **If it fails, write:** `TF-17 FAIL: stars / gold / language lost`.
- **Closes:** QA-2 · **Severity:** S1 (data loss).

#### TF-18 · Airplane mode: game and DAILY card work (2 min)
- **Tap:** Control Center → **Airplane Mode on**, Wi-Fi icon off as well. Kill the app as in TF-17 and open it again → **OYNA** → play any level to the end → look at the DAILY card on the map (tap it and play a little if unlocked). Afterwards **turn Airplane Mode off**.
- **Expected:** the title opens in the usual time; the level loads, **"Yüklənmədi — bağlantını yoxla"** (Couldn't load — check your connection) does not appear; the DAILY card shows its countdown and opens its level. On the result card **×2 QIZIL** may be missing or say "Hazırda video yoxdur" (No video available right now) — normal offline.
- **If it fails, write:** `TF-18 FAIL: did not start offline / level did not load / daily card: …`.
- **Closes:** QA-2 · **Severity:** S1 — the app or a level does not open offline; S2 — only the DAILY card fails.

#### TF-19 · 04:00 Baku daily rollover — optional (3 min)
- **Tap (A, natural):** at 03:57 Baku time open the game, look at the DAILY card on the **SƏVİYYƏLƏR** map and wait until 04:01.
- **Tap (B, change the clock — after every other check):** iPhone **Settings → General → Date & Time** → **Set Automatically off** → set the time to **03:58** (tomorrow's date is fine) → open the game → map → wait 2–3 min → then **turn Set Automatically back on**. Changing the clock may confuse the streak / daily reward on this test install — that is **not** a bug.
- **Expected:** shortly before 04:00 the card counts down like "Yenisi 01:59 sonra (00:00 UTC)"; at exactly 04:00 the card switches to the **next day's** level (table), and **TAMAM** disappears if today's was done. If the card is locked, check only that the countdown runs out and starts again at ~24 h.
- **If it fails, write:** `TF-19 FAIL: card did not change at 04:00 / changed at another time (HH:MM)`.
- **Closes:** QA-2 · **Severity:** S2.

### How to report

1. Send all results **in one message** in the chat. For each failed check **one line**: the check id + what happened, with the screenshot (or screen recording) under it. List the passed checks as well — the backlog rows can only be closed with them.
2. Example:
   ```
   Device: iPhone 15, iOS 18.6, build 1.0.0 (7), start 21:10
   OK: TF-01 (3 s), TF-03, TF-04, TF-05, TF-07, TF-09, TF-10, TF-14, TF-16, TF-17, TF-18
   TF-02 language: game opened in EN, phone is AZ
   TF-06 FAIL: the II button touches the Dynamic Island [screenshot]
   TF-13: smoothness 4/5, warm, text crisp
   TF-11 not reached · TF-19 not done
   ```
3. The Producer files every **FAIL** line as a **BUG** in `docs/BACKLOG.md` (repro steps, device, iOS version, severity); QA adds a regression test for each fix. Nothing else is needed from you; questions come back in the chat.

### For the team: what each row needs from this pass

- **MM-1 (iOS half):** TF-02, 03, 04, 06, 07, 10, 15 pass → the WebView items of MM-1 (safe areas, audio unlock, background pause, portrait, store-unavailable state) are confirmed on iOS; the Android back-button half stays with the APK pass.
- **QA-2 (iOS half):** TF-01, 05, 08, 09, 12, 14, 16, 17, 18 pass (TF-11, TF-19 optional).
- **MM-4:** TF-12 without a reload to the title + TF-13 sharpness answer "crisp" → the DPR cap (`DPR_CAP.native` 2, `src/render/view.ts`) is confirmed; a reload or stutter → the two-layer fallback of docs/MOBILE.md §9.3 step 4.
- **M3-5:** TF-13 smoothness ≥ 4/5 at ×1 on the stakeholder's phone; ≤ 3/5 → a screen recording, then the levers listed under M3-5 in the backlog.
