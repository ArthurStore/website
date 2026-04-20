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
          observer.unobserve(entry.target);
        }
      });
    }, options);

    animatedElements.forEach((el) => {
      observer.observe(el);
    });

    const tabs = document.querySelectorAll('[role="tab"]');
    const tabPanels = document.querySelectorAll('[role="tabpanel"]');

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Deactivate all tabs and panels
        tabs.forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
          t.setAttribute("tabindex", "-1");
        });
        tabPanels.forEach((panel) => {
          panel.classList.add("hidden");
          panel.setAttribute("tabindex", "-1");
        });

        // Activate clicked tab and corresponding panel
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        tab.setAttribute("tabindex", "0");
        const panelId = tab.getAttribute("aria-controls");
        const panel = document.getElementById(panelId);
        if (panel) {
          panel.classList.remove("hidden");
          panel.setAttribute("tabindex", "0");
          panel.focus();
        }
      });

      tab.addEventListener("keydown", (e) => {
        let index = Array.prototype.indexOf.call(tabs, e.currentTarget);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          let nextIndex = (index + 1) % tabs.length;
          tabs[nextIndex].focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          let prevIndex = (index - 1 + tabs.length) % tabs.length;
          tabs[prevIndex].focus();
        }
      });
    });

    document.addEventListener("DOMContentLoaded", () => {
      const activeTab = document.querySelector('[role="tab"].active');
      if (activeTab) {
        const panelId = activeTab.getAttribute("aria-controls");
        const panel = document.getElementById(panelId);
        if (panel) {
          panel.classList.remove("hidden");
          panel.setAttribute("tabindex", "0");
        }
      }
    });

    // Image modal preview with full screen popup and close button
    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    // Only images inside content-section will open modal
    const contentImages = document.querySelectorAll(".content-section img");

    contentImages.forEach((img) => {
      img.style.cursor = "zoom-in";
      img.addEventListener("click", () => {
        modalImage.src = img.src;
        modalImage.alt = img.alt;
        modal.classList.add("active");
        modal.focus();
        document.body.style.overflow = "hidden";
      });
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          modalImage.src = img.src;
          modalImage.alt = img.alt;
          modal.classList.add("active");
          modal.focus();
          document.body.style.overflow = "hidden";
        }
      });
    });

    function closeModal() {
      modal.classList.remove("active");
      modalImage.src = "";
      modalImage.alt = "";
      document.body.style.overflow = "";
    }

    modalCloseBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("active")) {
        closeModal();
      }
    });
