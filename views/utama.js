function createAmbientParticles() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const particleContainer = document.createElement("div");
  particleContainer.setAttribute("aria-hidden", "true");
  particleContainer.style.cssText = `
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  `;
  document.body.appendChild(particleContainer);

  for (let i = 0; i < 8; i += 1) {
    const particle = document.createElement("span");
    const size = Math.random() * 2.8 + 1.2;
    const duration = Math.random() * 20 + 18;
    const delay = Math.random() * 8;
    const travelX = Math.random() * 42 - 21;
    const travelY = Math.random() * 70 - 35;

    particle.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: rgba(147, 197, 253, ${Math.random() * 0.45 + 0.25});
      top: ${Math.random() * 100}%;
      left: ${Math.random() * 100}%;
      filter: blur(0.5px);
      animation: ambientParticle ${duration}s ease-in-out ${delay}s infinite alternate;
      --tx: ${travelX}px;
      --ty: ${travelY}px;
    `;

    particleContainer.appendChild(particle);
  }
}

const UI_SOUND_STATE_KEY = "arthur-ui-sound-enabled-v1";
let sharedAudioCtx = null;
let interactionUnlocked = false;
let deferredIntroChime = false;
let introReadyPlayed = false;

function isReducedMotionEnabled() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ensureAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (sharedAudioCtx) return sharedAudioCtx;
  try {
    sharedAudioCtx = new AudioCtx();
  } catch (_error) {
    return null;
  }
  return sharedAudioCtx;
}

function isUiSoundEnabled() {
  try {
    const saved = window.localStorage.getItem(UI_SOUND_STATE_KEY);
    return saved !== "off";
  } catch (_error) {
    return true;
  }
}

function setUiSoundEnabled(value) {
  try {
    window.localStorage.setItem(UI_SOUND_STATE_KEY, value ? "on" : "off");
  } catch (_error) {
    // ignore storage issue
  }
}

function playUiTone({
  type = "sine",
  frequency = 540,
  frequencyEnd = null,
  duration = 0.12,
  delay = 0,
  volume = 0.03
} = {}) {
  if (!isUiSoundEnabled() || isReducedMotionEnabled()) return;
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const start = ctx.currentTime + Math.max(0, delay);
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(40, frequency), start);
  if (Number.isFinite(frequencyEnd) && frequencyEnd > 0) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), start + duration);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playClickSound() {
  playUiTone({
    type: "triangle",
    frequency: 680,
    frequencyEnd: 920,
    duration: 0.08,
    volume: 0.018
  });
}

function playSuccessSound() {
  playUiTone({
    type: "sine",
    frequency: 620,
    frequencyEnd: 820,
    duration: 0.11,
    volume: 0.02
  });
  playUiTone({
    type: "triangle",
    frequency: 880,
    frequencyEnd: 1180,
    duration: 0.16,
    delay: 0.08,
    volume: 0.024
  });
}

function playUploadAppleChime() {
  playUiTone({
    type: "sine",
    frequency: 1040,
    frequencyEnd: 1340,
    duration: 0.08,
    volume: 0.03
  });
  playUiTone({
    type: "triangle",
    frequency: 1380,
    frequencyEnd: 1760,
    duration: 0.13,
    delay: 0.06,
    volume: 0.035
  });
}

function playDeleteSound() {
  playUiTone({
    type: "sawtooth",
    frequency: 420,
    frequencyEnd: 220,
    duration: 0.17,
    volume: 0.02
  });
}

function playRefreshSound() {
  playUiTone({
    type: "triangle",
    frequency: 620,
    frequencyEnd: 760,
    duration: 0.09,
    volume: 0.018
  });
  playUiTone({
    type: "triangle",
    frequency: 760,
    frequencyEnd: 920,
    duration: 0.09,
    delay: 0.07,
    volume: 0.02
  });
}

function playMenuToggleSound(isOpen) {
  if (isOpen) {
    playUiTone({
      type: "triangle",
      frequency: 460,
      frequencyEnd: 780,
      duration: 0.14,
      volume: 0.02
    });
    return;
  }
  playUiTone({
    type: "triangle",
    frequency: 760,
    frequencyEnd: 430,
    duration: 0.13,
    volume: 0.02
  });
}

function playCallSound() {
  playUiTone({
    type: "sine",
    frequency: 700,
    frequencyEnd: 860,
    duration: 0.14,
    volume: 0.023
  });
  playUiTone({
    type: "sine",
    frequency: 900,
    frequencyEnd: 1150,
    duration: 0.16,
    delay: 0.12,
    volume: 0.024
  });
}

function playCopySound() {
  playUiTone({
    type: "square",
    frequency: 960,
    frequencyEnd: 1220,
    duration: 0.07,
    volume: 0.016
  });
}

function playReadyJrengSound() {
  playUiTone({
    type: "triangle",
    frequency: 420,
    frequencyEnd: 760,
    duration: 0.14,
    volume: 0.02
  });
  playUiTone({
    type: "sine",
    frequency: 640,
    frequencyEnd: 1040,
    duration: 0.2,
    delay: 0.05,
    volume: 0.022
  });
  playUiTone({
    type: "sine",
    frequency: 960,
    frequencyEnd: 1460,
    duration: 0.24,
    delay: 0.11,
    volume: 0.025
  });
}

function unlockAudioOnce() {
  if (interactionUnlocked) return;
  interactionUnlocked = true;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  ctx.resume()
    .then(() => {
      if (deferredIntroChime) {
        deferredIntroChime = false;
        playFirstLoadSound();
        setTimeout(() => {
          if (!introReadyPlayed) {
            playReadyJrengSound();
            introReadyPlayed = true;
          }
        }, 950);
        return;
      }
      playClickSound();
    })
    .catch(() => {
      // browser may still block audio
    });
}

function createSoundToggle() {
  if (!document.body) return;
  if (document.querySelector(".ui-sound-toggle")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ui-sound-toggle";
  toggle.setAttribute("aria-label", "Toggle sound effect");
  toggle.dataset.soundEnabled = isUiSoundEnabled() ? "on" : "off";
  toggle.textContent = isUiSoundEnabled() ? "🔊 Sound ON" : "🔈 Sound OFF";

  toggle.addEventListener("click", () => {
    const enabled = toggle.dataset.soundEnabled !== "on";
    setUiSoundEnabled(enabled);
    toggle.dataset.soundEnabled = enabled ? "on" : "off";
    toggle.textContent = enabled ? "🔊 Sound ON" : "🔈 Sound OFF";
    unlockAudioOnce();
    playClickSound();
  });

  document.body.appendChild(toggle);
}

function attachGlobalClickSound() {
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const callTarget = target.closest("a[href*='wa.me'], a[href^='tel:'], .cta-secondary");
    if (callTarget) {
      unlockAudioOnce();
      playCallSound();
      return;
    }
    const clickable = target.closest("button, a, input[type='submit'], input[type='button'], [role='button']");
    if (!clickable) return;
    const actionType = String(clickable.getAttribute("data-action") || "").toLowerCase();
    if (actionType === "copy" || actionType === "copy-folder") {
      unlockAudioOnce();
      playCopySound();
      return;
    }
    unlockAudioOnce();
    playClickSound();
  }, { passive: true });
}

function attachScrollWhiteMaskFix() {
  if (!document.body) return;
  document.body.classList.remove("fx-white-mask");
}

function createCursorTrail() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (reduceMotion || !finePointer) return;
  if (!document.body) return;
  document.body.classList.add("cursor-trail-only");

  const glow = document.createElement("div");
  glow.className = "cursor-glow";
  glow.setAttribute("aria-hidden", "true");
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  document.body.appendChild(glow);
  document.body.appendChild(dot);

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let glowX = targetX;
  let glowY = targetY;
  let dotX = targetX;
  let dotY = targetY;
  let rafId = 0;
  let lastMoveAt = 0;

  const setHoverState = (target) => {
    if (!(target instanceof Element)) return;
    const clickable = target.closest("a, button, input, textarea, select, [role='button'], .cta-button, .service-link, .bot-preview");
    document.body.classList.toggle("cursor-hovering-link", Boolean(clickable));
  };

  const activateTracking = (x, y, target) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      targetX = x;
      targetY = y;
      lastMoveAt = Date.now();
    }
    document.body.classList.add("cursor-tracking");
    if (target) setHoverState(target);
  };

  const onPointerMove = (event) => {
    activateTracking(event.clientX, event.clientY, event.target);
  };

  const onMouseMove = (event) => {
    activateTracking(event.clientX, event.clientY, event.target);
  };

  const onPointerEnter = (event) => {
    activateTracking(event.clientX, event.clientY, event.target);
  };

  const onPointerLeave = () => {
    document.body.classList.remove("cursor-tracking");
    document.body.classList.remove("cursor-hovering-link");
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      onPointerLeave();
      return;
    }
    document.body.classList.add("cursor-tracking");
  };

  const onWindowFocus = () => {
    document.body.classList.add("cursor-tracking");
  };

  const onWindowBlur = () => {
    onPointerLeave();
  };

  const tick = () => {
    if (!lastMoveAt && document.hasFocus()) {
      document.body.classList.add("cursor-tracking");
    }
    if (lastMoveAt && Date.now() - lastMoveAt > 1800 && document.hasFocus()) {
      document.body.classList.add("cursor-tracking");
    }
    glowX += (targetX - glowX) * 0.16;
    glowY += (targetY - glowY) * 0.16;
    dotX += (targetX - dotX) * 0.35;
    dotY += (targetY - dotY) * 0.35;
    glow.style.transform = `translate3d(${glowX - 19}px, ${glowY - 19}px, 0)`;
    dot.style.transform = `translate3d(${dotX - 4}px, ${dotY - 4}px, 0)`;
    rafId = window.requestAnimationFrame(tick);
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("pointerenter", onPointerEnter, { passive: true });
  document.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("pointerdown", (event) => setHoverState(event.target));
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("blur", onWindowBlur);
  document.body.classList.add("cursor-tracking");
  rafId = window.requestAnimationFrame(tick);

  window.addEventListener("beforeunload", () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("pointerenter", onPointerEnter);
    document.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("blur", onWindowBlur);
  }, { once: true });
}

function playFirstLoadSound() {
  playUiTone({
    type: "triangle",
    frequency: 352,
    frequencyEnd: 598,
    duration: 0.2,
    volume: 0.035
  });
  playUiTone({
    type: "sine",
    frequency: 704,
    frequencyEnd: 932,
    duration: 0.26,
    delay: 0.03,
    volume: 0.03
  });
}

function createFirstLoadExperience() {
  if (!document.body) return;
  const firstLoadAlwaysKey = "arthur-site-first-load-always-v1";
  const alwaysPlayIntro = (() => {
    try {
      const value = window.localStorage.getItem(firstLoadAlwaysKey);
      return value !== "off";
    } catch (_error) {
      return true;
    }
  })();
  if (!alwaysPlayIntro) return;

  document.body.classList.add("first-load-active");
  introReadyPlayed = false;
  const introLayer = document.createElement("div");
  introLayer.className = "first-load-overlay";
  introLayer.setAttribute("aria-hidden", "true");
  introLayer.innerHTML = `
    <div class="first-load-ring"></div>
    <div class="first-load-core"></div>
    <p class="first-load-label">Arthur Bot Experience</p>
  `;

  document.body.appendChild(introLayer);
  window.requestAnimationFrame(() => {
    introLayer.classList.add("is-visible");
  });

  const ctx = ensureAudioContext();
  if (ctx && ctx.state === "running") {
    playFirstLoadSound();
  } else {
    deferredIntroChime = true;
  }

  window.setTimeout(() => {
    introLayer.classList.add("is-fading");
    document.body.classList.remove("first-load-active");
    if (!introReadyPlayed) {
      playReadyJrengSound();
      introReadyPlayed = true;
    }
  }, 2850);

  window.setTimeout(() => {
    introLayer.remove();
  }, 4300);
}

function forceWelcomeReadySoundOnce() {
  const readyKey = "arthur-ready-chime-v2";
  if (!document.body) return;
  let shouldPlay = false;
  try {
    shouldPlay = !window.sessionStorage.getItem(readyKey);
    if (shouldPlay) {
      window.sessionStorage.setItem(readyKey, "1");
    }
  } catch (_error) {
    shouldPlay = true;
  }
  if (!shouldPlay) return;

  const trigger = () => {
    unlockAudioOnce();
    if (!introReadyPlayed) {
      playReadyJrengSound();
      introReadyPlayed = true;
    }
  };
  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, trigger, { once: true, passive: true });
  });
}

window.ArthurSiteSoundFX = {
  unlock: unlockAudioOnce,
  playClick: playClickSound,
  playSuccess: playSuccessSound,
  playReady: playReadyJrengSound,
  playUpload: playUploadAppleChime,
  playDelete: playDeleteSound,
  playRefresh: playRefreshSound,
  playCall: playCallSound,
  playCopy: playCopySound,
  playByType(type) {
    const key = String(type || "").toLowerCase();
    if (key === "click") {
      playClickSound();
      return;
    }
    if (key === "copy") {
      playCopySound();
      return;
    }
    if (key === "success" || key === "saved") {
      playSuccessSound();
      return;
    }
    if (key === "upload" || key === "upload-success" || key === "apple") {
      playUploadAppleChime();
      return;
    }
    if (key === "refresh" || key === "reload") {
      playRefreshSound();
      return;
    }
    if (key === "delete" || key === "remove") {
      playDeleteSound();
      return;
    }
    if (key === "call" || key === "contact" || key === "phone") {
      playCallSound();
      return;
    }
    if (key === "menu-open") {
      playMenuToggleSound(true);
      return;
    }
    if (key === "menu-close") {
      playMenuToggleSound(false);
      return;
    }
    if (key === "ready" || key === "jreng") {
      playReadyJrengSound();
      return;
    }
    if (key === "error" || key === "fail") {
      playUiTone({
        type: "sawtooth",
        frequency: 260,
        frequencyEnd: 190,
        duration: 0.2,
        volume: 0.018
      });
    }
  }
};

createFirstLoadExperience();
forceWelcomeReadySoundOnce();
createSoundToggle();
attachGlobalClickSound();
attachScrollWhiteMaskFix();
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("fx-tab-hidden", document.hidden);
});
createAmbientParticles();
createCursorTrail();

const lazyImages = document.querySelectorAll('img[data-src]');
if ('IntersectionObserver' in window) {
  const lazyObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const source = img.getAttribute('data-src');
      if (source) {
        img.src = source;
      }
      img.addEventListener('load', () => {
        img.classList.remove('is-loading');
        img.classList.add('is-ready');
      }, { once: true });
      img.addEventListener('error', () => {
        img.classList.remove('is-loading');
      }, { once: true });
      observer.unobserve(img);
    });
  }, { rootMargin: '200px 0px' });

  lazyImages.forEach((img) => lazyObserver.observe(img));
} else {
  lazyImages.forEach((img) => {
    const source = img.getAttribute('data-src');
    if (source) img.src = source;
    img.classList.remove('is-loading');
    img.classList.add('is-ready');
  });
}

const hamburgerBtn = document.getElementById("hamburger-btn");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const mainContent = document.getElementById("main-content");

  function toggleSidebar() {
    const isActive = sidebar.classList.contains("active");
    if (isActive) {
      sidebar.classList.remove("active");
      hamburgerBtn.classList.remove("active");
      sidebarOverlay.classList.remove("active");
      mainContent.classList.remove("sidebar-open");
      hamburgerBtn.setAttribute("aria-expanded", "false");
      playMenuToggleSound(false);
    } else {
      sidebar.classList.add("active");
      hamburgerBtn.classList.add("active");
      sidebarOverlay.classList.add("active");
      mainContent.classList.add("sidebar-open");
      hamburgerBtn.setAttribute("aria-expanded", "true");
      playMenuToggleSound(true);
    }
  }

  hamburgerBtn.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", toggleSidebar);

  sidebar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (sidebar.classList.contains("active")) {
        toggleSidebar();
      }
    });
  });

  const animatedElements = document.querySelectorAll(".fade-in-slide");

  function revealFadeElementsInViewport() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    animatedElements.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh + 100 && r.bottom > -100) {
        el.classList.add("visible");
      }
    });
  }

  const options = {
    threshold: 0.05,
    rootMargin: "140px 0px 140px 0px"
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  }, options);

  document.getElementById("home")?.classList.add("visible");
  revealFadeElementsInViewport();

  animatedElements.forEach((el) => {
    if (el.classList.contains("visible")) return;
    observer.observe(el);
  });

  const modal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const previews = document.querySelectorAll('.bot-preview img, #certificates img, #portfolio img');

  previews.forEach(img => {
    img.addEventListener('click', () => {
      modalImage.src = img.src;
      modalImage.alt = img.alt;
      modal.classList.add('active');
      modal.focus();
      document.body.style.overflow = 'hidden';
    });
    img.parentElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        modalImage.src = img.src;
        modalImage.alt = img.alt;
        modal.classList.add('active');
        modal.focus();
        document.body.style.overflow = 'hidden';
      }
    });
  });

  function closeModal() {
    modal.classList.remove('active');
    modalImage.src = '';
    modalImage.alt = '';
    document.body.style.overflow = '';
  }

  modalCloseBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

 
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contact-form');
    const alertBox = document.getElementById('contact-alert');
    const captchaImg = document.getElementById('captcha-img');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = {};
      formData.forEach((value, key) => {
        data[key] = value;
      });

      alertBox.classList.add('hidden');
      alertBox.textContent = '';
      alertBox.className = 'hidden mb-6 p-4 rounded-md text-sm font-semibold';

      try {
        const response = await fetch('/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const resultText = await response.text();

        if (response.ok) {
          alertBox.textContent = resultText;
          alertBox.className = 'block mb-6 p-4 rounded-md text-sm font-semibold bg-green-600 text-white';
          form.reset();
        } else {
          alertBox.textContent = resultText;
          alertBox.className = 'block mb-6 p-4 rounded-md text-sm font-semibold bg-red-600 text-white';
        }

        captchaImg.src = '/captcha?' + Date.now();
      } catch (err) {
        alertBox.textContent = 'Terjadi kesalahan server. Silakan coba beberapa saat lagi.';
        alertBox.className = 'block mb-6 p-4 rounded-md text-sm font-semibold bg-red-600 text-white';
      }
    });
  });
