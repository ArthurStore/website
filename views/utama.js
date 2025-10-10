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
