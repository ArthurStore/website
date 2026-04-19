// Animated Background Particles
function createParticles() {
  const particleContainer = document.createElement('div');
  particleContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  `;
  document.body.appendChild(particleContainer);

  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    const size = Math.random() * 4 + 2;
    const duration = Math.random() * 20 + 15;
    const delay = Math.random() * 5;
    const startX = Math.random() * 100;
    const endX = startX + (Math.random() * 20 - 10);
    
    particle.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.6), transparent);
      border-radius: 50%;
      top: ${Math.random() * 100}%;
      left: ${startX}%;
      animation: float${i} ${duration}s ease-in-out ${delay}s infinite;
      opacity: ${Math.random() * 0.5 + 0.3};
    `;
    
    const keyframes = `
      @keyframes float${i} {
        0%, 100% { transform: translate(0, 0); }
        25% { transform: translate(${Math.random() * 30 - 15}px, ${Math.random() * 30 - 15}px); }
        50% { transform: translate(${Math.random() * 50 - 25}px, ${Math.random() * 50 - 25}px); }
        75% { transform: translate(${Math.random() * 30 - 15}px, ${Math.random() * 30 - 15}px); }
      }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = keyframes;
    document.head.appendChild(styleSheet);
    
    particleContainer.appendChild(particle);
  }
}

// Initialize particles
createParticles();

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
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      } else {
        entry.target.classList.remove("visible");
      }
    });
  }, options);

  animatedElements.forEach((el) => {
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
