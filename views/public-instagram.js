function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
}

function safeText(v) {
  return String(v == null ? "" : v).trim();
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

function renderResults(items) {
  const root = document.getElementById("ig-results");
  if (!root) return;
  root.innerHTML = "";

  if (!items.length) {
    root.innerHTML = `<div class="text-violet-100/90 text-sm">Tidak ada media yang ditemukan.</div>`;
    return;
  }

  items.forEach((item, idx) => {
    const url = safeText(item?.url);
    const type = safeText(item?.type || "");
    if (!/^https?:\/\//i.test(url)) return;

    const isVideo = /mp4/i.test(type) || /\.mp4(\?|$)/i.test(url);
    const filename = isVideo ? `instagram-${idx + 1}.mp4` : `instagram-${idx + 1}.jpg`;
    const dlHref = buildDownloadHref(url, filename);

    const wrap = document.createElement("div");
    wrap.className = "border border-violet-300/20 rounded-2xl p-3 bg-slate-950/40";

    const label = document.createElement("div");
    label.className = "text-violet-100/90 text-xs font-semibold";
    label.textContent = `Media ${idx + 1}${type ? ` · ${type}` : ""}`;

    const media = document.createElement(isVideo ? "video" : "img");
    media.className = "media mt-3";
    if (isVideo) {
      media.setAttribute("controls", "true");
      media.setAttribute("playsinline", "true");
      media.src = url;
    } else {
      media.alt = `Instagram media ${idx + 1}`;
      media.src = url;
      media.loading = "lazy";
    }

    const dl = document.createElement("a");
    dl.className = "btn-dl";
    dl.href = dlHref;
    dl.setAttribute("download", filename);
    dl.rel = "noopener";
    dl.innerHTML = `<i class="fas fa-download"></i>Download`;

    dl.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await forceDownload(dlHref, filename);
      if (!ok) window.open(dlHref, "_blank", "noopener");
    });

    wrap.appendChild(label);
    wrap.appendChild(media);
    wrap.appendChild(dl);
    root.appendChild(wrap);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("ig-url");
  const btn = document.getElementById("ig-fetch");
  const status = document.getElementById("ig-status");

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const url = safeText(input?.value);
    if (!url) {
      if (status) status.textContent = "Masukkan link Instagram dulu.";
      return;
    }
    if (status) status.textContent = "Memproses…";
    btn.disabled = true;
    renderResults([]);

    try {
      const res = await fetch(`/api/public/ig?url=${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;
      const items = Array.isArray(payload?.data) ? payload.data : [];
      renderResults(items);
      if (status) status.textContent = `Selesai. Ditemukan ${items.length} item.`;
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });
});

