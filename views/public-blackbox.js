function toPrettyJson(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload || "");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-send");
  const out = document.getElementById("out");
  const input = document.getElementById("q-input");

  btn?.addEventListener("click", async () => {
    const q = String(input?.value || "").trim();
    if (!q) {
      out.textContent = "Isi pertanyaan dulu.";
      return;
    }
    btn.disabled = true;
    out.textContent = "Menunggu respons AI…";
    try {
      const response = await fetch("/api/public/blackbox", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ q })
      });
      const payload = await response.json();
      out.textContent = toPrettyJson(payload);
    } catch (error) {
      out.textContent = String(error?.message || error || "Request gagal.");
    } finally {
      btn.disabled = false;
    }
  });
});
