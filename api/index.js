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
const MAX_HISTORY_PER_LINK = 20;
const UPLOAD_STORAGE_DIR = process.env.UPLOAD_STORAGE_DIR || path.join(os.tmpdir(), 'indragpt-file-vault');
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
const TOOL_ACCESS_PIN = String(process.env.TOOL_ACCESS_PIN || '050507').trim();

if (!fs.existsSync(UPLOAD_STORAGE_DIR)) {
  fs.mkdirSync(UPLOAD_STORAGE_DIR, { recursive: true });
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

function ensureToolAccess(req, res, next) {
  if (req.session?.toolAccessGranted) return next();
  return res.redirect(`${TOOL_PREFIX}`);
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

app.get(`${TOOL_PREFIX}`, (req, res) => {
  if (req.session?.toolAccessGranted) {
    return res.redirect(`${TOOL_PREFIX}/file-vault`);
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
            background: radial-gradient(circle at top, #1d4ed8 0%, #0f172a 72%);
            color: #dbeafe;
          }
          .card {
            width: min(420px, 100%);
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 16px;
            box-shadow: 0 18px 36px rgba(2, 6, 23, 0.42);
            padding: 24px;
          }
          h1 { margin: 0 0 8px; font-size: 1.35rem; color: #93c5fd; }
          p { margin: 0 0 16px; color: #bfdbfe; line-height: 1.6; font-size: 0.95rem; }
          label { display: block; margin-bottom: 8px; font-size: 0.9rem; color: #cbd5e1; }
          input {
            width: 100%;
            box-sizing: border-box;
            border-radius: 10px;
            border: 1px solid rgba(59, 130, 246, 0.45);
            background: rgba(2, 6, 23, 0.7);
            color: #e2e8f0;
            padding: 10px 12px;
            margin-bottom: 12px;
          }
          button {
            width: 100%;
            border: none;
            border-radius: 10px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: #fff;
            font-weight: 700;
            padding: 10px 12px;
            cursor: pointer;
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
            <input id="pin" name="pin" inputmode="numeric" autocomplete="one-time-code" required />
            <button type="submit">Masuk</button>
          </form>
          ${req.query?.error ? '<div class="error">PIN salah. Coba lagi.</div>' : ''}
        </main>
      </body>
    </html>
  `);
});

app.post(`${TOOL_PREFIX}/login`, (req, res) => {
  const candidate = String(req.body?.pin || '').trim();
  if (candidate && candidate === TOOL_ACCESS_PIN) {
    req.session.toolAccessGranted = true;
    return res.redirect(`${TOOL_PREFIX}/file-vault`);
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

function serializeUploadEntry(req, entry) {
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
    openUrl: buildUploadPublicUrl(req, entry.id),
    downloadUrl: buildUploadDownloadUrl(req, entry.id)
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
}

function createUploadSummary() {
  const entries = Array.from(fileVaultEntries.values());
  const usedBytes = entries.reduce((acc, item) => acc + item.sizeBytes, 0);
  const totalClicks = entries.reduce((acc, item) => acc + item.clickCount, 0);
  const totalDownloads = entries.reduce((acc, item) => acc + item.downloadCount, 0);

  return {
    totalFiles: entries.length,
    usedBytes,
    totalCapacityBytes: STORAGE_CAPACITY_BYTES,
    remainingBytes: Math.max(0, STORAGE_CAPACITY_BYTES - usedBytes),
    storagePercent: STORAGE_CAPACITY_BYTES > 0
      ? Number(((usedBytes / STORAGE_CAPACITY_BYTES) * 100).toFixed(2))
      : 0,
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

  const entries = Array.from(fileVaultEntries.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => serializeUploadEntry(req, entry));

  return res.json({
    summary: createUploadSummary(),
    entries
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
    if ((getUsedStorageBytes() + incomingBytes) > STORAGE_CAPACITY_BYTES) {
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

    const savedEntries = files.map((file, index) => {
      const id = generateCode() + crypto.randomBytes(2).toString('hex');
      const entry = {
        id,
        filePath: file.path,
        storedName: file.filename,
        originalName: file.originalname,
        relativePath: relativePaths[index] || file.originalname,
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
      return serializeUploadEntry(req, entry);
    });

    return res.status(201).json({
      message: `${savedEntries.length} file berhasil diupload.`,
      entries: savedEntries,
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
  fileVaultEntries.delete(id);

  return res.json({
    message: 'File berhasil dihapus.',
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
          <p style="margin-top: 14px;"><a style="color:#93c5fd;" href="/file-vault">Kembali ke File Vault</a></p>
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

function isValidHttpUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

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
    subject: `Pesan IndraGPT > ${name}`,
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
            <h1>Pesan Baru Dari IndraGPT</h1>
            <p><strong>Nama:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <div class="message">
              <p><strong>Pesan:</strong></p>
              <p>${message}</p>
            </div>
            <div class="footer">
              <p>Pesan ini dikirim dari IndraGPT</p>
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