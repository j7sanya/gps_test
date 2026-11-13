// ============================================================
// profile.js — окно «👤 Профиль»: аватар, ник, свой номер (ID), статус, итоги,
// «Мой гараж» (пока пустой) и личная статистика.
// Данные: STR.api (профиль с сервера + история заездов на этом телефоне).
// ============================================================
STR.profile = (function () {
  const U = STR.u, $ = U.$;
  const isOpen = () => $('profileOverlay').classList.contains('open');
  const el = (cls, text, tag) => { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  let viewing = null;   // null — ваш профиль; иначе { num, nick, data } — профиль другого игрока

  // BackButton: если профиль открыт поверх окна «Рекорды», «Назад» закрывает только профиль
  function hookBack() {
    try { STR.tg.BackButton.offClick(STR.track.back); } catch (e) {}
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(close); } catch (e) {}
  }

  function open() {
    viewing = null;
    render();
    $('profileOverlay').classList.add('open');
    hookBack();
    // подтягиваем профиль и таблицы с сервера, затем перерисовываем
    Promise.all([STR.api.loadMe(), STR.api.loadBoard()]).then(() => { if (isOpen() && !viewing && !editing) render(); });
  }

  // Профиль другого игрока (открывается по нику в «Рекордах»)
  function openOther(num, nick) {
    viewing = { num, nick, data: null, loaded: false };
    editing = false;
    render();
    $('profileOverlay').classList.add('open');
    hookBack();
    const mine = viewing;
    Promise.all([STR.api.loadPlayer(num), STR.api.loadBoard()]).then(([data]) => {
      if (viewing !== mine || !isOpen()) return;
      mine.data = data; mine.loaded = true;
      render();
    });
  }

  function close() {
    $('profileOverlay').classList.remove('open');
    viewing = null;
    try { STR.tg.BackButton.offClick(close); } catch (e) {}
    // вернулись в «Рекорды»: «Назад» снова управляет им
    if (STR.track && STR.track.isOpen()) { try { STR.tg.BackButton.onClick(STR.track.back); } catch (e) {} }
    else { try { STR.tg.BackButton.hide(); } catch (e) {} }
  }

  let editing = false;

  function render() {
    if (viewing) return renderOther();
    const box = $('profileBody'); box.textContent = '';
    const me = STR.api.getMe();
    const nick = me && me.nick;

    // ----- Шапка: аватар, ник, ID, статус -----
    const top = el('pf-top');
    const ava = el('pf-ava');
    const fallback = () => { ava.textContent = (nick || '?')[0].toUpperCase(); };
    if (me && me.avatar_url) {                  // аватар, который вы выбрали в боте (/avatar)
      const img = document.createElement('img');
      img.src = me.avatar_url; img.alt = '';
      img.onerror = () => { img.remove(); fallback(); };
      ava.appendChild(img);
    } else fallback();                          // без аватара: первая буква ника

    const info = el('pf-info');
    info.appendChild(el('pf-nick', nick || 'Без ника'));
    info.appendChild(el('pf-id', me && me.num ? 'ID: ' + me.num : (nick ? 'ID: —' : 'Профиль не загружен')));
    info.appendChild(bioRow());
    if (!nick && STR.api.getMeError()) info.appendChild(el('pf-id', 'Причина: ' + STR.api.getMeError()));
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

  // ----- Чужой профиль: только публичное (ник, номер, аватар, статус и результаты в таблицах) -----
  function renderOther() {
    const box = $('profileBody'); box.textContent = '';
    const v = viewing, d = v.data;
    const nick = (d && d.nick) || v.nick || 'Игрок';

    const top = el('pf-top');
    const ava = el('pf-ava');
    const fallback = () => { ava.textContent = nick[0].toUpperCase(); };
    if (d && d.avatar_url) {
      const img = document.createElement('img');
      img.src = d.avatar_url; img.alt = '';
      img.onerror = () => { img.remove(); fallback(); };
      ava.appendChild(img);
    } else fallback();

    const info = el('pf-info');
    info.appendChild(el('pf-nick', nick));
    info.appendChild(el('pf-id', d && d.num ? 'ID: ' + d.num : (v.loaded ? 'ID: —' : 'Загружаю…')));
    const bio = el('pf-bio');
    if (d && d.bio) bio.appendChild(el('', d.bio, 'span'));
    info.appendChild(bio);
    top.append(ava, info);
    box.appendChild(top);

    const results = STR.api.getPlayerResults(v.num);
    const firsts = results.filter(r => r.rank === 1).length;
    const tiles = el('pf-tiles');
    [['🏆', results.length, 'Рекордов'], ['🥇', firsts, 'Первых мест'], ['🗺️', STR.api.countRoutesBy(nick), 'Своих трасс']].forEach(([ic, n, label]) => {
      const t = el('pf-tile'); t.appendChild(el('', ic, 'i')); t.appendChild(el('', String(n), 'b')); t.appendChild(el('', label, 'span'));
      tiles.appendChild(t);
    });
    box.appendChild(tiles);

    const garage = el('pf-card pf-garage');
    garage.appendChild(el('ico', '🚗'));
    const gt = el(); gt.appendChild(el('', 'Гараж', 'b')); gt.appendChild(el('', 'Здесь будут автомобили игрока. Скоро!', 'p'));
    garage.appendChild(gt);
    box.appendChild(garage);

    // Результаты на трассах
    const card = el('pf-card');
    card.appendChild(el('', '🏁 Результаты на трассах', 'h3'));
    if (!results.length) card.appendChild(el('pf-id', v.loaded ? 'Пока нет рекордов.' : 'Загружаю…'));
    results.forEach(r => {
      const row = el('pf-row');
      row.appendChild(el('', r.routeName + (r.mode === 'stand' ? ' · 🚦 с места' : ' · 🏁 с хода'), 'span'));
      const b = el('', U.fmtPrecise(r.time), 'b');
      b.appendChild(el('', `  #${r.rank} из ${r.total}`, 'small'));
      row.appendChild(b);
      card.appendChild(row);
    });
    box.appendChild(card);
    box.appendChild(el('pf-free'));
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

  return { open, openOther, close };
})();
