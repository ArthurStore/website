function toPrettyJson(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload || "");
  }
}

async function requestJson(url) {
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = { message: "Response bukan JSON valid." };
  }
  if (!response.ok) {
    const err = new Error(payload?.message || `Request gagal (${response.status})`);
    err.payload = payload;
    throw err;
  }
  return payload;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("tempmail-form");
  const emailInput = document.getElementById("tempmail-email");
  const resultNode = document.getElementById("tempmail-result");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(emailInput?.value || "").trim();
    if (!email) {
      resultNode.textContent = "Isi email tempmail dulu.";
      return;
    }
    resultNode.textContent = "Membaca inbox tempmail...";
    try {
      const payload = await requestJson(`/api/public/tempmail-read?email=${encodeURIComponent(email)}`);
      resultNode.textContent = toPrettyJson(payload);
    } catch (error) {
      resultNode.textContent = toPrettyJson(error?.payload || { message: error?.message || "Gagal baca tempmail." });
    }
  });
});
