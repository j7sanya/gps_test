// ============================================================
// hud.js — режим «Проекция» (телефон на торпеде, цифры отражаются в лобовом стекле)
//          и настройка «Экран» (не гаснет, пока приложение открыто).
// Картинка рисуется зеркально: по вертикали (телефон лежит верхом к стеклу) или по горизонтали.
// ============================================================
STR.hud = (function () {
  const U = STR.u, $ = U.$;
  const KEY = 'strace_hud_v1';
  const COLORS = ['#22d36b', '#ffffff', '#3ad0ff', '#ffb400'];
  const DEF = { layout: 'speed', flip: 'v', color: '#22d36b', bright: 100, auto: false };
  let cfg = Object.assign({}, DEF);
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x) cfg = Object.assign(cfg, x); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const bb = (on, fn) => { try { if (on) { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(fn); } else { STR.tg.BackButton.offClick(fn); STR.tg.BackButton.hide(); } } catch (e) {} };

  // ---------- Сама проекция ----------
  let timer = null, lastTap = 0;
  const isOpen = () => $('hud').classList.contains('open');
  const fmt = ms => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };

  function apply() {
    const box = $('hudBox');
    box.className = (cfg.flip === 'h' ? 'fh' : 'fv') + ' l-' + cfg.layout;
    box.style.opacity = cfg.bright / 100;
    $('hud').style.setProperty('--hc', cfg.color);
    document.body.classList.toggle('fv', isOpen() && cfg.flip !== 'h');
    document.body.classList.toggle('fh', isOpen() && cfg.flip === 'h');
  }

  function frame() {
    const L = STR.run.getLive();
    $('hSp').textContent = STR.speedo.value();
    const dl = $('hDl');
    dl.className = '';
    let delta = '', dlab = '';
    if (L.mode === 'running') {
      $('hTm').textContent = fmt(L.t); $('hTmL').textContent = L.invalid ? 'заезд не засчитан' : 'время заезда';
      $('hBar').style.width = Math.min(100, L.progress * 100) + '%';
      if (L.rec && L.progress > 0.03) {
        const d = L.t / 1000 - L.rec.time * L.progress;
        delta = (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1) + ' с'; dlab = 'к рекорду (по ходу трассы)';
        if (d > 0) dl.className = 'bad';
      } else if (!L.rec) dlab = 'рекорда пока нет';
    } else if (L.mode === 'done') {
      $('hTm').textContent = fmt(L.time * 1000); $('hTmL').textContent = L.bad ? 'финиш · не засчитан' : '🏁 финиш';
      $('hBar').style.width = '100%';
      if (L.isRecord) { delta = '🏆 РЕКОРД'; }
      else if (L.prev != null && !L.bad) { const d = L.time - L.prev; delta = (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2) + ' с'; dlab = 'к рекорду'; if (d > 0) dl.className = 'bad'; }
    } else {
      $('hTm').textContent = '--:--.-'; $('hTmL').textContent = 'ждём заезд'; $('hBar').style.width = '0';
    }
    dl.textContent = delta; $('hDlL').textContent = dlab;
  }

  function open() {
    if (isOpen()) return;
    $('hud').classList.add('open');
    apply(); frame();
    clearInterval(timer); timer = setInterval(frame, 100);
    STR.gps.setHud(true); STR.gps.startWatching();
    try { STR.tg.lockOrientation && STR.tg.lockOrientation(); } catch (e) {}
    bb(true, close);
  }
  function close() {
    $('hud').classList.remove('open');
    clearInterval(timer);
    document.body.classList.remove('fv', 'fh');
    STR.gps.setHud(false);
    try { STR.tg.unlockOrientation && STR.tg.unlockOrientation(); } catch (e) {}
    bb(false, close);
  }
  // Автовключение при начале заезда
  function auto() { if (cfg.auto && !isOpen()) open(); }
  // Выход — двойным касанием (чтобы случайно не закрыть за рулём)
  $('hud').addEventListener('click', () => { const n = Date.now(); if (n - lastTap < 500) close(); lastTap = n; });

  // ---------- Настройки проекции ----------
  const hsOpen = () => $('hudSetOverlay').classList.contains('open');
  const pill = (on, attr, v, t) => `<span class="chip${on ? ' on' : ''}" ${attr}="${v}">${t}</span>`;
  function renderSet() {
    $('hudSetBody').innerHTML = `
      <h4>Отражение — как лежит телефон</h4>
      <div class="seg2">${pill(cfg.flip === 'v', 'data-flip', 'v', '⇅ По вертикали')}${pill(cfg.flip === 'h', 'data-flip', 'h', '⇆ По горизонтали')}</div>
      <div class="hud-note">Телефон лежит на торпеде экраном вверх, верхним краем к стеклу — выбирайте «по вертикали». Если цифры в отражении перевёрнуты, переключите.</div>
      <h4>Макет</h4>
      <div class="seg2">${pill(cfg.layout === 'speed', 'data-lay', 'speed', '1 · Скорость крупно')}${pill(cfg.layout === 'timer', 'data-lay', 'timer', '2 · Таймер крупно')}</div>
      <h4>Цвет цифр</h4>
      <div class="seg2">${COLORS.map(c => `<button class="hc-sw${cfg.color === c ? ' sel' : ''}" data-col="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
      <h4>Яркость цифр</h4>
      <div class="seg2">${[100, 70, 40].map(b => pill(cfg.bright === b, 'data-br', b, b + '%')).join('')}</div>
      <h4>Автоматически</h4>
      <label class="tgl-row"><div><b>Включать при старте заезда</b><small>Проекция откроется сама, когда начнётся отсчёт или заезд</small></div><input type="checkbox" id="hudAuto" ${cfg.auto ? 'checked' : ''}><i></i></label>
      <div class="hud-note">Пока проекция включена, экран не гаснет. Выход — двойное касание экрана. Проекция не заменяет внимание на дороге: заезды — только там, где это разрешено.</div>`;
  }
  $('hudSetBody').addEventListener('click', e => {
    const t = e.target.closest('[data-flip],[data-lay],[data-col],[data-br]'); if (!t) return;
    if (t.dataset.flip) cfg.flip = t.dataset.flip; else if (t.dataset.lay) cfg.layout = t.dataset.lay;
    else if (t.dataset.col) cfg.color = t.dataset.col; else cfg.bright = +t.dataset.br;
    save(); renderSet();
  });
  $('hudSetBody').addEventListener('change', e => { if (e.target.id === 'hudAuto') { cfg.auto = e.target.checked; save(); } });
  function openSettings() { renderSet(); $('hudSetOverlay').classList.add('open'); bb(true, closeSettings); }
  function closeSettings() {
    if (isOpen()) return;   // поверх открыта сама проекция — «Назад» относится к ней
    $('hudSetOverlay').classList.remove('open'); bb(false, closeSettings);
    if (STR.settings) STR.settings.resume();
  }
  $('hudSetClose').addEventListener('click', closeSettings);
  $('hudGo').addEventListener('click', open);

  // ---------- Настройка «Экран» ----------
  const OPTS = [['app', 'Пока приложение открыто', 'Экран не гаснет всё время, пока вы в приложении. Так GPS-сигнал не теряется, ничего включать не нужно. Больше расходует батарею.'],
                ['run', 'Только во время заезда', 'Экран не гаснет только при заезде, записи трассы и в режиме проекции. В остальное время гаснет как обычно.']];
  function renderScreen() {
    const m = STR.gps.getScreenMode();
    $('screenBody').innerHTML = '<h4>Когда экран не должен гаснуть</h4>' + OPTS.map(([k, t, d]) => `<label class="tgl-row" data-m="${k}"><div><b>${t}</b><small>${d}</small></div><input type="radio" name="scm" ${m === k ? 'checked' : ''}><i></i></label>`).join('') +
      '<div class="hud-note">Если на вашем телефоне экран всё равно гаснет, увеличьте время автоблокировки в настройках телефона (Экран → Автоблокировка).</div>';
  }
  $('screenBody').addEventListener('click', e => { const r = e.target.closest('[data-m]'); if (!r) return; e.preventDefault(); STR.gps.setScreenMode(r.dataset.m); renderScreen(); });
  function openScreen() { renderScreen(); $('screenOverlay').classList.add('open'); bb(true, closeScreen); }
  function closeScreen() { $('screenOverlay').classList.remove('open'); bb(false, closeScreen); if (STR.settings) STR.settings.resume(); }
  $('screenClose').addEventListener('click', closeScreen);

  return { open, close, auto, isOpen, openSettings, openScreen, cfg: () => Object.assign({}, cfg) };
})();
