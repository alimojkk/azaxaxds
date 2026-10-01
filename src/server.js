'use strict';
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');

const store = require('./lib/store');
const platform = require('./lib/platform');
const bootstrap = require('./lib/bootstrap');
const xray = require('./lib/xray');
const wsproxy = require('./lib/wsproxy');

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const apiRoutes = require('./routes/api');
const subRoutes = require('./routes/sub');

// شبکهٔ ایمنی سراسری: هیچ خطای پیش‌بینی‌نشده نباید کل پنل را آفلاین کند.
// (مثلاً اگر اجرای Xray یا یک درخواست غیرمنتظره خطا بدهد، فقط لاگ می‌شود
// و وب‌سرور اصلی پنل به کار خودش ادامه می‌دهد.)
process.on('uncaughtException', (err) => {
  console.error('uncaughtException (نادیده گرفته شد تا پنل آفلاین نشود):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection (نادیده گرفته شد تا پنل آفلاین نشود):', err);
});

// بارگذاری/ساخت وضعیت اولیه پیش از هر چیز
store.load();
platform.setLearnedStorage(store.DATA_DIR);

// ساخت خودکار حساب مالک از روی ADMIN_USERNAME / ADMIN_PASSWORD (در صورت وجود)
try {
  bootstrap.ensureAdminFromEnv((m) => console.log(m));
} catch (err) {
  console.error('ساخت خودکار حساب مالک انجام نشد (پنل با /setup ادامه می‌دهد):', err.message);
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true); // پشت پراکسی لبه (VibeNest/CDN) اجرا می‌شویم
app.disable('x-powered-by');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(platform.learnHostMiddleware); // یادگیری دامنه عمومی از هدرها
app.use('/public', express.static(path.join(__dirname, 'public')));

// هِلث‌چک پلتفرم — همیشه و در هر شرایطی 200 برمی‌گرداند تا دیپلوی سالم تشخیص داده شود
app.get(['/health', '/healthz'], (req, res) =>
  res.json({
    ok: true,
    platform: platform.platformName(),
    domain: platform.publicDomain(store.getState().settings),
    xray: xray.getStatus().running,
    uptime: Math.round(process.uptime())
  })
);

app.use('/', authRoutes);
app.use('/api', apiRoutes);
app.use('/', subRoutes);
app.use('/', pageRoutes);

app.use((req, res) => res.status(404).send('404 - صفحه پیدا نشد'));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('500 - خطای داخلی سرور');
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const server = http.createServer(app);

// اتصال ترافیک WebSocket (VLESS/VMess/Trojan) روی همان پورت اصلی
wsproxy.attach(server, xray);

server.on('error', (err) => {
  console.error('خطای وب‌سرور:', err.message);
});

server.listen(PORT, HOST, () => {
  const state = store.getState();
  console.log('──────────────────────────────────────────────');
  console.log(` پنل روی ${HOST}:${PORT} بالا آمد`);
  console.log(` پلتفرم: ${platform.platformName()}`);
  console.log(` دامنه عمومی: ${platform.publicBaseUrl(state.settings)}`);
  console.log(` مسیر داده: ${store.DATA_DIR}`);
  console.log('──────────────────────────────────────────────');
  try {
    xray.start();
    xray.startStatsPolling(20000);
  } catch (err) {
    console.error('استارت Xray ناموفق بود (پنل سالم است):', err.message);
  }
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('در حال خاموش کردن...');
  const done = () => process.exit(0);
  const timer = setTimeout(done, 5000);
  timer.unref();
  server.close(() => {
    xray.stop().finally(done);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
