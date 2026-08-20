function extractUrl(payload) {
  const direct = payload?.data?.url || payload?.url || payload?.data?.image || "";
  return /^https?:\/\//i.test(String(direct || "")) ? String(direct) : "";
}

function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
}

function normalizeTime(value, fallback) {
  const raw = String(value || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hh, mm] = raw.split(":");
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }
  return fallback;
}

function setPreview(url) {
  const img = document.getElementById("iqc-preview");
  if (!img) return;
  if (!url) {
    img.classList.add("hidden");
    img.removeAttribute("src");
    return;
  }
  img.src = url;
  img.classList.remove("hidden");
}

function setDownload(url, filenameHint) {
  const link = document.getElementById("iqc-download");
  if (!link) return;
  if (!url) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  const safeName = String(filenameHint || "iqc.png");
  link.href = `/api/public/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`;
  link.setAttribute("download", safeName);
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
  const textInput = document.getElementById("iqc-text");
  const timeInput = document.getElementById("iqc-time");
  const chatTimeInput = document.getElementById("iqc-chat-time");
  const btn = document.getElementById("iqc-generate");
  const status = document.getElementById("iqc-status");
  const dl = document.getElementById("iqc-download");

  btn?.addEventListener("click", async () => {
    const text = String(textInput?.value || "").trim();
    const time = normalizeTime(timeInput?.value, "12:40");
    const chatTime = normalizeTime(chatTimeInput?.value, "10:15");
    if (!text) {
      if (status) status.textContent = "Tulis pesan chat dulu.";
      return;
    }
    if (status) status.textContent = "Generating mockup…";
    btn.disabled = true;
    setPreview("");
    setDownload("", "");
    try {
      const params = new URLSearchParams({
        text,
        time,
        chat_time: chatTime
      });
      const res = await fetch(`/api/public/iqc?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;
      const url = extractUrl(payload);
      if (!url) throw new Error("API tidak mengembalikan URL gambar.");
      setPreview(url);
      const filename = (payload?.data?.filename && String(payload.data.filename)) || "iqc.png";
      setDownload(url, filename);
      if (status) status.textContent = "Selesai. Screenshot siap di-download.";
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
    const filename = dl.getAttribute("download") || "iqc.png";
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});
