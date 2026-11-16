// ============================================================
// menu.js — боковое меню (шторка справа налево): профиль, трассы, рекорды.
// Открывается кнопкой «три полоски» справа вверху. Закрывается нажатием на затемнение,
// свайпом вправо, кнопкой «Назад» в Telegram или выбором пункта.
// ============================================================
STR.menu = (function () {
  const C = STR.config, U = STR.u, $ = U.$;
  const isOpen = () => $('drawer').classList.contains('open');

  // Шапка меню: аватар, ник, ID (данные профиля подгружаются с сервера)
  function fillProfile() {
    const me = STR.api.getMe();
    const nick = me && me.nick;
    $('drNick').textContent = nick || 'Профиль';
    $('drId').textContent = me && me.num ? 'ID: ' + me.num : (STR.api.serverOn() ? '' : 'Без сервера');
    const ava = $('drAva'); ava.textContent = '';
    const letter = () => { ava.textContent = (nick || '?')[0].toUpperCase(); };
    if (me && me.avatar_url) {
      const img = document.createElement('img');
      img.src = me.avatar_url; img.alt = '';
      img.onerror = () => { img.remove(); letter(); };
      ava.appendChild(img);
    } else letter();
  }

  function open() {
    fillProfile();
    $('drVer').textContent = 'STRace · v' + C.VERSION;
    $('drawer').classList.add('open');
    try { STR.tg.BackButton.show(); STR.tg.BackButton.onClick(close); } catch (e) {}
    STR.api.loadMe().then(() => { if (isOpen()) fillProfile(); });
  }

  function close() {
    $('drawer').classList.remove('open');
    try { STR.tg.BackButton.offClick(close); STR.tg.BackButton.hide(); } catch (e) {}
  }

  // «Поддержка»: открываем бота поддержки. В ссылку кладём версию и платформу, чтобы вы видели их в обращении
  function openSupport() {
    const bot = (C.SUPPORT_BOT || '').replace(/^@/, '');
    if (!bot) { U.setStatus('Поддержка скоро появится'); return; }
    const plat = String((STR.tg && STR.tg.platform) || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);
    const url = 'https://t.me/' + bot + '?start=app_v' + C.VERSION + (plat ? '_' + plat : '');
    try { STR.tg.openTelegramLink(url); } catch (e) { window.open(url, '_blank'); }
  }

  // Пункт меню: закрываем шторку и открываем нужное окно
  function go(where) {
    close();
    if (where === 'routes') STR.routes.open();
    else if (where === 'profile') STR.profile.open();
    else if (where === 'settings') STR.settings.open();
    else if (where === 'history') STR.history.open();
    else if (where === 'help') STR.welcome.open();
    else if (where === 'support') openSupport();
    else if (where === 'hud') STR.hud.openSettings();   // проекция: настройки и кнопка «Включить» в одном окне
  }

  $('menuBtn').addEventListener('click', open);
  $('drawerDim').addEventListener('click', close);
  $('drProf').addEventListener('click', () => go('profile'));
  document.querySelectorAll('#drawerPanel .dr-item').forEach(el => el.addEventListener('click', () => go(el.dataset.go)));

  // Свайп вправо по шторке закрывает её
  let x0 = null;
  const panel = $('drawerPanel');
  panel.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  panel.addEventListener('touchmove', e => { if (x0 !== null && e.touches[0].clientX - x0 > 70) { x0 = null; close(); } }, { passive: true });
  panel.addEventListener('touchend', () => { x0 = null; });

  return { open, close, isOpen };
})();
