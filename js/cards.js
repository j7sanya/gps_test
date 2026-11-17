// ============================================================
// cards.js — рисует карточки заезда для соцсетей (на canvas, прямо на телефоне, без сервера).
//
// 6 стилей × 2 формата (9:16 для историй, 1:1 для постов), размер 1080 px по ширине:
//   «Карточки» (готовый фон + QR-код):  dark — тёмная с панелью, red — красная гоночная, map — трасса на весь фон
//   «PNG без фона» (прозрачный слой с текстом-ссылкой, для наложения на своё фото/видео):
//                                       center — по центру, racing — крупный гоночный, minimal — минимал
//
//   STR.cards.render(data, style, fmt) -> canvas      fmt: 's' (9:16) | 'q' (1:1)
//   data: { name, time (сек), avg, max (км/ч), dist (м), date (мс), nick, rank, total, record,
//           lines [[ [lat,lon], ... ], ...] (линия трассы), link (для QR), linkText ('t.me/…') }
// Все координаты ниже — в «макетных» единицах (ширина 540), canvas масштабируется в 2 раза.
// ============================================================
window.STR = window.STR || {};
STR.cards = (function () {
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const F = (w, s, it) => (it ? 'italic ' : '') + w + ' ' + s + 'px ' + FONT;
  const RED = '#ff2d3d', GOLD = '#ffb400', GRAY = '#8b93a1';
  const STYLES = { card: ['dark', 'red', 'map'], png: ['center', 'racing', 'minimal'] };

  // ---------- Помощники ----------
  // Время: «1:42.37», «42.37», «1:02:03.45»
  function tfmt(sec) {
    const cs = Math.floor(sec * 100 + 1e-6), c = cs % 100, t = Math.floor(cs / 100);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60, p = n => String(n).padStart(2, '0');
    return h ? h + ':' + p(m) + ':' + p(s) + '.' + p(c) : m ? m + ':' + p(s) + '.' + p(c) : s + '.' + p(c);
  }
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dShort = ts => { const d = new Date(ts); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
  const dNum = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear(); };
  const km = m => (m / 1000).toFixed(1);

  // Ширина текста с учётом разрядки (letter-spacing)
  function wid(c, s, font, sp) {
    c.save(); c.font = font;
    let w = 0; for (const ch of s) w += c.measureText(ch).width + (sp || 0);
    c.restore();
    return Math.max(0, w - (sp || 0));
  }
  // Текст. o: font, color, align (left|center|right), sp (разрядка), shadow (тень для текста на фото), max (макс. ширина), skew
  function txt(c, s, x, y, o) {
    o = o || {}; s = String(s);
    let font = o.font, sp = o.sp || 0, w = wid(c, s, font, sp);
    if (o.max && w > o.max) {   // не влезает: уменьшаем шрифт
      const m = /(\d+(?:\.\d+)?)px/.exec(font), size = +m[1], k = o.max / w;
      font = font.replace(m[0], (size * k).toFixed(1) + 'px'); sp *= k; w = o.max;
    }
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    c.save();
    c.font = font; c.fillStyle = o.color || '#fff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const draw = () => { let px = x0; for (const ch of s) { c.fillText(ch, px, y); px += c.measureText(ch).width + sp; } };
    if (o.shadow) {
      c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 22; c.shadowOffsetY = 3; draw();
      c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 4; c.shadowOffsetY = 1; draw();
    } else if (o.skew) {
      c.translate(x0, y); c.transform(1, 0, Math.tan(o.skew * Math.PI / 180), 1, 0, 0); c.translate(-x0, -y);
      if (o.drop) { c.fillStyle = o.drop[2]; c.translate(o.drop[0], o.drop[1]); draw(); c.translate(-o.drop[0], -o.drop[1]); c.fillStyle = o.color || '#fff'; }
      draw();
    } else draw();
    c.restore();
    return w;
  }
  // Число крупно + единица мелко, вместе, выравнивание по центру/слева/справа
  function pair(c, num, unit, x, y, size, o) {
    o = o || {};
    const fn = F(900, size, true), fu = F(700, o.usize || Math.max(10, size * 0.4), true);
    const wn = wid(c, num, fn, o.sp || 0), wu = unit ? wid(c, ' ' + unit, fu, 0) : 0, tot = wn + wu;
    const x0 = o.align === 'center' ? x - tot / 2 : o.align === 'right' ? x - tot : x;
    txt(c, num, x0, y, { font: fn, color: o.color || '#fff', shadow: o.shadow, sp: o.sp });
    if (unit) txt(c, ' ' + unit, x0 + wn, y, { font: fu, color: o.ucolor || (o.shadow ? 'rgba(255,255,255,.9)' : GRAY), shadow: o.shadow });
    return tot;
  }
  // Логотип ST|RACE (RACE красным, либо на чёрной плашке)
  function brand(c, x, y, size, o) {
    o = o || {};
    const f = F(900, size, true), sp = size * 0.22, w1 = wid(c, 'ST', f, sp) + sp, w2 = wid(c, 'RACE', f, sp), tot = w1 + w2;
    const x0 = o.align === 'center' ? x - tot / 2 : o.align === 'right' ? x - tot : x;
    if (o.box) { c.save(); c.fillStyle = '#000'; c.fillRect(x0 + w1 - 4, y - size * 0.95, w2 + 8, size * 1.25); c.restore(); }
    txt(c, 'ST', x0, y, { font: f, color: '#fff', sp, shadow: o.shadow });
    txt(c, 'RACE', x0 + w1, y, { font: f, color: o.box ? '#fff' : RED, sp, shadow: o.shadow });
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // Линия трассы белым цветом в рамке (bx,by,bw,bh); красная точка — старт
  function track(c, lines, bx, by, bw, bh, o) {
    if (!lines || !lines.length) return;
    o = o || {};
    const lat0 = lines[0][0][0], kx = Math.cos(lat0 * Math.PI / 180);
    let total = 0; lines.forEach(l => { total += l.length; });
    const step = Math.max(1, Math.ceil(total / 1500));
    const ls = lines.map(l => l.filter((p, i) => i % step === 0 || i === l.length - 1).map(p => [p[1] * kx, -p[0]]));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    ls.forEach(l => l.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
    const pad = (o.lw || 6) + 4, s = Math.min((bw - 2 * pad) / ((x1 - x0) || 1e-9), (bh - 2 * pad) / ((y1 - y0) || 1e-9));
    const ox = bx + (bw - (x1 - x0) * s) / 2, oy = by + (bh - (y1 - y0) * s) / 2;
    const P = ls.map(l => l.map(p => [ox + (p[0] - x0) * s, oy + (p[1] - y0) * s]));
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const path = () => { c.beginPath(); P.forEach(l => { l.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); }); };
    if (o.glow) { path(); c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = o.lw * 2; c.stroke(); }
    c.shadowColor = o.glow ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.65)'; c.shadowBlur = o.glow ? 36 : 20; c.shadowOffsetY = o.glow ? 0 : 3;
    path(); c.strokeStyle = '#fff'; c.lineWidth = o.lw || 6; c.stroke();
    c.shadowColor = 'transparent';
    const st = P[0][0];
    c.beginPath(); c.arc(st[0], st[1], (o.lw || 6) * 0.85, 0, Math.PI * 2); c.fillStyle = RED; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
    c.restore();
  }
  const qrAt = (c, q, x, y, s) => { if (q) STR.qr.draw(c, q, x, y, s); };

  // Подписи
  const pill = d => d.record ? '🏆 РЕКОРД ТРАССЫ' : (d.rank ? '#' + d.rank + ' В ТАБЛИЦЕ' : '');
  const goldLine = d => d.record ? '🏆 РЕКОРД' + (d.rank ? ' · ' + d.rank + ' МЕСТО' : '') : (d.rank ? d.rank + ' МЕСТО' + (d.total ? ' ИЗ ' + d.total : '') : '');
  const subLine = d => dShort(d.date) + (d.rank ? ' · ' + d.rank + ' место' + (d.total ? ' из ' + d.total : '') : '');
  const nameUp = d => String(d.name || '').toUpperCase();
  const linkTxt = d => d.linkText || '';

  // ============ PNG без фона ============
  function oCenter(c, d, H, Q) {
    txt(c, nameUp(d), 270, Q ? 44 : 162, { font: F(700, 12), sp: 2.2, align: 'center', shadow: 1, max: 470 });
    txt(c, 'ВРЕМЯ', 270, Q ? 74 : 212, { font: F(700, 11), sp: 2, align: 'center', shadow: 1, color: 'rgba(255,255,255,.8)' });
    txt(c, tfmt(d.time), 270, Q ? 136 : 285, { font: F(900, Q ? 64 : 74, true), sp: -1.3, align: 'center', shadow: 1, max: 450 });
    const ly = Q ? 168 : 326, vy = Q ? 198 : 360, vs = Q ? 26 : 34;
    [[195, 'МАКС', Math.round(d.max) + '', 'км/ч'], [360, 'ДИСТАНЦИЯ', km(d.dist), 'км']].forEach(([x, lb, v, u]) => {
      txt(c, lb, x, ly, { font: F(700, 11), sp: 2, align: 'center', shadow: 1, color: 'rgba(255,255,255,.8)' });
      pair(c, v, u, x, vy, vs, { align: 'center', shadow: 1 });
    });
    if (Q) track(c, d.lines, 160, 232, 220, 160, { lw: 5 }); else track(c, d.lines, 120, 410, 300, 200, { lw: 5 });
    brand(c, 270, Q ? 490 : 676, Q ? 15 : 16, { align: 'center', shadow: 1 });
    txt(c, linkTxt(d), 270, Q ? 512 : 700, { font: F(700, 12), sp: 1.4, align: 'center', shadow: 1 });
  }
  function oRacing(c, d, H, Q) {
    brand(c, 30, Q ? 48 : 70, 14, { shadow: 1 });
    txt(c, dNum(d.date), 510, Q ? 48 : 70, { font: F(700, 12), sp: 2.2, align: 'right', shadow: 1 });
    if (Q) track(c, d.lines, 326, 66, 190, 140, { lw: 6 }); else track(c, d.lines, 256, 112, 260, 200, { lw: 6 });
    const nickY = H - (Q ? 32 : 66), statsY = nickY - 34, timeY = statsY - (Q ? 36 : 40), bw = 0;
    // красная плашка над временем
    const btxt = d.record ? '🏆 РЕКОРД · ' + nameUp(d) : nameUp(d), bf = F(700, 12), tw = wid(c, btxt, bf, 2.2);
    const bh = 28, by = timeY - (Q ? 66 : 78) - 12 - bh, bwid = Math.min(tw + 26, 480);
    c.save(); c.translate(30 + bwid / 2, by + bh / 2); c.transform(1, 0, Math.tan(-12 * Math.PI / 180), 1, 0, 0);
    c.fillStyle = RED; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 14; c.fillRect(-bwid / 2, -bh / 2, bwid, bh); c.restore();
    txt(c, btxt, 30 + 13, by + 19, { font: bf, sp: 2.2, max: bwid - 26 });
    txt(c, tfmt(d.time), 30, timeY, { font: F(900, Q ? 92 : 108, true), sp: -2, shadow: 1, max: 480 });
    let x = 30;
    x += pair(c, Math.round(d.max) + '', 'макс', x, statsY, 26, { shadow: 1, usize: 11 }) + 24;
    x += pair(c, Math.round(d.avg) + '', 'сред', x, statsY, 26, { shadow: 1, usize: 11 }) + 24;
    if (d.rank) pair(c, '#' + d.rank, '', x, statsY, 26, { shadow: 1, color: GOLD }); else pair(c, km(d.dist), 'км', x, statsY, 26, { shadow: 1, usize: 11 });
    if (d.nick) txt(c, d.nick, 30, nickY, { font: F(800, 15), shadow: 1, max: 260 });
    txt(c, linkTxt(d), 510, nickY, { font: F(700, 12), sp: 1.2, align: 'right', shadow: 1 });
  }
  function oMinimal(c, d, H, Q) {
    const base = H - (Q ? 28 : 56);
    txt(c, nameUp(d), 28, base - 90, { font: F(700, 12), sp: 2.2, shadow: 1, max: 250 });
    txt(c, tfmt(d.time), 28, base - 40, { font: F(900, Q ? 50 : 56, true), sp: -1, shadow: 1, max: 270 });
    brand(c, 28, base - 23, 12, { shadow: 1 });
    if (d.nick) txt(c, '· ' + d.nick, 28 + wid(c, 'STRACE', F(900, 12, true), 2.64) + 18, base - 23, { font: F(800, 12), sp: 1.5, shadow: 1, max: 140 });
    txt(c, linkTxt(d), 28, base - 4, { font: F(700, 11), sp: 1.1, shadow: 1 });
    track(c, d.lines, 382, base - 100, 132, 100, { lw: 5 });
  }

  // ============ Готовые карточки ============
  function cDark(c, d, H, Q, q) {
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, 540, H);
    const stats = [['макс', Math.round(d.max) + '', 'км/ч'], ['средняя', Math.round(d.avg) + '', 'км/ч'], ['дистанция', km(d.dist), 'км']];
    const t = tfmt(d.time), dot = t.lastIndexOf('.'), main = t.slice(0, dot), cs = t.slice(dot);
    const drawTime = (y, size) => {
      const f = F(900, size, true), w = wid(c, main, f, -2) + wid(c, cs, f, -2) + 6;
      const k = Math.min(1, 468 / w), fs = F(900, size * k, true);
      const w1 = wid(c, main, fs, -2 * k);
      txt(c, main, 36, y, { font: fs, sp: -2 * k }); txt(c, cs, 36 + w1 + 3, y, { font: fs, sp: -2 * k, color: RED });
    };
    const drawPill = (y, h, fs) => {
      const s = pill(d); if (!s) return;
      const f = F(800, fs), w = wid(c, s, f, 1.3) + 28;
      c.save(); rr(c, 36, y, w, h, h / 2); c.fillStyle = 'rgba(255,180,0,.12)'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = GOLD; c.stroke(); c.restore();
      txt(c, s, 50, y + h / 2 + fs * 0.36, { font: f, sp: 1.3, color: GOLD });
    };
    if (!Q) {
      brand(c, 36, 56, 15);
      txt(c, nameUp(d) + ' · ЛУЧШИЙ ЗАЕЗД', 36, 146, { font: F(700, 12), sp: 2.2, color: GRAY, max: 468 });
      drawTime(236, 112);
      drawPill(268, 30, 13);
      c.save(); rr(c, 36, 330, 468, 366, 22); c.fillStyle = '#11141a'; c.fill(); c.restore();
      track(c, d.lines, 54, 348, 432, 330, { lw: 9 });
      const tw = (468 - 20) / 3;
      stats.forEach(([lb, v, u], i) => {
        const x = 36 + i * (tw + 10), y = 712;
        c.save(); rr(c, x, y, tw, 86, 14); c.fillStyle = '#1a1e26'; c.fill(); c.restore();
        txt(c, lb.toUpperCase(), x + 14, y + 24, { font: F(700, 10), sp: 1.8, color: GRAY });
        txt(c, v, x + 14, y + 58, { font: F(900, 30, true), sp: -0.6 });
        txt(c, u.toUpperCase(), x + 14, y + 76, { font: F(700, 10), sp: 1.8, color: GRAY });
      });
      if (d.nick) txt(c, d.nick, 36, 886, { font: F(800, 20), max: 340 });
      txt(c, subLine(d).toUpperCase(), 36, d.nick ? 908 : 892, { font: F(700, 11), sp: 1.6, color: GRAY, max: 380 });
      qrAt(c, q, 432, 844, 72);
    } else {
      brand(c, 36, 40, 15);
      txt(c, nameUp(d) + ' · ЛУЧШИЙ ЗАЕЗД', 36, 74, { font: F(700, 11), sp: 2, color: GRAY, max: 468 });
      drawTime(142, 80);
      drawPill(156, 26, 12);
      c.save(); rr(c, 36, 198, 274, 190, 18); c.fillStyle = '#11141a'; c.fill(); c.restore();
      track(c, d.lines, 46, 208, 254, 170, { lw: 7 });
      stats.forEach(([lb, v, u], i) => {
        const y = 198 + i * 66, x = 322, w = 182;
        c.save(); rr(c, x, y, w, 58, 14); c.fillStyle = '#1a1e26'; c.fill(); c.restore();
        txt(c, lb.toUpperCase(), x + 12, y + 35, { font: F(700, 9), sp: 1.6, color: GRAY });
        const wu = txt(c, u, x + w - 12, y + 36, { font: F(700, 10, true), color: GRAY, align: 'right' });
        txt(c, v, x + w - 12 - wu - 5, y + 38, { font: F(900, 24, true), align: 'right' });
      });
      if (d.nick) txt(c, d.nick, 36, 484, { font: F(800, 18), max: 340 });
      txt(c, subLine(d).toUpperCase(), 36, d.nick ? 504 : 490, { font: F(700, 10), sp: 1.5, color: GRAY, max: 380 });
      qrAt(c, q, 438, 446, 66);
    }
  }

  function cRed(c, d, H, Q, q) {
    c.fillStyle = '#0e0a0b'; c.fillRect(0, 0, 540, H);
    // полосы под углом 115°
    c.save();
    c.strokeStyle = 'rgba(255,45,61,.07)'; c.lineWidth = 46;
    const dx = Math.sin(115 * Math.PI / 180), dy = -Math.cos(115 * Math.PI / 180), px = -dy, py = dx;
    for (let k = -14; k < 22; k++) {
      const cx = 270 + dx * (k * 92 + 23), cy = H / 2 + dy * (k * 92 + 23);
      c.beginPath(); c.moveTo(cx - px * 1400, cy - py * 1400); c.lineTo(cx + px * 1400, cy + py * 1400); c.stroke();
    }
    c.restore();
    const skewBand = (top, h, color) => {
      c.save(); c.translate(290, top + h / 2); c.transform(1, Math.tan(-9 * Math.PI / 180), 0, 1, 0, 0);
      c.fillStyle = color; c.fillRect(-350, -h / 2, 700, h); c.restore();
    };
    const bandTop = Q ? 64 : 140, bandH = Q ? 170 : 250;
    skewBand(bandTop, bandH, RED);
    skewBand(bandTop + bandH + 10, 10, '#fff');
    brand(c, 34, Q ? 42 : 58, 17, { box: true });
    txt(c, nameUp(d), 34, Q ? 96 : 186, { font: F(700, 12), sp: 2.2, max: 440 });
    txt(c, tfmt(d.time), 34, Q ? 188 : 290, { font: F(900, Q ? 96 : 104, true), sp: -2, skew: -8, drop: [5, 5, 'rgba(0,0,0,.35)'], max: 470 });
    const third = d.rank ? ['#' + d.rank, '', GOLD] : [km(d.dist), 'км', '#fff'];
    if (!Q) {
      track(c, d.lines, 34, 450, 472, 330, { lw: 8 });
      const vy = 790, ly = 810;
      [[34, 'left', third[0], third[2], d.rank ? 'место' : 'дистанция'], [270, 'center', Math.round(d.max) + '', '#fff', 'макс км/ч'], [506, 'right', Math.round(d.avg) + '', '#fff', 'сред км/ч']].forEach(([x, al, v, col, lb]) => {
        txt(c, v, x, vy, { font: F(900, 44, true), color: col, align: al, sp: -1 });
        txt(c, lb.toUpperCase(), x, ly, { font: F(700, 11), sp: 1.8, color: GRAY, align: al });
      });
      c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(34, 830, 472, 2);
      if (d.nick) txt(c, d.nick, 34, 880, { font: F(900, 22, true), max: 340 });
      txt(c, linkTxt(d).toUpperCase(), 34, d.nick ? 900 : 886, { font: F(700, 10), sp: 1.6, color: GRAY });
      qrAt(c, q, 434, 844, 72);
    } else {
      track(c, d.lines, 262, 310, 248, 130, { lw: 7 });
      const col = [[third[0], third[2], third[1]], [Math.round(d.max) + '', '#fff', 'км/ч'], [Math.round(d.avg) + '', '#fff', 'км/ч']];
      col.forEach(([v, color, u], i) => {
        const y = 354 + i * 42;
        pair(c, v, u, 34, y, 32, { color, usize: 12, ucolor: GRAY, sp: -0.5 });
      });
      if (d.nick) txt(c, d.nick, 34, 500, { font: F(900, 20, true), max: 330 });
      txt(c, linkTxt(d).toUpperCase(), 34, d.nick ? 518 : 508, { font: F(700, 10), sp: 1.6, color: GRAY });
      qrAt(c, q, 444, 454, 62);
    }
  }

  function cMap(c, d, H, Q, q) {
    c.fillStyle = '#07090c'; c.fillRect(0, 0, 540, H);
    c.fillStyle = 'rgba(255,255,255,.035)';
    for (let x = 0; x < 540; x += 54) c.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 54) c.fillRect(0, y, 540, 1);
    if (Q) track(c, d.lines, 20, 40, 500, 330, { lw: 10, glow: 1 }); else track(c, d.lines, 20, 90, 500, 640, { lw: 13, glow: 1 });
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(7,9,12,.7)'); g.addColorStop(.2, 'rgba(7,9,12,0)'); g.addColorStop(.6, 'rgba(7,9,12,0)');
    g.addColorStop(.86, 'rgba(7,9,12,.96)'); g.addColorStop(1, 'rgba(7,9,12,.96)');
    c.fillStyle = g; c.fillRect(0, 0, 540, H);
    brand(c, 34, Q ? 40 : 56, 15);
    txt(c, dNum(d.date), 506, Q ? 40 : 56, { font: F(700, 12), sp: 2.2, color: GRAY, align: 'right' });
    const qs = Q ? 58 : 64, qy = H - (Q ? 26 : 44) - qs;
    const statsY = qy - (Q ? 12 : 24), timeY = statsY - (Q ? 19 : 23), size = Q ? 72 : 104, labY = timeY - size * 0.72 - 14;
    txt(c, nameUp(d), 34, labY, { font: F(700, 12), sp: 2.2, color: GRAY, max: 470 });
    txt(c, tfmt(d.time), 34, timeY, { font: F(900, size, true), sp: -2, max: 472 });
    let x = 34;
    [[Math.round(d.max) + '', 'КМ/Ч МАКС'], [Math.round(d.avg) + '', 'КМ/Ч СРЕД'], [km(d.dist), 'КМ']].forEach(([v, u]) => {
      x += txt(c, v, x, statsY, { font: F(800, 13), color: '#fff' }) + 6;
      x += txt(c, u, x, statsY, { font: F(700, 12), sp: 1.6, color: GRAY }) + 22;
    });
    const cy = qy + qs / 2, gl = goldLine(d);
    let tx = 34;
    if (d.nick) {
      c.save(); c.beginPath(); c.arc(54, cy, 20, 0, Math.PI * 2); c.fillStyle = RED; c.fill(); c.restore();
      txt(c, d.nick[0].toUpperCase(), 54, cy + 6, { font: F(900, 17), align: 'center' });
      txt(c, d.nick, 86, gl ? cy - 2 : cy + 6, { font: F(800, 16), max: 280 });
      tx = 86;
    }
    if (gl) txt(c, gl, tx, d.nick ? cy + 16 : cy + 5, { font: F(700, 11), sp: 1.4, color: GOLD, max: 300 });
    qrAt(c, q, 506 - qs, qy, qs);
  }

  const DRAW = { dark: cDark, red: cRed, map: cMap, center: oCenter, racing: oRacing, minimal: oMinimal };
  const isPng = st => STYLES.png.indexOf(st) >= 0;

  function render(d, style, fmt) {
    const Q = fmt === 'q', H = Q ? 540 : 960, S = 2;
    const cv = document.createElement('canvas'); cv.width = 540 * S; cv.height = H * S;
    const c = cv.getContext('2d'); c.scale(S, S);
    const q = !isPng(style) && d.link ? STR.qr.make(d.link) : null;
    DRAW[style](c, d, H, Q, q);
    return cv;
  }

  return { render, STYLES, isPng, tfmt };
})();
