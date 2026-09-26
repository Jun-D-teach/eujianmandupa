import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useParams, useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import {
  hapusSesi,
  muatSesi,
  simpanSesi,
  type Fase,
  type SesiUjian,
} from "@/lib/exam-storage";
import { bunyikanSirene } from "@/lib/siren";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Grid3X3,
  Lock,
  Send,
  ShieldAlert,
  Siren,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

/** PIN pengawas/admin untuk membuka layar terkunci (3 strike). */
const PIN_PENGAWAS = "123456";

/** Huruf jawaban siswa — hanya huruf A–E yang disimpan di sesi & server. */
type Pilihan = SesiUjian["jawaban"][string];

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
        <Wifi className="size-3.5" /> Terhubung · siap kirim
      </span>
    ) : (
      <span className={`${dasar} bg-amber-500/15 text-amber-700`}>
        <WifiOff className="size-3.5" /> Belum terhubung
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
  const ujianId = params.ujianId as Id<"ujian"> | undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const online = useOnline();
  const convex = useConvex();

  const [sesi, setSesi] = useState<SesiUjian | null>(() =>
    ujianId ? muatSesi(ujianId) : null,
  );
  const ujianMeta = useQuery(
    api.ujian.get,
    ujianId ? { ujianId } : "skip",
  );
  const kirimHasil = useMutation(api.hasil.kirim);
  const perbaruiProfil = useMutation(api.profil.perbarui);

  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [modal, setModal] = useState<{ jenis: "online" | "pindah" } | null>(null);
  const [tanyaSelesai, setTanyaSelesai] = useState(false);
  const [pin, setPin] = useState("");
  const [pinSalah, setPinSalah] = useState(0);
  const [tampilGrid, setTampilGrid] = useState(false);
  const [nama, setNama] = useState(user?.name ?? "");
  const [kelas, setKelas] = useState(user?.kelas ?? "");
  const [token, setToken] = useState("");
  const [sisaWaktu, setSisaWaktu] = useState<number | null>(null);
  const waktuHabisRef = useRef(false);

  const faseRef = useRef<Fase | undefined>(sesi?.fase);
  const strikeRef = useRef(sesi?.strike ?? 0);
  const onlineFlagRef = useRef(false);
  const hiddenFlagRef = useRef(false);

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
            pelanggaran: [
              ...prev.pelanggaran,
              { jenis, waktu: Date.now() },
            ],
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
        if (!onlineFlagRef.current) {
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

  // Saat ujian dimulai / dilanjutkan, periksa koneksi sekali lagi
  // (dilindungi onlineFlagRef agar tidak dobel di StrictMode).
  useEffect(() => {
    if (sesi?.fase !== "ujian") return;
    if (!navigator.onLine) {
      onlineFlagRef.current = false;
      return;
    }
    if (!onlineFlagRef.current) {
      onlineFlagRef.current = true;
      catatPelanggaran("online");
    }
  }, [sesi?.fase, catatPelanggaran]);

  // --- Waktu ujian (diset admin) ---------------------------------------
  // Sesi lama tanpa batas waktu: mulai hitung mundur saat ujian dibuka.
  useEffect(() => {
    if (sesi?.fase !== "ujian" || sesi.batasWaktu) return;
    setSesi((prev) =>
      prev && prev.fase === "ujian" && !prev.batasWaktu
        ? {
            ...prev,
            durasi_menit: prev.durasi_menit ?? 60,
            batasWaktu: Date.now() + (prev.durasi_menit ?? 60) * 60_000,
          }
        : prev,
    );
  }, [sesi?.fase, sesi?.batasWaktu]);

  // Hitung mundur: saat habis, otomatis pindah ke tahap pengiriman.
  useEffect(() => {
    const batas = sesi?.batasWaktu;
    if (sesi?.fase !== "ujian" || !batas) {
      setSisaWaktu(null);
      return;
    }
    const tick = () => {
      const sisa = Math.max(0, Math.ceil((batas - Date.now()) / 1000));
      setSisaWaktu(sisa);
      if (sisa <= 0 && !waktuHabisRef.current) {
        waktuHabisRef.current = true;
        toast("Waktu ujian habis — lanjutkan ke pengiriman jawaban.");
        setSesi((prev) =>
          prev && prev.fase === "ujian" ? { ...prev, fase: "kirim" } : prev,
        );
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sesi?.fase, sesi?.batasWaktu]);

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

  // --- Aksi fase -------------------------------------------------------
  const unduhSoal = async () => {
    if (!ujianId) return;
    const n = nama.trim();
    const k = kelas.trim();
    const t = token.trim().toUpperCase();
    if (!n || !k) {
      toast.error("Nama dan kelas wajib diisi sebelum mengunduh soal.");
      return;
    }
    if (!t) {
      toast.error("Masukkan token ujian yang diberikan pengawas.");
      return;
    }
    setBusy(true);
    setPesan(null);
    try {
      const data = await convex.query(api.soal.untukSiswa, {
        ujianId,
        token: t,
      });
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
        soal: data.soal,
        jawaban: {},
        indeks: 0,
        strike: 0,
        pelanggaran: [],
      };
      setSesi(baru);
      simpanSesi(baru);
      void perbaruiProfil({ nama: n, kelas: k }).catch(() => {});
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

  const mulaiUjian = () => {
    const now = Date.now();
    waktuHabisRef.current = false;
    setSesi((prev) =>
      prev
        ? {
            ...prev,
            fase: "ujian",
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

  const jawab = (pilihan: Pilihan) => {
    if (!sesi) return;
    const soal = sesi.soal[sesi.indeks];
    if (!soal) return;
    setSesi({
      ...sesi,
      jawaban: { ...sesi.jawaban, [soal._id]: pilihan },
    });
  };

  const pindahSoal = (i: number) => {
    if (!sesi) return;
    if (i < 0 || i >= sesi.soal.length) return;
    setSesi({ ...sesi, indeks: i });
  };

  const bukaKunci = (nilaiPin: string) => {
    if (nilaiPin === PIN_PENGAWAS) {
      setSesi((prev) => (prev ? { ...prev, strike: 0 } : prev));
      strikeRef.current = 0;
      onlineFlagRef.current = false;
      hiddenFlagRef.current = false;
      setPin("");
      toast.success("Layar dibuka pengawas. Ujian dilanjutkan.");
    } else {
      setPinSalah((n) => n + 1);
    }
  };

  const kirimJawaban = async () => {
    if (!sesi || !ujianId) return;
    setBusy(true);
    try {
      const res = await kirimHasil({
        ujianId,
        nama: sesi.nama,
        kelas: sesi.kelas,
        total_pelanggaran: sesi.pelanggaran.length,
        jawaban: sesi.soal.map((s) => ({
          soal_id: s._id as Id<"soal">,
          pilihan: sesi.jawaban[s._id],
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
  if (sesi === null && ujianMeta === undefined) {
    return (
      <Shell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Shell>
    );
  }
  if (sesi === null && ujianMeta === null) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">
          Ujian ini sudah dihapus atau tautannya salah.
        </p>
        <Button className="mt-4" onClick={() => navigate("/dashboard")}>
          Kembali ke beranda
        </Button>
      </Shell>
    );
  }

  const totalTerjawab = sesi
    ? sesi.soal.filter((s) => sesi.jawaban[s._id]).length
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
              {sesi?.judul ?? ujianMeta?.judul ?? "Ujian"}
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
            judul={sesi?.judul ?? ujianMeta?.judul ?? ""}
            deskripsi={sesi?.deskripsi ?? ujianMeta?.deskripsi}
            jumlahSoal={sesi?.soal.length ?? ujianMeta?.jumlah_soal ?? 0}
            durasiMenit={sesi?.durasi_menit ?? ujianMeta?.durasi_menit ?? 60}
            nama={nama}
            kelas={kelas}
            setNama={setNama}
            setKelas={setKelas}
            token={token}
            setToken={setToken}
            pesan={pesan}
            busy={busy}
            online={online}
            onUnduh={unduhSoal}
          />
        )}

        {fase === "instruksi" && sesi && (
          <InstruksiFase sesi={sesi} online={online} onMulai={mulaiUjian} onUlang={() => { hapusSesi(sesi.ujianId); setSesi(null); }} />
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
                yang dapat membukanya.
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

      {/* Layar terkunci (3 strike) */}
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
              Aplikasi dikunci total. Serahkan HP kepada pengawas untuk membuka
              dengan PIN.
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
              <p className="mt-3 text-xs text-white/60">
                6 digit PIN yang diberikan pengawas/admin.
              </p>
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
                ? `Masih ada ${sesi!.soal.length - totalTerjawab} soal yang belum dijawab. Jawaban yang kosong dihitung salah.`
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

/* ------------------------------------------------------------------ */
/* FASE: SETUP — isi nama/kelas + unduh soal (online)                  */
/* ------------------------------------------------------------------ */
function SetupFase(props: {
  judul: string;
  deskripsi?: string;
  jumlahSoal: number;
  durasiMenit: number;
  nama: string;
  kelas: string;
  setNama: (v: string) => void;
  setKelas: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  pesan: string | null;
  busy: boolean;
  online: boolean;
  onUnduh: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Badge variant="secondary" className="mb-3">
          Tahap 1 · Unduh soal
        </Badge>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {props.judul || "Ujian"}
        </h1>
        {props.deskripsi && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {props.deskripsi}
          </p>
        )}
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {props.jumlahSoal} soal · durasi {props.durasiMenit} menit
        </p>
      </div>

      <Card className="border-border/70">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nama">Nama lengkap</Label>
              <Input
                id="nama"
                value={props.nama}
                onChange={(e) => props.setNama(e.target.value)}
                placeholder="cth. Ayu Lestari"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kelas">Kelas</Label>
              <Input
                id="kelas"
                value={props.kelas}
                onChange={(e) => props.setKelas(e.target.value)}
                placeholder="cth. XII-IPA-2"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="token">Token ujian</Label>
            <Input
              id="token"
              value={props.token}
              onChange={(e) => props.setToken(e.target.value.toUpperCase())}
              placeholder="cth. K7XM3P"
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono text-lg font-bold uppercase tracking-[0.35em]"
            />
            <p className="text-xs text-muted-foreground">
              Token diset admin/pengawas dan dibagikan saat ujian dimulai.
              Soal tidak bisa diunduh tanpa token yang benar.
            </p>
          </div>

          <div
            className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-5 ${
              props.online
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                : "border-amber-500/30 bg-amber-500/10 text-amber-800"
            }`}
          >
            {props.online ? (
              <>
                <Wifi className="mt-0.5 size-4 shrink-0" />
                <span>
                  Terhubung internet — soal bisa diunduh sekarang. Setelah
                  diunduh, matikan WiFi/data sebelum memulai ujian.
                </span>
              </>
            ) : (
              <>
                <WifiOff className="mt-0.5 size-4 shrink-0" />
                <span>
                  Tidak ada koneksi. Sambungkan internet sementara untuk
                  mengunduh soal.
                </span>
              </>
            )}
          </div>

          {props.pesan && (
            <p className="rounded-xl bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-600">
              {props.pesan}
            </p>
          )}

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={props.onUnduh}
            disabled={props.busy || !props.online}
          >
            <Download className="size-4" />
            {props.busy ? "Mengunduh…" : "Unduh Soal"}
          </Button>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">
            Soal disimpan ke penyimpanan HP dan dibaca lokal saat ujian.
            Kunci jawaban tidak pernah dikirim ke perangkat siswa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: INSTRUKSI — persiapan offline                                 */
/* ------------------------------------------------------------------ */
function InstruksiFase(props: {
  sesi: SesiUjian;
  online: boolean;
  onMulai: () => void;
  onUlang: () => void;
}) {
  const aturan = [
    "MATIKAN WiFi dan paket data seluler sekarang. Ujian hanya boleh dikerjakan dalam keadaan offline.",
    "Jangan berpindah aplikasi, membuka tab lain, atau meminimize browser selama ujian.",
    `Waktu ujian ${props.sesi.durasi_menit ?? 60} menit, dihitung sejak tombol Mulai Ujian. Saat waktu habis sistem otomatis berpindah ke pengiriman jawaban.`,
    "Setiap pelanggaran membunyikan sirene dan menambah 1 strike.",
    "Pada strike ke-3 layar terkunci total — hanya PIN pengawas yang dapat membukanya.",
    "Jawaban tersimpan otomatis di HP. Setelah selesai, nyalakan internet kembali untuk mengirim.",
  ];

  return (
    <div className="space-y-5">
      <div>
        <Badge variant="secondary" className="mb-3">
          Tahap 2 · Persiapan offline
        </Badge>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Baca aturan sebelum mulai
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {props.sesi.judul} · {props.sesi.soal.length} soal · durasi{" "}
          {props.sesi.durasi_menit ?? 60} menit · {props.sesi.nama} ({
          props.sesi.kelas
          })
        </p>
      </div>

      <Card
        className={`border-2 ${
          props.online
            ? "border-red-500/50 bg-red-500/5"
            : "border-emerald-500/40 bg-emerald-500/5"
        }`}
      >
        <CardContent className="flex items-center gap-3 p-5">
          {props.online ? (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-600">
                <Wifi className="size-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-red-600">
                  Internet masih MENYALA
                </p>
                <p className="text-xs leading-5 text-red-600/80">
                  Matikan WiFi & data seluler sekarang sebelum menekan Mulai
                  Ujian.
                </p>
              </div>
            </>
          ) : (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
                <WifiOff className="size-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-emerald-700">
                  Internet sudah mati — siap!
                </p>
                <p className="text-xs leading-5 text-emerald-700/80">
                  HP dalam keadaan offline. Ujian boleh dimulai.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Ketentuan wajib
          </p>
          <ol className="mt-4 space-y-3">
            {aturan.map((a, i) => (
              <li key={a} className="flex gap-3 text-sm leading-6">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className={i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {a}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={props.onMulai}>
        Saya sudah offline — Mulai Ujian
      </Button>
      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={props.onUlang}
      >
        Hapus sesi & unduh ulang soal
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: UJIAN — wajib offline                                         */
/* ------------------------------------------------------------------ */
function UjianFase(props: {
  sesi: SesiUjian;
  totalTerjawab: number;
  onJawab: (p: Pilihan) => void;
  onPindah: (i: number) => void;
  onSelesai: () => void;
  onGrid: () => void;
  tampilGrid: boolean;
}) {
  const { sesi } = props;
  const soal = sesi.soal[sesi.indeks];
  const terjawab = sesi.jawaban[soal?._id ?? ""];

  // Opsi ditampilkan A–E; E hanya bila guru mengisinya.
  const opsi: { huruf: Pilihan; teks: string }[] = soal
    ? [
        { huruf: "A", teks: soal.opsi_a },
        { huruf: "B", teks: soal.opsi_b },
        { huruf: "C", teks: soal.opsi_c },
        { huruf: "D", teks: soal.opsi_d },
        ...(soal.opsi_e
          ? [{ huruf: "E" as Pilihan, teks: soal.opsi_e }]
          : []),
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Navigasi cepat */}
      {props.tampilGrid && (
        <Card className="border-border/70">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Daftar soal
            </p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {sesi.soal.map((s, i) => {
                const dijawab = Boolean(sesi.jawaban[s._id]);
                const aktif = i === sesi.indeks;
                return (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => props.onPindah(i)}
                    className={`aspect-square rounded-xl text-xs font-bold transition-colors ${
                      aktif
                        ? "bg-ink text-white"
                        : dijawab
                          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40"
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Soal */}
      <Card className="border-border/70 shadow-[0_1px_2px_rgba(16,20,24,0.04)]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>
              Soal {sesi.indeks + 1} dari {sesi.soal.length}
            </span>
            <button
              type="button"
              onClick={props.onGrid}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11px] transition-colors hover:bg-muted"
            >
              <Grid3X3 className="size-3.5" />
              {props.tampilGrid ? "Tutup" : "Semua soal"}
            </button>
          </div>

          <p className="mt-4 text-base font-semibold leading-7 sm:text-lg">
            {soal?.pertanyaan}
          </p>

          <div className="mt-5 space-y-2.5">
            {opsi.map(({ huruf, teks }) => {
              const aktif = terjawab === huruf;
              return (
                <button
                  key={huruf}
                  type="button"
                  onClick={() => props.onJawab(huruf)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm transition-all ${
                    aktif
                      ? "border-emerald-600 bg-emerald-500/10 font-semibold shadow-[0_0_0_1px_rgba(16,185,129,0.5)]"
                      : "border-border/70 bg-card hover:border-foreground/30"
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                      aktif
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {huruf}
                  </span>
                  <span className="leading-6">{teks}</span>
                  {aktif && (
                    <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Navigasi bawah */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="gap-2"
          disabled={sesi.indeks === 0}
          onClick={() => props.onPindah(sesi.indeks - 1)}
        >
          <ArrowLeft className="size-4" /> Sebelumnya
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={sesi.indeks >= sesi.soal.length - 1}
          onClick={() => props.onPindah(sesi.indeks + 1)}
        >
          Berikutnya <ArrowRight className="size-4" />
        </Button>
        <Button className="ml-auto gap-2" onClick={props.onSelesai}>
          <Send className="size-4" /> Selesai
        </Button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        {props.totalTerjawab}/{sesi.soal.length} terjawab · jawaban tersimpan
        otomatis di HP
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: KIRIM — wajib online kembali                                  */
/* ------------------------------------------------------------------ */
function KirimFase(props: {
  sesi: SesiUjian;
  totalTerjawab: number;
  online: boolean;
  busy: boolean;
  onKirim: () => void;
  onKembali: () => void;
}) {
  const { sesi } = props;
  const kosong = sesi.soal.length - props.totalTerjawab;

  return (
    <div className="space-y-5">
      <div>
        <Badge variant="secondary" className="mb-3">
          Tahap 3 · Kirim jawaban
        </Badge>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Periksa lalu kirim
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Pengiriman hanya bisa dilakukan setelah internet dinyalakan kembali.
        </p>
      </div>

      <Card className="border-border/70">
        <CardContent className="divide-y divide-border/60 p-0">
          {[
            ["Nama", sesi.nama],
            ["Kelas", sesi.kelas],
            ["Terjawab", `${props.totalTerjawab} / ${sesi.soal.length}`],
            ["Belum dijawab", String(kosong)],
            [
              "Total pelanggaran",
              `${sesi.pelanggaran.length} strike`,
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between px-5 py-3.5 text-sm"
            >
              <span className="text-muted-foreground">{k}</span>
              <span
                className={`font-semibold ${
                  k === "Total pelanggaran" && sesi.pelanggaran.length > 0
                    ? "text-red-600"
                    : "text-foreground"
                }`}
              >
                {v}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div
        className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm leading-6 ${
          props.online
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
            : "border-amber-500/40 bg-amber-500/10 text-amber-800"
        }`}
      >
        {props.online ? (
          <>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              Terhubung internet. Jawaban siap dikirim ke server untuk dinilai.
            </span>
          </>
        ) : (
          <>
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            <span>
              Nyalakan WiFi / paket data terlebih dahulu — pengiriman jawaban
              membutuhkan koneksi.
            </span>
          </>
        )}
      </div>

      <Button
        size="lg"
        className="w-full gap-2"
        onClick={props.onKirim}
        disabled={!props.online || props.busy}
      >
        <Send className="size-4" />
        {props.busy ? "Mengirim…" : "Kirim Jawaban"}
      </Button>
      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={props.onKembali}
        disabled={props.busy}
      >
        Kembali memeriksa jawaban
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: SELESAI                                                       */
/* ------------------------------------------------------------------ */
function SelesaiFase(props: { sesi: SesiUjian; onBeranda: () => void }) {
  const hasil = props.sesi.hasil;
  const nilai = hasil?.nilai ?? 0;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-border/70">
        <div className="bg-ink px-6 py-8 text-center text-white">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Trophy className="size-6 text-emerald-400" />
          </span>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
            Jawaban terkirim
          </p>
          <p className="mt-2 text-6xl font-extrabold tracking-tight text-emerald-400">
            {nilai}
          </p>
          <p className="mt-1 text-sm text-white/60">
            {hasil?.benar ?? 0} benar dari {hasil?.total_soal ?? 0} soal
          </p>
        </div>
        <CardContent className="divide-y divide-border/60 p-0">
          {[
            ["Nama", props.sesi.nama],
            ["Kelas", props.sesi.kelas],
            ["Pelanggaran", `${props.sesi.pelanggaran.length} strike`],
            [
              "Waktu kirim",
              props.sesi.kirimPada
                ? new Date(props.sesi.kirimPada).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—",
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between px-5 py-3.5 text-sm"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={props.onBeranda}>
        Kembali ke beranda
      </Button>
    </div>
  );
}
