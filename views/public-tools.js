function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toPrettyJson(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload || "");
  }
}

function extractImageUrl(payload) {
  if (!payload) return "";
  const candidates = [
    payload?.data?.url,
    payload?.url,
    payload?.data?.downloadUrl,
    payload?.uploadedImage?.url
  ];
  const match = candidates.find((item) => typeof item === "string" && /^https?:\/\//i.test(item));
  return match || "";
}

function weatherVisualMeta(weatherText) {
  const raw = String(weatherText || "").toLowerCase();
  if (raw.includes("hujan") || raw.includes("rain")) {
    return { mode: "weather-rainy", icon: "fas fa-cloud-showers-heavy", emoji: "🌧️", label: "Cuaca Hujan" };
  }
  if (raw.includes("badai") || raw.includes("petir") || raw.includes("storm")) {
    return { mode: "weather-storm", icon: "fas fa-bolt", emoji: "⛈️", label: "Cuaca Badai" };
  }
  if (raw.includes("berawan") || raw.includes("cloud")) {
    return { mode: "weather-cloudy", icon: "fas fa-cloud-sun", emoji: "⛅", label: "Cuaca Berawan" };
  }
  if (raw.includes("cerah") || raw.includes("sun")) {
    return { mode: "weather-sunny", icon: "fas fa-sun", emoji: "☀️", label: "Cuaca Cerah" };
  }
  return { mode: "weather-cloudy", icon: "fas fa-smog", emoji: "🌫️", label: "Cuaca" };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = { message: "Response bukan JSON valid." };
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `Request gagal (${response.status})`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function bindWeatherPage() {
  const form = document.getElementById("weather-form");
  const result = document.getElementById("weather-result");
  const skyline = document.getElementById("weather-skyline");
  if (!form || !result) return false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const subdistrict = String(document.getElementById("subdistrict")?.value || "").trim();
    if (!subdistrict) {
      result.textContent = "Isi subdistrict dulu ya.";
      return;
    }
    result.textContent = "Lagi cek cuaca...";
    try {
      const payload = await requestJson(`/api/public/cuaca?subdistrict=${encodeURIComponent(subdistrict)}`);
      const normalized = payload?.normalized || {};
      const current = normalized?.current || null;
      const forecast = Array.isArray(normalized?.forecast) ? normalized.forecast : [];
      const location = normalized?.location || {};
      if (!current) {
        result.textContent = toPrettyJson(payload);
        return;
      }

      const visual = weatherVisualMeta(current.weather);
      if (skyline) {
        skyline.textContent = visual.emoji;
      }
      const locationText = [
        location?.subdistrict,
        location?.regency,
        location?.province
      ].filter(Boolean).join(", ");

      const cards = forecast.map((item) => {
        const itemVisual = weatherVisualMeta(item?.weather);
        return `
          <article class="rounded-xl border border-slate-600/40 bg-slate-900/60 p-3">
            <div class="flex justify-between gap-2 items-center">
              <strong>${escapeHtml(String(item?.time || "-"))}</strong>
              <span>${itemVisual.emoji}</span>
            </div>
            <p class="mt-1">${escapeHtml(String(item?.weather || "-"))}</p>
            <p class="text-sky-300 text-sm mt-1">${escapeHtml(String(item?.temperature ?? "-"))}°C • Angin ${escapeHtml(String(item?.wind || "-"))}</p>
          </article>
        `;
      }).join("");

      result.innerHTML = `
        <div class="rounded-2xl p-4 ${visual.mode}">
          <div class="flex gap-3 items-center">
            <div class="w-16 h-16 rounded-full grid place-items-center bg-white/20 text-2xl">${visual.emoji}</div>
            <div>
              <h3 class="text-xl font-bold">${escapeHtml(String(current?.weather || "Cuaca"))}</h3>
              <p class="text-slate-100">${escapeHtml(locationText || "Lokasi tidak diketahui")}</p>
              <p class="text-slate-100 text-sm mt-1">Suhu <strong>${escapeHtml(String(current?.temperature ?? "-"))}°C</strong> • Angin ${escapeHtml(String(current?.wind || "-"))}</p>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">${cards}</div>
      `;
    } catch (error) {
      result.textContent = toPrettyJson(error?.payload || { message: error?.message || "Gagal cek cuaca." });
    }
  });

  return true;
}

function bindTempmailPage() {
  const form = document.getElementById("tempmail-form");
  const result = document.getElementById("tempmail-result");
  if (!form || !result) return false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(document.getElementById("tempmail-email")?.value || "").trim();
    if (!email) {
      result.textContent = "Isi email tempmail dulu.";
      return;
    }
    result.textContent = "Lagi baca inbox...";
    try {
      const payload = await requestJson(`/api/public/tempmail-read?email=${encodeURIComponent(email)}`);
      result.textContent = toPrettyJson(payload);
    } catch (error) {
      result.textContent = toPrettyJson(error?.payload || { message: error?.message || "Gagal baca tempmail." });
    }
  });

  return true;
}

function bindImageUploadPage(config) {
  const form = document.getElementById(config.formId);
  const result = document.getElementById(config.resultId);
  const preview = document.getElementById(config.previewId);
  if (!form || !result || !preview) return false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById(config.fileId);
    const file = input?.files?.[0];
    if (!file) {
      result.textContent = "Pilih file gambar dulu.";
      preview.classList.add("hidden");
      return;
    }
    result.textContent = "Lagi upload ke i.bb lalu proses API...";
    preview.classList.add("hidden");
    preview.removeAttribute("src");

    const payload = new FormData();
    payload.append("image", file);

    try {
      const responsePayload = await requestJson(config.endpoint, {
        method: "POST",
        body: payload
      });
      result.textContent = toPrettyJson(responsePayload);
      const previewUrl = extractImageUrl(responsePayload);
      if (previewUrl) {
        preview.src = previewUrl;
        preview.classList.remove("hidden");
      }
    } catch (error) {
      result.textContent = toPrettyJson(error?.payload || { message: error?.message || "Proses gagal." });
    }
  });

  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  const bound = [
    bindWeatherPage(),
    bindTempmailPage(),
    bindImageUploadPage({
      formId: "upscale-form",
      fileId: "upscale-image-file",
      resultId: "upscale-result",
      previewId: "upscale-preview",
      endpoint: "/api/public/upscale"
    }),
    bindImageUploadPage({
      formId: "remini-form",
      fileId: "remini-image-file",
      resultId: "remini-result",
      previewId: "remini-preview",
      endpoint: "/api/public/remini"
    })
  ];

  if (!bound.some(Boolean)) {
    const homeHint = document.getElementById("public-home-hint");
    if (homeHint) {
      homeHint.textContent = "Pilih salah satu fitur public dari menu kartu di atas ya ⚡";
    }
  }
});
