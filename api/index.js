const sesss = require('express-session');
const nodemailer = require('nodemailer');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const shortLinks = new Map();
const MAX_HISTORY_PER_LINK = 20;

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

app.get('/short-link', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../views/short-link.html'));
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
    res.status(200).send('Email berhasil dikirim: ' + info.response);
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
    console.log(`   - GET  /captcha       → Generate captcha`);
    console.log(`   - GET  /s/:code       → Redirect shortlink`);
    console.log(`   - GET  /api/short-links      → List shortlink`);
    console.log(`   - POST /api/short-links      → Create shortlink`);
    console.log(`   - GET  /api/short-links/:code  → Shortlink detail`);
    console.log(`   - DELETE /api/short-links/:code → Delete shortlink`);
    console.log(`   - POST /contact       → Send email`);
    console.log('='.repeat(50));
    console.log('Press Ctrl+C to stop server');
  });
}

// Export untuk Vercel (serverless)
module.exports = app;