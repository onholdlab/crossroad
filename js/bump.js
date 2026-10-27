/* 十字路口撞人賽:60 秒內撞倒最多路人,1~4 人同樂。 */
(function () {
  'use strict';
  var CR = window.CR, el = CR.el;

  /* 排行榜開關:false 時不連線,選單與結算畫面不出現排行榜字樣;本機最高分照常保留 */
  var BOARD_ENABLED = true;

  /* ───────── 撞人賽設定 ───────── */
  var ROUND = 60;        // 一回合秒數
  var COUNTDOWN = 3;     // 開始前倒數秒數
  var PCOL = [
    { name: 'P1', css: '#ffd23f', num: 0xffd23f, label: 'WASD' },
    { name: 'P2', css: '#3ee7ff', num: 0x3ee7ff, label: tr('方向鍵', 'Arrow keys') },
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
    title: tr('十字路口撞人賽', 'Crossroad: Bump'), short: tr('撞人賽', 'Bump'),
    hint: tr('撞倒路人得分,金色路人算 3 分', 'Bump people to score. Gold ones are worth 3.'),
    hintHtml: '<span class="hi">' + pedIcon('#c9ccd6') + '+1</span><span class="hi">' + pedIcon('#ffc400', true) + '+3</span>',
    SPEED: 5.8, ACCEL: 40, HIT_R: 0.62, MAX_PEDS: 140,
    coast: true, startOnMove: false,
    startId: 'bStart', overId: 'bOver', startBtnId: 'bStartBtn',
    html:
      '<div class="overlay" id="bStart" hidden><div class="panel">' +
        '<h1>' + tr('十字路口撞人賽', 'Crossroad: Bump') + '</h1>' +
        '<p>' + tr('60 秒內,撞倒最多路人的人獲勝。', 'Most people knocked down in 60 seconds wins.') + '</p>' +
        '<ul class="rules">' +
          '<li><i style="background:var(--player)"></i><span>' + tr('衝向路人就算撞倒,得 1 分。身體發亮的金色路人跑得快,算 3 分。', 'Run into someone to knock them down: 1 point. Glowing gold people are fast and worth 3.') + '</span></li>' +
          '<li><i style="background:var(--go)"></i><span>' + tr('綠燈 15 秒人潮湧入,有些人會走曲線,更難撞。', 'Green light, 15 s: crowds pour in. Some walk in curves and are harder to hit.') + '</span></li>' +
          '<li><i style="background:var(--stop)"></i><span>' + tr('紅燈 3 秒大家休息,這段時間撞不到人。', 'Red light, 3 s: everyone rests. No knockdowns during it.') + '</span></li>' +
        '</ul>' +
        '<div class="field"><span class="label">' + tr('人數', 'Players') + '</span><div class="seg" id="seg">' +
          '<button type="button" data-n="1">' + (BOARD_ENABLED ? tr('單人 · 上排行榜', 'Solo · leaderboard') : tr('單人', 'Solo')) + '</button>' +
          '<button type="button" data-n="2">' + tr('2 人', '2P') + '</button><button type="button" data-n="3">' + tr('3 人', '3P') + '</button><button type="button" data-n="4">' + tr('4 人', '4P') + '</button>' +
        '</div></div>' +
        '<div class="field" id="nickField"><label class="label" for="nick">' + tr('暱稱(排行榜上顯示)', 'Nickname (shown on the leaderboard)') + '</label>' +
          '<input id="nick" maxlength="12" autocomplete="off" spellcheck="false"></div>' +
        '<div class="field" id="namesField" hidden><span class="label">' + tr('玩家名字(選填,取了名字就會在這台裝置記戰績)', 'Player names (optional; named players get a record on this device)') + '</span><div class="names" id="names"></div></div>' +
        '<p class="small" id="ctrlHint"></p>' +
        '<button class="btn" id="bStartBtn" type="button">' + tr('開始', 'Start') + '</button>' +
        '<section class="board" id="boardMenuWrap"><div class="label">' + tr('單人排行榜', 'Solo leaderboard') + '</div><ol id="boardMenu"></ol></section>' +
      '</div></div>' +
      '<div class="overlay" id="bOver" hidden><div class="panel">' +
        '<h1>' + tr('時間到', 'Time\'s up') + '</h1>' +
        '<div id="soloRes"><div class="label">' + tr('你撞倒了', 'You knocked down') + '</div><div class="big"><span id="finalN">0</span>' + tr('<small>人</small>', '<small>people</small>') + '</div><p id="upMsg" class="small"></p></div>' +
        '<div id="multiRes" hidden><p class="verdict" id="verdict"></p><ol class="rank" id="rankList"></ol>' +
          '<section class="board" id="friendsWrap"><div class="label">' + tr('這台裝置的戰績', 'Record on this device') + '</div><ol class="friends" id="friends"></ol></section>' +
          '<p class="small" id="friendsHint"></p></div>' +
        '<div class="btns"><button class="btn" id="bAgain" type="button">' + tr('再來一次', 'Play again') + '</button><button class="btn ghost" id="bMenu" type="button">' + tr('回選單', 'Menu') + '</button></div>' +
        '<section class="board" id="boardOverWrap"><div class="label">' + tr('單人排行榜', 'Solo leaderboard') + '</div><ol id="boardOver"></ol><a class="priv" href="https://onholdlab.github.io/privacy/" target="_blank" rel="noopener">' + tr('排行榜會公開暱稱與分數 · 隱私權政策', 'Nicknames and scores are public · Privacy policy') + '</a></section>' +
      '</div></div>'
  };

  var curNames = [], curTeams = [];
  var timeLeft = ROUND, cdLeft = COUNTDOWN, lastCd = -1, lastT = -1, overAt = 0;
  var nSel = 1;
  try { nSel = CR.clamp(parseInt(localStorage.getItem('bump-n'), 10) || 1, 1, 4); } catch (e) {}

  /* ───────── 多人:名字與本機戰績(只存在這台裝置,不上傳) ───────── */
  var names = ['', '', '', ''];
  try { var sn = JSON.parse(localStorage.getItem('bump-names')); if (Array.isArray(sn)) for (var q = 0; q < 4; q++) names[q] = typeof sn[q] === 'string' ? sn[q].slice(0, 10) : ''; } catch (e) {}
  function saveNames() { try { localStorage.setItem('bump-names', JSON.stringify(names)); } catch (e) {} }
  /* 回合用的名字。彩蛋:同名的玩家合體成「雙胞胎」,共用第一位的顏色、分數加總,名牌加 ①②③④。
     curNames[i] = { name(隊名), named, team(隊伍代表的玩家編號), tag(名牌) } */
  var CIRC = ['①', '②', '③', '④'];
  function roundNames(n) {
    var out = [], lead = {}, cnt = {};
    for (var i = 0; i < n; i++) {
      var nm = names[i].trim(), key = nm.toLowerCase();
      if (!nm) { out.push({ name: PCOL[i].name, named: false, team: i }); continue; }
      if (lead[key] === undefined) { lead[key] = i; cnt[key] = 0; }
      out.push({ name: out[lead[key]] ? out[lead[key]].name : nm, named: true, team: lead[key], key: key, num: cnt[key]++ });
    }
    out.forEach(function (o) {
      o.size = o.named ? cnt[o.key] : 1;
      o.tag = o.size > 1 ? o.name + ' ' + CIRC[o.num] : o.name;
    });
    return out;
  }
  /* 這一局的隊伍(沒有雙胞胎時就是每人一隊),total 是分數加總 */
  function teamsOf(players) {
    var t = [], by = {};
    players.forEach(function (p) {
      var cn = curNames[p.i], k = cn.team;
      if (!by[k]) { by[k] = { lead: k, name: cn.name, named: cn.named, key: cn.key, size: cn.size, members: [], total: 0 }; t.push(by[k]); }
      by[k].members.push(p); by[k].total += p.score;
    });
    return t;
  }
  /* 2 人同名叫雙胞胎、3 人三胞胎、4 人四胞胎 */
  function kin(n, zh) {
    return zh === 'total' ? tr(['', '', '雙胞胎', '三胞胎', '四胞胎'][n] + '合計 ', ['', '', 'Twins', 'Triplets', 'Quadruplets'][n] + ' total: ')
      : zh === 'rec' ? tr(' ' + ['', '', '雙胞胎', '三胞胎', '四胞胎'][n] + '新紀錄!', ' New ' + ['', '', 'twins', 'triplets', 'quadruplets'][n] + ' record!')
      : tr('(' + ['', '', '雙胞胎', '三胞胎', '四胞胎'][n] + ')', ' (' + ['', '', 'twins', 'triplets', 'quadruplets'][n] + ')');
  }
  function colOf(i) { return PCOL[curNames[i] ? curNames[i].team : i]; }
  function loadRec() {
    var r = null;
    try { r = JSON.parse(localStorage.getItem('bump-friends')); } catch (e) {}
    return r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  }
  function saveRec(r) { try { localStorage.setItem('bump-friends', JSON.stringify(r)); } catch (e) {} }

  /* ───────── 排行榜(Supabase,js/board.js) ───────── */
  var boardRes = null;
  function renderBoards() {
    if (!BOARD_ENABLED) return;
    ['boardMenu', 'boardOver'].forEach(function (id) { CR.board.render(el(id), boardRes, String); });
  }
  function refreshBoard() {
    if (!BOARD_ENABLED) return Promise.resolve(null);
    return CR.board.load('bump').then(function (r) { boardRes = r; renderBoards(); return r; });
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
    el('namesField').hidden = nSel === 1;
    Array.prototype.forEach.call(document.querySelectorAll('#names input'), function (inp, i) { inp.parentNode.hidden = i >= nSel; });
    var parts = [];
    for (var i = 0; i < nSel; i++) parts.push(PCOL[i].name + ' ' + (nSel === 1 ? tr('WASD 或方向鍵', 'WASD or arrow keys') : PCOL[i].label));
    var touch = nSel === 1 ? tr('手機:在畫面上拖曳。', 'Phone: drag on the screen.') : tr('手機:畫面分成 ', 'Phone: the screen splits into ') + nSel + tr(' 個區塊,各自拖曳。', ' zones, one per player.');
    var multiTouch = nSel > 1 && window.matchMedia('(pointer: coarse)').matches;
    el('ctrlHint').classList.toggle('multi', multiTouch);
    el('ctrlHint').textContent = multiTouch
      ? tr('多人模式:手機歡迎橫放遊玩。畫面分成 ', 'Multiplayer: try your phone sideways. The screen splits into ') + nSel + tr(' 個區塊,各自拖曳;拇指從內側開始滑,別從螢幕邊緣起手。', ' zones, one per player. Start each drag away from the screen edge.')
      : tr('電腦:', 'Keyboard: ') + parts.join(' · ') + tr('。', '. ') + touch;
  }

  M.init = function () {
    segBtns = Array.prototype.slice.call(document.querySelectorAll('#seg button'));
    nickEl = el('nick');
    nickEl.value = CR.board.getNick();
    var box = el('names');
    PCOL.forEach(function (c, i) {
      var w = document.createElement('label'); w.className = 'pname'; w.style.setProperty('--c', c.css);
      var t = document.createElement('span'); t.textContent = c.name;
      var inp = document.createElement('input'); inp.className = 'nick'; inp.maxLength = 10;
      inp.autocomplete = 'off'; inp.spellcheck = false; inp.placeholder = c.name; inp.value = names[i];
      inp.addEventListener('input', function () { names[i] = inp.value; saveNames(); });
      w.appendChild(t); w.appendChild(inp); box.appendChild(w);
    });
    segBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        nSel = Number(b.dataset.n);
        try { localStorage.setItem('bump-n', String(nSel)); } catch (e) {}
        syncMenu();
      });
    });
    nickEl.addEventListener('input', function () {
      CR.board.setNick(nickEl.value);
    });
    el('boardMenuWrap').hidden = !BOARD_ENABLED;
    el('bStartBtn').addEventListener('click', M.start);
    el('bAgain').addEventListener('click', M.start);
    el('bMenu').addEventListener('click', toMenu);
    if (BOARD_ENABLED) { renderBoards(); refreshBoard(); CR.board.autoRefresh(M, refreshBoard); }
  };

  M.enter = function () {
    el('hud').classList.add('idle');
    el('tLabel').textContent = tr('剩餘時間', 'Time left');
    el('t').textContent = String(ROUND);
    if (nickEl) nickEl.value = CR.board.getNick();
    syncMenu();
    refreshBoard();
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
    refreshBoard();
  }

  /* ───────── 回合流程 ───────── */
  function buildScoreCards() {
    var box = el('scores');
    box.textContent = '';
    curTeams = teamsOf(CR.players);
    curTeams.forEach(function (t) {
      var d = document.createElement('div'); d.className = 'sc';
      d.style.setProperty('--c', PCOL[t.lead].css);
      var s = document.createElement('span'); s.className = 'sn';
      s.textContent = CR.players.length === 1 ? tr('撞倒', 'Hits') : t.name + (t.size > 1 ? ' ×' + t.size : '');
      var b = document.createElement('b'); b.textContent = '0';
      d.appendChild(s); d.appendChild(b); box.appendChild(d);
      t.el = b; t.shown = 0;
    });
  }

  M.start = function () {
    CR.initAudio();
    CR.clearPeds();
    CR.removePlayers();
    var pos = STARTS[nSel - 1];
    curNames = roundNames(nSel);
    if (nSel > 1) { try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: 'bump-multi-' + nSel, title: 'Bump ' + nSel + 'P', event: true }); } catch (e) {} }
    for (var i = 0; i < nSel; i++) {
      var c = colOf(i);
      CR.makePlayer(pos[i][0], pos[i][1], { i: i, css: c.css, num: c.num, glow: 0.5, label: nSel > 1 ? curNames[i].tag : null });
    }
    timeLeft = ROUND; cdLeft = COUNTDOWN; lastCd = -1; lastT = -1;
    CR.resetRound(0.5);
    M.overShown = false;
    for (var k = 0; k < 14; k++) CR.spawnPed(true);
    buildScoreCards();
    CR.buildSticks(PCOL.map(function (c, i) { return colOf(i).css; }), PCOL.map(function (c, i) { return curNames[i] ? curNames[i].tag : c.name; }));
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
    popup(p.x, p.z, '+' + pts, colOf(pl.i).css, p.gold);
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
        up.textContent = (isBest ? tr('新的個人最佳!', 'New personal best! ') : '') + tr('這台裝置的最佳是 ', 'Best on this device: ') + localBest + tr(' 人。', '.');
        return;
      }
      var nick = CR.board.cleanNick(nickEl.value);
      if (sc <= 0) { up.textContent = tr('撞倒 1 人以上才會記入排行榜。', 'Knock down at least 1 person to make the leaderboard.'); renderBoards(); return; }
      up.textContent = tr('上傳成績中…', 'Uploading score…');
      CR.board.submit('bump', nick, sc).then(function (r) {
        if (!r.ok) { up.textContent = tr('目前連不上排行榜。這台裝置的最佳是 ', 'Can\'t reach the leaderboard. Best on this device: ') + localBest + tr(' 人。', '.'); return; }
        return refreshBoard().then(function (res) {
          var pos = 0;
          if (res && res.ok) res.rows.forEach(function (x, i) { if (x.me && !pos) pos = i + 1; });
          up.textContent = (isBest ? tr('新的個人最佳!', 'New personal best! ') : '') + (pos ? tr('你在排行榜第 ', 'You\'re #') + pos + tr(' 名。', ' on the leaderboard.') : tr('這次還沒擠進前 ', 'Not in the top ') + CR.board.SPOTS + tr(' 名。', ' on the leaderboard.'));
        });
      });
    } else {
      var teams = teamsOf(players);
      var sorted = teams.slice().sort(function (a, b) { return b.total - a.total; });
      var top = sorted[0].total, coop = teams.length === 1;
      var winners = coop ? [] : sorted.filter(function (t) { return t.total === top; });
      el('verdict').textContent = coop ? kin(sorted[0].size, 'total') + top + tr(' 人!', '!')
        : winners.length > 1 ? tr('平手!', 'It\'s a tie!') : winners[0].name + (winners[0].size > 1 ? kin(winners[0].size) : '') + tr(' 獲勝!', ' win' + (winners[0].size > 1 ? '!' : 's!'));
      var ol = el('rankList');
      ol.textContent = '';
      sorted.forEach(function (t, i) {
        var li = document.createElement('li');
        li.style.setProperty('--c', PCOL[t.lead].css);
        if (!coop && t.total === top) li.className = 'win';
        var a = document.createElement('span'); a.textContent = String(i + 1);
        var b = document.createElement('span'); b.textContent = t.name + (t.size > 1 ? ' ×' + t.size : '');
        if (!coop && t.total === top) { var em = document.createElement('em'); em.textContent = winners.length > 1 ? tr('平手', 'Tie') : tr('冠軍', 'Winner'); b.appendChild(em); }
        var c = document.createElement('b'); c.textContent = String(t.total);
        li.appendChild(a); li.appendChild(b); li.appendChild(c);
        ol.appendChild(li);
      });
      recordFriends(teams, winners, coop);
    }
  }

  /* 有取名字的隊伍記入本機戰績:局數、勝場(平手不算)、最高撞倒數。
     雙胞胎另外記在「名字(雙胞胎)」名下,不和個人戰績混在一起 */
  function recordFriends(teams, winners, coop) {
    var rec = loadRec(), inRound = [];
    teams.forEach(function (t) {
      if (!t.named) return;
      var twin = t.size > 1, key = t.key + (twin ? '#x' + t.size : '');
      var r = rec[key] || (rec[key] = { n: t.name, g: 0, w: 0, b: 0 });
      if (twin) r.t = t.size;
      if (coop && t.total > r.b && r.g > 0) el('verdict').textContent += kin(t.size, 'rec');
      r.n = t.name; r.g++; r.b = Math.max(r.b, t.total);
      if (coop || (winners.length === 1 && winners[0] === t)) r.w++;   // 全員同名也算 1 勝
      inRound.push(key);
    });
    if (inRound.length) saveRec(rec);
    var list = Object.keys(rec).map(function (k) { return { k: k, r: rec[k] }; })
      .sort(function (a, b) { return b.r.w - a.r.w || b.r.b - a.r.b || b.r.g - a.r.g; }).slice(0, 8);
    var ol = el('friends');
    ol.textContent = '';
    el('friendsWrap').hidden = !list.length;
    el('friendsHint').textContent = inRound.length ? '' : tr('在選單幫玩家取名字,就會在這台裝置記戰績。', 'Name players in the menu to keep a record on this device.');
    list.forEach(function (x, i) {
      var li = document.createElement('li');
      if (inRound.indexOf(x.k) >= 0) li.className = 'me';
      var a = document.createElement('span'); a.textContent = String(i + 1);
      var b = document.createElement('span'); b.textContent = x.r.n + (x.r.t ? kin(x.r.t === 1 ? 2 : x.r.t) : '');
      var sm = document.createElement('small'); sm.textContent = tr(' 最高 ', ' best ') + x.r.b + tr(' · ' + x.r.g + ' 局', ' · ' + x.r.g + (x.r.g === 1 ? ' game' : ' games'));
      b.appendChild(sm);
      var c = document.createElement('b'); c.textContent = x.r.w + tr(' 勝', x.r.w === 1 ? ' win' : ' wins');
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      ol.appendChild(li);
    });
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
    curTeams.forEach(function (t) {
      var sum = 0;
      t.members.forEach(function (q) { sum += q.score; });
      if (t.shown !== sum && t.el) { t.shown = sum; t.el.textContent = String(sum); }
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
