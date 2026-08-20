function extractReply(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload.trim();
  if (typeof payload !== "object") return "";

  const candidates = [
    payload?.data?.data?.response,
    payload?.data?.response,
    payload?.data?.message,
    payload?.data?.text,
    payload?.data?.answer,
    payload?.data?.result,
    typeof payload?.data === "string" ? payload.data : null,
    payload?.result,
    payload?.response,
    payload?.message,
    payload?.text,
    payload?.answer
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  if (payload?.data && typeof payload.data === "object") {
    for (const value of Object.values(payload.data)) {
      if (typeof value === "string" && value.trim() && value.length > 1) return value.trim();
    }
  }
  return "";
}

function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
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
      const raw = await response.text();
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (_error) {
        throw new Error("Response bukan JSON valid.");
      }
      if (!response.ok) throw payload;
      const text = extractReply(payload);
      if (out) {
        out.textContent =
          text ||
          "Respons sukses tapi tidak ada teks yang bisa ditampilkan.";
      }
    } catch (error) {
      if (out) out.textContent = pickErrorMessage(error);
    } finally {
      btn.disabled = false;
    }
  });
});
