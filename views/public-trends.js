function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
}

function safeText(v) {
  return String(v == null ? "" : v).trim();
}

function renderList(items) {
  const root = document.getElementById("trends-list");
  if (!root) return;
  root.innerHTML = "";

  if (!items.length) {
    root.innerHTML = `<div class="text-blue-100/90 text-sm">Tidak ada data.</div>`;
    return;
  }

  items.forEach((row) => {
    const topic = safeText(row?.topic);
    const tweets = safeText(row?.tweets);
    if (!topic) return;

    const xSearch = `https://twitter.com/search?q=${encodeURIComponent(topic)}`;
    const newsSearch = `https://news.google.com/search?q=${encodeURIComponent(topic)}&hl=id&gl=ID&ceid=ID:id`;

    const wrap = document.createElement("div");
    wrap.className = "trend-item";

    const title = document.createElement("div");
    title.className = "trend-topic";
    title.textContent = topic;

    const meta = document.createElement("div");
    meta.className = "trend-meta";
    meta.textContent = tweets ? `Volume: ${tweets}` : "Volume: -";

    const actions = document.createElement("div");
    actions.className = "trend-actions flex flex-wrap gap-2";
    actions.innerHTML = `
      <a href="${xSearch}" target="_blank" rel="noopener"><i class="fas fa-hashtag"></i>Search di X</a>
      <a href="${newsSearch}" target="_blank" rel="noopener"><i class="fas fa-newspaper"></i>Berita terkait</a>
    `;

    wrap.appendChild(title);
    wrap.appendChild(meta);
    wrap.appendChild(actions);
    root.appendChild(wrap);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("trends-q");
  const btn = document.getElementById("trends-fetch");
  const status = document.getElementById("trends-status");

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const q = safeText(input?.value || "indonesia") || "indonesia";
    if (status) status.textContent = "Memuat…";
    btn.disabled = true;
    renderList([]);
    try {
      const res = await fetch(`/api/public/trends?q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;
      const items = Array.isArray(payload?.data) ? payload.data : [];
      renderList(items);
      if (status) status.textContent = `Selesai. ${items.length} topik.`;
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });

  // auto-load
  btn?.click();
});

