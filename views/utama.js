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

createAmbientParticles();

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
