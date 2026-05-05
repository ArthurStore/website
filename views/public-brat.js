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
  const img = document.getElementById("brat-preview");
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
  const link = document.getElementById("brat-download");
  if (!link) return;
  if (!url) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  const safeName = String(filenameHint || "brat.png");
  link.href = `/api/public/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`;
  link.setAttribute("download", filenameHint || "brat.png");
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
  const input = document.getElementById("brat-text");
  const btn = document.getElementById("brat-generate");
  const status = document.getElementById("brat-status");
  const dl = document.getElementById("brat-download");

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
      const res = await fetch(`/api/public/brat?text=${encodeURIComponent(text)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;
      const url = extractUrl(payload);
      if (!url) throw new Error("API tidak mengembalikan URL file.");
      setPreview(url);
      const filename = (payload?.data?.filename && String(payload.data.filename)) || "brat.png";
      setDownload(url, filename);
      if (status) status.textContent = "Selesai. Preview siap—klik download untuk menyimpan file.";
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
    const filename = dl.getAttribute("download") || "brat.png";
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});

