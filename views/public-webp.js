function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
}

function safeText(v) {
  return String(v == null ? "" : v).trim();
}

function show(el, yes) {
  if (!el) return;
  el.classList.toggle("hidden", !yes);
}

function buildDownloadHref(url, filename) {
  return `/api/public/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename || "download")}`;
}

async function forceDownload(url, filename) {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch (_e) {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnJpg = document.getElementById("webp-mode-jpg");
  const btnMp4 = document.getElementById("webp-mode-mp4");
  const input = document.getElementById("webp-url");
  const btn = document.getElementById("webp-convert");
  const status = document.getElementById("webp-status");
  const img = document.getElementById("webp-preview-img");
  const video = document.getElementById("webp-preview-video");
  const dl = document.getElementById("webp-download");

  let mode = "jpg";
  const setMode = (m) => {
    mode = m;
    btnJpg?.classList.toggle("active", mode === "jpg");
    btnMp4?.classList.toggle("active", mode === "mp4");
  };

  setMode("jpg");

  btnJpg?.addEventListener("click", () => setMode("jpg"));
  btnMp4?.addEventListener("click", () => setMode("mp4"));

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const url = safeText(input?.value);
    if (!url) {
      if (status) status.textContent = "Masukkan URL .webp dulu.";
      return;
    }
    if (status) status.textContent = "Memproses…";
    btn.disabled = true;

    show(img, false);
    if (img) img.removeAttribute("src");
    show(video, false);
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
    show(dl, false);
    if (dl) dl.removeAttribute("href");

    try {
      const endpoint = mode === "jpg" ? "webp2jpg" : "webp2mp4";
      const res = await fetch(`/api/public/${endpoint}?url=${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;

      const outUrl = safeText(payload?.data?.url || payload?.url);
      if (!/^https?:\/\//i.test(outUrl)) throw new Error("API tidak mengembalikan URL output.");

      const filename = mode === "jpg" ? "converted.jpg" : "converted.mp4";
      const dlHref = buildDownloadHref(outUrl, filename);
      if (dl) {
        dl.href = dlHref;
        dl.setAttribute("download", filename);
        show(dl, true);
      }

      if (mode === "jpg") {
        if (img) img.src = outUrl;
        show(img, true);
        show(video, false);
      } else {
        if (video) {
          video.src = outUrl;
          video.load();
        }
        show(video, true);
        show(img, false);
      }

      if (status) status.textContent = "Selesai. Preview siap—klik Download.";
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });

  dl?.addEventListener("click", async (e) => {
    const href = safeText(dl.getAttribute("href"));
    if (!href || href === "#") return;
    e.preventDefault();
    const filename = dl.getAttribute("download") || (mode === "jpg" ? "converted.jpg" : "converted.mp4");
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});

