import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

/** Event `beforeinstallprompt` (Chromium) — API resmi, belum ada di TS DOM. */
type EventPasang = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const KUNCI_TOLAK = "ujianaman:install:tolak_pada";
const JEDA_ULANG_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

/** Sudah terpasang sebagai aplikasi (standalone) di perangkat. */
function sudahTerpasang(): boolean {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true)
    return true;
  return false;
}

function pernahTolak(): boolean {
  try {
    const t = Number(localStorage.getItem(KUNCI_TOLAK) ?? "0");
    return t > 0 && Date.now() - t < JEDA_ULANG_MS;
  } catch {
    return false;
  }
}

function catatTolak(): void {
  try {
    localStorage.setItem(KUNCI_TOLAK, String(Date.now()));
  } catch {
    /* storage penuh/diizinkan — abaikan */
  }
}

/** iOS/iPadOS tidak pernah mengirim beforeinstallprompt. */
function deteksiIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/\bMacintosh\b/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
  );
}

/**
 * Ajakan memasang aplikasi (PWA) — tampil sesaat setelah situs terbuka.
 * - Chromium (Android/desktop): tombol "Pasang" memicu dialog pasang bawaan.
 * - iOS Safari: petunjuk "Tambahkan ke Layar Utama" (tanpa tombol pasang).
 * Tidak muncul bila aplikasi sudah terpasang, saat ujian berlangsung, atau
 * setelah ditutup (baru muncul lagi 7 hari kemudian).
 */
export function InstallPwa() {
  const { pathname } = useLocation();
  const [deferred, setDeferred] = useState<EventPasang | null>(null);
  const [buka, setBuka] = useState(false);
  const [ios, setIos] = useState(false);

  // Tangkap kesiapan pemasangan dari Chromium (Android & desktop).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as EventPasang);
      if (!sudahTerpasang() && !pernahTolak()) setBuka(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // iOS tidak mengirim event → tampilkan petunjuk dengan jeda singkat.
  useEffect(() => {
    if (sudahTerpasang() || pernahTolak()) return;
    const id = window.setTimeout(() => {
      if (deteksiIOS()) {
        setIos(true);
        setBuka(true);
      }
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);

  const tutup = () => {
    setBuka(false);
    catatTolak();
  };

  const pasang = async () => {
    if (!deferred) return;
    const p = deferred;
    setDeferred(null);
    setBuka(false);
    try {
      await p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === "dismissed") catatTolak();
    } catch {
      /* browser menolak memicu dialog — diamkan */
    }
  };

  // Selama ujian berlangsung jangan menutupi layar siswa.
  if (!buka || pathname.includes("/ujian/")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4">
      <div className="pointer-events-auto mx-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-[0_18px_44px_-24px_rgba(16,20,24,0.55)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
          <Download className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-tight">
            {ios ? "Tambahkan ke Layar Utama" : "Pasang aplikasi UjianAman"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {ios
              ? "Ketuk ikon Bagikan (⬆) di Safari lalu pilih “Tambahkan ke Layar Utama”."
              : "Lebih cepat dibuka dan siap dipakai saat ujian offline."}
          </p>
        </div>
        {!ios && deferred && (
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void pasang()}>
            <Download className="size-3.5" />
            Pasang
          </Button>
        )}
        <button
          type="button"
          aria-label="Tutup saran pemasangan"
          onClick={tutup}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
