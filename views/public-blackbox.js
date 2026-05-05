function extractReply(payload) {
  if (!payload || typeof payload !== "object") return "";
  const d = payload.data;
  if (typeof d === "string") return d.trim();
  if (d != null && typeof d.message === "string") return d.message.trim();
  if (typeof payload.message === "string") return payload.message.trim();
  return "";
}

function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || "Terjadi kesalahan.";
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-send");
  const out = document.getElementById("out");
  const input = document.getElementById("q-input");

  btn?.addEventListener("click", async () => {
    const q = String(input?.value || "").trim();
    if (!q) {
      if (out) out.textContent = "Isi pertanyaan dulu.";
      return;
    }
    btn.disabled = true;
    if (out) out.textContent = "Menunggu respons…";
    try {
      const response = await fetch("/api/public/blackbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ q })
      });
      const payload = await response.json();
      if (!response.ok) throw payload;
      const text = extractReply(payload);
      if (out) {
        out.textContent =
          text ||
          "Respons sukses tapi tidak ada teks yang bisa ditampilkan (cek struktur data upstream).";
      }
    } catch (error) {
      if (out) out.textContent = pickErrorMessage(error);
    } finally {
      btn.disabled = false;
    }
  });
});
