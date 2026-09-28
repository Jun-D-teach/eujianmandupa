import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { gasCall, cekPin, tokenValid, type UjianGas } from "@/lib/api";
import {
  hapusSesi,
  muatSesi,
  simpanSesi,
  type Fase,
  type SesiUjian,
} from "@/lib/exam-storage";
import { bunyikanSirene } from "@/lib/siren";
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
  // Metadata ujian dari GAS (tanpa token). undefined = memuat.
  const [meta, setMeta] = useState<UjianGas | null | undefined>(undefined);

  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [modal, setModal] = useState<{ jenis: "online" | "pindah" } | null>(null);
  const [tanyaSelesai, setTanyaSelesai] = useState(false);
  const [pin, setPin] = useState("");
  const [pinSalah, setPinSalah] = useState(0);
  const [pesanKunci, setPesanKunci] = useState<string | null>(null);
  const [bukaBusy, setBukaBusy] = useState(false);
  const [tampilGrid, setTampilGrid] = useState(false);
  const [nama, setNama] = useState(user?.nama ?? "");
  const [kelas, setKelas] = useState(user?.kelas ?? "");
  const [token, setToken] = useState("");
  const [sekarang, setSekarang] = useState(() => Date.now());
  const waktuHabisRef = useRef(false);

  const faseRef = useRef<Fase | undefined>(sesi?.fase);
  const strikeRef = useRef(sesi?.strike ?? 0);
  const onlineFlagRef = useRef(false);
  const hiddenFlagRef = useRef(false);
  /** Jeda grace setelah kunci dibuka (waktu untuk mematikan internet). */
  const graceRef = useRef(0);

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
  const catatPelanggaran = useCallback((jenis: "online" | "pindah") => {
    if (faseRef.current !== "ujian" || strikeRef.current >= 3) return;
    strikeRef.current += 1;
    const nilaiStrike = strikeRef.current;
    setSesi((prev) =>
      prev && prev.fase === "ujian"
        ? {
            ...prev,
            strike: nilaiStrike,
            pelanggaran: [...prev.pelanggaran, { jenis, waktu: Date.now() }],
          }
        : prev,
    );
    setModal({ jenis });
    bunyikanSirene();
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
        bunyikanSirene(); // bunyikan lagi saat siswa kembali ke aplikasi
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [catatPelanggaran]);

  // --- Muat metadata ujian dari GAS ------------------------------------
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

  // --- Aksi fase -------------------------------------------------------
  /** Unduh soal TANPA token (online) — sesuai alur baru. */
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
      const data = await gasCall<{ ujian: UjianGas; soal: import("@/lib/api").SoalGas[] }>(
        "getSoal",
        { id: ujianId },
      );
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
        durasi_menit: data.ujian.durasi_menit,
        unduhPada: Date.now(),
        soal: data.soal.map((s) => ({
          id: s.id,
          pertanyaan: s.pertanyaan,
          opsi_a: s.opsi_a,
          opsi_b: s.opsi_b,
          opsi_c: s.opsi_c,
          opsi_d: s.opsi_d,
          opsi_e: s.opsi_e || undefined,
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

  /** Mulai ujian: validasi token LOKAL — bisa dilakukan saat offline. */
  const mulaiUjian = () => {
    const t = token.trim().toUpperCase();
    if (!tokenValid(t)) {
      toast.error("Token tidak valid (4–12 huruf/angka, tanpa spasi).");
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
      setPin("");
      setPesanKunci(null);
      toast.success("Kunci dibuka. Matikan internet lagi, lalu lanjutkan ujian.");
      if (navigator.onLine) {
        void gasCall("catatBukaKunci", {
          ujian_id: ujianId,
          nama: `${sesi?.nama ?? "-"} (${sesi?.kelas ?? "-"})`,
          catatan: "PIN diverifikasi lokal oleh pengawas",
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
              hasil: {
                nilai: res.nilai,
                benar: res.benar,
                total_soal: res.total_soal,
                total_pelanggaran: res.total_pelanggaran,
              },
            }
          : prev,
      );
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
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pb-3 text-xs font-semibold text-muted-foreground">
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
            </span>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
        {fase === "setup" && (
          <SetupFase
            judul={sesi?.judul ?? meta?.judul ?? ""}
            deskripsi={sesi?.deskripsi ?? meta?.deskripsi}
            jumlahSoal={sesi?.soal.length ?? meta?.jumlah_soal ?? 0}
            durasiMenit={sesi?.durasi_menit ?? meta?.durasi_menit ?? 60}
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
            token={token}
            setToken={setToken}
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
            onGrid={() => setTampilGrid((v) => !v)}
            tampilGrid={tampilGrid}
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
            <div className="px-5 pb-5">
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
              Serahkan HP kepada pengawas untuk memasukkan PIN — setelah terbuka,
              jawaban sebelumnya tetap ada dan ujian bisa dilanjutkan offline.
            </p>

            <div className="mt-5 flex justify-center gap-2">
              {sesi.pelanggaran.slice(-3).map((p, i) => (
                <span
                  key={`${p.waktu}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"
                >
                  <AlertTriangle className="size-3.5 text-amber-300" />
                  {p.jenis === "online" ? "Online" : "Pindah tab"}
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
                Kunci dibuka dengan PIN pengawas di perangkat (tidak butuh
                internet). Audit pembukaan dikirim ke server bila HP online.
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
                setTampilGrid(false);
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
