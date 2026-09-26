import { useEffect, useState } from "react";

/**
 * Status koneksi internet secara live.
 * Menggabungkan event `online`/`offline` dengan pengecekan berkala
 * `navigator.onLine` (beberapa browser tidak selalu mengirim event).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Penjaga: pastikan state selalu mengikuti navigator.onLine.
    const id = window.setInterval(() => {
      setOnline(navigator.onLine);
    }, 2000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(id);
    };
  }, []);

  return online;
}
