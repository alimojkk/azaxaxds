'use strict';
/*
 * پراکسی سطح‌پایین (الهام‌گرفته از tunnel.ts پروژه SideRail):
 * درخواست‌های HTTP Upgrade که از کلاینت‌های VLESS/VMess/Trojan روی مسیرهای
 * WS و HTTPUpgrade می‌رسند، بدون دست‌کاری مستقیماً به اینباند داخلی Xray
 * (روی 127.0.0.1) هدایت می‌شوند. پنل و ترافیک VPN هر دو از همان یک پورتی
 * رد می‌شوند که پلتفرم میزبان در اختیار می‌گذارد (پیش‌فرض 8080).
 */
const net = require('net');
const store = require('./store');

function matchTarget(reqUrl, xray) {
  if (!reqUrl) return null;
  const pathname = reqUrl.split('?')[0];
  const state = store.getState();
  const p = state.settings.paths || {};
  const map = [
    [p.vless, xray.PORTS.vless],
    [p.vmess, xray.PORTS.vmess],
    [p.trojan, xray.PORTS.trojan],
    [p.vlessHu, xray.PORTS.vlessHu],
    [p.vmessHu, xray.PORTS.vmessHu],
    [p.trojanHu, xray.PORTS.trojanHu]
  ];
  for (const [prefix, port] of map) {
    if (!prefix || !port) continue;
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return port;
  }
  return null;
}

function attach(server, xray) {
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});

    const target = matchTarget(req.url, xray);
    if (!target) {
      socket.destroy();
      return;
    }

    const upstream = net.connect(target, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion || '1.1'}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      lines.push('', '');
      upstream.write(lines.join('\r\n'));
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });

    const kill = () => {
      try { upstream.destroy(); } catch (_) {}
      try { socket.destroy(); } catch (_) {}
    };
    upstream.on('error', kill);
    socket.on('error', kill);
    socket.on('close', () => {
      try { upstream.destroy(); } catch (_) {}
    });
  });
}

module.exports = { attach };
