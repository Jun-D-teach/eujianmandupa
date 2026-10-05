import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import {
  gasCall,
  cekPin,
  tokenValid,
  cocokToken,
  simpanPinTersimpan,
  type UjianGas,
} from "@/lib/api";
import {
  hapusSesi,
  muatSesi,
  simpanSesi,
  type Fase,
  type Pelanggaran,
  type SesiUjian,
} from "@/lib/exam-storage";
import { bunyikanSirene, hentikanSirene } from "@/lib/siren";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Lock,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { toast } from "sonner";
import {
  SetupFase,
  InstruksiFase,
  UjianFase,
  KirimFase,
  SelesaiFase,
} from "@/pages/exam-fases";

/** Belum waktunya? "YYYY-MM-DDTHH:mm" dibandingkan dengan waktu lokal. */
function belumMulai(tglMulai?: string): boolean {
  if (!tglMulai) return false;
  const t = new Date(tglMulai).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() < t;
}

/** Label waktu mulai yang ramah baca (id-ID). */
function labelTgl(tglMulai?: string): string {
  if (!tglMulai) return "";
  const d = new Date(tglMulai);
  if (Number.isNaN(d.getTime())) return tglMulai;
  return d.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
}

function PilKoneksi({
  online,
  mode,
}: {
  online: boolean;
  mode: "awas" | "kirim";
}) {
  const dasar =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider";
  if (mode === "kirim") {
    return online ? (
      <span className={`${dasar} bg-emerald-500/15 text-emerald-700`}>
        <WifiIcon className="size-3.5" /> Terhubung · siap kirim
      </span>
    ) : (
      <span className={`${dasar} bg-amber-500/15 text-amber-700`}>
        <WifiOffIcon className="size-3.5" /> Belum terhubung
      </span>
    );
  }
  return online ? (
    <span className={`${dasar} bg-red-500/15 text-red-600`}>
      <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
      Online · bahaya
    </span>
  ) : (
    <span className={`${dasar} bg-emerald-500/15 text-emerald-700`}>
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Offline · aman
    </span>
  );
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13a10 10 0 0 1 14 0" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  );
}

function WifiOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  );
}

function StrikeDots({ strike }: { strike: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      Strike
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`size-2 rounded-full ${
              i < strike ? "bg-red-500" : "border border-border/80 bg-transparent"
            }`}
          />
        ))}
      </span>
      <span className={strike > 0 ? "text-red-600" : "text-emerald-700"}>
        {strike}/3
      </span>
    </span>
  );
}

export default function ExamPage() {
  const params = useParams<{ ujianId: string }>();
  const ujianId = params.ujianId ?? "";
  const navigate = useNavigate();
  const { user } = useAuth();
  const online = useOnline();

  const [sesi, setSesi] = useState<SesiUjian | null>(() =>
    ujianId ? muatSesi(ujianId) : null,
  );
  // Metadata ujian dari server (tanpa token). undefined = memuat.
  const [meta, setMeta] = useState<UjianGas | null | undefined>(undefined);

  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [modal, setModal] = useState<{ jenis: Pelanggaran["jenis"] } | null>(
    null,
  );
  /** Pesan kesalahan token pengawas saat Mulai Ujian. */
  const [tokenSalah, setTokenSalah] = useState<string | null>(null);
  const [tanyaSelesai, setTanyaSelesai] = useState(false);
  const [pin, setPin] = useState("");
  const [pinSalah, setPinSalah] = useState(0);
  const [pesanKunci, setPesanKunci] = useState<string | null>(null);
  const [bukaBusy, setBukaBusy] = useState(false);
  const [nama, setNama] = useState(user?.nama ?? "");
  const [kelas, setKelas] = useState(user?.kelas ?? "");
  const [token, setToken] = useState("");
  const [sekarang, setSekarang] = useState(() => Date.now());
  /** Sirene sedang berbunyi — hanya bisa dimatikan via tombol saat offline.
   *  Diambil dari sesi tersimpan agar reload tidak melepas blokir ujian. */
  const [sireneNyala, setSireneNyala] = useState<boolean>(sesi?.sirene ?? false);
  const sireneAwalRef = useRef(sireneNyala);
  const waktuHabisRef = useRef(false);

  const faseRef = useRef<Fase | undefined>(sesi?.fase);
  const strikeRef = useRef(sesi?.strike ?? 0);
  const onlineFlagRef = useRef(false);
  const hiddenFlagRef = useRef(false);
  /** Jeda grace setelah kunci dibuka (waktu untuk mematikan internet). */
  const graceRef = useRef(0);
  /** Waktu pelanggaran terakhir — dedupe agar satu kejadian cukup satu strike. */
  const lastViolationRef = useRef(0);

  useEffect(() => {
    faseRef.current = sesi?.fase;
  }, [sesi?.fase]);
  useEffect(() => {
    strikeRef.current = sesi?.strike ?? 0;
  }, [sesi?.strike]);
  useEffect(() => {
    if (sesi) simpanSesi(sesi);
  }, [sesi]);

  const terkunci = sesi?.fase === "ujian" && sesi.strike >= 3;
  const fase: Fase = sesi?.fase ?? "setup";
  const modeKirim = fase === "kirim" || fase === "selesai";

  /** Mencatat pelanggaran + sirene + modal peringatan. Hanya saat fase ujian. */
  const catatPelanggaran = useCallback((jenis: Pelanggaran["jenis"]) => {
    if (faseRef.current !== "ujian" || strikeRef.current >= 3) return;
    // Dedupe: blur+visibility (dst) dari SATU kejadian cukup 1 strike.
    if (Date.now() - lastViolationRef.current < 2000) return;
    lastViolationRef.current = Date.now();
    strikeRef.current += 1;
    const nilaiStrike = strikeRef.current;
    setSesi((prev) =>
      prev && prev.fase === "ujian"
        ? {
            ...prev,
            strike: nilaiStrike,
            sirene: true,
            pelanggaran: [...prev.pelanggaran, { jenis, waktu: Date.now() }],
          }
        : prev,
    );
    setModal({ jenis });
    bunyikanSirene();
    setSireneNyala(true);
  }, []);

  /**
   * Matikan sirene — HANYA bisa saat HP offline (tombol disabled saat online).
   * Siswa harus kembali ke halaman ujian lalu menekan tombol ini.
   */
  const matikanSirene = () => {
    if (online) {
      toast.error("Matikan WiFi & data seluler dulu — sirene baru bisa dimatikan saat offline.");
      return;
    }
    hentikanSirene();
    setSireneNyala(false);
    setSesi((prev) => (prev ? { ...prev, sirene: false } : prev));
    toast.success("Sirene dimatikan. Lanjutkan mengerjakan.");
  };

  // Keluar dari halaman ujian → sirene tidak berbunyi terus di background.
  useEffect(() => {
    return () => {
      hentikanSirene();
    };
  }, []);

  // Sesi dimuat dalam keadaan sirene menyala (mis. reload halaman) →
  // bunyikan ulang sirene + getar supaya blokir ujian tetap konsisten.
  useEffect(() => {
    if (sireneAwalRef.current) bunyikanSirene();
  }, []);

  // --- Online watcher -------------------------------------------------
  useEffect(() => {
    const handleOnline = () => {
      if (faseRef.current !== "ujian" || strikeRef.current >= 3) return;
      if (Date.now() < graceRef.current) return; // masih dalam jeda setelah unlock
      if (onlineFlagRef.current) return;
      onlineFlagRef.current = true;
      catatPelanggaran("online");
    };
    const handleOffline = () => {
      onlineFlagRef.current = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Penjaga: navigator.onLine kadang tidak memancing event.
    const id = window.setInterval(() => {
      if (faseRef.current !== "ujian" || strikeRef.current >= 3) return;
      if (navigator.onLine) {
        if (!onlineFlagRef.current && Date.now() >= graceRef.current) {
          onlineFlagRef.current = true;
          catatPelanggaran("online");
        }
      } else {
        onlineFlagRef.current = false;
      }
    }, 1500);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(id);
    };
  }, [catatPelanggaran]);

  // --- Hitung mundur (state `sekarang` diperbarui interval, sisa waktu dihitung turunan) ----
  useEffect(() => {
    const batas = sesi?.batasWaktu;
    if (sesi?.fase !== "ujian" || !batas) return;
    const id = window.setInterval(() => {
      setSekarang(Date.now());
      if (batas - Date.now() <= 0 && !waktuHabisRef.current) {
        waktuHabisRef.current = true;
        toast("Waktu ujian habis — lanjutkan ke pengiriman jawaban.");
        setSesi((prev) =>
          prev && prev.fase === "ujian" ? { ...prev, fase: "kirim" } : prev,
        );
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [sesi?.fase, sesi?.batasWaktu]);

  const sisaWaktu =
    sesi?.fase === "ujian" && sesi.batasWaktu
      ? Math.max(0, Math.ceil((sesi.batasWaktu - sekarang) / 1000))
      : null;

  // --- Deteksi pindah aplikasi / tab ----------------------------------
  useEffect(() => {
    const onVisibility = () => {
      if (faseRef.current !== "ujian") return;
      if (document.hidden) {
        if (strikeRef.current >= 3 || hiddenFlagRef.current) return;
        hiddenFlagRef.current = true;
        catatPelanggaran("pindah");
      } else if (hiddenFlagRef.current) {
        hiddenFlagRef.current = false;
        // Sirene tetap berbunyi sampai siswa menekan tombol "Matikan Sirene"
        // (hanya aktif saat offline) — tidak dibunyikan ulang otomatis.
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [catatPelanggaran]);

  // --- Anti-curang lintas platform (Android & iOS) --------------------
  // Aktif hanya selama fase ujian: blok salin/tempel, zoom pinch, callout
  // long-press iOS, pintasan keyboard berbahaya; deteksi split-screen/
  // jendela kehilangan fokus; layar tetap menyala (wake lock).
  useEffect(() => {
    if (fase !== "ujian") return;

    // 1) CSS: seleksi teks & callout long-press iOS dimatikan,
    //    pinch/double-tap zoom diblokir, scroll tetap jalan.
    const gaya = document.createElement("style");
    gaya.textContent =
      "html.ujian-aktif,html.ujian-aktif *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation;}";
    document.head.appendChild(gaya);
    document.documentElement.classList.add("ujian-aktif");

    // 2) Salin/potong teks → pelanggaran. Tempel & menu konteks diblokir.
    const onSalin = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.type === "copy" || e.type === "cut") catatPelanggaran("salin");
    };
    const onBlok = (e: Event) => e.preventDefault();
    document.addEventListener("copy", onSalin);
    document.addEventListener("cut", onSalin);
    document.addEventListener("paste", onBlok);
    document.addEventListener("contextmenu", onBlok);
    document.addEventListener("selectstart", onBlok);

    // 3) Zoom pinch: iOS memakai event gesture*, Android 2 jari di touch*.
    const onSentuh = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    document.addEventListener("touchstart", onSentuh, { passive: false });
    document.addEventListener("touchmove", onSentuh, { passive: false });
    document.addEventListener("gesturestart", onGesture);
    document.addEventListener("gesturechange", onGesture);

    // 4) Pintasan keyboard berbahaya (DevTools, print, save, view-source…).
    //    Ctrl/Cmd+C/V/X sengaja dibiarkan agar event copy terpicu → strike.
    const onTombol = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const superKey = e.ctrlKey || e.metaKey;
      if (
        e.key === "F12" ||
        (superKey &&
          (e.shiftKey || ["i", "j", "k", "p", "s", "u", "f"].includes(k)))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onTombol);

    // 5) Split-screen / jendela kehilangan fokus (dokumen tetap terlihat
    //    sehingga visibilitychange tidak memantul) → strike "pindah".
    let timerBlur = 0;
    const onBlur = () => {
      if (strikeRef.current >= 3) return;
      timerBlur = window.setTimeout(() => {
        if (
          faseRef.current === "ujian" &&
          !document.hidden &&
          !document.hasFocus()
        ) {
          catatPelanggaran("pindah");
        }
      }, 700);
    };
    const onFocus = () => window.clearTimeout(timerBlur);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    // 6) Wake Lock — layar tetap menyala selama ujian (Chrome Android &
    //    iOS 16.4+); diambil ulang saat tab kembali terlihat.
    let rilisWake: (() => Promise<void>) | null = null;
    const mintaWake = () => {
      const wl = (
        navigator as Navigator & {
          wakeLock?: {
            request(t: "screen"): Promise<{ release(): Promise<void> }>;
          };
        }
      ).wakeLock;
      if (!wl) return;
      void wl
        .request("screen")
        .then((k) => {
          rilisWake = () => k.release();
        })
        .catch(() => {
          /* browser menolak — abaikan */
        });
    };
    const onVisWake = () => {
      if (!document.hidden) mintaWake();
    };
    mintaWake();
    document.addEventListener("visibilitychange", onVisWake);

    return () => {
      document.documentElement.classList.remove("ujian-aktif");
      gaya.remove();
      document.removeEventListener("copy", onSalin);
      document.removeEventListener("cut", onSalin);
      document.removeEventListener("paste", onBlok);
      document.removeEventListener("contextmenu", onBlok);
      document.removeEventListener("selectstart", onBlok);
      document.removeEventListener("touchstart", onSentuh);
      document.removeEventListener("touchmove", onSentuh);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      window.removeEventListener("keydown", onTombol);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisWake);
      window.clearTimeout(timerBlur);
      if (rilisWake) void rilisWake().catch(() => {});
    };
  }, [fase, catatPelanggaran]);

  // --- Muat metadata ujian dari server ---------------------------------
  useEffect(() => {
    if (!ujianId) return;
    let hidup = true;
    gasCall<{ ujian: UjianGas }>("getUjianInfo", { id: ujianId })
      .then((res) => {
        if (hidup) setMeta(res.ujian);
      })
      .catch(() => {
        if (hidup) setMeta(null);
      });
    return () => {
      hidup = false;
    };
  }, [ujianId]);

  // --- Sinkron ulang otomatis: guru memperbaiki soal ----------------------
  // Saat HP online & siswa BELUM mulai ujian, bila revisi server beda dengan
  // salinan di HP maka soal diunduh ulang (jawaban yang ada dipertahankan untuk
  // id soal yang masih ada). Saat offline, guard "Mulai Ujian" yang
  // mengingatkan agar nyalakan internet dulu untuk sinkron.
  useEffect(() => {
    if (fase !== "instruksi" || !sesi || !online) return;
    const revisiServer = meta?.revisi;
    if (typeof revisiServer !== "number") return;
    if ((sesi.revisi ?? 1) === revisiServer) return;
    let hidup = true;
    const sinkron = async () => {
      try {
        const data = await gasCall<
          { ujian: UjianGas; soal: import("@/lib/api").SoalGas[]; token_hash?: string; pin_pengawas?: string }
        >("getSoal", { id: ujianId, kelas: sesi.kelas });
        if (!hidup) return;
        if (typeof data.pin_pengawas === "string" && /^\d{6}$/.test(data.pin_pengawas)) {
          simpanPinTersimpan(data.pin_pengawas);
        }
        const idBaru = new Set(data.soal.map((s) => s.id));
        const jawaban: SesiUjian["jawaban"] = {};
        for (const [k, v] of Object.entries(sesi.jawaban)) {
          if (idBaru.has(k)) jawaban[k] = v;
        }
        const baru: SesiUjian = {
          ...sesi,
          revisi: data.ujian.revisi,
          tokenHash: data.token_hash ?? sesi.tokenHash,
          soal: data.soal.map((s) => ({
            id: s.id,
            pertanyaan: s.pertanyaan,
            opsi_a: s.opsi_a,
            opsi_b: s.opsi_b,
            opsi_c: s.opsi_c,
            opsi_d: s.opsi_d,
            opsi_e: s.opsi_e || undefined,
            gambar: s.gambar || undefined,
            opsi_huruf: s.opsi_huruf || undefined,
          })),
          jawaban,
          indeks: Math.max(0, Math.min(sesi.indeks, data.soal.length - 1)),
        };
        setSesi(baru);
        simpanSesi(baru);
        toast.success(
          `Guru memperbarui soal — ${baru.soal.length} soal terbaru tersimpan di HP.`,
        );
      } catch {
        /* offline / izin ditutup — biarkan; guard Mulai Ujian yang mengingatkan */
      }
    };
    void sinkron();
    return () => {
      hidup = false;
    };
  }, [fase, sesi, meta?.revisi, online, ujianId]);

  // --- Aksi fase -------------------------------------------------------
  /** Unduh soal (online) — TANPA token; izin bagikan admin + kelas sasaran
   *  divalidasi server. Token justru dimasukkan saat Mulai Ujian. */
  const unduhSoal = async () => {
    if (!ujianId) return;
    const n = nama.trim();
    const k = kelas.trim();
    if (!n || !k) {
      toast.error("Nama dan kelas wajib diisi sebelum mengunduh soal.");
      return;
    }
    setBusy(true);
    setPesan(null);
    try {
      const data = await gasCall<
        { ujian: UjianGas; soal: import("@/lib/api").SoalGas[]; token_hash?: string; pin_pengawas?: string }
      >("getSoal", { id: ujianId, kelas: k });
      // Cache PIN pengawas terbaru (dari sheet Pengaturan) agar layar kunci
      // tetap bisa dibuka offline dengan PIN terkini.
      if (typeof data.pin_pengawas === "string" && /^\d{6}$/.test(data.pin_pengawas)) {
        simpanPinTersimpan(data.pin_pengawas);
      }
      if (data.soal.length === 0) {
        throw new Error("Ujian ini belum memiliki soal.");
      }
      const baru: SesiUjian = {
        versi: 1,
        ujianId,
        judul: data.ujian.judul,
        deskripsi: data.ujian.deskripsi,
        fase: "instruksi",
        nama: n,
        kelas: k,
        tokenHash: data.token_hash,
        durasi_menit: data.ujian.durasi_menit,
        revisi: data.ujian.revisi,
        tglMulai: data.ujian.tgl_mulai || undefined,
        unduhPada: Date.now(),
        soal: data.soal.map((s) => ({
          id: s.id,
          pertanyaan: s.pertanyaan,
          opsi_a: s.opsi_a,
          opsi_b: s.opsi_b,
          opsi_c: s.opsi_c,
          opsi_d: s.opsi_d,
          opsi_e: s.opsi_e || undefined,
          gambar: s.gambar || undefined,
          opsi_huruf: s.opsi_huruf || undefined,
        })),
        jawaban: {},
        indeks: 0,
        strike: 0,
        pelanggaran: [],
      };
      setSesi(baru);
      simpanSesi(baru);
      toast.success(`${data.soal.length} soal tersimpan di HP.`);
    } catch (err) {
      setPesan(
        err instanceof Error
          ? err.message
          : "Gagal mengunduh soal. Periksa koneksi.",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Mulai ujian — token dari pengawas diverifikasi LOKAL terhadap hash
   * unduhan (bisa offline), lalu wajib OFFLINE + sesuai jadwal.
   */
  const mulaiUjian = async () => {
    if (!sesi) return;
    const t = token.trim().toUpperCase();
    setTokenSalah(null);
    if (!tokenValid(t)) {
      setTokenSalah("Isi token dari pengawas (4–12 huruf/angka, tanpa spasi).");
      return;
    }
    try {
      let cocok = false;
      if (sesi.tokenHash) {
        cocok = await cocokToken(t, sesi.tokenHash);
      } else if (sesi.token) {
        // Sesi lama (alur sebelumnya) — token tersimpan plaintext.
        cocok = t === sesi.token.toUpperCase();
      } else {
        setTokenSalah(
          "Sesi tidak menyimpan token unduhan — hapus sesi lalu unduh ulang soal.",
        );
        return;
      }
      if (!cocok) {
        setTokenSalah("Token salah — minta token yang benar dari pengawas.");
        return;
      }
    } catch (err) {
      setTokenSalah(
        err instanceof Error ? err.message : "Gagal memverifikasi token.",
      );
      return;
    }
    if (online) {
      toast.error("HP masih ONLINE — matikan WiFi & data seluler dulu, lalu mulai ujian.");
      return;
    }
    if (
      typeof meta?.revisi === "number" &&
      typeof sesi?.revisi === "number" &&
      sesi.revisi !== meta.revisi
    ) {
      toast.error(
        "Guru memperbaiki soal — nyalakan internet dulu untuk sinkron ulang, lalu matikan internet kembali.",
      );
      return;
    }
    if (belumMulai(sesi?.tglMulai)) {
      toast.error(`Ujian baru bisa dimulai pada ${labelTgl(sesi?.tglMulai)}.`);
      return;
    }
    const now = Date.now();
    waktuHabisRef.current = false;
    setSesi((prev) =>
      prev
        ? {
            ...prev,
            fase: "ujian",
            token: t,
            mulaiPada: now,
            batasWaktu: now + (prev.durasi_menit ?? 60) * 60_000,
            strike: 0,
            pelanggaran: [],
          }
        : prev,
    );
    strikeRef.current = 0;
    onlineFlagRef.current = false;
    hiddenFlagRef.current = false;
    lastViolationRef.current = 0;
  };

  const jawab = (pilihan: SesiUjian["jawaban"][string]) => {
    if (!sesi) return;
    const soal = sesi.soal[sesi.indeks];
    if (!soal) return;
    setSesi({
      ...sesi,
      jawaban: { ...sesi.jawaban, [soal.id]: pilihan },
    });
  };

  const pindahSoal = (i: number) => {
    if (!sesi) return;
    if (i < 0 || i >= sesi.soal.length) return;
    setSesi({ ...sesi, indeks: i });
    // Lompat ke atas agar soal terpilih langsung terlihat — dipakai bar nomor
    // soal di header maupun tombol Sebelumnya/Berikutnya.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Buka kunci layar: PIN diverifikasi LOKAL di perangkat (bisa offline).
   * Strike direset, jawaban tetap ada. Audit dikirim best-effort saat online.
   */
  const bukaKunci = (nilaiPin: string) => {
    if (bukaBusy) return;
    setBukaBusy(true);
    try {
      if (!cekPin(nilaiPin)) {
        setPinSalah((n) => n + 1);
        setPesanKunci("PIN salah. Minta PIN pengawas ruang.");
        return;
      }
      // PIN benar → buka kunci (jawaban & sesi tidak disentuh).
      graceRef.current = Date.now() + 15_000;
      setSesi((prev) => (prev ? { ...prev, strike: 0 } : prev));
      strikeRef.current = 0;
      onlineFlagRef.current = false;
      hiddenFlagRef.current = false;
      lastViolationRef.current = 0;
      setPin("");
      setPesanKunci(null);
      toast.success("Kunci dibuka. Matikan internet lagi, lalu lanjutkan ujian.");
      if (navigator.onLine) {
        void gasCall("catatBukaKunci", {
          ujian_id: ujianId,
          nama: `${sesi?.nama ?? "-"} (${sesi?.kelas ?? "-"})`,
          catatan: "PIN pengawas diverifikasi lokal di perangkat",
        }).catch(() => {});
      }
    } finally {
      setBukaBusy(false);
    }
  };

  const kirimJawaban = async () => {
    if (!sesi || !ujianId) return;
    setBusy(true);
    try {
      const res = await gasCall<{
        nilai: number;
        benar: number;
        total_soal: number;
        total_pelanggaran: number;
      }>("submitJawaban", {
        ujian_id: ujianId,
        nama: sesi.nama,
        kelas: sesi.kelas,
        token: sesi.token ?? "",
        total_pelanggaran: sesi.pelanggaran.length,
        jawaban: sesi.soal.map((s) => ({
          id_soal: s.id,
          pilihan: sesi.jawaban[s.id],
        })),
      });
      setSesi((prev) =>
        prev
          ? {
              ...prev,
              fase: "selesai",
            kirimPada: Date.now(),
            sirene: false,
            hasil: {
                nilai: res.nilai,
                benar: res.benar,
                total_soal: res.total_soal,
                total_pelanggaran: res.total_pelanggaran,
              },
            }
          : prev,
      );
      hentikanSirene();
      setSireneNyala(false);
      toast.success("Jawaban berhasil dikirim.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengirim. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  // --- Guard -----------------------------------------------------------
  if (!ujianId) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Ujian tidak ditemukan.</p>
        <Button className="mt-4" onClick={() => navigate("/dashboard")}>
          Kembali
        </Button>
      </Shell>
    );
  }
  if (sesi === null && meta === undefined) {
    return (
      <Shell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Shell>
    );
  }
  if (sesi === null && meta === null) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Ujian ini sudah dihapus, belum aktif, atau tautannya salah.
        </p>
        <Button className="mt-4" onClick={() => navigate("/dashboard")}>
          Kembali ke beranda
        </Button>
      </Shell>
    );
  }

  const totalTerjawab = sesi
    ? sesi.soal.filter((s) => sesi.jawaban[s.id]).length
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Bar status atas */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {fase === "setup" ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2 text-muted-foreground"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowLeft className="size-4" /> Beranda
              </Button>
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
                <ShieldAlert className="size-4" />
              </span>
            )}
            <span className="truncate text-sm font-bold tracking-tight">
              {sesi?.judul ?? meta?.judul ?? "Ujian"}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <PilKoneksi online={online} mode={modeKirim ? "kirim" : "awas"} />
          </div>
        </div>

        {fase === "ujian" && sesi && (
          <>
            <div
              className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pb-3 text-xs font-semibold text-muted-foreground"
            >
            <span>
              Terjawab {totalTerjawab}/{sesi.soal.length}
            </span>
            <span className="flex items-center gap-3">
              {sisaWaktu !== null && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold tabular-nums ${
                    sisaWaktu <= 60
                      ? "bg-red-500/15 text-red-600"
                      : "bg-muted text-foreground"
                  }`}
                  aria-label="Sisa waktu ujian"
                >
                  <Clock className="size-3.5" />
                  {String(Math.floor(sisaWaktu / 60)).padStart(2, "0")}:
                  {String(sisaWaktu % 60).padStart(2, "0")}
                </span>
              )}
              <StrikeDots strike={sesi.strike} />
              {sireneNyala && (
                <button
                  type="button"
                  onClick={matikanSirene}
                  disabled={online}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    online
                      ? "cursor-not-allowed bg-red-500/15 text-red-600"
                      : "bg-red-600 text-white hover:bg-red-500"
                  }`}
                  title={
                    online
                      ? "Sirene baru bisa dimatikan saat HP offline"
                      : "Matikan sirene"
                  }
                >
                  <Siren className="size-3.5" />
                  {online ? "Sirene — matikan data" : "Matikan Sirene"}
                </button>
              )}
            </span>
            </div>

            {/* Bar nomor soal — hijau = sudah dijawab; klik = pindah ke soal. */}
            <div className="border-t border-border/60 bg-background/95">
              <div
                role="group"
                aria-label="Daftar nomor soal"
                className="scrollbar-none mx-auto flex w-full max-w-2xl items-center gap-2 overflow-x-auto px-4 py-2"
              >
                {sesi.soal.map((s, i) => {
                  const dijawab = Boolean(sesi.jawaban[s.id]);
                  const aktif = i === sesi.indeks;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pindahSoal(i)}
                      aria-current={aktif ? "true" : undefined}
                      aria-label={`Soal ${i + 1}${dijawab ? " — terjawab" : " — belum dijawab"}`}
                      className={`h-8 w-8 shrink-0 rounded-lg text-xs font-bold transition-colors ${
                        dijawab
                          ? aktif
                            ? "bg-emerald-500 text-white ring-2 ring-foreground ring-offset-2 ring-offset-background"
                            : "bg-emerald-500 text-white shadow-sm"
                          : aktif
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
        {fase === "setup" && (
          <SetupFase
            judul={sesi?.judul ?? meta?.judul ?? ""}
            deskripsi={sesi?.deskripsi ?? meta?.deskripsi}
            jumlahSoal={sesi?.soal.length ?? meta?.jumlah_soal ?? 0}
            durasiMenit={sesi?.durasi_menit ?? meta?.durasi_menit ?? 60}
            tglMulai={meta?.tgl_mulai}
            sasaran={meta?.sasaran}
            nama={nama}
            kelas={kelas}
            setNama={setNama}
            setKelas={setKelas}
            pesan={pesan}
            busy={busy}
            online={online}
            onUnduh={unduhSoal}
          />
        )}

        {fase === "instruksi" && sesi && (
          <InstruksiFase
            sesi={sesi}
            online={online}
            terkunciJadwal={belumMulai(sesi.tglMulai)}
            token={token}
            setToken={(v) => {
              setToken(v);
              setTokenSalah(null);
            }}
            pesanToken={tokenSalah}
            onMulai={mulaiUjian}
            onUlang={() => {
              hapusSesi(sesi.ujianId);
              setSesi(null);
              setToken("");
            }}
          />
        )}

        {fase === "ujian" && sesi && (
          <UjianFase
            sesi={sesi}
            totalTerjawab={totalTerjawab}
            onJawab={jawab}
            onPindah={pindahSoal}
            onSelesai={() => setTanyaSelesai(true)}
          />
        )}

        {fase === "kirim" && sesi && (
          <KirimFase
            sesi={sesi}
            totalTerjawab={totalTerjawab}
            online={online}
            busy={busy}
            onKirim={kirimJawaban}
            onKembali={() => {
              if (!sesi) return;
              waktuHabisRef.current = false;
              setSesi({ ...sesi, fase: "ujian" });
            }}
          />
        )}

        {fase === "selesai" && sesi && (
          <SelesaiFase sesi={sesi} onBeranda={() => navigate("/dashboard")} />
        )}
      </main>

      {/* BLOKIR UJIAN selama sirene menyala — siswa TIDAK bisa mengerjakan
          apa pun sebelum sirene dimatikan lewat tombol (saat HP offline). */}
      {sireneNyala && (
        <div className="fixed inset-0 z-[45] flex flex-col items-center justify-center bg-background/95 px-6 text-center backdrop-blur-sm">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-red-500/15 text-red-600">
            <Siren className="size-8 animate-pulse" />
          </span>
          <h2 className="mt-6 text-2xl font-extrabold tracking-tight">
            SIRENE MENYALA — UJIAN TERKUNCI
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            Sistem peringatan sedang aktif. Kamu{" "}
            <strong className="text-foreground">
              tidak bisa mengerjakan ujian
            </strong>{" "}
            sampai sirene dimatikan. Matikan <strong>WiFi & data seluler</strong>
            {" "}lalu tekan tombol di bawah.
          </p>
          <button
            type="button"
            onClick={matikanSirene}
            disabled={online}
            className={`mt-6 w-full max-w-sm rounded-2xl py-3.5 text-sm font-bold transition-colors ${
              online
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-red-600 text-white hover:bg-red-500"
            }`}
          >
            {online
              ? "Matikan Sirene — nonaktif (HP masih online)"
              : "Matikan Sirene"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            Tombol hanya bisa dipakai saat HP offline — setelah sirene berhenti,
            ujian bisa dilanjutkan.
          </p>
        </div>
      )}

      {/* Peringatan visual sirene —kedip merah layar penuh, tidak bisa
          dibungkam tombol volume (saluran visual pendamping suara & getar). */}
      {sireneNyala && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[46] border-[6px] border-transparent animate-[sirene-strobe_0.8s_steps(1,end)_infinite]"
        />
      )}

      {/* Modal pelanggaran */}
      {modal && sesi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-red-500/40 bg-[#1b1013] text-white shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-4">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-red-500/20 text-red-400">
                <Siren className="size-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold tracking-tight">
                  PERINGATAN — PELANGGARAN
                </p>
                <p className="text-xs text-red-300/80">
                  {modal.jenis === "online"
                    ? "HP terdeteksi ONLINE saat ujian."
                    : modal.jenis === "salin"
                      ? "Mencoba memilih/menyalin teks soal."
                      : "Berpindah aplikasi/tab saat ujian."}
                </p>
              </div>
            </div>
            <div className="space-y-3 px-5 py-5 text-sm leading-6 text-white/75">
              {modal.jenis === "online" ? (
                <p>
                  Matikan <strong className="text-white">WiFi</strong> dan{" "}
                  <strong className="text-white">data seluler</strong> sekarang
                  juga. Penggunaan internet selama ujian tidak diizinkan.
                </p>
              ) : modal.jenis === "salin" ? (
                <p>
                  Memilih dan menyalin teks <strong>soal</strong> termasuk
                  pelanggaran. Baca dan jawab langsung di layar ujian.
                </p>
              ) : (
                <p>
                  Jangan membuka aplikasi lain atau berpindah tab selama ujian
                  berlangsung.
                </p>
              )}
              <div className="flex items-center justify-between rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-red-300">
                  Strike
                </span>
                <span className="text-lg font-extrabold text-red-400">
                  {sesi.strike} / 3
                </span>
              </div>
              <p className="text-xs text-white/50">
                Pada strike ke-3 layar akan terkunci total dan hanya pengawas
                yang dapat membukanya dengan PIN.
              </p>
            </div>
            <div className="space-y-2 px-5 pb-5">
              {sireneNyala && (
                <button
                  type="button"
                  onClick={matikanSirene}
                  disabled={online}
                  className={`w-full rounded-2xl py-3 text-sm font-bold transition-colors ${
                    online
                      ? "cursor-not-allowed bg-white/10 text-white/50"
                      : "bg-white text-red-700 hover:bg-white/90"
                  }`}
                >
                  {online
                    ? "Matikan Sirene — nonaktif (HP masih online)"
                    : "Matikan Sirene"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setModal(null)}
                className="w-full rounded-2xl bg-red-500 py-3 text-sm font-bold text-white transition-colors hover:bg-red-400"
              >
                Lanjutkan mengerjakan
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Layar terkunci (3 strike) — PIN pengawas, verifikasi lokal */}
      {terkunci && sesi && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-b from-[#7f1d1d] via-[#991b1b] to-[#5f1414] p-6 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-sm"
          >
            <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/20">
              <Lock className="size-8" />
            </span>
            <h2 className="mt-6 text-2xl font-extrabold tracking-tight">
              LAYAR TERKUNCI
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Terdeteksi <strong>3 pelanggaran</strong> selama ujian berlangsung.
              Layar hanya terbuka dengan 6 digit PIN pengawas — masukkan PIN
              untuk melanjutkan; jawaban sebelumnya tetap ada dan ujian bisa
              dilanjutkan offline.
            </p>

            <div className="mt-5 flex justify-center gap-2">
              {sesi.pelanggaran.slice(-3).map((p, i) => (
                <span
                  key={`${p.waktu}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"
                >
                  <AlertTriangle className="size-3.5 text-amber-300" />
                  {p.jenis === "online"
                    ? "Online"
                    : p.jenis === "salin"
                      ? "Coba salin"
                      : "Pindah tab"}
                </span>
              ))}
            </div>

            <motion.div
              key={pinSalah}
              initial={{ x: 0 }}
              animate={pinSalah > 0 ? { x: [0, -9, 9, -6, 6, 0] } : { x: 0 }}
              transition={{ duration: 0.35 }}
              className="mt-7 rounded-3xl bg-white/10 p-5 ring-1 ring-white/15"
            >
              <Label
                htmlFor="pin"
                className="text-xs font-bold uppercase tracking-wider text-white/70"
              >
                PIN Pengawas
              </Label>
              <div className="mt-3 flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={pin}
                  disabled={bukaBusy}
                  onChange={(v) => {
                    setPin(v);
                    if (v.length === 6) bukaKunci(v);
                  }}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="size-11 border-white/25 bg-white/10 text-base font-bold text-white"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/65">
                PIN tidak ditampilkan di layar — minta ke pengawas ruang
                (diatur admin di menu Pengaturan). Verifikasi dilakukan lokal
                di perangkat, jadi tidak butuh internet; audit pembukaan
                dikirim ke server bila HP online.
              </p>
              {pesanKunci && (
                <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-amber-300">
                  {pesanKunci}
                </p>
              )}
            </motion.div>

            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mt-6 text-xs font-semibold text-white/60 underline underline-offset-4 hover:text-white"
            >
              Keluar dari sesi ujian
            </button>
          </motion.div>
        </div>
      )}

      {/* Konfirmasi selesai */}
      <AlertDialog open={tanyaSelesai} onOpenChange={setTanyaSelesai}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan ujian?</AlertDialogTitle>
            <AlertDialogDescription>
              {totalTerjawab < (sesi?.soal.length ?? 0)
                ? `Masih ada ${(sesi?.soal.length ?? 0) - totalTerjawab} soal yang belum dijawab. Jawaban yang kosong dihitung salah.`
                : "Semua soal sudah terjawab. Lanjut ke halaman pengiriman."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lanjut mengerjakan</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (sesi) setSesi({ ...sesi, fase: "kirim" });
              }}
            >
              Ya, selesai
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Shell sederhana untuk state guard. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      {children}
    </main>
  );
}
