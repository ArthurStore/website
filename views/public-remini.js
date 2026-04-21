function toPrettyJson(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload || "");
  }
}

function extractImageUrl(payload) {
  if (!payload) return "";
  const direct = payload?.data?.url || payload?.url || payload?.data?.downloadUrl || "";
  return /^https?:\/\//i.test(String(direct || "")) ? direct : "";
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

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("remini-file");
  const submitButton = document.getElementById("remini-submit");
  const resultNode = document.getElementById("remini-result");
  const fileNameNode = document.getElementById("remini-file-name");

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      if (fileNameNode) fileNameNode.textContent = "Belum ada file dipilih.";
      return;
    }
    if (fileNameNode) fileNameNode.textContent = `Foto dipilih: ${file.name}`;
    setPreview("remini-before", URL.createObjectURL(file));
  });

  submitButton?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      resultNode.textContent = "Pilih file foto dulu.";
      return;
    }
    resultNode.textContent = "Memproses foto, mohon tunggu sebentar...";
    setPreview("remini-after", "");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/public/remini", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      resultNode.textContent = toPrettyJson(payload);
      setPreview("remini-after", extractImageUrl(payload));
    } catch (error) {
      resultNode.textContent = toPrettyJson(error || { message: "Gagal proses remini." });
    }
  });
});
