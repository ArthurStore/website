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

function pickHttpUrl(...candidates) {
  for (const c of candidates) {
    const s = safeText(c);
    if (/^https?:\/\//i.test(s)) return s;
  }
  return "";
}

function extractTikTokMedia(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const video = pickHttpUrl(
    data.video,
    data.video_nowm,
    data.nowm,
    data.play,
    data.url,
    data.videoUrl,
    data?.video?.url,
    data?.data?.url
  );
  const audio = pickHttpUrl(
    data.audio,
    data.music,
    data.music_url,
    data.mp3,
    data?.music?.url,
    data?.audio?.url
  );
  const thumb = pickHttpUrl(
    data.thumbnail,
    data.cover,
    data.thumb,
    data.photo,
    data?.author?.avatar
  );
  const title = safeText(data.title || data.caption || data.desc || payload?.title);
  const author = safeText(
    data.author?.nickname ||
    data.author?.unique_id ||
    data.author ||
    data.username ||
    ""
  );
  return { video, audio, thumb, title, author };
}

function bindDownloadButton(el, href, filename) {
  if (!el) return;
  if (!href) {
    show(el, false);
    el.removeAttribute("href");
    return;
  }
  el.href = href;
  el.setAttribute("download", filename);
  show(el, true);
  el.onclick = async (e) => {
    e.preventDefault();
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("tt-url");
  const btn = document.getElementById("tt-fetch");
  const status = document.getElementById("tt-status");
  const thumb = document.getElementById("tt-thumb");
  const meta = document.getElementById("tt-meta");
  const preview = document.getElementById("tt-preview");
  const dlVideo = document.getElementById("tt-dl-video");
  const dlAudio = document.getElementById("tt-dl-audio");

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const url = safeText(input?.value);
    if (!url) {
      if (status) status.textContent = "Masukkan link TikTok dulu.";
      return;
    }

    if (status) status.textContent = "Memproses…";
    btn.disabled = true;
    show(thumb, false);
    show(meta, false);
    show(preview, false);
    bindDownloadButton(dlVideo, "", "");
    bindDownloadButton(dlAudio, "", "");

    try {
      const res = await fetch(`/api/public/tiktok?url=${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;

      const media = extractTikTokMedia(payload);
      if (!media.video && !media.audio) {
        throw new Error("API tidak mengembalikan URL video/audio.");
      }

      if (thumb && media.thumb) {
        thumb.src = media.thumb;
        show(thumb, true);
      }

      if (meta) {
        const bits = [
          media.title ? `Judul: ${media.title}` : "",
          media.author ? `Author: ${media.author}` : ""
        ].filter(Boolean);
        meta.textContent = bits.join(" · ") || "Media siap diunduh.";
        show(meta, true);
      }

      if (preview && media.video) {
        preview.src = media.video;
        preview.load();
        show(preview, true);
      }

      if (media.video) {
        bindDownloadButton(dlVideo, buildDownloadHref(media.video, "tiktok-video.mp4"), "tiktok-video.mp4");
      }
      if (media.audio) {
        bindDownloadButton(dlAudio, buildDownloadHref(media.audio, "tiktok-audio.mp3"), "tiktok-audio.mp3");
      }

      if (status) {
        status.textContent = "Selesai. Pilih Download Video atau Download MP3.";
      }
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });
});
