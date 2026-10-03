/** Mendaftarkan service worker PWA (dipanggil sekali dari main.tsx). */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    // Path ABSOLUT ke folder app, dihitung dari pathname (folder hosting saja,
    // segmen rute /auth|/dashboard|/ujian dibuang). Relatif biasa akan salah
    // saat halaman dibuka pada URL dalam (mis. /eujian-mandupa/ujian/ID).
    // Scope otomatis mengikuti subfolder hosting, tanpa ubah apa pun saat deploy.
    const folder = window.location.pathname
      .replace(/\/index\.html$/i, "")
      .replace(/\/(auth|dashboard|ujian)(\/[^/]*)*$/i, "")
      .replace(/\/+$/, "");
    navigator.serviceWorker
      .register(`${folder}/sw.js`)
      .catch((err: unknown) => {
        console.warn("[PWA] Pendaftaran service worker gagal:", err);
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
