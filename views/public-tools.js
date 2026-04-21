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
  const direct = payload?.data?.url || payload?.url || payload?.data?.downloadUrl || "";
  if (typeof direct === "string" && /^https?:\/\//i.test(direct)) {
    return direct;
  }
  return "";
}

function weatherVisualMeta(weatherText) {
  const raw = String(weatherText || "").toLowerCase();
  if (raw.includes("hujan") || raw.includes("rain")) {
    return { mode: "weather-rainy", icon: "fas fa-cloud-showers-heavy", label: "Cuaca Hujan" };
  }
  if (raw.includes("badai") || raw.includes("petir") || raw.includes("storm")) {
    return { mode: "weather-storm", icon: "fas fa-bolt", label: "Cuaca Badai" };
  }
  if (raw.includes("berawan") || raw.includes("cloud")) {
    return { mode: "weather-cloudy", icon: "fas fa-cloud-sun", label: "Cuaca Berawan" };
  }
  if (raw.includes("cerah") || raw.includes("sun")) {
    return { mode: "weather-sunny", icon: "fas fa-sun", label: "Cuaca Cerah" };
  }
  return { mode: "weather-cloudy", icon: "fas fa-smog", label: "Cuaca" };
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

function renderWeatherResult(payload) {
  const wrapper = document.getElementById("weather-result");
  const normalized = payload?.normalized || {};
  const current = normalized?.current || null;
  const forecast = Array.isArray(normalized?.forecast) ? normalized.forecast : [];
  const location = normalized?.location || {};

  if (!current) {
    wrapper.textContent = toPrettyJson(payload);
    return;
  }

  const visual = weatherVisualMeta(current.weather);
  const locationText = [
    location?.subdistrict,
    location?.regency,
    location?.province
  ].filter(Boolean).join(", ");

  const forecastHtml = forecast.map((item) => {
    const meta = weatherVisualMeta(item?.weather);
    return `
      <div class="forecast-item">
        <div class="flex items-center justify-between gap-2">
          <strong>${escapeHtml(String(item?.time || "-"))}</strong>
          <i class="${meta.icon}" aria-label="${escapeHtml(meta.label)}"></i>
        </div>
        <div class="mt-1">${escapeHtml(String(item?.weather || "-"))}</div>
        <div class="text-blue-300 mt-1">${escapeHtml(String(item?.temperature ?? "-"))}°C • Angin ${escapeHtml(String(item?.wind || "-"))}</div>
      </div>
    `;
  }).join("");

  wrapper.innerHTML = `
    <div class="weather-hero ${visual.mode}">
      <div class="weather-icon" aria-hidden="true"><i class="${visual.icon}"></i></div>
      <div>
        <h3 class="text-xl font-bold text-white">${escapeHtml(String(current?.weather || "Kondisi Tidak Diketahui"))}</h3>
        <p class="text-blue-100">${escapeHtml(locationText || "Lokasi tidak diketahui")}</p>
        <p class="text-blue-100 mt-1">Suhu: <strong>${escapeHtml(String(current?.temperature ?? "-"))}°C</strong> • Angin: ${escapeHtml(String(current?.wind || "-"))}</p>
      </div>
    </div>
    <div class="forecast-grid">${forecastHtml}</div>
  `;
}

function setResultText(targetId, text) {
  const target = document.getElementById(targetId);
  target.textContent = text;
}

function setResultJson(targetId, payload) {
  const target = document.getElementById(targetId);
  target.textContent = toPrettyJson(payload);
}

function setPreview(imageId, url) {
  const preview = document.getElementById(imageId);
  if (!url) {
    preview.classList.add("hidden");
    preview.removeAttribute("src");
    return;
  }
  preview.src = url;
  preview.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const weatherForm = document.getElementById("weather-form");
  const tempmailForm = document.getElementById("tempmail-form");
  const upscaleForm = document.getElementById("upscale-form");
  const reminiForm = document.getElementById("remini-form");

  weatherForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const subdistrict = String(document.getElementById("subdistrict")?.value || "").trim();
    if (!subdistrict) {
      setResultText("weather-result", "Isi subdistrict dulu.");
      return;
    }
    setResultText("weather-result", "Mengambil data cuaca...");
    try {
      const payload = await requestJson(`/api/public/cuaca?subdistrict=${encodeURIComponent(subdistrict)}`);
      renderWeatherResult(payload);
    } catch (error) {
      setResultJson("weather-result", error?.payload || { message: error?.message || "Gagal cek cuaca." });
    }
  });

  tempmailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(document.getElementById("tempmail-email")?.value || "").trim();
    if (!email) {
      setResultText("tempmail-result", "Isi email tempmail dulu.");
      return;
    }
    setResultText("tempmail-result", "Membaca inbox tempmail...");
    try {
      const payload = await requestJson(`/api/public/tempmail-read?email=${encodeURIComponent(email)}`);
      setResultJson("tempmail-result", payload);
    } catch (error) {
      setResultJson("tempmail-result", error?.payload || { message: error?.message || "Gagal baca tempmail." });
    }
  });

  upscaleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const image = String(document.getElementById("upscale-image")?.value || "").trim();
    if (!image) {
      setResultText("upscale-result", "Isi URL gambar dulu.");
      return;
    }
    setResultText("upscale-result", "Memproses upscale...");
    setPreview("upscale-preview", "");
    try {
      const payload = await requestJson(`/api/public/upscale?image=${encodeURIComponent(image)}`);
      setResultJson("upscale-result", payload);
      setPreview("upscale-preview", extractImageUrl(payload));
    } catch (error) {
      setResultJson("upscale-result", error?.payload || { message: error?.message || "Gagal upscale." });
    }
  });

  reminiForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const image = String(document.getElementById("remini-image")?.value || "").trim();
    if (!image) {
      setResultText("remini-result", "Isi URL gambar dulu.");
      return;
    }
    setResultText("remini-result", "Memproses remini...");
    setPreview("remini-preview", "");
    try {
      const payload = await requestJson(`/api/public/remini?image=${encodeURIComponent(image)}`);
      setResultJson("remini-result", payload);
      setPreview("remini-preview", extractImageUrl(payload));
    } catch (error) {
      setResultJson("remini-result", error?.payload || { message: error?.message || "Gagal remini." });
    }
  });
});
