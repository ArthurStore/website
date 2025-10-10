const sesss = require('express-session');
const nodemailer = require('nodemailer');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    res.sendFile(path.join(__dirname, '../views/portofolio.html'));
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
    console.log(`   - GET  /captcha       → Generate captcha`);
    console.log(`   - POST /contact       → Send email`);
    console.log('='.repeat(50));
    console.log('Press Ctrl+C to stop server');
  });
}

// Export untuk Vercel (serverless)
module.exports = app;