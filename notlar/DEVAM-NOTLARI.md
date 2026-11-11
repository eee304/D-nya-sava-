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

**31 Ekim:**
1. **Performans (kasma):** dünya haritası karede ~24 000 çizim çağrısı yapıyordu (5 232 il parçası + 4 313 çizgi + dağ/ağaç parçaları). Artık tüm kara tek ağ (il renkleri ve vurgulama köşe başına `tint`/`emis` niteliğiyle; asıl il ağları görünmez ama tıklama/hover için duruyor — `mergeWorldMeshes`, `syncLand`), sınırlar ve il çizgileri tek `LineSegments`, süsler malzeme başına tek ağ → ~840 çağrı. Bölge: ağaç tepeleri 900 → 400 üçgen, dış kırsal ağaçları daha da sade; kare başına üçgen ~%45 azaldı. HUD yazıları yalnız değer değişince yazılıyor (vergi yüzü SVG'si her kare yeniden kuruluyordu). Otomatik kayıt 5 sn → 20 sn.
2. **Odun göstergesi** üst çubukta Para'nın hemen yanında (1810).
3. **Vergi** yalnız Enter'a basınca uygulanıyor; yazarken kutu sarı çerçeveli, kutudan çıkınca eski değere dönüyor.
4. **Petrol:** 1810'da petrol/kömür malı, petrol kuyusu ve Kaynaklar düğmesi yok; top petrol istemez. 2014'te kaynak haritası yalnız petrol yataklarını **siyah** gösterir (`data/resources.js` → `OIL_FIELDS`); petrol kuyusu yalnız oraya kurulur. Ticaret: petrol zengini botlar petrolü takasla verir ya da parayla satar; diğerleri nadiren petrol ister.
5. **Madenler:** Maden Ocağı menüden kalktı, kaynak haritası maden göstermez. Kendi her bölgende 3–5 **cevherli kaya** (altın/gümüş/bakır/demir/elmas; bölgenin altındaki gerçek yatak ilk ikisini belirler). Kayaya tıkla → 1000💰 ile kaz → 3 Blender madenci (`miner_*`: kazma) 7 sn kazar, kaya parçalanır, bir madenin **8 dakikalık** geliri tek seferde gelir (demir: 80 demir). Kazılan kayalar kayıtta (`S.dug`). (`main.js` → `DIG_COST`, `DIG_SECS`, `DIG_MULT`)
6. Blender bilgisayarda kapalıyken modeller bu ortamda `pip install bpy==5.2.3` (aynı sürüm) ile üretildi.

**31 Ekim akşam:**
1. **Gemiler:** iskele, liman ya da tersane kendiliğinden gemi çıkarmaz (oyuncunun bölgelerinde süs yelkenlisi de yok). Gemi yalnız **tersaneden** üretilir (liman şartı kalktı); dünya haritasında tersanenin yanındaki ilk boş suya, diğer gemilerden en az 4,2 birim uzağa iner; bölge görünümünde iskelenin önünde, birbirinden 9 birim aralıklı demirli görünür (`RegionView.addShip`).
2. **Köy evi (kullanıcının modeli):** `blender/kaynak-modeller/village_house.obj` (© 2018 illuminachos, Downloads/31-village-house.zip) → `blender/village_house.py` dokudaki renge + yüksekliğe göre yüzleri saz/kiriş/sıva/taş/cam rollerine ayırıp `public/models/house_vil.glb` üretir. 1810 Avrupa ve İslam köylerinde evlerin ~%60'ı, kasaba/şehirlerde ~%12'si bu ev.
3. **Şehir surları:** oyuncunun şehir (seviye 2+) bölgelerinde her dönemde ve kültürde taş sur.
4. **Kıyı hatası:** 1810'da bazı ülke şekilleri ters sarılı olduğu için küresel "kara mı?" testi denizde de kara diyordu; hiçbir bölge kıyısını bulamıyordu. Ters şekiller test için düzeltildi (`rewindFeature`); kıyı en fazla yarım kare uzağa konuyor, deniz yakınlaşınca görünüyor. (Not: ordu ızgarası (`LAND_GRID`) 1810'da Karadeniz'i hâlâ kara sayıyor — ayrıca bakılmalı.)
5. **Osmanlı (1810):** Akdeniz bölgesi üçe ayrıldı → Güney Anadolu (eski Akdeniz'in sırası, kayıtlar bozulmaz), Kıbrıs, Şam (`splitOttomanMed`). İklim: Arap yarımadası ve Suriye çölü coğrafyaya göre çöl/bozkır (Osmanlı'ya TR kodu verildiği için önce ılıman çıkıyordu), Kıbrıs ve Güney Anadolu yeşil.
6. Referans (free3d "cartoon low poly landscape"): ormanlara devrik kütükler ve mantar kümeleri eklendi.

**9 Kasım:**
1. **Bölgeler gerçek coğrafyada:** bölgeye girince dünya haritasındaki kara şekilleri ve ilin kendi sınırı bölge koordinatlarına çevrilip iki işaretli uzaklık alanına işlenir (`region/geomask.js`, `main.js` → `regionGeo`). Kıyı artık gerçek kıyı (Kıbrıs gerçek ada, Karadeniz kuzeyde, Kızıldeniz Mekke'nin batısında…). İl, gerçek şeklinde yükseltilmiş bir parça; sınır dışındaki komşu topraklar alçak, gri-soluk ve boş (ağaç, ev, yol yok); il sınırı kara-kara kesimlerinde mürekkep + sahip rengiyle çizili. Yalnız il içine inşa edilir (önizleme 'outside').
2. Kamera artık güneyden bakıyor: **kuzey yukarıda**, güney kıyısı aşağıda (sağ tıkla döndürülebilir).
3. Ölçek: il, kasabanın çevresine bütünüyle sığacak şekilde (küçük kıymıklar sayılmaz); kasaba ilin içinde, karada, ortaya yakın ve kenarlardan uzak bir noktada (`interiorPoint`).
4. İklim: Afrika kuralı Anadolu/Levant/Kıbrıs/Girit/Yunanistan'ı artık kapsamıyor (Güney Anadolu bozkır çıkıyordu).
5. Not: arazi değiştiği için eski kayıtlardaki kesilmiş orman ve kazılmış kaya konumları yeni haritada geçersiz (ormanlar ve kayalar yeniden dağıldı).

**10 Kasım (on iki madde birden):**
1. **Karadeniz hatası (1810):** ordu kara ızgarası (`LAND_GRID`) 6 birimlik hücrenin yalnız merkezine bakıyordu; Kırım'ın ve Sinop'un hücreleri denize taşıyor, Karadeniz'in ortası "kara" sayılıyordu. Hücre 3 birime indi ve hücre ancak yarısından çoğu kara ise kara sayılıyor (`buildLandGrid`). Kesin testle uyuşmazlık %4 (yalnız kıyı hücreleri).
2. **Gerçek nehirler:** Natural Earth 1:10m nehir çizgileri sadeleştirilip `public/data/rivers.json` (1971 parça, 1,2 MB) oldu. Dünya haritasında boyalı (büyükler kalın), bölge görünümünde gerçek yerlerinde: yumuşatılıp hafif kıvrım verilir, genişlik nehrin önemine göre (`RIVER_HALFW`); uzaktan görülen büyük illerde yalnız büyük nehirler, küçük illerde dereler de çıkar. Yol nehri geçtiği her yerde köprü (genişliğe göre uzun, çok ayaklı). İl sınırı nehir üstüne çizilmez.
3. **Nehir kenarı:** nehre yakın (bölgede ~12 birim) kurulan tarla ×1,5 ekmek. **Su Değirmeni** (1500💰, 1810'da +30🪵) yalnız nehir kıyısına kurulur, çarkı suya bakar ve döner; bulunduğu bölgenin tarlaları +%25 (en çok 2 değirmen).
4. **İnce/uzun iller:** kasaba noktası artık ilin tamamını en iyi sığdıran yerde; çapraz uzanan iller ±75°'ye kadar döndürülerek gösteriliyor (%30'dan fazla büyüyorsa). Sağ üstte **pusula** kuzeyi gösteriyor (kamera döndürülse de doğru). (`regionFrame`, `toRegion`, `fromRegion`)
5. **Kuşatma:** surlu bölgeler (bizim şehir/büyük şehir, düşman başkentleri) önce kuşatılır: 25 / 40 gün (top/tank varsa ×0,6, kışın ×1,3). Kuşatmada içerideki garnizon erir; süre dolunca surda gedik açılır, hücum başlar. Botlar da bizim surlu bölgemizi 1–2 ay kuşatır, o arada asker yetiştirebilirsin; sonra surlar savunmaya +%20/seviye katar. Bölgeye girince kuşatma görünüyor: çadırlı ordugâh, toplar, şehre düşen gülleler, yangınlar.
6. **İkmal:** sahadaki ordu her gün 1000 askere 1 ekmek yer (kışın ×1,5; 1810 kışında odun da yakar). En yakın kendi (ya da müttefik) bölgemizden **95 birimden** uzaksa (her üs +%15) veya ekmek biterse ikmal kesilir: ordu günde %1,2 erir, gücü ×0,75. Dünya haritasında ikmal hattı (kesik çizgi + giden araba; kesikse kırmızı), altta harekât çubuğu (aşama, asker, ikmal, kuşatma ilerlemesi).
7. **Savaş izi:** zorla alınan bölgede 1–2 ev yanık harabe (is, düşmüş kirişler, köz, tüten duman, kararmış toprak). Onarılana kadar tarlalar ×0,5, öfke +3, yükseltme yok. Bölge başlığında **🔨 Yıkıntıları onar** (800+600/harabe 💰, 1810'da +25🪵/harabe).
8. **Mevsimler:** ay = 30 sn. Kış (kuzeyde Ara–Şub, güneyde Haz–Ağu; tropiklerde yok): 42°'nin kuzeyinde tarla durur, 30–42° arası ×0,35; yazın ×1,15; ordular ve asker yürüyüşleri ×0,6 hızda; her kış ayı halk ısınmak için odun (1810: nüfus/120) ya da petrol (2014: nüfus/400) yakar, yoksa öfke +12. Dünya haritasında kışın kuzey karlı, sonbaharda altın ton; bölgede kar (yere ve ağaçlara), sonbahar yaprakları, bahar yeşili. Takvimin yanında mevsim simgesi.
9. **Halk memnuniyeti:** öfke artık parçalardan oluşuyor (vergi, yapılar, karakter, doyurulmuş halk, açlık, soğuk, savaş yorgunluğu, yıkık bölgeler, olaylar, kısa maçta bölge dışı) — "Halk öfkesi" göstergesinin üstüne gelince döküm görünür. Halk her ay nüfus×0,1 ekmek yer; ekmek biterse aç (öfke +15, nüfus artmaz). Kaybedilen savaş yorgunluğu +8, kazanılan +2, kaybedilen bölge +10; barışta ayda −2.
10. **Dönem olayları:** 2. aydan sonra 3–5 ayda bir sağda bir kart (40 sn içinde seçilmezse ilk seçenek). 1810: Napolyon Savaşları, veba, kuraklık, saray düğünü, bereketli yıl, donanmaya kereste. 2014: petrol krizi, yaptırımlar, ekonomik kriz, teknoloji atılımı, grip salgını, turizm patlaması (`EVENTS`).
11. **Diplomasi (çok oyunculu):** alt çubukta "Diplomasi" (yalnız çok oyunculuda). Oyunculara para/ekmek/demir/balık/et/(odun | petrol, teknoloji) teklif et: verdiğin mal cevap gelene kadar emanette, reddedilirse geri gelir. İttifak teklif et/boz; müttefikler birbirine saldıramaz ve harekâtta birbirinin bölgelerinden ikmal alır. Mesajlar kurucu (host) üzerinden geçer; ittifak listesi dünya durumuyla herkese gider.
12. **Kısa maç (40 dk):** dönem ekranında "Uzun oyun / Kısa maç" seçimi (çok oyunculuda lobide kurucunun kutusu). Rakipler oyuncunun çevresinde (yarıçap 100 birim) başlar, barış 3 ay. 15. dakikada güvenli bölge daralmaya başlar, 35. dakikada 30 birime iner (haritada sarı halka, dışı karartılı). Dışarıda kalan bölgelerde her ay askerin %25'i kaçar, öfke artar; botlar dışarıdaki ülkeleri kaybeder; dışarıya sefer yapılmaz. Süre dolunca ya da rakip kalmayınca en büyük imparatorluk (km²) kazanır.

**11 Kasım:**
1. **Yanık evler** %30 daha büyük, her birinde köz ateşi yanıyor ve uzaktan görünen kalın, koyu bir duman sütunu yükseliyor; çevresindeki kararmış toprak daha geniş.
2. **Nehir verisi temizlendi:** `scripts/build-rivers.mjs` (Natural Earth 10m nehir + göl dosyalarından) aynı nehrin üst üste binen kopyalarını siler (büyük nehir önce yerleşir, ~3 km içindeki tekrarlar atılır), uç uca gelen parçaları tek çizgiye birleştirir (517 birleşme; kavşaklar ayrı kalır). Fırat bölgesinde üst üste binme 1183 noktada 1'e indi.
3. **Göller:** `public/data/lakes.json` (863 göl; 211 baraj gölü yalnız 2014'te). Dünya haritasında boyalı; bölgede karadan oyulup su doluyor (Van, Tuz, Beyşehir…).
4. **Mevsim geçişi kararmasız:** kar ve sonbahar yaprakları artık malzemelerin kendisinde (`region/season.js`): yukarı bakan her yüzey (zemin, çatı, ağaç tepesi) kar alır, yapraklı ağaçlar sonbaharda turuncu-sarı-kırmızıya döner; mevsim değişince birkaç saniyede yavaşça geçer, bölge yeniden kurulmaz. Kar miktarı enleme göre (güneyde yamalı, kuzeyde dolu).

---

## 7. Test durumu (son çalıştırma)

10 Kasım (Playwright + swiftshader, `?test`): Karadeniz kara testi (kesin/ızgara uyuşmazlığı %4, Karadeniz ortası artık deniz) · Türkiye 2014 nehirleri ve köprüleri (Güneydoğu/İç Anadolu) · su değirmeni ve nehir kenarı tarla kurma · 1810 kış/sonbahar bölgeleri, yanık evler ve onarım · bot kuşatması ordugâhı · Yezd'e harekât: yürüyüş → 52 günlük kuşatma → ekmek bitince ikmal kesildi, ordu eridi → gedik → hücum · olay kartı · kısa maç (bölge halkası, daralma, süre sonu zafer ekranı) · diplomasi paneli (yerel benzetimle teklif/ittifak) — hepsi `errors none`. Gerçek iki tarayıcılı çok oyunculu bağlantı bu ortamda denenemedi (PeerJS sunucusuna erişim yok).

Hepsi geçti (30 Ekim, son kod):
- `smoke` — all checks passed
- `provinces` — all checks passed (yazılımsal GPU'da bölgeden çıkış 3–17 sn sürdüğü için bekleme sınırı 60 sn'ye çıkarıldı)
- `regionbuild` — errors: none | fails 0
- `battle` 2014 (Suriye·Humus fethedildi) ve 1810 (İran·Yezd fethedildi) — errors: none
- `era1810` — Osmanlı/Fransa/Japonya bölgeleri, errors: none
- Elle: harekât iptali (20.000 asker geri döndü), Afrika 1810 haritası, savan bölgesi, akşam ışığı ve duman çekimleri.

---

## 8. Bilinen zayıflıklar / yapılacaklar

- (10 Kasım) Çok oyunculu diplomasi ve kısa maç çok oyunculuda iki gerçek tarayıcıyla denenmedi. Kısa maçta güvenli bölgenin merkezi, herkes ülkesini seçene kadar oyuncudan oyuncuya biraz farklı olabilir (ayda bir yeniden hesaplanır).
- (10 Kasım) Döndürülmüş bölge görünümü kodda var ama mevcut il gruplarında hiçbir il %30 eşiğini geçmiyor (çapraz ince il yok); yalnız daha iyi merkez seçimi etkili. Gerçekten çok uzun iller için kare olmayan arazi gerekir.

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
