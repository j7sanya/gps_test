// ============================================================
// profile.js — окно «👤 Профиль»: аватар, ник, свой номер (ID), статус, итоги,
// «Мой гараж» (пока пустой) и личная статистика.
// Данные: STR.api (профиль с сервера + история заездов на этом телефоне).
// ============================================================
STR.profile = (function () {
  const U = STR.u, $ = U.$;
  const isOpen = () => $('profileOverlay').classList.contains('open');
  const el = (cls, text, tag) => { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  function open() {
    render();
    $('profileOverlay').classList.add('open');
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(close); } catch (e) {}
    // подтягиваем профиль и таблицы с сервера, затем перерисовываем
    Promise.all([STR.api.loadMe(), STR.api.loadBoard()]).then(() => { if (isOpen() && !editing) render(); });
  }
  function close() {
    $('profileOverlay').classList.remove('open');
    try { STR.tg.BackButton.offClick(close); STR.tg.BackButton.hide(); } catch (e) {}
  }

  let editing = false;

  function render() {
    const box = $('profileBody'); box.textContent = '';
    const tgUser = (STR.tg && STR.tg.initDataUnsafe && STR.tg.initDataUnsafe.user) || null;
    const me = STR.api.getMe();
    const nick = me && me.nick;

    // ----- Шапка: аватар, ник, ID, статус -----
    const top = el('pf-top');
    const ava = el('pf-ava');
    if (tgUser && tgUser.photo_url) {          // фото берём из Telegram, на сервер не сохраняем
      const img = document.createElement('img');
      img.src = tgUser.photo_url; img.alt = '';
      img.onerror = () => { ava.textContent = (nick || '?')[0].toUpperCase(); };
      ava.appendChild(img);
    } else ava.textContent = (nick || '?')[0].toUpperCase();

    const info = el('pf-info');
    info.appendChild(el('pf-nick', nick || 'Без ника'));
    info.appendChild(el('pf-id', me && me.num ? 'ID: ' + me.num : (nick ? 'ID: —' : 'Задайте ник: напишите боту /start')));
    info.appendChild(bioRow());
    top.append(ava, info);
    box.appendChild(top);

    // ----- Три плитки -----
    const st = STR.api.getStats();
    const tiles = el('pf-tiles');
    [['🏁', st.runs, 'Заездов'], ['🏆', st.records, 'Рекордов'], ['🥇', STR.api.getFirstPlaces(), 'Первых мест']].forEach(([ic, n, label]) => {
      const t = el('pf-tile'); t.appendChild(el('', ic, 'i')); t.appendChild(el('', String(n), 'b')); t.appendChild(el('', label, 'span'));
      tiles.appendChild(t);
    });
    box.appendChild(tiles);

    // ----- Мой гараж (пока пусто) -----
    const garage = el('pf-card pf-garage');
    garage.appendChild(el('ico', '🚗'));
    const gt = el(); gt.appendChild(el('', 'Мой гараж', 'b')); gt.appendChild(el('', 'Здесь появятся ваши автомобили. Скоро!', 'p'));
    garage.appendChild(gt);
    box.appendChild(garage);

    // ----- Личная статистика -----
    const stats = el('pf-card');
    stats.appendChild(el('', '📊 Личная статистика', 'h3'));
    const row = (label, value, unit) => {
      const r = el('pf-row'); r.appendChild(el('', label, 'span'));
      const b = el('', value, 'b'); if (unit) b.appendChild(el('', ' ' + unit, 'small'));
      r.appendChild(b); stats.appendChild(r);
    };
    row('Средняя скорость', st.runs ? String(Math.round(st.avgKmh)) : '—', st.runs ? 'км/ч' : '');
    row('Максимальная скорость', st.runs ? String(Math.round(st.maxKmh)) : '—', st.runs ? 'км/ч' : '');
    row('Лучшая средняя на трассе', st.runs ? String(Math.round(st.bestAvg)) : '—', st.runs ? 'км/ч' : '');
    row('Общий пробег в заездах', st.km.toFixed(1), 'км');
    box.appendChild(stats);

    box.appendChild(el('pf-free'));   // свободное место под будущий рейтинг
  }

  // Строка статуса с карандашом (редактирование на месте)
  function bioRow() {
    const wrap = el('pf-bio');
    const text = STR.api.getBio();
    if (editing) {
      const input = document.createElement('input');
      input.maxLength = 60; input.value = text; input.placeholder = 'Ваш статус';
      const ok = el('', '✓', 'button');
      const done = async save => {
        if (!editing) return;
        editing = false;
        if (save) await STR.api.saveBio(input.value);
        if (isOpen()) render();
      };
      ok.onclick = () => done(true);
      input.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      wrap.append(input, ok);
      setTimeout(() => input.focus(), 0);
    } else {
      wrap.appendChild(el(text ? '' : 'none', text || 'Добавьте статус', 'span'));
      const pen = el('', '✎', 'button'); pen.title = 'Изменить статус';
      pen.onclick = () => { editing = true; render(); };
      wrap.appendChild(pen);
    }
    return wrap;
  }

  return { open, close };
})();
