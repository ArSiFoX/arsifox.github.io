const canvas = document.getElementById("game-canvas");
const ctx = canvas?.getContext("2d");

const scoreEl = document.getElementById("score");
const targetsLeftEl = document.getElementById("targets-left");
const projectileNameEl = document.getElementById("projectile-name");
const restartBtn = document.getElementById("restart-btn");

if (!canvas || !ctx || !scoreEl || !targetsLeftEl || !projectileNameEl || !restartBtn) {
  throw new Error("Game init failed: required elements are missing.");
}

const PROJECTILE_PRESETS = {
  light: {
    mass: 0.78,
    radius: 22,
    launchMultiplier: 1.1,
    restitution: 0.58,
    groundFriction: 0.83,
    airDrag: 0.35,
    damage: 18,
    lifetime: 3,
    fadeDuration: 0.28,
  },
  medium: {
    mass: 1,
    radius: 25,
    launchMultiplier: 1,
    restitution: 0.45,
    groundFriction: 0.87,
    airDrag: 0.22,
    damage: 24,
    lifetime: 3,
    fadeDuration: 0.28,
  },
  heavy: {
    mass: 1.45,
    radius: 28,
    launchMultiplier: 0.9,
    restitution: 0.3,
    groundFriction: 0.91,
    airDrag: 0.14,
    damage: 34,
    lifetime: 3,
    fadeDuration: 0.28,
  },
  tank: {
    mass: 1.9,
    radius: 31,
    launchMultiplier: 0.83,
    restitution: 0.2,
    groundFriction: 0.93,
    airDrag: 0.1,
    damage: 44,
    lifetime: 3,
    fadeDuration: 0.28,
  },
};

const ICON_CATALOG = [
  { name: "C++", src: "../icons/cpp.png", preset: "heavy" },
  { name: "C#", src: "../icons/csharp.png", preset: "medium" },
  { name: "Visual Studio", src: "../icons/visual_studio.png", preset: "medium" },
  { name: "GitHub", src: "../icons/github.png", preset: "light" },
  { name: "ChatGPT", src: "../icons/chatgpt.png", preset: "light" },
  { name: "Python", src: "../icons/python.png", preset: "medium" },
  { name: "Linux", src: "../icons/linux.png", preset: "heavy" },
  { name: "Lua", src: "../icons/lua.png", preset: "light" },
  { name: "Windows", src: "../icons/windows.png", preset: "tank" },
];

const ASCII_TARGETS = [
  [" /\\_/\\ ", "( o.o )", " > ^ < "],
  [" [===] ", " |o o| ", " |_-_| "],
  ["  ___  ", " /_ _\\ ", "| |_| |", " \\___/ "],
  [" .----. ", "/ .-. \\", "| | | |", "\\ '-' /", " '---' "],
];

const WORLD = {
  gravity: 980,
  width: 1600,
  height: 900,
  groundY: 802,
};

const SIM = {
  fixedStep: 1 / 120,
  maxFrame: 1 / 20,
  maxSubsteps: 8,
};

const LAUNCH = {
  minBackwardPull: 24,
  minPullDistance: 34,
  minAngle: (9 * Math.PI) / 180,
  maxAngle: (79 * Math.PI) / 180,
  snapDuration: 0.16,
};

const sling = {
  x: 292,
  y: 710,
  maxStretch: 246,
  bandY: 630,
  queueBaseX: 118,
};

let idCounter = 0;
let lastTimestamp = 0;
let accumulator = 0;
let animationClock = 0;
let score = 0;

let targets = [];
let particles = [];
let firedProjectiles = [];
let queuedProjectiles = [];
let activeProjectile = null;
let dragPointerId = null;
let isDragging = false;

const backgroundCanvas = document.createElement("canvas");
const backgroundCtx = backgroundCanvas.getContext("2d");

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nextId() {
  idCounter += 1;
  return idCounter;
}

function preloadIcons() {
  ICON_CATALOG.forEach((icon) => {
    const img = new Image();
    img.decoding = "async";
    img.src = icon.src;
    icon.img = img;
  });
}

function pickIcon() {
  return ICON_CATALOG[Math.floor(Math.random() * ICON_CATALOG.length)];
}

function createProjectileSeed() {
  const icon = pickIcon();
  const preset = PROJECTILE_PRESETS[icon.preset] || PROJECTILE_PRESETS.medium;
  return {
    id: nextId(),
    icon,
    preset,
    idlePhase: rand(0, Math.PI * 2),
  };
}

function refillQueue() {
  while (queuedProjectiles.length < 3) {
    queuedProjectiles.push(createProjectileSeed());
  }
}

function promoteNextProjectile() {
  refillQueue();
  const seed = queuedProjectiles.shift();
  refillQueue();
  activeProjectile = {
    x: sling.x,
    y: sling.y,
    seed,
    r: seed.preset.radius,
    pullDistance: 0,
    validPull: false,
    snapback: null,
  };
  projectileNameEl.textContent = seed.icon.name;
}

function createTarget(x, y, art) {
  return {
    id: nextId(),
    x,
    y,
    w: 130,
    h: 96,
    art,
    hp: rand(80, 120),
    destroyed: false,
    shake: 0,
    hitFlash: 0,
  };
}

function makeTargets() {
  targets = [];
  const count = 4;
  for (let i = 0; i < count; i += 1) {
    const art = ASCII_TARGETS[Math.floor(Math.random() * ASCII_TARGETS.length)];
    const x = 980 + Math.floor(i / 2) * 210 + rand(-18, 20);
    const y = 430 + (i % 2) * 152 + rand(-14, 14);
    targets.push(createTarget(x, y, art));
  }
}

function updateHud() {
  scoreEl.textContent = String(score);
  const aliveTargets = targets.filter((t) => !t.destroyed).length;
  targetsLeftEl.textContent = String(aliveTargets);
}

function worldFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WORLD.width / rect.width;
  const scaleY = WORLD.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function setDraggingState(value) {
  isDragging = value;
  document.body.classList.toggle("is-aiming", value);
}

function canStartDrag(point) {
  if (!activeProjectile || activeProjectile.snapback) return false;
  const ballDist = Math.hypot(point.x - activeProjectile.x, point.y - activeProjectile.y);
  if (ballDist <= activeProjectile.r + 24) return true;
  const slingDist = Math.hypot(point.x - sling.x, point.y - sling.y);
  return slingDist <= 96;
}

function updateDragPoint(point) {
  if (!activeProjectile) return;

  let dx = point.x - sling.x;
  let dy = point.y - sling.y;

  dx = clamp(dx, -sling.maxStretch, 38);
  dy = clamp(dy, -sling.maxStretch * 0.95, sling.maxStretch * 0.95);

  const len = Math.hypot(dx, dy);
  if (len > sling.maxStretch) {
    const ratio = sling.maxStretch / len;
    dx *= ratio;
    dy *= ratio;
  }

  activeProjectile.x = sling.x + dx;
  const maxY = WORLD.groundY - activeProjectile.r - 2;
  activeProjectile.y = Math.min(sling.y + dy, maxY);

  const pullX = sling.x - activeProjectile.x;
  const pullY = sling.y - activeProjectile.y;
  activeProjectile.pullDistance = Math.hypot(pullX, pullY);
  activeProjectile.validPull =
    pullX >= LAUNCH.minBackwardPull && activeProjectile.pullDistance >= LAUNCH.minPullDistance;
}

function beginSnapback() {
  if (!activeProjectile) return;
  activeProjectile.snapback = {
    fromX: activeProjectile.x,
    fromY: activeProjectile.y,
    t: 0,
    duration: LAUNCH.snapDuration,
  };
}

function computeLaunchVelocity() {
  if (!activeProjectile) return null;

  const pullX = sling.x - activeProjectile.x;
  const pullY = sling.y - activeProjectile.y;
  const pullDistance = Math.hypot(pullX, pullY);

  if (pullX < LAUNCH.minBackwardPull || pullDistance < LAUNCH.minPullDistance) {
    return null;
  }

  let angle = Math.atan2(-pullY, pullX);
  angle = clamp(angle, LAUNCH.minAngle, LAUNCH.maxAngle);

  const preset = activeProjectile.seed.preset;
  const stretchRatio = clamp(pullDistance / sling.maxStretch, 0, 1);
  const baseSpeed = 560 + 980 * Math.pow(stretchRatio, 0.9);
  const speed =
    (baseSpeed * preset.launchMultiplier) / Math.max(0.72, Math.sqrt(preset.mass * 0.95));

  return {
    vx: Math.cos(angle) * speed,
    vy: -Math.sin(angle) * speed,
    speed,
    stretchRatio,
  };
}

function launchActiveProjectile() {
  const launch = computeLaunchVelocity();
  if (!launch || !activeProjectile) {
    beginSnapback();
    return;
  }

  const { preset, icon } = activeProjectile.seed;
  const fired = {
    id: nextId(),
    x: activeProjectile.x,
    y: Math.min(activeProjectile.y, WORLD.groundY - activeProjectile.r - 2),
    vx: launch.vx,
    vy: launch.vy,
    r: preset.radius,
    mass: preset.mass,
    restitution: preset.restitution,
    groundFriction: preset.groundFriction,
    airDrag: preset.airDrag,
    damage: preset.damage,
    lifetime: preset.lifetime,
    fadeDuration: preset.fadeDuration,
    age: 0,
    fadeAge: 0,
    alpha: 1,
    rotation: 0,
    angularV: rand(-2.4, 2.4),
    restTimer: 0,
    sleeping: false,
    label: icon.name,
    icon,
  };

  firedProjectiles.push(fired);
  if (firedProjectiles.length > 18) {
    firedProjectiles.splice(0, firedProjectiles.length - 18);
  }

  promoteNextProjectile();
}

function onPointerDown(event) {
  if (!activeProjectile) return;

  const point = worldFromClient(event.clientX, event.clientY);
  if (!canStartDrag(point)) return;

  dragPointerId = event.pointerId;
  setDraggingState(true);

  canvas.setPointerCapture(event.pointerId);
  updateDragPoint(point);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!isDragging || event.pointerId !== dragPointerId) return;
  updateDragPoint(worldFromClient(event.clientX, event.clientY));
  event.preventDefault();
}

function endDrag(event) {
  if (!isDragging || event.pointerId !== dragPointerId) return;

  setDraggingState(false);
  dragPointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  launchActiveProjectile();
  event.preventDefault();
}

function cancelDrag() {
  if (!isDragging) return;
  setDraggingState(false);
  dragPointerId = null;
  beginSnapback();
}

function circleRectHit(circle, rect) {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

function applyWorldCollisions(p) {
  const wallFriction = 0.98;

  if (p.x - p.r < 0) {
    p.x = p.r;
    p.vx = Math.abs(p.vx) * p.restitution;
    p.vy *= wallFriction;
  } else if (p.x + p.r > WORLD.width) {
    p.x = WORLD.width - p.r;
    p.vx = -Math.abs(p.vx) * p.restitution;
    p.vy *= wallFriction;
  }

  if (p.y - p.r < 0) {
    p.y = p.r;
    p.vy = Math.abs(p.vy) * p.restitution;
    p.vx *= wallFriction;
  }

  if (p.y + p.r > WORLD.groundY) {
    p.y = WORLD.groundY - p.r;
    if (p.vy > 0) p.vy = -p.vy * p.restitution;
    p.vx *= p.groundFriction;

    if (Math.abs(p.vy) < 24) p.vy = 0;
    if (Math.abs(p.vx) < 14 && Math.abs(p.vy) < 8) {
      p.restTimer += SIM.fixedStep;
      if (p.restTimer > 0.34) p.sleeping = true;
    } else {
      p.restTimer = 0;
      p.sleeping = false;
    }
  }
}

function hitTargets(projectile) {
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (target.destroyed) continue;
    if (!circleRectHit(projectile, target)) continue;

    const speed = Math.hypot(projectile.vx, projectile.vy);
    const impact = projectile.damage * (1 + speed * 0.018) * (0.58 + projectile.mass * 0.24);

    target.hp -= impact;
    target.shake = Math.min(0.26, target.shake + 0.1);
    target.hitFlash = 0.12;

    const carry = clamp(0.54 + projectile.mass * 0.19, 0.6, 0.88);
    projectile.vx *= carry;
    projectile.vy *= 0.72;

    if (target.hp <= 0) {
      target.destroyed = true;
      score += 120;
      spawnBurst(projectile.x, projectile.y, 26);
    } else {
      score += 20;
      spawnBurst(projectile.x, projectile.y, 10);
    }
  }
}

function updateActiveProjectile(step) {
  if (!activeProjectile || !activeProjectile.snapback) return;
  const snap = activeProjectile.snapback;
  snap.t += step / snap.duration;
  const t = clamp(snap.t, 0, 1);
  const eased = 1 - Math.pow(1 - t, 3);
  activeProjectile.x = snap.fromX + (sling.x - snap.fromX) * eased;
  activeProjectile.y = snap.fromY + (sling.y - snap.fromY) * eased;
  if (t >= 1) {
    activeProjectile.x = sling.x;
    activeProjectile.y = sling.y;
    activeProjectile.snapback = null;
  }
}

function updateFiredProjectiles(step) {
  for (let i = firedProjectiles.length - 1; i >= 0; i -= 1) {
    const p = firedProjectiles[i];

    p.age += step;

    if (!p.sleeping) {
      const drag = Math.max(0.7, 1 - p.airDrag * step);
      p.vx *= drag;
      p.vy *= drag;

      p.vy += WORLD.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += (p.angularV + p.vx * 0.0014) * step * 60;

      applyWorldCollisions(p);
      hitTargets(p);
    } else {
      p.vx *= 0.92;
      p.rotation *= 0.96;
    }

    if (p.age > p.lifetime) {
      p.fadeAge += step;
      p.alpha = 1 - p.fadeAge / p.fadeDuration;
    }

    if (p.alpha <= 0 || p.y > WORLD.height + 130) {
      firedProjectiles.splice(i, 1);
    }
  }
}

function updateTargets(step) {
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const t = targets[i];
    t.shake = Math.max(0, t.shake - step * 2.4);
    t.hitFlash = Math.max(0, t.hitFlash - step * 3.6);
    if (t.destroyed) targets.splice(i, 1);
  }

  if (targets.length === 0) {
    makeTargets();
  }
}

function spawnBurst(x, y, amount) {
  const count = Math.min(38, amount);
  for (let i = 0; i < count; i += 1) {
    if (particles.length >= 150) {
      particles.splice(0, particles.length - 149);
    }
    const speed = rand(90, 300);
    const angle = rand(0, Math.PI * 2);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.22, 0.62),
      size: rand(2, 4.2),
    });
  }
}

function updateParticles(step) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= step;
    p.vy += 860 * step;
    p.vx *= 0.992;
    p.vy *= 0.992;
    p.x += p.vx * step;
    p.y += p.vy * step;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateSimulation(step) {
  updateActiveProjectile(step);
  updateFiredProjectiles(step);
  updateTargets(step);
  updateParticles(step);
  updateHud();
}

function rebuildStaticBackground() {
  backgroundCanvas.width = WORLD.width;
  backgroundCanvas.height = WORLD.height;

  if (!backgroundCtx) return;

  backgroundCtx.clearRect(0, 0, WORLD.width, WORLD.height);
  backgroundCtx.fillStyle = "#081821";
  backgroundCtx.fillRect(0, 0, WORLD.width, WORLD.height);

  const sky = backgroundCtx.createLinearGradient(0, 0, 0, WORLD.height);
  sky.addColorStop(0, "rgba(37, 142, 128, 0.22)");
  sky.addColorStop(1, "rgba(5, 10, 16, 0)");
  backgroundCtx.fillStyle = sky;
  backgroundCtx.fillRect(0, 0, WORLD.width, WORLD.height);

  backgroundCtx.fillStyle = "#0f2c2f";
  backgroundCtx.fillRect(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);

  backgroundCtx.strokeStyle = "rgba(120, 255, 196, 0.25)";
  backgroundCtx.lineWidth = 2;
  for (let x = 0; x <= WORLD.width; x += 80) {
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(x, WORLD.groundY);
    backgroundCtx.lineTo(x + 24, WORLD.height);
    backgroundCtx.stroke();
  }

  backgroundCtx.fillStyle = "rgba(36, 70, 61, 0.85)";
  backgroundCtx.fillRect(sling.queueBaseX - 44, WORLD.groundY - 12, 244, 12);
}

function drawOrb(x, y, radius, icon, label, alpha, rotation) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const shellGradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.38, 6, 0, 0, radius + 8);
  shellGradient.addColorStop(0, "rgba(206, 255, 233, 0.98)");
  shellGradient.addColorStop(1, "rgba(46, 232, 150, 0.92)");
  ctx.fillStyle = shellGradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(215, 255, 235, 0.95)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  const iconImg = icon?.img;
  if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
    const size = radius * 1.62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 2.6, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(iconImg, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = "#07362a";
    ctx.font = `bold ${Math.max(10, radius * 0.42)}px JetBrains Mono`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 1);
  }

  ctx.beginPath();
  ctx.strokeStyle = "rgba(12, 88, 59, 0.65)";
  ctx.lineWidth = 1.2;
  ctx.arc(0, 0, radius - 2.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTargets() {
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const shakeX = t.shake > 0 ? Math.sin(animationClock * 70 + t.id) * t.shake * 16 : 0;
    const shakeY = t.shake > 0 ? Math.cos(animationClock * 62 + t.id * 0.77) * t.shake * 8 : 0;
    const x = t.x + shakeX;
    const y = t.y + shakeY;

    ctx.save();
    ctx.fillStyle = t.hitFlash > 0 ? "rgba(42, 114, 112, 0.95)" : "rgba(9, 33, 39, 0.88)";
    ctx.strokeStyle = "rgba(94, 255, 181, 0.35)";
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, t.w, t.h);
    ctx.strokeRect(x, y, t.w, t.h);
    ctx.fillStyle = "#90ffd1";
    ctx.font = "15px JetBrains Mono";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let j = 0; j < t.art.length; j += 1) {
      ctx.fillText(t.art[j], x + 12, y + 10 + j * 17);
    }
    ctx.restore();
  }
}

function drawQueue() {
  for (let i = 0; i < queuedProjectiles.length; i += 1) {
    const q = queuedProjectiles[i];
    const baseX = sling.queueBaseX + i * 62;
    const floatY = Math.sin(animationClock * 4.2 + q.idlePhase) * 3.4;
    const r = q.preset.radius * (0.66 - i * 0.05);
    drawOrb(baseX, WORLD.groundY - r - 3 + floatY, r, q.icon, q.icon.name, 0.92 - i * 0.1, 0);
  }
}

function drawSling() {
  const leftArmX = sling.x - 26;
  const rightArmX = sling.x + 26;
  const forkTopY = sling.y - 146;
  const bandY = sling.bandY;

  const woodGradient = ctx.createLinearGradient(sling.x - 40, sling.y - 180, sling.x + 40, sling.y + 10);
  woodGradient.addColorStop(0, "#7f5633");
  woodGradient.addColorStop(0.5, "#5a3a24");
  woodGradient.addColorStop(1, "#3c2719");

  ctx.fillStyle = woodGradient;
  ctx.fillRect(sling.x - 20, sling.y - 10, 40, 120);
  ctx.strokeStyle = "rgba(216, 168, 106, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(sling.x - 20, sling.y - 10, 40, 120);

  ctx.strokeStyle = woodGradient;
  ctx.lineWidth = 24;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(leftArmX, sling.y + 4);
  ctx.lineTo(leftArmX + 4, forkTopY + 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightArmX, sling.y + 4);
  ctx.lineTo(rightArmX - 4, forkTopY + 24);
  ctx.stroke();

  ctx.strokeStyle = "rgba(225, 178, 118, 0.75)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(leftArmX + 2, sling.y - 6);
  ctx.lineTo(leftArmX + 6, forkTopY + 22);
  ctx.moveTo(rightArmX - 2, sling.y - 6);
  ctx.lineTo(rightArmX - 6, forkTopY + 22);
  ctx.stroke();

  if (!activeProjectile) return;

  const px = activeProjectile.x;
  const py = activeProjectile.y;
  const showBand = isDragging || activeProjectile.snapback;

  if (showBand) {
    const bandGradient = ctx.createLinearGradient(leftArmX, bandY, px, py);
    bandGradient.addColorStop(0, "#3a2618");
    bandGradient.addColorStop(1, "#5f4028");
    ctx.strokeStyle = bandGradient;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(leftArmX + 1, bandY);
    ctx.lineTo(px, py);
    ctx.lineTo(rightArmX - 1, bandY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(233, 214, 187, 0.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftArmX + 1, bandY - 2);
    ctx.lineTo(px, py);
    ctx.lineTo(rightArmX - 1, bandY - 2);
    ctx.stroke();

    ctx.fillStyle = activeProjectile.validPull
      ? "rgba(92, 65, 41, 0.98)"
      : "rgba(120, 48, 48, 0.94)";
    ctx.fillRect(px - 14, py - 9, 28, 18);
    ctx.strokeStyle = "rgba(207, 158, 108, 0.8)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(px - 14, py - 9, 28, 18);
  }
}

function drawTrajectoryPreview() {
  if (!activeProjectile || !isDragging) return;

  const launch = computeLaunchVelocity();
  const valid = Boolean(launch);
  const startX = activeProjectile.x;
  const startY = activeProjectile.y;
  let vx = valid ? launch.vx : 0;
  let vy = valid ? launch.vy : 0;
  let x = startX;
  let y = startY;

  ctx.fillStyle = valid ? "rgba(164, 255, 215, 0.68)" : "rgba(255, 128, 128, 0.7)";
  for (let i = 0; i < 30; i += 1) {
    const step = 1 / 60;
    vx *= Math.max(0.7, 1 - 0.22 * step);
    vy *= Math.max(0.7, 1 - 0.12 * step);
    vy += WORLD.gravity * step;
    x += vx * step;
    y += vy * step;

    if (i % 2 === 0) {
      const alpha = Math.max(0.1, 1 - i / 32);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, valid ? 3.4 : 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (y > WORLD.groundY) break;
  }
}

function drawFiredProjectiles() {
  for (let i = 0; i < firedProjectiles.length; i += 1) {
    const p = firedProjectiles[i];
    drawOrb(p.x, p.y, p.r, p.icon, p.label, Math.max(0, p.alpha), p.rotation);
  }
}

function drawActiveProjectile() {
  if (!activeProjectile) return;
  drawOrb(
    activeProjectile.x,
    activeProjectile.y,
    activeProjectile.r,
    activeProjectile.seed.icon,
    activeProjectile.seed.icon.name,
    1,
    0
  );
}

function drawParticles() {
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    ctx.globalAlpha = Math.max(0, p.life * 1.25);
    ctx.fillStyle = "#a5ffd7";
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }
}

function drawGuide() {
  ctx.fillStyle = "rgba(137, 255, 206, 0.86)";
  ctx.font = "16px JetBrains Mono";
  ctx.textAlign = "left";
  ctx.fillText("Очередь шаров слева. Тяни только назад и отпускай.", 34, 54);
}

function render() {
  ctx.drawImage(backgroundCanvas, 0, 0);
  drawTrajectoryPreview();
  drawQueue();
  drawSling();
  drawTargets();
  drawFiredProjectiles();
  drawActiveProjectile();
  drawParticles();
  drawGuide();
}

function resetRound() {
  score = 0;
  accumulator = 0;
  targets = [];
  particles = [];
  firedProjectiles = [];
  queuedProjectiles = [];
  activeProjectile = null;
  setDraggingState(false);
  dragPointerId = null;

  makeTargets();
  refillQueue();
  promoteNextProjectile();
  updateHud();
}

function loop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const frame = Math.min(SIM.maxFrame, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  animationClock = timestamp / 1000;
  accumulator += frame;

  let steps = 0;
  while (accumulator >= SIM.fixedStep && steps < SIM.maxSubsteps) {
    updateSimulation(SIM.fixedStep);
    accumulator -= SIM.fixedStep;
    steps += 1;
  }
  if (steps === SIM.maxSubsteps) accumulator = 0;

  render();
  requestAnimationFrame(loop);
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("lostpointercapture", cancelDrag);
restartBtn.addEventListener("click", resetRound);

preloadIcons();
rebuildStaticBackground();
resetRound();
requestAnimationFrame(loop);
