const root = document.documentElement;
const savedHue = localStorage.getItem("site-hue");
const savedTheme = localStorage.getItem("theme");

if (savedHue) {
  root.style.setProperty("--accent-h", savedHue);
}

const isLightTheme = savedTheme === "light";
if (isLightTheme) {
  document.body.classList.add("light-theme");
}

const canvas = document.getElementById("game-canvas");
const ctx = canvas?.getContext("2d");

const scoreEl = document.getElementById("score");
const targetsLeftEl = document.getElementById("targets-left");
const projectileNameEl = document.getElementById("projectile-name");
const restartBtn = document.getElementById("restart-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");

if (!canvas || !ctx || !scoreEl || !targetsLeftEl || !projectileNameEl || !restartBtn) {
  throw new Error("Game init failed: required elements are missing.");
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", () => {
    const wrap = document.querySelector(".canvas-wrap");
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (wrap.requestFullscreen) {
        wrap.requestFullscreen();
      } else if (wrap.webkitRequestFullscreen) {
        wrap.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  });
}

function handleFullscreenChange() {
  if (fullscreenBtn) {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      fullscreenBtn.textContent = "Свернуть";
    } else {
      fullscreenBtn.textContent = "На весь экран";
    }
  }
}

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

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
  { name: "ChatGPT", src: "../icons/chatgpt.png", preset: "light" },
  { name: "Python", src: "../icons/python.png", preset: "medium" },
  { name: "Linux", src: "../icons/linux.png", preset: "heavy" },
  { name: "Lua", src: "../icons/lua.png", preset: "light" },
  { name: "Windows", src: "../icons/windows.png", preset: "tank" },
  { name: "Android", src: "../icons/android.png", preset: "medium" },
  { name: "Angry Bird", src: "../icons/angry_bird.png", preset: "medium" },
  { name: "Apple", src: "../icons/apple.png", preset: "medium" },
  { name: "ASM", src: "../icons/asm.png", preset: "heavy" },
];

const ASCII_TARGETS = [
  [" /\\_/\\ ", "( o.o )", " > ^ < "],
  [" [===] ", " |o o| ", " |_-_| "],
  ["  ___  ", " /_ _\\ ", "| |_| |", " \\___/ "],
  [" .----. ", "/ .-. \\", "| | | |", "\\ '-' /", " '---' "],
];

const WORLD = {
  gravity: 1100, // Increased gravity for a heavier feel
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
  minBackwardPull: 15,
  minPullDistance: 20,
  minAngle: (0 * Math.PI) / 180,
  maxAngle: (90 * Math.PI) / 180,
  snapDuration: 0.1,
  velocityMultiplier: 11.0, // Further reduced power
};



const sling = {
  x: 292,
  y: 710,
  maxStretch: 220, 
  bandY: 630,
  queueBaseX: 118,
  shake: 0,
};

let idCounter = 0;
let lastTimestamp = 0;
let accumulator = 0;
let animationClock = 0;
let score = 0;

let fps = 0;
let frameTimes = [];

let targets = [];
let particles = [];
let firedProjectiles = [];
let queuedProjectiles = [];
let activeProjectile = null;
let dragPointerId = null;
let isDragging = false;

const backgroundCanvas = document.createElement("canvas");
const backgroundCtx = backgroundCanvas.getContext("2d");

function integratePhysics(p, step) {
  // Air resistance (drag)
  const drag = 1 - (p.airDrag || 0.1) * step;
  p.vx *= drag;
  p.vy *= drag;

  // Update position using current velocity
  p.x += p.vx * step;
  p.y += p.vy * step;

  // Apply gravity for the next step
  p.vy += WORLD.gravity * step;

  // No continuous spin based on velocity - only slow initial rotation
  p.rotation += p.angularV * step * 60;
}
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
    y: sling.bandY,
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
  const slingDist = Math.hypot(point.x - sling.x, point.y - sling.bandY);
  return slingDist <= 96;
}

function updateDragPoint(point) {
  if (!activeProjectile) return;

  // Calculate offsets from band height
  let dx = point.x - sling.x;
  let dy = point.y - sling.bandY;

  // Constraint: Limit pull distance to maxStretch (but allow any direction)
  const pullDistance = Math.hypot(dx, dy);
  if (pullDistance > sling.maxStretch) {
    const ratio = sling.maxStretch / pullDistance;
    dx *= ratio;
    dy *= ratio;
  }

  activeProjectile.x = sling.x + dx;
  activeProjectile.y = sling.bandY + dy;

  // Update pull metrics for launch calculation
  activeProjectile.pullDistance = Math.hypot(dx, dy);
  activeProjectile.validPull = activeProjectile.pullDistance >= LAUNCH.minPullDistance;
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

  // Vector from Projectile to Band center
  const dx = sling.x - activeProjectile.x;
  const dy = sling.bandY - activeProjectile.y;
  const pullDistance = Math.hypot(dx, dy);

  if (pullDistance < LAUNCH.minPullDistance) {
    return null;
  }

  // The speed is proportional to how far we pull
  const speedScale = LAUNCH.velocityMultiplier / Math.sqrt(activeProjectile.seed.preset.mass);
  
  // VX and VY must be a direct reflection of DX and DY
  return {
    vx: dx * speedScale,
    vy: dy * speedScale,
    speed: pullDistance * speedScale,
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
    y: activeProjectile.y,
    vx: launch.vx,
    vy: launch.vy,
    r: preset.radius,
    mass: preset.mass,
    restitution: preset.restitution,
    groundFriction: preset.groundFriction,
    airDrag: preset.airDrag,
    damage: preset.damage,
    lifetime: 4.5,
    fadeDuration: 0.5,
    age: 0,
    fadeAge: 0,
    alpha: 1,
    rotation: 0,
    angularV: rand(-0.1, 0.1), // Nearly no spin, very calm
    restTimer: 0,
    sleeping: false,
    label: icon.name,
    icon,
  };

  firedProjectiles.push(fired);
  if (firedProjectiles.length > 256) {
    firedProjectiles.shift();
  }

  sling.shake = 1.2;

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
  if (p.y + p.r > WORLD.groundY && p.vy > 0) {
    p.y = WORLD.groundY - p.r;
    
    if (p.vy > 40) {
      p.vy = -p.vy * p.restitution;
    } else {
      p.vy = 0;
    }
    
    p.vx *= p.groundFriction;
    
    if (Math.abs(p.vx) < 25 && Math.abs(p.vy) < 20) {
      p.restTimer += SIM.fixedStep;
      if (p.restTimer > 0.5) {
        p.sleeping = true;
        p.vx = 0;
        p.vy = 0;
      }
    } else {
      p.restTimer = 0;
    }
  }

  const wallRest = 0.6;
  if (p.x - p.r < 0 && p.vx < 0) {
    p.x = p.r;
    p.vx = -p.vx * wallRest;
  } else if (p.x + p.r > WORLD.width && p.vx > 0) {
    p.x = WORLD.width - p.r;
    p.vx = -p.vx * wallRest;
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
    target.shake = Math.min(0.26, target.shake + 0.12);
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
  activeProjectile.y = snap.fromY + (sling.bandY - snap.fromY) * eased;
  if (t >= 1) {
    activeProjectile.x = sling.x;
    activeProjectile.y = sling.bandY;
    activeProjectile.snapback = null;
  }
}

function updateFiredProjectiles(step) {
  for (let i = firedProjectiles.length - 1; i >= 0; i -= 1) {
    const p = firedProjectiles[i];

    p.age += step;

    if (!p.sleeping) {
      integratePhysics(p, step);
      applyWorldCollisions(p);
      hitTargets(p);
    } else {
      p.vx *= 0.9;
      p.rotation *= 0.95;
    }

    if (p.age > p.lifetime) {
      p.fadeAge += step;
      p.alpha = 1 - p.fadeAge / p.fadeDuration;
    }

    if (p.alpha <= 0 || p.y > WORLD.height + 150) {
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
  sling.shake = Math.max(0, sling.shake - step * 4);
  updateHud();
}

function rebuildStaticBackground() {
  backgroundCanvas.width = WORLD.width;
  backgroundCanvas.height = WORLD.height;

  if (!backgroundCtx) return;

  backgroundCtx.clearRect(0, 0, WORLD.width, WORLD.height);
  // Match main site backgrounds
  const bgS = isLightTheme ? "25%" : "35%";
  const bg0L = isLightTheme ? "98%" : "4%";
  const bg1L = isLightTheme ? "95%" : "7%";

  backgroundCtx.fillStyle = `hsl(${savedHue || 177}, ${bgS}, ${bg0L})`;
  backgroundCtx.fillRect(0, 0, WORLD.width, WORLD.height);

  const sky = backgroundCtx.createLinearGradient(0, 0, 0, WORLD.height);
  const skyAlpha = isLightTheme ? 0.08 : 0.12;
  sky.addColorStop(0, `hsla(${savedHue || 177}, 60%, 33%, ${skyAlpha})`);
  sky.addColorStop(1, "rgba(5, 10, 16, 0)");
  backgroundCtx.fillStyle = sky;
  backgroundCtx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Match main site bg-1
  backgroundCtx.fillStyle = `hsl(${savedHue || 177}, ${bgS}, ${bg1L})`;
  backgroundCtx.fillRect(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);

  const gridAlpha = isLightTheme ? 0.1 : 0.15;
  backgroundCtx.strokeStyle = `hsla(${savedHue || 177}, 100%, 74%, ${gridAlpha})`;
  backgroundCtx.lineWidth = 2;
  for (let x = 0; x <= WORLD.width; x += 80) {
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(x, WORLD.groundY);
    backgroundCtx.lineTo(x + 24, WORLD.height);
    backgroundCtx.stroke();
  }

  const queueAlpha = isLightTheme ? 0.3 : 0.5;
  backgroundCtx.fillStyle = `hsla(${savedHue || 177}, 33%, 21%, ${queueAlpha})`;
  backgroundCtx.fillRect(sling.queueBaseX - 44, WORLD.groundY - 12, 244, 12);
}

function drawOrb(x, y, radius, icon, label, alpha, rotation) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const iconImg = icon?.img;
  if (iconImg && iconImg.complete && iconImg.naturalWidth > 0) {
    // Draw only the icon, no sphere background
    const size = radius * 2.2; // Slightly larger than the radius for better visibility
    
    // Optional: subtle shadow for depth
    ctx.shadowColor = `hsla(${savedHue || 177}, 100%, 50%, 0.4)`;
    ctx.shadowBlur = isLightTheme ? 6 : 12;
    ctx.shadowOffsetY = 4;
    
    ctx.drawImage(iconImg, -size / 2, -size / 2, size, size);
  } else {
    // Fallback if image fails to load
    const orbL = isLightTheme ? "45%" : "54%";
    ctx.fillStyle = `hsl(${savedHue || 177}, 67%, ${orbL})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    const borderL = isLightTheme ? "90%" : "8%";
    ctx.strokeStyle = `hsl(${savedHue || 177}, 50%, ${borderL})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = `hsl(${savedHue || 177}, 50%, ${borderL})`;
    ctx.font = `bold ${Math.max(10, radius * 0.5)}px JetBrains Mono`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.substring(0, 2), 0, 1);
  }
  
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
    const targetBg = isLightTheme 
      ? (t.hitFlash > 0 ? `hsla(${savedHue || 177}, 46%, 85%, 0.95)` : "rgba(255, 255, 255, 0.88)")
      : (t.hitFlash > 0 ? `hsla(${savedHue || 177}, 46%, 30%, 0.95)` : "rgba(9, 33, 39, 0.88)");
    
    ctx.fillStyle = targetBg;
    ctx.strokeStyle = isLightTheme 
      ? `hsla(${savedHue || 177}, 100%, 40%, 0.35)`
      : `hsla(${savedHue || 177}, 100%, 70%, 0.35)`;
    
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, t.w, t.h);
    ctx.strokeRect(x, y, t.w, t.h);
    
    ctx.fillStyle = isLightTheme 
      ? `hsl(${savedHue || 177}, 100%, 25%)`
      : `hsl(${savedHue || 177}, 100%, 78%)`;
    
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
  const shakeX = Math.sin(animationClock * 80) * sling.shake * 12;
  const leftArmX = sling.x - 22 + shakeX;
  const rightArmX = sling.x + 22 + shakeX;
  const forkTopY = sling.y - 120;
  const bandY = sling.bandY;

  // Wood colors
  const woodDark = "#4d3319";
  const woodMid = "#734d26";
  const woodLight = "#a6733c";

  const woodGradient = ctx.createLinearGradient(sling.x - 15, sling.y, sling.x + 15, WORLD.groundY);
  woodGradient.addColorStop(0, woodMid);
  woodGradient.addColorStop(0.5, woodDark);
  woodGradient.addColorStop(1, "#261a0d");

  // Draw main handle (thinner)
  ctx.fillStyle = woodGradient;
  const handleWidth = 18;
  const handleX = sling.x - handleWidth / 2 + shakeX;
  const handleHeight = WORLD.groundY - (sling.y - 5);
  
  // Rounded handle
  ctx.beginPath();
  ctx.roundRect(handleX, sling.y - 5, handleWidth, handleHeight, [0, 0, 8, 8]);
  ctx.fill();
  
  // Handle detail/shading
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw the "Y" fork arms (thinner and more elegant)
  ctx.strokeStyle = woodMid;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Left arm
  ctx.beginPath();
  ctx.moveTo(sling.x + shakeX, sling.y);
  ctx.quadraticCurveTo(leftArmX - 5, sling.y, leftArmX, forkTopY);
  ctx.stroke();

  // Right arm
  ctx.beginPath();
  ctx.moveTo(sling.x + shakeX, sling.y);
  ctx.quadraticCurveTo(rightArmX + 5, sling.y, rightArmX, forkTopY);
  ctx.stroke();

  // Wood highlights for realism
  ctx.strokeStyle = woodLight;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(leftArmX - 3, forkTopY + 5);
  ctx.lineTo(leftArmX - 1, forkTopY + 25);
  ctx.moveTo(rightArmX + 3, forkTopY + 5);
  ctx.lineTo(rightArmX + 1, forkTopY + 25);
  ctx.stroke();

  if (!activeProjectile) return;

  const px = activeProjectile.x;
  const py = activeProjectile.y;
  const showBand = isDragging || activeProjectile.snapback;

  if (showBand) {
    // Realistic rubber bands
    ctx.lineCap = "round";
    
    // Back band
    ctx.strokeStyle = "#3d2616";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(rightArmX, bandY);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Front band (slightly lighter)
    ctx.strokeStyle = "#5c3a21";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(leftArmX, bandY);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Leather pouch
    ctx.fillStyle = "#4a2c14";
    ctx.strokeStyle = "#2b1a0a";
    ctx.lineWidth = 1;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(py - bandY, px - sling.x));
    ctx.beginPath();
    ctx.roundRect(-16, -10, 32, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawTrajectoryPreview() {
  if (!activeProjectile || !isDragging) return;

  const launch = computeLaunchVelocity();
  if (!launch) return;

  // Use the same initial state as launchActiveProjectile
  const tempP = {
    x: activeProjectile.x,
    y: activeProjectile.y,
    vx: launch.vx,
    vy: launch.vy,
    airDrag: activeProjectile.seed.preset.airDrag,
    rotation: 0,
    angularV: 0
  };

  ctx.fillStyle = isLightTheme ? `rgba(60, 60, 60, 0.68)` : `hsla(${savedHue || 177}, 100%, 82%, 0.68)`;
  const steps = 45;
  const subSteps = 3; 
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < subSteps; j++) {
        integratePhysics(tempP, 1/60 / subSteps);
    }

    if (i % 2 === 0) {
      const alpha = Math.max(0.1, 1 - i / 50);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(tempP.x, tempP.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    
    if (tempP.y > WORLD.groundY) break;
  }
  ctx.globalAlpha = 1;
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
    ctx.fillStyle = `hsl(${savedHue || 177}, 100%, 82%)`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }
}

function drawGuide() {
  ctx.fillStyle = `hsla(${savedHue || 177}, 100%, 77%, 0.86)`;
  ctx.font = "16px JetBrains Mono";
  ctx.textAlign = "left";
  ctx.fillText("Очередь шаров слева. Тяни в ЛЮБУЮ сторону и отпускай.", 34, 54);
}

function drawFPS() {
  ctx.save();
  ctx.fillStyle = `hsla(${savedHue || 177}, 100%, 64%, 0.8)`;
  ctx.font = "bold 18px JetBrains Mono";
  ctx.textAlign = "right";
  ctx.fillText(`FPS: ${fps}`, WORLD.width - 34, 54);
  ctx.restore();
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
  drawFPS();
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

  // FPS calculation
  const now = performance.now();
  while (frameTimes.length > 0 && frameTimes[0] <= now - 1000) {
    frameTimes.shift();
  }
  frameTimes.push(now);
  fps = frameTimes.length;

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
und();
resetRound();
requestAnimationFrame(loop);
