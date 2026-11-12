// ============================================================
// settings.js — окно «Настройки» (Спидометр, Светофор) и список «Трассы рядом».
// ============================================================
STR.settings = (function () {
  const U = STR.u, $ = U.$;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDist = m => m < 1000 ? Math.round(m) + ' м' : (m / 1000).toFixed(1) + ' км';
  const bb = (on, fn) => { try { if (on) { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(fn); } else { STR.tg.BackButton.offClick(fn); STR.tg.BackButton.hide(); } } catch (e) {} };

  // ---------- Главное окно настроек ----------
  const isOpen = () => $('settingsOverlay').classList.contains('open');
  function open() { $('settingsOverlay').classList.add('open'); bb(true, back); }
  function back() { $('settingsOverlay').classList.remove('open'); bb(false, back); }
  // Дочернее окно (спидометр / светофор) закрылось: снова вешаем «Назад» на настройки
  function resume() { if (isOpen()) bb(true, back); }
  function openChild(fn) { bb(false, back); fn(); }

  $('settingsClose').addEventListener('click', back);
  $('setSpeedo').addEventListener('click', () => openChild(STR.speedo.open));
  $('setLights').addEventListener('click', () => openChild(openLights));

  // ---------- Светофор: стиль отсчёта и переключатели ----------
  const lightsOpen = () => $('lightsOverlay').classList.contains('open');
  function renderLights() {
    const cfg = STR.launch.cfg(), box = $('lgStyles'); box.innerHTML = '';
    STR.launch.styles.forEach(([key, title]) => {
      const c = document.createElement('div');
      c.className = 'sp-card lg-card' + (cfg.style === key ? ' sel' : '');
      c.innerHTML = `<div class="sp-cap"><b>${title}</b><span>${cfg.style === key ? '✓ выбран' : ''}</span></div><div class="lg-prev launch-prev"></div><div class="lg-hint">${STR.launch.hints[key]}</div>`;
      STR.launch.drawPreview(c.querySelector('.lg-prev'), key);
      c.addEventListener('click', () => { STR.launch.set('style', key); renderLights(); });
      box.appendChild(c);
    });
    const tg = $('lgToggles'); tg.innerHTML = '';
    [['suggest', 'Предлагать старт рядом', 'Подсказка, когда вы стоите у старта'], ['sound', 'Звук сигнала', 'Короткие сигналы при отсчёте'], ['haptic', 'Вибрация', 'Отклик на каждый огонь']].forEach(([k, t, d]) => {
      const r = document.createElement('label');
      r.className = 'tgl-row';
      r.innerHTML = `<div><b>${t}</b><small>${d}</small></div><input type="checkbox" ${cfg[k] ? 'checked' : ''}><i></i>`;
      r.querySelector('input').addEventListener('change', e => STR.launch.set(k, e.target.checked));
      tg.appendChild(r);
    });
  }
  function openLights() { renderLights(); $('lightsOverlay').classList.add('open'); bb(true, closeLights); }
  function closeLights() { $('lightsOverlay').classList.remove('open'); bb(false, closeLights); resume(); }
  $('lightsClose').addEventListener('click', closeLights);
  $('lgDemo').addEventListener('click', () => STR.launch.demo());

  // ---------- «Трассы рядом» ----------
  const nearOpen = () => $('nearOverlay').classList.contains('open');
  let nearTimer = null;
  function renderNear() {
    const list = $('nearList'), q = $('nearSearch').value.trim().toLowerCase();
    const p = STR.gps.lastPos();
    let rows = STR.run.getPrepared().map(pr => ({ pr, d: p ? Math.hypot(...pr.toXY(p).map((v, i) => v - pr.start.c[i])) : null }));
    if (q) rows = rows.filter(x => x.pr.name.toLowerCase().includes(q));
    rows.sort((a, b) => (a.d === null || b.d === null) ? a.pr.name.localeCompare(b.pr.name) : a.d - b.d);
    $('nearHint').textContent = p ? '' : 'Определяю ваше местоположение…';
    list.innerHTML = '';
    if (!rows.length) { list.innerHTML = '<div class="none">Ничего не найдено.</div>'; return; }
    rows.forEach(({ pr, d }) => {
      const rec = STR.api.getRecord(pr.id);
      const el = document.createElement('div');
      el.className = 'route-card near-card';
      el.innerHTML = `<div class="nc-top"><div class="name">${esc(pr.name)}</div>${d !== null ? `<span class="nc-d${d <= 60 ? ' close' : ''}">${fmtDist(d)}</span>` : ''}</div>
        <div class="meta">${(pr.distance / 1000).toFixed(1)} км · ${rec ? 'ваш рекорд ' + U.fmtPrecise(rec.time) : 'вы тут ещё не ездили'}</div>`;
      el.addEventListener('click', () => { closeNear(); STR.launch.choose(pr.id, d === null || d > 300); });
      list.appendChild(el);
    });
  }
  function openNear() {
    $('nearSearch').value = '';
    $('nearOverlay').classList.add('open'); bb(true, closeNear);
    STR.gps.startWatching();
    renderNear();
    clearInterval(nearTimer); nearTimer = setInterval(() => { if (document.activeElement !== $('nearSearch')) renderNear(); }, 2000);
  }
  function closeNear() { $('nearOverlay').classList.remove('open'); bb(false, closeNear); clearInterval(nearTimer); }
  $('nearClose').addEventListener('click', closeNear);
  $('nearSearch').addEventListener('input', renderNear);

  return { open, back, resume, isOpen, openNear, closeNear, openLights };
})();
