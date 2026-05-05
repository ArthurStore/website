function extractImageUrl(payload) {
  if (!payload) return "";
  const direct = payload?.data?.url || payload?.url || payload?.data?.downloadUrl || "";
  return /^https?:\/\//i.test(String(direct || "")) ? direct : "";
}

function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || "Terjadi kesalahan.";
}

function setPreview(targetId, source) {
  const node = document.getElementById(targetId);
  if (!node) return;
  if (!source) {
    node.classList.add("hidden");
    node.removeAttribute("src");
    return;
  }
  node.src = source;
  node.classList.remove("hidden");
}

function bindImageModal() {
  const modal = document.getElementById("img-modal");
  const modalImg = document.getElementById("img-modal-image");
  const title = document.getElementById("img-modal-title");
  const closeBtn = document.getElementById("img-modal-close");

  if (!modal || !modalImg || !title || !closeBtn) return { open: () => {}, close: () => {} };

  function close() {
    modal.classList.remove("open");
    modalImg.removeAttribute("src");
    document.body.style.overflow = "";
  }

  function open(src, label) {
    if (!src) return;
    title.textContent = label || "Preview";
    modalImg.src = src;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  return { open, close };
}

function setDownloadLink(url, filenameHint) {
  const link = document.getElementById("remini-download");
  if (!link) return;
  if (!url) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  link.href = url;
  link.setAttribute("download", filenameHint || "remini-enhanced");
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

function assignFileToInput(input, file) {
  if (!input || !file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = bindImageModal();
  const fileInput = document.getElementById("remini-file");
  const dropzone = document.getElementById("remini-dropzone");
  const browseButton = document.getElementById("remini-browse");
  const submitButton = document.getElementById("remini-submit");
  const statusNode = document.getElementById("remini-status");
  const fileNameNode = document.getElementById("remini-file-name");
  const beforeImg = document.getElementById("remini-before");
  const afterImg = document.getElementById("remini-after");

  function onFileChosen(file) {
    if (!file) {
      if (fileNameNode) fileNameNode.textContent = "Belum ada file dipilih.";
      return;
    }
    if (fileNameNode) fileNameNode.textContent = `Foto dipilih: ${file.name}`;
    setPreview("remini-before", URL.createObjectURL(file));
    setPreview("remini-after", "");
    setDownloadLink("", "");
    if (statusNode) statusNode.textContent = "Siap diproses — tap “Proses enhance”.";
  }

  beforeImg?.addEventListener("click", () => {
    const src = beforeImg.getAttribute("src");
    if (src) modal.open(src, "Before");
  });
  afterImg?.addEventListener("click", () => {
    const src = afterImg.getAttribute("src");
    if (src) modal.open(src, "After");
  });

  browseButton?.addEventListener("click", () => {
    fileInput?.click();
  });

  dropzone?.addEventListener("click", () => {
    fileInput?.click();
  });

  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput?.click();
    }
  });

  ["dragenter", "dragover"].forEach((ev) => {
    dropzone?.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file && /^image\//i.test(file.type)) {
      assignFileToInput(fileInput, file);
      onFileChosen(file);
    }
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      if (fileNameNode) fileNameNode.textContent = "Belum ada file dipilih.";
      return;
    }
    onFileChosen(file);
  });

  submitButton?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      if (statusNode) statusNode.textContent = "Pilih file foto dulu.";
      return;
    }
    if (statusNode) statusNode.textContent = "Processing…";
    setPreview("remini-after", "");
    setDownloadLink("", "");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/public/remini", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      const outUrl = extractImageUrl(payload);
      if (!outUrl) throw new Error("API tidak mengembalikan URL gambar.");
      setPreview("remini-after", outUrl);
      const fname =
        (payload?.data?.filename && String(payload.data.filename).replace(/[^\w.\-]+/g, "_")) ||
        "remini-result.png";
      setDownloadLink(outUrl, fname);
      if (statusNode) {
        statusNode.textContent = "Selesai — cek perbandingan before / after, lalu unduh jika sudah pas.";
      }
    } catch (error) {
      if (statusNode) statusNode.textContent = pickErrorMessage(error);
    }
  });

  const dl = document.getElementById("remini-download");
  dl?.addEventListener("click", async (e) => {
    const href = String(dl.getAttribute("href") || "").trim();
    if (!href || href === "#") return;
    e.preventDefault();
    const filename = dl.getAttribute("download") || "remini-result";
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});
