/* ── ✏️ 手書き計算メモボード（index.html / park.html 共有） ──
   まなびポータル（furikaeri-portal）の MemoBoard を素のJSに移植したもの。
   ・判定には使わない「考えるための余白」
   ・指／タッチペン／マウス対応（Pointer Events）
   ・問題を移動したら MathMemo.onQuestionChange() でクリアする
   使い方：
     MathMemo.attach({ btnId: 'memo-toggle', boxId: 'memo-box' });
     showQuestion() 側で MathMemo.onQuestionChange();
*/
(function () {
  'use strict';

  var COLORS = ['#4f46e5', '#1e1b4b', '#dc2626', '#059669'];
  var PEN_WIDTH = 2.8, ERASER_WIDTH = 26, HEIGHT = 280;

  var state = {
    btn: null, box: null, wrap: null, canvas: null, ctx: null,
    open: false, tool: 'pen', color: COLORS[0],
    drawing: false, last: null, built: false
  };

  function css() {
    if (document.getElementById('memo-board-style')) return;
    var st = document.createElement('style');
    st.id = 'memo-board-style';
    st.textContent =
      '.memo-wrap{margin-top:12px;animation:memoIn .25s ease-out;}' +
      '@keyframes memoIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}' +
      '.memo-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}' +
      '.memo-tool{width:38px;height:38px;border-radius:10px;border:2px solid #e0e7ff;background:#f8f9ff;font-size:1.05rem;cursor:pointer;transition:all .15s;font-family:inherit;}' +
      '.memo-tool.on{border-color:#4f46e5;background:#ede9fe;box-shadow:0 2px 8px rgba(79,70,229,.25);}' +
      '.memo-swatch{width:26px;height:26px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 1.5px #c7d2fe;cursor:pointer;padding:0;}' +
      '.memo-swatch.on{box-shadow:0 0 0 2.5px #4f46e5;transform:scale(1.12);}' +
      '.memo-clear{margin-left:auto;padding:7px 14px;border-radius:99px;border:2px solid #c7d2fe;background:#fff;color:#4f46e5;font-family:inherit;font-weight:700;font-size:.78rem;cursor:pointer;}' +
      '.memo-clear:hover{background:#eef2ff;}' +
      '.memo-canvas{width:100%;border:2px dashed #c7d2fe;border-radius:14px;background:#fdfdff;touch-action:none;display:block;cursor:crosshair;}' +
      '.memo-note{font-size:.72rem;color:#9ca3af;margin-top:6px;}';
    document.head.appendChild(st);
  }

  function build() {
    if (state.built) return;
    css();
    var wrap = document.createElement('div');
    wrap.className = 'memo-wrap';
    var bar = document.createElement('div');
    bar.className = 'memo-bar';

    var pen = mkTool('✏️', 'ペン', function () { setTool('pen'); });
    pen.classList.add('on');
    var eraser = mkTool('⌫', '消しゴム', function () { setTool('eraser'); });
    bar.appendChild(pen); bar.appendChild(eraser);
    state.penBtn = pen; state.eraserBtn = eraser;

    state.swatches = COLORS.map(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'memo-swatch' + (i === 0 ? ' on' : '');
      b.style.background = c; b.title = 'ペンの色';
      b.addEventListener('click', function () { setColor(c); });
      bar.appendChild(b);
      return b;
    });

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button'; clearBtn.className = 'memo-clear'; clearBtn.textContent = '🧹 ぜんぶ消す';
    clearBtn.addEventListener('click', clearAll);
    bar.appendChild(clearBtn);

    var canvas = document.createElement('canvas');
    canvas.className = 'memo-canvas';
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('pointercancel', up);

    var note = document.createElement('div');
    note.className = 'memo-note';
    note.textContent = '※ここは計算用の下書きスペース。答え合わせには使われないよ。次の問題に進むと消えるよ。';

    wrap.appendChild(bar); wrap.appendChild(canvas); wrap.appendChild(note);
    state.box.appendChild(wrap);
    state.wrap = wrap; state.canvas = canvas;
    state.built = true;
    fit();
    window.addEventListener('resize', function () { if (state.open) fit(); });
  }

  function mkTool(label, title, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'memo-tool'; b.textContent = label; b.title = title;
    b.addEventListener('click', fn);
    return b;
  }

  function setTool(t) {
    state.tool = t;
    state.penBtn.classList.toggle('on', t === 'pen');
    state.eraserBtn.classList.toggle('on', t === 'eraser');
  }
  function setColor(c) {
    state.color = c; setTool('pen');
    state.swatches.forEach(function (b) { b.classList.toggle('on', b.style.background !== '' && rgbEq(b.style.background, c)); });
  }
  function rgbEq(a, b) {
    var d = document.createElement('div');
    d.style.color = a; var v1 = d.style.color;
    d.style.color = b; var v2 = d.style.color;
    return v1 === v2;
  }

  function fit() {
    var cv = state.canvas; if (!cv) return;
    var w = state.box.clientWidth || 600;
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(HEIGHT * dpr); // 代入でリセットされる
    cv.style.height = HEIGHT + 'px';
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    state.ctx = ctx;
  }

  function pos(e) {
    var r = state.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e) {
    e.preventDefault();
    state.drawing = true; state.last = pos(e);
    try { state.canvas.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function move(e) {
    if (!state.drawing) return;
    e.preventDefault();
    var ctx = state.ctx; if (!ctx) return;
    var p = pos(e), l = state.last;
    if (state.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = ERASER_WIDTH; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = state.color; ctx.lineWidth = PEN_WIDTH; }
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    state.last = p;
  }
  function up() { state.drawing = false; state.last = null; }

  function clearAll() {
    var cv = state.canvas, ctx = state.ctx; if (!ctx) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore();
  }

  function toggle() {
    state.open = !state.open;
    if (state.open) { build(); state.box.style.display = 'block'; fit(); }
    else { state.box.style.display = 'none'; }
    if (state.btn) state.btn.textContent = state.open ? '✏️ 計算メモを閉じる' : '✏️ 計算メモ（手書き）';
  }

  window.MathMemo = {
    attach: function (opt) {
      state.btn = document.getElementById(opt.btnId);
      state.box = document.getElementById(opt.boxId);
      if (!state.btn || !state.box) return;
      state.box.style.display = 'none';
      state.btn.addEventListener('click', toggle);
    },
    /* 問題を移動したら呼ぶ：書いたメモをクリア（開閉状態は維持） */
    onQuestionChange: function () { if (state.built) clearAll(); },
    /* クイズ終了などで閉じたいとき */
    close: function () { if (state.open) toggle(); }
  };
})();
