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

  for (let i = 0; i < 14; i += 1) {
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
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  let context;
  try {
    context = new AudioCtx();
  } catch (_error) {
    return;
  }

  const triggerSound = () => {
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    gain.connect(context.destination);

    const oscillatorA = context.createOscillator();
    oscillatorA.type = "triangle";
    oscillatorA.frequency.setValueAtTime(352, now);
    oscillatorA.frequency.exponentialRampToValueAtTime(598, now + 0.2);
    oscillatorA.connect(gain);

    const oscillatorB = context.createOscillator();
    oscillatorB.type = "sine";
    oscillatorB.frequency.setValueAtTime(704, now);
    oscillatorB.frequency.exponentialRampToValueAtTime(932, now + 0.18);
    oscillatorB.connect(gain);

    oscillatorA.start(now);
    oscillatorB.start(now + 0.015);
    oscillatorA.stop(now + 0.5);
    oscillatorB.stop(now + 0.38);
  };

  if (context.state === "running") {
    triggerSound();
    return;
  }

  const unlockAndPlay = () => {
    context.resume()
      .then(() => {
        if (context.state === "running") triggerSound();
      })
      .catch(() => {
        // ignore autoplay restrictions silently
      });
  };

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, unlockAndPlay, { once: true, passive: true });
  });
}

function createFirstLoadExperience() {
  if (!document.body) return;
  const firstLoadKey = "arthur-site-first-load-v1";
  let isFirstLoad = false;

  try {
    isFirstLoad = !window.localStorage.getItem(firstLoadKey);
    if (isFirstLoad) {
      window.localStorage.setItem(firstLoadKey, String(Date.now()));
    }
  } catch (_error) {
    isFirstLoad = true;
  }

  if (!isFirstLoad) return;

  document.body.classList.add("first-load-active");
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

  playFirstLoadSound();

  window.setTimeout(() => {
    introLayer.classList.add("is-fading");
    document.body.classList.remove("first-load-active");
  }, 1450);

  window.setTimeout(() => {
    introLayer.remove();
  }, 2500);
}

createFirstLoadExperience();
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
    } else {
      sidebar.classList.add("active");
      hamburgerBtn.classList.add("active");
      sidebarOverlay.classList.add("active");
      mainContent.classList.add("sidebar-open");
      hamburgerBtn.setAttribute("aria-expanded", "true");
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
  const options = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  }, options);

  animatedElements.forEach((el) => observer.observe(el));

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
