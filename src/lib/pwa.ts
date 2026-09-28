/** Mendaftarkan service worker PWA (dipanggil sekali dari main.tsx). */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const register = () => {
    // Registrasi RELATIF — scope otomatis mengikuti subfolder hosting
    // (mis. /eujian-mandupa/), tanpa perlu mengubah apa pun saat deploy.
    navigator.serviceWorker
      .register("sw.js")
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
