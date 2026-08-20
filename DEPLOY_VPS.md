# Deployment VPS (Node.js + PM2 + Nginx + SSL)

Panduan ini dibuat untuk project ini agar online 24/7 menggunakan PM2, domain `arthurg.my.id`, dan SSL HTTPS.

---

## 1) Persiapan VPS

Login ke VPS:

```bash
ssh root@IP_VPS_ANDA
```

Update package:

```bash
apt update && apt upgrade -y
```

Install tool dasar:

```bash
apt install -y curl git ufw nginx
```

Aktifkan firewall dasar:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

---

## 2) Pasang Node.js LTS + PM2

Install Node.js 22 LTS (disarankan):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

Install PM2 global:

```bash
npm install -g pm2
pm2 -v
```

---

## 3) Clone project ke VPS (langkah yang direkomendasikan)

Gunakan struktur folder tetap supaya mudah maintenance:

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/ArthurStore/website.git arthurg-website
cd /var/www/arthurg-website
```

Jika kamu mau pakai branch terbaru dari agent ini:

```bash
git checkout cursor/ui-polish-profesional-98aa
```

Install dependency:

```bash
npm ci
```

---

## 4) Konfigurasi yang perlu kamu ubah sebelum dijalankan

> Ringkasan teknis (API key, cara run local, SEO Google): lihat juga **[`README.md`](./README.md)**.

Edit file PM2:

```bash
nano /var/www/arthurg-website/ecosystem.config.cjs
```

Bagian penting yang harus kamu cek:

- `NEOXR_APIKEY` (**wajib** untuk public tools: cuaca, AI, downloader, dll.)
  - ganti dengan API key dari dashboard NeoXR
  - setelah diganti: `pm2 restart arthurg-website --env production`
- `PDF_CONVERTER_API_KEY` (PDF → JPG; biasanya sama dengan NeoXR)
- `PORT` (default `3000`)
- `TOOL_ACCESS_PIN` (ganti dari default agar lebih aman)
  - kompatibel juga dengan `ADMIN_PIN` untuk versi lama, tapi disarankan pakai `TOOL_ACCESS_PIN`
- `PDF_TMP_PUBLIC_BASE_URL` (wajib untuk tool PDF to JPG)
  - isi domain publik server, contoh: `https://arthurg.my.id`
  - dipakai untuk bikin URL PDF temporary (24 jam) yang bisa diakses API converter eksternal
- `PDF_CONVERTER_TIMEOUT_MS` (opsional, default `300000`)
  - timeout request ke provider converter dalam milidetik
  - contoh aman: `120000` (2 menit) sampai `300000` (5 menit) kalau provider lagi lambat
- `PDF_CONVERTER_GITHUB_REPO` (opsional, disarankan untuk fallback)
  - format: `owner/repo` (contoh: `ArthurStore/imagae`)
  - repo wajib public jika ingin raw URL bisa diakses provider converter
- `PDF_CONVERTER_GITHUB_BRANCH` (opsional, default `main`)
- `PDF_CONVERTER_GITHUB_BASE_PATH` (opsional, default `tmp/pdf-to-jpg`)
- `PDF_CONVERTER_GITHUB_TOKEN` (opsional, tapi wajib kalau pakai fallback GitHub raw)
  - gunakan token GitHub dengan permission **Contents: Read and write**
  - untuk Fine-grained token, cukup akses repo target saja (lebih aman)
  - dipakai ketika provider menolak URL temporary dengan pesan:
    `Unsupported CDN provider ...`
- `CATBOX_UPLOAD_ENDPOINT` (opsional, default `https://catbox.moe/user/api.php`)
- `CATBOX_TIMEOUT_MS` (opsional, default `300000`)
- `LITTERBOX_UPLOAD_ENDPOINT` (opsional, default `https://litterbox.catbox.moe/resources/internals/api.php`)
- `LITTERBOX_RETENTION_HOURS` (opsional, default `72`)
  - rentang valid `1-72`, contoh `72`
  - aplikasi otomatis kirim format `72h` ke litterbox
- `STORAGE_CAPACITY_MB`
  - isi `0` atau hapus untuk mode unlimited
  - isi angka > 0 kalau ingin dibatasi (contoh `10240`)

Contoh minimal:

```js
env_production: {
  NODE_ENV: "production",
  PORT: 3000,
  TOOL_ACCESS_PIN: "050507",
  NEOXR_APIKEY: "ganti_neoxr_api_key_anda",
  PDF_CONVERTER_API_KEY: "ganti_neoxr_api_key_anda",
  PDF_TMP_PUBLIC_BASE_URL: "https://arthurg.my.id",
  PDF_CONVERTER_TIMEOUT_MS: 300000,
  CATBOX_UPLOAD_ENDPOINT: "https://catbox.moe/user/api.php",
  CATBOX_TIMEOUT_MS: 300000,
  LITTERBOX_UPLOAD_ENDPOINT: "https://litterbox.catbox.moe/resources/internals/api.php",
  LITTERBOX_RETENTION_HOURS: 72,
  PDF_CONVERTER_GITHUB_REPO: "ArthurStore/imagae",
  PDF_CONVERTER_GITHUB_BRANCH: "main",
  PDF_CONVERTER_GITHUB_BASE_PATH: "tmp/pdf-to-jpg",
  PDF_CONVERTER_GITHUB_TOKEN: "github_pat_xxx_ganti_token_asli",
  STORAGE_CAPACITY_MB: 0
}
```

### Contoh file lengkap yang valid (hindari error koma)

```js
module.exports = {
  apps: [
    {
      name: "arthurg-website",
      script: "api/index.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        STORAGE_CAPACITY_MB: 10240,
        TOOL_ACCESS_PIN: "050507",
        PDF_TMP_PUBLIC_BASE_URL: "https://arthurg.my.id",
        PDF_CONVERTER_TIMEOUT_MS: 300000,
        CATBOX_UPLOAD_ENDPOINT: "https://catbox.moe/user/api.php",
        CATBOX_TIMEOUT_MS: 300000,
        LITTERBOX_UPLOAD_ENDPOINT: "https://litterbox.catbox.moe/resources/internals/api.php",
        LITTERBOX_RETENTION_HOURS: 72,
        PDF_CONVERTER_ENDPOINT: "https://api.neoxr.eu/api/pdf-converter",
        PDF_CONVERTER_API_KEY: "ganti_api_key_anda",
        PDF_CONVERTER_GITHUB_REPO: "ArthurStore/imagae",
        PDF_CONVERTER_GITHUB_BRANCH: "main",
        PDF_CONVERTER_GITHUB_BASE_PATH: "tmp/pdf-to-jpg",
        PDF_CONVERTER_GITHUB_TOKEN: "github_pat_xxx_ganti_token_asli"
      }
    }
  ]
};
```

Kalau ingin ganti URL admin:

- `ADMIN_PREFIX: "/admin"` (default sudah `/admin`)

---

## 5) Jalankan app dengan PM2

Di folder project (`/var/www/arthurg-website`), jalankan:

```bash
pm2 start ecosystem.config.cjs
pm2 status
```

Simpan agar auto start saat VPS reboot:

```bash
pm2 save
pm2 startup systemd -u root --hp /root
```

Setelah menjalankan perintah `pm2 startup`, copy-paste command tambahan yang muncul di terminal (jika ada), lalu jalankan lagi:

```bash
pm2 save
```

---

## 6) Konfigurasi DNS domain `arthurg.my.id`

Di panel DNS domain Anda, buat record:

- **Type:** A  
- **Name/Host:** `@`  
- **Value:** `IP_VPS_ANDA`  
- **TTL:** Auto / 300

Jika mau subdomain `www` juga aktif:

- **Type:** CNAME  
- **Name/Host:** `www`  
- **Value:** `arthurg.my.id`

Tunggu propagasi DNS (biasanya beberapa menit, kadang lebih lama).

Cek DNS dari VPS:

```bash
dig +short arthurg.my.id
```

Hasilnya harus IP VPS Anda.

---

## 7) Konfigurasi Nginx reverse proxy

Edit file virtual host di **sites-available**:

```bash
nano /etc/nginx/sites-available/arthurg.my.id
```

Isi dengan konfigurasi ini:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name arthurg.my.id www.arthurg.my.id;
    client_max_body_size 2048M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Penting untuk convert PDF → JPG (dan upload besar): tanpa ini Nginx sering memutus koneksi lebih dulu
        # → browser melihat HTTP 504 / respons HTML "gateway timeout" walau Node masih memproses.
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        send_timeout 600s;
    }
}
```

`client_max_body_size` wajib dinaikkan kalau pakai tool upload (File Vault / PDF to JPG), supaya tidak kena error **413 Request Entity Too Large** dari nginx. Nilai `2048M` mendukung file besar (>200MB); File Vault juga memakai upload chunked otomatis untuk file ≥50MB.

Setelah `git pull`, **wajib** restart proses Node agar route baru aktif:

```bash
cd /var/www/arthurg-website
git pull
npm ci
pm2 restart arthurg-website
# atau: pm2 reload ecosystem.config.cjs --env production
```

Tanpa restart PM2, file HTML/JS baru bisa sudah ter-serve (static), tetapi route Express seperti `/public/tiktok`, `/admin/pastebin`, dan fix `country` di `/api/public/trends` **tetap 404 / error** karena proses lama masih jalan.

Cara cepat deploy:

```bash
cd /var/www/arthurg-website
bash scripts/deploy-vps.sh
```

Verifikasi setelah restart:

```bash
curl -s https://arthurg.my.id/api/version
# harus ada: "build": "2026-08-09-emergency-fix"
curl -sI https://arthurg.my.id/public/tiktok | head -5
curl -s 'https://arthurg.my.id/api/public/trends?country=indonesia' | head -c 200
```

Jika `/public/tiktok` masih 404 dari Nginx (tanpa header `X-Powered-By: Express`), pastikan virtual host mem-proxy semua path ke Node — contoh di `deploy/nginx-arthurg.my.id.conf`.

**PDF to JPG sering gagal di VPS tapi lancar di localhost** biasanya karena **timeout proxy Nginx** (default singkat). Pastikan blok `proxy_*_timeout` di atas ikut disalin ke virtual host HTTPS juga (setelah Certbot menambahkan blok `listen 443 ssl;`).

Aktifkan site (buat symlink ke **sites-enabled**):

```bash
ln -s /etc/nginx/sites-available/arthurg.my.id /etc/nginx/sites-enabled/
```

Nonaktifkan config default nginx (disarankan supaya tidak bentrok):

```bash
rm -f /etc/nginx/sites-enabled/default
```

Ringkasnya biar tidak bingung:

- **`/etc/nginx/sites-available/`** = tempat file config sumber (yang kamu edit pakai nano)
- **`/etc/nginx/sites-enabled/`** = daftar site aktif (symlink dari available)
- **`default`** = config bawaan nginx; aman dihapus dari `sites-enabled` kalau sudah pakai config domain sendiri

Kalau ingin cek site mana yang aktif:

```bash
ls -lah /etc/nginx/sites-enabled/
```

Test dan reload nginx:

```bash
nginx -t
systemctl reload nginx
systemctl status nginx --no-pager
```

Sampai sini website harus sudah bisa diakses via:
- `http://arthurg.my.id`

---

## 8) Pasang SSL Let's Encrypt (HTTPS)

Install certbot:

```bash
apt install -y certbot python3-certbot-nginx
```

Generate SSL untuk domain:

```bash
certbot --nginx -d arthurg.my.id -d www.arthurg.my.id
```

Pilih opsi redirect ke HTTPS saat diminta.

Tes auto-renew SSL:

```bash
certbot renew --dry-run
```

Sekarang domain aktif di:
- `https://arthurg.my.id`

---

## 9) Perintah operasional harian

Cek app:

```bash
pm2 status
pm2 logs arthurg-website
```

Restart app setelah update:

```bash
cd /var/www/arthurg-website
git pull
npm ci
pm2 restart arthurg-website
pm2 save
```

Cek port listening:

```bash
ss -tulpn | rg ':3000|:80|:443'
```

---

## 10) Troubleshooting cepat

Jika domain tidak kebuka:
1. Pastikan DNS `arthurg.my.id` mengarah ke IP VPS yang benar.
2. Cek nginx:
   ```bash
   nginx -t
   systemctl status nginx --no-pager
   ```
3. Cek PM2:
   ```bash
   pm2 status
   pm2 logs arthurg-website --lines 100
   ```
4. Cek firewall:
   ```bash
   ufw status
   ```

---

## 11) Catatan environment variable

Aplikasi ini memakai email/captcha route. Supaya aman, set ENV di server (jangan hardcode kredensial):

Contoh (temporary session):

```bash
export NODE_ENV=production
export PORT=3000
export SESSION_SECRET='ganti-dengan-random-secret'
export TOOL_ACCESS_PIN='050507'
export PDF_TMP_PUBLIC_BASE_URL='https://arthurg.my.id'
export EMAIL_USER='email-anda'
export EMAIL_PASS='app-password-anda'
export EMAIL_TO='email-tujuan'
```

Jika ingin permanen, bisa pakai file ecosystem PM2 langsung (`env_production`) lalu restart:

```bash
pm2 restart arthurg-website --env production
pm2 save
```

---

## 12) Cara akses admin tool setelah deploy

Setelah semua aktif, akses:

- Login admin: `https://arthurg.my.id/admin`
- Masukkan `TOOL_ACCESS_PIN`
- Setelah login, pilih tool dari dashboard:
  - File Vault
  - Short Link
  - IP Calculator

Jika ingin logout:
- Klik tombol `Logout` di dashboard/tool, atau buka:
  - `https://arthurg.my.id/admin/logout`

---

## 13) Opsional: jalankan sebagai user non-root (lebih aman)

Disarankan membuat user deploy agar aplikasi tidak berjalan sebagai root:

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /var/www
chown -R deploy:deploy /var/www
```

Lalu login sebagai deploy, clone project, install dependency, dan jalankan PM2 dari user tersebut.

