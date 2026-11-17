// ============================================================
// share.js — «Поделиться»: карточка заезда для соцсетей и ссылки на заезд / профиль.
//
// Окно «Поделиться» открывается из трёх мест: итог заезда (кнопка под секундомером),
// окно заезда в «Истории», и профиль (ссылкой). Картинку рисует js/cards.js, QR — js/qr.js.
//
// Что умеет:
//   • Сохранить в галерею — меню телефона «Сохранить изображение» (если меню нет — картинка на весь экран, держите палец → «Сохранить»)
//   • Отправить в Instagram / VK / другое — то же меню телефона (там есть Instagram «Истории», VK, Telegram…)
//   • В историю Telegram — нужна серверная функция (server/api.ts, действие share_card)
//   • В чат с ссылкой — карточка уходит сообщением с кнопками «Открыть заезд» и «Профиль игрока»
//     (нужна та же серверная функция; без неё отправляется обычная ссылка)
//
// Ссылки в карточке и в сообщениях:  https://t.me/<бот>?start=r_<трасса>__p<номер игрока>  (заезд)
//                                   https://t.me/<бот>?start=p_<номер игрока>             (профиль)
// Бот отвечает на такую ссылку кнопкой «Открыть», приложение читает параметр и открывает трассу или профиль.
// ============================================================
STR.share = (function () {
  const C = STR.config, U = STR.u, $ = U.$, tg = STR.tg;
  const KEY = 'strace_share_v1', BOT_KEY = 'strace_bot_v1';
  const CARD = [['dark', 'Тёмная'], ['red', 'Красная'], ['map', 'Трасса']];
  const PNG = [['center', 'По центру'], ['racing', 'Гоночный'], ['minimal', 'Минимал']];

  const rd = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // Выбор человека запоминаем: fmt s — 9:16 (история), q — 1:1 (пост); type card — готовая карточка, png — прозрачный слой
  let S = Object.assign({ fmt: 's', type: 'card', card: 'dark', png: 'center', nick: true }, rd(KEY) || {});
  if (!CARD.some(x => x[0] === S.card)) S.card = 'dark';
  if (!PNG.some(x => x[0] === S.png)) S.png = 'center';
  let src = null;          // что отправляем: { meta } — заезд из STR.api.getRuns()
  let busy = false;
  let botName = String(C.BOT_USERNAME || rd(BOT_KEY) || '').replace(/^@/, '');

  const isOpen = () => $('shareOverlay').classList.contains('open');
  const bb = (on, fn) => { try { if (on) { tg.BackButton.show(); tg.BackButton.onClick(fn); } else tg.BackButton.offClick(fn); } catch (e) {} };
  const enc = encodeURIComponent;
  const note = t => { $('shNote').textContent = t || ''; };

  // ---------- Имя бота и ссылки ----------
  // Если BOT_USERNAME не вписан в config.js, спрашиваем у сервера (он знает токен бота) и запоминаем на телефоне
  async function resolveBot() {
    if (botName) return botName;
    const r = await STR.api.callServer({ action: 'bot_info' });
    if (r && r.ok && r.bot) { botName = String(r.bot).replace(/^@/, ''); wr(BOT_KEY, botName); }
    return botName;
  }
  function link(param) {
    if (!botName || !param) return '';
    if (C.LINK_MODE === 'app') return 'https://t.me/' + botName + (C.APP_NAME ? '/' + C.APP_NAME : '') + '?startapp=' + param;
    return 'https://t.me/' + botName + '?start=' + param;
  }
  const profParam = num => (num ? 'p_' + num : '');
  // Заезд на своей (локальной) трассе чужим не открыть: тогда в ссылке только профиль
  function runParam(meta) {
    const me = STR.api.getMe(), id = String(meta.routeId || ''), num = me && me.num;
    if (!id || id.startsWith('local-') || !/^[A-Za-z0-9_-]{1,50}$/.test(id)) return profParam(num);
    return 'r_' + id + (num ? '__p' + num : '');
  }

  // ---------- Данные для картинки ----------
  function buildData() {
    const m = src.meta, me = STR.api.getMe();
    const mode = m.start === 'stand' ? 'stand' : 'roll';
    const route = STR.api.getRoutes().find(r => String(r.id) === String(m.routeId));
    // место показываем, только если именно этот заезд стоит в общей таблице
    const board = STR.api.getBoard(m.routeId, mode);
    const i = board.findIndex(x => x.mine && Math.abs(x.time - m.time) < 0.006);
    return {
      name: m.routeName, time: m.time, avg: m.avgKmh, max: m.maxKmh, dist: m.dist, date: m.date,
      nick: S.nick && me && me.nick ? me.nick : '', rank: i >= 0 ? i + 1 : 0, total: board.length, record: !!m.record,
      lines: route && route.lines && route.lines.length ? route.lines : null,
      link: link(runParam(m)), linkText: botName ? 't.me/' + botName : ''
    };
  }
  const styleNow = () => (S.type === 'png' ? S.png : S.card);
  const caption = () => {
    const m = src.meta, me = STR.api.getMe();
    return (me && me.nick ? me.nick + ' · ' : '') + m.routeName + ' · ' + U.fmtPrecise(m.time) + (m.record ? ' 🏆 рекорд' : '');
  };
  const fileName = () => 'strace_' + String(src.meta.routeName || 'run').replace(/[^A-Za-zА-Яа-я0-9]+/g, '_').slice(0, 24) + '_' + U.fmtPrecise(src.meta.time).replace(/[:.]/g, '-') + '.png';

  // ---------- Окно ----------
  function chips(box, list, cur, onPick) {
    box.textContent = '';
    list.forEach(([k, t]) => {
      const c = document.createElement('div');
      c.className = 'chip' + (k === cur ? ' on' : ''); c.textContent = t;
      c.onclick = () => onPick(k);
      box.appendChild(c);
    });
  }
  function draw() {
    if (!src) return;
    const cv = STR.cards.render(buildData(), styleNow(), S.fmt), c = $('shCanvas');
    c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    $('shPrev').classList.toggle('png', S.type === 'png');
    chips($('shFmt'), [['s', 'История 9:16'], ['q', 'Пост 1:1']], S.fmt, k => { S.fmt = k; wr(KEY, S); draw(); });
    chips($('shType'), [['card', 'Готовая карточка'], ['png', 'PNG без фона']], S.type, k => { S.type = k; wr(KEY, S); draw(); });
    chips($('shStyle'), S.type === 'png' ? PNG : CARD, styleNow(), k => { S[S.type === 'png' ? 'png' : 'card'] = k; wr(KEY, S); draw(); });
    const me = STR.api.getMe();
    $('shNickRow').style.display = me && me.nick ? '' : 'none';
    $('shNick').checked = !!S.nick;
    $('shStory').disabled = $('shChat').disabled = busy;
    $('shHint').textContent = S.type === 'png'
      ? 'Прозрачный слой: наложите его на своё фото или видео в редакторе историй. Сверху лежит картинка без фона.'
      : 'Готовая картинка: выложите в историю или пост без правок.';
  }

  function open(meta) {
    if (!meta) return;
    src = { meta }; note('');
    if (!window.STR.cards) { U.setStatus('Не загрузился модуль карточек. Обновите приложение.'); return; }
    draw();
    $('shareOverlay').classList.add('open');
    bb(true, close);
    // имя бота нужно для ссылки и QR: если его ещё нет, спрашиваем у сервера и перерисовываем
    if (!botName) resolveBot().then(b => { if (b && isOpen()) draw(); });
    STR.api.loadMe().then(() => { if (isOpen()) draw(); });
  }
  function close() {
    $('shViewer').classList.remove('open');
    $('shareOverlay').classList.remove('open');
    bb(false, close);
  }

  // ---------- Картинка -> файл ----------
  const blobOf = (cv, type, q) => new Promise(res => cv.toBlob(res, type || 'image/png', q));
  async function currentFile() {
    const blob = await blobOf($('shCanvas'), 'image/png');
    return blob ? new File([blob], fileName(), { type: 'image/png' }) : null;
  }
  // Меню телефона «Поделиться» (там же «Сохранить изображение», Instagram, VK, Telegram…)
  async function sysShare(file, text) {
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(text ? { files: [file], text } : { files: [file] });
        return true;
      }
    } catch (e) { if (e && e.name === 'AbortError') return true; }   // человек сам закрыл меню — это не ошибка
    return false;
  }
  // Запасной путь: картинка на весь экран, на ней держим палец → «Сохранить в Фото»
  function viewer(file) {
    const old = $('shImg').src; if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
    $('shImg').src = URL.createObjectURL(file);
    $('shViewer').classList.add('open');
  }

  async function onSave() {
    const f = await currentFile(); if (!f) return;
    if (!(await sysShare(f))) { viewer(f); note('Нажмите на картинку и держите палец: «Сохранить в Фото».'); }
  }
  async function onSend() {
    const f = await currentFile(); if (!f) return;
    const lk = link(runParam(src.meta));
    if (!(await sysShare(f, caption() + (lk ? '\n' + lk : '')))) { viewer(f); note('Меню «Поделиться» здесь недоступно: сохраните картинку и выложите из галереи.'); }
  }

  // ---------- Серверные способы: история Telegram и чат ----------
  // Для них картинка должна лежать по ссылке в интернете: отправляем JPEG на сервер, он кладёт её в хранилище
  async function cloudCard(want) {
    const fmt = want === 'story' ? 's' : S.fmt, st = S.type === 'card' ? S.card : 'dark';
    const cv = STR.cards.render(buildData(), st, fmt), url = cv.toDataURL('image/jpeg', 0.9);
    const m = src.meta;
    return STR.api.callServer({
      action: 'share_card', want, image: url.slice(url.indexOf(',') + 1), caption: caption(),
      runLink: link(runParam(m)), profLink: link(profParam((STR.api.getMe() || {}).num))
    });
  }
  const NEED_SERVER = 'Для этого нужно обновить серверную функцию (инструкция в README, шаг «Поделиться»). Пока можно сохранить картинку и выложить из галереи.';

  async function onStory() {
    if (busy) return;
    if (!(tg && tg.shareToStory)) { note('Истории Telegram недоступны в этой версии Telegram. Сохраните картинку и выложите из галереи.'); return; }
    busy = true; draw(); note('Готовлю картинку…');
    const r = await cloudCard('story'); busy = false; draw();
    if (!(r && r.ok && r.url)) { note(r && r.error === 'offline' ? 'Откройте приложение из Telegram, чтобы выложить в историю.' : NEED_SERVER); return; }
    note('');
    const lk = link(runParam(src.meta));
    const opts = { text: caption() };
    if (lk && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.is_premium) opts.widget_link = { url: lk, name: 'STRace' };   // ссылка в истории — только для Premium
    try { tg.shareToStory(r.url, opts); } catch (e) { note('Не удалось открыть редактор истории.'); }
  }

  async function onChat() {
    if (busy) return;
    const lk = link(runParam(src.meta));
    busy = true; draw(); note('Готовлю сообщение…');
    const r = tg && tg.shareMessage ? await cloudCard('chat') : null; busy = false; draw();
    if (r && r.ok && r.id) {
      note('');
      try { tg.shareMessage(r.id, sent => { if (sent) U.setStatus('Отправлено ✅'); }); return; } catch (e) {}
    }
    // Запасной путь: обычная ссылка (в чате она покажется карточкой приложения)
    if (lk && tg && tg.openTelegramLink) {
      note(r && r.error && r.error !== 'offline' ? 'Картинкой пока не получается (нужно обновить серверную функцию), отправляю ссылку.' : '');
      tg.openTelegramLink('https://t.me/share/url?url=' + enc(lk) + '&text=' + enc(caption()));
    } else note(botName ? NEED_SERVER : 'Не знаю имя бота: впишите BOT_USERNAME в js/config.js.');
  }

  // Профиль игрока ссылкой в чат (кнопка в окне «Профиль»)
  async function shareProfile(num, nick) {
    if (!num) { U.setStatus('Профиль ещё не создан: пройдите /start в боте.'); return; }
    await resolveBot();
    const lk = link(profParam(num));
    if (!lk) { U.setStatus('Не знаю имя бота: впишите BOT_USERNAME в js/config.js.'); return; }
    const text = 'Профиль' + (nick ? ' ' + nick : '') + ' в STRace';
    try { tg.openTelegramLink('https://t.me/share/url?url=' + enc(lk) + '&text=' + enc(text)); }
    catch (e) { window.open('https://t.me/share/url?url=' + enc(lk) + '&text=' + enc(text), '_blank'); }
  }

  // ---------- Открытие по ссылке ----------
  // Параметр приходит либо из прямой ссылки Telegram (start_param), либо из кнопки бота (?sp=…)
  function startParam() {
    let p = '';
    try { p = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ''; } catch (e) {}
    if (!p) { try { const q = new URLSearchParams(location.search); p = q.get('sp') || q.get('tgWebAppStartParam') || ''; } catch (e) {} }
    return String(p || '');
  }
  async function handleStart() {
    const p = startParam(); let m;
    if (!p) return;
    if ((m = /^p_(\d{1,9})$/.exec(p))) { STR.profile.openOther(Number(m[1]), ''); return; }
    if ((m = /^r_([A-Za-z0-9_-]+?)(?:__p(\d{1,9}))?$/.exec(p))) {
      const r = STR.api.getRoutes().find(x => String(x.id) === m[1]);
      if (!r) { U.setStatus('Эта трасса недоступна: возможно, её удалили.'); return; }
      STR.routes.openTrack(r);
      if (m[2]) STR.api.loadPlayer(Number(m[2])).then(pl => { if (pl && pl.nick) U.setStatus('Заезд игрока ' + pl.nick); });
    }
  }

  // ---------- Кнопки ----------
  $('shareClose').addEventListener('click', close);
  $('shSave').addEventListener('click', onSave);
  $('shSend').addEventListener('click', onSend);
  $('shStory').addEventListener('click', onStory);
  $('shChat').addEventListener('click', onChat);
  $('shNick').addEventListener('change', e => { S.nick = e.target.checked; wr(KEY, S); draw(); });
  $('shViewerClose').addEventListener('click', () => $('shViewer').classList.remove('open'));

  return { open, close, isOpen, handleStart, shareProfile, startParam };
})();
