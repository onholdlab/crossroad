/* 十字路口求生:被任何路人擦撞就結束,比誰撐得久。 */
(function () {
  'use strict';
  var CR = window.CR, el = CR.el;

  var elapsed = 0, redCount = 0, crashAt = 0, best = 0;
  try { best = parseFloat(localStorage.getItem('scramble-best')) || 0; } catch (e) {}
  function diff() { return Math.min(1, elapsed / 160); }

  var M = {
    title: '十字路口求生', short: '求生',
    hint: 'WASD 或方向鍵移動 · 手機請在畫面上拖曳',
    SPEED: 5.4, ACCEL: 36, HIT_R: 0.56, MAX_PEDS: 120,
    coast: false, startOnMove: true,
    startId: 'sStart', overId: 'sOver', startBtnId: 'sStartBtn',
    html:
      '<div class="overlay" id="sStart" hidden><div class="panel">' +
        '<h1>十字路口求生</h1>' +
        '<p>每個人都想撞你,快躲過別人!</p>' +
        '<ul class="rules">' +
          '<li><i style="background:var(--player)"></i><span>黃色的小人是你。被任何路人擦撞,遊戲立刻結束。</span></li>' +
          '<li><i style="background:var(--go)"></i><span>綠燈 15 秒,人潮從四面八方湧入,越走越快。</span></li>' +
          '<li><i style="background:var(--stop)"></i><span>紅燈 3 秒是休息時間,路口內的人會離開,其他人停在路邊等。</span></li>' +
        '</ul>' +
        '<div class="field"><label class="label" for="sNick">暱稱(排行榜上顯示)</label>' +
          '<input id="sNick" class="nick" maxlength="12" autocomplete="off" spellcheck="false"></div>' +
        '<button class="btn" id="sStartBtn" type="button">開始</button>' +
        '<section class="board"><div class="label">排行榜</div><ol id="sBoardMenu"></ol></section>' +
      '</div></div>' +
      '<div class="overlay" id="sOver" hidden><div class="panel">' +
        '<h1 class="bad">被撞到了</h1>' +
        '<div><div class="label">你堅持了</div><div class="big"><span id="sFinal">0.0</span><small>秒</small></div></div>' +
        '<span class="tag" id="sNewBest" hidden>新紀錄</span>' +
        '<div class="stats"><span>撐過紅燈<b id="sRed">0</b>次</span><span>最佳<b id="sBest">0.0</b>秒</span></div>' +
        '<p class="small" id="sUpMsg"></p>' +
        '<button class="btn" id="sAgain" type="button">再來一次</button>' +
        '<section class="board"><div class="label">排行榜</div><ol id="sBoardOver"></ol></section>' +
      '</div></div>'
  };

  /* ───────── 排行榜(Supabase,js/board.js) ───────── */
  var boardRes = null;
  function fmt(v) { return Number(v).toFixed(1); }
  function renderBoards() {
    CR.board.render(el('sBoardMenu'), boardRes, fmt);
    CR.board.render(el('sBoardOver'), boardRes, fmt);
  }
  function refreshBoard() {
    return CR.board.load('survive').then(function (r) { boardRes = r; renderBoards(); return r; });
  }

  function addPlayer() { CR.makePlayer(0, 4, { css: '#ffd23f', num: 0xffd23f, glow: 0.55 }); }

  M.init = function () {
    el('sStartBtn').addEventListener('click', M.start);
    el('sAgain').addEventListener('click', M.start);
    var nick = el('sNick');
    nick.value = CR.board.getNick();
    nick.addEventListener('input', function () { CR.board.setNick(nick.value); });
    renderBoards();
  };

  M.enter = function () {
    elapsed = 0; redCount = 0;
    addPlayer();
    el('hud').classList.remove('idle');
    el('tLabel').textContent = '存活時間';
    el('t').textContent = '0.0';
    el('sBest').textContent = best.toFixed(1);
    el('sNick').value = CR.board.getNick();
    refreshBoard();
  };

  M.start = function () {
    CR.initAudio();
    CR.clearPeds(); CR.removePlayers();
    elapsed = 0; redCount = 0;
    CR.resetRound(0.6);
    addPlayer();
    for (var i = 0; i < 9; i++) CR.spawnPed(true);
    CR.buildSticks();
    CR.state = 'play';
    M.overShown = false;
    el('sStart').hidden = true;
    el('sOver').hidden = true;
    el('hint').style.opacity = 1;
    CR.later(function () { el('hint').style.opacity = 0; }, 6000);
  };

  M.pedSpeed = function (advance) {
    var rnd = CR.rnd, d = diff(), sp, kind = null;
    /* 一分鐘後:有人開始走曲線。曲線種類(左弧/右弧/蛇行)與速度(慢/中/快)隨機組合 */
    if (!advance && CR.state === 'play' && elapsed >= 60 && Math.random() < Math.min(0.55, 0.3 + (elapsed - 60) / 300)) {
      kind = CR.pick(['arcL', 'arcR', 'weave']);
    }
    if (kind) sp = Math.min(CR.pick([rnd(1.3, 2.0), rnd(2.4, 3.4), rnd(4.0, 4.9)]) * (1 + 0.2 * d), 5.2);
    else if (Math.random() < 0.14 + 0.1 * d) sp = rnd(4.2, 5.2) * (1 + 0.08 * d);
    else sp = Math.min(rnd(1.5, 3.2) * (1 + 0.5 * d), 5.0);
    return { sp: sp, kind: kind, gold: false };
  };
  M.spawnGap = function () {
    var d = CR.state === 'play' || CR.state === 'menu' ? diff() : 0;
    return (1.15 - 0.85 * d) * (CR.state === 'menu' ? 0.9 : 1);
  };
  /* 撞到後的慢動作 */
  M.pedTimeScale = function () { return CR.state === 'over' ? 0.22 : 1; };

  M.tick = function (dt) { elapsed += dt; };
  M.onRed = function () { redCount++; };

  M.touch = function () {
    CR.state = 'over';
    crashAt = performance.now();
    CR.shake = 1;
    var f = el('flash');
    f.style.transition = 'none'; f.style.opacity = 0.45;
    requestAnimationFrame(function () { f.style.transition = 'opacity 0.5s'; f.style.opacity = 0; });
    CR.tone(190, 0.55, 'sawtooth', 0.12, 0, 40);
    var isBest = elapsed > best;
    if (isBest) {
      best = elapsed;
      try { localStorage.setItem('scramble-best', String(best)); } catch (e) {}
    }
    el('sFinal').textContent = elapsed.toFixed(1);
    el('sRed').textContent = String(redCount);
    el('sBest').textContent = best.toFixed(1);
    el('sNewBest').hidden = !isBest || elapsed < 1;
    var up = el('sUpMsg'), score = Math.round(elapsed * 10) / 10;
    if (score < 1) { up.textContent = '撐過 1 秒以上才會記入排行榜。'; return; }
    up.textContent = '上傳成績中…';
    CR.board.submit('survive', el('sNick').value, score).then(function (r) {
      if (!r.ok) { up.textContent = '目前連不上排行榜。'; return; }
      return refreshBoard().then(function (res) {
        var pos = 0;
        if (res && res.ok) res.rows.forEach(function (x, i) { if (x.me && !pos) pos = i + 1; });
        up.textContent = pos ? '你在排行榜第 ' + pos + ' 名。' : '這次還沒擠進前 ' + CR.board.SPOTS + ' 名。';
      });
    });
  };

  M.post = function () {
    if (CR.state !== 'over') return;
    var fall = Math.min(1, (performance.now() - crashAt) / 350), p = CR.players[0];
    p.fig.rotation.x = -fall * 1.45;
    p.fig.position.y = fall * 0.28;
    if ((performance.now() - crashAt) / 1000 > 0.9 && !M.overShown) {
      M.overShown = true;
      el('sOver').hidden = false;
      try { el('sAgain').focus({ preventScroll: true }); } catch (e) {}
    }
  };

  M.hud = function () { el('t').textContent = elapsed.toFixed(1); };

  CR.register('survive', M);
})();
