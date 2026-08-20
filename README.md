# Arthur.JS Website (`arthurg.my.id`)

Portofolio & layanan **Gerald Arthur Gunawan (Arthur G)** — bot WhatsApp, public tools, dan admin utilities.

Stack: **Node.js + Express** (`api/index.js`), static views di `views/`, deploy VPS via **PM2 + Nginx**.

---

## Cara menjalankan (local)

Prasyarat: Node.js **18+**.

```bash
git clone https://github.com/ArthurStore/website.git
cd website
npm install
npm start
```

Buka: [http://localhost:3000](http://localhost:3000)

Script yang sama:

| Command | Fungsi |
|---------|--------|
| `npm start` / `npm run dev` | Jalankan `node api/index.js` |

---

## Struktur singkat

```
api/index.js          → server Express (semua route HTML + API)
views/                → HTML/CSS/JS frontend (thur.html = beranda)
ecosystem.config.cjs  → env production untuk PM2
DEPLOY_VPS.md         → panduan deploy VPS + Nginx + SSL
scripts/deploy-vps.sh → pull + npm ci + pm2 restart
```

Route penting:

- `/` — landing (`views/thur.html`)
- `/public` — hub tools
- `/public/*` — tools publik (cuaca, blackbox, tiktok, …)
- `/admin` — dashboard tool (butuh PIN)
- `/api/public/*` — API proxy ke NeoXR / internal
- `/robots.txt`, `/sitemap.xml` — SEO

---

## Ganti API key (NeoXR & lainnya)

Semua key diambil dari **environment variable** (bukan hardcode di frontend).

### 1) Local (PowerShell / bash)

```bash
# Windows PowerShell
$env:NEOXR_APIKEY="apikey_anda"
$env:PDF_CONVERTER_API_KEY="apikey_anda"
npm start
```

```bash
# Linux / macOS
export NEOXR_APIKEY="apikey_anda"
export PDF_CONVERTER_API_KEY="apikey_anda"
npm start
```

### 2) Production (PM2) — cara yang dipakai VPS

Edit `ecosystem.config.cjs`:

```js
env_production: {
  NEOXR_APIKEY: "apikey_anda",           // key utama public tools
  PDF_CONVERTER_API_KEY: "apikey_anda",  // PDF → JPG (bisa sama dengan NeoXR)
  IMGBB_API_KEY: "key_imgbb_anda",       // upload gambar (opsional)
  TOOL_ACCESS_PIN: "pin_admin_anda",
  // ...
}
```

Lalu restart:

```bash
pm2 restart arthurg-website --env production
pm2 save
```

### Key yang sering diganti

| Env | Dipakai untuk | Default di code |
|-----|---------------|-----------------|
| `NEOXR_APIKEY` | Hampir semua `/api/public/*` (cuaca, AI, downloader, …) | fallback string di server |
| `PDF_CONVERTER_API_KEY` | PDF to JPG | sama / fallback NeoXR |
| `IMGBB_API_KEY` | Upload gambar temp | ada fallback |
| `TOOL_ACCESS_PIN` / `ADMIN_PIN` | Login `/admin` | `050507` (wajib diganti) |
| `SESSION_SECRET` | Session cookie Express | ganti di production |
| `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_TO` | Form kontak | set di VPS |
| `PUBLIC_BASE_URL` / `PDF_TMP_PUBLIC_BASE_URL` | URL publik server | `https://arthurg.my.id` |

Ambil / regenerate NeoXR key di dashboard NeoXR API, lalu paste ke `NEOXR_APIKEY`.

---

## Deploy VPS (ringkas)

Panduan lengkap: [`DEPLOY_VPS.md`](./DEPLOY_VPS.md).

Ringkas setelah clone di `/var/www/arthurg-website`:

```bash
npm ci
# edit ecosystem.config.cjs (API key + PIN)
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Update kode:

```bash
cd /var/www/arthurg-website
bash scripts/deploy-vps.sh
# atau:
git pull && npm ci && pm2 restart arthurg-website --env production
```

Cek hidup:

```bash
curl -s https://arthurg.my.id/api/version
pm2 logs arthurg-website --lines 50
```

---

## SEO & Google Search

Meta `author` / JSON-LD **Gerald Arthur Gunawan** sudah ada di halaman HTML. Google **tidak langsung** menampilkan hasil baru hanya karena meta tag.

Agar muncul di search:

1. Buka [Google Search Console](https://search.google.com/search-console)
2. Tambahkan property `https://arthurg.my.id`
3. Submit sitemap: `https://arthurg.my.id/sitemap.xml`
4. Minta index untuk URL: `/`, `/sertifikat`, `/portofolio`
5. Tunggu crawl (biasanya beberapa hari; kadang 1–2 minggu)

Cek cepat:

- `site:arthurg.my.id Gerald Arthur Gunawan`
- Pastikan halaman live memuat nama di title, description, dan teks visible (sudah ditambahkan di beranda)

---

## Troubleshooting cepat

| Gejala | Cek |
|--------|-----|
| Public tool error / HTML bukan JSON | `NEOXR_APIKEY` valid? Restart PM2 setelah ganti env |
| `/admin` PIN salah | `TOOL_ACCESS_PIN` di ecosystem |
| Route baru 404 padahal file ada | `pm2 restart` (proses lama masih jalan) |
| Upload 413 | Nginx `client_max_body_size` (lihat DEPLOY_VPS.md) |
| Loading splash miring | Hard refresh (`Ctrl+F5`) — cache CSS `utama.css?v=…` |

---

## Lisensi / kredit

© Gerald Arthur Gunawan · Arthur Bot Solutions  
Repo: [github.com/ArthurStore/website](https://github.com/ArthurStore)
