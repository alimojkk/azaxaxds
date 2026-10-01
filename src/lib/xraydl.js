'use strict';
/*
 * دانلود خودکار Xray-core در زمان اجرا (بدون هیچ وابستگی خارجی).
 * چرا؟ روی پلتفرم‌هایی مثل VibeNest ممکن است بیلد با Nixpacks انجام شود
 * (نه Dockerfile)؛ در آن حالت باینری Xray داخل ایمیج نیست. این ماژول موقع
 * استارت، اگر باینری پیدا نشود، نسخه مناسب معماری سیستم را از GitHub
 * دانلود و از داخل ZIP (با یک extractor مینیمال مبتنی بر zlib) استخراج می‌کند
 * و در DATA_DIR/xray/ ذخیره می‌کند تا بین ری‌استارت‌ها باقی بماند.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const store = require('./store');

const XRAY_VERSION = process.env.XRAY_VERSION || 'v26.9.9';

function archSuffix() {
  switch (os.arch()) {
    case 'x64': return '64';
    case 'arm64': return 'arm64-v8a';
    case 'arm': return 'arm32-v7a';
    default: return null;
  }
}

function targetDir() {
  return path.join(store.DATA_DIR, 'xray');
}

function targetPath() {
  return path.join(targetDir(), 'xray');
}

function downloadUrl() {
  const a = archSuffix();
  if (!a) return null;
  return `https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${a}.zip`;
}

// دانلود با دنبال‌کردن ریدایرکت‌ها (GitHub → objects.githubusercontent.com)
function fetchBuffer(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 5;
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'panel-xray-dl' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('بیش از حد ریدایرکت'));
          return resolve(fetchBuffer(res.headers.location, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} برای ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/*
 * استخراج یک فایل مشخص از بافر ZIP — پیاده‌سازی مینیمال:
 * EOCD را از انتهای فایل پیدا می‌کنیم، دایرکتوری مرکزی را می‌خوانیم،
 * و entry موردنظر را با inflateRaw باز می‌کنیم. (روش 0=store، 8=deflate)
 */
function extractFromZip(buf, wantedName) {
  // جستجوی امضای EOCD: 0x06054b50
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP نامعتبر (EOCD پیدا نشد)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP نامعتبر (central directory)');
    const method = buf.readUInt16LE(off + 10);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    if (name === wantedName) {
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('ZIP نامعتبر (local header)');
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const compSize = buf.readUInt32LE(off + 20);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`روش فشرده‌سازی پشتیبانی‌نشده: ${method}`);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`فایل «${wantedName}» داخل ZIP پیدا نشد`);
}

let inflight = null;

async function ensure(log) {
  const say = typeof log === 'function' ? log : () => {};
  const bin = targetPath();
  try {
    fs.accessSync(bin, fs.constants.X_OK);
    return bin; // از قبل دانلود شده
  } catch (_) {}

  if (inflight) return inflight; // جلوگیری از دانلود موازی
  inflight = (async () => {
    const url = downloadUrl();
    if (!url) throw new Error(`معماری پشتیبانی‌نشده: ${os.arch()}`);
    say(`باینری Xray پیدا نشد؛ در حال دانلود ${XRAY_VERSION} برای ${os.arch()} ...`);
    const zip = await fetchBuffer(url);
    say(`دانلود کامل شد (${(zip.length / 1048576).toFixed(1)} MB)؛ در حال استخراج...`);
    const xrayBin = extractFromZip(zip, 'xray');
    fs.mkdirSync(targetDir(), { recursive: true });
    const tmp = bin + '.tmp';
    fs.writeFileSync(tmp, xrayBin, { mode: 0o755 });
    fs.renameSync(tmp, bin);
    say(`Xray در ${bin} نصب شد.`);
    return bin;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

module.exports = { ensure, targetPath, XRAY_VERSION };
