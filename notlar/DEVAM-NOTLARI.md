# Map Battle Royale — Devam Notları (30 Ekim 2026)

Bu klasör, oyunu başka bir bilgisayarda kaldığımız yerden sürdürmek için gereken her şeyi içerir: kaynak kod, veriler, Blender betikleri, test ve çekim araçları, Claude'un kalıcı notları ve konuşmanın tam kaydı.

---

## 1. Klasör içeriği

| Klasör / dosya | Ne |
|---|---|
| `oyun/game/` | Oyunun kendisi (Vite + Three.js 0.160). `node_modules` yok (`npm ci` ile kurulur). |
| `oyun/game/dist/` | **Hazır derlenmiş oyun** (30 Ekim son sürüm). Kurulum gerektirmez ama bir web sunucusundan açılmalı (dosyaya çift tıklayınca veri yüklenmez): XAMPP `htdocs` altına koy ya da `cd oyun/game/dist && python3 -m http.server 8080` → http://localhost:8080 |
| `oyun/original/` | Asıl GitHub reposu (eee304/D-nya-sava-) — **yalnızca referans, düzenlenmez**. |
| `claude-notlari/memory/` | Claude'un kalıcı hafıza dosyaları (tercihlerin, kararların). Kurulumu aşağıda. |
| `claude-notlari/konusma-kaydi.jsonl` | Bu projedeki konuşmanın ham tam kaydı (görüntüler dahil, ~240 MB). Ayrıntı lazım olursa Claude'a "bu dosyayı oku" diyebilirsin. |
| `arac-ve-veri/ne/adm1.geojson` | Natural Earth admin-1 sınırları (39 MB). `scripts/build-regions.mjs` için **gerekli**. |
| `arac-ve-veri/cekim-betikleri/` | Ekran görüntüsü / görsel kontrol betikleri (vis.mjs, rg.mjs, af.mjs, ao.mjs, cancel.mjs, cos.mjs …) ve Blender sıralama render'ı (lineup.py). |
| `arac-ve-veri/planlar/` | Plan sayfası ve stil çalışması HTML'leri. |

---

## 2. Yeni bilgisayarda kurulum

```bash
# 1) Node 20+ kur (bu makinede Node 26 vardı)
cd oyun/game
npm ci                  # node_modules'u package-lock'a göre kurar
npm run dev             # geliştirme: http://localhost:5173
npm run build           # dist/ üretir
npx vite preview --port 4173   # testler bu adresi kullanır
```

XAMPP altında çalıştırmak istersen `oyun/` klasörünü `htdocs/oyun/` içine koy; build sonrası `http://localhost/oyun/game/dist/` açılır (`vite.config.js` → `base: './'`).

Tarayıcıda değişiklikleri görmek için **Cmd+Shift+R** (önbelleği atlayarak yenile).

### Testler (puppeteer-core + Chrome, yazılımsal GPU)
Önce `npx vite preview --port 4173` açık olmalı. Testler Chrome yolunu `/Applications/Google Chrome.app/...` olarak arar (Windows/Linux'ta betiklerdeki `executablePath` değişmeli).

```bash
npm run smoke          # temel akış, kaydet/yükle
npm run provinces      # iller, gelişmişlik, bölge girişleri
npm run regionbuild    # bölgede bina kurma (yavaş, 10+ dk)
ERA=2014 npm run battle
ERA=1810 npm run battle
node scripts/era1810.mjs
OUT=<klasör> ile ekran görüntülerinin nereye yazılacağı seçilir.
```

### Blender (isteğe bağlı, modelleri yeniden üretmek için)
Headless Blender (bu makinede `/Applications/Blender.app`, sürüm 5.2.4):
```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P blender/human.py -- public/models            # tüm insanlar
/Applications/Blender.app/Contents/MacOS/Blender -b -P blender/human.py -- public/models civ_1810_f # tek varyant
```
Betikler: `blender/human.py` (14 insan varyantı), `horse.py`, `ships.py`, `vehicles.py`, `buildings.py`, `house_eu.py`. Çıktılar `public/models/*.glb`.

### Veri üretimi (gerekirse)
```bash
node scripts/fill-1815.mjs   # data-src/world_1815.raw.geojson → public/data/world_1815.geojson (isimsiz toprakları adlandırır)
node scripts/build-regions.mjs ../../arac-ve-veri/ne/adm1.geojson   # regions-2014.json + regions-1810.json (~11 dk)
```

---

## 3. Claude'un hafızasını yeni bilgisayara taşıma

Claude Code hafızası proje yoluna göre bir klasörde durur:
`~/.claude/projects/<proje-yolu-tirelerle>/memory/`

Örnek: proje `/Users/ad/oyun` ise klasör `~/.claude/projects/-Users-ad-oyun/memory/`.
`claude-notlari/memory/` içindeki 4 dosyayı oraya kopyala (MEMORY.md dizin dosyasıdır). Kopyalamasan bile ilk mesajda Claude'a "DEVAM-NOTLARI.md ve claude-notlari/memory dosyalarını oku" demen yeterli.

---

## 4. Senin kuralların / tercihlerin (Claude için)

- **Her zaman Türkçe konuş.** Kod ve tanımlayıcılar İngilizce kalabilir; oyun içi metinler Türkçe.
- **Önce kodla ilerle; yetersiz kalırsa Higgsfield.** Higgsfield üretiminden **önce mutlaka onay iste, az kredi harca.** (29 Ekim bakiye: 7280 kredi, Ultra.)
- **Kendi eleştirini yap:** "Çok kaba her şey. Öncelikle kendi eleştirini düzgün yap. Her konuda seni uyarmayayım." → Her görsel işten sonra yakın çekim al, kaba kısımları dürüstçe listele, düzelt, kalan zayıflıkları raporda söyle.
- Organik/animasyonlu şeyler (insan, at) Blender'da modellenip rig'lenir; üst üste konmuş ilkel şekiller değil.
- `original/` klasörüne dokunulmaz.
- Çok oyunculu (PeerJS, host otoriter botlar) korunmalı.
- İsim: **Map Battle Royale**. İki zoom katmanı: dünya stratejisi haritası ↔ AoE II seviyesinde izometrik bölge görünümü (tekerlekle serbest geçiş).
- Grafik hedefi: en az Age of Empires II seviyesi; stil "boyanmış minyatür, detaylı" (stil C). Dünya haritası Age of History II / Victoria 3 gibi ama "sevimli".
- Gün döngüsü takvime bağlı; elle gün batımı düğmesi istenmedi.

---

## 5. Kod haritası (game/src)

- `main.js` (~3900 satır): dünya haritası, ekonomi, botlar, istila/savaş, sinematikler, kaydet/yükle, multiplayer, test kancaları (`window.__mbr`, `?test` ile).
- `core/state.js`: oyuncu durumu `S`.
- `sim/constants.js`: ekonomi sabitleri (giderler, maliyetler, ordu).
- `render/post.js` **(yeni)**: ekran efektleri — GTAO (ortam kapanması), bloom, dönem renk ayarı (1810 sıcak/sepya, 2014 net), vinyet, film greni, suya gökyüzü yansıması. Kalite: Otomatik/Düşük/Orta/Yüksek (üst çubuktaki ✦ düğmesi, `localStorage 'mbr-gfx'`, URL `?gfx=low|medium|high`). Otomatik: yazılımsal GPU'da Düşük'ten, değilse Yüksek'ten başlar; FPS < 40 kalırsa bir kademe düşer.
- `render/models.js`: dünya haritası modelleri.
- `world/`: `mapTexture.js` (boyalı dünya dokusu: iklim kuşakları, çöller, **savan** kuşağı), `provinces.js`, `geo.js`.
- `region/`: bölge görünümü.
  - `RegionView.js`: sahne kurma, kamera, savaş yakın planı, sinematik kamera, hava durumu, akşam ışığı.
  - `terrain.js`: arazi; **SIZE = 200** (eskiden 110), `outerGround` (oynanabilir karenin dışında sise karışan kırsal), `AREA` yoğunluk ölçeği.
  - `vegetation.js` (ağaçlar rüzgârda sallanır, dış orman `addOuterTrees`), `details.js` (çim/çiçek, `windy` shader), `builders.js` (binalar, kale, `Kit`, baca konumları `K.smoke`), `textures.js` (triplanar dokular, akşam pencere ışığı `setWindowGlow`), `life.js` (kasaba halkı, araçlar), `biomes.js` (iklimler + **savan**, Afrika konuma göre), `flora.js`, `prefabs.js`.
- `units/`: `Formation.js` (asker blokları, yürüyüş tozu, 1810 barut dumanı), `fx.js` (duman, alev, mermi izleri), `humans.js` (rig'li insan klonları, LOD), `models.js`.
- `data/`: ülke profilleri, bayraklar, askeri güçler, madenler, imparatorluklar.
- `scripts/`: testler + `build-regions.mjs` + `fill-1815.mjs` **(yeni)**.

---

## 6. Yapılanlar (özet kronoloji)

**29 Ekim:** Faz 0–5 (Vite bölme, bölge görünümü, boyalı dünya, HUD, birlikler/savaş, bölgede inşa), tam ekran savaş sinematikleri, iller (gerçek idari bölgeler), dönen küre menü, ülke kimlikleri + mallar + ticaret, yeni binalar (balıkçı, hayvancılık, petrol, fabrika), 4 savaş senaryosu × hava durumu, gün döngüsü.

**30 Ekim (önceki kısım):** Blender'da rig'li insanlar (14 varyant: asker/sivil × 1810/2014 × Avrupa/İslam/Doğu Asya/Afrika × kadın/erkek), coğrafyaya göre dönem kostümleri, kumaş gibi sallanan etek/cüppe, ayrı kadın vücudu, Japon kale duvarları (ishigaki + yagura), gemi flok yelkeni, asker LOD/performans, kasaba halkının nehre girmemesi.

**30 Ekim (bu oturumun son kısmı):**
1. **Görsel güzelleştirme ("hepsi")**
   - Ekran efektleri (`render/post.js`): AO, bloom, dönem renk ayarı, vinyet, grenli film görünümü, suya gökyüzü yansıması.
   - Bölge artık boşlukta yüzen bir tahta değil: dışarıda devam eden kırsal (arazi + orman + yolların devamı) sise karışıyor.
   - Ağaçlar rüzgârda sallanıyor; evlerin bacalarından ince duman; yürüyen ordulardan toz; 1810 tüfek atışlarında kalın barut dumanı; akşamüstü pencereler sarı yanıyor.
   - Hata düzeltmeleri: AO'nun dumanı kare gölge yapması, kanvas alfa deliği.
2. **Bölge haritaları büyütüldü:** 110 → 200 birim (≈3,3 kat alan), daha fazla uzaklaşma (min zoom .42), gölge kutusu zoom'a göre büyüyor, il eşleme ölçeği buna göre.
3. **Oyun dengesi:**
   - İlk **12 ay barış** (Barışçıl kişilikte 18). Sonra tehdit 18 ayda yavaşça artıyor.
   - Botlar saldırmadan **bir ay önce uyarı** veriyor ("… sınırında toplanıyor").
   - Her ülkende **yerel muhafız** (anavatanda temel ordunun %35'i, diğerlerinde %12; her üs +%15).
   - Botlar oyuncuya ancak 1,6 kat güçlüyse saldırıyor.
   - Başlangıç parası 700 → 2500; nüfus artışı hızlandı.
   - Bina giderleri düzeltildi (önceden şehir kurmak zarar ettiriyordu): şehir 600/ay, kasaba 200, tarla 150, liman/gemi 1000.
   - Ordu: 100 asker = 600 para + 20 nüfus (önceden 2000 para + 100 nüfus).
4. **1810 Afrika:**
   - Devletsiz topraklar artık haritada (Afrika'nın çoğu, Arabistan içi, Madagaskar, Borneo, Patagonya…). 60 tarihi ad verildi (Zulu, Luba-Lunda, Necd, Tuareg, Darfur…), küçük adalar en yakın devlete katıldı.
   - Afrika ve Arabistan'da toprak/kum renkleri; dünya dokusuna savan kuşağı; yeni **Savan** iklimi (altın sarısı ot, akasya, baobab).
   - Bölge iklimi konuma göre seçiliyor (1810 devletlerinin ISO kodu yoktu, Nijer "Tropik" çıkıyordu).
5. **Bölge bilgi kartı** ekranın ortasından **sol üst köşeye** alındı; bölge yönetimi paneli kartın altında açılıyor.
6. **Takılan ordu:**
   - **"↩️ Harekâtı iptal et"** düğmesi eklendi (savaş başlamadan; askerler çıktıkları ile döner).
   - Takılma düzeltildi: hedef artık her zaman karada, ayrıca 3 saniye ilerlemeyen ordu engeli aşıyor.
   - Kayıtlar artık yoldaki askerleri de saklıyor; eski kayıtlarda kaybolan askerler yüklemede başkente geri ekleniyor.

**30 Ekim akşam (yeni bilgisayar, GitHub üzerinden):**
1. **Yerleşim sistemi:** şehir/kasaba inşası kalktı. Kendi her bölgen 3–5 minik evli **köy** ile başlar; bölge kartındaki (ve il panelindeki) **⬆️ Yükselt** düğmesiyle Köy → Kasaba → Şehir → Büyük şehir. Maliyet her adımda ×1,5 (2500💰 250🍞 60🪵 → 3750/375/90 → 5625/563/135). 3. seviye şehri büyütmez, yalnız nüfus sınırı ekler (+250 / +500 / +750). Başkentin eski bedava şehri yerine başlangıçta +500 nüfus sınırı. Eski kayıtlardaki şehir/kasaba binaları yüklemede bölgenin yerleşim seviyesine çevrilir. (`main.js` → `upgradeSettlement`, `SETTLE_*`; `sim/constants.js` → `UPGRADE_BASE`, `SETTLE_POP`)
2. **Tarlalar:** kendi bölgelerinde hazır tarla yok; inşa ettiğin tarla ilk tarlalar gibi görünür (boyalı şerit + ekin sıraları + çit + saman yığını) ve önizlemenin yönünde (yola paralel) durur.
3. **Yerleştirme:** önizleme **mavi** = uygun, **kırmızı** = olmaz; kırmızıyken tıklamak artık inşa etmez ve nedenini söyler (orman / tarla / başka yapı / zemin / kıyı / para / odun). Tüm taban alanı örnekleniyor (tarla 6×5 dikdörtgen, bina daire). Bölgede bina seçince inşa menüsü kapanır (B ile tekrar açılır).
4. **Yapılar dünya haritasında görünmez** (yalnız bölge yakın çekiminde).
5. **Odun (1810):** bölgende bir ormana tıkla → "🪓 Odun topla" → 2–4 oduncu (Blender: `worker_*` varyantları, balta + `chop` animasyonu) yürür, 5 sn keser, ağaçlar devrilir, kütükler kalır, ağaç başına 1 odun (bir koru en fazla 40 ağaç). Kesilen ağaçlar kayıtta (`S.cleared`) saklanır; orman her ziyarette aynı dağılır (ayrı rastgele dizi). Ormanın üstüne inşaat yapılamaz. 2014'te aynı işlem odun vermeden alanı açar.
6. **Dönem kuralları:** 1810'da odun HUD'da; liman 40🪵, tersane 60🪵, balıkçı limanı 25🪵, yelkenli gemi 30🪵 ister. 1810'da teknoloji yok (HUD, ticaret, sanayi fabrikası gizli; saldırı bonusu yok); garaj → **Top Dökümhanesi**, tank → **top** (1000💰 + 10 nüfus + 20 demir + 5 kömür). 2014'te tank 10⚙️, savaş gemisi 25⚙️ teknoloji ister.
7. Blender betiği (`blender/human.py`) artık açık Blender içinde de çalışıyor (fabrika ayarına dönmeden sahneyi boşaltır); MCP ile `-- <models klasörü> worker_1810 …` argümanlarıyla çalıştırıldı.

---

## 7. Test durumu (son çalıştırma)

Hepsi geçti (30 Ekim, son kod):
- `smoke` — all checks passed
- `provinces` — all checks passed (yazılımsal GPU'da bölgeden çıkış 3–17 sn sürdüğü için bekleme sınırı 60 sn'ye çıkarıldı)
- `regionbuild` — errors: none | fails 0
- `battle` 2014 (Suriye·Humus fethedildi) ve 1810 (İran·Yezd fethedildi) — errors: none
- `era1810` — Osmanlı/Fransa/Japonya bölgeleri, errors: none
- Elle: harekât iptali (20.000 asker geri döndü), Afrika 1810 haritası, savan bölgesi, akşam ışığı ve duman çekimleri.

---

## 8. Bilinen zayıflıklar / yapılacaklar

- Gerçek bir tarayıcıda (gerçek GPU) FPS hiç ölçülmedi. "Yüksek" kalitede AO ağır olabilir; Otomatik mod yavaşsa kendini düşürüyor.
- Gece yok: gün döngüsü bilerek sabah kızıllığı / akşam altını ile sınırlı. Pencere ışığı akşamüstü hafif.
- Dünya haritasında tepe gölgelendirmesi (hillshade) ve 1810 için parşömen teması henüz yapılmadı (sadece renk ayarı var).
- İnsanlar: hızlı adımda öndeki bacak etekten biraz çıkabiliyor, eller geri sallanırken eteğe değebiliyor, dirsekler köşeli.
- Yayalar evlerin içinden geçebiliyor (eski backlog).
- Bölgenin gerçek il sınırını bölge haritasında çizmek (eski backlog).
- Dış kırsal kaba köşe renkleriyle boyanıyor; çok yakından bakınca iç bölgeden daha bulanık.
- 1810'da eklenen bazı adlar ("Sahara tribes", "Borneo sultanates", "Native nations") genel; istersen tek tek tarihi adlarla değiştirilebilir (`scripts/fill-1815.mjs` içindeki `HIST` tablosu).
- Ses yok.
- Oduncular küçük görünüyor; balta savuruşu yakından iyi, uzaktan seçilmiyor. Kesilen alanın zemini hâlâ orman tabanı renginde olabilir.
- Köy meydanı (taş döşeli daire) birkaç evlik köy için büyük kalıyor.
- Bu bilgisayardaki test ortamında (yazılımsal GPU, Linux) bir kare çok yavaş; testler simülasyonu elle adımlayarak yapıldı.
- Denge yeni ayarlandı; gerçek oyunda deneyip barış süresi, muhafız oranı ve ordu fiyatı için geri bildirim vermek iyi olur (`main.js` → `PEACE_MONTHS`, `THREAT_RAMP_MONTHS`, `militiaOf`; `sim/constants.js` → `M_*`, `ARMY_UNIT_COST`, `ARMY_UNIT_POP`).

---

## 9. Domain'e (hosting'e) yükleme

- Sunucuya **`oyun/game/dist/` klasörünün İÇİNDEKİLERİ** yüklenmeli (index.html, assets/, data/, models/, img/, .htaccess). `game/` klasörünün kendisi (kaynak kod) yüklenirse oyun açılmaz: kaynak `index.html` `/src/main.js` ve `three` gibi paketleri ister ve bunlar ancak Vite ile çalışır.
- `.htaccess` gizli dosyadır; FTP programında gizli dosyaları göstermeyi aç ki o da yüklensin.
- Adresi sonunda **/** ile aç (örn. `alanadi.com/oyun/`). Dosyalar göreli yolla yüklendiği için eğik çizgi olmadan veri dosyaları 404 verebilir (`.htaccess` içindeki `DirectorySlash On` bunu Apache'de çözer).
- Linux sunucular büyük/küçük harfe duyarlıdır; dosya adlarını değiştirme.
- Hâlâ açılmazsa tarayıcıda F12 → Console / Network'teki kırmızı hatayı Claude'a göster.

## 10. Bağlantılar

- Plan + canlı 3B maket: https://claude.ai/artifact/ATLEBa5GKxTrYRW53TBH5D
- Stil sayfası: https://claude.ai/artifact/5NKPRqdZkthSPSFp4PgHwY
- Asıl repo: github.com/eee304/D-nya-sava-

---

## 11. Yeni oturumda Claude'a ilk mesaj önerisi

> "Map Battle Royale oyununa devam ediyoruz. Önce `DEVAM-NOTLARI.md` dosyasını ve `claude-notlari/memory/` içindeki notları oku. Kod `oyun/game` içinde. Benimle Türkçe konuş."
