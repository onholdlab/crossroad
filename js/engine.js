/* 十字路口共用引擎:場景、紅綠燈、路人、玩家、輸入、音效、模式切換。
   各模式在 survive.js / bump.js 用 CR.register() 註冊,index.html 用 CR.boot(模式) 決定起始模式。 */
(function () {
  'use strict';

  var CR = window.CR = { modes: {}, mode: null, state: 'menu', phase: 'green', phaseLeft: 15, spawnAcc: 0.5, shake: 0, players: [], peds: [] };
  var el = CR.el = function (id) { return document.getElementById(id); };

  var ICON_SND = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/>' +
    '<g class="on"><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></g>' +
    '<g class="off"><path d="M3 3l18 18"/></g></svg>';
  var ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

  document.body.insertAdjacentHTML('afterbegin',
    '<div class="stage" id="stage">' +
    '<canvas id="blur" class="layer"></canvas><div class="vignette"></div><div class="flash" id="flash"></div>' +
    '<div class="zones" id="zones"></div><div class="pops" id="pops"></div>' +
    '<div class="hud" id="hud"><div class="hud-row">' +
      '<div class="hud-left"><button class="icon back" id="backBtn" type="button" aria-label="返回" hidden>' + ICON_BACK + '</button>' +
        '<div class="card time" id="timeCard"><div class="label" id="tLabel"></div><div class="num"><span id="t"></span><small>秒</small></div></div></div>' +
      '<div class="card signal" id="signal" data-state="green"><div class="lamps"><i class="lamp r"></i><i class="lamp g"></i></div>' +
        '<div><div class="label" id="sigLabel">綠燈 · 人潮湧入</div><div class="num"><span id="sigT">15</span><small>秒</small></div></div>' +
        '<div class="bar"><b id="sigBar"></b></div></div>' +
    '</div><div class="scores" id="scores"></div></div>' +
    '<div class="rest" id="rest" hidden><span>紅燈休息<b id="restT">3</b></span></div>' +
    '<div class="cd" id="cd" hidden></div>' +
    '<div class="foot"><div class="hint" id="hint"></div></div>' +
    '<div id="sticks"></div>' +
    '<div class="corner" id="corner"><button class="sw" id="swBtn" type="button"></button>' +
      '<button class="icon snd" id="snd" type="button" aria-label="音效" aria-pressed="true">' + ICON_SND + '</button></div>' +
    '</div>');

  CR.register = function (name, M) {
    M.name = name;
    CR.modes[name] = M;
    el('corner').insertAdjacentHTML('beforebegin', M.html);
    M.startOv = el(M.startId);
    M.overOv = el(M.overId);
  };
  CR.boot = function (name) {
    if (!window.THREE) {
      var M = CR.modes[name];
      document.title = M.title;
      M.startOv.hidden = false;
      M.startOv.querySelector('p').innerHTML = '<span class="err">三維引擎沒有載入成功,請重新整理頁面。</span>';
      el(M.startBtnId).hidden = true;
      el('swBtn').hidden = true;
      return;
    }
    CR.start(name);
  };
  if (!window.THREE) return;

  /* ───────── 可調參數 ───────── */
  var BOX = CR.BOX = 10;          // 清晰路口的半邊長(整個範圍是 20 x 20)
  var GREEN = CR.GREEN = 15;      // 綠燈秒數:人潮持續湧入
  var RED = CR.RED = 3;           // 紅燈秒數:休息時間
  var STOP = 11;                  // 停止線位置
  var HOLD = 11.6;                // 紅燈時路人停下的位置

  var stage = CR.stage = el('stage');

  var rnd = CR.rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = CR.pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var cheb = function (x, z) { return Math.max(Math.abs(x), Math.abs(z)); };
  var clamp = CR.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var angLerp = function (a, b, t) {
    var d = (((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  };

  /* 模式內的計時器都走這裡,切換模式時一次清掉 */
  var timers = [];
  CR.later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };

  /* ───────── 渲染器與相機 ───────── */
  var renderer = CR.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  var sharp = renderer.domElement;
  sharp.className = 'layer';
  sharp.id = 'sharp';
  stage.insertBefore(sharp, el('blur').nextSibling);
  var blurCanvas = el('blur');
  var bctx = blurCanvas.getContext('2d');

  var SKY = new THREE.Color(0x20264f);
  var scene = CR.scene = new THREE.Scene();
  var VFOV = 48;
  var camera = CR.camera = new THREE.PerspectiveCamera(VFOV, 1, 1, 400);
  var LOOK = new THREE.Vector3(0, 0, 2);
  var CAM_OFF = new THREE.Vector3(0, 28, 20);
  var camFactor = 1;
  var viewBottomZ = 16, viewTopZ = -40, hwTab = [];
  var _v = new THREE.Vector3();
  function placeCam(f) {
    camera.position.set(LOOK.x + CAM_OFF.x * f, LOOK.y + CAM_OFF.y * f, LOOK.z + CAM_OFF.z * f);
    camera.lookAt(LOOK);
    camera.updateMatrixWorld(true);
  }
  function ndc(x, y, z) { return _v.set(x, y, z).project(camera); }
  function groundZAtNdcY(ny) {
    _v.set(0, ny, 0.5).unproject(camera);
    var o = camera.position, dy = _v.y - o.y;
    if (dy > -1e-4) return -60;
    return Math.max(-60, o.z + (_v.z - o.z) * (-o.y / dy));
  }
  function halfW(z) {
    if (!hwTab.length) return 24;
    var i = clamp((z + 26) / 2, 0, hwTab.length - 1.001), a = Math.floor(i);
    return hwTab[a] + (hwTab[a + 1] - hwTab[a]) * (i - a);
  }
  /* 依螢幕比例把相機拉近,讓方形路口盡量填滿畫面(手機直式會放得更大) */
  function fitView() {
    var f = 1.2;
    for (var it = 0; it < 7; it++) {
      placeCam(f);
      var wx = Math.max(Math.abs(ndc(BOX, 0, BOX).x), Math.abs(ndc(BOX, 0, -BOX).x));
      var yTop = ndc(0, 0, -BOX).y, yBot = ndc(0, 0, BOX).y;
      f = clamp(Math.max(f * wx / 0.9, f * Math.max(yTop / 0.55, -yBot / 0.62)), 0.7, 3);
    }
    camFactor = f;
    placeCam(f);
    viewBottomZ = groundZAtNdcY(-1);
    viewTopZ = groundZAtNdcY(1);
    hwTab = [];
    for (var z = -26; z <= 12; z += 2) { var nx = ndc(1, 0, z).x; hwTab.push(nx > 1e-4 ? 1 / nx : 99); }
  }

  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    blurCanvas.width = Math.max(2, Math.ceil(w / 3));
    blurCanvas.height = Math.max(2, Math.ceil(h / 3));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitView();
  }
  window.addEventListener('resize', resize);

  /* ───────── 燈光 ───────── */
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3f55, 1.05));
  var sun = new THREE.DirectionalLight(0xfff1d6, 0.75);
  sun.position.set(-10, 25, 12);
  scene.add(sun);

  /* ───────── 地面:路口、斑馬線、人行道 ───────── */
  function makeGroundTex() {
    var S = 2048, span = 60, k = S / span;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    var X = function (x) { return (x + 30) * k; };
    var Z = function (z) { return (z + 30) * k; };
    g.fillStyle = '#4a4f63';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(30,34,50,0.35)';
    g.lineWidth = 1.2;
    for (var u = -30; u <= 30; u += 1.5) {
      g.beginPath(); g.moveTo(X(u), 0); g.lineTo(X(u), S); g.stroke();
      g.beginPath(); g.moveTo(0, Z(u)); g.lineTo(S, Z(u)); g.stroke();
    }
    g.fillStyle = '#262a37';
    g.fillRect(X(-14), Z(-14), 28 * k, 28 * k);
    g.fillRect(X(-7), 0, 14 * k, S);
    g.fillRect(0, Z(-7), S, 14 * k);
    for (var i = 0; i < 26000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    g.fillStyle = 'rgba(214,190,90,0.8)';
    for (var z = 15; z < 29; z += 2) {
      g.fillRect(X(-0.08), Z(z), 0.16 * k, 1.1 * k);
      g.fillRect(X(-0.08), Z(-z - 1.1), 0.16 * k, 1.1 * k);
      g.fillRect(X(z), Z(-0.08), 1.1 * k, 0.16 * k);
      g.fillRect(X(-z - 1.1), Z(-0.08), 1.1 * k, 0.16 * k);
    }
    for (var q = -9.5; q <= 9.6; q += 1.1) {
      g.fillStyle = 'rgba(238,236,226,' + (0.78 + Math.random() * 0.15).toFixed(2) + ')';
      g.fillRect(X(q - 0.27), Z(-13.5), 0.54 * k, 7 * k);
      g.fillRect(X(q - 0.27), Z(6.5), 0.54 * k, 7 * k);
      g.fillRect(X(-13.5), Z(q - 0.27), 7 * k, 0.54 * k);
      g.fillRect(X(6.5), Z(q - 0.27), 7 * k, 0.54 * k);
    }
    for (var dir = 0; dir < 2; dir++) {
      for (var s = -7.5; s <= 7.6; s += 1.1) {
        g.save();
        var sx = s * 0.7071, sz = (dir === 0 ? 1 : -1) * s * 0.7071;
        g.translate(X(sx), Z(sz));
        g.rotate(dir === 0 ? Math.PI / 4 : -Math.PI / 4);
        g.fillStyle = 'rgba(238,236,226,' + (0.78 + Math.random() * 0.15).toFixed(2) + ')';
        g.fillRect(-0.27 * k, -2 * k, 0.54 * k, 4 * k);
        g.restore();
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ map: makeGroundTex() }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  var outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x4a4f63 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.03;
  scene.add(outer);

  /* ───────── 周圍的城市(會被模糊) ───────── */
  function windowTex() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#1a1f38';
    g.fillRect(0, 0, 128, 128);
    var cols = ['#ffd9a0', '#fff1c8', '#9fdcff', '#ffc2de'];
    for (var r = 0; r < 8; r++) {
      for (var q = 0; q < 8; q++) {
        g.fillStyle = Math.random() < 0.55 ? pick(cols) : '#262c4a';
        g.fillRect(q * 16 + 3, r * 16 + 4, 10, 8);
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  var winBases = [windowTex(), windowTex(), windowTex(), windowTex()];
  var roofMat = new THREE.MeshBasicMaterial({ color: 0x151932 });
  var neon = [0xff3d9a, 0x3ee7ff, 0xff9a2e, 0x8a5bff, 0xffe14a];
  function addBuilding(x, z, h) {
    var t = pick(winBases).clone();
    t.needsUpdate = true;
    t.repeat.set(1, h / 24);
    var m = new THREE.MeshBasicMaterial({ map: t, color: 0xb8bfd8 });
    var b = new THREE.Mesh(new THREE.BoxGeometry(7, h, 7), [m, m, roofMat, roofMat, m, m]);
    b.position.set(x, h / 2, z);
    scene.add(b);
    if (Math.random() < 0.6 && h > 14) {
      var sgn = x > 0 ? -1 : 1;
      var bb = new THREE.Mesh(new THREE.PlaneGeometry(rnd(2.5, 4), rnd(5, 10)), new THREE.MeshBasicMaterial({ color: pick(neon) }));
      bb.position.set(x + sgn * 3.55, rnd(7, h - 4), z + rnd(-1.5, 1.5));
      bb.rotation.y = sgn * Math.PI / 2;
      scene.add(bb);
    }
  }
  for (var ix = -4; ix <= 4; ix++) {
    var bx = ix * 9;
    if (Math.abs(bx) < 12) continue;
    for (var iz = -5; iz <= 1; iz++) {
      var bz = iz * 9 - 4.5;
      if (iz === 1) {
        if (Math.abs(bx) < 20) continue;
        addBuilding(bx, 13.5, rnd(6, 10));
        continue;
      }
      addBuilding(bx, bz, rnd(14, 44));
    }
  }

  /* ───────── 紅綠燈、停止線、路口邊界 ───────── */
  var stopMat = new THREE.MeshBasicMaterial({ color: 0x3be08a });
  [[0, -STOP, 2 * STOP + 0.3, 0.28], [0, STOP, 2 * STOP + 0.3, 0.28], [-STOP, 0, 0.28, 2 * STOP + 0.3], [STOP, 0, 0.28, 2 * STOP + 0.3]].forEach(function (s) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(s[2], 0.03, s[3]), stopMat);
    m.position.set(s[0], 0.03, s[1]);
    scene.add(m);
  });
  var edgeMat = new THREE.MeshBasicMaterial({ color: 0xbff3ff });
  [[0, -BOX + 0.08, 2 * BOX, 0.16], [0, BOX - 0.08, 2 * BOX, 0.16], [-BOX + 0.08, 0, 0.16, 2 * BOX], [BOX - 0.08, 0, 0.16, 2 * BOX]].forEach(function (s) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(s[2], 0.04, s[3]), edgeMat);
    m.position.set(s[0], 0.045, s[1]);
    scene.add(m);
  });

  function radialTex(inner) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,' + inner + ')');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  var glowTex = radialTex(1);
  var lamps = [];
  [[-12.6, -12.6], [12.6, -12.6], [-12.6, 12.6], [12.6, 12.6]].forEach(function (p) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 8), new THREE.MeshLambertMaterial({ color: 0x6a7088 }));
    pole.position.set(p[0], 1.8, p[1]);
    scene.add(pole);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.7), new THREE.MeshLambertMaterial({ color: 0x14172a }));
    head.position.set(p[0], 4.0, p[1]);
    scene.add(head);
    var rm = new THREE.MeshBasicMaterial({ color: 0xff4d5e });
    var gm = new THREE.MeshBasicMaterial({ color: 0x3be08a });
    var ro = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), rm);
    var go = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), gm);
    var dx = p[0] > 0 ? -0.36 : 0.36;
    ro.position.set(p[0] + dx, 4.35, p[1]);
    go.position.set(p[0] + dx, 3.65, p[1]);
    scene.add(ro); scene.add(go);
    var rg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff4d5e, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    var gg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x3be08a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    rg.scale.set(3, 3, 1); gg.scale.set(3, 3, 1);
    rg.position.copy(ro.position); gg.position.copy(go.position);
    scene.add(rg); scene.add(gg);
    lamps.push({ rm: rm, gm: gm, rg: rg, gg: gg });
  });
  var DIM_R = new THREE.Color(0x3a1015), DIM_G = new THREE.Color(0x0f2b1c);
  var COL_R = new THREE.Color(0xff4d5e), COL_G = new THREE.Color(0x3be08a), COL_W = new THREE.Color(0xffb524);
  function setSignal(state, blinkOn) {
    var goOn = state === 'green' || (state === 'warn' && blinkOn);
    var stopOn = state === 'red';
    var goCol = state === 'warn' ? COL_W : COL_G;
    lamps.forEach(function (l) {
      l.rm.color.copy(stopOn ? COL_R : DIM_R);
      l.gm.color.copy(goOn ? goCol : DIM_G);
      l.rg.visible = stopOn;
      l.gg.visible = goOn;
      l.gg.material.color.copy(goCol);
    });
    stopMat.color.copy(state === 'red' ? COL_R : (state === 'warn' ? (blinkOn ? COL_W : DIM_R) : COL_G));
  }

  /* ───────── 人物 ───────── */
  var GEO = {
    legs: new THREE.CylinderGeometry(0.2, 0.22, 0.5, 8),
    torso: new THREE.CylinderGeometry(0.25, 0.29, 0.78, 10),
    head: new THREE.SphereGeometry(0.2, 12, 10),
    bag: new THREE.BoxGeometry(0.34, 0.46, 0.2),
    blob: new THREE.CircleGeometry(0.46, 16).rotateX(-Math.PI / 2),
    trail: new THREE.PlaneGeometry(0.5, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
    ring: new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2),
    glow: new THREE.CircleGeometry(1.7, 32).rotateX(-Math.PI / 2)
  };
  var blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
  var trailTex = (function () {
    var c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  })();
  var trailMat = new THREE.MeshBasicMaterial({ map: trailTex, color: 0xffe9b8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
  var playerGlowTex = radialTex(0.7);
  var goldGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc400, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85 });

  var TORSO = ['#c9ccd6', '#394b6b', '#7a3b3b', '#4c6a52', '#8a7a5a', '#2f2f3a', '#a35f7a', '#5b6f8f', '#d4cfc0', '#6b4f3a'];
  var SKIN = ['#f1c9a5', '#e0ac85', '#c68a64', '#8d5a3c', '#f6d7bd'];
  var LEGS = ['#23252e', '#30343f', '#3a3226', '#1f2a3d'];

  function buildFigure(torsoCol, legCol, skinCol, withBag) {
    var g = new THREE.Group();
    var body = new THREE.Group();
    g.add(body);
    var mats = [
      new THREE.MeshLambertMaterial({ color: legCol }),
      new THREE.MeshLambertMaterial({ color: torsoCol }),
      new THREE.MeshLambertMaterial({ color: skinCol })
    ];
    var legs = new THREE.Mesh(GEO.legs, mats[0]); legs.position.y = 0.25;
    var torso = new THREE.Mesh(GEO.torso, mats[1]); torso.position.y = 0.89;
    var head = new THREE.Mesh(GEO.head, mats[2]); head.position.y = 1.47;
    body.add(legs); body.add(torso); body.add(head);
    if (withBag) {
      var bm = new THREE.MeshLambertMaterial({ color: 0x1b1d28 });
      mats.push(bm);
      var bag = new THREE.Mesh(GEO.bag, bm);
      bag.position.set(0, 0.95, -0.26);
      body.add(bag);
    }
    return { g: g, body: body, mats: mats };
  }
  function setGhost(mats, on) {
    mats.forEach(function (m) { m.transparent = on; m.opacity = on ? 0.28 : 1; m.needsUpdate = true; });
  }

  function labelSprite(text, color) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    var g = c.getContext('2d');
    var x0 = 8, y0 = 8, w = 112, h = 48, r = 14;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x0 + r, y0);
    g.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
    g.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    g.arcTo(x0, y0 + h, x0, y0, r);
    g.arcTo(x0, y0, x0 + w, y0, r);
    g.closePath();
    g.fill();
    g.fillStyle = '#10131f';
    g.font = '700 34px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 33);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    s.scale.set(1.4, 0.7, 1);
    s.renderOrder = 5;
    return s;
  }

  /* 玩家:o = { i, css, num, glow(光暈透明度), label(多人時的名牌) } */
  CR.makePlayer = function (x, z, o) {
    var f = buildFigure(o.css, '#1c2440', '#f1c9a5', true);
    f.g.scale.setScalar(1.12);
    var holder = new THREE.Group();
    holder.add(f.g);
    var blob = new THREE.Mesh(GEO.blob, blobMat); blob.position.y = 0.02; holder.add(blob);
    var ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: o.num, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.y = 0.05; holder.add(ring);
    var glow = new THREE.Mesh(GEO.glow, new THREE.MeshBasicMaterial({ map: playerGlowTex, color: o.num, transparent: true, opacity: o.glow, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.04; holder.add(glow);
    var mats = f.mats.concat([ring.material, glow.material]);
    if (o.label) {
      var lb = labelSprite(o.label, o.css); lb.position.y = 2.5; holder.add(lb);
      mats.push(lb.material);
    }
    scene.add(holder);
    var p = { i: o.i || 0, holder: holder, fig: f.g, body: f.body, ring: ring, mats: mats, x: x, z: z, vx: 0, vz: 0, face: Math.PI, phase: 0, score: 0, shown: 0, scoreEl: null };
    CR.players.push(p);
    return p;
  };
  /* 原版撞人賽每局會留下光圈、光暈、名牌的 GPU 資源;這裡一併釋放 */
  CR.removePlayers = function () {
    CR.players.forEach(function (p) {
      scene.remove(p.holder);
      p.mats.forEach(function (m) { if (m.map && m.map !== playerGlowTex) m.map.dispose(); m.dispose(); });
    });
    CR.players.length = 0;
  };

  /* ───────── 路人 ───────── */
  function makePed(x, z, dx, dz, speed, gold) {
    var f = buildFigure(gold ? '#ffc400' : pick(TORSO), pick(LEGS), pick(SKIN), !gold && Math.random() < 0.35);
    if (gold) f.mats[1].emissive.setHex(0x7a5a00);
    var s = rnd(0.92, 1.1);
    f.g.scale.set(s, rnd(0.94, 1.08), s);
    var holder = new THREE.Group();
    holder.add(f.g);
    var blob = new THREE.Mesh(GEO.blob, blobMat); blob.position.y = 0.02; holder.add(blob);
    var trail = new THREE.Mesh(GEO.trail, trailMat); trail.position.y = 0.05; holder.add(trail);
    if (gold) { var gs = new THREE.Sprite(goldGlowMat); gs.scale.set(2.2, 2.2, 1); gs.position.y = 1.0; holder.add(gs); }
    scene.add(holder);
    var p = { holder: holder, body: f.body, mats: f.mats, trail: trail, x: x, z: z, dx: dx, dz: dz, speed: speed, cur: speed,
      ghost: false, passed: false, age: 0, phase: rnd(0, 6.28), gold: !!gold, down: false, downT: 0, fx: 0, fz: 0, fading: false };
    holder.rotation.y = Math.atan2(dx, dz);
    CR.peds.push(p);
    return p;
  }
  function disposePed(p) {
    scene.remove(p.holder);
    p.mats.forEach(function (m) { m.dispose(); });
  }
  CR.clearPeds = function () {
    CR.peds.forEach(disposePed);
    CR.peds.length = 0;
  };

  /* 出生點與方向共用;速度、曲線、金色由模式的 pedSpeed() 決定 */
  CR.spawnPed = function (advance) {
    var aspect = camera.aspect || 1;
    var ew = clamp(aspect / 1.3, 0.25, 1);
    var wN = 3, wE = 2.5 * ew, wS = 1.2 * clamp((viewBottomZ - 10) / 4, 0.25, 1);
    var r = Math.random() * (wN + 2 * wE + wS), sx, sz, south = false, side = 0;
    if (r < wN) {
      sz = Math.min(-14, Math.max(-24, viewTopZ + 1));
      sx = rnd(-1, 1) * Math.min(24, halfW(sz) + 1);
    } else if (r < wN + 2 * wE) {
      side = r < wN + wE ? 1 : -1;
      sz = rnd(-20, 8);
      sx = side * clamp(halfW(sz) + 1.2, 12.5, 24);
    } else {
      sz = clamp(viewBottomZ - 0.5, 11, 16);
      sx = rnd(-1, 1) * Math.min(14, halfW(sz) + 1);
      south = true;
    }
    var tx, tz;
    if (Math.random() < 0.5) { tx = rnd(-8, 8); tz = rnd(-8, 8); }
    else { tx = clamp(-sx * 0.5 + rnd(-5, 5), -9, 9); tz = clamp(-sz * 0.5 + rnd(-5, 5), -9, 9); }
    var vx = tx - sx, vz = tz - sz, len = Math.hypot(vx, vz);
    if (len < 1) return null;
    vx /= len; vz /= len;
    var spec = CR.mode.pedSpeed(advance), sp = spec.sp, kind = spec.kind;
    if (south) sp = Math.max(1.5, sp * 0.78);
    if (side && aspect < 1) sp = Math.max(1.4, sp * 0.7);
    var x = sx, z = sz;
    if (advance) {
      var ok = false;
      for (var i = 0; i < 10; i++) {
        var a = rnd(0, 20);
        if (cheb(sx + vx * a, sz + vz * a) >= 16) { x = sx + vx * a; z = sz + vz * a; ok = true; break; }
      }
      if (!ok) return null;
    }
    var th = Math.atan2(vx, vz), p;
    if (kind === 'weave') {
      var amp = rnd(0.35, 0.7), w = rnd(1.4, 2.6), ph = rnd(0, 6.28);
      var h0 = th + amp * Math.sin(ph);
      p = makePed(x, z, Math.sin(h0), Math.cos(h0), sp, spec.gold);
      p.kind = 'weave'; p.th0 = th; p.th = h0; p.amp = amp; p.w = w; p.ph = ph; p.tt = 0;
    } else if (kind) {
      var T = Math.max(1, Math.min(14, len / sp));
      var om = (kind === 'arcL' ? -1 : 1) * Math.min(sp / rnd(6, 13), 1.6 / T);
      var a0 = th - om * T / 2;
      p = makePed(x, z, Math.sin(a0), Math.cos(a0), sp, spec.gold);
      p.kind = 'arc'; p.th = a0; p.om = om; p.tt = 0; p.tEnd = T * 1.6;
    } else {
      p = makePed(x, z, vx, vz, sp, spec.gold);
    }
    return p;
  };

  /* ───────── 音效 ───────── */
  var AC = null, soundOn = true;
  CR.initAudio = function () {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
    } catch (e) {}
  };
  var tone = CR.tone = function (f, d, type, v, delay, slide) {
    if (!AC || !soundOn) return;
    try {
      var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + (delay || 0);
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v || 0.07, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(AC.destination);
      o.start(t); o.stop(t + d + 0.03);
    } catch (e) {}
  };
  el('snd').addEventListener('click', function () {
    soundOn = !soundOn;
    this.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
    CR.initAudio();
  });

  /* ───────── 回合共用 ───────── */
  var lastTick = -1;
  CR.resetRound = function (spawnAcc) {
    CR.phase = 'green'; CR.phaseLeft = GREEN; CR.spawnAcc = spawnAcc; CR.shake = 0; lastTick = -1;
  };
  function toRed() {
    CR.phase = 'red'; CR.phaseLeft = RED;
    CR.peds.forEach(function (p) {
      if (!p.ghost && !p.down && cheb(p.x, p.z) < STOP) {
        p.ghost = true;
        p.speed = Math.max(p.speed, 3.6);
        setGhost(p.mats, true);
      }
    });
    if (CR.mode.onRed) CR.mode.onRed();
    tone(660, 0.28, 'sine', 0.08); tone(494, 0.4, 'sine', 0.08, 0.24);
  }
  function toGreen() {
    CR.phase = 'green'; CR.phaseLeft = GREEN;
    tone(1175, 0.12, 'sine', 0.08); tone(1175, 0.12, 'sine', 0.08, 0.2);
  }

  /* ───────── 輸入 ───────── */
  CR.PKEYS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' },
    { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH' }
  ];
  var MOVE_KEYS = {};
  CR.PKEYS.forEach(function (k) { Object.keys(k).forEach(function (d) { MOVE_KEYS[k[d]] = 1; }); });
  var keys = {};
  var joys = [];
  var inRound = function () { return CR.state === 'play' || CR.state === 'countdown'; };

  window.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT') return;
    /* 選單上的按鈕要能用空白鍵按;回合中則一律攔下,避免誤按到返回鍵 */
    if (MOVE_KEYS[e.code] || (e.code === 'Space' && (tag !== 'BUTTON' || inRound()))) e.preventDefault();
    keys[e.code] = true;
    var M = CR.mode;
    if (tag === 'BUTTON' && !MOVE_KEYS[e.code]) return;
    if (CR.state === 'menu' && (e.code === 'Enter' || e.code === 'Space' || (M.startOnMove && MOVE_KEYS[e.code]))) M.start();
    else if (CR.state === 'over' && M.overShown && (e.code === 'Enter' || e.code === 'Space')) M.start();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });

  var sticksEl = el('sticks'), zonesEl = el('zones');
  CR.clearSticks = function () { sticksEl.textContent = ''; zonesEl.textContent = ''; joys = []; };
  /* 每位玩家一支搖桿;多人時畫面依 X 軸平分,觸控裝置上畫出分區 */
  CR.buildSticks = function (cols, names) {
    CR.clearSticks();
    var n = CR.players.length;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('div'); s.className = 'stick'; s.hidden = true;
      var k = document.createElement('div'); k.className = 'knob'; s.appendChild(k);
      if (cols) { s.style.borderColor = cols[i]; k.style.background = cols[i]; }
      sticksEl.appendChild(s);
      joys.push({ on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, el: s, knob: k });
    }
    if (n > 1 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      for (var j = 0; j < n; j++) {
        var zn = document.createElement('div'); zn.className = 'zone';
        zn.style.left = (j * 100 / n) + '%'; zn.style.width = (100 / n) + '%';
        var sp = document.createElement('span'); sp.textContent = names[j]; sp.style.color = cols[j];
        zn.appendChild(sp); zonesEl.appendChild(zn);
      }
    }
  };
  stage.addEventListener('pointerdown', function (e) {
    if (!inRound() || !joys.length || e.target.closest('button,input')) return;
    var r = stage.getBoundingClientRect(), n = joys.length;
    var zi = n === 1 ? 0 : clamp(Math.floor((e.clientX - r.left) / (r.width / n)), 0, n - 1);
    var j = joys[zi];
    if (j.on) return;
    j.on = true; j.id = e.pointerId; j.ox = e.clientX; j.oy = e.clientY; j.x = j.y = 0;
    j.el.style.left = (e.clientX - r.left) + 'px'; j.el.style.top = (e.clientY - r.top) + 'px';
    j.knob.style.left = '56px'; j.knob.style.top = '56px';
    j.el.hidden = false;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', function (e) {
    for (var i = 0; i < joys.length; i++) {
      var j = joys[i];
      if (!j.on || j.id !== e.pointerId) continue;
      var dx = e.clientX - j.ox, dy = e.clientY - j.oy, R = 52, l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      j.x = dx / R; j.y = dy / R;
      j.knob.style.left = (56 + dx) + 'px'; j.knob.style.top = (56 + dy) + 'px';
    }
  });
  function endJoy(e) {
    for (var i = 0; i < joys.length; i++) {
      var j = joys[i];
      if (j.on && j.id === e.pointerId) { j.on = false; j.x = j.y = 0; j.el.hidden = true; }
    }
  }
  stage.addEventListener('pointerup', endJoy);
  stage.addEventListener('pointercancel', endJoy);

  /* 單人時 P1 也接受方向鍵 */
  function axisOf(i) {
    var k = CR.PKEYS[i];
    var ix = (keys[k.right] ? 1 : 0) - (keys[k.left] ? 1 : 0);
    var iz = (keys[k.down] ? 1 : 0) - (keys[k.up] ? 1 : 0);
    if (CR.players.length === 1 && i === 0) {
      ix += (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      iz += (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    }
    var j = joys[i];
    if (j && j.on) { ix += j.x; iz += j.y; }
    var l = Math.hypot(ix, iz);
    if (l > 1) { ix /= l; iz /= l; }
    return [ix, iz];
  }

  /* ───────── 返回鍵:回合中連按兩次(2 秒內)才放棄這一局 ───────── */
  var backBtn = el('backBtn'), armTimer = 0;
  function disarm() { clearTimeout(armTimer); armTimer = 0; backBtn.classList.remove('arm'); }
  backBtn.addEventListener('click', function () {
    if (!inRound()) return;
    if (!armTimer) { backBtn.classList.add('arm'); armTimer = setTimeout(disarm, 2000); return; }
    disarm();
    enter(CR.mode.name, false);
  });

  /* ───────── 模式切換 ───────── */
  var swBtn = el('swBtn');
  function otherMode() { for (var k in CR.modes) if (k !== CR.mode.name) return k; }
  function modeFromUrl() {
    var seg = location.pathname.split('/');
    seg = seg[seg.length - 2];
    return CR.modes[seg] ? seg : null;
  }
  function enter(name, push) {
    var M = CR.modes[name], old = CR.mode;
    if (push) {
      /* file:// 下 Chrome 不允許 pushState 到別的路徑,改成一般跳轉 */
      try { history.pushState({ mode: name }, '', '../' + name + '/'); }
      catch (e) { location.href = '../' + name + '/index.html'; return; }
    }
    timers.forEach(clearTimeout); timers = [];
    disarm();
    CR.clearPeds(); CR.removePlayers(); CR.clearSticks();
    keys = {};
    el('pops').textContent = '';
    el('cd').hidden = true; el('rest').hidden = true;
    el('flash').style.transition = 'none'; el('flash').style.opacity = 0;
    if (old) { old.startOv.hidden = true; old.overOv.hidden = true; }
    CR.mode = M; CR.state = 'menu';
    CR.resetRound(0.5);
    document.title = M.title;
    swBtn.textContent = CR.modes[otherMode()].short;
    el('scores').textContent = '';
    el('timeCard').classList.remove('low');
    el('signal').dataset.state = 'green';
    el('sigLabel').textContent = '綠燈 · 人潮湧入';
    el('sigT').textContent = String(GREEN);
    el('sigBar').style.transform = 'scaleX(1)';
    el('hint').textContent = M.hint; el('hint').style.opacity = 1;
    M.overShown = false;
    M.enter();
    M.startOv.hidden = false;
    for (var k = 0; k < 8; k++) CR.spawnPed(true);
    if (old) { try { el(M.startBtnId).focus({ preventScroll: true }); } catch (e) {} }
  }
  CR.enter = enter;
  swBtn.addEventListener('click', function () { enter(otherMode(), true); });
  window.addEventListener('popstate', function () {
    var m = modeFromUrl();
    if (m && (m !== CR.mode.name || inRound())) enter(m, false);
  });

  /* ───────── 每幀更新 ───────── */
  var hudSigT = el('sigT'), hudBar = el('sigBar'), hudLabel = el('sigLabel'), sigCard = el('signal');
  var rest = el('rest'), restT = el('restT');

  function update(dt, now) {
    var M = CR.mode;
    if (M.pre) M.pre(dt);
    var playing = CR.state === 'play';
    var pdt = M.pedTimeScale ? dt * M.pedTimeScale() : dt;

    if (playing) {
      CR.phaseLeft -= dt;
      if (CR.phaseLeft <= 0) { if (CR.phase === 'green') toRed(); else toGreen(); }
      if (CR.phase === 'green' && CR.phaseLeft <= 3) {
        var tk = Math.ceil(CR.phaseLeft);
        if (tk !== lastTick) { lastTick = tk; tone(880, 0.07, 'square', 0.03); }
      }
      M.tick(dt);
      playing = CR.state === 'play';
    }

    /* 玩家 */
    var P = CR.players, i, j, q;
    var moving = playing || M.coast;
    if (moving) {
      for (i = 0; i < P.length; i++) {
        q = P[i];
        var ax = 0, az = 0;
        if (playing) { var a = axisOf(i); ax = a[0]; az = a[1]; }
        var dvx = ax * M.SPEED - q.vx, dvz = az * M.SPEED - q.vz, dl = Math.hypot(dvx, dvz), maxA = M.ACCEL * dt;
        if (dl > maxA) { dvx = dvx / dl * maxA; dvz = dvz / dl * maxA; }
        q.vx += dvx; q.vz += dvz;
        q.x += q.vx * dt; q.z += q.vz * dt;
      }
    }
    if (playing) {
      for (i = 0; i < P.length; i++) {
        for (j = i + 1; j < P.length; j++) {
          var ddx = P[j].x - P[i].x, ddz = P[j].z - P[i].z, dd = Math.hypot(ddx, ddz);
          if (dd < 0.8 && dd > 0.001) {
            var push = (0.8 - dd) / 2;
            P[i].x -= ddx / dd * push; P[i].z -= ddz / dd * push;
            P[j].x += ddx / dd * push; P[j].z += ddz / dd * push;
          }
        }
      }
    }
    for (i = 0; i < P.length; i++) {
      q = P[i];
      if (moving) {
        q.x = clamp(q.x, -BOX + 0.45, BOX - 0.45);
        q.z = clamp(q.z, -BOX + 0.45, BOX - 0.45);
        var sp = Math.hypot(q.vx, q.vz);
        if (sp > 0.4) q.face = angLerp(q.face, Math.atan2(q.vx, q.vz), Math.min(1, dt * 14));
        q.phase += sp * dt * 2.6;
        q.body.position.y = sp > 0.4 ? Math.abs(Math.sin(q.phase)) * 0.08 : 0;
        q.body.rotation.z = sp > 0.4 ? Math.sin(q.phase) * 0.07 : 0;
      }
      q.holder.position.set(q.x, 0, q.z);
      q.fig.rotation.y = q.face;
      var pulse = 1 + Math.sin(now * 0.006 + q.i) * 0.08;
      q.ring.scale.set(pulse, 1, pulse);
    }

    /* 路人生成 */
    CR.spawnAcc -= pdt;
    if (CR.spawnAcc <= 0 && CR.peds.length < M.MAX_PEDS) {
      CR.spawnPed(false);
      CR.spawnAcc = M.spawnGap() * rnd(0.6, 1.4);
    }

    /* 路人移動與碰撞 */
    var peds = CR.peds;
    for (i = peds.length - 1; i >= 0; i--) {
      var p = peds[i];
      p.age += pdt;

      if (p.down) {
        p.downT += pdt;
        var fall = Math.min(1, p.downT / 0.28);
        p.body.rotation.x = -fall * 1.5;
        p.body.position.y = fall * 0.12;
        var slide = Math.max(0, 1 - p.downT / 0.6);
        p.x += p.fx * slide * pdt; p.z += p.fz * slide * pdt;
        p.holder.position.set(p.x, 0, p.z);
        p.trail.visible = false;
        if (p.downT > 1.0) {
          if (!p.fading) { p.fading = true; p.mats.forEach(function (m) { m.transparent = true; m.needsUpdate = true; }); }
          var op = Math.max(0, 1 - (p.downT - 1.0) / 0.5);
          p.mats.forEach(function (m) { m.opacity = op; });
        }
        if (p.downT > 1.5) { disposePed(p); peds.splice(i, 1); }
        continue;
      }

      var cc = cheb(p.x, p.z);
      var target = p.speed;
      if (CR.phase === 'red' && !p.ghost && cc <= HOLD && cheb(p.x + p.dx * 0.1, p.z + p.dz * 0.1) < cc) target = 0;
      if (target < p.cur) p.cur = Math.max(target, p.cur - 16 * pdt);
      else p.cur = Math.min(target, p.cur + 6 * pdt);
      if (p.kind) {
        var mv = p.cur / p.speed;
        p.tt += pdt * mv;
        if (p.kind === 'arc') { if (p.tt < p.tEnd) p.th += p.om * pdt * mv; }
        else p.th = p.th0 + p.amp * Math.sin(p.w * p.tt + p.ph);
        p.dx = Math.sin(p.th); p.dz = Math.cos(p.th);
        p.holder.rotation.y = p.th;
      }
      p.x += p.dx * p.cur * pdt;
      p.z += p.dz * p.cur * pdt;
      p.phase += p.cur * pdt * 3.2;
      p.holder.position.set(p.x, 0, p.z);
      p.body.position.y = Math.abs(Math.sin(p.phase)) * 0.07 * Math.min(1, p.cur);
      p.body.rotation.z = Math.sin(p.phase) * 0.06 * Math.min(1, p.cur);
      p.trail.scale.z = Math.max(0.001, p.cur * 0.55);
      p.trail.visible = p.cur > 0.4;
      if (cc < 12) p.passed = true;
      var nc = cheb(p.x, p.z);
      if ((p.passed && nc > 28) || p.age > (p.kind ? 40 : 80)) { disposePed(p); peds.splice(i, 1); continue; }
      if (CR.state === 'play' && !p.ghost) {
        for (j = 0; j < P.length; j++) {
          var hx = p.x - P[j].x, hz = p.z - P[j].z;
          if (hx * hx + hz * hz < M.HIT_R * M.HIT_R) { M.touch(P[j], p); break; }
        }
      }
    }

    M.post(dt, now);

    /* 紅綠燈與介面 */
    var uiState = CR.phase === 'red' ? 'red' : (CR.phaseLeft <= 3 && CR.state === 'play' ? 'warn' : 'green');
    setSignal(uiState, Math.floor(now / 250) % 2 === 0);
    if (CR.state !== 'menu') {
      M.hud();
      var left = Math.max(0, CR.phaseLeft);
      hudSigT.textContent = String(Math.ceil(left));
      hudBar.style.transform = 'scaleX(' + (left / (CR.phase === 'red' ? RED : GREEN)).toFixed(3) + ')';
      sigCard.dataset.state = uiState;
      hudLabel.textContent = uiState === 'red' ? '紅燈 · 休息中' : (uiState === 'warn' ? '快變紅燈' : '綠燈 · 人潮湧入');
      var showRest = CR.phase === 'red' && CR.state === 'play';
      if (rest.hidden === showRest) rest.hidden = !showRest;
      if (showRest) restT.textContent = String(Math.ceil(left));
    }

    /* 返回鍵只在回合中出現,切換按鈕只在起始/結算畫面出現 */
    var round = inRound();
    if (backBtn.hidden === round) { backBtn.hidden = !round; if (!round) disarm(); }
    var menu = !M.startOv.hidden || !M.overOv.hidden;
    if (swBtn.hidden === menu) swBtn.hidden = !menu;

    /* 相機 */
    CR.shake *= Math.pow(0.02, dt);
    camera.position.set(
      LOOK.x + CAM_OFF.x * camFactor + (Math.random() - 0.5) * CR.shake * 0.7,
      LOOK.y + CAM_OFF.y * camFactor + (Math.random() - 0.5) * CR.shake * 0.5,
      LOOK.z + CAM_OFF.z * camFactor + (Math.random() - 0.5) * CR.shake * 0.7
    );
    camera.lookAt(LOOK);
  }

  /* ───────── 繪製:先畫完整場景並縮小成模糊底圖,再畫只含方形路口的清晰圖層 ───────── */
  var planes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), BOX),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), BOX),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), BOX),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), BOX)
  ];
  function render() {
    scene.background = SKY;
    renderer.clippingPlanes = [];
    renderer.render(scene, camera);
    bctx.drawImage(sharp, 0, 0, blurCanvas.width, blurCanvas.height);
    scene.background = null;
    renderer.clippingPlanes = planes;
    renderer.render(scene, camera);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!stage.clientWidth) { requestAnimationFrame(frame); return; }
    update(dt, now);
    render();
    requestAnimationFrame(frame);
  }

  CR.start = function (name) {
    resize();
    for (var k in CR.modes) if (CR.modes[k].init) CR.modes[k].init();
    enter(name, false);
    requestAnimationFrame(frame);
  };
})();
