const sesss = require('express-session');
const nodemailer = require('nodemailer');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const archiver = require('archiver');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const shortLinks = new Map();
const fileVaultEntries = new Map();
const fileVaultFolders = new Map();
const pdfTempUploads = new Map();
const pastebinEntries = new Map();
const chunkUploadSessions = new Map();
const MAX_HISTORY_PER_LINK = 20;
const PDF_TEMP_TTL_MS = 24 * 60 * 60 * 1000;
const PDF_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const UPLOAD_STORAGE_DIR = process.env.UPLOAD_STORAGE_DIR || path.join(os.tmpdir(), 'Arthur.JS-file-vault');
const PDF_TMP_UPLOAD_DIR = process.env.PDF_TMP_UPLOAD_DIR || path.join(os.tmpdir(), 'Arthur.JS-pdf-to-jpg-temp');
const CHUNK_UPLOAD_DIR = process.env.CHUNK_UPLOAD_DIR || path.join(os.tmpdir(), 'Arthur.JS-chunk-uploads');
const configuredChunkSizeMb = Number(process.env.UPLOAD_CHUNK_SIZE_MB || 8);
const UPLOAD_CHUNK_SIZE_BYTES = Number.isFinite(configuredChunkSizeMb) && configuredChunkSizeMb > 0
  ? Math.floor(configuredChunkSizeMb * 1024 * 1024)
  : 8 * 1024 * 1024;
const configuredStorageMb = Number(process.env.STORAGE_CAPACITY_MB || 0);
const configuredMaxUploadMb = Number(process.env.MAX_UPLOAD_FILE_SIZE_MB || 2048);
const STORAGE_CAPACITY_BYTES = Number.isFinite(configuredStorageMb) && configuredStorageMb > 0
  ? configuredStorageMb * 1024 * 1024
  : null;
const MAX_UPLOAD_FILE_SIZE_BYTES = Number.isFinite(configuredMaxUploadMb) && configuredMaxUploadMb > 0
  ? configuredMaxUploadMb * 1024 * 1024
  : null;
const TOOL_PREFIX = (() => {
  const raw = String(process.env.TOOL_PREFIX || '/admin').trim();
  if (!raw || raw === '/') return '/admin';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return normalized.replace(/\/+$/, '');
})();
const TOOL_ACCESS_PIN = String(
  process.env.TOOL_ACCESS_PIN ||
  process.env.ADMIN_PIN ||
  '050507'
).trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const PDF_CONVERTER_ENDPOINT = String(process.env.PDF_CONVERTER_ENDPOINT || 'https://api.neoxr.eu/api/pdf-converter').trim();
const PDF_CONVERTER_API_KEY = String(
  process.env.PDF_CONVERTER_API_KEY ||
  process.env.NEOXR_APIKEY ||
  'yokheimoet'
).trim();
const PDF_CONVERTER_GITHUB_REPO = String(process.env.PDF_CONVERTER_GITHUB_REPO || '').trim();
const PDF_CONVERTER_GITHUB_BRANCH = String(process.env.PDF_CONVERTER_GITHUB_BRANCH || 'main').trim();
const PDF_CONVERTER_GITHUB_TOKEN = String(process.env.PDF_CONVERTER_GITHUB_TOKEN || '').trim();
const PDF_CONVERTER_GITHUB_BASE_PATH = String(process.env.PDF_CONVERTER_GITHUB_BASE_PATH || 'tmp/pdf-to-jpg').trim().replace(/^\/+|\/+$/g, '');
const configuredPdfConverterTimeoutMs = Number(process.env.PDF_CONVERTER_TIMEOUT_MS || 300000);
const PDF_CONVERTER_TIMEOUT_MS = Number.isFinite(configuredPdfConverterTimeoutMs) &&
  configuredPdfConverterTimeoutMs >= 5000 &&
  configuredPdfConverterTimeoutMs <= 600000
  ? configuredPdfConverterTimeoutMs
  : 300000;
const PDF_TMP_PUBLIC_BASE_URL = String(
  process.env.PDF_TMP_PUBLIC_BASE_URL ||
  process.env.TOOL_PUBLIC_BASE_URL ||
  process.env.PUBLIC_BASE_URL ||
  ''
).trim().replace(/\/+$/, '');
const NEOXR_BASE_ENDPOINT = String(process.env.NEOXR_BASE_ENDPOINT || 'https://api.neoxr.eu/api')
  .trim()
  .replace(/\/+$/, '');
const NEOXR_API_KEY = String(
  process.env.NEOXR_APIKEY ||
  process.env.PDF_CONVERTER_API_KEY ||
  PDF_CONVERTER_API_KEY ||
  'yokheimoet'
).trim();
const IMGBB_API_KEY = String(
  process.env.IMGBB_API_KEY ||
  process.env.IBB_API_KEY ||
  'd052a761e2b9f16bee42eeea229e8a02'
).trim();
const configuredNeoxrTimeoutMs = Number(process.env.NEOXR_TIMEOUT_MS || 30000);
const NEOXR_TIMEOUT_MS = Number.isFinite(configuredNeoxrTimeoutMs) &&
  configuredNeoxrTimeoutMs >= 3000 &&
  configuredNeoxrTimeoutMs <= 120000
  ? configuredNeoxrTimeoutMs
  : 30000;
const configuredPublicImageUploadMb = Number(process.env.PUBLIC_IMAGE_UPLOAD_MAX_MB || 10);
const PUBLIC_IMAGE_UPLOAD_MAX_BYTES = Number.isFinite(configuredPublicImageUploadMb) &&
  configuredPublicImageUploadMb > 0
  ? Math.floor(configuredPublicImageUploadMb * 1024 * 1024)
  : 10 * 1024 * 1024;
const CATBOX_UPLOAD_ENDPOINT = String(process.env.CATBOX_UPLOAD_ENDPOINT || 'https://catbox.moe/user/api.php').trim();
const CATBOX_USER_HASH = String(process.env.CATBOX_USER_HASH || '').trim();
const LITTERBOX_UPLOAD_ENDPOINT = String(
  process.env.LITTERBOX_UPLOAD_ENDPOINT ||
  'https://litterbox.catbox.moe/resources/internals/api.php'
).trim();
const configuredLitterboxHours = Number(process.env.LITTERBOX_RETENTION_HOURS || 72);
const LITTERBOX_RETENTION_HOURS = Number.isFinite(configuredLitterboxHours) &&
  configuredLitterboxHours >= 1 &&
  configuredLitterboxHours <= 72
  ? Math.floor(configuredLitterboxHours)
  : 72;
const configuredCatboxTimeoutMs = Number(process.env.CATBOX_TIMEOUT_MS || 300000);
const CATBOX_TIMEOUT_MS = Number.isFinite(configuredCatboxTimeoutMs) &&
  configuredCatboxTimeoutMs >= 5000 &&
  configuredCatboxTimeoutMs <= 600000
  ? configuredCatboxTimeoutMs
  : 300000;
const configuredHealthcheckTimeoutMs = Number(process.env.PDF_CONVERTER_HEALTHCHECK_TIMEOUT_MS || 20000);
const PDF_CONVERTER_HEALTHCHECK_TIMEOUT_MS = Number.isFinite(configuredHealthcheckTimeoutMs) &&
  configuredHealthcheckTimeoutMs >= 2000 &&
  configuredHealthcheckTimeoutMs <= 120000
  ? configuredHealthcheckTimeoutMs
  : 20000;

if (!fs.existsSync(UPLOAD_STORAGE_DIR)) {
  fs.mkdirSync(UPLOAD_STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(PDF_TMP_UPLOAD_DIR)) {
  fs.mkdirSync(PDF_TMP_UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(CHUNK_UPLOAD_DIR)) {
  fs.mkdirSync(CHUNK_UPLOAD_DIR, { recursive: true });
}

app.enable("trust proxy");
app.set("json spaces", 2);
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true, limit: '64mb' }));
app.use(bodyParser.json({ limit: '64mb' }));
app.use((req, res, next) => {
  // timeout panjang untuk upload/download besar
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

app.use(sesss({
  secret: process.env.SESSION_SECRET || 'captchaSecretKey12345',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeRelativePath(relativePath, fallback) {
  const rawPath = String(relativePath || fallback || '').replace(/\\/g, '/').trim();
  return rawPath || String(fallback || 'file');
}

function normalizeFolderKey(folderName) {
  const base = String(folderName || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return base || 'folder';
}

function isStorageLimitEnabled() {
  return Number.isFinite(STORAGE_CAPACITY_BYTES) && STORAGE_CAPACITY_BYTES > 0;
}

function ensureToolAccess(req, res, next) {
  if (req.session?.toolAccessGranted) return next();
  return res.redirect(`${TOOL_PREFIX}`);
}

function ensureToolApiAccess(req, res, next) {
  if (req.session?.toolAccessGranted) return next();
  return res.status(401).json({ message: 'Akses admin diperlukan.' });
}

function sendToolView(res, fileName) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, `../views/${fileName}`));
}

// Router
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/thur.html'));
});

app.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(path.join(__dirname, '../views/robots.txt'));
});

app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(path.join(__dirname, '../views/sitemap.xml'));
});

app.get('/sertifikat', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/sertifikat.html'));
});

app.get('/pkl', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/pkl.html'));
});

app.get('/portofolio', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../views/portofolio.html'));
});

app.get('/public', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-tools.html'));
});
app.get('/public-tools', (_req, res) => res.redirect('/public'));
app.get('/public/cuaca', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-cuaca.html'));
});
app.get('/public/tempmail', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-tempmail.html'));
});
app.get('/public/upscale', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-upscale.html'));
});
app.get('/public/remini', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-remini.html'));
});
app.get('/public/whatimg', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-whatimg.html'));
});
app.get('/public/blackbox', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-blackbox.html'));
});

app.get('/public/brat', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-brat.html'));
});

app.get('/public/bratvid', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-bratvid.html'));
});

app.get('/public/youtube', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-youtube.html'));
});

app.get('/public/instagram', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-instagram.html'));
});

app.get('/public/webp', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-webp.html'));
});

app.get('/public/trends', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-trends.html'));
});

app.get(['/public/tiktok', '/public/tiktok/', '/public-tiktok'], (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-tiktok.html'));
});

app.get('/public/emojimix', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-emojimix.html'));
});

app.get('/public/iqc', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-iqc.html'));
});

app.get('/public/cekresi', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-cekresi.html'));
});

app.get(['/p/:slug', '/p/:slug/'], (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/public-paste.html'));
});

app.get('/bot-status', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.sendFile(path.join(__dirname, '../views/bot-status.html'));
});

app.get('/short-link', (_req, res) => res.status(404).send(renderShortLinkErrorPage(
  'Halaman Tidak Ditemukan',
  'Endpoint ini tidak tersedia untuk publik.'
)));
app.get('/file-vault', (_req, res) => res.status(404).send(renderShortLinkErrorPage(
  'Halaman Tidak Ditemukan',
  'Endpoint ini tidak tersedia untuk publik.'
)));
app.get('/ip-calculator', (_req, res) => res.status(404).send(renderShortLinkErrorPage(
  'Halaman Tidak Ditemukan',
  'Endpoint ini tidak tersedia untuk publik.'
)));
app.get('/pdf-to-jpg', (_req, res) => res.status(404).send(renderShortLinkErrorPage(
  'Halaman Tidak Ditemukan',
  'Endpoint ini tidak tersedia untuk publik.'
)));

app.get(`${TOOL_PREFIX}`, (req, res) => {
  if (req.session?.toolAccessGranted) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Admin Dashboard</title>
          <style>
            :root { color-scheme: dark; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px;
              font-family: Arial, sans-serif;
              background:
                radial-gradient(circle at 14% 16%, rgba(56, 189, 248, 0.26), transparent 32%),
                radial-gradient(circle at 80% 8%, rgba(59, 130, 246, 0.2), transparent 36%),
                linear-gradient(145deg, #030712 0%, #0b1733 50%, #06152e 100%);
              color: #dbeafe;
            }
            .card {
              width: min(760px, 100%);
              background: rgba(15, 23, 42, 0.85);
              border: 1px solid rgba(148, 163, 184, 0.28);
              border-radius: 16px;
              box-shadow: 0 18px 36px rgba(2, 6, 23, 0.42);
              padding: 24px;
            }
            h1 { margin: 0 0 8px; font-size: 1.5rem; color: #93c5fd; }
            p { margin: 0 0 18px; color: #bfdbfe; line-height: 1.6; }
            .tools { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
            a.tool {
              display: block;
              text-decoration: none;
              border-radius: 12px;
              border: 1px solid rgba(96, 165, 250, 0.36);
              background: linear-gradient(160deg, rgba(30, 64, 175, 0.35), rgba(15, 23, 42, 0.78));
              color: #e2e8f0;
              padding: 14px;
              font-weight: 700;
              text-align: center;
              transition: transform .2s ease, border-color .2s ease;
            }
            a.tool:hover {
              transform: translateY(-1px);
              border-color: rgba(147, 197, 253, 0.7);
            }
            .footer {
              margin-top: 16px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
            }
            .hint { color: #93c5fd; font-size: .88rem; }
            .logout {
              border: 1px solid rgba(248, 113, 113, 0.45);
              border-radius: 10px;
              background: rgba(127, 29, 29, 0.35);
              color: #fecaca;
              padding: 8px 12px;
              font-weight: 700;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>Admin Dashboard</h1>
            <p>Pilih tool yang ingin kamu gunakan.</p>
            <div class="tools">
              <a class="tool" href="${TOOL_PREFIX}/file-vault">File Vault</a>
              <a class="tool" href="${TOOL_PREFIX}/pastebin">Text Pastebin</a>
              <a class="tool" href="${TOOL_PREFIX}/short-link">Short Link</a>
              <a class="tool" href="${TOOL_PREFIX}/ip-calculator">IP Calculator</a>
              <a class="tool" href="${TOOL_PREFIX}/pdf-to-jpg">PDF to JPG</a>
            </div>
            <div class="footer">
              <span class="hint">Akses privat aktif</span>
              <a class="logout" href="${TOOL_PREFIX}/logout">Logout</a>
            </div>
          </main>
        </body>
      </html>
    `);
  }

  return res.send(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Admin Access</title>
        <style>
          :root { color-scheme: dark; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            font-family: Arial, sans-serif;
            background:
              radial-gradient(circle at 16% 12%, rgba(59, 130, 246, 0.3), transparent 35%),
              radial-gradient(circle at 80% 8%, rgba(14, 165, 233, 0.22), transparent 36%),
              linear-gradient(145deg, #020617 0%, #0b1733 52%, #06152e 100%);
            color: #dbeafe;
          }
          .card {
            width: min(460px, 100%);
            background: linear-gradient(160deg, rgba(15, 23, 42, 0.88), rgba(8, 15, 32, 0.82));
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 18px;
            box-shadow: 0 18px 42px rgba(2, 6, 23, 0.48);
            padding: 28px;
            backdrop-filter: blur(8px);
          }
          h1 { margin: 0 0 8px; font-size: 1.4rem; color: #93c5fd; }
          p { margin: 0 0 18px; color: #bfdbfe; line-height: 1.6; font-size: 0.95rem; }
          label { display: block; margin-bottom: 8px; font-size: 0.9rem; color: #cbd5e1; }
          .pin-wrap {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 14px;
          }
          input {
            width: 100%;
            box-sizing: border-box;
            border-radius: 10px;
            border: 1px solid rgba(59, 130, 246, 0.45);
            background: rgba(2, 6, 23, 0.72);
            color: #e2e8f0;
            padding: 10px 12px;
          }
          input:focus {
            outline: 2px solid rgba(96, 165, 250, 0.55);
            outline-offset: 1px;
          }
          button {
            border: none;
            border-radius: 10px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: #fff;
            font-weight: 700;
            padding: 10px 12px;
            cursor: pointer;
          }
          button[type="submit"] {
            width: 100%;
          }
          .toggle-pin {
            width: auto;
            border: 1px solid rgba(96, 165, 250, 0.48);
            background: rgba(30, 64, 175, 0.25);
            color: #bfdbfe;
            font-size: 0.8rem;
            padding: 10px 12px;
            white-space: nowrap;
          }
          .toggle-pin:hover {
            background: rgba(30, 64, 175, 0.45);
          }
          .hint {
            margin-top: 8px;
            color: #93c5fd;
            font-size: 0.82rem;
          }
          .error {
            margin-top: 12px;
            border: 1px solid rgba(248, 113, 113, 0.45);
            background: rgba(127, 29, 29, 0.35);
            color: #fecaca;
            border-radius: 10px;
            padding: 9px 10px;
            font-size: 0.86rem;
          }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>Admin Tool Access</h1>
          <p>Masukkan PIN untuk membuka File Vault, Short Link, dan IP Calculator.</p>
          <form method="POST" action="${TOOL_PREFIX}/login">
            <label for="pin">PIN Admin</label>
            <div class="pin-wrap">
              <input
                id="pin"
                name="pin"
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="current-password"
                placeholder="••••••"
                required
              />
              <button id="toggle-pin" class="toggle-pin" type="button" aria-label="Tampilkan PIN">Lihat</button>
            </div>
            <button type="submit">Masuk</button>
            <p class="hint">PIN disembunyikan untuk menjaga privasi saat input.</p>
          </form>
          ${req.query?.error ? '<div class="error">PIN salah. Coba lagi.</div>' : ''}
        </main>
        <script>
          const pinInput = document.getElementById('pin');
          const toggleButton = document.getElementById('toggle-pin');
          if (pinInput && toggleButton) {
            toggleButton.addEventListener('click', () => {
              const reveal = pinInput.type === 'password';
              pinInput.type = reveal ? 'text' : 'password';
              toggleButton.textContent = reveal ? 'Sembunyi' : 'Lihat';
              toggleButton.setAttribute('aria-label', reveal ? 'Sembunyikan PIN' : 'Tampilkan PIN');
            });
          }
        </script>
      </body>
    </html>
  `);
});

app.post(`${TOOL_PREFIX}/login`, (req, res) => {
  const candidate = String(req.body?.pin || '').trim();
  if (candidate && candidate === TOOL_ACCESS_PIN) {
    req.session.toolAccessGranted = true;
    return res.redirect(`${TOOL_PREFIX}`);
  }
  return res.redirect(`${TOOL_PREFIX}?error=1`);
});

app.get(`${TOOL_PREFIX}/logout`, (req, res) => {
  req.session.toolAccessGranted = false;
  return res.redirect(`${TOOL_PREFIX}`);
});

app.get(`${TOOL_PREFIX}/short-link`, ensureToolAccess, (_req, res) => sendToolView(res, 'short-link.html'));
app.get(`${TOOL_PREFIX}/file-vault`, ensureToolAccess, (_req, res) => sendToolView(res, 'file-vault.html'));
app.get(`${TOOL_PREFIX}/ip-calculator`, ensureToolAccess, (_req, res) => sendToolView(res, 'ip-calculator.html'));
app.get(`${TOOL_PREFIX}/pdf-to-jpg`, ensureToolAccess, (_req, res) => sendToolView(res, 'pdf-to-jpg.html'));
app.get(`${TOOL_PREFIX}/pastebin`, ensureToolAccess, (_req, res) => sendToolView(res, 'pastebin.html'));
app.get(`${TOOL_PREFIX}/pastebin/`, ensureToolAccess, (_req, res) => sendToolView(res, 'pastebin.html'));
app.get('/pastebin.html', ensureToolAccess, (_req, res) => sendToolView(res, 'pastebin.html'));
app.get(`${TOOL_PREFIX}/bot-status`, (_req, res) => res.redirect(302, '/bot-status'));

// Static files - sesuaikan path untuk Vercel
const staticOptions = {
  extensions: ['html'],
  index: ['index.html'],
  fallthrough: true,
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
};
app.use('/views', express.static(path.join(__dirname, '../views'), staticOptions));
app.use(express.static(path.join(__dirname, '../views'), staticOptions));

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_STORAGE_DIR),
  filename: (_req, file, cb) => {
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${randomSuffix}${ext}`);
  }
});

const uploadLimits = { files: 200 };
if (Number.isFinite(MAX_UPLOAD_FILE_SIZE_BYTES) && MAX_UPLOAD_FILE_SIZE_BYTES > 0) {
  uploadLimits.fileSize = MAX_UPLOAD_FILE_SIZE_BYTES;
}
const upload = multer({
  storage: uploadStorage,
  limits: uploadLimits
});

const pdfToJpgStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PDF_TMP_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
    cb(null, `${Date.now()}-${randomSuffix}${ext}`);
  }
});
const pdfToJpgUpload = multer({
  storage: pdfToJpgStorage,
  limits: { files: 1 }
});

function getFileStatus(entry) {
  if (typeof entry.expiresAt === 'number' && Date.now() > entry.expiresAt) {
    return 'expired';
  }
  return 'active';
}

function getUsedStorageBytes() {
  return Array.from(fileVaultEntries.values()).reduce((acc, entry) => acc + entry.sizeBytes, 0);
}

function buildUploadPublicUrl(req, id) {
  return `${req.protocol}://${req.get('host')}/u/${id}`;
}

function buildUploadDownloadUrl(req, id) {
  return `${req.protocol}://${req.get('host')}/api/uploads/${id}/download`;
}

function buildFolderPublicUrl(req, folderId) {
  return `${req.protocol}://${req.get('host')}/u/f/${folderId}`;
}

function buildFolderDownloadAllUrl(req, folderId) {
  return `${req.protocol}://${req.get('host')}/api/folders/${folderId}/download-all`;
}

function resolvePdfPublicBaseUrl(req) {
  if (PDF_TMP_PUBLIC_BASE_URL) return PDF_TMP_PUBLIC_BASE_URL;
  const forwardedHost = String(req.get('x-forwarded-host') || '').trim();
  const host = forwardedHost || String(req.get('host') || '').trim();
  if (!host) return '';
  const forwardedProto = String(req.get('x-forwarded-proto') || '').trim();
  const protocol = forwardedProto || req.protocol || 'https';
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

function buildPdfTempPublicUrl(req, token) {
  const base = resolvePdfPublicBaseUrl(req);
  if (!base) return '';
  const safeToken = encodeURIComponent(String(token || '').trim());
  return `${base}/api/pdf-to-jpg-upload/${safeToken}`;
}

async function uploadPdfToCatbox(localFilePath, originalName, mimeType) {
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    throw new Error('File PDF temporary tidak ditemukan untuk upload Catbox.');
  }

  const fileBuffer = fs.readFileSync(localFilePath);
  const safeOriginalName = (String(originalName || 'converted.pdf').trim() || 'converted.pdf')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-');
  const safeMimeType = String(mimeType || 'application/pdf') || 'application/pdf';
  const attempts = [
    {
      provider: 'catbox',
      endpoint: CATBOX_UPLOAD_ENDPOINT,
      useUserHash: true
    },
    {
      provider: 'litterbox',
      endpoint: LITTERBOX_UPLOAD_ENDPOINT,
      useUserHash: false,
      retentionHours: LITTERBOX_RETENTION_HOURS
    }
  ];
  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), CATBOX_TIMEOUT_MS);
    try {
      const payload = new FormData();
      payload.append('reqtype', 'fileupload');
      if (attempt.useUserHash && CATBOX_USER_HASH) payload.append('userhash', CATBOX_USER_HASH);
      if (attempt.provider === 'litterbox') payload.append('time', `${String(attempt.retentionHours || 72)}h`);
      payload.append(
        'fileToUpload',
        new Blob([fileBuffer], { type: safeMimeType }),
        safeOriginalName
      );

      const response = await fetch(attempt.endpoint, {
        method: 'POST',
        body: payload,
        signal: timeoutController.signal
      });
      const rawText = String(await response.text() || '').trim();

      if (!response.ok) {
        const uploadError = new Error(`${attempt.provider} gagal merespons dengan benar (HTTP ${response.status}).`);
        uploadError.statusCode = 502;
        uploadError.payload = { status: response.status, body: rawText, endpoint: attempt.endpoint, provider: attempt.provider };
        throw uploadError;
      }

      if (!rawText || /^error/i.test(rawText) || !/^https?:\/\//i.test(rawText)) {
        const catboxError = new Error(rawText || `${attempt.provider} tidak mengembalikan URL file.`);
        catboxError.statusCode = 502;
        catboxError.payload = { body: rawText, endpoint: attempt.endpoint, provider: attempt.provider };
        throw catboxError;
      }

      return {
        url: rawText,
        provider: attempt.provider,
        endpoint: attempt.endpoint
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`Upload ke ${attempt.provider} timeout ${Math.round(CATBOX_TIMEOUT_MS / 1000)} detik.`);
        timeoutError.statusCode = 504;
        timeoutError.payload = { endpoint: attempt.endpoint, provider: attempt.provider };
        throw timeoutError;
      }
      lastError = error;
      const errorText = String(
        error?.payload?.body ||
        error?.message ||
        ''
      ).toLowerCase();
      const shouldTryNextAttempt = attempt.provider === 'catbox' && (
        errorText.includes('invalid uploader') ||
        Number(error?.payload?.status) === 412
      );
      if (!shouldTryNextAttempt) {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Upload ke Catbox/Litterbox gagal.');
}

async function runPdfConversionQuickTest(req) {
  const startedAt = Date.now();
  const report = {
    requestId: crypto.randomBytes(4).toString('hex'),
    startedAt,
    catbox: { ok: false, url: '', error: null, elapsedMs: 0 },
    converter: { ok: false, sourceType: '', message: '', elapsedMs: 0, statusCode: null, upstream: null },
    summary: ''
  };

  const sampleBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 220 120] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 39 >>\nstream\nBT /F1 18 Tf 20 65 Td (Quick test) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const sampleName = `quick-test-${Date.now()}.pdf`;
  const samplePath = path.join(PDF_TMP_UPLOAD_DIR, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-quick-test.pdf`);
  fs.writeFileSync(samplePath, sampleBytes);

  let token = '';
  try {
    const catboxStart = Date.now();
    try {
      const uploaded = await uploadPdfToCatbox(samplePath, sampleName, 'application/pdf');
      report.catbox.ok = true;
      report.catbox.url = uploaded.url;
    } catch (catboxError) {
      report.catbox.error = {
        message: catboxError?.message || 'Catbox test gagal.',
        statusCode: Number(catboxError?.statusCode) || null,
        upstream: catboxError?.payload || null
      };
    } finally {
      report.catbox.elapsedMs = Date.now() - catboxStart;
    }

    if (report.catbox.ok && report.catbox.url) {
      const converterStart = Date.now();
      report.converter.sourceType = 'catbox';
      try {
        const payload = await convertPdfByUrlWithRetries(report.catbox.url, 'quick-test', 'jpg', {
          timeoutMs: PDF_CONVERTER_HEALTHCHECK_TIMEOUT_MS,
          maxAttempts: 3,
          retryDelayMs: 2000
        });
        report.converter.ok = true;
        report.converter.message = payload?.message || payload?.msg || 'Converter merespons sukses.';
        report.converter.upstream = payload;
      } catch (converterError) {
        report.converter.message = converterError?.message || 'Converter test gagal.';
        report.converter.statusCode = Number(converterError?.statusCode) || null;
        report.converter.upstream = converterError?.payload || null;
      } finally {
        report.converter.elapsedMs = Date.now() - converterStart;
      }
    } else {
      report.converter.ok = false;
      report.converter.sourceType = 'catbox';
      report.converter.message = 'Quick test dihentikan karena upload Catbox/Litterbox gagal.';
      report.converter.statusCode = 502;
    }
  } finally {
    if (token && pdfTempUploads.has(token)) {
      const tempEntry = pdfTempUploads.get(token);
      try {
        if (tempEntry?.filePath && fs.existsSync(tempEntry.filePath)) fs.unlinkSync(tempEntry.filePath);
      } catch (_error) {
        // ignore cleanup error
      }
      pdfTempUploads.delete(token);
    } else {
      try {
        if (samplePath && fs.existsSync(samplePath)) fs.unlinkSync(samplePath);
      } catch (_error) {
        // ignore cleanup error
      }
    }
  }

  const totalMs = Date.now() - startedAt;
  if (report.converter.ok) {
    report.summary = `Quick test sukses (${report.converter.sourceType}) dalam ${totalMs}ms.`;
  } else if (report.catbox.ok) {
    report.summary = `Catbox sukses, namun converter gagal (${report.converter.message || 'unknown error'}).`;
  } else {
    report.summary = `Catbox gagal dan converter fallback gagal (${report.converter.message || report.catbox.error?.message || 'unknown error'}).`;
  }
  report.totalElapsedMs = totalMs;
  return report;
}

app.get('/api/pdf-to-jpg/quick-test', ensureToolApiAccess, async (req, res) => {
  try {
    const report = await runPdfConversionQuickTest(req);
    const statusCode = report.converter?.ok ? 200 : 502;
    return res.status(statusCode).json(report);
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Quick test gagal dijalankan.',
      hint: 'Pastikan server bisa akses internet ke Catbox/Litterbox dan provider converter.',
      upstream: error?.payload || null
    });
  }
});

function serializeUploadEntry(req, entry) {
  const folder = entry.folderId ? fileVaultFolders.get(entry.folderId) : null;
  return {
    id: entry.id,
    originalName: entry.originalName,
    relativePath: entry.relativePath,
    sizeBytes: entry.sizeBytes,
    contentType: entry.contentType,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    status: getFileStatus(entry),
    clickCount: entry.clickCount,
    downloadCount: entry.downloadCount,
    lastClickedAt: entry.lastClickedAt,
    lastDownloadedAt: entry.lastDownloadedAt,
    folderId: entry.folderId || null,
    folderName: folder?.name || null,
    openUrl: buildUploadPublicUrl(req, entry.id),
    downloadUrl: buildUploadDownloadUrl(req, entry.id)
  };
}

function serializeFolderEntry(req, folder) {
  const files = folder.fileIds
    .map((id) => fileVaultEntries.get(id))
    .filter(Boolean);
  const totalBytes = files.reduce((acc, file) => acc + (file.sizeBytes || 0), 0);
  const createdAt = files.reduce((acc, file) => Math.min(acc, file.createdAt || Date.now()), Date.now());
  const expiresAt = files.reduce((acc, file) => {
    if (file.expiresAt == null) return acc;
    if (acc == null) return file.expiresAt;
    return Math.max(acc, file.expiresAt);
  }, null);
  const clickCount = files.reduce((acc, file) => acc + (file.clickCount || 0), 0);
  const downloadCount = files.reduce((acc, file) => acc + (file.downloadCount || 0), 0);
  const lastClickedAt = files.reduce((acc, file) => Math.max(acc, file.lastClickedAt || 0), 0) || null;
  const lastDownloadedAt = files.reduce((acc, file) => Math.max(acc, file.lastDownloadedAt || 0), 0) || null;

  return {
    folderId: folder.id,
    folderName: folder.name,
    totalFiles: files.length,
    totalBytes,
    createdAt,
    expiresAt,
    clickCount,
    downloadCount,
    lastClickedAt,
    lastDownloadedAt,
    status: files.some((file) => getFileStatus(file) === 'active') ? 'active' : 'expired',
    openUrl: buildFolderPublicUrl(req, folder.id),
    downloadAllUrl: buildFolderDownloadAllUrl(req, folder.id)
  };
}

function deleteUploadFile(entry) {
  if (!entry || !entry.filePath) return;
  try {
    if (fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath);
    }
  } catch (error) {
    console.error('Gagal menghapus file upload:', error.message);
  }
}

function cleanupExpiredUploads() {
  const now = Date.now();
  for (const [id, entry] of fileVaultEntries.entries()) {
    if (typeof entry.expiresAt === 'number' && now > entry.expiresAt) {
      deleteUploadFile(entry);
      fileVaultEntries.delete(id);
    }
  }
  for (const [folderId, folder] of fileVaultFolders.entries()) {
    const activeFileIds = folder.fileIds.filter((id) => fileVaultEntries.has(id));
    if (activeFileIds.length === 0) {
      fileVaultFolders.delete(folderId);
    } else {
      folder.fileIds = activeFileIds;
    }
  }
}

function cleanupExpiredPdfUploads() {
  const now = Date.now();
  for (const [token, entry] of pdfTempUploads.entries()) {
    if (!entry || typeof entry.expiresAt !== 'number' || now <= entry.expiresAt) continue;
    try {
      if (entry.filePath && fs.existsSync(entry.filePath)) fs.unlinkSync(entry.filePath);
    } catch (error) {
      console.error('Gagal menghapus file PDF temporary:', error.message);
    }
    pdfTempUploads.delete(token);
  }
}

setInterval(() => {
  cleanupExpiredPdfUploads();
}, PDF_CLEANUP_INTERVAL_MS).unref();

function createUploadSummary() {
  const entries = Array.from(fileVaultEntries.values());
  const usedBytes = entries.reduce((acc, item) => acc + item.sizeBytes, 0);
  const totalClicks = entries.reduce((acc, item) => acc + item.clickCount, 0);
  const totalDownloads = entries.reduce((acc, item) => acc + item.downloadCount, 0);
  const totalCapacity = isStorageLimitEnabled() ? STORAGE_CAPACITY_BYTES : null;
  const remainingBytes = totalCapacity === null ? usedBytes : Math.max(0, totalCapacity - usedBytes);
  const storagePercent = totalCapacity
    ? Number(((usedBytes / totalCapacity) * 100).toFixed(2))
    : 0;

  return {
    totalFiles: entries.length,
    usedBytes,
    totalCapacityBytes: totalCapacity,
    remainingBytes,
    storagePercent,
    unlimitedStorage: totalCapacity === null,
    totalClicks,
    totalDownloads
  };
}

function parseRelativePaths(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cleanupUploadedTempFiles(files) {
  (files || []).forEach((file) => {
    try {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (_error) {
      // ignore cleanup error
    }
  });
}

app.get('/api/uploads', (req, res) => {
  cleanupExpiredUploads();

  const allEntries = Array.from(fileVaultEntries.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => serializeUploadEntry(req, entry));
  const folders = Array.from(fileVaultFolders.values())
    .map((folder) => serializeFolderEntry(req, folder))
    .sort((a, b) => b.createdAt - a.createdAt);

  const folderIds = new Set(folders.map((folder) => folder.folderId));
  const standaloneEntries = allEntries.filter((entry) => !entry.folderId || !folderIds.has(entry.folderId));

  return res.json({
    summary: createUploadSummary(),
    entries: standaloneEntries,
    folders
  });
});

app.post('/api/uploads', (req, res) => {
  upload.array('files', 200)(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? `Ukuran file melebihi batas ${Math.floor(MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024))}MB per file.`
        : 'Gagal upload file. Pastikan format dan ukuran valid.';
      return res.status(400).json({ message });
    }

    cleanupExpiredUploads();

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'Minimal upload 1 file.' });
    }

    const expiresInDaysInput = String(req.body.expiresInDays || '').trim();
    let expiresInDays = null;
    if (expiresInDaysInput) {
      const parsedDays = Number(expiresInDaysInput);
      if (!Number.isFinite(parsedDays) || parsedDays <= 0 || parsedDays > 3650) {
        cleanupUploadedTempFiles(files);
        return res.status(400).json({ message: 'Durasi file harus di antara 1 sampai 3650 hari.' });
      }
      expiresInDays = parsedDays;
    }

    const incomingBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    if (isStorageLimitEnabled() && (getUsedStorageBytes() + incomingBytes) > STORAGE_CAPACITY_BYTES) {
      cleanupUploadedTempFiles(files);
      const summary = createUploadSummary();
      return res.status(413).json({
        message: 'Storage penuh. Kurangi ukuran file atau hapus file lama.',
        summary
      });
    }

    const createdAt = Date.now();
    const expiresAt = expiresInDays ? createdAt + (expiresInDays * 24 * 60 * 60 * 1000) : null;
    const relativePaths = parseRelativePaths(req.body.relativePaths);

    const parsedRelativePaths = files.map((file, index) => normalizeRelativePath(relativePaths[index], file.originalname));
    const folderCandidates = parsedRelativePaths
      .map((relativePath) => relativePath.split('/').filter(Boolean))
      .filter((segments) => segments.length > 1);
    const firstFolder = folderCandidates.length > 0 ? folderCandidates[0][0] : null;
    const isSingleFolderUpload = Boolean(
      firstFolder &&
      folderCandidates.length > 0 &&
      folderCandidates.every((segments) => segments[0] === firstFolder)
    );
    const folderRecord = isSingleFolderUpload
      ? {
          id: `${normalizeFolderKey(firstFolder)}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          name: firstFolder,
          createdAt,
          fileIds: []
        }
      : null;

    const savedEntries = files.map((file, index) => {
      const id = generateCode() + crypto.randomBytes(2).toString('hex');
      const relativePath = parsedRelativePaths[index];
      const entry = {
        id,
        filePath: file.path,
        storedName: file.filename,
        originalName: file.originalname,
        relativePath,
        folderId: folderRecord ? folderRecord.id : null,
        sizeBytes: file.size || 0,
        contentType: file.mimetype || 'application/octet-stream',
        createdAt,
        expiresAt,
        clickCount: 0,
        downloadCount: 0,
        lastClickedAt: null,
        lastDownloadedAt: null
      };
      fileVaultEntries.set(id, entry);
      if (folderRecord) folderRecord.fileIds.push(id);
      return serializeUploadEntry(req, entry);
    });

    if (folderRecord && folderRecord.fileIds.length > 0) {
      fileVaultFolders.set(folderRecord.id, folderRecord);
    }

    return res.status(201).json({
      message: `${savedEntries.length} file berhasil diupload.`,
      entries: savedEntries,
      folder: folderRecord ? serializeFolderEntry(req, folderRecord) : null,
      summary: createUploadSummary()
    });
  });
});


function cleanupChunkSession(uploadId) {
  const session = chunkUploadSessions.get(uploadId);
  if (!session) return;
  try {
    if (session.dir && fs.existsSync(session.dir)) {
      fs.rmSync(session.dir, { recursive: true, force: true });
    }
  } catch (_e) {
    // ignore
  }
  chunkUploadSessions.delete(uploadId);
}

function cleanupExpiredChunkSessions() {
  const now = Date.now();
  for (const [id, session] of chunkUploadSessions.entries()) {
    if (!session?.expiresAt || session.expiresAt > now) continue;
    cleanupChunkSession(id);
  }
}

const chunkPartUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const uploadId = String(req.query?.uploadId || req.body?.uploadId || '').trim();
      const session = chunkUploadSessions.get(uploadId);
      if (!session?.dir) return cb(new Error('Sesi upload chunk tidak valid.'));
      cb(null, session.dir);
    },
    filename: (req, _file, cb) => {
      const idx = Number(req.query?.chunkIndex ?? req.body?.chunkIndex);
      if (!Number.isInteger(idx) || idx < 0) return cb(new Error('chunkIndex tidak valid.'));
      cb(null, `part-${String(idx).padStart(6, '0')}`);
    }
  }),
  limits: {
    files: 1,
    fileSize: Math.max(UPLOAD_CHUNK_SIZE_BYTES * 2, 16 * 1024 * 1024)
  }
});

app.get('/api/uploads/limits', (_req, res) => {
  return res.json({
    maxUploadFileSizeMb: Number.isFinite(MAX_UPLOAD_FILE_SIZE_BYTES) && MAX_UPLOAD_FILE_SIZE_BYTES > 0
      ? Math.floor(MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024))
      : null,
    chunkSizeBytes: UPLOAD_CHUNK_SIZE_BYTES,
    chunkRecommendedOverBytes: 50 * 1024 * 1024
  });
});

app.post('/api/uploads/chunk/init', (req, res) => {
  cleanupExpiredChunkSessions();
  const filename = String(req.body?.filename || 'upload.bin').trim() || 'upload.bin';
  const relativePath = String(req.body?.relativePath || filename).trim() || filename;
  const size = Number(req.body?.size || 0);
  const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const expiresInDays = Number(req.body?.expiresInDays || 0);

  if (!Number.isFinite(size) || size <= 0) {
    return res.status(400).json({ message: 'Ukuran file wajib diisi.' });
  }
  if (Number.isFinite(MAX_UPLOAD_FILE_SIZE_BYTES) && MAX_UPLOAD_FILE_SIZE_BYTES > 0 && size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return res.status(400).json({
      message: `Ukuran file melebihi batas ${Math.floor(MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024))}MB per file.`
    });
  }

  const uploadId = crypto.randomBytes(12).toString('hex');
  const dir = path.join(CHUNK_UPLOAD_DIR, uploadId);
  fs.mkdirSync(dir, { recursive: true });
  const totalChunks = Math.ceil(size / UPLOAD_CHUNK_SIZE_BYTES);
  chunkUploadSessions.set(uploadId, {
    uploadId,
    filename,
    relativePath,
    size,
    mimeType,
    expiresInDays: Number.isFinite(expiresInDays) && expiresInDays > 0 ? expiresInDays : null,
    totalChunks,
    received: new Set(),
    dir,
    createdAt: Date.now(),
    expiresAt: Date.now() + (6 * 60 * 60 * 1000)
  });

  return res.status(201).json({
    uploadId,
    chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
    totalChunks
  });
});

app.post('/api/uploads/chunk', (req, res) => {
  cleanupExpiredChunkSessions();
  chunkPartUpload.single('chunk')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.message || 'Gagal menerima chunk.' });
    }
    const uploadId = String(req.query?.uploadId || req.body?.uploadId || '').trim();
    const chunkIndex = Number(req.query?.chunkIndex ?? req.body?.chunkIndex);
    const session = chunkUploadSessions.get(uploadId);
    if (!session) {
      cleanupUploadedTempFiles(req.file ? [req.file] : []);
      return res.status(404).json({ message: 'Sesi upload tidak ditemukan / sudah expired.' });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      cleanupUploadedTempFiles(req.file ? [req.file] : []);
      return res.status(400).json({ message: 'chunkIndex di luar rentang.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Chunk file wajib diupload.' });
    }
    session.received.add(chunkIndex);
    return res.json({
      ok: true,
      received: session.received.size,
      totalChunks: session.totalChunks
    });
  });
});

app.post('/api/uploads/chunk/complete', async (req, res) => {
  cleanupExpiredChunkSessions();
  cleanupExpiredUploads();
  const uploadId = String(req.body?.uploadId || '').trim();
  const session = chunkUploadSessions.get(uploadId);
  if (!session) {
    return res.status(404).json({ message: 'Sesi upload tidak ditemukan / sudah expired.' });
  }

  if (session.received.size !== session.totalChunks) {
    return res.status(400).json({
      message: `Chunk belum lengkap (${session.received.size}/${session.totalChunks}).`
    });
  }

  const finalName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${session.filename.replace(/[^\w.\-]+/g, '_')}`;
  const finalPath = path.join(UPLOAD_STORAGE_DIR, finalName);

  try {
    const out = fs.createWriteStream(finalPath);
    await new Promise((resolve, reject) => {
      out.on('error', reject);
      out.on('finish', resolve);
      (async () => {
        try {
          for (let i = 0; i < session.totalChunks; i += 1) {
            const partPath = path.join(session.dir, `part-${String(i).padStart(6, '0')}`);
            if (!fs.existsSync(partPath)) throw new Error(`Part ${i} hilang.`);
            const buf = fs.readFileSync(partPath);
            const canContinue = out.write(buf);
            if (!canContinue) {
              await new Promise((r) => out.once('drain', r));
            }
          }
          out.end();
        } catch (err) {
          out.destroy(err);
          reject(err);
        }
      })();
    });

    const stat = fs.statSync(finalPath);
    if (isStorageLimitEnabled()) {
      const used = getUsedStorageBytes();
      if (used + stat.size > STORAGE_CAPACITY_BYTES) {
        try { fs.unlinkSync(finalPath); } catch (_e) {}
        cleanupChunkSession(uploadId);
        return res.status(400).json({ message: 'Kapasitas storage tidak mencukupi.' });
      }
    }

    const createdAt = Date.now();
    let expiresAt = null;
    if (session.expiresInDays) {
      expiresAt = createdAt + (session.expiresInDays * 24 * 60 * 60 * 1000);
    }
    const id = generateCode() + crypto.randomBytes(2).toString('hex');
    const entry = {
      id,
      filePath: finalPath,
      storedName: finalName,
      originalName: session.filename,
      relativePath: session.relativePath,
      folderId: null,
      sizeBytes: stat.size,
      contentType: session.mimeType,
      createdAt,
      expiresAt,
      clickCount: 0,
      downloadCount: 0,
      lastClickedAt: null,
      lastDownloadedAt: null
    };
    fileVaultEntries.set(id, entry);
    cleanupChunkSession(uploadId);

    return res.status(201).json({
      message: 'File besar berhasil diupload (chunked).',
      entries: [serializeUploadEntry(req, entry)],
      folder: null,
      summary: createUploadSummary()
    });
  } catch (error) {
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch (_e) {}
    return res.status(500).json({ message: error?.message || 'Gagal merakit chunk upload.' });
  }
});

function sanitizePasteSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function findPasteBySlug(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return null;
  for (const entry of pastebinEntries.values()) {
    if (String(entry.slug || '').toLowerCase() === key || String(entry.id) === key) {
      return entry;
    }
  }
  return null;
}

function isPasteSlugTaken(slug, exceptId = null) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return false;
  for (const entry of pastebinEntries.values()) {
    if (exceptId && entry.id === exceptId) continue;
    if (String(entry.slug || '').toLowerCase() === key) return true;
  }
  return false;
}

function generateUniquePasteSlug() {
  for (let i = 0; i < 24; i += 1) {
    const candidate = generateCode();
    if (!isPasteSlugTaken(candidate) && !pastebinEntries.has(candidate)) {
      return candidate;
    }
  }
  return crypto.randomBytes(5).toString('hex');
}

function buildPastePublicUrl(req, slug) {
  return `${req.protocol}://${req.get('host')}/p/${encodeURIComponent(slug)}`;
}

function serializePasteEntry(req, entry, includeContent = true) {
  const slug = entry.slug || entry.id;
  const base = {
    id: entry.id,
    slug,
    title: entry.title,
    size: String(entry.content || '').length,
    clickCount: Number(entry.clickCount || 0),
    views: Number(entry.clickCount || 0),
    publicUrl: buildPastePublicUrl(req, slug),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
  if (includeContent) base.content = entry.content;
  return base;
}

app.get('/api/pastebin', (req, res) => {
  if (!req.session?.toolAccessGranted) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  const items = Array.from(pastebinEntries.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => serializePasteEntry(req, entry, true));
  return res.json({ items });
});

app.post('/api/pastebin', (req, res) => {
  if (!req.session?.toolAccessGranted) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const content = String(req.body?.content || '');
  if (!content.trim()) {
    return res.status(400).json({ message: 'Konten snippet wajib diisi.' });
  }
  if (content.length > 500000) {
    return res.status(400).json({ message: 'Snippet terlalu besar (maks 500KB karakter).' });
  }

  const requestedSlug = sanitizePasteSlug(req.body?.slug);
  let slug = requestedSlug;
  if (slug) {
    if (slug.length < 3) {
      return res.status(400).json({ message: 'Slug minimal 3 karakter (huruf/angka/dash/underscore).' });
    }
    if (isPasteSlugTaken(slug)) {
      return res.status(409).json({ message: 'Slug sudah dipakai, gunakan slug lain.' });
    }
  } else {
    slug = generateUniquePasteSlug();
  }

  const id = crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  const entry = {
    id,
    slug,
    title,
    content,
    clickCount: 0,
    createdAt: now,
    updatedAt: now
  };
  pastebinEntries.set(id, entry);
  return res.status(201).json({
    message: 'Snippet tersimpan.',
    item: serializePasteEntry(req, entry, true)
  });
});

app.get('/api/pastebin/:id', (req, res) => {
  if (!req.session?.toolAccessGranted) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  const key = String(req.params.id || '').trim();
  const entry = pastebinEntries.get(key) || findPasteBySlug(key);
  if (!entry) return res.status(404).json({ message: 'Snippet tidak ditemukan.' });
  return res.json({ item: serializePasteEntry(req, entry, true) });
});

app.delete('/api/pastebin/:id', (req, res) => {
  if (!req.session?.toolAccessGranted) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  const key = String(req.params.id || '').trim();
  const entry = pastebinEntries.get(key) || findPasteBySlug(key);
  if (!entry) return res.status(404).json({ message: 'Snippet tidak ditemukan.' });
  pastebinEntries.delete(entry.id);
  return res.json({ message: 'Snippet dihapus.' });
});

app.get('/api/public/paste/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const entry = findPasteBySlug(slug);
  if (!entry) {
    return res.status(404).json({ message: 'Snippet tidak ditemukan.' });
  }
  entry.clickCount = Number(entry.clickCount || 0) + 1;
  entry.updatedAt = Date.now();
  return res.json({ item: serializePasteEntry(req, entry, true) });
});

app.delete('/api/uploads/:id', (req, res) => {
  cleanupExpiredUploads();
  const id = String(req.params.id || '').trim();
  const entry = fileVaultEntries.get(id);

  if (!entry) {
    return res.status(404).json({ message: 'File tidak ditemukan.' });
  }

  deleteUploadFile(entry);
  if (entry.folderId && fileVaultFolders.has(entry.folderId)) {
    const folder = fileVaultFolders.get(entry.folderId);
    folder.fileIds = folder.fileIds.filter((fileId) => fileId !== id);
    if (folder.fileIds.length === 0) {
      fileVaultFolders.delete(entry.folderId);
    }
  }
  fileVaultEntries.delete(id);

  return res.json({
    message: 'File berhasil dihapus.',
    summary: createUploadSummary()
  });
});

app.delete('/api/folders/:folderId', (req, res) => {
  cleanupExpiredUploads();
  const folderId = String(req.params.folderId || '').trim();
  const folder = fileVaultFolders.get(folderId);
  if (!folder) {
    return res.status(404).json({ message: 'Folder tidak ditemukan.' });
  }

  folder.fileIds.forEach((fileId) => {
    const entry = fileVaultEntries.get(fileId);
    if (entry) {
      deleteUploadFile(entry);
      fileVaultEntries.delete(fileId);
    }
  });
  fileVaultFolders.delete(folderId);

  return res.json({
    message: 'Folder berhasil dihapus.',
    summary: createUploadSummary()
  });
});

app.get('/u/:id', (req, res) => {
  cleanupExpiredUploads();
  const id = String(req.params.id || '').trim();
  const entry = fileVaultEntries.get(id);

  if (!entry) {
    return res.status(404).send(renderShortLinkErrorPage(
      'File Tidak Ditemukan',
      'File kemungkinan sudah dihapus atau masa berlakunya habis.'
    ));
  }

  entry.clickCount += 1;
  entry.lastClickedAt = Date.now();

  return res.send(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>File Vault - ${entry.originalName}</title>
        <style>
          body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #1e3a8a, #020617); color: #dbeafe; font-family: Arial, sans-serif; display: grid; place-items: center; padding: 24px; }
          .card { width: min(600px, 100%); background: rgba(15, 23, 42, 0.86); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 14px; padding: 24px; box-shadow: 0 15px 30px rgba(2, 6, 23, 0.45);}
          h1 { margin: 0 0 12px; color: #93c5fd; font-size: 1.3rem; word-break: break-all; }
          p { margin: 6px 0; color: #bfdbfe; line-height: 1.6; }
          a.button { display: inline-block; margin-top: 18px; padding: 10px 16px; border-radius: 10px; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; }
          a.button:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>${entry.originalName}</h1>
          <p>File size: ${(entry.sizeBytes / 1024 / 1024).toFixed(2)} MB</p>
          <p>Total klik: ${entry.clickCount}</p>
          <p>Total download: ${entry.downloadCount}</p>
          <a class="button" href="${buildUploadDownloadUrl(req, entry.id)}">Download File</a>
        </main>
      </body>
    </html>
  `);
});

app.get('/u/f/:folderId', (req, res) => {
  cleanupExpiredUploads();
  const folderId = String(req.params.folderId || '').trim();
  const folder = fileVaultFolders.get(folderId);
  if (!folder) {
    return res.status(404).send(renderShortLinkErrorPage(
      'Folder Tidak Ditemukan',
      'Folder kemungkinan sudah dihapus atau masa berlakunya habis.'
    ));
  }

  const files = folder.fileIds
    .map((id) => fileVaultEntries.get(id))
    .filter(Boolean);
  if (files.length === 0) {
    fileVaultFolders.delete(folderId);
    return res.status(404).send(renderShortLinkErrorPage(
      'Folder Tidak Ditemukan',
      'Folder tidak memiliki file aktif.'
    ));
  }

  files.forEach((file) => {
    file.clickCount += 1;
    file.lastClickedAt = Date.now();
  });

  const fileRows = files.map((file, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(file.relativePath)}</td>
      <td>${(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</td>
      <td><a href="${buildUploadDownloadUrl(req, file.id)}">Download</a></td>
    </tr>
  `).join('');

  return res.send(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Folder - ${escapeHtml(folder.name)}</title>
        <style>
          body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #1e3a8a, #020617); color: #dbeafe; font-family: Arial, sans-serif; padding: 24px; }
          .card { max-width: 980px; margin: 0 auto; background: rgba(15, 23, 42, 0.86); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 14px; padding: 24px; box-shadow: 0 15px 30px rgba(2, 6, 23, 0.45);}
          h1 { margin: 0 0 12px; color: #93c5fd; font-size: 1.35rem; word-break: break-word; }
          p { margin: 6px 0 14px; color: #bfdbfe; line-height: 1.6; }
          .btn { display: inline-block; margin-bottom: 16px; padding: 10px 16px; border-radius: 10px; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; }
          .btn:hover { background: #1d4ed8; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid rgba(148, 163, 184, 0.25); padding: 10px 8px; text-align: left; }
          th { color: #93c5fd; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; }
          td a { color: #93c5fd; text-decoration: none; font-weight: 700; }
          td a:hover { color: #bfdbfe; text-decoration: underline; }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>Folder: ${escapeHtml(folder.name)}</h1>
          <p>${files.length} file tersedia dalam folder ini.</p>
          <a class="btn" href="${buildFolderDownloadAllUrl(req, folder.id)}">Download All (ZIP)</a>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>File</th>
                <th>Ukuran</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>${fileRows}</tbody>
          </table>
        </main>
      </body>
    </html>
  `);
});

app.get('/api/uploads/:id/download', (req, res) => {
  cleanupExpiredUploads();
  const id = String(req.params.id || '').trim();
  const entry = fileVaultEntries.get(id);

  if (!entry) {
    return res.status(404).json({ message: 'File tidak ditemukan atau sudah expired.' });
  }

  if (!fs.existsSync(entry.filePath)) {
    fileVaultEntries.delete(id);
    return res.status(404).json({ message: 'File fisik tidak ditemukan.' });
  }

  entry.downloadCount += 1;
  entry.lastDownloadedAt = Date.now();
  return res.download(entry.filePath, entry.originalName);
});

app.get('/api/folders/:folderId/download-all', (req, res) => {
  cleanupExpiredUploads();
  const folderId = String(req.params.folderId || '').trim();
  const folder = fileVaultFolders.get(folderId);
  if (!folder) {
    return res.status(404).json({ message: 'Folder tidak ditemukan.' });
  }

  const files = folder.fileIds
    .map((id) => fileVaultEntries.get(id))
    .filter(Boolean);
  if (files.length === 0) {
    fileVaultFolders.delete(folderId);
    return res.status(404).json({ message: 'Folder tidak memiliki file aktif.' });
  }

  const archiveName = `${normalizeFolderKey(folder.name)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (error) => {
    if (!res.headersSent) {
      res.status(500).json({ message: `Gagal membuat arsip: ${error.message}` });
    } else {
      res.end();
    }
  });
  archive.pipe(res);

  files.forEach((entry) => {
    entry.downloadCount += 1;
    entry.lastDownloadedAt = Date.now();
    archive.file(entry.filePath, { name: entry.relativePath || entry.originalName });
  });

  archive.finalize();
});

function isValidHttpUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function isAllowedIbbImageUrl(urlValue) {
  try {
    const parsed = new URL(String(urlValue || '').trim());
    const host = String(parsed.hostname || '').toLowerCase();
    if (!host) return false;
    return host === 'i.ibb.co' ||
      host.endsWith('.i.ibb.co') ||
      host === 'i.ibb.co.com' ||
      host.endsWith('.i.ibb.co.com');
  } catch (_error) {
    return false;
  }
}

async function uploadImageBufferToImgbb(fileBuffer, originalName = 'image-upload') {
  if (!IMGBB_API_KEY) {
    const keyError = new Error('IMGBB_API_KEY belum diatur di server.');
    keyError.statusCode = 500;
    throw keyError;
  }

  const payload = new FormData();
  const safeName = String(originalName || 'image-upload')
    .trim()
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'image-upload';
  payload.append('name', safeName);
  payload.append('image', Buffer.from(fileBuffer).toString('base64'));

  let response;
  try {
    response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(IMGBB_API_KEY)}`, {
      method: 'POST',
      body: payload
    });
  } catch (error) {
    const networkError = new Error(`Gagal upload ke i.bb: ${error.message}`);
    networkError.statusCode = 502;
    throw networkError;
  }

  const rawText = await response.text();
  let parsed = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch (_error) {
    parsed = { raw: rawText };
  }

  if (!response.ok || parsed?.success === false) {
    const uploadError = new Error(parsed?.error?.message || parsed?.message || `Upload i.bb gagal (${response.status})`);
    uploadError.statusCode = 502;
    uploadError.payload = parsed;
    throw uploadError;
  }

  const imageUrl = String(
    parsed?.data?.url ||
    parsed?.data?.display_url ||
    parsed?.data?.image?.url ||
    ''
  ).trim();
  if (!imageUrl || !isValidHttpUrl(imageUrl)) {
    const invalidUrlError = new Error('i.bb tidak mengembalikan URL gambar valid.');
    invalidUrlError.statusCode = 502;
    invalidUrlError.payload = parsed;
    throw invalidUrlError;
  }

  return {
    url: imageUrl,
    deleteUrl: parsed?.data?.delete_url || null,
    raw: parsed
  };
}

const publicImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: PUBLIC_IMAGE_UPLOAD_MAX_BYTES
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('File harus berupa gambar (image/*).'));
  }
});

function buildNeoxrUrl(endpoint, queryParams = {}) {
  const cleanedEndpoint = String(endpoint || '').replace(/^\/+/, '').trim();
  const searchParams = new URLSearchParams();
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    searchParams.set(key, stringValue);
  });
  searchParams.set('apikey', NEOXR_API_KEY);
  return `${NEOXR_BASE_ENDPOINT}/${cleanedEndpoint}?${searchParams.toString()}`;
}

async function callNeoxrApi(endpoint, queryParams = {}) {
  if (!NEOXR_API_KEY) {
    const noKeyError = new Error('NeoXR API key belum tersedia di server.');
    noKeyError.statusCode = 500;
    throw noKeyError;
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), NEOXR_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(buildNeoxrUrl(endpoint, queryParams), {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain;q=0.9,*/*;q=0.8' },
      signal: timeoutController.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Request ke NeoXR timeout ${Math.round(NEOXR_TIMEOUT_MS / 1000)} detik.`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    const networkError = new Error(`Gagal menghubungi NeoXR API: ${error.message}`);
    networkError.statusCode = 502;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();
  let payload = {};
  let parsedOk = false;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
    parsedOk = true;
  } catch (_error) {
    payload = { raw: rawText };
  }

  if (!parsedOk || contentType.includes('text/html') || /^\s*<(!doctype|html)\b/i.test(rawText || '')) {
    const htmlError = new Error('Upstream mengembalikan HTML, bukan JSON valid.');
    htmlError.statusCode = 502;
    htmlError.payload = { message: htmlError.message, contentType, preview: String(rawText || '').slice(0, 180) };
    throw htmlError;
  }

  if (!response.ok) {
    const upstreamError = new Error(payload?.msg || payload?.message || `NeoXR API error (${response.status})`);
    upstreamError.statusCode = 502;
    upstreamError.payload = payload;
    throw upstreamError;
  }

  if (payload && payload.status === false) {
    const failError = new Error(payload?.msg || payload?.message || 'Upstream mengembalikan status gagal.');
    failError.statusCode = Number(response.status) === 200 ? 502 : Number(response.status) || 502;
    failError.payload = payload;
    throw failError;
  }

  return payload;
}

function extractAiReplyText(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload !== 'object') return '';

  const candidates = [
    payload?.data?.data?.response,
    payload?.data?.response,
    payload?.data?.message,
    payload?.data?.text,
    payload?.data?.answer,
    payload?.data?.result,
    typeof payload?.data === 'string' ? payload.data : null,
    payload?.result,
    payload?.response,
    payload?.message,
    payload?.text,
    payload?.answer
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  if (payload?.data && typeof payload.data === 'object') {
    for (const value of Object.values(payload.data)) {
      if (typeof value === 'string' && value.trim() && value.length > 1) return value.trim();
    }
  }
  return '';
}

async function callBlackboxCompatibleAi(q) {
  const endpoints = ['blackbox', 'gpt4', 'gemini-chat', 'bard'];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const payload = await callNeoxrApi(endpoint, { q });
      const text = extractAiReplyText(payload);
      if (text) {
        return {
          status: true,
          data: {
            response: text,
            message: text,
            source: endpoint
          },
          upstream: payload
        };
      }
      lastError = new Error(`Endpoint ${endpoint} sukses tanpa teks.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Gagal menghubungi AI upstream.');
}

function isTimeoutLikeError(error) {
  const statusCode = Number(error?.statusCode) || null;
  if (statusCode === 504) return true;
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('timed out');
}

function sanitizePublicUpstreamMessage(error, fallback) {
  if (isTimeoutLikeError(error)) {
    return 'Server converter sedang timeout. Coba lagi beberapa saat, atau ulang dengan input yang lebih ringan.';
  }
  const raw = String(error?.message || fallback || '').trim();
  // hilangkan kata "NeoXR" biar tidak tampil ke user
  return raw.replace(/neoxr/gi, 'server');
}

function neoxrQueryFromRequest(query = {}) {
  const params = {};
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const s = String(value).trim();
    if (!s) return;
    params[key] = s;
  });
  return params;
}

function aggregateCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    const sum =
      (t.user || 0) +
      (t.nice || 0) +
      (t.sys || 0) +
      (t.idle || 0) +
      (t.irq || 0);
    total += sum;
    idle += t.idle || 0;
  }
  return { idle, total, cores: cpus.length };
}

async function sampleHostCpuPercent(sampleMs = 280) {
  const a = aggregateCpuTimes();
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = aggregateCpuTimes();
  const idle = b.idle - a.idle;
  const total = b.total - a.total;
  if (total <= 0) return { percent: 0, cores: b.cores };
  const pct = (1 - idle / total) * 100;
  return {
    percent: Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10,
    cores: b.cores
  };
}

async function diskUsageForPath(targetPath) {
  try {
    let stats = null;
    if (fs.promises.statfs) {
      stats = await fs.promises.statfs(targetPath);
    } else if (typeof fs.statfs === 'function') {
      stats = await new Promise((resolve, reject) => {
        fs.statfs(targetPath, (err, s) => (err ? reject(err) : resolve(s)));
      });
    }
    if (!stats) return null;
    const bsize = Number(stats.bsize) || 4096;
    const blocks = Number(stats.blocks) || 0;
    const bfree = Number(stats.bfree) || 0;
    const totalBytes = blocks * bsize;
    const freeBytes = bfree * bsize;
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      path: targetPath,
      totalBytes: Math.floor(totalBytes),
      freeBytes: Math.floor(freeBytes),
      usedBytes: Math.floor(usedBytes),
      usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10
    };
  } catch (_error) {
    return null;
  }
}

async function collectServerStatsSnapshot() {
  const sampleMs = 260;
  const [cpu, disk] = await Promise.all([
    sampleHostCpuPercent(sampleMs),
    diskUsageForPath(process.cwd())
  ]);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0;
  const pm = process.memoryUsage();
  return {
    at: Date.now(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    uptimeHostSec: Math.floor(os.uptime()),
    uptimeProcessSec: Math.floor(process.uptime()),
    loadavg: os.loadavg(),
    cpu,
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usedPercent: memPercent
    },
    processMemory: {
      rss: pm.rss,
      heapTotal: pm.heapTotal,
      heapUsed: pm.heapUsed,
      external: pm.external
    },
    disk
  };
}

function normalizeWeatherSummary(payload) {
  const data = payload?.data || {};
  const result = Array.isArray(data?.result) ? data.result : [];
  const current = result[0] || null;
  return {
    location: {
      subdistrict: data?.subdistrict || null,
      regency: data?.regency || null,
      province: data?.province || null
    },
    current,
    forecast: result.slice(0, 8)
  };
}

app.get('/api/admin/server-stats', ensureToolApiAccess, async (_req, res) => {
  try {
    const snapshot = await collectServerStatsSnapshot();
    return res.json(snapshot);
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Gagal membaca statistik server.'
    });
  }
});

app.get('/api/public/server-stats', async (_req, res) => {
  try {
    const snapshot = await collectServerStatsSnapshot();
    return res.json(snapshot);
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Gagal membaca statistik server.'
    });
  }
});

app.get('/api/public/whatimg', async (req, res) => {
  try {
    const payload = await callNeoxrApi('whatimg', neoxrQueryFromRequest(req.query));
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: error?.message || 'Gagal mengambil data tebak gambar (whatimg).',
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/blackbox', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ message: 'Parameter q wajib diisi (pertanyaan untuk AI).' });
  }
  try {
    const payload = await callBlackboxCompatibleAi(q);
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal menghubungi Blackbox AI.'),
      upstream: error?.payload || null
    });
  }
});

app.post('/api/public/blackbox', async (req, res) => {
  const q = String(req.body?.q || req.body?.query || '').trim();
  if (!q) {
    return res.status(400).json({ message: 'Body JSON wajib berisi field "q" (teks pertanyaan).' });
  }
  try {
    const payload = await callBlackboxCompatibleAi(q);
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal menghubungi Blackbox AI.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/brat', async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Parameter text wajib diisi.' });
  try {
    const payload = await callNeoxrApi('brat', { text });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: error?.message || 'Gagal membuat brat image.',
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/bratvid', async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Parameter text wajib diisi.' });
  try {
    const payload = await callNeoxrApi('bratvid', { text });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: error?.message || 'Gagal membuat brat video.',
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/emojimix', async (req, res) => {
  const emoji1 = String(req.query.emoji1 || req.query.a || '').trim();
  const emoji2 = String(req.query.emoji2 || req.query.b || '').trim();
  if (!emoji1 || !emoji2) {
    return res.status(400).json({ message: 'Parameter emoji1 dan emoji2 wajib diisi.' });
  }
  try {
    const payload = await callNeoxrApi('emoji', { q: `${emoji1}_${emoji2}` });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal mix emoji.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/iqc', async (req, res) => {
  const text = String(req.query.text || '').trim();
  const time = String(req.query.time || '').trim();
  const chatTime = String(req.query.chat_time || req.query.chatTime || '').trim();
  if (!text) return res.status(400).json({ message: 'Parameter text wajib diisi.' });
  if (!time) return res.status(400).json({ message: 'Parameter time wajib diisi.' });
  if (!chatTime) return res.status(400).json({ message: 'Parameter chat_time wajib diisi.' });
  try {
    const payload = await callNeoxrApi('iqc', { text, time, chat_time: chatTime });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal membuat screenshot iQC.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/cekresi', async (req, res) => {
  const resi = String(req.query.resi || req.query.awb || '').trim();
  const ekspedisi = String(req.query.ekspedisi || req.query.courier || '').trim().toLowerCase();
  if (!resi) return res.status(400).json({ message: 'Parameter resi wajib diisi.' });
  if (!['jnt', 'spx'].includes(ekspedisi)) {
    return res.status(400).json({ message: 'Parameter ekspedisi wajib jnt atau spx.' });
  }
  try {
    const payload = await callNeoxrApi('cekresi', { resi, ekspedisi });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal cek resi.'),
      upstream: error?.payload || null
    });
  }
});

function isAllowedDownloadHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  const exact = new Set([
    'tmpfiles.org',
    'www.tmpfiles.org',
    's.neoxr.eu',
    'cdn.neoxr.my.id',
    'dl.snapcdn.app',
    'tiny-img.com',
    'www.tiny-img.com',
    'ezgif.com',
    'www.ezgif.com',
    's4.ezgif.com',
    's8.ezgif.com',
    'i.ibb.co',
    'i.ibb.co.com',
    'ibb.co',
    'catbox.moe',
    'files.catbox.moe',
    'litter.catbox.moe'
  ]);
  if (exact.has(host)) return true;
  const suffixes = [
    '.neoxr.eu',
    '.neoxr.my.id',
    '.ezgif.com',
    '.ibb.co',
    '.ibb.co.com',
    '.catbox.moe',
    '.tmpfiles.org',
    '.tiktokcdn.com',
    '.tiktokcdn-us.com',
    '.tiktokv.com',
    '.tiktokv.us',
    '.musical.ly',
    '.byteoversea.com',
    '.ibyteimg.com',
    '.snapcdn.app',
    '.cdninstagram.com',
    '.fbcdn.net',
    '.googleusercontent.com'
  ];
  return suffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

app.get('/api/public/download', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  const filename = String(req.query.filename || 'download').trim() || 'download';
  if (!rawUrl) return res.status(400).json({ message: 'Parameter url wajib diisi.' });

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    return res.status(400).json({ message: 'URL tidak valid.' });
  }

//  if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedDownloadHost(parsed.hostname)) {
  //  return res.status(403).json({ message: 'Host download tidak diizinkan.' });
 // }

  try {
    const upstream = await fetch(parsed.toString(), { method: 'GET' });
    if (!upstream.ok) {
      return res.status(502).json({ message: `Gagal ambil file (HTTP ${upstream.status}).` });
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const safeFilename = filename.replace(/["\\\r\n]/g, '_').slice(0, 180) || 'download';
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (upstream.body) {
      try {
        // Stream ke client biar file besar (mp4/mp3) tidak di-buffer full di RAM.
        const nodeStream = Readable.fromWeb(upstream.body);
        await pipeline(nodeStream, res);
        return;
      } catch (_streamError) {
        // fallback ke buffer (untuk compatibility tertentu)
      }
    }

    const ab = await upstream.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Gagal proxy download.' });
  }
});

app.get('/api/public/youtube', async (req, res) => {
  const url = String(req.query.url || '').trim();
  const type = String(req.query.type || '').trim().toLowerCase();
  const quality = String(req.query.quality || '').trim();
  if (!url) return res.status(400).json({ message: 'Parameter url wajib diisi.' });
  if (!['video', 'audio'].includes(type)) {
    return res.status(400).json({ message: 'Parameter type wajib diisi: video | audio.' });
  }
  if (!quality) return res.status(400).json({ message: 'Parameter quality wajib diisi.' });
  try {
    const payload = await callNeoxrApi('youtube', { url, type, quality });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal memproses YouTube downloader.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/ig', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ message: 'Parameter url wajib diisi.' });
  try {
    const payload = await callNeoxrApi('ig', { url });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal memproses Instagram downloader.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/webp2jpg', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ message: 'Parameter url wajib diisi.' });
  try {
    const payload = await callNeoxrApi('webp2jpg', { url });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal convert WEBP ke JPG.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/webp2mp4', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ message: 'Parameter url wajib diisi.' });
  try {
    const payload = await callNeoxrApi('webp2mp4', { url });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal convert WEBP ke MP4.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/version', (_req, res) => {
  return res.json({
    ok: true,
    name: 'Arthur.JS-website',
    build: '2026-08-20-public-tools-seo',
    features: {
      trendsCountryParam: true,
      tiktokRoute: true,
      pastebinRoute: true,
      pastePublicShortLink: true,
      chunkedUpload: true,
      emojimixRoute: true,
      iqcRoute: true,
      cekresiRoute: true,
      robotsSitemap: true
    }
  });
});

app.get('/api/public/trends', async (req, res) => {
  // NeoXR WAJIB menerima key `country` (bukan q/query).
  const country = String(
    req.query.country ||
    req.query.q ||
    req.query.query ||
    'indonesia'
  ).trim() || 'indonesia';
  try {
    // Bangun URL secara eksplisit agar key `country` tidak pernah hilang.
    const endpointUrl = buildNeoxrUrl('trends', { country });
    if (!/[?&]country=/.test(endpointUrl)) {
      return res.status(500).json({ message: 'Internal: parameter country gagal disiapkan.' });
    }
    const payload = await callNeoxrApi('trends', { country });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal mengambil trending.'),
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/tiktok', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ message: 'Parameter url wajib diisi.' });
  try {
    const payload = await callNeoxrApi('tiktok', { url });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: sanitizePublicUpstreamMessage(error, 'Gagal memproses TikTok downloader.'),
      upstream: error?.payload || null
    });
  }
});

const publicTempUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 20 * 1024 * 1024 }
});

app.post('/api/public/upload-temp', (req, res) => {
  publicTempUpload.single('file')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error?.message || 'Upload gagal.' });
    }
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ message: 'File wajib diupload (field: file).' });
    }
    try {
      // Pakai Litterbox (temporary) supaya tidak memenuhi storage sendiri.
      const original = (String(file.originalname || 'upload').trim() || 'upload').replace(/[^\w.\-]+/g, '-');
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), CATBOX_TIMEOUT_MS);
      try {
        const payload = new FormData();
        payload.append('reqtype', 'fileupload');
        payload.append('time', `${String(LITTERBOX_RETENTION_HOURS || 72)}h`);
        payload.append('fileToUpload', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), original);
        const resp = await fetch(LITTERBOX_UPLOAD_ENDPOINT, {
          method: 'POST',
          body: payload,
          signal: timeoutController.signal
        });
        const rawText = String(await resp.text() || '').trim();
        if (!resp.ok || !rawText || !/^https?:\/\//i.test(rawText)) {
          return res.status(502).json({ message: 'Upload sementara gagal. Coba lagi beberapa saat.' });
        }
        return res.json({ status: true, url: rawText, expiresHours: LITTERBOX_RETENTION_HOURS });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (e) {
      const msg = sanitizePublicUpstreamMessage(e, 'Upload sementara gagal. Coba lagi beberapa saat.');
      return res.status(Number(e?.statusCode) || 502).json({ message: msg });
    }
  });
});

app.get('/api/public/cuaca', async (req, res) => {
  const query = String(
    req.query.q ||
    req.query.subdistrict ||
    req.query.query ||
    ''
  ).trim();
  if (!query) {
    return res.status(400).json({ message: 'Parameter q / subdistrict wajib diisi.' });
  }

  try {
    // NeoXR cuaca docs/variasi: beberapa build pakai q, yang aktif saat ini wajib subdistrict.
    // Kirim keduanya agar kompatibel, lalu parse JSON dengan aman.
    let payload;
    try {
      payload = await callNeoxrApi('cuaca', { q: query, subdistrict: query });
    } catch (firstError) {
      try {
        payload = await callNeoxrApi('cuaca', { subdistrict: query });
      } catch (secondError) {
        try {
          payload = await callNeoxrApi('cuaca', { q: query });
        } catch (_thirdError) {
          throw firstError?.payload ? firstError : secondError;
        }
      }
    }

    const normalized = normalizeWeatherSummary(payload);
    const current = normalized?.current || null;
    const rawLower = String(query || '').toLowerCase();
    const suggestionsByCity = [
      {
        keys: ['surabaya', 'sby'],
        values: ['Sukolilo', 'Rungkut', 'Wonokromo', 'Tegalsari', 'Genteng', 'Gubeng']
      },
      {
        keys: ['jakarta', 'jkt'],
        values: ['Menteng', 'Tanah Abang', 'Kebayoran Baru', 'Cempaka Putih', 'Tebet', 'Kemayoran']
      },
      {
        keys: ['bandung'],
        values: ['Coblong', 'Sukajadi', 'Cicendo', 'Lengkong', 'Kiaracondong', 'Antapani']
      }
    ];
    const suggestionHit = suggestionsByCity.find((x) => x.keys.some((k) => rawLower.includes(k)));
    const suggestions = suggestionHit ? suggestionHit.values : [];

    if (!current) {
      return res.status(404).json({
        status: false,
        message: 'Lokasi tidak ditemukan. Coba ketik nama kecamatan (bukan nama kota).',
        suggestions,
        normalized
      });
    }

    return res.json({
      status: true,
      normalized,
      suggestions
    });
  } catch (error) {
    const upstreamMsg = String(error?.payload?.msg || error?.message || '').toLowerCase();
    let message = sanitizePublicUpstreamMessage(error, 'Gagal mengambil data cuaca.');
    if (upstreamMsg.includes('something went wrong') || upstreamMsg.includes('html, bukan json')) {
      message = 'Layanan cuaca upstream sedang bermasalah. Coba lagi beberapa saat, atau coba nama kecamatan lain.';
    }
    return res.status(Number(error?.statusCode) || 502).json({
      status: false,
      message,
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/tempmail-read', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Parameter email tidak valid.' });
  }

  try {
    const payload = await callNeoxrApi('tempmail-read', { email });
    return res.json(payload);
  } catch (error) {
    return res.status(Number(error?.statusCode) || 502).json({
      message: error?.message || 'Gagal membaca inbox tempmail.',
      upstream: error?.payload || null
    });
  }
});

app.get('/api/public/upscale', (_req, res) => {
  return res.status(405).json({
    message: 'Gunakan POST /api/public/upscale dengan upload file image (form-data).'
  });
});

app.post('/api/public/upscale', (req, res) => {
  publicImageUpload.single('image')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({
        message: error?.message || 'Upload gambar gagal.',
        hint: `Maks ukuran upload ${Math.round(PUBLIC_IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024)}MB.`
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'File image wajib diupload (field: image).' });
    }

    try {
      const uploaded = await uploadImageBufferToImgbb(req.file.buffer, req.file.originalname);
      if (!isAllowedIbbImageUrl(uploaded.url)) {
        return res.status(502).json({
          message: 'Upload ke i.bb gagal diverifikasi, URL bukan domain i.ibb.',
          uploadedImage: uploaded
        });
      }
      const payload = await callNeoxrApi('upscale', { image: uploaded.url });
      return res.json({
        ...payload,
        uploadedImage: {
          url: uploaded.url,
          deleteUrl: uploaded.deleteUrl
        }
      });
    } catch (requestError) {
      return res.status(Number(requestError?.statusCode) || 502).json({
        message: requestError?.message || 'Gagal memproses upscale.',
        upstream: requestError?.payload || null
      });
    }
  });
});

app.get('/api/public/remini', (_req, res) => {
  return res.status(405).json({
    message: 'Gunakan POST /api/public/remini dengan upload file image (form-data).'
  });
});

app.post('/api/public/remini', (req, res) => {
  publicImageUpload.single('image')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({
        message: error?.message || 'Upload gambar gagal.',
        hint: `Maks ukuran upload ${Math.round(PUBLIC_IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024)}MB.`
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'File image wajib diupload (field: image).' });
    }

    try {
      const uploaded = await uploadImageBufferToImgbb(req.file.buffer, req.file.originalname);
      const payload = await callNeoxrApi('remini', { image: uploaded.url });
      return res.json({
        ...payload,
        uploadedImage: {
          url: uploaded.url,
          deleteUrl: uploaded.deleteUrl
        }
      });
    } catch (requestError) {
      return res.status(Number(requestError?.statusCode) || 502).json({
        message: requestError?.message || 'Gagal memproses remini.',
        upstream: requestError?.payload || null
      });
    }
  });
});

function collectImageLinks(payload, bucket, depth = 0) {
  if (depth > 8 || payload == null) return;
  if (typeof payload === 'string') {
    if (/^https?:\/\/\S+/i.test(payload) && /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(payload)) {
      bucket.push(payload);
    }
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectImageLinks(item, bucket, depth + 1));
    return;
  }
  if (typeof payload === 'object') {
    Object.values(payload).forEach((value) => collectImageLinks(value, bucket, depth + 1));
  }
}

app.get('/api/pdf-to-jpg-upload/:token', (req, res) => {
  cleanupExpiredPdfUploads();
  const token = String(req.params.token || '').trim();
  const entry = pdfTempUploads.get(token);
  if (!entry) {
    return res.status(404).json({ message: 'File PDF temporary tidak ditemukan atau sudah expired.' });
  }
  if (!entry.filePath || !fs.existsSync(entry.filePath)) {
    pdfTempUploads.delete(token);
    return res.status(404).json({ message: 'File PDF temporary sudah tidak tersedia.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.sendFile(entry.filePath);
});

function delayPdfConverter(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function convertPdfByUrlWithRetries(url, filename, to, options = {}) {
  const maxAttempts = Math.min(
    5,
    // Minimal 2 attempt supaya timeout provider punya kesempatan retry,
    // terutama untuk environment VPS yang kadang diset 1 via env.
    Math.max(2, Number(options?.maxAttempts ?? process.env.PDF_CONVERTER_RETRY_ATTEMPTS) || 3)
  );
  const retryDelayMs = Math.min(
    10000,
    Math.max(800, Number(options?.retryDelayMs ?? process.env.PDF_CONVERTER_RETRY_DELAY_MS) || 2200)
  );
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1 && typeof options?.onRetry === 'function') {
        options.onRetry({ attempt, maxAttempts, delayMs: retryDelayMs });
      }
      return await convertPdfByUrl(url, filename, to, options);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      await delayPdfConverter(retryDelayMs);
    }
  }
  throw lastError;
}

async function convertPdfByUrl(url, filename, to, options = {}) {
  if (!PDF_CONVERTER_API_KEY) {
    throw new Error('API key converter belum diatur di server.');
  }
  const requestedTimeoutMs = Number(options?.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeoutMs) &&
    requestedTimeoutMs >= 2000 &&
    requestedTimeoutMs <= 600000
    ? requestedTimeoutMs
    : PDF_CONVERTER_TIMEOUT_MS;
  const query = new URLSearchParams({
    url,
    filename,
    to,
    apikey: PDF_CONVERTER_API_KEY
  });
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${PDF_CONVERTER_ENDPOINT}?${query.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain;q=0.9,*/*;q=0.8' },
      signal: timeoutController.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Timeout ${Math.round(timeoutMs / 1000)} detik dari provider converter.`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    const networkError = new Error(`Gagal menghubungi provider converter: ${error.message}`);
    networkError.statusCode = 502;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
  const rawText = await upstreamResponse.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (_error) {
    payload = { raw: rawText };
  }
  if (!upstreamResponse.ok) {
    const upstreamMessage = payload?.message || payload?.msg || `Provider error (${upstreamResponse.status})`;
    const error = new Error(upstreamMessage);
    error.statusCode = 502;
    error.payload = payload;
    throw error;
  }
  if (payload && typeof payload === 'object' && payload.status === false) {
    const providerError = new Error(payload?.message || payload?.msg || 'Provider converter gagal memproses file.');
    providerError.statusCode = 502;
    providerError.payload = payload;
    throw providerError;
  }
  return payload;
}

function isUnsupportedCdnError(error) {
  const text = String(
    error?.message ||
    error?.payload?.msg ||
    error?.payload?.message ||
    ''
  ).toLowerCase();
  return text.includes('unsupported cdn provider');
}

function isGithubRawFallbackConfigured() {
  return Boolean(PDF_CONVERTER_GITHUB_REPO && PDF_CONVERTER_GITHUB_TOKEN);
}

function normalizeGitHubPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
}

function encodeGitHubPath(filePath) {
  return normalizeGitHubPath(filePath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildGitHubRawUrl(repo, branch, filePath) {
  const safeRepo = String(repo || '').trim();
  const safeBranch = encodeURIComponent(String(branch || 'main').trim() || 'main');
  const safePath = encodeGitHubPath(filePath);
  return `https://raw.githubusercontent.com/${safeRepo}/${safeBranch}/${safePath}`;
}

async function uploadPdfToGitHubRaw(localFilePath, originalName, token) {
  if (!isGithubRawFallbackConfigured()) {
    throw new Error('Fallback GitHub belum dikonfigurasi.');
  }
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    throw new Error('File PDF temporary tidak ditemukan untuk fallback GitHub.');
  }

  const nowStamp = Date.now();
  const randomPart = crypto.randomBytes(5).toString('hex');
  const ext = path.extname(originalName || '').toLowerCase() || '.pdf';
  const baseName = (path.parse(originalName || 'converted').name || 'converted')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'converted';
  const relativePath = normalizeGitHubPath(
    `${PDF_CONVERTER_GITHUB_BASE_PATH}/${nowStamp}-${randomPart}-${baseName}${ext}`
  );

  const contentBase64 = fs.readFileSync(localFilePath).toString('base64');
  const encodedPath = encodeGitHubPath(relativePath);
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(PDF_CONVERTER_GITHUB_REPO)}/contents/${encodedPath}`;
  const payload = {
    message: `chore(pdf-to-jpg): temp upload ${nowStamp}`,
    content: contentBase64,
    branch: PDF_CONVERTER_GITHUB_BRANCH
  };

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'arthur-bot-pdf-to-jpg-fallback'
    },
    body: JSON.stringify(payload)
  });
  const rawText = await response.text();
  let parsed = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch (_error) {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    const apiMessage = parsed?.message || `GitHub upload gagal (${response.status})`;
    const uploadError = new Error(apiMessage);
    uploadError.statusCode = 502;
    uploadError.payload = parsed;
    throw uploadError;
  }

  const githubUrl = buildGitHubRawUrl(
    PDF_CONVERTER_GITHUB_REPO,
    PDF_CONVERTER_GITHUB_BRANCH,
    relativePath
  );
  return {
    url: githubUrl,
    path: relativePath,
    sha: parsed?.content?.sha || null
  };
}

async function deletePdfFromGitHubRaw(filePath, sha, token) {
  if (!isGithubRawFallbackConfigured()) return;
  const safeSha = String(sha || '').trim();
  const normalizedPath = normalizeGitHubPath(filePath);
  if (!safeSha || !normalizedPath) return;
  const encodedPath = encodeGitHubPath(normalizedPath);
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(PDF_CONVERTER_GITHUB_REPO)}/contents/${encodedPath}`;
  const payload = {
    message: `chore(pdf-to-jpg): cleanup temp upload ${Date.now()}`,
    sha: safeSha,
    branch: PDF_CONVERTER_GITHUB_BRANCH
  };
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'arthur-bot-pdf-to-jpg-fallback'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const rawText = await response.text();
    let parsed = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (_error) {
      parsed = { raw: rawText };
    }
    const cleanupError = new Error(parsed?.message || `GitHub cleanup gagal (${response.status})`);
    cleanupError.statusCode = 502;
    cleanupError.payload = parsed;
    throw cleanupError;
  }
}

async function cleanupGitHubFallbackUpload(githubFallback, pushTrace) {
  if (!githubFallback?.path || !githubFallback?.sha || !PDF_CONVERTER_GITHUB_TOKEN) return;
  try {
    await deletePdfFromGitHubRaw(githubFallback.path, githubFallback.sha, PDF_CONVERTER_GITHUB_TOKEN);
    if (typeof pushTrace === 'function') {
      pushTrace('github-fallback-cleanup-success', { path: githubFallback.path });
    }
  } catch (cleanupError) {
    if (typeof pushTrace === 'function') {
      pushTrace('github-fallback-cleanup-failed', {
        path: githubFallback.path,
        message: cleanupError?.message || 'Cleanup upload GitHub gagal.',
        statusCode: Number(cleanupError?.statusCode) || null
      });
    }
  }
}

app.post('/api/pdf-to-jpg', ensureToolApiAccess, (req, res) => {
  pdfToJpgUpload.single('pdf')(req, res, async (error) => {
    cleanupExpiredPdfUploads();

    if (error) {
      return res.status(400).json({ message: 'Upload PDF gagal. Pastikan file valid.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'File PDF wajib diupload.' });
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const looksLikePdf = ext === '.pdf' || mime.includes('pdf');
    if (!looksLikePdf) {
      try {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (_error) {
        // ignore cleanup error
      }
      return res.status(400).json({ message: 'File harus berformat PDF.' });
    }

    const toInput = String(req.body?.to || 'jpg').trim().toLowerCase();
    const allowedTargets = new Set(['jpg', 'jpeg', 'png']);
    const to = allowedTargets.has(toInput) ? toInput : 'jpg';
    const filenameRaw = String(req.body?.filename || '').trim();
    const baseNameFromFile = path.parse(file.originalname || 'converted').name || 'converted';
    const safeFilename = (filenameRaw || baseNameFromFile || 'converted')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'converted';
    const requestId = crypto.randomBytes(4).toString('hex');
    const debugTraces = [];
    const pushTrace = (step, details = {}) => {
      const entry = { at: Date.now(), step, ...details };
      debugTraces.push(entry);
      try {
        console.log(`[pdf-to-jpg:${requestId}] ${step} ${JSON.stringify(details)}`);
      } catch (_error) {
        console.log(`[pdf-to-jpg:${requestId}] ${step}`);
      }
    };
    const catboxDebug = {
      uploaded: false,
      url: null,
      error: null
    };
    pushTrace('request-received', {
      fileName: file.originalname,
      sizeBytes: file.size || 0,
      mime: file.mimetype || 'application/pdf',
      targetFormat: to
    });

    const token = crypto.randomBytes(18).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + PDF_TEMP_TTL_MS;
    pdfTempUploads.set(token, {
      token,
      filePath: file.path,
      originalName: file.originalname,
      sizeBytes: file.size || 0,
      createdAt,
      expiresAt
    });

    const tempPdfUrl = buildPdfTempPublicUrl(req, token);

    try {
      let payload = null;
      let converterSourceUrl = '';
      let converterSourceType = '';
      let githubFallback = null;

      try {
        pushTrace('catbox-upload-start', { endpoint: CATBOX_UPLOAD_ENDPOINT });
        const catboxUpload = await uploadPdfToCatbox(file.path, file.originalname, file.mimetype);
        catboxDebug.uploaded = true;
        catboxDebug.url = catboxUpload.url;
        pushTrace('catbox-upload-success', { url: catboxUpload.url, provider: catboxUpload.provider });
        converterSourceUrl = catboxUpload.url;
        converterSourceType = catboxUpload.provider || 'catbox';
        pushTrace('converter-request-start', { sourceType: converterSourceType });
        payload = await convertPdfByUrlWithRetries(converterSourceUrl, safeFilename, to, {
          onRetry: ({ attempt, maxAttempts }) => {
            pushTrace('converter-retry', { attempt, maxAttempts, url: converterSourceUrl });
          }
        });
        pushTrace('converter-request-success', { sourceType: converterSourceType });
      } catch (primaryError) {
        if (!catboxDebug.uploaded) {
          catboxDebug.error = {
            message: primaryError?.message || 'Upload ke Catbox/Litterbox gagal.',
            statusCode: Number(primaryError?.statusCode) || null,
            upstream: primaryError?.payload || null
          };
          pushTrace('catbox-upload-failed', {
            message: catboxDebug.error.message,
            statusCode: catboxDebug.error.statusCode
          });
          if (isGithubRawFallbackConfigured()) {
            try {
              pushTrace('github-fallback-start', { reason: 'source-upload-failed' });
              githubFallback = await uploadPdfToGitHubRaw(file.path, file.originalname, PDF_CONVERTER_GITHUB_TOKEN);
              pushTrace('github-fallback-upload-success', { url: githubFallback.url, path: githubFallback.path });
              converterSourceUrl = githubFallback.url;
              converterSourceType = 'github-raw';
              payload = await convertPdfByUrlWithRetries(converterSourceUrl, safeFilename, to);
              pushTrace('github-fallback-convert-success', {});
            } catch (githubSourceError) {
              pushTrace('github-fallback-failed', {
                message: githubSourceError?.message || 'Fallback GitHub gagal.',
                statusCode: Number(githubSourceError?.statusCode) || null
              });
              throw githubSourceError;
            }
          } else {
            throw primaryError;
          }
        } else {
          pushTrace('converter-request-failed', {
            sourceType: converterSourceType || 'catbox',
            message: primaryError?.message || 'Request ke converter gagal.',
            statusCode: Number(primaryError?.statusCode) || null
          });
          if (isGithubRawFallbackConfigured()) {
            try {
              pushTrace('github-fallback-start', {
                reason: 'converter-failed-after-cdn-upload',
                priorSource: converterSourceType,
                priorUrl: converterSourceUrl
              });
              githubFallback = await uploadPdfToGitHubRaw(
                file.path,
                file.originalname,
                PDF_CONVERTER_GITHUB_TOKEN
              );
              pushTrace('github-fallback-upload-success', {
                url: githubFallback.url,
                path: githubFallback.path
              });
              converterSourceUrl = githubFallback.url;
              converterSourceType = 'github-raw';
              payload = await convertPdfByUrlWithRetries(githubFallback.url, safeFilename, to, {
                onRetry: ({ attempt, maxAttempts }) => {
                  pushTrace('converter-retry-github-fallback', { attempt, maxAttempts });
                }
              });
              pushTrace('github-fallback-convert-success', { afterConverterFail: true });
            } catch (githubAfterFail) {
              pushTrace('github-fallback-after-converter-fail-failed', {
                message: githubAfterFail?.message || 'Fallback GitHub gagal.',
                statusCode: Number(githubAfterFail?.statusCode) || null
              });
              throw primaryError;
            }
          } else {
            throw primaryError;
          }
        }
      }

      if (payload && typeof payload === 'object' && payload.status === false && isUnsupportedCdnError(payload)) {
        // defensive path if provider responds status:false without throwing
        const providerError = new Error(payload?.msg || payload?.message || 'Unsupported CDN provider.');
        providerError.statusCode = 502;
        providerError.payload = payload;
        throw providerError;
      }

      const imageLinks = [];
      collectImageLinks(payload, imageLinks);
      const uniqueImageLinks = [...new Set(imageLinks)];
      const archiveUrl = payload?.data?.url && /^https?:\/\//i.test(payload.data.url)
        ? payload.data.url
        : '';
      await cleanupGitHubFallbackUpload(githubFallback, pushTrace);

      return res.json({
        message: uniqueImageLinks.length > 0
          ? `Konversi PDF ke ${to.toUpperCase()} berhasil.`
          : 'Konversi diproses. Cek detail respons provider.',
        images: uniqueImageLinks,
        archiveUrl,
        uploadedPdf: {
          token,
          tempUrl: tempPdfUrl,
          originalName: file.originalname,
          sizeBytes: file.size || 0,
          expiresAt
        },
        converterSource: {
          url: converterSourceUrl,
          type: converterSourceType,
          fallback: Boolean(githubFallback),
          githubPath: githubFallback?.path || null
        },
        catbox: catboxDebug,
        debug: {
          requestId,
          traces: debugTraces
        },
        upstream: payload
      });
    } catch (err) {
      pushTrace('request-error', {
        message: err?.message || 'Unknown error',
        statusCode: Number(err?.statusCode) || null
      });
      if (isUnsupportedCdnError(err)) {
        if (!isGithubRawFallbackConfigured()) {
          return res.status(502).json({
            message: err.message || 'Provider converter menolak URL CDN.',
            hint: 'Set env PDF_CONVERTER_GITHUB_REPO + PDF_CONVERTER_GITHUB_TOKEN agar server bisa fallback upload ke raw GitHub.',
            uploadedPdf: {
              token,
              tempUrl: tempPdfUrl,
              originalName: file.originalname,
              sizeBytes: file.size || 0,
              expiresAt
            },
            catbox: catboxDebug,
            debug: {
              requestId,
              traces: debugTraces
            },
            upstream: err?.payload || null
          });
        }

        try {
          pushTrace('github-fallback-start', {});
          const githubFallback = await uploadPdfToGitHubRaw(file.path, file.originalname, PDF_CONVERTER_GITHUB_TOKEN);
          pushTrace('github-fallback-upload-success', { url: githubFallback.url, path: githubFallback.path });
          const retriedPayload = await convertPdfByUrlWithRetries(githubFallback.url, safeFilename, to);
          pushTrace('github-fallback-convert-success', {});
          const imageLinks = [];
          collectImageLinks(retriedPayload, imageLinks);
          const uniqueImageLinks = [...new Set(imageLinks)];
          const archiveUrl = retriedPayload?.data?.url && /^https?:\/\//i.test(retriedPayload.data.url)
            ? retriedPayload.data.url
            : '';
          await cleanupGitHubFallbackUpload(githubFallback, pushTrace);

          return res.json({
            message: uniqueImageLinks.length > 0
              ? `Konversi PDF ke ${to.toUpperCase()} berhasil (fallback GitHub raw).`
              : 'Konversi diproses via fallback GitHub raw. Cek detail respons provider.',
            images: uniqueImageLinks,
            archiveUrl,
            uploadedPdf: {
              token,
              tempUrl: tempPdfUrl,
              originalName: file.originalname,
              sizeBytes: file.size || 0,
              expiresAt
            },
            converterSource: {
              url: githubFallback.url,
              type: 'github-raw',
              fallback: true,
              githubPath: githubFallback.path
            },
            catbox: catboxDebug,
            debug: {
              requestId,
              traces: debugTraces
            },
            upstream: retriedPayload
          });
        } catch (retryError) {
          pushTrace('github-fallback-failed', {
            message: retryError?.message || 'Fallback GitHub gagal.',
            statusCode: Number(retryError?.statusCode) || null
          });
          const retryStatus = Number(retryError?.statusCode) || 502;
          return res.status(retryStatus).json({
            message: retryError.message || 'Fallback GitHub raw gagal.',
            hint: 'Pastikan repo GitHub publik, token valid, branch/path benar, lalu coba lagi.',
            uploadedPdf: {
              token,
              tempUrl: tempPdfUrl,
              originalName: file.originalname,
              sizeBytes: file.size || 0,
              expiresAt
            },
            catbox: catboxDebug,
            debug: {
              requestId,
              traces: debugTraces
            },
            upstream: retryError?.payload || err?.payload || null
          });
        }
      }

      const statusCode = Number(err?.statusCode) || 502;
      const hint = statusCode === 504
        ? 'Upload Catbox/Litterbox atau provider converter timeout. Coba lagi dengan file lebih kecil atau ulang beberapa saat lagi.'
        : statusCode === 502
          ? 'Upload source Catbox/Litterbox gagal atau provider converter sedang bermasalah.'
          : undefined;
      return res.status(statusCode).json({
        message: err.message || 'Gagal menghubungi provider converter.',
        ...(hint ? { hint } : {}),
        uploadedPdf: {
          token,
          tempUrl: tempPdfUrl,
          originalName: file.originalname,
          sizeBytes: file.size || 0,
          expiresAt
        },
        catbox: catboxDebug,
        debug: {
          requestId,
          traces: debugTraces
        },
        upstream: err?.payload || null
      });
    }
  });
});

function sanitizeAlias(alias) {
  return alias.trim().toLowerCase();
}

function generateCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(6))
    .map((byte) => chars[byte % chars.length])
    .join('')
    .slice(0, 7);
}

function buildShortUrl(req, code) {
  return `${req.protocol}://${req.get('host')}/s/${code}`;
}

function getLinkStatus(link) {
  const now = Date.now();
  if (typeof link.expiresAt === 'number' && now > link.expiresAt) {
    return 'expired';
  }

  if (typeof link.maxClicks === 'number' && link.clickCount >= link.maxClicks) {
    return 'limit-reached';
  }

  return 'active';
}

function serializeLink(req, link) {
  const status = getLinkStatus(link);
  return {
    code: link.code,
    originalUrl: link.originalUrl,
    shortUrl: buildShortUrl(req, link.code),
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    clickCount: link.clickCount,
    maxClicks: link.maxClicks,
    lastClickedAt: link.lastClickedAt,
    status,
    remainingClicks: typeof link.maxClicks === 'number' ? Math.max(0, link.maxClicks - link.clickCount) : null,
    clickHistory: link.clickHistory
  };
}

function renderShortLinkErrorPage(title, message) {
  return `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            background: radial-gradient(circle at top, #1d4ed8, #0f172a 70%);
            color: #e2e8f0;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 24px;
          }
          .card {
            max-width: 540px;
            width: 100%;
            background: rgba(15, 23, 42, 0.82);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 14px;
            padding: 28px;
            text-align: center;
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.32);
          }
          .card h1 {
            margin: 0 0 8px;
            color: #93c5fd;
          }
          .card p {
            margin: 0;
            line-height: 1.6;
            color: #cbd5e1;
          }
          .card a {
            color: #60a5fa;
          }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>${title}</h1>
          <p>${message}</p>
          <p style="margin-top: 12px;">
            Buat link baru di <a href="/short-link">/short-link</a>.
          </p>
        </main>
      </body>
    </html>
  `;
}

app.post('/api/short-links', (req, res) => {
  const { originalUrl, customAlias, expiresInDays, maxClicks } = req.body;
  const trimmedUrl = String(originalUrl || '').trim();

  if (!trimmedUrl || !isValidHttpUrl(trimmedUrl)) {
    return res.status(400).json({ message: 'URL tujuan tidak valid. Gunakan http:// atau https://.' });
  }

  let expiresAt = null;
  if (expiresInDays !== undefined && String(expiresInDays).trim() !== '') {
    const days = Number(expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return res.status(400).json({ message: 'Durasi link harus di antara 1 sampai 3650 hari.' });
    }
    expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
  }

  let maxClicksValue = null;
  if (maxClicks !== undefined && String(maxClicks).trim() !== '') {
    const parsedMaxClicks = Number(maxClicks);
    if (!Number.isInteger(parsedMaxClicks) || parsedMaxClicks <= 0 || parsedMaxClicks > 1000000) {
      return res.status(400).json({ message: 'Batas klik harus angka bulat di antara 1 sampai 1000000.' });
    }
    maxClicksValue = parsedMaxClicks;
  }

  const aliasSource = String(customAlias || '').trim();
  let code = '';
  if (aliasSource) {
    if (!/^[a-zA-Z0-9_-]{4,20}$/.test(aliasSource)) {
      return res.status(400).json({ message: 'Alias hanya boleh huruf/angka, underscore, dash (4-20 karakter).' });
    }
    code = sanitizeAlias(aliasSource);
    if (shortLinks.has(code)) {
      return res.status(409).json({ message: 'Alias sudah dipakai, gunakan alias lain.' });
    }
  } else {
    for (let i = 0; i < 20; i += 1) {
      const candidate = generateCode();
      if (!shortLinks.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return res.status(500).json({ message: 'Gagal membuat kode unik. Coba lagi beberapa saat.' });
    }
  }

  const linkData = {
    code,
    originalUrl: trimmedUrl,
    createdAt: Date.now(),
    expiresAt,
    clickCount: 0,
    maxClicks: maxClicksValue,
    lastClickedAt: null,
    clickHistory: []
  };

  shortLinks.set(code, linkData);
  return res.status(201).json({
    message: 'Shortlink berhasil dibuat.',
    link: serializeLink(req, linkData)
  });
});

app.get('/api/short-links', (req, res) => {
  const links = Array.from(shortLinks.values())
    .sort((a, b) => b.createdAt - a.createdAt);

  const summary = links.reduce((acc, link) => {
    const status = getLinkStatus(link);
    acc.totalClicks += link.clickCount;
    if (status === 'active') acc.activeLinks += 1;
    if (status === 'expired') acc.expiredLinks += 1;
    if (status === 'limit-reached') acc.limitReachedLinks += 1;
    return acc;
  }, {
    totalLinks: links.length,
    totalClicks: 0,
    activeLinks: 0,
    expiredLinks: 0,
    limitReachedLinks: 0
  });

  return res.json({
    summary,
    links: links.map((link) => serializeLink(req, link))
  });
});

app.get('/api/short-links/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  const link = shortLinks.get(code);

  if (!link) {
    return res.status(404).json({ message: 'Shortlink tidak ditemukan.' });
  }

  return res.json({
    link: serializeLink(req, link)
  });
});

app.delete('/api/short-links/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  if (!shortLinks.has(code)) {
    return res.status(404).json({ message: 'Shortlink tidak ditemukan.' });
  }

  shortLinks.delete(code);
  return res.json({ message: 'Shortlink berhasil dihapus.' });
});

app.get('/s/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  const link = shortLinks.get(code);

  if (!link) {
    return res.status(404).send(renderShortLinkErrorPage(
      'Shortlink Tidak Ditemukan',
      'Link pendek yang kamu buka tidak tersedia atau sudah dihapus.'
    ));
  }

  const status = getLinkStatus(link);
  if (status === 'expired') {
    return res.status(410).send(renderShortLinkErrorPage(
      'Shortlink Sudah Kedaluwarsa',
      'Masa aktif shortlink ini sudah habis. Silakan minta pembuat link membuat tautan baru.'
    ));
  }

  if (status === 'limit-reached') {
    return res.status(410).send(renderShortLinkErrorPage(
      'Batas Klik Tercapai',
      'Shortlink ini sudah mencapai batas klik maksimal.'
    ));
  }

  link.clickCount += 1;
  link.lastClickedAt = Date.now();
  link.clickHistory.unshift({
    at: link.lastClickedAt,
    ip: req.ip,
    userAgent: req.get('user-agent') || 'Unknown',
    referer: req.get('referer') || 'Direct'
  });

  if (link.clickHistory.length > MAX_HISTORY_PER_LINK) {
    link.clickHistory = link.clickHistory.slice(0, MAX_HISTORY_PER_LINK);
  }

  return res.redirect(link.originalUrl);
});

// Email transport - gunakan environment variables
let transport = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'gag260608@gmail.com',
        pass: process.env.EMAIL_PASS || 'dqjvwlvpnjukaraj'
    }
});

function generateCaptchaText() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

app.get('/captcha', (req, res) => {
  const captchaText = generateCaptchaText();
  req.session.captcha = captchaText;
  res.type('svg');
  res.send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
      <rect width="100%" height="100%" fill="#0e1e40"/>
      <text x="10" y="25" font-size="20" fill="#93c5fd" font-family="monospace">${captchaText}</text>
    </svg>
  `);
});

app.post('/contact', (req, res) => {
  const { name, email, message, captcha } = req.body;
  const valid = captcha && captcha.toUpperCase() === req.session.captcha;

  if (!valid) {
    return res.status(400).send('Captcha salah. Silakan ulangi.');
  }

  const mailOptions = {
    from: {
      name: 'Pesan Untuk Arthur Dari ArthurGPT',
      address: process.env.EMAIL_USER || 'gag260608@gmail.com'
    },
    to: process.env.EMAIL_TO || 'gag260608@gmail.com',
    subject: `Pesan Arthur.JS > ${name}`,
    html: `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #333;
              background-color: #f4f4f9;
              padding: 20px;
            }
            .container {
              background-color: #fff;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            h1 {
              color: #4CAF50;
            }
            .message {
              background-color: #e7f9e7;
              padding: 10px;
              border-radius: 4px;
            }
            .footer {
              font-size: 0.9em;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Pesan Baru Dari Arthur.JS</h1>
            <p><strong>Nama:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <div class="message">
              <p><strong>Pesan:</strong></p>
              <p>${message}</p>
            </div>
            <div class="footer">
              <p>Pesan ini dikirim dari Arthur.JS</p>
            </div>
          </div>
        </body>
      </html>
    `
  };

  transport.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(500).send('Gagal mengirim email: ' + error.message);
    }
    res.status(200).send('Pesan berhasil dikirim. Terima kasih, kami akan segera merespons.');
  });
});

// ✅ BAGIAN INI YANG DITAMBAHKAN - Untuk development lokal
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('✅ SERVER BERHASIL BERJALAN!');
    console.log('='.repeat(50));
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📂 Views folder: ${path.join(__dirname, '../views')}`);
    console.log(`📧 Email: ${process.env.EMAIL_USER || 'gag260608@gmail.com'}`);
    console.log('='.repeat(50));
    console.log('📍 Available routes:');
    console.log(`   - GET  /              → thur.html`);
    console.log(`   - GET  /sertifikat    → sertifikat.html`);
    console.log(`   - GET  /pkl           → pkl.html`);
    console.log(`   - GET  /portofolio    → portofolio.html`);
    console.log(`   - GET  /short-link    → short-link.html`);
    console.log(`   - GET  /file-vault    → file-vault.html`);
    console.log(`   - GET  /ip-calculator → ip-calculator.html`);
    console.log(`   - GET  /captcha       → Generate captcha`);
    console.log(`   - GET  /s/:code       → Redirect shortlink`);
    console.log(`   - GET  /p/:slug       → Public pastebin`);
    console.log(`   - GET  /u/:id         → File public landing`);
    console.log(`   - GET  /api/short-links      → List shortlink`);
    console.log(`   - GET  /public/emojimix   → Emoji mix`);
    console.log(`   - GET  /public/iqc        → iPhone WA screenshot`);
    console.log(`   - GET  /public/cekresi    → Cek resi J&T / SPX`);
    console.log(`   - GET  /robots.txt        → Robots`);
    console.log(`   - GET  /sitemap.xml       → Sitemap`);
    console.log(`   - POST /api/short-links      → Create shortlink`);
    console.log(`   - GET  /api/short-links/:code  → Shortlink detail`);
    console.log(`   - DELETE /api/short-links/:code → Delete shortlink`);
    console.log(`   - GET  /api/uploads           → List upload`);
    console.log(`   - POST /api/uploads           → Upload files/folder`);
    console.log(`   - DELETE /api/uploads/:id     → Delete uploaded file`);
    console.log(`   - GET  /api/uploads/:id/download → Download file`);
    console.log(`   - POST /contact       → Send email`);
    console.log('='.repeat(50));
    console.log('Press Ctrl+C to stop server');
  });
  server.timeout = 30 * 60 * 1000;
  server.headersTimeout = 31 * 60 * 1000;
  server.requestTimeout = 30 * 60 * 1000;
  server.keepAliveTimeout = 75 * 1000;
}

// Export untuk Vercel (serverless)
module.exports = app;
