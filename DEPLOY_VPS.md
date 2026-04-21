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

Edit file PM2:

```bash
nano /var/www/arthurg-website/ecosystem.config.cjs
```

Bagian penting yang harus kamu cek:

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
  - gunakan token GitHub dengan scope `repo` (minimal write contents)
  - dipakai ketika provider menolak URL temporary dengan pesan:
    `Unsupported CDN provider ...`
- `STORAGE_CAPACITY_MB`
  - isi `0` atau hapus untuk mode unlimited
  - isi angka > 0 kalau ingin dibatasi (contoh `10240`)

Contoh minimal:

```js
env_production: {
  NODE_ENV: "production",
  PORT: 3000,
  TOOL_ACCESS_PIN: "050507",
  PDF_TMP_PUBLIC_BASE_URL: "https://arthurg.my.id",
  PDF_CONVERTER_TIMEOUT_MS: 300000,
  PDF_CONVERTER_GITHUB_REPO: "ArthurStore/imagae",
  PDF_CONVERTER_GITHUB_BRANCH: "main",
  PDF_CONVERTER_GITHUB_BASE_PATH: "tmp/pdf-to-jpg",
  PDF_CONVERTER_GITHUB_TOKEN: "ghp_xxx_ganti_token_asli",
  STORAGE_CAPACITY_MB: 0
}
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
    client_max_body_size 200M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`client_max_body_size` wajib dinaikkan kalau pakai tool upload (contoh PDF to JPG), supaya tidak kena error **413 Request Entity Too Large** dari nginx.

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

