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

function normalizeAnswer(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickExpectedAnswer(payload) {
  const raw =
    payload?.data?.jawaban ??
    payload?.data?.answer ??
    payload?.jawaban ??
    "";
  return normalizeAnswer(raw);
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-fetch");
  const btnGiveUp = document.getElementById("btn-giveup");
  const imgSlot = document.getElementById("img-slot");
  const guessInput = document.getElementById("guess-input");
  const btnCheck = document.getElementById("btn-check");
  const feedback = document.getElementById("guess-feedback");
  const hintLine = document.getElementById("hint-line");
  const banner = document.getElementById("game-banner");

  let expectedNorm = "";
  let expectedRaw = "";

  function showBanner(kind, text) {
    if (!banner) return;
    banner.classList.remove("hidden", "success", "error");
    if (kind === "success") banner.classList.add("success");
    if (kind === "error") banner.classList.add("error");
    banner.textContent = text || "";
  }

  function clearBanner() {
    if (!banner) return;
    banner.classList.add("hidden");
    banner.textContent = "";
    banner.classList.remove("success", "error");
  }

  btn?.addEventListener("click", async () => {
    expectedNorm = "";
    expectedRaw = "";
    if (hintLine) hintLine.textContent = "";
    if (feedback) feedback.textContent = "";
    clearBanner();
    if (guessInput) guessInput.value = "";
    imgSlot.classList.add("hidden");
    imgSlot.innerHTML = "";
    if (hintLine) hintLine.textContent = "Memuat soal…";

    try {
      const response = await fetch("/api/public/whatimg", { headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) {
        if (hintLine) hintLine.textContent = payload?.message || "Gagal memuat soal.";
        return;
      }

      expectedNorm = pickExpectedAnswer(payload);
      expectedRaw =
        String(payload?.data?.jawaban ?? payload?.data?.answer ?? payload?.jawaban ?? "").trim();

      const urls = [];
      collectImageUrls(payload, urls);
      const unique = [...new Set(urls)];

      const hint =
        payload?.data?.petunjuk ||
        payload?.data?.hint ||
        payload?.data?.clue ||
        "";
      if (hintLine) {
        const bits = [];
        if (hint) bits.push(`Petunjuk: ${hint}`);
        if (!unique.length) bits.push("Gambar belum ter-load — fokus ke petunjuk atau refresh sekali lagi.");
        hintLine.textContent = bits.length ? bits.join(" ") : "Soal siap — tulis tebakanmu.";
      }

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
      if (hintLine) hintLine.textContent = String(error?.message || error || "Request gagal.");
    }
  });

  btnGiveUp?.addEventListener("click", () => {
    if (!expectedNorm) {
      showBanner("error", "Ambil soal dulu, baru bisa menyerah.");
      return;
    }
    const ans = expectedRaw || expectedNorm;
    showBanner("error", `Jawaban: ${ans}`);
  });

  btnCheck?.addEventListener("click", () => {
    if (!feedback) return;
    if (!expectedNorm) {
      showBanner("error", "Ambil soal dulu dengan tombol refresh.");
      return;
    }
    const guessNorm = normalizeAnswer(guessInput?.value);
    if (!guessNorm) {
      showBanner("error", "Isi kolom jawaban dulu.");
      return;
    }
    const exact = guessNorm === expectedNorm;
    const expectedTokens = expectedNorm.split(" ").filter(Boolean);
    const guessTokens = guessNorm.split(" ").filter(Boolean);
    const tokenSet = new Set(guessTokens);
    const allTokensPresent = expectedTokens.every((t) => tokenSet.has(t));
    const ok = exact || (expectedTokens.length > 0 && allTokensPresent && guessTokens.length >= expectedTokens.length);
    if (ok) {
      showBanner("success", "Selamat! Jawaban kamu benar.");
    } else {
      showBanner("error", "Belum tepat. Coba lagi.");
    }
  });

  guessInput?.addEventListener("input", () => {
    clearBanner();
  });

  guessInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnCheck?.click();
    }
  });
});
