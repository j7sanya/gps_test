// ============================================================
// records.js — окно «🏆 Рекорды»: список трасс -> таблица рекордов выбранной трассы
// с вашим местом. Данные: STR.api (общие рекорды с сервера + ваш личный рекорд с телефона).
// ============================================================
STR.records = (function () {
  const U = STR.u, $ = U.$;
  let current = null;   // трасса, чья таблица сейчас открыта (null — показан список трасс)

  const el = (cls, text, tag) => { const e = document.createElement(tag || 'div'); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const isOpen = () => $('recordsOverlay').classList.contains('open');

  // Ник-ссылка: нажатие открывает профиль игрока (свой ник — ваш профиль)
  function nickLink(x, tag) {
    const e = el('link', x.name, tag || 'span');
    e.onclick = ev => {
      ev.stopPropagation();
      if (x.mine) STR.profile.open();
      else if (x.num != null) STR.profile.openOther(x.num, x.name);
    };
    return e;
  }

  function open() {
    current = null;
    render();
    $('recordsOverlay').classList.add('open');
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(back); } catch (e) {}
    STR.api.loadBoard().then(ok => { if (ok && isOpen()) render(); });   // обновляем с сервера
  }
  function close() {
    $('recordsOverlay').classList.remove('open');
    try { STR.tg.BackButton.offClick(back); STR.tg.BackButton.hide(); } catch (e) {}
  }
  // «Назад»: из таблицы — к списку трасс, из списка — закрыть окно
  function back() {
    if (current) { current = null; render(); } else close();
  }

  function render() { current ? renderTrack(current) : renderList(); }

  // ----- Список трасс -----
  function renderList() {
    $('recTitle').textContent = '🏆 Рекорды';
    const box = $('recordsList'); box.textContent = '';
    const list = STR.api.getRoutes();
    if (!list.length) { box.appendChild(el('empty', 'Трасс пока нет.')); return; }
    if (!STR.api.serverOn()) box.appendChild(el('empty', 'Общие рекорды пока не подключены. Показаны только ваши результаты.'));

    list.forEach(r => {
      const card = el('route-card rec-card');
      const grow = el('grow');
      grow.appendChild(el('name', r.name));
      const total = STR.api.getBoard(r.id).length;
      const best = STR.api.getBest(r.id);
      const mine = STR.api.getRecord(r.id);
      grow.appendChild(el('meta', `📏 ${U.fmtKm(r.distance)}` + (total ? ` · участников: ${total}` : '')));
      const recLine = el('rec' + (best || mine ? ' has' : ''));
      if (best) { recLine.append('👑 ', nickLink(best), ` · ${U.fmtPrecise(best.time)}`); }
      else recLine.textContent = mine ? `🏆 Ваш: ${U.fmtPrecise(mine.time)}` : 'Рекордов пока нет';
      grow.appendChild(recLine);
      card.appendChild(grow);
      const rank = STR.api.getMyRank(r.id);
      if (rank) card.appendChild(el('rank me', `#${rank}`));
      card.appendChild(el('chev', '›'));
      card.onclick = () => { current = r; render(); $('recordsList').scrollTop = 0; };
      box.appendChild(card);
    });
  }

  // ----- Таблица рекордов одной трассы -----
  function renderTrack(r) {
    $('recTitle').textContent = r.name;
    const box = $('recordsList'); box.textContent = '';
    const rows = STR.api.getBoard(r.id);
    const mine = STR.api.getRecord(r.id);
    const rank = STR.api.getMyRank(r.id);

    // Карточка «ваше место»
    const hero = el('rec-hero');
    if (rank) {
      hero.appendChild(el('big', `#${rank} из ${rows.length}`));
      const me = rows[rank - 1];
      hero.appendChild(el('sub', `Ваш рекорд: ${U.fmtPrecise(me.time)} · ${Math.round(me.avgKmh)} км/ч средняя` +
        (rank > 1 ? `\nДо лидера: +${(me.time - rows[0].time).toFixed(2)} с` : '\nВы лидер! 👑')));
    } else if (mine) {
      hero.appendChild(el('big', U.fmtPrecise(mine.time)));
      hero.appendChild(el('sub', `Ваш рекорд на этом телефоне · ${Math.round(mine.avgKmh)} км/ч средняя` +
        (STR.api.serverOn() && !String(r.id).startsWith('local-') ? '\nВ общую таблицу попадёт после следующего рекорда.' : '\nСвои трассы хранятся только на вашем телефоне.')));
    } else {
      hero.appendChild(el('big', 'Вас здесь нет'));
      hero.appendChild(el('sub', 'Проедьте трассу, чтобы попасть в таблицу.'));
    }
    box.appendChild(hero);

    if (!rows.length) {
      box.appendChild(el('empty', STR.api.serverOn() ? 'Рекордов на этой трассе пока нет.\nСтаньте первым!' : 'Таблица общих рекордов появится после подключения сервера.'));
      return;
    }
    rows.forEach((x, i) => {
      const row = el('lb-row' + (i < 3 ? ' p' + (i + 1) : '') + (x.mine ? ' me' : ''));
      row.appendChild(el('pos', i === 0 ? '👑' : String(i + 1)));
      const who = el('who');
      const nm = el('', undefined, 'b'); nm.appendChild(nickLink(x)); if (x.mine) nm.append(' (вы)');
      who.appendChild(nm);
      who.appendChild(el('', `${Math.round(x.avgKmh)} км/ч` + (x.date ? ` · ${U.fmtDate(x.date)}` : ''), 'span'));
      row.appendChild(who);
      row.appendChild(el('t', U.fmtPrecise(x.time)));
      box.appendChild(row);
    });
  }

  return { open, close, back, isOpen };
})();
