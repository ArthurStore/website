function toPrettyJson(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload || "");
  }
}

function collectImageUrls(value, bucket, depth = 0) {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?|$)/i.test(s)) bucket.push(s);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, bucket, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectImageUrls(item, bucket, depth + 1));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-fetch");
  const out = document.getElementById("out");
  const imgSlot = document.getElementById("img-slot");
  const extra = document.getElementById("extra-query");

  btn?.addEventListener("click", async () => {
    out.textContent = "Memuat…";
    imgSlot.classList.add("hidden");
    imgSlot.innerHTML = "";

    let qs = "";
    const raw = String(extra?.value || "").trim();
    if (raw) {
      const params = new URLSearchParams();
      raw.split("&").forEach((pair) => {
        const [k, v] = pair.split("=").map((x) => x.trim());
        if (k) params.append(k, v || "");
      });
      qs = params.toString();
    }

    const url = qs ? `/api/public/whatimg?${qs}` : "/api/public/whatimg";

    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      const payload = await response.json();
      out.textContent = toPrettyJson(payload);
      if (!response.ok) return;

      const urls = [];
      collectImageUrls(payload, urls);
      const unique = [...new Set(urls)];
      if (unique.length) {
        imgSlot.classList.remove("hidden");
        unique.forEach((src) => {
          const img = document.createElement("img");
          img.src = src;
          img.alt = "Gambar tebak-tebakan";
          img.className = "max-h-72 max-w-full mx-auto rounded-lg border border-emerald-500/30 object-contain";
          imgSlot.appendChild(img);
        });
      }
    } catch (error) {
      out.textContent = String(error?.message || error || "Request gagal.");
    }
  });
});
