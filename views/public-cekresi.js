function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function pickData(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value == null ? "" : value).trim();
    if (text) return text;
  }
  return "";
}

function normalizeHistory(data) {
  const raw = asArray(
    data.history ||
    data.manifest ||
    data.tracks ||
    data.tracking ||
    data.timeline ||
    data.details ||
    data?.data?.history
  );
  return raw.map((item) => {
    if (typeof item === "string") {
      return { time: "", desc: item, location: "" };
    }
    const row = item && typeof item === "object" ? item : {};
    return {
      time: firstText(row.time, row.date, row.datetime, row.timestamp, row.updated_at, row.jam),
      desc: firstText(row.desc, row.description, row.status, row.message, row.keterangan, row.manifest_description, row.note),
      location: firstText(row.location, row.city, row.place, row.warehouse, row.origin, row.manifest_location)
    };
  }).filter((row) => row.desc || row.time || row.location);
}

function renderMeta(data) {
  const wrap = document.getElementById("resi-meta");
  if (!wrap) return;
  const fields = [
    ["Resi", firstText(data.resi, data.code, data.awb, data.receipt, data.no_resi)],
    ["Kurir", firstText(data.courier, data.ekspedisi, data.expedition, data.service)],
    ["Status", firstText(data.status, data.state, data.latest_status, data.result)],
    ["Penerima", firstText(data.receiver, data.consignee, data.penerima, data.to)],
    ["Asal", firstText(data.origin, data.from, data.sender, data.pengirim)],
    ["Tujuan", firstText(data.destination, data.tujuan, data.to_city)]
  ].filter(([, value]) => value);

  if (!fields.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = fields.map(([label, value]) => `
    <div class="meta-card">
      <dl>
        <dt>${label}</dt>
        <dd>${value.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</dd>
      </dl>
    </div>
  `).join("");
}

function renderTimeline(history) {
  const wrap = document.getElementById("resi-timeline");
  if (!wrap) return;
  if (!history.length) {
    wrap.innerHTML = `<div class="status-strip">Belum ada riwayat status.</div>`;
    return;
  }
  wrap.innerHTML = history.map((row) => {
    const safe = (value) => String(value || "").replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]));
    return `
      <article class="timeline-item">
        ${row.time ? `<div class="t-time">${safe(row.time)}</div>` : ""}
        ${row.desc ? `<div class="t-desc">${safe(row.desc)}</div>` : ""}
        ${row.location ? `<div class="t-loc">${safe(row.location)}</div>` : ""}
      </article>
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const resiInput = document.getElementById("resi-number");
  const courierInput = document.getElementById("resi-courier");
  const btn = document.getElementById("resi-check");
  const status = document.getElementById("resi-status");

  resiInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn?.click();
    }
  });

  btn?.addEventListener("click", async () => {
    const resi = String(resiInput?.value || "").trim();
    const ekspedisi = String(courierInput?.value || "").trim().toLowerCase();
    if (!resi) {
      if (status) status.textContent = "Nomor resi wajib diisi.";
      return;
    }
    if (!["jnt", "spx"].includes(ekspedisi)) {
      if (status) status.textContent = "Pilih kurir: J&T atau SPX.";
      return;
    }
    if (status) status.textContent = "Melacak paket…";
    btn.disabled = true;
    renderMeta({});
    renderTimeline([]);
    try {
      const params = new URLSearchParams({ resi, ekspedisi });
      const res = await fetch(`/api/public/cekresi?${params.toString()}`, {
        headers: { Accept: "application/json" }
      });
      const payload = await res.json();
      if (!res.ok) throw payload;
      const data = pickData(payload);
      const history = normalizeHistory(data);
      renderMeta(data);
      renderTimeline(history);
      if (status) {
        status.textContent = history.length
          ? `Update terbaru: ${history[0].desc || "status tersedia"}.`
          : "Data resi ditemukan, timeline kosong.";
      }
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });
});
