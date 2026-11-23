import { useEffect, useMemo, useRef, useState } from "react";
import { gasCall, type HasilGas, type SoalGas, type UjianGas } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { soalHTML } from "@/lib/soal-format";
import {
  BarChart3,
  BookOpen,
  CheckCheck,
  CheckSquare,
  Download,
  Lock,
  PenLine,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

/** Baris laporan dari aksi getLaporan: jawaban A–E (PG) atau teks per soal. */
type BarisLaporan = {
  hasil_id: string;
  timestamp: string;
  nama: string;
  kelas: string;
  nisn: string;
  percobaan: number;
  nilai: number;
  nilai_tertinggi: number;
  nilai_resmi: boolean;
  benar: number;
  total_soal: number;
  total_pelanggaran: number;
  jawaban: Record<string, string>;
};

type SoalLaporan = { id: string; nomor: number; tipe: string };
type PesertaUjian = {
  id: string;
  nama: string;
  kelas: string;
  sudah_kirim: boolean;
};

/** Konfigurasi warna grafik distribusi nilai. */
const chartConfig = {
  jumlah: { label: "Jumlah siswa", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Rekap hasil per ujian (guru & admin). */
export function HasilUjian() {
  const { user } = useAuth();
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [pilih, setPilih] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilGas[] | null>(null);
  const [peserta, setPeserta] = useState<PesertaUjian[] | null>(null);
  const [versi, setVersi] = useState(0);
  const [koreksi, setKoreksi] = useState<HasilGas | null>(null);
  const [targetUlang, setTargetUlang] = useState<HasilGas | null>(null);
  const [busyUlang, setBusyUlang] = useState(false);
  const [dialogHitungUlang, setDialogHitungUlang] = useState(false);
  const [busyHitungUlang, setBusyHitungUlang] = useState(false);
  /** Filter kelas untuk laporan (tabel, ringkasan, grafik & ekspor Excel). */
  const [kelas, setKelas] = useState("semua");
  const [busyEkspor, setBusyEkspor] = useState(false);
  const [cari, setCari] = useState("");
  const [filterKetuntasan, setFilterKetuntasan] = useState("semua");
  const [filterKoreksi, setFilterKoreksi] = useState("semua");
  const [filterPelanggaran, setFilterPelanggaran] = useState("semua");
  const [urutkan, setUrutkan] = useState("nilai-desc");
  const [pilihanCetak, setPilihanCetak] = useState<Set<string>>(new Set());
  const daftarCetakRef = useRef<HTMLDivElement>(null);

  // Muat daftar ujian
  useEffect(() => {
    let hidup = true;
    setUjian(null);
    gasCall<{ ujian: UjianGas[] }>("getUjian")
      .then((res) => {
        if (!hidup) return;
        setUjian(res.ujian);
        setPilih((sebelumnya) => sebelumnya ?? res.ujian[0]?.id ?? null);
      })
      .catch(() => {
        if (hidup) setUjian([]);
      });
    return () => {
      hidup = false;
    };
  }, [versi]);

  // Muat hasil ujian terpilih
  useEffect(() => {
    if (!pilih) {
      setHasil(null);
      setPeserta(null);
      return;
    }
    let hidup = true;
    setHasil(null);
    setPeserta(null);
    gasCall<{ hasil: HasilGas[]; peserta?: PesertaUjian[] }>(
      "getHasil",
      { ujian_id: pilih },
    )
      .then((res) => {
        if (hidup) {
          setHasil(res.hasil);
          setPeserta(res.peserta ?? []);
        }
      })
      .catch(() => {
        if (hidup) {
          setHasil([]);
          setPeserta([]);
        }
      });
    return () => {
      hidup = false;
    };
  }, [pilih, versi]);

  // Kelas yang muncul pada ujian terpilih (bahan filter).
  const daftarKelas = useMemo(() => {
    const set = new Set<string>();
    for (const h of hasil ?? []) if (h.kelas) set.add(h.kelas);
    for (const p of peserta ?? []) if (p.kelas) set.add(p.kelas);
    return [...set].sort();
  }, [hasil, peserta]);

  const pesertaTersaring = useMemo(
    () =>
      (peserta ?? []).filter((p) => kelas === "semua" || p.kelas === kelas),
    [peserta, kelas],
  );
  const jumlahSudahKirim = pesertaTersaring.filter((p) => p.sudah_kirim).length;
  const belumMengirim = useMemo(() => {
    const q = cari.trim().toLocaleLowerCase("id");
    return pesertaTersaring.filter(
      (p) =>
        !p.sudah_kirim &&
        (!q ||
          p.nama.toLocaleLowerCase("id").includes(q) ||
          p.kelas.toLocaleLowerCase("id").includes(q)),
    );
  }, [pesertaTersaring, cari]);

  // Baris yang lolos filter kelas — dipakai tabel, ringkasan, grafik & ekspor.
  const hasilTerfilter = useMemo(() => {
    if (hasil === null) return null;
    return kelas === "semua" ? hasil : hasil.filter((h) => h.kelas === kelas);
  }, [hasil, kelas]);

  const hasilTampil = useMemo(() => {
    if (!hasilTerfilter) return null;
    const q = cari.trim().toLocaleLowerCase("id");
    const rows = hasilTerfilter.filter((h) => {
      const cocokCari =
        !q ||
        [h.nama, h.kelas, h.token, h.ujian_judul].some((v) =>
          v?.toLocaleLowerCase("id").includes(q),
        );
      const cocokTuntas =
        filterKetuntasan === "semua" ||
        (filterKetuntasan === "tuntas" ? h.nilai >= 75 : h.nilai < 75);
      const cocokKoreksi =
        filterKoreksi === "semua" ||
        (filterKoreksi === "menunggu"
          ? (h.menunggu ?? 0) > 0
          : (h.menunggu ?? 0) === 0);
      const cocokPelanggaran =
        filterPelanggaran === "semua" ||
        (filterPelanggaran === "ada"
          ? h.total_pelanggaran > 0
          : h.total_pelanggaran === 0);
      return cocokCari && cocokTuntas && cocokKoreksi && cocokPelanggaran;
    });
    return [...rows].sort((a, b) => {
      if (urutkan === "nilai-desc")
        return b.nilai - a.nilai || a.nama.localeCompare(b.nama, "id");
      if (urutkan === "nilai-asc")
        return a.nilai - b.nilai || a.nama.localeCompare(b.nama, "id");
      if (urutkan === "nama") return a.nama.localeCompare(b.nama, "id");
      const waktuA = new Date(a.timestamp.replace(" ", "T")).getTime() || 0;
      const waktuB = new Date(b.timestamp.replace(" ", "T")).getTime() || 0;
      return urutkan === "terlama" ? waktuA - waktuB : waktuB - waktuA;
    });
  }, [
    hasilTerfilter,
    cari,
    filterKetuntasan,
    filterKoreksi,
    filterPelanggaran,
    urutkan,
  ]);

  const percobaanTerakhir = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of hasil ?? []) {
      if (!h.username) continue;
      map.set(h.username, Math.max(map.get(h.username) ?? 0, h.percobaan ?? 1));
    }
    return map;
  }, [hasil]);

  const jumlahTersaring = hasilTampil?.length ?? 0;
  const hasilResmiTampil = useMemo(
    () => (hasilTampil ?? []).filter((h) => h.nilai_resmi !== false),
    [hasilTampil],
  );
  const hasilDipilih = (hasilTampil ?? []).filter((h) =>
    pilihanCetak.has(h.id),
  );
  const rataDipilih = hasilDipilih.length
    ? Math.round(
        hasilDipilih.reduce((total, h) => total + h.nilai, 0) /
          hasilDipilih.length,
      )
    : null;
  const semuaTerpilih =
    Boolean(hasilTampil?.length) &&
    hasilTampil?.every((h) => pilihanCetak.has(h.id));

  const toggleSemuaCetak = (dipilih: boolean) => {
    setPilihanCetak((sebelumnya) => {
      const baru = new Set(sebelumnya);
      for (const h of hasilTampil ?? []) {
        if (dipilih) baru.add(h.id);
        else baru.delete(h.id);
      }
      return baru;
    });
  };

  const cetakHasil = (hanyaDipilih: boolean) => {
    const root = daftarCetakRef.current;
    if (!root || !hasilTampil?.length) return;
    const adaPilihanTampil = hasilTampil.some((h) => pilihanCetak.has(h.id));
    if (hanyaDipilih && !adaPilihanTampil) {
      toast.error("Pilih minimal satu hasil untuk dicetak.");
      return;
    }
    root.classList.toggle("print-selected-only", hanyaDipilih);
    window.print();
  };

  useEffect(() => {
    const selesaiCetak = () =>
      daftarCetakRef.current?.classList.remove("print-selected-only");
    window.addEventListener("afterprint", selesaiCetak);
    return () => window.removeEventListener("afterprint", selesaiCetak);
  }, []);

  // Statistik dan grafik mengikuti seluruh filter hasil yang sedang aktif.
  const statistik = useMemo(() => {
    const rows = hasilResmiTampil;
    if (rows.length === 0) return null;
    const nilai = rows.map((h) => h.nilai);
    return {
      peserta: rows.length,
      rata: Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length),
      tertinggi: Math.max(...nilai),
      terendah: Math.min(...nilai),
      lulus: nilai.filter((n) => n >= 75).length,
    };
  }, [hasilResmiTampil]);

  // Distribusi nilai per rentang — bahan grafik batang.
  const distribusi = useMemo(() => {
    const rentang = [
      { label: "0–59", bawah: 0, batas: 59 },
      { label: "60–69", bawah: 60, batas: 69 },
      { label: "70–79", bawah: 70, batas: 79 },
      { label: "80–89", bawah: 80, batas: 89 },
      { label: "90–100", bawah: 90, batas: 100 },
    ];
    const rows = hasilResmiTampil;
    return rentang.map((r) => ({
      label: r.label,
      jumlah: rows.filter((h) => h.nilai >= r.bawah && h.nilai <= r.batas)
        .length,
    }));
  }, [hasilResmiTampil]);

  const izinkanUlang = async () => {
    if (!targetUlang?.username || !targetUlang.ujian_id) return;
    setBusyUlang(true);
    try {
      const res = await gasCall<{ message?: string }>("izinkanUjianUlang", {
        ujian_id: targetUlang.ujian_id,
        username: targetUlang.username,
      });
      toast.success(res.message ?? "Izin ujian ulang diberikan.");
      setTargetUlang(null);
      setVersi((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memberi izin ujian ulang.");
    } finally {
      setBusyUlang(false);
    }
  };

  const resetFilter = () => {
    setCari("");
    setKelas("semua");
    setFilterKetuntasan("semua");
    setFilterKoreksi("semua");
    setFilterPelanggaran("semua");
    setUrutkan("nilai-desc");
    setPilihanCetak(new Set());
  };

  const hitungUlangNilai = async () => {
    if (!pilih || busyHitungUlang) return;
    setBusyHitungUlang(true);
    try {
      const res = await gasCall<{ message?: string }>("hitungUlangNilaiAcak", {
        ujian_id: pilih,
      });
      toast.success(res.message ?? "Hasil lama dihitung ulang.");
      setDialogHitungUlang(false);
      setVersi((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghitung ulang hasil.");
    } finally {
      setBusyHitungUlang(false);
    }
  };

  /** Unduh laporan Excel per percobaan, nilai resmi, dan jawaban per soal. */
  const unduhExcel = async () => {
    if (!pilih || busyEkspor) return;
    setBusyEkspor(true);
    try {
      const lap = await gasCall<{ soal: SoalLaporan[]; baris: BarisLaporan[] }>(
        "getLaporan",
        { ujian_id: pilih },
      );
      const urutanId = new Map(
        (hasilTampil ?? []).map((h, index) => [h.id, index]),
      );
      const baris = lap.baris
        .filter((b) => urutanId.has(b.hasil_id))
        .sort(
          (a, b) =>
            (urutanId.get(a.hasil_id) ?? 0) -
            (urutanId.get(b.hasil_id) ?? 0),
        );
      if (baris.length === 0) {
        toast.error("Tidak ada jawaban untuk filter yang dipilih.");
        return;
      }
      const XLSX = await import("xlsx");
      const waktu = (t: string) => {
        const d = new Date(t.replace(" ", "T"));
        return Number.isNaN(d.getTime())
          ? t
          : d.toLocaleString("id-ID", {
              dateStyle: "short",
              timeStyle: "short",
            });
      };
      const header = [
        "Waktu Kirim Jawaban",
        "NAMA",
        "NISN",
        "KELAS",
        "Percobaan",
        "Nilai Percobaan",
        "Nilai Resmi Tertinggi",
        "Percobaan Resmi?",
        ...lap.soal.map((s) => `Soal ${s.nomor}`),
      ];
      const isi = baris.map((b) => [
        waktu(b.timestamp),
        b.nama,
        b.nisn,
        b.kelas,
        b.percobaan,
        b.nilai,
        b.nilai_tertinggi,
        b.nilai_resmi ? "Ya" : "Tidak",
        ...lap.soal.map((s) => b.jawaban[s.id] ?? ""),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...isi]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Hasil");
      const bersihkan = (v: string) =>
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      const judul = (ujian ?? []).find((u) => u.id === pilih)?.judul ?? "ujian";
      const namaFile =
        `hasil-${bersihkan(judul)}` +
        (kelas === "semua" ? "" : `-${bersihkan(kelas)}`) +
        ".xlsx";
      XLSX.writeFile(wb, namaFile);
      toast.success(`${baris.length} baris diunduh ke ${namaFile}.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengunduh laporan.",
      );
    } finally {
      setBusyEkspor(false);
    }
  };

  if (ujian === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Hasil ujian
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilihan ganda dinilai otomatis (100 poin/soal); essay & uraian
            dikoreksi manual lewat tombol Koreksi. Total pelanggaran ikut
            tercatat.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setVersi((v) => v + 1)}
        >
          <RefreshCw className="size-4" /> Segarkan
        </Button>
      </div>

      {ujian.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada ujian</EmptyTitle>
            <EmptyDescription>
              Buat ujian dulu di tab Kelola Ujian.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {ujian.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setPilih(u.id);
                  setKelas("semua");
                  setCari("");
                  setFilterKetuntasan("semua");
                  setFilterKoreksi("semua");
                  setFilterPelanggaran("semua");
                  setPilihanCetak(new Set());
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  pilih === u.id
                    ? "bg-ink text-white"
                    : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.judul}
                <span className="ml-2 text-xs opacity-70">
                  {u.jumlah_soal} soal
                </span>
              </button>
            ))}
          </div>

          <Card className="space-y-4 border-border/70 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Cari dan saring hasil</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasilTampil === null || peserta === null
                    ? "Memuat data peserta…"
                    : `${jumlahSudahKirim} dari ${pesertaTersaring.length} siswa sasaran sudah mengirim (${pesertaTersaring.length - jumlahSudahKirim} belum) · ${jumlahTersaring} hasil ditampilkan`}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={resetFilter}>
                Reset filter
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="relative sm:col-span-2 xl:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari nama, kelas, atau token…"
                  aria-label="Cari nama, kelas, atau token siswa"
                  className="pl-9"
                />
              </div>
              <Select value={kelas} onValueChange={setKelas}>
                <SelectTrigger aria-label="Filter kelas">
                  <SelectValue placeholder="Semua kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua kelas</SelectItem>
                  {daftarKelas.map((k) => (
                    <SelectItem key={k} value={k}>
                      Kelas {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterKetuntasan}
                onValueChange={setFilterKetuntasan}
              >
                <SelectTrigger aria-label="Filter ketuntasan">
                  <SelectValue placeholder="Semua nilai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua nilai</SelectItem>
                  <SelectItem value="tuntas">Tuntas (≥ 75)</SelectItem>
                  <SelectItem value="belum">Belum tuntas (&lt; 75)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterKoreksi} onValueChange={setFilterKoreksi}>
                <SelectTrigger aria-label="Filter status koreksi">
                  <SelectValue placeholder="Semua status koreksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua status koreksi</SelectItem>
                  <SelectItem value="menunggu">Menunggu koreksi</SelectItem>
                  <SelectItem value="selesai">Koreksi selesai</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filterPelanggaran}
                onValueChange={setFilterPelanggaran}
              >
                <SelectTrigger aria-label="Filter pelanggaran">
                  <SelectValue placeholder="Semua pelanggaran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua pelanggaran</SelectItem>
                  <SelectItem value="ada">Ada pelanggaran</SelectItem>
                  <SelectItem value="tidak">Tanpa pelanggaran</SelectItem>
                </SelectContent>
              </Select>
              <Select value={urutkan} onValueChange={setUrutkan}>
                <SelectTrigger aria-label="Urutkan hasil">
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nilai-desc">Nilai tertinggi</SelectItem>
                  <SelectItem value="nilai-asc">Nilai terendah</SelectItem>
                  <SelectItem value="nama">Nama A–Z</SelectItem>
                  <SelectItem value="terbaru">Terbaru dikirim</SelectItem>
                  <SelectItem value="terlama">Terlama dikirim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!hasilTampil?.length}
                  onClick={() => toggleSemuaCetak(!semuaTerpilih)}
                >
                  <CheckSquare className="size-4" />
                  {semuaTerpilih
                    ? "Batal pilih hasil tersaring"
                    : "Pilih hasil tersaring"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {hasilTampil?.filter((h) => pilihanCetak.has(h.id)).length ??
                    0}{" "}
                  dipilih
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {user?.role === "admin" && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={!pilih || !hasil?.length || busyHitungUlang}
                    onClick={() => setDialogHitungUlang(true)}
                  >
                    <RefreshCw className="size-4" />
                    Hitung ulang nilai lama
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={busyEkspor || !hasilTampil?.length}
                  onClick={() => void unduhExcel()}
                >
                  <Download className="size-4" />
                  {busyEkspor ? "Menyiapkan…" : "Unduh Excel"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={!hasilTampil?.length}
                  onClick={() => cetakHasil(false)}
                >
                  <Printer className="size-4" /> Cetak semua tersaring
                </Button>
                <Button
                  className="gap-2"
                  disabled={!hasilTampil?.some((h) => pilihanCetak.has(h.id))}
                  onClick={() => cetakHasil(true)}
                >
                  <Printer className="size-4" />
                  Cetak dipilih (
                  {hasilTampil?.filter((h) => pilihanCetak.has(h.id)).length ??
                    0}
                  )
                </Button>
              </div>
            </div>
          </Card>

          <Card className="border-border/70 p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">Siswa belum mengirim</h2>
              <span className="text-xs text-muted-foreground">
                {belumMengirim.length} siswa
                {kelas === "semua" ? "" : ` · kelas ${kelas}`}
              </span>
            </div>
            {peserta === null ? (
              <Skeleton className="mt-3 h-12 w-full" />
            ) : belumMengirim.length > 0 ? (
              <ul className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {belumMengirim.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium">{p.nama}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.kelas}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {pesertaTersaring.length === 0
                  ? "Tidak ada siswa terdaftar yang menjadi sasaran ujian ini."
                  : cari.trim()
                    ? "Tidak ada siswa yang cocok dengan pencarian dan belum mengirim."
                    : "Semua siswa sasaran sudah mengirim."}
              </p>
            )}
          </Card>

          {/* Ringkasan + grafik distribusi nilai (mengikuti filter kelas) */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card className="border-border/70 p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Trophy className="size-3.5" /> Ringkasan hasil tersaring
              </p>
              {hasil === null ? (
                <Skeleton className="mt-4 h-44 w-full" />
              ) : statistik ? (
                <dl className="mt-4 space-y-2.5 text-sm">
                  {[
                    ["Peserta mengirim", `${statistik.peserta} siswa`],
                    ["Rata-rata nilai", `${statistik.rata}`],
                    ["Nilai tertinggi", `${statistik.tertinggi}`],
                    ["Nilai terendah", `${statistik.terendah}`],
                    ["Tuntas (≥ 75)", `${statistik.lulus} siswa`],
                  ].map(([label, nilai]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-bold">{nilai}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Belum ada jawaban masuk
                  {kelas === "semua" ? "" : ` untuk kelas ${kelas}`}. Grafik
                  akan tampil setelah siswa mengirim jawaban.
                </p>
              )}
            </Card>

            <Card className="border-border/70 p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <BarChart3 className="size-3.5" /> Grafik distribusi nilai
              </p>
              {hasil === null ? (
                <Skeleton className="mt-4 h-[240px] w-full" />
              ) : statistik ? (
                <div className="mt-4 h-[240px] w-full">
                  <ChartContainer
                    config={chartConfig}
                    className="h-full w-full"
                  >
                    <BarChart
                      data={distribusi}
                      margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={34}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="jumlah"
                        fill="var(--color-jumlah)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Belum ada data nilai untuk digambarkan.
                </p>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden border-border/70">
            {hasil === null ? (
              <div className="p-6">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : hasilTerfilter?.length === 0 ? (
              <Empty className="py-14">
                <EmptyContent>
                  <EmptyTitle>
                    {hasilTerfilter?.length
                      ? "Tidak ada hasil yang cocok"
                      : "Belum ada jawaban masuk"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasilTerfilter?.length
                      ? "Coba ubah kata pencarian atau reset filter."
                      : "Hasil akan tampil setelah siswa mengirim jawabannya."}
                  </EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">
                        <Checkbox
                          checked={semuaTerpilih}
                          onCheckedChange={(checked) =>
                            toggleSemuaCetak(Boolean(checked))
                          }
                          aria-label="Pilih semua hasil yang ditampilkan"
                        />
                      </th>
                      <th className="px-3 py-3">#</th>
                      <th className="px-5 py-3">Nama</th>
                      <th className="px-5 py-3">Kelas</th>
                      <th className="px-5 py-3">Token</th>
                      <th className="px-5 py-3">Benar</th>
                      <th className="px-5 py-3">Pelanggaran</th>
                      <th className="px-5 py-3 text-right">Nilai</th>
                      <th className="px-5 py-3 text-right">Dikirim</th>
                      <th className="px-5 py-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {hasilTampil?.map((h, i) => (
                      <tr
                        key={h.id}
                        className={`transition-colors hover:bg-muted/40 ${pilihanCetak.has(h.id) ? "is-selected" : ""}`}
                      >
                        <td className="px-3 py-3.5">
                          <Checkbox
                            checked={pilihanCetak.has(h.id)}
                            onCheckedChange={(checked) =>
                              setPilihanCetak((sebelumnya) => {
                                const baru = new Set(sebelumnya);
                                if (checked) baru.add(h.id);
                                else baru.delete(h.id);
                                return baru;
                              })
                            }
                            aria-label={`Pilih hasil ${h.nama} untuk dicetak`}
                          />
                        </td>
                        <td className="px-3 py-3.5 font-bold text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-5 py-3.5 font-semibold">
                          {h.nama}
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            Percobaan {h.percobaan ?? 1}
                            {h.username ? ` · ${h.username}` : ""}
                          </span>
                          {h.izin_ulang && (
                            <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                              Izin oleh {h.izin_ulang.diberikan_oleh} pada{" "}
                              {new Date(
                                h.izin_ulang.diberikan_pada.replace(" ", "T"),
                              ).toLocaleString("id-ID")}
                              {" · digunakan "}
                              {h.izin_ulang.digunakan_pada
                                ? new Date(
                                    h.izin_ulang.digunakan_pada.replace(" ", "T"),
                                  ).toLocaleString("id-ID")
                                : "belum"}
                            </span>
                          )}
                          {h.izin_ulang_menunggu &&
                            h.percobaan === percobaanTerakhir.get(h.username ?? "") && (
                              <span className="mt-1 block text-xs font-semibold text-sky-700">
                                  Izin oleh {h.izin_ulang_pending?.diberikan_oleh}
                                  {h.izin_ulang_pending?.diberikan_pada
                                    ? ` pada ${new Date(
                                        h.izin_ulang_pending.diberikan_pada.replace(
                                          " ",
                                          "T",
                                        ),
                                      ).toLocaleString("id-ID")}`
                                    : ""}{" "}
                                  · belum digunakan
                                </span>
                            )}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {h.kelas}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                            {h.token || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {h.benar}/{h.total_soal}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge
                            variant={
                              h.total_pelanggaran > 0
                                ? "destructive"
                                : "secondary"
                            }
                            className="gap-1"
                          >
                            <ShieldAlert className="size-3.5" />
                            {h.total_pelanggaran}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="inline-flex items-center gap-1.5 font-bold">
                            <Trophy
                              className={`size-4 ${
                                h.nilai >= 75
                                  ? "text-emerald-600"
                                  : "text-muted-foreground"
                              }`}
                            />
                            {h.nilai}
                          </span>
                          {h.nilai_resmi ? (
                            <span className="mt-1 block text-[10px] font-bold text-emerald-700">
                              Nilai resmi tertinggi
                            </span>
                          ) : (
                            <span className="mt-1 block text-[10px] text-muted-foreground">
                              Nilai resmi: {h.nilai_tertinggi ?? h.nilai}
                            </span>
                          )}
                          {(h.menunggu ?? 0) > 0 && (
                            <span className="mt-1 block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              {h.menunggu} menunggu koreksi
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                          {h.timestamp
                            ? new Date(h.timestamp).toLocaleString("id-ID", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`gap-1.5 ${
                              (h.menunggu ?? 0) > 0
                                ? "border-amber-600 text-amber-700 hover:text-amber-800"
                                : ""
                            }`}
                            onClick={() => setKoreksi(h)}
                          >
                            <PenLine className="size-3.5" />
                            {(h.menunggu ?? 0) > 0 ? "Koreksi" : "Periksa"}
                          </Button>
                          {user?.role === "admin" &&
                            h.username &&
                            h.percobaan === percobaanTerakhir.get(h.username) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2 gap-1.5 border-sky-600/40 text-sky-700 hover:text-sky-800"
                                disabled={h.izin_ulang_menunggu}
                                onClick={() => setTargetUlang(h)}
                              >
                                <RotateCcw className="size-3.5" />
                                {h.izin_ulang_menunggu
                                  ? "Izin tersedia"
                                  : "Izinkan ujian ulang"}
                              </Button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Riwayat buka kunci tercatat di sheet "BukaKunci" saat pengawas
            membuka layar siswa dalam keadaan online.
          </p>
          <div ref={daftarCetakRef} className="print-only">
            <header className="print-header">
              <p>REKAP HASIL UJIAN</p>
              <h1>
                {ujian.find((u) => u.id === pilih)?.judul ?? "Hasil ujian"}
              </h1>
              <div>
                Kelas: {kelas === "semua" ? "Semua kelas" : kelas}
                {" · "}
                <span className="print-count-all">{jumlahTersaring} siswa</span>
                <span className="print-count-selected">
                  {hasilDipilih.length} siswa
                </span>
                {" · "}
                Dicetak {new Date().toLocaleString("id-ID")}
              </div>
            </header>
            <table className="print-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Nama siswa</th>
                  <th>Kelas</th>
                  <th>Benar</th>
                  <th>Nilai</th>
                  <th>Status koreksi</th>
                  <th>Pelanggaran</th>
                  <th>Waktu kirim</th>
                </tr>
              </thead>
              <tbody>
                {hasilTampil?.map((h, i) => (
                  <tr
                    key={h.id}
                    className={`print-row ${pilihanCetak.has(h.id) ? "is-selected" : ""}`}
                  >
                    <td>{i + 1}</td>
                    <td>{h.nama}</td>
                    <td>{h.kelas}</td>
                    <td>
                      {h.benar}/{h.total_soal}
                    </td>
                    <td>{h.nilai}</td>
                    <td>
                      {(h.menunggu ?? 0) > 0
                        ? `${h.menunggu} menunggu`
                        : "Selesai"}
                    </td>
                    <td>{h.total_pelanggaran}</td>
                    <td>{h.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="print-footer">
              <span className="print-average-all">
                Rata-rata nilai: {statistik?.rata ?? "—"}
              </span>
              <span className="print-average-selected">
                Rata-rata nilai dipilih: {rataDipilih ?? "—"}
              </span>
            </footer>
          </div>
        </>
      )}

      <style>{`
        .print-only { display: none; }
        @media print {
          @page { size: portrait; margin: 14mm; }
          body * { visibility: hidden !important; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            color: #111 !important;
            background: #fff !important;
            font: 10pt/1.4 Arial, sans-serif !important;
          }
          .print-selected-only .print-row:not(.is-selected) { display: none !important; }
          .print-selected-only .print-count-all, .print-selected-only .print-average-all { display: none !important; }
          .print-only:not(.print-selected-only) .print-count-selected, .print-only:not(.print-selected-only) .print-average-selected { display: none !important; }
          .print-header { margin-bottom: 18px; border-bottom: 2px solid #222; padding-bottom: 10px; }
          .print-header p { margin: 0 0 5px; font-size: 9pt; font-weight: 700; letter-spacing: .12em; }
          .print-header h1 { margin: 0 0 5px; font-size: 18pt; }
          .print-header div { font-size: 9pt; }
          .print-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
          .print-table th, .print-table td { border: 1px solid #777; padding: 6px; text-align: left; }
          .print-table th { background: #eee !important; font-weight: 700; }
          .print-footer { margin-top: 12px; text-align: right; font-weight: 700; }
        }
      `}</style>

      <DialogKoreksi
        target={koreksi}
        onTutup={() => setKoreksi(null)}
        onSelesai={() => setVersi((v) => v + 1)}
      />
      <Dialog
        open={dialogHitungUlang}
        onOpenChange={(open) => {
          if (!busyHitungUlang) setDialogHitungUlang(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hitung ulang hasil siswa?</DialogTitle>
            <DialogDescription>
              Semua jawaban tersimpan untuk ujian ini akan dinilai ulang
              memakai soal dan kunci yang ada sekarang. Skor koreksi essay
              dipertahankan. Jika soal atau kunci pernah diubah setelah ujian,
              nilai lama bisa berbeda dari nilai saat ujian berlangsung.
              Kiriman tanpa jawaban tersimpan atau dengan jumlah soal berbeda
              akan dilewati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busyHitungUlang}
              onClick={() => setDialogHitungUlang(false)}
            >
              Batal
            </Button>
            <Button
              disabled={busyHitungUlang}
              onClick={() => void hitungUlangNilai()}
            >
              {busyHitungUlang ? "Menghitung…" : "Ya, hitung ulang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={targetUlang !== null}
        onOpenChange={(open) => {
          if (!open && !busyUlang) setTargetUlang(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Izinkan ujian ulang?</DialogTitle>
            <DialogDescription>
              {targetUlang
                ? `${targetUlang.nama} (${targetUlang.username}) akan mendapat satu kesempatan tambahan untuk ${targetUlang.ujian_judul}. Semua percobaan tetap tersimpan dan nilai tertinggi menjadi nilai resmi.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busyUlang}
              onClick={() => setTargetUlang(null)}
            >
              Batal
            </Button>
            <Button disabled={busyUlang} onClick={() => void izinkanUlang()}>
              {busyUlang ? "Menyimpan…" : "Ya, izinkan sekali"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Layar koreksi manual */
function DialogKoreksi({
  target,
  onTutup,
  onSelesai,
}: {
  target: HasilGas | null;
  onTutup: () => void;
  onSelesai: () => void;
}) {
  const [soal, setSoal] = useState<SoalGas[] | null>(null);
  const [jawaban, setJawaban] = useState<
    Record<string, { teks: string; skor: number | null }>
  >({});
  const [skor, setSkor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    let hidup = true;
    setSoal(null);
    setJawaban({});
    setSkor({});
    Promise.all([
      gasCall<{ soal: SoalGas[] }>("getKoreksi", { ujian_id: target.ujian_id }),
      gasCall<{
        jawaban: Record<string, { teks: string; skor: number | null }>;
      }>("getJawabanKoreksi", { hasil_id: target.id }),
    ])
      .then(([k, j]) => {
        if (!hidup) return;
        setSoal(k.soal);
        setJawaban(j.jawaban);
        const awal: Record<string, string> = {};
        for (const [id, b] of Object.entries(j.jawaban)) {
          if (b.skor !== null && b.skor !== undefined)
            awal[id] = String(b.skor);
        }
        setSkor(awal);
      })
      .catch((err) => {
        if (!hidup) return;
        toast.error(
          err instanceof Error ? err.message : "Gagal memuat data koreksi.",
        );
        setSoal([]);
      });
    return () => {
      hidup = false;
    };
  }, [target]);

  const simpan = async () => {
    if (!target) return;
    const muatan: Record<string, number> = {};
    for (const s of soal ?? []) {
      if (!(s.id in jawaban)) continue;
      const v = Number(skor[s.id] ?? "");
      if (!Number.isFinite(v)) continue;
      muatan[s.id] = Math.max(0, Math.min(100, Math.round(v)));
    }
    if (Object.keys(muatan).length === 0) {
      toast.error(
        "Isi skor 0–100 minimal satu jawaban — siswa ini belum mengirim jawaban teks.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await gasCall<{ message?: string }>("simpanKoreksi", {
        hasil_id: target.id,
        skor: muatan,
      });
      toast.success(res.message ?? "Koreksi tersimpan — nilai dihitung ulang.");
      onSelesai();
      onTutup();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan koreksi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const adaJawaban = (soal ?? []).some((s) => s.id in jawaban);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onTutup()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Koreksi manual</DialogTitle>
          <DialogDescription>
            {target
              ? `${target.nama} (${target.kelas}) — ${target.ujian_judul}`
              : ""}
            . Beri skor 0–100 per jawaban; nilai akhir dihitung ulang otomatis
            saat disimpan.
          </DialogDescription>
        </DialogHeader>

        {soal === null ? (
          <Skeleton className="h-40 w-full" />
        ) : soal.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed border-border/70 py-10">
            <EmptyContent>
              <EmptyTitle>Tidak ada soal essay/uraian</EmptyTitle>
              <EmptyDescription>
                Ujian ini seluruhnya pilihan ganda — nilainya sudah final.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : !adaJawaban ? (
          <p className="rounded-2xl border border-border/70 bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Siswa ini belum mengirim jawaban teks untuk soal essay/uraian.
          </p>
        ) : (
          <ol className="space-y-4">
            {soal.map((s, i) => {
              const j = jawaban[s.id];
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-border/70 bg-background/60 p-4"
                >
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Soal {i + 1}
                    <Badge
                      variant="outline"
                      className="text-[10px] normal-case"
                    >
                      {(s.tipe ?? "") === "uraian" ? "Uraian" : "Essay"}
                    </Badge>
                    {j?.skor !== null && j?.skor !== undefined && (
                      <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        sudah dinilai
                      </span>
                    )}
                  </p>
                  <div
                    className="mt-1.5 text-sm font-semibold leading-6"
                    dangerouslySetInnerHTML={{ __html: soalHTML(s.pertanyaan) }}
                  />

                  {s.bacaan && (
                    <div className="mt-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                        <BookOpen className="size-3" /> Bacaan
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">
                        {s.bacaan}
                      </p>
                    </div>
                  )}

                  {s.kunci_teks && (
                    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        <PenLine className="size-3" /> Kunci / rubrik
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">
                        {s.kunci_teks}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 grid gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Jawaban siswa
                    </p>
                    {j ? (
                      <p className="whitespace-pre-wrap rounded-xl border border-border/70 bg-card px-3 py-2.5 text-sm leading-6">
                        {j.teks}
                      </p>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                        Tidak dijawab.
                      </p>
                    )}
                  </div>

                  {j && (
                    <div className="mt-3 flex items-center gap-3">
                      <label
                        htmlFor={`skor-${s.id}`}
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        Skor (0–100)
                      </label>
                      <Input
                        id={`skor-${s.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={skor[s.id] ?? ""}
                        onChange={(e) =>
                          setSkor((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                        className="w-24 text-right font-bold"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onTutup} disabled={busy}>
            Batal
          </Button>
          <Button
            className="gap-2"
            onClick={simpan}
            disabled={busy || soal === null}
          >
            <CheckCheck className="size-4" />
            {busy ? "Menyimpan…" : "Simpan & hitung ulang nilai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
