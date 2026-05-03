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

function weatherVisualMeta(weatherText) {
  const raw = String(weatherText || "").toLowerCase();
  if (raw.includes("hujan") || raw.includes("rain")) {
    return { mode: "weather-rainy", icon: "fas fa-cloud-showers-heavy", label: "Cuaca Hujan", emoji: "🌧️" };
  }
  if (raw.includes("badai") || raw.includes("petir") || raw.includes("storm")) {
    return { mode: "weather-storm", icon: "fas fa-bolt", label: "Cuaca Badai", emoji: "⛈️" };
  }
  if (raw.includes("berawan") || raw.includes("cloud")) {
    return { mode: "weather-cloudy", icon: "fas fa-cloud-sun", label: "Cuaca Berawan", emoji: "⛅" };
  }
  if (raw.includes("cerah") || raw.includes("sun")) {
    return { mode: "weather-sunny", icon: "fas fa-sun", label: "Cuaca Cerah", emoji: "☀️" };
  }
  return { mode: "weather-cloudy", icon: "fas fa-smog", label: "Cuaca", emoji: "🌤️" };
}

function weatherSceneDecor(mode) {
  if (mode === "weather-sunny") {
    return `
      <div class="weather-fx weather-fx-sun" aria-hidden="true">
        <span class="sun-ray-ring"></span>
      </div>`;
  }
  if (mode === "weather-rainy") {
    return `<div class="weather-fx weather-fx-rain" aria-hidden="true"></div>`;
  }
  if (mode === "weather-storm") {
    return `
      <div class="weather-fx weather-fx-rain weather-fx-storm" aria-hidden="true"></div>
      <div class="lightning-flash" aria-hidden="true"></div>`;
  }
  if (mode === "weather-cloudy") {
    return `
      <div class="weather-fx weather-fx-clouds" aria-hidden="true">
        <span class="cloud c1"></span>
        <span class="cloud c2"></span>
        <span class="cloud c3"></span>
      </div>`;
  }
  return "";
}

function weatherIconClass(mode) {
  const modes = {
    "weather-sunny": "weather-icon-sunny",
    "weather-rainy": "weather-icon-rainy",
    "weather-storm": "weather-icon-storm",
    "weather-cloudy": "weather-icon-cloudy"
  };
  const extra = modes[mode] || "weather-icon-cloudy";
  return `weather-icon ${extra}`;
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
    const error = new Error(payload?.message || `Request gagal (${response.status})`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("weather-form");
  const input = document.getElementById("subdistrict");
  const resultNode = document.getElementById("weather-result");

  if (!form || !input || !resultNode) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const subdistrict = String(input.value || "").trim();
    if (!subdistrict) {
      resultNode.textContent = "Isi subdistrict dulu.";
      return;
    }
    resultNode.textContent = "Mengambil data cuaca...";
    try {
      const payload = await requestJson(`/api/public/cuaca?subdistrict=${encodeURIComponent(subdistrict)}`);
      const normalized = payload?.normalized || {};
      const current = normalized?.current || null;
      const forecast = Array.isArray(normalized?.forecast) ? normalized.forecast : [];
      const location = normalized?.location || {};

      if (!current) {
        resultNode.textContent = toPrettyJson(payload);
        return;
      }

      const visual = weatherVisualMeta(current.weather);
      const locationText = [location?.subdistrict, location?.regency, location?.province]
        .filter(Boolean)
        .join(", ");

      const forecastHtml = forecast.map((item) => {
        const itemVisual = weatherVisualMeta(item?.weather);
        return `
          <div class="forecast-item">
            <div class="flex items-center justify-between gap-2">
              <strong>${escapeHtml(String(item?.time || "-"))}</strong>
              <span class="forecast-emoji" aria-hidden="true">${itemVisual.emoji}</span>
            </div>
            <div class="mt-1">${escapeHtml(String(item?.weather || "-"))}</div>
            <div class="text-blue-300 mt-1">${escapeHtml(String(item?.temperature ?? "-"))}°C • Angin ${escapeHtml(String(item?.wind || "-"))}</div>
          </div>
        `;
      }).join("");

      resultNode.innerHTML = `
        <div class="weather-hero ${visual.mode}">
          ${weatherSceneDecor(visual.mode)}
          <div class="weather-hero-inner">
            <div class="${weatherIconClass(visual.mode)}" aria-hidden="true">
              <span class="weather-emoji-wrap">
                <span class="weather-emoji">${visual.emoji}</span>
              </span>
              <i class="${visual.icon} weather-icon-fallback"></i>
            </div>
            <div>
              <h3 class="text-xl font-bold text-white">${escapeHtml(String(current?.weather || "Kondisi Tidak Diketahui"))}</h3>
              <p class="text-blue-100">${escapeHtml(locationText || "Lokasi tidak diketahui")}</p>
              <p class="text-blue-100 mt-1">Suhu: <strong>${escapeHtml(String(current?.temperature ?? "-"))}°C</strong> • Angin: ${escapeHtml(String(current?.wind || "-"))}</p>
            </div>
          </div>
        </div>
        <div class="forecast-grid">${forecastHtml}</div>
      `;
    } catch (error) {
      resultNode.textContent = toPrettyJson(error?.payload || { message: error?.message || "Gagal cek cuaca." });
    }
  });
});
