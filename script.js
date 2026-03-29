const root = document.documentElement;

function setupReveal() {
  const revealItems = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.22 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function setupSmoothNavigation() {
  const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href) return;
      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.remove("section-targeted");
      window.setTimeout(() => target.classList.add("section-targeted"), 120);
      window.history.replaceState(null, "", href);
    });
  });
}

function setupPointerGlow() {
  root.style.setProperty("--mx", `${Math.round(window.innerWidth / 2)}px`);
  root.style.setProperty("--my", `${Math.round(window.innerHeight * 0.4)}px`);

  window.addEventListener("pointermove", (event) => {
    root.style.setProperty("--mx", `${event.clientX}px`);
    root.style.setProperty("--my", `${event.clientY}px`);
  });

  window.addEventListener("pointerleave", () => {
    root.style.setProperty("--mx", `${Math.round(window.innerWidth / 2)}px`);
    root.style.setProperty("--my", `${Math.round(window.innerHeight * 0.4)}px`);
  });
}

function setupTiltCards() {
  const cards = document.querySelectorAll(".tilt-card");
  const maxTilt = 10;

  cards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const tiltX = (0.5 - py) * maxTilt;
      const tiltY = (px - 0.5) * maxTilt;

      card.style.transform = `perspective(800px) rotateX(${tiltX.toFixed(
        2
      )}deg) rotateY(${tiltY.toFixed(2)}deg)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg)";
    });
  });
}

function setupMatrixRain() {
  const canvas = document.getElementById("matrix-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = window.innerWidth;
  let height = window.innerHeight;
  const fontSize = 16;
  const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789<>/{}[]";
  let columns = Math.floor(width / fontSize);
  let drops = Array(columns).fill(0);
  const clickBursts = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    columns = Math.floor(width / fontSize);
    drops = Array(columns).fill(0);
  }

  function draw() {
    const now = performance.now();
    for (let i = clickBursts.length - 1; i >= 0; i -= 1) {
      if (clickBursts[i].until <= now) clickBursts.splice(i, 1);
    }

    ctx.fillStyle = "rgba(6, 17, 19, 0.12)";
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

    for (let i = 0; i < drops.length; i += 1) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      const baseX = i * fontSize;
      const baseY = drops[i] * fontSize;
      let localBreak = false;
      let localStrength = 0;

      for (let j = 0; j < clickBursts.length; j += 1) {
        const burst = clickBursts[j];
        const dx = baseX - burst.x;
        const dy = baseY - burst.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= burst.radius) {
          localBreak = true;
          const timeFactor = (burst.until - now) / burst.duration;
          const strength = (1 - distance / burst.radius) * Math.max(0, timeFactor);
          if (strength > localStrength) localStrength = strength;
        }
      }

      if (localBreak) {
        const jitterX = (Math.random() - 0.5) * (26 * localStrength + 8);
        const jitterY = (Math.random() - 0.5) * (44 * localStrength + 10);
        ctx.fillStyle = Math.random() > 0.8 ? "#d0ffe8" : "#66ffb5";
        ctx.fillText(text, baseX + jitterX, baseY + jitterY);
        if (Math.random() > 0.95 - localStrength * 0.2) {
          drops[i] = Math.floor(Math.random() * (height / fontSize));
        }
        drops[i] += 1 + localStrength * 1.4;
      } else {
        ctx.fillStyle = "#66ffb5";
        ctx.fillText(text, baseX, baseY);
        drops[i] += 1;
      }

      if (drops[i] * fontSize > height && Math.random() > 0.975) {
        drops[i] = 0;
      }
    }

    for (let i = 0; i < clickBursts.length; i += 1) {
      const burst = clickBursts[i];
      const life = (burst.until - now) / burst.duration;
      const alpha = Math.max(0, life * 0.42);
      const radius = burst.radius * (0.7 + (1 - life) * 0.6);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(186, 255, 227, ${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("pointerdown", (event) => {
    clickBursts.push({
      x: event.clientX,
      y: event.clientY,
      radius: 150,
      duration: 500,
      until: performance.now() + 500,
    });
  });
  window.addEventListener("resize", resize);
  resize();
  draw();
}

function setupMaxButton() {
  const button = document.getElementById("max-btn");
  const zone = document.querySelector(".max-zone");
  const laugh = document.getElementById("ascii-laugh");
  if (!button || !zone || !laugh) return;

  let hideLaughTimer = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function moveAway(pointerX, pointerY) {
    const zoneRect = zone.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const currentX = button.offsetLeft;
    const currentY = button.offsetTop;
    const buttonCenterX = zoneRect.left + currentX + buttonRect.width / 2;
    const buttonCenterY = zoneRect.top + currentY + buttonRect.height / 2;
    const fromX = pointerX ?? zoneRect.left + zoneRect.width / 2;
    const fromY = pointerY ?? zoneRect.top + zoneRect.height / 2;

    let nx = currentX + (buttonCenterX < fromX ? -1 : 1) * (60 + Math.random() * 70);
    let ny = currentY + (buttonCenterY < fromY ? -1 : 1) * (24 + Math.random() * 40);

    const maxX = Math.max(0, zoneRect.width - buttonRect.width);
    const maxY = Math.max(0, zoneRect.height - buttonRect.height);
    nx = clamp(nx, 0, maxX);
    ny = clamp(ny, 0, maxY);

    if (Math.abs(nx - currentX) < 6) nx = Math.random() * maxX;
    if (Math.abs(ny - currentY) < 6) ny = Math.random() * maxY;

    button.style.left = `${Math.round(nx)}px`;
    button.style.top = `${Math.round(ny)}px`;
  }

  zone.addEventListener("pointermove", (event) => {
    const buttonRect = button.getBoundingClientRect();
    const dx = event.clientX - (buttonRect.left + buttonRect.width / 2);
    const dy = event.clientY - (buttonRect.top + buttonRect.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance < 120) {
      moveAway(event.clientX, event.clientY);
    }
  });

  button.addEventListener("pointerenter", (event) => {
    moveAway(event.clientX, event.clientY);
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    laugh.classList.add("show");
    clearTimeout(hideLaughTimer);
    hideLaughTimer = window.setTimeout(() => {
      laugh.classList.remove("show");
    }, 1000);
    moveAway(event.clientX, event.clientY);
  });
}

function setupGravityCrash() {
  const trigger = document.getElementById("danger-stack");
  if (!trigger) return;

  let isRunning = false;

  trigger.addEventListener("click", () => {
    if (isRunning) return;
    isRunning = true;

    const targets = Array.from(
      document.querySelectorAll(
        ".site-header, .hero, #about, #stack, .site-footer, .info-card, .chips > *, .contacts .contact-btn, .max-zone"
      )
    );
    const activeAnimations = [];
    const laneHits = new Map();

    for (let i = 0; i < targets.length; i += 1) {
      const el = targets[i];
      const rect = el.getBoundingClientRect();
      const lane = Math.round(rect.left / 120);
      const hits = laneHits.get(lane) || 0;
      laneHits.set(lane, hits + 1);

      const sidewaysBase = (hits % 2 === 0 ? 1 : -1) * (16 + hits * 9);
      const sideKick = sidewaysBase + (Math.random() - 0.5) * 18;
      const fallDistance = Math.max(160, window.innerHeight - rect.top + 120);
      const delay = (rect.top / Math.max(window.innerHeight, 1)) * 380 + (i % 5) * 20;
      const rotation = (Math.random() - 0.5) * 24;

      const anim = el.animate(
        [
          { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          { transform: `translate3d(${sideKick}px, ${fallDistance * 0.74}px, 0) rotate(${rotation * 0.65}deg)`, offset: 0.74 },
          { transform: `translate3d(${sideKick * 1.25}px, ${fallDistance}px, 0) rotate(${rotation}deg)`, offset: 0.87 },
          { transform: `translate3d(${sideKick * 0.9}px, ${fallDistance - 34}px, 0) rotate(${rotation * 0.72}deg)`, offset: 0.94 },
          { transform: `translate3d(${sideKick * 1.08}px, ${fallDistance}px, 0) rotate(${rotation * 0.8}deg)` },
        ],
        {
          duration: 3000,
          delay,
          fill: "forwards",
          easing: "cubic-bezier(0.18, 0.84, 0.3, 1)",
        }
      );
      activeAnimations.push(anim);
    }

    window.setTimeout(() => {
      activeAnimations.forEach((anim) => anim.cancel());
      isRunning = false;
    }, 3100);
  });
}

setupReveal();
setupSmoothNavigation();
setupPointerGlow();
setupTiltCards();
setupMatrixRain();
setupMaxButton();
setupGravityCrash();
