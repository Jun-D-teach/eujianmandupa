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
const CACHE_NAME = "ujianaman-v1";
/* Path RELATIF — app tetap bekerja saat di-host di subfolder
 * (mis. man2plg.sch.id/eujian-mandupa/). */
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(SHELL.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
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
