const EMOJI_SET = [
  "😀", "😁", "😂", "🥹", "😍", "🤩", "😎", "🤔",
  "😴", "😭", "😡", "🤯", "🥶", "🫡", "😈", "👻",
  "💀", "🤖", "❤️", "🔥", "✨", "⭐", "💯", "🎉",
  "👍", "👎", "👏", "🙏", "💪", "👀", "🫶", "🤝",
  "🐱", "🐶", "🐼", "🌸", "🍕", "☕", "🎮", "🎵",
  "🌙", "☀️", "🌈", "⚡", "💎", "👑", "🚀", "🎁"
];

function extractUrl(payload) {
  const direct = payload?.data?.url || payload?.url || payload?.data?.image || "";
  return /^https?:\/\//i.test(String(direct || "")) ? String(direct) : "";
}

function pickErrorMessage(err) {
  if (err == null || err === "") return "Terjadi kesalahan.";
  if (typeof err === "string") return err;
  return err.message || err.error || err.msg || "Terjadi kesalahan.";
}

function normalizeEmoji(value) {
  return Array.from(String(value || "").trim()).slice(0, 2).join("").trim();
}

function setPreview(url) {
  const img = document.getElementById("mix-preview");
  if (!img) return;
  if (!url) {
    img.classList.add("hidden");
    img.removeAttribute("src");
    return;
  }
  img.src = url;
  img.classList.remove("hidden");
}

function setDownload(url, filenameHint) {
  const link = document.getElementById("mix-download");
  if (!link) return;
  if (!url) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  const safeName = String(filenameHint || "emojimix.png");
  link.href = `/api/public/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`;
  link.setAttribute("download", safeName);
  link.classList.remove("hidden");
}

async function forceDownload(url, filename) {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch (_e) {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const input1 = document.getElementById("mix-emoji-1");
  const input2 = document.getElementById("mix-emoji-2");
  const btn = document.getElementById("mix-generate");
  const status = document.getElementById("mix-status");
  const dl = document.getElementById("mix-download");
  const picker = document.getElementById("emoji-picker");
  let activeInput = input1;

  [input1, input2].forEach((input) => {
    input?.addEventListener("focus", () => {
      activeInput = input;
    });
  });

  if (picker) {
    EMOJI_SET.forEach((emoji) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "emoji-chip";
      chip.textContent = emoji;
      chip.setAttribute("aria-label", `Pilih ${emoji}`);
      chip.addEventListener("click", () => {
        const target = activeInput || input1;
        if (!target) return;
        target.value = emoji;
        target.dispatchEvent(new Event("input"));
        picker.querySelectorAll(".emoji-chip").forEach((el) => el.classList.remove("is-active"));
        chip.classList.add("is-active");
        const next = target === input1 ? input2 : input1;
        if (next && !String(next.value || "").trim()) next.focus();
      });
      picker.appendChild(chip);
    });
  }

  btn?.addEventListener("click", async () => {
    const emoji1 = normalizeEmoji(input1?.value);
    const emoji2 = normalizeEmoji(input2?.value);
    if (!emoji1 || !emoji2) {
      if (status) status.textContent = "Isi kedua emoji dulu.";
      return;
    }
    if (status) status.textContent = "Mixing…";
    btn.disabled = true;
    setPreview("");
    setDownload("", "");
    try {
      const res = await fetch(
        `/api/public/emojimix?emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`,
        { headers: { Accept: "application/json" } }
      );
      const payload = await res.json();
      if (!res.ok) throw payload;
      const url = extractUrl(payload);
      if (!url) throw new Error("API tidak mengembalikan URL gambar.");
      setPreview(url);
      const filename = (payload?.data?.filename && String(payload.data.filename)) || "emojimix.png";
      setDownload(url, filename);
      if (status) status.textContent = "Selesai. Preview siap — download sticker-nya.";
    } catch (e) {
      if (status) status.textContent = pickErrorMessage(e);
    } finally {
      btn.disabled = false;
    }
  });

  dl?.addEventListener("click", async (e) => {
    const href = String(dl.getAttribute("href") || "").trim();
    if (!href || href === "#") return;
    e.preventDefault();
    const filename = dl.getAttribute("download") || "emojimix.png";
    const ok = await forceDownload(href, filename);
    if (!ok) window.open(href, "_blank", "noopener");
  });
});
