'use strict';
/*
 * تشخیص خودکار محیط اجرا و دامنه عمومی پنل.
 *
 * هدف: پنل روی هر پلتفرمی (VibeNest، سرور شخصی، یا هر PaaS دیگری که TLS را در
 * لبه ترمینیت می‌کند) بدون تنظیم دستی دامنه بالا بیاید و لینک‌های کانفیگ/ساب
 * دقیقاً با همان آدرسی ساخته شوند که کاربر در مرورگر می‌بیند.
 *
 * ترتیب اولویت تشخیص دامنه:
 *   1) settings.domain          ← اگر ادمین دستی در تنظیمات پنل وارد کرده باشد
 *   2) PUBLIC_DOMAIN            ← متغیر محیطی دستی
 *   3) APP_URL / PUBLIC_BASE_URL← متغیری که VibeNest موقع دیپلوی پر می‌کند
 *   4) دامنه‌ای که از هدر درخواست‌های واقعی یاد گرفته‌ایم (x-forwarded-host)
 *   5) RAILWAY_PUBLIC_DOMAIN    ← سازگاری با دیپلوی‌های قدیمی
 *   6) localhost
 */

const fs = require('fs');
const path = require('path');

let learnedHost = null; // دامنه‌ای که از هدر درخواست‌ها یاد گرفته می‌شود
let learnedFile = null;

function setLearnedStorage(dataDir) {
  try {
    learnedFile = path.join(dataDir, 'public_host.txt');
    if (fs.existsSync(learnedFile)) {
      const v = fs.readFileSync(learnedFile, 'utf8').trim();
      if (v) learnedHost = v;
    }
  } catch (_) {
    learnedFile = null;
  }
}

function hostFromUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  try {
    const u = new URL(v.includes('://') ? v : `https://${v}`);
    return u.host || '';
  } catch (_) {
    return v.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
  }
}

function envDomain() {
  const candidates = [
    process.env.PUBLIC_DOMAIN,
    process.env.PANEL_DOMAIN,
    process.env.APP_URL,
    process.env.APP_DOMAIN,
    process.env.PUBLIC_BASE_URL,
    process.env.VIBENEST_APP_URL,
    process.env.VIBENEST_PUBLIC_DOMAIN,
    process.env.RAILWAY_PUBLIC_DOMAIN
  ];
  for (const c of candidates) {
    const h = hostFromUrl(c);
    if (h && !/^localhost(:|$)/i.test(h) && !/^0\.0\.0\.0/.test(h)) return h;
  }
  return '';
}

function isUsableHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return false;
  if (h.startsWith('localhost')) return false;
  if (h.startsWith('127.0.0.1')) return false;
  if (h.startsWith('0.0.0.0')) return false;
  if (h.startsWith('[::1]')) return false;
  return /^[a-z0-9.\-:[\]]+$/.test(h);
}

/*
 * میان‌افزار: دامنه واقعی را از هدرهای پراکسی لبه یاد می‌گیرد.
 * اینطوری حتی اگر هیچ متغیر محیطی ست نشده باشد، بعد از اولین بازدید ادمین،
 * لینک‌های ساب و کانفیگ‌ها آدرس درست را می‌گیرند.
 */
function learnHostMiddleware(req, _res, next) {
  try {
    const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const host = forwarded || String(req.headers.host || '').trim();
    if (isUsableHost(host) && host !== learnedHost) {
      learnedHost = host;
      if (learnedFile) {
        try {
          fs.writeFileSync(learnedFile, host, 'utf8');
        } catch (_) {}
      }
    }
  } catch (_) {}
  next();
}

function getLearnedHost() {
  return learnedHost || '';
}

/* دامنه نهایی پنل (بدون پروتکل) */
function publicDomain(settings) {
  const manual = settings && settings.domain ? String(settings.domain).trim() : '';
  if (manual) return hostFromUrl(manual) || manual;
  const fromEnv = envDomain();
  if (fromEnv) return fromEnv;
  if (isUsableHost(learnedHost)) return learnedHost;
  return 'localhost';
}

/* آدرس کامل پنل، مثلاً https://my-panel.vibenest.net */
function publicBaseUrl(settings) {
  const d = publicDomain(settings);
  const scheme = /^(localhost|127\.|\[::1\])/i.test(d) ? 'http' : 'https';
  return `${scheme}://${d}`;
}

/* نام پلتفرمی که پنل روی آن اجرا می‌شود — فقط برای نمایش در داشبورد */
function platformName() {
  const host = envDomain() || learnedHost || '';
  if (process.env.VIBENEST || process.env.VIBENEST_PROJECT_ID || /vibenest\./i.test(host)) {
    return 'VibeNest';
  }
  if (process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID) return 'Railway';
  if (process.env.DOCKER_CONTAINER || fs.existsSync('/.dockerenv')) return 'Docker';
  return 'Self-Hosted';
}

module.exports = {
  setLearnedStorage,
  learnHostMiddleware,
  getLearnedHost,
  hostFromUrl,
  publicDomain,
  publicBaseUrl,
  platformName
};
