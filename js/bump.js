/* 十字路口撞人賽:60 秒內撞倒最多路人,1~4 人同樂。 */
(function () {
  'use strict';
  var CR = window.CR, el = CR.el;

  /* 排行榜開關:false 時不連線,選單與結算畫面不出現排行榜字樣;本機最高分照常保留 */
  var BOARD_ENABLED = false;

  /* ───────── 撞人賽設定 ───────── */
  var ROUND = 60;        // 一回合秒數
  var COUNTDOWN = 3;     // 開始前倒數秒數
  var PCOL = [
    { name: 'P1', css: '#ffd23f', num: 0xffd23f, label: 'WASD' },
    { name: 'P2', css: '#3ee7ff', num: 0x3ee7ff, label: '方向鍵' },
    { name: 'P3', css: '#ff5fa8', num: 0xff5fa8, label: 'IJKL' },
    { name: 'P4', css: '#ff8a3d', num: 0xff8a3d, label: 'TFGH' }
  ];
  var STARTS = [
    [[0, 4]],
    [[-4, 3], [4, 3]],
    [[-5, 3], [0, 5], [5, 3]],
    [[-4, 3], [4, 3], [-4, -3], [4, -3]]
  ];

  /* 說明用的路人小圖:比例與顏色照遊戲內的人物(腿 #23252e、膚色 #f1c9a5;金色路人身體 #ffc400 並發光) */
  function pedIcon(torso, gold) {
    return '<svg class="ped" viewBox="-4 -2 20 22" aria-hidden="true">' +
      (gold ? '<circle cx="6" cy="9" r="9" fill="#ffc400" opacity="0.35"/>' : '') +
      '<path d="M3.9 13h4.2l.1 5H3.8z" fill="#23252e"/>' +
      '<path d="M3.5 5.2h5l.4 7.8H3.1z" fill="' + torso + '"/>' +
      '<circle cx="6" cy="3.3" r="2" fill="#f1c9a5"/></svg>';
  }

  var M = {
    title: '十字路口撞人賽', short: '撞人賽',
    hint: '撞倒路人得分,金色路人算 3 分',
    hintHtml: '<span class="hi">' + pedIcon('#c9ccd6') + '+1</span><span class="hi">' + pedIcon('#ffc400', true) + '+3</span>',
    SPEED: 5.8, ACCEL: 40, HIT_R: 0.62, MAX_PEDS: 140,
    coast: true, startOnMove: false,
    startId: 'bStart', overId: 'bOver', startBtnId: 'bStartBtn',
    html:
      '<div class="overlay" id="bStart" hidden><div class="panel">' +
        '<h1>十字路口撞人賽</h1>' +
        '<p>60 秒內,撞倒最多路人的人獲勝。</p>' +
        '<ul class="rules">' +
          '<li><i style="background:var(--player)"></i><span>衝向路人就算撞倒,得 1 分。身體發亮的金色路人跑得快,算 3 分。</span></li>' +
          '<li><i style="background:var(--go)"></i><span>綠燈 15 秒人潮湧入,有些人會走曲線,更難撞。</span></li>' +
          '<li><i style="background:var(--stop)"></i><span>紅燈 3 秒大家休息,這段時間撞不到人。</span></li>' +
        '</ul>' +
        '<div class="field"><span class="label">人數</span><div class="seg" id="seg">' +
          '<button type="button" data-n="1">' + (BOARD_ENABLED ? '單人 · 上排行榜' : '單人') + '</button>' +
          '<button type="button" data-n="2">2 人</button><button type="button" data-n="3">3 人</button><button type="button" data-n="4">4 人</button>' +
        '</div></div>' +
        '<div class="field" id="nickField"><label class="label" for="nick">暱稱(排行榜上顯示)</label>' +
          '<input id="nick" maxlength="12" autocomplete="off" spellcheck="false"></div>' +
        '<p class="small" id="ctrlHint"></p>' +
        '<button class="btn" id="bStartBtn" type="button">開始</button>' +
        '<section class="board" id="boardMenuWrap"><div class="label">單人排行榜</div><ol id="boardMenu"></ol></section>' +
      '</div></div>' +
      '<div class="overlay" id="bOver" hidden><div class="panel">' +
        '<h1>時間到</h1>' +
        '<div id="soloRes"><div class="label">你撞倒了</div><div class="big"><span id="finalN">0</span><small>人</small></div><p id="upMsg" class="small"></p></div>' +
        '<div id="multiRes" hidden><p class="verdict" id="verdict"></p><ol class="rank" id="rankList"></ol></div>' +
        '<div class="btns"><button class="btn" id="bAgain" type="button">再來一次</button><button class="btn ghost" id="bMenu" type="button">回選單</button></div>' +
        '<section class="board" id="boardOverWrap"><div class="label">單人排行榜</div><ol id="boardOver"></ol></section>' +
      '</div></div>'
  };

  var timeLeft = ROUND, cdLeft = COUNTDOWN, lastCd = -1, lastT = -1, overAt = 0;
  var nSel = 1;
  try { nSel = CR.clamp(parseInt(localStorage.getItem('bump-n'), 10) || 1, 1, 4); } catch (e) {}

  /* ───────── 排行榜(db) ───────── */
  var db = null, myId = null, canWrite = null;
  var boardMode = 'loading';   // loading | ready | off
  var rows = [];

  function renderBoards() {
    if (!BOARD_ENABLED) return;
    ['boardMenu', 'boardOver'].forEach(function (id) {
      var ol = el(id);
      ol.textContent = '';
      var msg = null;
      if (boardMode === 'off') msg = '排行榜需要登入 Claude 後才能使用。';
      else if (boardMode === 'loading') msg = '讀取中…';
      else if (!rows.length) msg = '還沒有人上榜,成為第一個!';
      if (msg) {
        var m = document.createElement('li'); m.className = 'msg'; m.textContent = msg; ol.appendChild(m);
        return;
      }
      rows.slice(0, 8).forEach(function (r, i) {
        var li = document.createElement('li');
        if (r.id === myId) li.className = 'me';
        var a = document.createElement('span'); a.textContent = String(i + 1);
        var b = document.createElement('span'); b.textContent = String(r.name || '玩家').slice(0, 12) + (r.id === myId ? '(你)' : '');
        var c = document.createElement('b'); c.textContent = String(r.score);
        li.appendChild(a); li.appendChild(b); li.appendChild(c);
        ol.appendChild(li);
      });
    });
  }

  async function submitScore(name, score) {
    if (!db || !myId) return { status: 'nodb' };
    if (canWrite === false) return { status: 'readonly' };
    try {
      var ref = db.doc('scores/' + myId);
      var cur = await ref.get();
      var best = cur.exists ? (Number(cur.data().score) || 0) : 0;
      if (score > best) {
        await ref.set({ name: name, score: score, at: Date.now() });
        return { status: 'new', best: score };
      }
      if (cur.exists && cur.data().name !== name) await ref.update({ name: name });
      return { status: 'kept', best: best };
    } catch (e) {
      return { status: e && e.code === 'invalid_argument' ? 'readonly' : 'fail' };
    }
  }

  async function initDb() {
    try {
      if (!window.claude || !window.claude.use) { boardMode = 'off'; renderBoards(); return; }
      db = await window.claude.use('db');
      var u = await window.claude.use('user');
      if (u) { myId = await u.id(); canWrite = await u.can('data.write'); }
      if (!db) { boardMode = 'off'; renderBoards(); return; }
      db.collection('scores').orderBy('score', 'desc').limit(20).onSnapshot(function (snap) {
        rows = snap.docs.map(function (d) { var v = d.data() || {}; return { id: d.id, name: v.name, score: Number(v.score) || 0 }; });
        boardMode = 'ready';
        renderBoards();
      }, function () { boardMode = 'off'; renderBoards(); });
    } catch (e) { boardMode = 'off'; renderBoards(); }
  }

  /* ───────── 選單 ───────── */
  var segBtns, nickEl;
  function syncMenu() {
    segBtns.forEach(function (b) {
      var on = Number(b.dataset.n) === nSel;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    el('nickField').hidden = !BOARD_ENABLED || nSel !== 1;
    var parts = [];
    for (var i = 0; i < nSel; i++) parts.push(PCOL[i].name + ' ' + (nSel === 1 ? 'WASD 或方向鍵' : PCOL[i].label));
    var touch = nSel === 1 ? '手機:在畫面上拖曳。' : '手機:畫面分成 ' + nSel + ' 個區塊,各自拖曳。';
    el('ctrlHint').textContent = nSel > 1 && window.matchMedia('(pointer: coarse)').matches
      ? '多人模式:手機歡迎橫放遊玩。畫面分成 ' + nSel + ' 個區塊,各自拖曳。'
      : '電腦:' + parts.join(' · ') + '。' + touch;
  }

  M.init = function () {
    segBtns = Array.prototype.slice.call(document.querySelectorAll('#seg button'));
    nickEl = el('nick');
    try { nickEl.value = localStorage.getItem('bump-nick') || ''; } catch (e) {}
    if (!nickEl.value) nickEl.value = '玩家' + (100 + ((Math.random() * 900) | 0));
    segBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        nSel = Number(b.dataset.n);
        try { localStorage.setItem('bump-n', String(nSel)); } catch (e) {}
        syncMenu();
      });
    });
    nickEl.addEventListener('input', function () {
      try { localStorage.setItem('bump-nick', nickEl.value.trim()); } catch (e) {}
    });
    el('boardMenuWrap').hidden = !BOARD_ENABLED;
    el('bStartBtn').addEventListener('click', M.start);
    el('bAgain').addEventListener('click', M.start);
    el('bMenu').addEventListener('click', toMenu);
    if (BOARD_ENABLED) { renderBoards(); initDb(); }
  };

  M.enter = function () {
    el('hud').classList.add('idle');
    el('tLabel').textContent = '剩餘時間';
    el('t').textContent = String(ROUND);
    syncMenu();
  };

  function toMenu() {
    CR.state = 'menu';
    CR.removePlayers();
    CR.clearSticks();
    el('bOver').hidden = true;
    el('bStart').hidden = false;
    el('hud').classList.add('idle');
    el('rest').hidden = true;
    el('cd').hidden = true;
    syncMenu();
  }

  /* ───────── 回合流程 ───────── */
  function buildScoreCards() {
    var box = el('scores');
    box.textContent = '';
    CR.players.forEach(function (p) {
      var d = document.createElement('div'); d.className = 'sc';
      d.style.setProperty('--c', PCOL[p.i].css);
      var s = document.createElement('span'); s.className = 'sn'; s.textContent = CR.players.length === 1 ? '撞倒' : PCOL[p.i].name;
      var b = document.createElement('b'); b.textContent = '0';
      d.appendChild(s); d.appendChild(b); box.appendChild(d);
      p.scoreEl = b; p.shown = 0;
    });
  }

  M.start = function () {
    CR.initAudio();
    CR.clearPeds();
    CR.removePlayers();
    var pos = STARTS[nSel - 1];
    for (var i = 0; i < nSel; i++) {
      var c = PCOL[i];
      CR.makePlayer(pos[i][0], pos[i][1], { i: i, css: c.css, num: c.num, glow: 0.5, label: nSel > 1 ? c.name : null });
    }
    timeLeft = ROUND; cdLeft = COUNTDOWN; lastCd = -1; lastT = -1;
    CR.resetRound(0.5);
    M.overShown = false;
    for (var k = 0; k < 14; k++) CR.spawnPed(true);
    buildScoreCards();
    CR.buildSticks(PCOL.map(function (c) { return c.css; }), PCOL.map(function (c) { return c.name; }));
    CR.state = 'countdown';
    el('bStart').hidden = true;
    el('bOver').hidden = true;
    el('hud').classList.remove('idle');
    el('t').textContent = String(ROUND);
    el('timeCard').classList.remove('low');
    var h = el('hint');
    h.style.opacity = 1;
    CR.later(function () { h.style.opacity = 0; }, 7000);
  };

  var _pv = null;
  function popup(x, z, txt, color, big) {
    var w = CR.stage.clientWidth, h = CR.stage.clientHeight;
    _pv = (_pv || new THREE.Vector3()).set(x, 1.9, z).project(CR.camera);
    var d = document.createElement('div');
    d.className = 'pop' + (big ? ' big' : '');
    d.textContent = txt;
    d.style.left = ((_pv.x * 0.5 + 0.5) * w) + 'px';
    d.style.top = ((-_pv.y * 0.5 + 0.5) * h) + 'px';
    d.style.color = color;
    el('pops').appendChild(d);
    CR.later(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 900);
  }

  M.touch = function (pl, p) {
    p.down = true; p.downT = 0;
    var vx = pl.vx, vz = pl.vz, l = Math.hypot(vx, vz);
    if (l < 0.5) { vx = p.x - pl.x; vz = p.z - pl.z; l = Math.hypot(vx, vz) || 1; }
    p.fx = vx / l * 6; p.fz = vz / l * 6;
    var pts = p.gold ? 3 : 1;
    pl.score += pts;
    popup(p.x, p.z, '+' + pts, PCOL[pl.i].css, p.gold);
    CR.tone(480 + pl.i * 90, 0.09, 'triangle', 0.07);
    if (p.gold) { CR.tone(880, 0.1, 'triangle', 0.07, 0.08); CR.tone(1175, 0.14, 'triangle', 0.07, 0.16); }
    CR.shake = Math.max(CR.shake, p.gold ? 0.35 : 0.18);
  };

  function endRound() {
    CR.state = 'over';
    overAt = performance.now();
    M.overShown = false;
    CR.tone(440, 0.5, 'sine', 0.08); CR.tone(330, 0.6, 'sine', 0.08, 0.3);
    var players = CR.players, solo = players.length === 1;
    el('soloRes').hidden = !solo;
    el('multiRes').hidden = solo;
    el('boardOverWrap').hidden = !solo || !BOARD_ENABLED;
    if (solo) {
      var sc = players[0].score;
      el('finalN').textContent = String(sc);
      var up = el('upMsg');
      var localBest = 0, isBest = false;
      try { localBest = parseFloat(localStorage.getItem('bump-best')) || 0; if (sc > localBest) { localBest = sc; isBest = true; localStorage.setItem('bump-best', String(sc)); } } catch (e) {}
      if (!BOARD_ENABLED) {
        up.textContent = (isBest ? '新的個人最佳!' : '') + '這台裝置的最佳是 ' + localBest + ' 人。';
        return;
      }
      var nick = (nickEl.value.trim() || '玩家').slice(0, 12);
      up.textContent = '上傳成績中…';
      submitScore(nick, sc).then(function (r) {
        var m = {
          'new': '新的個人最佳!已更新排行榜。',
          'kept': '你在排行榜上的最佳是 ' + (r.best || 0) + ' 人,這回合沒有超過。',
          'nodb': '目前無法連上排行榜。這台裝置的最佳是 ' + localBest + ' 人。',
          'readonly': '這個連結的權限不能上傳成績。請請作者把你設為協作者。這台裝置的最佳是 ' + localBest + ' 人。',
          'fail': '上傳失敗,請稍後再試。這台裝置的最佳是 ' + localBest + ' 人。'
        };
        up.textContent = m[r.status] || '';
      });
    } else {
      var sorted = players.slice().sort(function (a, b) { return b.score - a.score; });
      var top = sorted[0].score;
      var winners = sorted.filter(function (p) { return p.score === top; });
      el('verdict').textContent = winners.length > 1 ? '平手!' : PCOL[winners[0].i].name + ' 獲勝!';
      var ol = el('rankList');
      ol.textContent = '';
      sorted.forEach(function (p, i) {
        var li = document.createElement('li');
        li.style.setProperty('--c', PCOL[p.i].css);
        if (p.score === top) li.className = 'win';
        var a = document.createElement('span'); a.textContent = String(i + 1);
        var b = document.createElement('span'); b.textContent = PCOL[p.i].name;
        if (p.score === top) { var em = document.createElement('em'); em.textContent = winners.length > 1 ? '平手' : '冠軍'; b.appendChild(em); }
        var c = document.createElement('b'); c.textContent = String(p.score);
        li.appendChild(a); li.appendChild(b); li.appendChild(c);
        ol.appendChild(li);
      });
    }
  }

  M.pedSpeed = function (advance) {
    var rnd = CR.rnd;
    var prog = CR.state === 'play' ? 1 - timeLeft / ROUND : 0;
    var gold = !advance && Math.random() < 0.09;
    var kind = Math.random() < 0.3 ? CR.pick(['arcL', 'arcR', 'weave']) : null;
    var sp;
    if (gold) sp = rnd(3.8, 4.8);
    else if (kind) sp = CR.pick([rnd(1.3, 2.0), rnd(2.4, 3.4), rnd(4.0, 4.9)]);
    else if (Math.random() < 0.14) sp = rnd(4.2, 5.0);
    else sp = rnd(1.5, 3.2);
    return { sp: Math.min(sp * (1 + 0.25 * prog), 5.2), kind: kind, gold: gold };
  };
  M.spawnGap = function () {
    return CR.state === 'menu' ? 0.9 : 0.55 / (1 + 0.35 * (Math.max(1, CR.players.length) - 1));
  };

  M.pre = function (dt) {
    if (CR.state !== 'countdown') return;
    var cdEl = el('cd');
    cdLeft -= dt;
    var c = Math.ceil(cdLeft);
    if (c > 0 && c !== lastCd) { lastCd = c; cdEl.hidden = false; cdEl.textContent = String(c); CR.tone(660, 0.1, 'sine', 0.07); }
    if (cdLeft <= 0) {
      CR.state = 'play';
      cdEl.hidden = false; cdEl.textContent = 'GO!';
      CR.tone(990, 0.3, 'sine', 0.09);
      CR.later(function () { if (CR.state !== 'countdown') cdEl.hidden = true; }, 700);
    }
  };

  M.tick = function (dt) {
    timeLeft -= dt;
    var tc = Math.ceil(timeLeft);
    if (timeLeft <= 5 && tc !== lastT) { lastT = tc; CR.tone(1040, 0.08, 'square', 0.04); }
    if (timeLeft <= 0) { timeLeft = 0; endRound(); }
  };

  M.post = function () {
    CR.players.forEach(function (q) {
      if (q.shown !== q.score && q.scoreEl) { q.shown = q.score; q.scoreEl.textContent = String(q.score); }
    });
    if (CR.state === 'over' && !M.overShown && performance.now() - overAt > 700) {
      M.overShown = true;
      renderBoards();
      el('bOver').hidden = false;
      el('hud').classList.add('idle');
      el('rest').hidden = true;
      CR.clearSticks();
      try { el('bAgain').focus({ preventScroll: true }); } catch (e) {}
    }
  };

  M.hud = function () {
    if (CR.state === 'over') return;
    el('t').textContent = String(Math.max(0, Math.ceil(timeLeft)));
    el('timeCard').classList.toggle('low', CR.state === 'play' && timeLeft <= 10);
  };

  CR.register('bump', M);
})();
