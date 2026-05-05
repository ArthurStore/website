function extractUrl(payload) {
  const direct = payload?.data?.url || payload?.url || "";
  return /^https?:\/\//i.test(String(direct || "")) ? String(direct) : "";
}

function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || "Terjadi kesalahan.";
}

function setPreview(url) {
  const video = document.getElementById("bratvid-preview");
  if (!video) return;
  if (!url) {
    video.classList.add("hidden");
    video.removeAttribute("src");
    video.load();
    return;
  }
  video.src = url;
  video.classList.remove("hidden");
  video.load();
}

function setDownload(url, filenameHint) {
  const link = document.getElementById("bratvid-download");
  if (!link) return;
  if (!url) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  link.href = url;
  link.setAttribute("download", filenameHint || "bratvid.mp4");
  link.classList.remove("hidden");
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
  const input = document.getElementById("bratvid-text");
  const btn = document.getElementById("bratvid-generate");
  const status = document.getElementById("bratvid-status");
  const dl = document.getElementById("bratvid-download");

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const text = String(input?.value || "").trim();
    if (!text) {
      if (status) status.textContent = "Masukkan teks dulu.";
      return;
    }
    if (status) status.textContent = "Memproses…";
    btn.disabled = true;
    setPreview("");
    setDownload("", "");
    try {
      const res = await fetch(`/api/public/bratvid?text=${encodeURIComponent(text)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;
      const url = extractUrl(payload);
      if (!url) throw new Error("API tidak mengembalikan URL file.");
      setPreview(url);
      const filename = (payload?.data?.filename && String(payload.data.filename)) || "bratvid.mp4";
      setDownload(url, filename);
      if (status) status.textContent = "Selesai. Preview siap—klik download untuk menyimpan video.";
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });

  dl?.addEventListener("click", async (e) => {
    const href = String(dl.getAttribute("href") || "").trim();
    if (!href || href === "#") return;
    e.preventDefault();
    const filename = dl.getAttribute("download") || "bratvid.mp4";
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});

