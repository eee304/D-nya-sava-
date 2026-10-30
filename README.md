# Map Battle Royale

Oyun: https://eee304.github.io/D-nya-sava-/

## Klasörler
- **Kök (`index.html`, `assets/`, `data/`, `img/`, `models/`)** — derlenmiş oyun. GitHub Pages bunu yayınlar. Elle düzenlenmez; `kaynak/` derlenince üzerine yazılır.
- **`kaynak/`** — oyunun kaynak kodu (Vite + Three.js). Geliştirme burada yapılır.
- **`notlar/`** — devam notları ve geliştirme kararları.

## Geliştirme
```bash
cd kaynak
npm ci
npm run dev      # http://localhost:5173
npm run build    # kaynak/dist/ üretir
```
Yayınlamak için `kaynak/dist/` içindekiler repo köküne kopyalanır ve commit'lenir.
