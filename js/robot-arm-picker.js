// Robot Arm Picker: a side view of an arm with three joints and a claw.
// Everything is measured in "drawing units"; the canvas scales them to fit the screen.
(function () {
  "use strict";

  var W = 800;
  var H = 560;
  var TABLE_Y = 490;
  var SHOULDER = { x: 110, y: 440 };
  var BASE_RECT = { x: 75, y: 440, w: 70, h: TABLE_Y - 440 };
  var UPPER_ARM = 220;
  var FOREARM = 200;
  var WRIST_PIECE = 50;
  var FINGER = 50;
  var BLOCK = 40;
  var HALF = BLOCK / 2;
  var BLOCK_START_X = 280;
  var BIN = { x: 480, innerHalf: 50, outerHalf: 60, top: TABLE_Y - 80, floor: TABLE_Y - 8 };
  var BIN_RECTS = [
    { x: BIN.x - BIN.outerHalf, y: BIN.top, w: BIN.outerHalf - BIN.innerHalf, h: TABLE_Y - BIN.top },
    { x: BIN.x + BIN.innerHalf, y: BIN.top, w: BIN.outerHalf - BIN.innerHalf, h: TABLE_Y - BIN.top },
    { x: BIN.x - BIN.outerHalf, y: BIN.floor, w: BIN.outerHalf * 2, h: TABLE_Y - BIN.floor }
  ];
  var MAX_GRIP = 70;
  var MAX_TILT = 20;
  var CENTER_TOLERANCE = 6;
  var GRAVITY = 900;

  var START = { shoulder: 70, elbow: -80, wrist: -80, grip: MAX_GRIP };
  var KEYS = ["shoulder", "elbow", "wrist", "grip"];

  var MSG = {
    ready: "Ready. Use the sliders to move the gripper above the block.",
    reset: "Reset. Ready to try again.",
    carrying: "Holding the block. Carry it over the bin, then open the claw to drop it.",
    dropping: "Dropping the block…",
    inBin: "Success! The block is in the bin. Press Reset to play again.",
    outside: "The block landed outside the bin. Pick it up again, or press Reset.",
    slid: "The block hit the edge of the bin and slid off. Try again, or press Reset.",
    grabbed: "Got it! The claw is gripping the block.",
    tooTight: "The claw can't close any further: the block is in the way.",
    edge: "The claw touched the edge of the block. Move the gripper sideways to center it.",
    tilted: "The claw can't close on the block while tilted. Turn the wrist so it points down.",
    table: "The arm can't go through the table.",
    bin: "The arm bumped into the bin.",
    block: "The gripper bumped the block. Line it up so the block sits between the fingers.",
    base: "The arm hit its own base."
  };

  var canvas = document.getElementById("arm-canvas");
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var inputs = {};
  var outputs = {};
  KEYS.forEach(function (key) {
    inputs[key] = document.getElementById(key);
    outputs[key] = document.getElementById(key + "-value");
  });

  var state = copy(START);
  var block = restingBlock();
  var colors = {};
  var frame = 0;
  var lastTime = 0;

  function copy(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
    return out;
  }

  function restingBlock() {
    return { mode: "resting", x: BLOCK_START_X, y: TABLE_Y - HALF };
  }

  function rad(deg) {
    return (deg * Math.PI) / 180;
  }

  // Unit step for an angle measured counter-clockwise from "right" (canvas y grows downward).
  function dir(deg) {
    return { x: Math.cos(rad(deg)), y: -Math.sin(rad(deg)) };
  }

  function along(from, d, distance) {
    return { x: from.x + d.x * distance, y: from.y + d.y * distance };
  }

  // Each joint angle adds to the one before it, so the shoulder carries everything beyond it.
  function armPose(p) {
    var a1 = p.shoulder;
    var a2 = a1 + p.elbow;
    var a3 = a2 + p.wrist;
    var p1 = along(SHOULDER, dir(a1), UPPER_ARM);
    var p2 = along(p1, dir(a2), FOREARM);
    var d3 = dir(a3);
    var p3 = along(p2, d3, WRIST_PIECE);
    var side = { x: -d3.y, y: d3.x };
    var half = p.grip / 2;
    var f1 = along(p3, side, half);
    var f2 = along(p3, side, -half);
    return {
      a3: a3, aim: d3, side: side, p1: p1, p2: p2, p3: p3,
      fingers: [
        { a: f1, b: along(f1, d3, FINGER) },
        { a: f2, b: along(f2, d3, FINGER) }
      ]
    };
  }

  // How far the gripper is from pointing straight down, in degrees.
  function tilt(a3) {
    return Math.abs((((a3 + 90) % 360) + 540) % 360 - 180);
  }

  function heldCenter(pose, b) {
    return along(pose.p3, pose.aim, b.u);
  }

  function inRect(pt, r) {
    return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
  }

  function line(a, b, step) {
    var pts = [];
    var len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    var n = Math.max(1, Math.ceil(len / step));
    for (var i = 0; i <= n; i++) {
      pts.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
    }
    return pts;
  }

  function blockCorners(pose, b) {
    var c = heldCenter(pose, b);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) {
      return {
        x: c.x + pose.side.x * s[0] * HALF + pose.aim.x * s[1] * HALF,
        y: c.y + pose.side.y * s[0] * HALF + pose.aim.y * s[1] * HALF
      };
    });
  }

  // Returns a message if the arm (or the block it holds) is touching something, else null.
  function touching(p, blk) {
    var pose = armPose(p);
    var f = pose.fingers;
    var low = [pose.p1, pose.p2, pose.p3, f[0].a, f[0].b, f[1].a, f[1].b];
    var i;
    for (i = 0; i < low.length; i++) {
      if (low[i].y > TABLE_Y + 0.5) return MSG.table;
    }

    var heldPoints = [];
    if (blk.mode === "held") {
      var c = blockCorners(pose, blk);
      for (i = 0; i < c.length; i++) {
        if (c[i].y > TABLE_Y + 8) return MSG.table;
        heldPoints = heldPoints.concat(line(c[i], c[(i + 1) % 4], 10));
      }
    }

    var armPoints = []
      .concat(line(pose.p1, pose.p2, 10), line(pose.p2, pose.p3, 10))
      .concat(line(f[0].a, f[0].b, 8), line(f[1].a, f[1].b, 8), line(f[0].a, f[1].a, 8));
    var linkPoints = line(SHOULDER, pose.p1, 10);
    var solid = armPoints.concat(heldPoints);

    for (i = 0; i < armPoints.length; i++) {
      if (inRect(armPoints[i], BASE_RECT)) return MSG.base;
    }
    var all = solid.concat(linkPoints);
    var r;
    for (i = 0; i < all.length; i++) {
      for (r = 0; r < BIN_RECTS.length; r++) {
        if (inRect(all[i], BIN_RECTS[r])) return MSG.bin;
      }
    }
    if (blk.mode === "resting") {
      // Shrunk a little so the fingers may press snugly against the sides.
      var rect = { x: blk.x - HALF + 6, y: blk.y - HALF + 6, w: BLOCK - 12, h: BLOCK - 12 };
      for (i = 0; i < armPoints.length; i++) {
        if (inRect(armPoints[i], rect)) return MSG.block;
      }
    }
    return null;
  }

  // Works out what the claw does to the block. May adjust next.grip.
  function resolveGripper(next) {
    var b = copy(block);
    var message = "";
    var pose = armPose(next);

    if (b.mode === "held") {
      if (next.grip < BLOCK) {
        next.grip = BLOCK;
        message = MSG.tooTight;
      } else if (next.grip > BLOCK) {
        var c = heldCenter(pose, b);
        b = { mode: "falling", x: c.x, y: c.y, vy: 0, slid: false };
        message = MSG.dropping;
      }
    } else if (b.mode === "resting" && next.grip < state.grip) {
      var dx = b.x - pose.p3.x;
      var dy = b.y - pose.p3.y;
      var u = dx * pose.aim.x + dy * pose.aim.y;
      var v = dx * pose.side.x + dy * pose.side.y;
      var between = Math.abs(v) <= state.grip / 2 - HALF + 0.5;
      if (between && u >= 24 && u <= 50) {
        if (tilt(pose.a3) > MAX_TILT) {
          next.grip = Math.max(next.grip, Math.min(state.grip, BLOCK + 10));
          message = MSG.tilted;
        } else if (Math.abs(v) > CENTER_TOLERANCE) {
          var touch = Math.ceil(2 * (Math.abs(v) + HALF));
          if (next.grip < touch) {
            next.grip = touch;
            message = MSG.edge;
          }
        } else if (next.grip <= BLOCK) {
          next.grip = BLOCK;
          b = { mode: "held", u: u };
          message = MSG.grabbed;
        }
      }
    }
    return { block: b, message: message };
  }

  function readSliders() {
    var out = {};
    KEYS.forEach(function (key) { out[key] = Number(inputs[key].value); });
    return out;
  }

  function degrees(n) {
    return (n < 0 ? "−" : "") + Math.abs(n) + "°";
  }

  function writeSliders() {
    KEYS.forEach(function (key) { inputs[key].value = state[key]; });
    outputs.shoulder.textContent = degrees(state.shoulder);
    outputs.elbow.textContent = degrees(state.elbow);
    outputs.wrist.textContent = degrees(state.wrist);
    outputs.grip.textContent = Math.round((state.grip / MAX_GRIP) * 100) + "%";
  }

  function inBin(b) {
    return Math.abs(b.x - BIN.x) <= BIN.innerHalf - HALF + 0.5 && b.y > BIN.top;
  }

  function idleMessage() {
    if (block.mode === "held") return MSG.carrying;
    if (block.mode === "falling") return MSG.dropping;
    return inBin(block) ? MSG.inBin : MSG.ready;
  }

  function say(text) {
    if (statusEl.textContent !== text) statusEl.textContent = text;
  }

  // Moves one slider from its last good value towards the new one, one step at a time,
  // and stops where the arm first touches something. Returns what it touched, if anything.
  function advance(next, key, blk) {
    var target = next[key];
    var step = target > state[key] ? 1 : -1;
    next[key] = state[key];
    while (next[key] !== target) {
      next[key] += step;
      var hit = touching(next, blk);
      if (hit) {
        next[key] -= step;
        return hit;
      }
    }
    return null;
  }

  function onInput(e) {
    var key = e.target.getAttribute("data-key");
    var next = readSliders();
    var res = resolveGripper(next);
    var message = res.message;
    var hit = advance(next, key, res.block);

    if (hit) {
      message = hit;
      if (key === "grip" && res.block.mode !== block.mode) {
        // The claw stopped short, so the grab or release didn't happen.
        next.grip = state.grip;
        res = { block: block, message: "" };
      }
    }

    state = next;
    block = res.block;
    writeSliders();
    say(message || idleMessage());
    if (block.mode === "falling") startFalling();
    draw();
  }

  // Moves a falling block one small step. Returns true when it has landed.
  function stepBlock(dt) {
    var b = block;
    var d = b.x - BIN.x;
    var inside = Math.abs(d) <= BIN.innerHalf - HALF + 0.5;
    var onRim = !inside && Math.abs(d) < BIN.outerHalf + HALF;
    var support = inside ? BIN.floor : onRim ? BIN.top : TABLE_Y;
    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;
    if (b.y + HALF >= support) {
      b.y = support - HALF;
      b.vy = 0;
      if (support === BIN.top) {
        b.slid = true;
        b.x += (d < 0 ? -1 : 1) * 160 * dt; // slides off the rim of the bin
        return false;
      }
      return true;
    }
    return false;
  }

  function land() {
    var slid = block.slid;
    block = { mode: "resting", x: block.x, y: block.y };
    say(inBin(block) ? MSG.inBin : slid ? MSG.slid : MSG.outside);
    draw();
  }

  function startFalling() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var guard = 0;
      while (!stepBlock(0.02) && guard++ < 2000) { /* jump straight to the landing spot */ }
      land();
      return;
    }
    if (!frame) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    var dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016;
    lastTime = now;
    frame = 0;
    if (block.mode !== "falling") return;
    if (stepBlock(dt)) {
      land();
      return;
    }
    draw();
    frame = requestAnimationFrame(tick);
  }

  function reset() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    state = copy(START);
    block = restingBlock();
    writeSliders();
    say(MSG.reset);
    draw();
  }

  function readColors() {
    var style = getComputedStyle(document.documentElement);
    ["bg", "table", "arm", "joint", "block", "bin"].forEach(function (name) {
      colors[name] = style.getPropertyValue("--sim-" + name).trim();
    });
  }

  function fillRect(r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  function stroke(points, width, color) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function draw() {
    var pose = armPose(state);
    var f = pose.fingers;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    fillRect({ x: 0, y: 0, w: W, h: H }, colors.bg);
    fillRect({ x: 0, y: TABLE_Y, w: W, h: H - TABLE_Y }, colors.table);
    BIN_RECTS.forEach(function (r) { fillRect(r, colors.bin); });
    fillRect(BASE_RECT, colors.arm);

    // The block, drawn before the arm so the fingers appear in front of it.
    ctx.save();
    if (block.mode === "held") {
      var c = heldCenter(pose, block);
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.atan2(pose.aim.y, pose.aim.x) - Math.PI / 2);
    } else {
      ctx.translate(block.x, block.y);
    }
    ctx.fillStyle = colors.block;
    ctx.fillRect(-HALF, -HALF, BLOCK, BLOCK);
    ctx.restore();

    stroke([SHOULDER, pose.p1, pose.p2], 14, colors.arm);
    stroke([pose.p2, pose.p3], 10, colors.arm);
    stroke([f[0].a, f[1].a], 6, colors.arm);
    stroke([f[0].a, f[0].b], 6, colors.arm);
    stroke([f[1].a, f[1].b], 6, colors.arm);

    [SHOULDER, pose.p1, pose.p2, pose.p3].forEach(function (pt) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = colors.joint;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.arm;
      ctx.stroke();
    });
  }

  // Keep the drawing sharp on high-resolution screens while it scales to fit.
  function resize() {
    var width = canvas.clientWidth;
    if (!width) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round((width * dpr * H) / W);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.width / W, 0, 0);
    draw();
  }

  KEYS.forEach(function (key) { inputs[key].addEventListener("input", onInput); });
  document.getElementById("reset").addEventListener("click", reset);

  // Redraw in the new colors whenever the theme is switched.
  new MutationObserver(function () {
    readColors();
    draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  readColors();
  writeSliders();
  say(MSG.ready);
  resize();
})();
