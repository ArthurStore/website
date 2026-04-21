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

function setPreview(target, source) {
  const node = document.getElementById(target);
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
  const form = document.getElementById("upscale-form");
  const fileInput = document.getElementById("image-file");
  const fileInfoNode = document.getElementById("upscale-file-info");
  const resultNode = document.getElementById("upscale-result");

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      if (fileInfoNode) fileInfoNode.textContent = "Belum ada file dipilih.";
      return;
    }
    if (fileInfoNode) fileInfoNode.textContent = `File dipilih: ${file.name}`;
    setPreview("origin-preview", URL.createObjectURL(file));
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput?.files?.[0];
    if (!file) {
      resultNode.textContent = "Pilih file dulu.";
      return;
    }

    resultNode.textContent = "Memproses gambar...";
    setPreview("result-preview", "");
    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/public/upscale", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      resultNode.textContent = toPrettyJson(payload);
      setPreview("result-preview", extractImageUrl(payload));
    } catch (error) {
      resultNode.textContent = toPrettyJson(error || { message: "Gagal proses upscale." });
    }
  });
});
