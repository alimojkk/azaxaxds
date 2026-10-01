'use strict';
/*
 * ذخیره‌ساز ساده مبتنی بر فایل JSON.
 * همه وضعیت پنل (ادمین‌ها، تنظیمات، کاربران، گروه‌ها، لاگ فعالیت) داخل یک فایل
 * نگه داشته می‌شود تا وابستگی به دیتابیس خارجی یا ماژول‌های native نداشته باشیم.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/*
 * انتخاب مسیر داده با fallback:
 * اول DATA_DIR (یا /data) را امتحان می‌کنیم؛ اگر قابل‌ساخت/نوشتن نبود
 * (مثلاً کانتینر non-root روی پلتفرم‌هایی مثل VibeNest که با Nixpacks بیلد
 * می‌کنند)، به ./data داخل مسیر پروژه برمی‌گردیم تا پنل به‌جای کرش، بالا بیاید.
 */
function resolveDataDir() {
  const want = process.env.DATA_DIR || '/data';
  try {
    fs.mkdirSync(want, { recursive: true });
    fs.accessSync(want, fs.constants.W_OK);
    return want;
  } catch (_) {
    const fallback = path.join(process.cwd(), 'data');
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch (_) {}
    console.warn(`هشدار: مسیر «${want}» قابل نوشتن نیست؛ از «${fallback}» استفاده می‌شود. برای ماندگاری داده‌ها یک Persistent Storage به این مسیر وصل کنید.`);
    return fallback;
  }
}

const DATA_DIR = resolveDataDir();
const STATE_FILE = path.join(DATA_DIR, 'panel_state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function defaultState() {
  return {
    version: 2,
    admins: [], // { id, username, passwordHash, role: 'owner'|'admin', createdAt }
    settings: {
      secretKey: process.env.JWT_SECRET || randomHex(32),
      domain: null, // اگر ست نشود، دامنه به‌صورت خودکار تشخیص داده می‌شود (lib/platform.js)
      panelName: '', // ریمارک همه کانفیگ‌ها؛ خالی = بدون ریمارک
      cleanAddress: null, // آدرس تمیز اختیاری (IP/دامنه) برای فیلد address کانفیگ‌ها
      paths: {
        vless: '/' + randomHex(4),
        vmess: '/' + randomHex(4),
        trojan: '/' + randomHex(4),
        vlessHu: '/' + randomHex(4),
        vmessHu: '/' + randomHex(4),
        trojanHu: '/' + randomHex(4)
      },
      protocolsEnabled: { vless: true, vmess: true, trojan: true },
      createdAt: new Date().toISOString()
    },
    users: [],
    groups: [], // { id, name, userIds: [], subToken, createdAt }
    activity: [], // { id, ts, actor, action, detail }
    trafficHistory: [] // { date: 'YYYY-MM-DD', bytes }
  };
}

let cache = null;

function migrate(state) {
  const def = defaultState();

  // v1 -> v2: تک‌ادمین به آرایه admins با نقش owner تبدیل می‌شود
  if (!Array.isArray(state.admins)) {
    state.admins = [];
    if (state.admin && state.admin.username) {
      state.admins.push({
        id: crypto.randomUUID(),
        username: state.admin.username,
        passwordHash: state.admin.passwordHash,
        role: 'owner',
        createdAt: state.settings && state.settings.createdAt ? state.settings.createdAt : new Date().toISOString()
      });
    }
  }
  delete state.admin;

  state.settings = Object.assign({}, def.settings, state.settings);
  state.settings.paths = Object.assign({}, def.settings.paths, state.settings.paths || {});
  if (typeof state.settings.panelName !== 'string') state.settings.panelName = '';
  if (state.settings.cleanAddress === undefined) state.settings.cleanAddress = null;
  state.settings.protocolsEnabled = Object.assign({}, def.settings.protocolsEnabled, state.settings.protocolsEnabled || {});

  if (!Array.isArray(state.users)) state.users = [];
  if (!Array.isArray(state.groups)) state.groups = [];
  if (!Array.isArray(state.activity)) state.activity = [];
  if (!Array.isArray(state.trafficHistory)) state.trafficHistory = [];

  // بک‌فیل فیلدهای جدید کاربر برای رکوردهای قدیمی
  for (const u of state.users) {
    if (!u.expireStrategy) u.expireStrategy = 'fixed';
    if (u.firstConnectedAt === undefined) u.firstConnectedAt = null;
    if (!Array.isArray(u.groupIds)) u.groupIds = [];
    if (u.telegramId === undefined) u.telegramId = '';
    if (u.expireDays === undefined) u.expireDays = null;
  }

  state.version = 2;
  return state;
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) {
    cache = defaultState();
    save(cache);
    return cache;
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    cache = migrate(JSON.parse(raw));
    // مهم: نتیجه migration باید ذخیره شود؛ وگرنه فیلدهای جدیدی که به‌صورت
    // تصادفی ساخته می‌شوند (مثل مسیرهای HTTPUpgrade) با هر ری‌استارت عوض
    // می‌شوند و کانفیگ‌های قبلی کاربران از کار می‌افتند.
    save(cache);
    return cache;
  } catch (err) {
    try {
      fs.copyFileSync(STATE_FILE, STATE_FILE + '.corrupt-' + Date.now());
    } catch (_) {}
    cache = defaultState();
    save(cache);
    return cache;
  }
}

function save(state) {
  ensureDataDir();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function getState() {
  if (!cache) return load();
  return cache;
}

function persist() {
  save(cache);
}

module.exports = {
  DATA_DIR,
  STATE_FILE,
  load,
  getState,
  persist,
  randomHex
};
