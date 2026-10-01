'use strict';
/*
 * راه‌اندازی خودکار حساب مالک (Owner) از روی متغیرهای محیطی.
 *
 * روی VibeNest، مقدار ADMIN_PASSWORD هنگام ساخت پروژه به‌صورت خودکار تولید و
 * به سرویس تزریق می‌شود (مطابق فایل .env.example). با این ماژول، پنل بدون هیچ
 * مرحله دستی و بدون هیچ خطایی بالا می‌آید و مستقیم صفحه ورود را نشان می‌دهد.
 *
 * اگر این متغیرها ست نشده باشند، رفتار قبلی (صفحه /setup برای ساخت حساب) حفظ
 * می‌شود؛ یعنی هیچ‌چیز خراب نمی‌شود.
 */
const crypto = require('crypto');
const store = require('./store');
const auth = require('./auth');

function cleanStr(v) {
  return String(v === undefined || v === null ? '' : v).trim();
}

function ensureAdminFromEnv(log) {
  const say = typeof log === 'function' ? log : () => {};
  const username = cleanStr(process.env.ADMIN_USERNAME) || 'admin';
  const password = cleanStr(process.env.ADMIN_PASSWORD);

  if (!password) return null; // چیزی ست نشده — همان مسیر /setup

  if (password.length < 6) {
    say('هشدار: ADMIN_PASSWORD کوتاه‌تر از ۶ کاراکتر است؛ نادیده گرفته شد.');
    return null;
  }

  const state = store.getState();

  if (!state.admins.length) {
    const admin = {
      id: crypto.randomUUID(),
      username,
      passwordHash: auth.hashPassword(password),
      role: 'owner',
      createdAt: new Date().toISOString(),
      fromEnv: true
    };
    state.admins.push(admin);
    store.persist();
    say(`حساب مالک «${username}» از روی متغیرهای محیطی ساخته شد.`);
    return admin;
  }

  // اگر مالک از روی env ساخته شده و رمز در پنل مدیریت پلتفرم عوض شده باشد،
  // همان رمز جدید اعمال می‌شود تا کاربر هیچ‌وقت پشت در نماند.
  const owner = state.admins.find((a) => a.role === 'owner' && a.fromEnv);
  if (owner && !auth.verifyPassword(password, owner.passwordHash)) {
    owner.username = username || owner.username;
    owner.passwordHash = auth.hashPassword(password);
    store.persist();
    say('رمز حساب مالک با مقدار جدید متغیر محیطی هماهنگ شد.');
  }
  return owner || null;
}

module.exports = { ensureAdminFromEnv };
