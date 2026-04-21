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

const app = express();
const PORT = process.env.PORT || 3000;
const shortLinks = new Map();
const fileVaultEntries = new Map();
const fileVaultFolders = new Map();
const pdfTempUploads = new Map();
const MAX_HISTORY_PER_LINK = 20;
const PDF_TEMP_TTL_MS = 24 * 60 * 60 * 1000;
const PDF_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const UPLOAD_STORAGE_DIR = process.env.UPLOAD_STORAGE_DIR || path.join(os.tmpdir(), 'Arthur.JS-file-vault');
const PDF_TMP_UPLOAD_DIR = process.env.PDF_TMP_UPLOAD_DIR || path.join(os.tmpdir(), 'Arthur.JS-pdf-to-jpg-temp');
const configuredStorageMb = Number(process.env.STORAGE_CAPACITY_MB || 0);
const configuredMaxUploadMb = Number(process.env.MAX_UPLOAD_FILE_SIZE_MB || 0);
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

app.enable("trust proxy");
app.set("json spaces", 2);
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Static files - sesuaikan path untuk Vercel
app.use('/views', express.static(path.join(__dirname, '../views')));
app.use(express.static(path.join(__dirname, '../views')));

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
      if (attempt.provider === 'litterbox') payload.append('time', String(attempt.retentionHours || 72));
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

    const converterStart = Date.now();
    let sourceType = '';
    let sourceUrl = '';
    if (report.catbox.ok && report.catbox.url) {
      sourceType = 'catbox';
      sourceUrl = report.catbox.url;
    } else {
      token = crypto.randomBytes(18).toString('hex');
      const createdAt = Date.now();
      const expiresAt = createdAt + PDF_TEMP_TTL_MS;
      pdfTempUploads.set(token, {
        token,
        filePath: samplePath,
        originalName: sampleName,
        sizeBytes: sampleBytes.length,
        createdAt,
        expiresAt
      });
      sourceType = 'server-temp-url';
      sourceUrl = buildPdfTempPublicUrl(req, token);
      if (!sourceUrl) {
        throw new Error('Quick test gagal: URL public temporary tidak dapat dibuat.');
      }
    }

    report.converter.sourceType = sourceType;
    try {
      const payload = await convertPdfByUrl(sourceUrl, 'quick-test', 'jpg', {
        timeoutMs: PDF_CONVERTER_HEALTHCHECK_TIMEOUT_MS
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
    path: relativePath
  };
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
    const tempPdfUrlUsable = Boolean(
      tempPdfUrl &&
      !/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?/i.test(tempPdfUrl)
    );

    try {
      let payload = null;
      let converterSourceUrl = '';
      let converterSourceType = '';
      let usedFallbackSource = false;
      let githubFallback = null;

      try {
        pushTrace('catbox-upload-start', { endpoint: CATBOX_UPLOAD_ENDPOINT });
        const catboxUpload = await uploadPdfToCatbox(file.path, file.originalname, file.mimetype);
        catboxDebug.uploaded = true;
        catboxDebug.url = catboxUpload.url;
        pushTrace('catbox-upload-success', { url: catboxUpload.url });
        converterSourceUrl = catboxUpload.url;
        converterSourceType = 'catbox';
        pushTrace('converter-request-start', { sourceType: converterSourceType });
        payload = await convertPdfByUrl(converterSourceUrl, safeFilename, to);
        pushTrace('converter-request-success', { sourceType: converterSourceType });
      } catch (primaryError) {
        if (!catboxDebug.uploaded) {
          catboxDebug.error = {
            message: primaryError?.message || 'Upload ke Catbox gagal.',
            statusCode: Number(primaryError?.statusCode) || null,
            upstream: primaryError?.payload || null
          };
          pushTrace('catbox-upload-failed', {
            message: catboxDebug.error.message,
            statusCode: catboxDebug.error.statusCode
          });
        } else {
          pushTrace('converter-request-failed', {
            sourceType: 'catbox',
            message: primaryError?.message || 'Request ke converter gagal.',
            statusCode: Number(primaryError?.statusCode) || null
          });
        }
        if (!tempPdfUrlUsable) {
          throw primaryError;
        }
        converterSourceUrl = tempPdfUrl;
        converterSourceType = 'server-temp-url';
        usedFallbackSource = true;
        pushTrace('fallback-server-temp-start', { url: tempPdfUrl });
        payload = await convertPdfByUrl(converterSourceUrl, safeFilename, to);
        pushTrace('fallback-server-temp-success', {});
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
          fallback: usedFallbackSource || Boolean(githubFallback),
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
          const retriedPayload = await convertPdfByUrl(githubFallback.url, safeFilename, to);
          pushTrace('github-fallback-convert-success', {});
          const imageLinks = [];
          collectImageLinks(retriedPayload, imageLinks);
          const uniqueImageLinks = [...new Set(imageLinks)];
          const archiveUrl = retriedPayload?.data?.url && /^https?:\/\//i.test(retriedPayload.data.url)
            ? retriedPayload.data.url
            : '';

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
        ? 'Upload Catbox atau provider converter timeout. Coba lagi dengan file lebih kecil atau ulang beberapa saat lagi.'
        : statusCode === 502
          ? 'Upload Catbox atau koneksi ke provider converter sedang bermasalah.'
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
  app.listen(PORT, () => {
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
    console.log(`   - GET  /u/:id         → File public landing`);
    console.log(`   - GET  /api/short-links      → List shortlink`);
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
}

// Export untuk Vercel (serverless)
module.exports = app;