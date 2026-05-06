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

let IG_ITEMS = [];
let IG_INDEX = 0;

function updateNav() {
  const nav = document.getElementById("ig-nav");
  const prev = document.getElementById("ig-prev");
  const next = document.getElementById("ig-next");
  const counter = document.getElementById("ig-counter");
  const total = IG_ITEMS.length;
  const has = total > 0;
  if (nav) nav.classList.toggle("hidden", !has);
  if (prev) prev.disabled = !has || IG_INDEX <= 0;
  if (next) next.disabled = !has || IG_INDEX >= total - 1;
  if (counter) counter.textContent = has ? `${IG_INDEX + 1} / ${total}` : "";
}

function renderResults(items) {
  const root = document.getElementById("ig-results");
  if (!root) return;
  root.innerHTML = "";

  IG_ITEMS = items.filter((it) => /^https?:\/\//i.test(safeText(it?.url)));
  IG_INDEX = 0;
  updateNav();

  if (!IG_ITEMS.length) {
    root.innerHTML = `<div class="text-violet-100/90 text-sm">Tidak ada media yang ditemukan.</div>`;
    return;
  }

  renderCurrent();
}

function renderCurrent() {
  const root = document.getElementById("ig-results");
  if (!root) return;
  root.innerHTML = "";

  const item = IG_ITEMS[IG_INDEX];
  if (!item) {
    updateNav();
    return;
  }

  const url = safeText(item?.url);
  const type = safeText(item?.type || "");
  const isVideo = /mp4/i.test(type) || /\.mp4(\?|$)/i.test(url);
  const filename = isVideo ? `instagram-${IG_INDEX + 1}.mp4` : `instagram-${IG_INDEX + 1}.jpg`;
  const dlHref = buildDownloadHref(url, filename);

  const wrap = document.createElement("div");
  wrap.className = "border border-violet-300/20 rounded-2xl p-3 bg-slate-950/40";

  const label = document.createElement("div");
  label.className = "text-violet-100/90 text-xs font-semibold";
  label.textContent = `Media ${IG_INDEX + 1}${type ? ` · ${type}` : ""}`;

  const media = document.createElement(isVideo ? "video" : "img");
  media.className = "media mt-3";
  if (isVideo) {
    media.setAttribute("controls", "true");
    media.setAttribute("playsinline", "true");
    media.src = url;
  } else {
    media.alt = `Instagram media ${IG_INDEX + 1}`;
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

  updateNav();
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("ig-url");
  const btn = document.getElementById("ig-fetch");
  const status = document.getElementById("ig-status");
  const prev = document.getElementById("ig-prev");
  const next = document.getElementById("ig-next");

  prev?.addEventListener("click", () => {
    IG_INDEX = Math.max(0, IG_INDEX - 1);
    renderCurrent();
  });
  next?.addEventListener("click", () => {
    IG_INDEX = Math.min(Math.max(0, IG_ITEMS.length - 1), IG_INDEX + 1);
    renderCurrent();
  });

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

