'use strict';
/*
 * ساخت لینک‌های کلاینت (vless/vmess/trojan) روی دو ترنسپورت WS و HTTPUpgrade.
 * همه لینک‌ها security=tls و پورت 443 هستند چون TLS در لبه (edge) پلتفرم
 * میزبان — مثل VibeNest — ترمینیت می‌شود.
 *
 * ریمارک (نام نمایشی) همه کانفیگ‌ها فقط و فقط «نام پنل» ذخیره‌شده در تنظیمات
 * است — بدون نام کاربری، بدون برند و بدون هیچ متن اضافه‌ای.
 * اگر «آدرس تمیز» (cleanAddress) در تنظیمات ست شده باشد، فیلد آدرس کانفیگ به آن
 * اشاره می‌کند ولی SNI/Host همچنان دامنه اصلی می‌ماند (برای عبور بهتر از فیلترینگ).
 */

const platform = require('./platform');

// تشخیص دامنه کاملاً خودکار است: تنظیمات پنل → متغیر محیطی (APP_URL روی
// VibeNest) → دامنه‌ای که از هدر درخواست‌ها یاد گرفته شده.
function getPublicDomain(settings) {
  return platform.publicDomain(settings || {});
}

function getAddress(settings) {
  const clean = (settings.cleanAddress || '').trim();
  return clean || getPublicDomain(settings);
}

function getRemark(settings) {
  // فقط نام پنل؛ اگر خالی بود، هیچ ریمارکی گذاشته نمی‌شود
  return (settings.panelName || '').trim();
}

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

function commonQuery(settings, transport, pathValue) {
  const domain = getPublicDomain(settings);
  return {
    security: 'tls',
    sni: domain,
    host: domain,
    fp: 'chrome',
    type: transport, // 'ws' یا 'httpupgrade'
    path: pathValue,
    alpn: 'http/1.1',
    headerType: 'none'
  };
}

function withRemark(link, settings) {
  const remark = getRemark(settings);
  return remark ? `${link}#${encodeURIComponent(remark)}` : link;
}

function buildVlessLink(user, settings, transport, pathValue) {
  const address = getAddress(settings);
  const query = qs({ ...commonQuery(settings, transport, pathValue), encryption: 'none' });
  return withRemark(`vless://${user.uuid}@${address}:443?${query}`, settings);
}

function buildTrojanLink(user, settings, transport, pathValue) {
  const address = getAddress(settings);
  const query = qs(commonQuery(settings, transport, pathValue));
  return withRemark(`trojan://${user.uuid}@${address}:443?${query}`, settings);
}

function buildVmessLink(user, settings, transport, pathValue) {
  const domain = getPublicDomain(settings);
  const obj = {
    v: '2',
    ps: getRemark(settings),
    add: getAddress(settings),
    port: '443',
    id: user.uuid,
    aid: '0',
    scy: 'auto',
    net: transport,
    type: 'none',
    host: domain,
    path: pathValue,
    tls: 'tls',
    sni: domain,
    alpn: 'http/1.1',
    fp: 'chrome'
  };
  return 'vmess://' + Buffer.from(JSON.stringify(obj)).toString('base64');
}

/*
 * خروجی: برای هر پروتکل فعالِ کاربر، دو کانفیگ (WS + HTTPUpgrade) ساخته می‌شود.
 * key عمداً همان نام پایه پروتکل می‌ماند تا رنگ‌بندی کارت‌ها در UI حفظ شود.
 */
function buildUserLinks(user, settings) {
  const links = [];
  const p = settings.paths || {};
  const proto = settings.protocolsEnabled || {};

  const wants = (k) => !user.protocols || user.protocols[k];

  if (proto.vless !== false && wants('vless')) {
    links.push({ protocol: 'VLESS · WS', key: 'vless', link: buildVlessLink(user, settings, 'ws', p.vless) });
    if (p.vlessHu) links.push({ protocol: 'VLESS · HTTPUpgrade', key: 'vless', link: buildVlessLink(user, settings, 'httpupgrade', p.vlessHu) });
  }
  if (proto.vmess !== false && wants('vmess')) {
    links.push({ protocol: 'VMess · WS', key: 'vmess', link: buildVmessLink(user, settings, 'ws', p.vmess) });
    if (p.vmessHu) links.push({ protocol: 'VMess · HTTPUpgrade', key: 'vmess', link: buildVmessLink(user, settings, 'httpupgrade', p.vmessHu) });
  }
  if (proto.trojan !== false && wants('trojan')) {
    links.push({ protocol: 'Trojan · WS', key: 'trojan', link: buildTrojanLink(user, settings, 'ws', p.trojan) });
    if (p.trojanHu) links.push({ protocol: 'Trojan · HTTPUpgrade', key: 'trojan', link: buildTrojanLink(user, settings, 'httpupgrade', p.trojanHu) });
  }
  return links;
}

function buildGroupLinks(members, settings) {
  const out = [];
  for (const user of members) {
    for (const l of buildUserLinks(user, settings)) {
      out.push({ ...l, username: user.username });
    }
  }
  return out;
}

module.exports = {
  getPublicDomain,
  getAddress,
  getRemark,
  buildUserLinks,
  buildGroupLinks
};
