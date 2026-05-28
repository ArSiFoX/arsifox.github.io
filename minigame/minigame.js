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
const shopBtn = document.getElementById("shop-btn");
const settingsBtn = document.getElementById("settings-btn");
const shopModal = document.getElementById("shop-modal");
const settingsModal = document.getElementById("settings-modal");
const closeShopBtn = document.getElementById("close-shop");
const closeSettingsBtn = document.getElementById("close-settings");
const buyBtns = document.querySelectorAll(".buy-btn");
const gameScaleInput = document.getElementById("game-scale");
const scaleValueDisplay = document.getElementById("scale-value");

if (!canvas || !ctx || !scoreEl || !targetsLeftEl || !projectileNameEl || !restartBtn || !shopBtn || !settingsBtn || !shopModal || !settingsModal || !closeShopBtn || !closeSettingsBtn) {
  throw new Error("Game init failed: required elements are missing.");
}

// UI & Settings logic
shopBtn.addEventListener("click", () => {
  shopModal.classList.remove("hidden");
  updateShopButtons();
});

settingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("hidden");
});

closeShopBtn.addEventListener("click", () => {
  shopModal.classList.add("hidden");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

function setGameScale(scale) {
  document.documentElement.style.setProperty("--game-scale", scale);
  if (scaleValueDisplay) scaleValueDisplay.textContent = `${Math.round(scale * 100)}%`;
  localStorage.setItem("game-scale", scale);
}

if (gameScaleInput) {
  gameScaleInput.addEventListener("input", (e) => {
    setGameScale(e.target.value);
  });
  
  const savedScale = localStorage.getItem("game-scale");
  if (savedScale) {
    const s = parseFloat(savedScale);
    gameScaleInput.value = s;
    setGameScale(s);
  }
}

let score = 0;
let gameLevel = 1;
let scoreMultiplier = 1;
let incomeMultiplier = 1;

let powerUps = {
  tripleShot: 0,
  explosive: 0,
  superFarm: 0,
};

const SHOP_PRICES = {
  triple: 1500,
  explosive: 2500,
  reinforced: 4000,
  airstrike: 6000,
  income: 1500,
  bands: 2000,
  tension: 3000,
  sight: 1500,
};

const SHOP_LEVELS = {
  triple: 0,
  explosive: 0,
  reinforced: 0,
  airstrike: 0,
  income: 0,
  bands: 0,
  tension: 0,
  sight: 0,
};

const PRICE_GROWTH = 1.35; // Prices increase by 35% per purchase

function updateShopButtons() {
  buyBtns.forEach(btn => {
    const item = btn.closest(".shop-item").dataset.item;
    const currentPrice = Math.floor(SHOP_PRICES[item]);
    const currentLevel = SHOP_LEVELS[item];
    
    btn.innerHTML = `${currentPrice} 💎 <br><span style="font-size: 0.7em; opacity: 0.8;">Ур. ${currentLevel}</span>`;
    btn.disabled = Math.floor(score) < currentPrice;
  });
}

buyBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".shop-item").dataset.item;
    const currentPrice = Math.floor(SHOP_PRICES[item]);

    if (Math.floor(score) >= currentPrice) {
      score -= currentPrice;
      SHOP_PRICES[item] *= PRICE_GROWTH; // Dynamic price increase
      SHOP_LEVELS[item]++; // Increment level
      updateHud();
      applyShopItem(item);
      updateShopButtons();
      spawnBurst(WORLD.width / 2, WORLD.height / 2, 30);
    }
  });
});

function addScore(amount) {
  let powerUpMult = 1;
  if (powerUps.explosive > 0 && powerUps.tripleShot > 0) {
    powerUpMult = 0.015;
  } else if (powerUps.explosive > 0) {
    powerUpMult = 0.05;
  } else if (powerUps.tripleShot > 0) {
    powerUpMult = 0.3;
  }

  if (powerUps.superFarm > 0) {
    powerUpMult *= 10;
  }

  score += amount * scoreMultiplier * incomeMultiplier * powerUpMult;
  updateHud();
}

function checkLevelUp() {
  const aliveTargets = targets.filter((t) => !t.destroyed).length;
  if (aliveTargets === 0 && targets.length > 0) {
    gameLevel++;
    scoreMultiplier = 1 + (gameLevel - 1) * 0.15; // +15% per level
    spawnBurst(WORLD.width / 2, WORLD.height / 2, 60);
    makeTargets();
    updateHud();
  }
}

const PROJECTILE_MODIFIERS = {
  damageMult: 1,
  massMult: 1,
};

const SLING_MODIFIERS = {
  maxStretchAdd: 0,
  velocityMult: 1,
  previewStepsAdd: 0,
};

function applyShopItem(item) {
  switch (item) {
    case "triple":
      powerUps.tripleShot = Math.max(powerUps.tripleShot, 30);
      break;
    case "explosive":
      powerUps.explosive = Math.max(powerUps.explosive, 30);
      break;
    case "reinforced":
      PROJECTILE_MODIFIERS.damageMult += 0.05;
      PROJECTILE_MODIFIERS.massMult += 0.05;
      break;
    case "airstrike":
      triggerAirStrike();
      break;
    case "income":
      incomeMultiplier += 0.1;
      break;
    case "bands":
      SLING_MODIFIERS.maxStretchAdd += 5;
      break;
    case "tension":
      SLING_MODIFIERS.velocityMult += 0.05;
      break;
    case "sight":
      SLING_MODIFIERS.previewStepsAdd += 5;
      break;
  }
}

function triggerAirStrike() {
  const count = 6;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const x = rand(800, WORLD.width - 100);
      const y = rand(100, 400);
      triggerExplosion(x, y, 250, 150);
    }, i * 400);
  }
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

let fps = 0;
let frameTimes = [];

let targets = [];
let particles = [];
let firedProjectiles = [];
let queuedProjectiles = [];
let bonuses = [];
let shockwaves = [];
let activeProjectile = null;
let dragPointerId = null;
let isDragging = false;

const BONUS_TYPES = {
  triple: {
    color: "#ffcc00",
    label: "3X",
    icon: "🚀",
    duration: () => rand(15, 50),
  },
  bomb: {
    color: "#ff4400",
    label: "BOOM",
    icon: "💣",
    duration: () => rand(15, 50),
  },
  superFarm: {
    color: "#00ff00",
    label: "SUPER",
    icon: "🤑",
    duration: () => 10,
  }
};

function spawnBonus(forcedType = null) {
  let typeKey = forcedType;
  if (!typeKey) {
    const normalTypes = ["triple", "bomb"];
    typeKey = normalTypes[Math.floor(Math.random() * normalTypes.length)];
  }
  const type = BONUS_TYPES[typeKey];

  bonuses.push({
    id: nextId(),
    type: typeKey,
    x: rand(100, WORLD.width - 100),
    y: -50,
    vy: rand(100, 200),
    r: 30,
    config: type,
    pulse: 0,
  });
}

function updateBonuses(step) {
  for (let i = bonuses.length - 1; i >= 0; i--) {
    const b = bonuses[i];
    b.y += b.vy * step;
    b.pulse += step * 5;

    // Check collision with fired projectiles
    for (const p of firedProjectiles) {
      if (p.alpha <= 0) continue;
      const dist = Math.hypot(p.x - b.x, p.y - b.y);
      if (dist < p.r + b.r) {
        // Collect bonus
        const duration = b.config.duration();
        if (b.type === "triple") powerUps.tripleShot = Math.max(powerUps.tripleShot, duration);
        if (b.type === "bomb") powerUps.explosive = Math.max(powerUps.explosive, duration);
        if (b.type === "superFarm") powerUps.superFarm = Math.max(powerUps.superFarm, duration);

        spawnBurst(b.x, b.y, 15);
        bonuses.splice(i, 1);
        addScore(150); // Nerfed bonus score
        break;
      }
    }

    if (b && b.y > WORLD.height + 50) {
      bonuses.splice(i, 1);
    }
  }

  // Update power-up timers
  powerUps.tripleShot = Math.max(0, powerUps.tripleShot - step);
  powerUps.explosive = Math.max(0, powerUps.explosive - step);
  powerUps.superFarm = Math.max(0, powerUps.superFarm - step);

  // Random spawn logic - REDUCED FREQUENCY
  if (Math.random() < 0.0006) { 
    spawnBonus();
  }
  
  // Super Farm rare spawn (~once per 5 minutes = 36000 frames)
  if (Math.random() < (1 / 36000)) {
    spawnBonus("superFarm");
  }
}
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
  const hpBase = rand(80, 120);
  const hpScale = 1 + (gameLevel - 1) * 0.4; // +40% HP per level
  return {
    id: nextId(),
    x,
    y,
    w: 130,
    h: 96,
    art,
    hp: hpBase * hpScale,
    destroyed: false,
    shake: 0,
    hitFlash: 0,
  };
}

function makeTargets() {
  targets = [];
  // More targets as levels progress
  const count = 4 + Math.floor(gameLevel / 3);
  for (let i = 0; i < count; i += 1) {
    const art = ASCII_TARGETS[Math.floor(Math.random() * ASCII_TARGETS.length)];
    const x = 900 + Math.floor(i / 2) * 200 + rand(-18, 20);
    const y = 350 + (i % 2) * 160 + rand(-14, 14);
    targets.push(createTarget(x, y, art));
  }
}

function updateHud() {
  scoreEl.textContent = String(Math.floor(score));
  const aliveTargets = targets.filter((t) => !t.destroyed).length;
  targetsLeftEl.textContent = String(aliveTargets);

  // Show level in HUD if possible, or just update internal state
  const levelEl = document.getElementById("game-level");
  if (levelEl) levelEl.textContent = String(gameLevel);
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
  const maxStretch = sling.maxStretch + SLING_MODIFIERS.maxStretchAdd;
  const pullDistance = Math.hypot(dx, dy);
  if (pullDistance > maxStretch) {
    const ratio = maxStretch / pullDistance;
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
  const velocityMultiplier = LAUNCH.velocityMultiplier * SLING_MODIFIERS.velocityMult;
  const speedScale = velocityMultiplier / Math.sqrt(activeProjectile.seed.preset.mass);
  
  // VX and VY must be a direct reflection of DX and DY
  return {
    vx: dx * speedScale,
    vy: dy * speedScale,
    speed: pullDistance * speedScale,
  };
}

function createFiredProjectile(x, y, vx, vy, preset, icon, isExplosive = false) {
  const mass = (preset?.mass || 0.5) * PROJECTILE_MODIFIERS.massMult;
  return {
    id: nextId(),
    x,
    y,
    vx,
    vy,
    r: preset?.radius || 8,
    mass,
    restitution: preset?.restitution || 0.5,
    groundFriction: preset?.groundFriction || 0.8,
    airDrag: preset?.airDrag || 0.1,
    damage: (preset?.damage || 10) * PROJECTILE_MODIFIERS.damageMult,
    lifetime: 4.5,
    fadeDuration: 0.5,
    age: 0,
    fadeAge: 0,
    alpha: 1,
    rotation: 0,
    angularV: rand(-0.1, 0.1),
    restTimer: 0,
    sleeping: false,
    label: icon?.name || "*",
    icon,
    isExplosive,
    shrapnel: false,
    hitSet: new Set(),
  };
}

function launchActiveProjectile() {
  const launch = computeLaunchVelocity();
  if (!launch || !activeProjectile) {
    beginSnapback();
    return;
  }

  const { preset, icon } = activeProjectile.seed;
  const isExplosive = powerUps.explosive > 0;

  if (powerUps.tripleShot > 0) {
    // Triple shot logic
    const angles = [-0.12, 0, 0.12];
    angles.forEach(angleOffset => {
      const speed = launch.speed;
      const baseAngle = Math.atan2(launch.vy, launch.vx);
      const angle = baseAngle + angleOffset;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      const fired = createFiredProjectile(activeProjectile.x, activeProjectile.y, vx, vy, preset, icon, isExplosive);
      firedProjectiles.push(fired);
    });
  } else {
    const fired = createFiredProjectile(activeProjectile.x, activeProjectile.y, launch.vx, launch.vy, preset, icon, isExplosive);
    firedProjectiles.push(fired);
  }

  if (firedProjectiles.length > 256) {
    firedProjectiles.splice(0, firedProjectiles.length - 256);
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

function resolveProjectileCollisions() {
  // Collisions between fired projectiles
  for (let i = 0; i < firedProjectiles.length; i++) {
    for (let j = i + 1; j < firedProjectiles.length; j++) {
      const p1 = firedProjectiles[i];
      const p2 = firedProjectiles[j];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distanceSq = dx * dx + dy * dy;
      const minDistance = p1.r + p2.r;

      if (distanceSq < minDistance * minDistance) {
        const distance = Math.sqrt(distanceSq);
        const nx = dx / distance;
        const ny = dy / distance;

        // 1. Static resolution (overlap)
        const overlap = minDistance - distance;
        const totalMass = p1.mass + p2.mass;
        const m1Ratio = p2.mass / totalMass;
        const m2Ratio = p1.mass / totalMass;

        p1.x -= nx * overlap * m1Ratio;
        p1.y -= ny * overlap * m1Ratio;
        p2.x += nx * overlap * m2Ratio;
        p2.y += ny * overlap * m2Ratio;

        // 2. Dynamic resolution (impulse)
        const rvx = p2.vx - p1.vx;
        const rvy = p2.vy - p1.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
          const e = Math.min(p1.restitution, p2.restitution);
          let jImpulse = -(1 + e) * velAlongNormal;
          jImpulse /= (1 / p1.mass + 1 / p2.mass);

          const impulseX = jImpulse * nx;
          const impulseY = jImpulse * ny;

          p1.vx -= impulseX / p1.mass;
          p1.vy -= impulseY / p1.mass;
          p2.vx += impulseX / p2.mass;
          p2.vy += impulseY / p2.mass;
          
          p1.sleeping = false;
          p2.sleeping = false;
          p1.restTimer = 0;
          p2.restTimer = 0;
        }
      }
    }
  }

  // Active projectile interaction with fired projectiles
  // Only solid when being manipulated (dragged or snapping)
  if (activeProjectile && (isDragging || activeProjectile.snapback)) {
    for (const p of firedProjectiles) {
      const dx = p.x - activeProjectile.x;
      const dy = p.y - activeProjectile.y;
      const distanceSq = dx * dx + dy * dy;
      const minDistance = p.r + activeProjectile.r;

      if (distanceSq < minDistance * minDistance) {
        const distance = Math.sqrt(distanceSq);
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;

        // Active projectile is "fixed" by user hand or snapback, so it pushes others with infinite mass
        p.x += nx * overlap;
        p.y += ny * overlap;

        // Simple bounce off the active projectile
        const dot = p.vx * nx + p.vy * ny;
        if (dot < 0) {
          p.vx -= 1.5 * dot * nx;
          p.vy -= 1.5 * dot * ny;
        }

        p.sleeping = false;
        p.restTimer = 0;
      }
    }
  }
}

function triggerExplosion(x, y, maxRadius, damage) {
  spawnBurst(x, y, 50);
  
  shockwaves.push({
    x,
    y,
    r: 10,
    maxR: maxRadius,
    damage,
    life: 1,
    speed: 600,
    targetsHit: new Set(),
  });
}

function updateShockwaves(step) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.r += s.speed * step;
    s.life -= step * 1.5;

    // Hit targets in expansion path
    for (const t of targets) {
      if (t.destroyed || s.targetsHit.has(t.id)) continue;
      
      const dx = (t.x + t.w / 2) - s.x;
      const dy = (t.y + t.h / 2) - s.y;
      const dist = Math.hypot(dx, dy);
      
      // If target is within the shockwave's "edge"
      if (dist < s.r + 50 && dist > s.r - 100) {
        t.hp -= s.damage;
        t.shake = 0.5;
        t.hitFlash = 0.25;
        s.targetsHit.add(t.id);
        
        if (t.hp <= 0) {
          t.destroyed = true;
          addScore(50); // Nerfed explosion target kill
          spawnBurst(t.x + t.w/2, t.y + t.h/2, 20);
        }
      }
    }

    if (s.r >= s.maxR || s.life <= 0) {
      shockwaves.splice(i, 1);
    }
  }
}

function drawShockwaves() {
  for (const s of shockwaves) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 100, 0, ${s.life * 0.8})`;
    ctx.lineWidth = 15 * s.life;
    ctx.stroke();
    
    // Inner glow
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 200, 50, ${s.life * 0.4})`;
    ctx.lineWidth = 5 * s.life;
    ctx.stroke();
    ctx.restore();
  }
}

function hitTargets(projectile) {
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (target.destroyed) continue;
    if (!circleRectHit(projectile, target)) continue;

    if (projectile.isExplosive) {
      triggerExplosion(projectile.x, projectile.y, 220, 120);
      projectile.alpha = 0; // Destroy on impact
      projectile.age = projectile.lifetime + 1;
      return;
    }

    // --- Collision Resolution (Push projectile out) ---
    // Find closest point on rectangle to the circle center
    const cx = clamp(projectile.x, target.x, target.x + target.w);
    const cy = clamp(projectile.y, target.y, target.y + target.h);
    
    // Calculate distance vector from closest point to circle center
    let dx = projectile.x - cx;
    let dy = projectile.y - cy;
    let distance = Math.hypot(dx, dy);

    // If center is exactly inside the rect (distance = 0), force a direction
    if (distance === 0) {
      // Determine which edge is closest
      const distToLeft = projectile.x - target.x;
      const distToRight = target.x + target.w - projectile.x;
      const distToTop = projectile.y - target.y;
      const distToBottom = target.y + target.h - projectile.y;

      const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

      if (minDist === distToLeft) { dx = -1; dy = 0; }
      else if (minDist === distToRight) { dx = 1; dy = 0; }
      else if (minDist === distToTop) { dx = 0; dy = -1; }
      else { dx = 0; dy = 1; }
      distance = 1; // Normalize base
    }

    // Normalize and resolve overlap
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = projectile.r - distance;

    if (overlap > 0) {
      projectile.x += nx * overlap;
      projectile.y += ny * overlap;
    }
    // ------------------------------------------------

    const speed = Math.hypot(projectile.vx, projectile.vy);
    const impact = projectile.damage * (1 + speed * 0.018) * (0.58 + projectile.mass * 0.24);

    target.hp -= impact;
    target.shake = Math.min(0.26, target.shake + 0.12);
    target.hitFlash = 0.12;

    const carry = clamp(0.54 + projectile.mass * 0.19, 0.6, 0.88);
    // Simple bounce reflection
    const dot = projectile.vx * nx + projectile.vy * ny;
    if (dot < 0) {
        projectile.vx -= (1 + carry) * dot * nx;
        projectile.vy -= (1 + carry) * dot * ny;
    }
    projectile.vx *= 0.9;
    projectile.vy *= 0.9;

    if (target.hp <= 0) {
      target.destroyed = true;
      addScore(50); // Base kill score
      spawnBurst(projectile.x, projectile.y, 26);
    } else {
      if (!projectile.hitSet.has(target.id)) {
        addScore(10); // Reward hit only once per target
        projectile.hitSet.add(target.id);
      }
      spawnBurst(projectile.x, projectile.y, 2); // Less particles per frame to avoid lag
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
  updateBonuses(step);
  updateShockwaves(step);
  resolveProjectileCollisions();
  updateTargets(step);
  updateParticles(step);
  sling.shake = Math.max(0, sling.shake - step * 4);
  updateHud();
  checkLevelUp();
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
  const steps = 45 + SLING_MODIFIERS.previewStepsAdd;
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

function drawBonuses() {
  for (const b of bonuses) {
    ctx.save();
    const pulse = Math.sin(b.pulse) * 5;
    const r = b.r + pulse;
    
    // Outer glow
    ctx.shadowColor = b.config.color;
    ctx.shadowBlur = 15;
    
    ctx.fillStyle = b.config.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.config.icon, b.x, b.y);
    ctx.restore();
  }
}

function drawPowerUpStatus() {
  let y = 100;
  ctx.save();
  ctx.font = "bold 18px JetBrains Mono";
  ctx.textAlign = "left";

  if (powerUps.superFarm > 0) {
    ctx.fillStyle = BONUS_TYPES.superFarm.color;
    ctx.shadowColor = BONUS_TYPES.superFarm.color;
    ctx.shadowBlur = 10;
    ctx.fillText(`SUPER FARM (x10): ${powerUps.superFarm.toFixed(1)}s`, 34, y);
    ctx.shadowBlur = 0;
    y += 30;
  }
  if (powerUps.tripleShot > 0) {
    ctx.fillStyle = BONUS_TYPES.triple.color;
    ctx.fillText(`TRIPLE SHOT: ${powerUps.tripleShot.toFixed(1)}s`, 34, y);
    y += 30;
  }
  if (powerUps.explosive > 0) {
    ctx.fillStyle = BONUS_TYPES.bomb.color;
    ctx.fillText(`EXPLOSIVE: ${powerUps.explosive.toFixed(1)}s`, 34, y);
    y += 30;
  }
  if (PROJECTILE_MODIFIERS.damageMult > 1) {
    ctx.fillStyle = "#00ff88";
    ctx.fillText(`REINFORCED: x${PROJECTILE_MODIFIERS.damageMult.toFixed(2)} DMG`, 34, y);
    y += 30;
  }
  if (incomeMultiplier > 1) {
    ctx.fillStyle = "#ff00ff";
    ctx.fillText(`INCOME: +${Math.round((incomeMultiplier - 1) * 100)}%`, 34, y);
    y += 30;
  }
  if (SLING_MODIFIERS.maxStretchAdd > 0 || SLING_MODIFIERS.velocityMult > 1 || SLING_MODIFIERS.previewStepsAdd > 0) {
    ctx.fillStyle = "#00ccff";
    ctx.fillText("SLING UPGRADED", 34, y);
  }
  ctx.restore();
}

function render() {
  ctx.drawImage(backgroundCanvas, 0, 0);
  drawTrajectoryPreview();
  drawQueue();
  drawSling();
  drawTargets();
  drawFiredProjectiles();
  drawBonuses();
  drawShockwaves();
  drawActiveProjectile();
  drawParticles();
  drawGuide();
  drawFPS();
  drawPowerUpStatus();
}

function resetRound() {
  score = 0;
  gameLevel = 1;
  scoreMultiplier = 1;
  incomeMultiplier = 1;
  accumulator = 0;
  targets = [];
  particles = [];
  firedProjectiles = [];
  queuedProjectiles = [];
  bonuses = [];
  shockwaves = [];
  activeProjectile = null;
  setDraggingState(false);
  dragPointerId = null;

  powerUps.tripleShot = 0;
  powerUps.explosive = 0;
  PROJECTILE_MODIFIERS.damageMult = 1;
  PROJECTILE_MODIFIERS.massMult = 1;
  SLING_MODIFIERS.maxStretchAdd = 0;
  SLING_MODIFIERS.velocityMult = 1;
  SLING_MODIFIERS.previewStepsAdd = 0;

  // Reset prices
  SHOP_PRICES.triple = 1500;
  SHOP_PRICES.explosive = 2500;
  SHOP_PRICES.reinforced = 4000;
  SHOP_PRICES.airstrike = 6000;
  SHOP_PRICES.income = 1500;
  SHOP_PRICES.bands = 2000;
  SHOP_PRICES.tension = 3000;
  SHOP_PRICES.sight = 1500;

  // Reset levels
  for (const key in SHOP_LEVELS) {
    SHOP_LEVELS[key] = 0;
  }

  powerUps.superFarm = 0;

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
