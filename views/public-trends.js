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

  items.forEach((row, idx) => {
    const topic = safeText(row?.topic || row?.hashtag || row?.name || row?.title);
    const tweets = safeText(row?.tweets || row?.score || row?.volume || row?.tweet_volume || row?.recordDate);
    if (!topic) return;

    const xSearch = `https://twitter.com/search?q=${encodeURIComponent(topic)}`;
    const newsSearch = `https://news.google.com/search?q=${encodeURIComponent(topic)}&hl=id&gl=ID&ceid=ID:id`;

    const wrap = document.createElement("div");
    wrap.className = "trend-item";

    const header = document.createElement("div");
    header.className = "flex items-start gap-3";

    const rank = document.createElement("div");
    const rankNum = Number(row?.rank) || idx + 1;
    const rankCls = rankNum === 1 ? "rank-1" : rankNum === 2 ? "rank-2" : rankNum === 3 ? "rank-3" : "";
    rank.className = `rank-badge ${rankCls}`.trim();
    rank.textContent = String(rankNum);

    const titleWrap = document.createElement("div");
    titleWrap.className = "flex-1 min-w-0";

    const title = document.createElement("div");
    title.className = "trend-topic";
    title.textContent = topic;

    const isHot = rankNum <= 3 || /over|k|m|trending/i.test(String(tweets || ""));
    if (isHot) {
      const hot = document.createElement("span");
      hot.className = "hot";
      hot.innerHTML = `<i class="fas fa-fire"></i>HOT`;
      title.appendChild(hot);
    }

    titleWrap.appendChild(title);
    header.appendChild(rank);
    header.appendChild(titleWrap);

    const meta = document.createElement("div");
    meta.className = "trend-meta";
    meta.textContent = tweets ? `Volume: ${tweets}` : "Volume: -";

    const actions = document.createElement("div");
    actions.className = "trend-actions flex flex-wrap gap-2";
    actions.innerHTML = `
      <a href="${xSearch}" target="_blank" rel="noopener"><i class="fas fa-hashtag"></i>Search di X</a>
      <a href="${newsSearch}" target="_blank" rel="noopener"><i class="fas fa-newspaper"></i>Berita terkait</a>
    `;

    wrap.appendChild(header);
    wrap.appendChild(meta);
    wrap.appendChild(actions);
    root.appendChild(wrap);
  });
}

async function fetchTrends(country) {
  const safeCountry = safeText(country) || "indonesia";
  // Key WAJIB bernama `country` untuk NeoXR upstream.
  const url = `/api/public/trends?country=${encodeURIComponent(safeCountry)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("trends-country") || document.getElementById("trends-q");
  const btn = document.getElementById("trends-fetch");
  const status = document.getElementById("trends-status");

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const country = safeText(input?.value || "indonesia") || "indonesia";
    if (input) input.value = country;
    if (status) status.textContent = `Memuat trending untuk country=${country}…`;
    btn.disabled = true;
    renderList([]);
    try {
      const items = await fetchTrends(country);
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
