/*
 * Service Worker UjianAman (PWA ujian online wajib offline).
 *
 * Strategi: NETWORK-FIRST dengan fallback cache.
 * - Selalu coba jaringan dulu agar aplikasi selalu segar saat online.
 * - Gagal / offline -> sajikan dari cache, supaya shell aplikasi tetap
 *   terbuka saat siswa mengerjakan ujian tanpa internet.
 * - Soal & jawaban ujian TIDAK disimpan di service worker, melainkan di
 *   LocalStorage (lihat src/lib/exam-storage.ts).
 */
const CACHE_NAME = "ujianaman-v5";
/* Path RELATIF — app tetap bekerja saat di-host di subfolder
 * (mis. man2plg.sch.id/eujian-mandupa/). */
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

/**
 * Precache berkas entry & chunk (nama ber-hash sehingga tidak bisa ditulis
 * manual): mulai dari index.html → js/css yang dirujuknya → tiap js
 * diikuti chunk dinamisnya ("./X-abc.js" = ./assets/X-abc.js).
 * Hasilnya: reload saat internet mati tetap menyajikan aplikasi utuh.
 * CATATAN: naikkan CACHE_NAME di setiap rilis agar precache ikut segar.
 */
async function precacheAset(cache) {
  const antre = ["./index.html"];
  const sudah = new Set();
  while (antre.length > 0) {
    const url = antre.shift();
    if (sudah.has(url)) continue;
    sudah.add(url);
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      await cache.put(url, res.clone());
      const nama = url.split("/").pop() || "";
      const teks = /\.(html|js)$/.test(nama) ? await res.text() : "";
      if (!teks) continue;
      const kandidat = nama.endsWith(".html")
        ? (teks.match(/assets\/[A-Za-z0-9._-]+/g) || []).map((m) => "./" + m)
        : (teks.match(/\.\/[A-Za-z0-9._-]+\.js/g) || []).map(
            (m) => "./assets/" + m.slice(2),
          );
      for (const k of kandidat) if (!sudah.has(k)) antre.push(k);
    } catch (_err) {
      /* satu berkas gagal tidak menggagalkan pemasangan */
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await precacheAset(cache);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("ujianaman-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
          return response;
        }
        // Respons TIDAK OK (404/500). Untuk navigasi, jangan sajikan halaman
        // error — pakai shell terakhir yang valid supaya tidak blank putih.
        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        return response;
      } catch (_err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;
        }
        return new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
