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

function setActiveMode(mode) {
  const btnVideo = document.getElementById("yt-mode-video");
  const btnAudio = document.getElementById("yt-mode-audio");
  const qVideo = document.getElementById("yt-quality-video");
  const qAudio = document.getElementById("yt-quality-audio");
  const wrapVideo = document.getElementById("yt-video-quality-wrap");
  const wrapAudio = document.getElementById("yt-audio-quality-wrap");
  if (btnVideo) btnVideo.classList.toggle("active", mode === "video");
  if (btnAudio) btnAudio.classList.toggle("active", mode === "audio");
  if (qVideo) qVideo.disabled = mode !== "video";
  if (qAudio) qAudio.disabled = mode !== "audio";
  if (wrapVideo) wrapVideo.classList.toggle("hidden", mode !== "video");
  if (wrapAudio) wrapAudio.classList.toggle("hidden", mode !== "audio");
}

function buildDownloadHref(url, filename) {
  return `/api/public/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename || "download")}`;
}

function setPreview(payload, mode) {
  const thumb = document.getElementById("yt-thumb");
  const meta = document.getElementById("yt-meta");
  const v = document.getElementById("yt-preview-video");
  const a = document.getElementById("yt-preview-audio");
  const dl = document.getElementById("yt-download");

  const title = safeText(payload?.title);
  const channel = safeText(payload?.channel);
  const fduration = safeText(payload?.fduration);
  const views = safeText(payload?.views);
  const publish = safeText(payload?.publish);
  const thumbUrl = safeText(payload?.thumbnail);
  const fileUrl = safeText(payload?.data?.url);
  const filename = safeText(payload?.data?.filename) || (mode === "video" ? "video.mp4" : "audio.mp3");

  if (thumb && /^https?:\/\//i.test(thumbUrl)) {
    thumb.src = thumbUrl;
    show(thumb, true);
  } else {
    show(thumb, false);
    if (thumb) thumb.removeAttribute("src");
  }

  if (meta) {
    const bits = [
      title ? `Judul: ${title}` : "",
      channel ? `Channel: ${channel}` : "",
      fduration ? `Durasi: ${fduration}` : "",
      views ? `Views: ${views}` : "",
      publish ? `Publish: ${publish}` : ""
    ].filter(Boolean);
    meta.textContent = bits.join(" · ") || "Selesai.";
    show(meta, true);
  }

  if (!/^https?:\/\//i.test(fileUrl)) {
    if (dl) dl.classList.add("hidden");
    if (v) v.classList.add("hidden");
    if (a) a.classList.add("hidden");
    throw new Error("API tidak mengembalikan URL file.");
  }

  if (mode === "video") {
    if (v) {
      v.src = fileUrl;
      v.load();
    }
    if (a) {
      a.removeAttribute("src");
      a.load();
    }
    show(v, true);
    show(a, false);
  } else {
    if (a) {
      a.src = fileUrl;
      a.load();
    }
    if (v) {
      v.removeAttribute("src");
      v.load();
    }
    show(a, true);
    show(v, false);
  }

  if (dl) {
    dl.href = buildDownloadHref(fileUrl, filename);
    dl.setAttribute("download", filename);
    show(dl, true);
  }
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
  const btnVideo = document.getElementById("yt-mode-video");
  const btnAudio = document.getElementById("yt-mode-audio");
  const urlInput = document.getElementById("yt-url");
  const qVideo = document.getElementById("yt-quality-video");
  const qAudio = document.getElementById("yt-quality-audio");
  const btn = document.getElementById("yt-fetch");
  const status = document.getElementById("yt-status");
  const dl = document.getElementById("yt-download");

  let mode = "video";
  setActiveMode(mode);

  btnVideo?.addEventListener("click", () => {
    mode = "video";
    setActiveMode(mode);
  });
  btnAudio?.addEventListener("click", () => {
    mode = "audio";
    setActiveMode(mode);
  });

  urlInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const url = safeText(urlInput?.value);
    const quality = mode === "video" ? safeText(qVideo?.value) : safeText(qAudio?.value);
    if (!url) {
      if (status) status.textContent = "Masukkan link YouTube dulu.";
      return;
    }
    if (!quality) {
      if (status) status.textContent = "Pilih kualitas dulu.";
      return;
    }

    if (status) status.textContent = "Memproses…";
    btn.disabled = true;

    try {
      const res = await fetch(
        `/api/public/youtube?url=${encodeURIComponent(url)}&type=${encodeURIComponent(mode)}&quality=${encodeURIComponent(quality)}`,
        { headers: { Accept: "application/json" } }
      );
      const payload = await res.json();
      if (!res.ok) throw payload;

      setPreview(payload, mode);
      if (status) status.textContent = "Selesai. Preview siap—klik Download untuk menyimpan file.";
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
    const filename = dl.getAttribute("download") || (mode === "video" ? "video.mp4" : "audio.mp3");
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});

