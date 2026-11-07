// ============================================================
// confetti.js — конфетти на весь экран (как в Telegram).
// Вызов: STR.confetti.fire(). Запускается из run.js при новом рекорде.
// ============================================================
STR.confetti = (function () {
  const COLORS = ['#ff2d3d', '#22d36b', '#ffb400', '#35a7ff', '#ffffff', '#b66dff', '#ff7ac6'];
  let canvas = null, ctx = null, parts = [], raf = null, last = 0, W = 0, H = 0, dpr = 1;

  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5000;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function piece(x, y, angle, speed, delay) {
    return {
      x, y, delay,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
      rot: Math.random() * 6.28, vr: (Math.random() - .5) * 12,
      flip: Math.random() * 6.28, vf: 4 + Math.random() * 6,       // «переворот» — создаёт мерцание
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0, max: 2.8 + Math.random() * 1.4, round: Math.random() < .25
    };
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      if (p.delay > 0) { p.delay -= dt; alive++; continue; }
      p.life += dt;
      if (p.life > p.max || p.y > H + 30) continue;
      alive++;
      p.vy += 900 * dt;                       // гравитация
      p.vx *= Math.pow(.18, dt); p.vy *= Math.pow(.45, dt);   // сопротивление воздуха
      p.x += p.vx * dt; p.y += (p.vy + 70) * dt;
      p.rot += p.vr * dt; p.flip += p.vf * dt;
      const fade = p.life > p.max - .6 ? Math.max(0, (p.max - p.life) / .6) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.2, 0, 6.28); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    parts = parts.filter(p => p.delay > 0 || (p.life <= p.max && p.y <= H + 30));
    if (alive) raf = requestAnimationFrame(frame);
    else { raf = null; ctx.clearRect(0, 0, W, H); canvas.style.display = 'none'; }
  }

  function fire() {
    try {
      ensure(); resize();
      canvas.style.display = 'block';
      // Два залпа из нижних углов вверх и внутрь + дождь сверху
      for (let k = 0; k < 2; k++) {
        const d = k * .35;
        for (let i = 0; i < 70; i++) {
          parts.push(piece(0, H * .85, -Math.PI / 2 + .15 + Math.random() * .9 - .45 + .35, 700 + Math.random() * 600, d));
          parts.push(piece(W, H * .85, -Math.PI / 2 - .15 + Math.random() * .9 - .45 - .35, 700 + Math.random() * 600, d));
        }
      }
      for (let i = 0; i < 60; i++) parts.push(piece(Math.random() * W, -20 - Math.random() * 80, Math.PI / 2, 60 + Math.random() * 80, Math.random() * 1.2));
      if (STR.tg && STR.tg.HapticFeedback) STR.tg.HapticFeedback.notificationOccurred('success');
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    } catch (e) {}
  }

  return { fire };
})();
