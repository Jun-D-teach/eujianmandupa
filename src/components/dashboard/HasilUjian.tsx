import { useEffect, useMemo, useState } from "react";
import { gasCall, type HasilGas, type SoalGas, type UjianGas } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
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
  Download,
  Lock,
  PenLine,
  RefreshCw,
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
  nilai: number;
  benar: number;
  total_soal: number;
  total_pelanggaran: number;
  jawaban: Record<string, string>;
};

type SoalLaporan = { id: string; nomor: number; tipe: string };

/** Konfigurasi warna grafik distribusi nilai. */
const chartConfig = {
  jumlah: { label: "Jumlah siswa", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Rekap hasil per ujian (guru & admin). */
export function HasilUjian() {
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [pilih, setPilih] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilGas[] | null>(null);
  const [versi, setVersi] = useState(0);
  const [koreksi, setKoreksi] = useState<HasilGas | null>(null);
  /** Filter kelas untuk laporan (tabel, ringkasan, grafik & ekspor Excel). */
  const [kelas, setKelas] = useState("semua");
  const [busyEkspor, setBusyEkspor] = useState(false);

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
      return;
    }
    let hidup = true;
    setHasil(null);
    gasCall<{ hasil: HasilGas[] }>("getHasil", { ujian_id: pilih })
      .then((res) => {
        if (hidup) setHasil(res.hasil);
      })
      .catch(() => {
        if (hidup) setHasil([]);
      });
    return () => {
      hidup = false;
    };
  }, [pilih, versi]);

  // Kelas yang muncul pada ujian terpilih (bahan filter).
  const daftarKelas = useMemo(() => {
    const set = new Set<string>();
    for (const h of hasil ?? []) if (h.kelas) set.add(h.kelas);
    return [...set].sort();
  }, [hasil]);

  // Baris yang lolos filter kelas — dipakai tabel, ringkasan, grafik & ekspor.
  const hasilTerfilter = useMemo(() => {
    if (hasil === null) return null;
    return kelas === "semua" ? hasil : hasil.filter((h) => h.kelas === kelas);
  }, [hasil, kelas]);

  // Statistik ringkas laporan (mengikuti filter kelas).
  const statistik = useMemo(() => {
    const rows = hasilTerfilter ?? [];
    if (rows.length === 0) return null;
    const nilai = rows.map((h) => h.nilai);
    return {
      peserta: rows.length,
      rata: Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length),
      tertinggi: Math.max(...nilai),
      terendah: Math.min(...nilai),
      lulus: nilai.filter((n) => n >= 75).length,
    };
  }, [hasilTerfilter]);

  // Distribusi nilai per rentang — bahan grafik batang.
  const distribusi = useMemo(() => {
    const rentang = [
      { label: "0–59", bawah: 0, batas: 59 },
      { label: "60–69", bawah: 60, batas: 69 },
      { label: "70–79", bawah: 70, batas: 79 },
      { label: "80–89", bawah: 80, batas: 89 },
      { label: "90–100", bawah: 90, batas: 100 },
    ];
    const rows = hasilTerfilter ?? [];
    return rentang.map((r) => ({
      label: r.label,
      jumlah: rows.filter((h) => h.nilai >= r.bawah && h.nilai <= r.batas).length,
    }));
  }, [hasilTerfilter]);

  /** Unduh laporan Excel: Waktu Kirim | NAMA | NISN | KELAS | jawaban per soal. */
  const unduhExcel = async () => {
    if (!pilih || busyEkspor) return;
    setBusyEkspor(true);
    try {
      const lap = await gasCall<{ soal: SoalLaporan[]; baris: BarisLaporan[] }>(
        "getLaporan",
        { ujian_id: pilih },
      );
      const baris = lap.baris.filter(
        (b) => kelas === "semua" || b.kelas === kelas,
      );
      if (baris.length === 0) {
        toast.error("Tidak ada jawaban untuk filter kelas ini.");
        return;
      }
      const XLSX = await import("xlsx");
      const waktu = (t: string) => {
        const d = new Date(t.replace(" ", "T"));
        return Number.isNaN(d.getTime())
          ? t
          : d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
      };
      const header = [
        "Waktu Kirim Jawaban",
        "NAMA",
        "NISN",
        "KELAS",
        ...lap.soal.map((s) => `Soal ${s.nomor}`),
      ];
      const isi = baris.map((b) => [
        waktu(b.timestamp),
        b.nama,
        b.nisn,
        b.kelas,
        ...lap.soal.map((s) => b.jawaban[s.id] ?? ""),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...isi]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Hasil");
      const bersihkan = (v: string) =>
        v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const judul = (ujian ?? []).find((u) => u.id === pilih)?.judul ?? "ujian";
      const namaFile =
        `hasil-${bersihkan(judul)}` +
        (kelas === "semua" ? "" : `-${bersihkan(kelas)}`) +
        ".xlsx";
      XLSX.writeFile(wb, namaFile);
      toast.success(`${baris.length} baris diunduh ke ${namaFile}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunduh laporan.");
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
          <h1 className="text-2xl font-extrabold tracking-tight">Hasil ujian</h1>
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
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  pilih === u.id
                    ? "bg-ink text-white"
                    : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.judul}
                <span className="ml-2 text-xs opacity-70">{u.jumlah_soal} soal</span>
              </button>
            ))}
          </div>

          {/* Filter kelas + unduh laporan Excel */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kelas} onValueChange={setKelas}>
              <SelectTrigger className="w-52">
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
            <Button
              variant="outline"
              className="gap-2"
              disabled={busyEkspor || hasilTerfilter === null || hasilTerfilter.length === 0}
              onClick={() => void unduhExcel()}
            >
              <Download className="size-4" />
              {busyEkspor ? "Menyiapkan…" : "Unduh Excel"}
            </Button>
          </div>

          {/* Ringkasan + grafik distribusi nilai (mengikuti filter kelas) */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card className="border-border/70 p-5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Trophy className="size-3.5" /> Ringkasan{" "}
                {kelas === "semua" ? "semua kelas" : `kelas ${kelas}`}
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
                  <ChartContainer config={chartConfig} className="h-full w-full">
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
                    {kelas === "semua"
                      ? "Belum ada jawaban masuk"
                      : `Belum ada jawaban dari kelas ${kelas}`}
                  </EmptyTitle>
                  <EmptyDescription>
                    {kelas === "semua"
                      ? "Hasil akan tampil setelah siswa mengirim jawabannya."
                      : 'Pilih "Semua kelas" bila jawaban kelas lain sudah masuk.'}
                  </EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">#</th>
                      <th className="px-5 py-3">Nama</th>
                      <th className="px-5 py-3">Kelas</th>
                      <th className="px-5 py-3">Token</th>
                      <th className="px-5 py-3">Benar</th>
                      <th className="px-5 py-3">Pelanggaran</th>
                      <th className="px-5 py-3 text-right">Nilai</th>
                      <th className="px-5 py-3 text-right">Dikirim</th>
                      <th className="px-5 py-3 text-right">Koreksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {hasilTerfilter?.map((h, i) => (
                      <tr key={h.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-3.5 font-bold text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-5 py-3.5 font-semibold">{h.nama}</td>
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
                              h.total_pelanggaran > 0 ? "destructive" : "secondary"
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
        </>
      )}

      <DialogKoreksi
        target={koreksi}
        onTutup={() => setKoreksi(null)}
        onSelesai={() => setVersi((v) => v + 1)}
      />
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
          if (b.skor !== null && b.skor !== undefined) awal[id] = String(b.skor);
        }
        setSkor(awal);
      })
      .catch((err) => {
        if (!hidup) return;
        toast.error(err instanceof Error ? err.message : "Gagal memuat data koreksi.");
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
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan koreksi.");
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
                    <Badge variant="outline" className="text-[10px] normal-case">
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
                          setSkor((prev) => ({ ...prev, [s.id]: e.target.value }))
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
          <Button className="gap-2" onClick={simpan} disabled={busy || soal === null}>
            <CheckCheck className="size-4" />
            {busy ? "Menyimpan…" : "Simpan & hitung ulang nilai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}