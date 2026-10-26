/* 十字路口共用排行榜:成績存在 onholdlab 的 Supabase(scores 表 + leaderboard 檢視)。
   每台裝置一個隨機 id,排行榜每台裝置只取最好的一筆。
   key 是 publishable 公開金鑰,只能新增成績、讀排行榜,放在網頁裡沒有問題。 */
(function () {
  'use strict';
  var CR = window.CR;
  var CFG = {
    url: 'https://zfghylavaxulytlbbxqi.supabase.co',
    key: 'sb_publishable_13fkPXai231g3G0JU4mWhA_G_hctIxL'
  };
  var SPOTS = 11;

  function headers(extra) {
    var h = { 'apikey': CFG.key, 'Content-Type': 'application/json' };
    if (CFG.key.indexOf('sb_') !== 0) h.Authorization = 'Bearer ' + CFG.key;
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function timeout(ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    return { signal: ctl ? ctl.signal : undefined, done: function () { clearTimeout(t); } };
  }

  var device = null;
  function deviceId() {
    if (device) return device;
    try { device = localStorage.getItem('ohl-device'); } catch (e) {}
    if (!device || device.length < 8) {
      device = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      try { localStorage.setItem('ohl-device', device); } catch (e) {}
    }
    return device;
  }

  /* 暱稱:求生與撞人賽共用 */
  function getNick() {
    var n = '';
    try { n = localStorage.getItem('cr-nick') || localStorage.getItem('bump-nick') || ''; } catch (e) {}
    return n || tr('玩家', 'Player') + (100 + ((Math.random() * 900) | 0));
  }
  function setNick(n) { try { localStorage.setItem('cr-nick', String(n).trim()); } catch (e) {} }
  function cleanNick(n) { return (String(n || '').trim() || tr('玩家', 'Player')).slice(0, 12); }

  function load(game) {
    var to = timeout(8000);
    var q = CFG.url + '/rest/v1/leaderboard?select=name,score,device&game=eq.' + game +
      '&order=score.desc,created_at.asc&limit=' + SPOTS;
    return fetch(q, { headers: headers({}), signal: to.signal }).then(function (r) {
      to.done();
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function (rows) {
      return { ok: true, rows: rows.map(function (x) { return { name: x.name, score: Number(x.score) || 0, me: x.device === deviceId() }; }) };
    }, function () { to.done(); return { ok: false, rows: [] }; });
  }

  function submit(game, name, score) {
    var to = timeout(8000);
    return fetch(CFG.url + '/rest/v1/scores', {
      method: 'POST', signal: to.signal,
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ game: game, name: cleanNick(name), score: score, device: deviceId() })
    }).then(function (r) { to.done(); return { ok: r.status === 201 || r.status === 204 }; },
      function () { to.done(); return { ok: false }; });
  }

  /* 把排行榜畫進 <ol>;fmt 把分數轉成要顯示的文字 */
  function render(ol, res, fmt) {
    ol.textContent = '';
    var msg = null;
    if (!res) msg = tr('讀取中…', 'Loading…');
    else if (!res.ok) msg = tr('目前連不上排行榜。', 'Can\'t reach the leaderboard right now.');
    else if (!res.rows.length) msg = tr('還沒有人上榜,成為第一個!', 'No one on the board yet. Be the first!');
    if (msg) {
      var m = document.createElement('li'); m.className = 'msg'; m.textContent = msg; ol.appendChild(m);
      return;
    }
    res.rows.forEach(function (r, i) {
      var li = document.createElement('li');
      if (r.me) li.className = 'me';
      var a = document.createElement('span'); a.textContent = String(i + 1);
      var b = document.createElement('span'); b.textContent = cleanNick(r.name) + (r.me ? tr('(你)', ' (you)') : '');
      var c = document.createElement('b'); c.textContent = fmt(r.score);
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      ol.appendChild(li);
    });
  }

  /* 沒在玩的時候(選單、結算畫面)每 20 秒重抓一次排行榜;切回分頁時也馬上重抓。
     mode 是 CR.modes 裡的模式物件,只在它是目前模式時才抓 */
  function autoRefresh(mode, fn) {
    function idle() { return CR.mode === mode && CR.state !== 'play' && CR.state !== 'countdown' && !document.hidden; }
    setInterval(function () { if (idle()) fn(); }, 20000);
    document.addEventListener('visibilitychange', function () { if (idle()) fn(); });
  }

  CR.board = { autoRefresh: autoRefresh, load: load, submit: submit, render: render, getNick: getNick, setNick: setNick, cleanNick: cleanNick, SPOTS: SPOTS };
})();
