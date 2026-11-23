import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  ClipboardList,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { gasCall, type RuangGas, type UjianGas } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type RuangLaporan = RuangGas & {
  jumlah_ditempatkan: number;
  jumlah_seharusnya: number;
  jumlah_per_kelas: Record<string, number>;
};

type LaporanMengawas = {
  id: string;
  ujian_id: string;
  ruang_id: string;
  kelas: string;
  guru_username: string;
  guru_nama: string;
  guru_nip: string;
  ujian_judul: string;
  mapel: string;
  deskripsi: string;
  tanggal: string;
  ruang: string;
  jumlah_seharusnya: number;
  jumlah_hadir: number;
  jumlah_tidak_hadir: number;
  jam_mulai: string;
  jam_selesai: string;
  catatan: string;
  ttd_data: string | null;
};

type DataLaporan = {
  ujian: UjianGas[];
  ruang: RuangLaporan[];
  laporan: LaporanMengawas[];
  guru: { nama: string; nip: string };
};

type FormLaporan = {
  id: string;
  ujian_id: string;
  ruang_id: string;
  kelas: string;
  tanggal: string;
  jumlah_hadir: string;
  jumlah_tidak_hadir: string;
  jam_mulai: string;
  jam_selesai: string;
  catatan: string;
  ttd_data: string;
};

const kosong = (): FormLaporan => ({
  id: "",
  ujian_id: "",
  ruang_id: "",
  kelas: "",
  tanggal: (() => {
    const hariIni = new Date();
    return `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, "0")}-${String(hariIni.getDate()).padStart(2, "0")}`;
  })(),
  jumlah_hadir: "",
  jumlah_tidak_hadir: "",
  jam_mulai: "",
  jam_selesai: "",
  catatan: "",
  ttd_data: "",
});

function TandaTangan({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sedangMenggambar = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;

    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  const posisi = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const mulai = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.setPointerCapture(event.pointerId);
    const point = posisi(event);
    sedangMenggambar.current = true;
    context.fillStyle = "#111827";
    context.beginPath();
    context.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const gambar = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!sedangMenggambar.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = posisi(event);
    context.strokeStyle = "#111827";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const selesai = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!sedangMenggambar.current) return;
    sedangMenggambar.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={900}
        height={240}
        aria-label="Area tanda tangan pengawas"
        className="h-36 w-full touch-none rounded-md border border-input bg-white"
        onPointerDown={mulai}
        onPointerMove={gambar}
        onPointerUp={selesai}
        onPointerCancel={selesai}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Bubuhkan tanda tangan dengan jari, stylus, atau mouse.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange("")}>
          Hapus tanda tangan
        </Button>
      </div>
    </div>
  );
}

function waktuIndonesia(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function tanggalIndonesia(date: string): {
  hari: string;
  tanggal: string;
  bulan: string;
  tahun: string;
} {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { hari: "", tanggal: date, bulan: "", tahun: "" };
  }
  return {
    hari: parsed.toLocaleDateString("id-ID", { weekday: "long" }),
    tanggal: parsed.toLocaleDateString("id-ID", { day: "numeric" }),
    bulan: parsed.toLocaleDateString("id-ID", { month: "long" }),
    tahun: parsed.toLocaleDateString("id-ID", { year: "numeric" }),
  };
}

export function LaporanMengawas() {
  const { user } = useAuth();
  const [data, setData] = useState<DataLaporan | null>(null);
  const [form, setForm] = useState<FormLaporan>(kosong);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printTargets, setPrintTargets] = useState<LaporanMengawas[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [cari, setCari] = useState("");
  const [filterGuru, setFilterGuru] = useState("semua");
  const [filterMapel, setFilterMapel] = useState("semua");
  const [filterRuang, setFilterRuang] = useState("semua");
  const [filterKelas, setFilterKelas] = useState("semua");
  const [tanggalDari, setTanggalDari] = useState("");
  const [tanggalSampai, setTanggalSampai] = useState("");
  const [pilihanCetak, setPilihanCetak] = useState<Set<string>>(new Set());
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    let active = true;
    gasCall<DataLaporan>("getLaporanMengawas")
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        const message =
          cause instanceof Error ? cause.message : "Gagal memuat laporan mengawas.";
        setError(
          message.toLocaleLowerCase("id").includes(
            "action tidak dikenal: getlaporanmengawas",
          )
            ? "API di hosting masih versi lama. Upload ulang api/index.php terbaru ke folder api aplikasi, lalu muat ulang halaman."
            : message,
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (printTargets.length === 0) return;
    const timer = window.setTimeout(() => window.print(), 100);
    const selesai = () => setPrintTargets([]);
    window.addEventListener("afterprint", selesai);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", selesai);
    };
  }, [printTargets]);

  const ujianDipilih = useMemo(
    () => data?.ujian.find((ujian) => ujian.id === form.ujian_id),
    [data?.ujian, form.ujian_id],
  );
  const ruangDipilih = useMemo(
    () => data?.ruang.find((ruang) => ruang.id === form.ruang_id),
    [data?.ruang, form.ruang_id],
  );
  const kelasDipilih = form.kelas
    ? ruangDipilih?.jumlah_per_kelas[form.kelas]
    : undefined;
  const daftarGuru = useMemo(
    () => {
      const guru = new Map<
        string,
        { username: string; nama: string; nip: string }
      >();
      for (const report of data?.laporan ?? []) {
        guru.set(report.guru_username, {
          username: report.guru_username,
          nama: report.guru_nama,
          nip: report.guru_nip,
        });
      }
      return [...guru.values()].sort((a, b) =>
        a.nama.localeCompare(b.nama, "id"),
      );
    },
    [data?.laporan],
  );
  const daftarMapel = useMemo(
    () =>
      [...new Set((data?.laporan ?? []).map((report) => report.mapel))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "id")),
    [data?.laporan],
  );
  const daftarRuang = useMemo(
    () =>
      [...new Set((data?.laporan ?? []).map((report) => report.ruang))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "id")),
    [data?.laporan],
  );
  const daftarKelas = useMemo(
    () =>
      [...new Set((data?.laporan ?? []).map((report) => report.kelas))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "id")),
    [data?.laporan],
  );
  const laporanTampil = useMemo(() => {
    const query = cari.trim().toLocaleLowerCase("id");
    return (data?.laporan ?? []).filter((report) => {
      const cocokCari =
        !query ||
        [
          report.guru_nama,
          report.guru_nip,
          report.mapel,
          report.ujian_judul,
          report.deskripsi,
          report.ruang,
          report.catatan,
        ].some((value) => value?.toLocaleLowerCase("id").includes(query));
      const cocokGuru =
        filterGuru === "semua" || report.guru_username === filterGuru;
      const cocokMapel =
        filterMapel === "semua" || report.mapel === filterMapel;
      const cocokRuang = filterRuang === "semua" || report.ruang === filterRuang;
      const cocokKelas = filterKelas === "semua" || report.kelas === filterKelas;
      const tanggal = report.tanggal.slice(0, 10);
      const cocokDari = !tanggalDari || tanggal >= tanggalDari;
      const cocokSampai = !tanggalSampai || tanggal <= tanggalSampai;
      return (
        cocokCari &&
        cocokGuru &&
        cocokMapel &&
        cocokRuang &&
        cocokKelas &&
        cocokDari &&
        cocokSampai
      );
    });
  }, [
    data?.laporan,
    cari,
    filterGuru,
    filterMapel,
    filterRuang,
    filterKelas,
    tanggalDari,
    tanggalSampai,
  ]);
  const hasilDipilih = laporanTampil.filter((report) =>
    pilihanCetak.has(report.id),
  );
  const semuaTerpilih =
    laporanTampil.length > 0 &&
    laporanTampil.every((report) => pilihanCetak.has(report.id));

  const ubah = (field: keyof FormLaporan, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const simpan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!form.ttd_data) {
      toast.error("Bubuhkan tanda tangan pengawas sebelum menyimpan BA.");
      return;
    }
    setBusy(true);
    try {
      const result = await gasCall<{ message?: string }>(
        "simpanLaporanMengawas",
        {
          ...form,
          jumlah_hadir: Number(form.jumlah_hadir),
          jumlah_tidak_hadir: Number(form.jumlah_tidak_hadir),
        },
      );
      toast.success(result.message ?? "Laporan mengawas disimpan.");
      setForm({
        ...kosong(),
        ujian_id: form.ujian_id,
        ruang_id: form.ruang_id,
        tanggal: form.tanggal,
        jam_mulai: form.jam_mulai,
        jam_selesai: form.jam_selesai,
      });
      setReloadKey((key) => key + 1);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Gagal menyimpan laporan.",
      );
    } finally {
      setBusy(false);
    }
  };

  const edit = (report: LaporanMengawas) => {
    setForm({
      id: report.id,
      ujian_id: report.ujian_id,
      ruang_id: report.ruang_id,
      kelas: report.kelas,
      tanggal: report.tanggal.slice(0, 10),
      jumlah_hadir: String(report.jumlah_hadir),
      jumlah_tidak_hadir: String(report.jumlah_tidak_hadir),
      jam_mulai: report.jam_mulai.slice(0, 5),
      jam_selesai: report.jam_selesai.slice(0, 5),
      catatan: report.catatan ?? "",
      ttd_data: report.ttd_data ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hapus = async (report: LaporanMengawas) => {
    if (
      !window.confirm(
        `Hapus laporan mengawas ${report.mapel} tanggal ${waktuIndonesia(report.tanggal)}?`,
      )
    ) {
      return;
    }
    try {
      const result = await gasCall<{ message?: string }>(
        "hapusLaporanMengawas",
        { id: report.id },
      );
      toast.success(result.message ?? "Laporan dihapus.");
      if (form.id === report.id) setForm(kosong());
      setReloadKey((key) => key + 1);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Gagal menghapus laporan.");
    }
  };

  const cetak = (reports: LaporanMengawas[]) => {
    if (reports.length === 0) {
      toast.error("Tidak ada laporan yang dipilih untuk dicetak.");
      return;
    }
    setPrintTargets(reports);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <p className="text-sm text-destructive">
            {error ?? "Data laporan mengawas tidak tersedia."}
          </p>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="mr-2 size-4" /> Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Laporan mengawas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Pantau laporan berita acara dari seluruh guru, saring sesuai kebutuhan, lalu cetak."
              : "Isi berita acara setiap kali selesai mengawas. Data dapat diedit, dicetak, dan dilihat kembali kapan saja."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setReloadKey((key) => key + 1)}
        >
          <RefreshCw className="mr-2 size-4" /> Segarkan
        </Button>
      </div>

      {!isAdmin && <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="size-5 text-emerald-600" />
            {form.id ? "Edit laporan mengawas" : "Isi laporan mengawas"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.ruang.length === 0 ? (
            <p className="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-800">
              Belum ada daftar ruang. Minta admin membuat ruang di Pengaturan
              sebelum mengisi laporan mengawas.
            </p>
          ) : data.ujian.length === 0 ? (
            <p className="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-800">
              Belum ada ujian yang ditugaskan kepada akun guru ini. Minta admin
              menetapkan guru penanggung jawab pada Kelola Ujian.
            </p>
          ) : (
            <form className="space-y-5" onSubmit={(event) => void simpan(event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Ujian / mata pelajaran
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    value={form.ujian_id}
                    onChange={(event) => ubah("ujian_id", event.target.value)}
                  >
                    <option value="">Pilih ujian yang diawasi</option>
                    {data.ujian.map((ujian) => (
                      <option key={ujian.id} value={ujian.id}>
                        {ujian.mapel || ujian.judul}
                        {ujian.tgl_mulai
                          ? ` · ${ujian.tgl_mulai.slice(0, 10)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Tanggal ujian
                  <Input
                    required
                    type="date"
                    value={form.tanggal}
                    onChange={(event) => ubah("tanggal", event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Ruang
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    value={form.ruang_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        ruang_id: event.target.value,
                        kelas: "",
                      }))
                    }
                  >
                    <option value="">Pilih ruang</option>
                    {data.ruang.map((ruang) => (
                      <option key={ruang.id} value={ruang.id}>
                        {ruang.nama} · {ruang.jumlah_seharusnya} peserta
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Kelas / tingkat dalam ruang
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    required
                    disabled={!ruangDipilih}
                    value={form.kelas}
                    onChange={(event) => ubah("kelas", event.target.value)}
                  >
                    <option value="">
                      {ruangDipilih ? "Pilih kelas" : "Pilih ruang terlebih dahulu"}
                    </option>
                    {Object.entries(ruangDipilih?.komposisi ?? {}).map(
                      ([tingkat, jumlah]) => (
                        <option key={tingkat} value={tingkat}>
                          Kelas {tingkat} ·{" "}
                          {ruangDipilih?.jumlah_per_kelas[tingkat] ?? jumlah} peserta
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                  <p className="text-muted-foreground">Data otomatis</p>
                  <p className="mt-1 font-semibold">
                    Pengawas: {data.guru.nama}
                  </p>
                  <p className="text-muted-foreground">
                    NIP: {data.guru.nip || user?.username}
                  </p>
                  <p className="text-muted-foreground">
                    Peserta seharusnya untuk kelas {form.kelas || "—"}:{" "}
                    <strong className="text-foreground">
                      {kelasDipilih ?? "—"} orang
                    </strong>
                  </p>
                  {ruangDipilih && (
                    <p className="text-xs text-muted-foreground">
                      Sesuai komposisi kelas yang diatur admin.
                      {ruangDipilih.jumlah_ditempatkan > 0
                        ? ` ${ruangDipilih.jumlah_ditempatkan} siswa sudah ditempatkan di ruang ini.`
                        : " Belum ada penempatan siswa di ruang ini."}
                    </p>
                  )}
                </div>
                <label className="space-y-2 text-sm font-medium">
                  Jumlah hadir
                  <Input
                    required
                    min={0}
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={form.jumlah_hadir}
                    onChange={(event) => ubah("jumlah_hadir", event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Jumlah tidak hadir
                  <Input
                    required
                    min={0}
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={form.jumlah_tidak_hadir}
                    onChange={(event) =>
                      ubah("jumlah_tidak_hadir", event.target.value)
                    }
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Jam mulai
                  <Input
                    required
                    type="time"
                    value={form.jam_mulai}
                    onChange={(event) => ubah("jam_mulai", event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Jam selesai
                  <Input
                    required
                    type="time"
                    value={form.jam_selesai}
                    onChange={(event) => ubah("jam_selesai", event.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-medium">
                Catatan selama pelaksanaan ujian
                <textarea
                  className="flex min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={5000}
                  placeholder="Tuliskan kondisi pelaksanaan, kendala, atau catatan lain."
                  value={form.catatan}
                  onChange={(event) => ubah("catatan", event.target.value)}
                />
              </label>
              <div className="space-y-2 text-sm font-medium">
                Tanda tangan pengawas
                <TandaTangan
                  value={form.ttd_data}
                  onChange={(value) => ubah("ttd_data", value)}
                />
              </div>
              {ujianDipilih && (
                <p className="text-xs text-muted-foreground">
                  Nama kegiatan pada berita acara mengikuti deskripsi ujian di
                  Kelola Ujian.{" "}
                  {ujianDipilih.deskripsi
                    ? `Saat ini: “${ujianDipilih.deskripsi}”.`
                    : `Deskripsi kosong, judul “${ujianDipilih.judul}” akan digunakan.`}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  <Save className="mr-2 size-4" />
                  {busy ? "Menyimpan…" : form.id ? "Simpan perubahan" : "Simpan laporan"}
                </Button>
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm(kosong())}
                  >
                    Batal edit
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>}

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Filter laporan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={cari}
              onChange={(event) => setCari(event.target.value)}
              placeholder="Cari guru, mapel, ruang, catatan…"
              aria-label="Cari laporan mengawas"
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterGuru}
              onChange={(event) => setFilterGuru(event.target.value)}
              aria-label="Filter guru"
            >
              <option value="semua">Semua guru</option>
              {daftarGuru.map((guru) => (
                <option key={guru.username} value={guru.username}>
                  {guru.nama}{guru.nip ? ` · ${guru.nip}` : ""}
                </option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterMapel}
              onChange={(event) => setFilterMapel(event.target.value)}
              aria-label="Filter mata pelajaran"
            >
              <option value="semua">Semua mata pelajaran</option>
              {daftarMapel.map((mapel) => (
                <option key={mapel} value={mapel}>{mapel}</option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterRuang}
              onChange={(event) => setFilterRuang(event.target.value)}
              aria-label="Filter ruang"
            >
              <option value="semua">Semua ruang</option>
              {daftarRuang.map((ruang) => (
                <option key={ruang} value={ruang}>{ruang}</option>
              ))}
            </select>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterKelas}
              onChange={(event) => setFilterKelas(event.target.value)}
              aria-label="Filter kelas"
            >
              <option value="semua">Semua kelas</option>
              {daftarKelas.map((kelas) => (
                <option key={kelas} value={kelas}>Kelas {kelas}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={tanggalDari}
                onChange={(event) => setTanggalDari(event.target.value)}
                aria-label="Tanggal mulai filter"
                title="Tanggal mulai"
              />
              <span className="text-xs text-muted-foreground">s.d.</span>
              <Input
                type="date"
                value={tanggalSampai}
                onChange={(event) => setTanggalSampai(event.target.value)}
                aria-label="Tanggal akhir filter"
                title="Tanggal akhir"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <p className="text-sm text-muted-foreground">
              Menampilkan <strong className="text-foreground">{laporanTampil.length}</strong>{" "}
              dari {data.laporan.length} laporan
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCari("");
                setFilterGuru("semua");
                setFilterMapel("semua");
                setFilterRuang("semua");
                setFilterKelas("semua");
                setTanggalDari("");
                setTanggalSampai("");
              }}
            >
              Reset filter
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="size-5 text-emerald-600" />
            {isAdmin ? "Laporan dari seluruh guru" : "Laporan tersimpan"}
          </CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="secondary">{laporanTampil.length} laporan</Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={laporanTampil.length === 0}
              onClick={() => cetak(laporanTampil)}
            >
              <Printer className="mr-2 size-4" /> Cetak hasil filter
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={hasilDipilih.length === 0}
              onClick={() => cetak(hasilDipilih)}
            >
              <Printer className="mr-2 size-4" />
              Cetak dipilih ({hasilDipilih.length})
            </Button>
          </div>
        </CardHeader>
        {data.laporan.length === 0 ? (
          <CardContent className="pb-6 text-sm text-muted-foreground">
            Belum ada laporan mengawas tersimpan. Isi formulir di atas untuk
            membuat berita acara pertama.
          </CardContent>
        ) : laporanTampil.length === 0 ? (
          <CardContent className="pb-6 text-sm text-muted-foreground">
            Tidak ada laporan yang cocok dengan filter. Ubah atau reset filter.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <Checkbox
                      checked={semuaTerpilih}
                      onCheckedChange={(checked) =>
                        setPilihanCetak((previous) => {
                          const next = new Set(previous);
                          for (const report of laporanTampil) {
                            if (checked) next.add(report.id);
                            else next.delete(report.id);
                          }
                          return next;
                        })
                      }
                      aria-label="Pilih semua laporan yang tampil"
                    />
                  </th>
                  <th className="px-4 py-3">Tanggal / ujian</th>
                  <th className="px-4 py-3">Pengawas</th>
                  <th className="px-4 py-3">Ruang</th>
                  <th className="px-4 py-3">Kehadiran</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Catatan</th>
                  <th className="px-4 py-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {laporanTampil.map((report) => (
                  <tr key={report.id} className="align-top hover:bg-muted/30">
                    <td className="px-4 py-4">
                      <Checkbox
                        checked={pilihanCetak.has(report.id)}
                        onCheckedChange={(checked) =>
                          setPilihanCetak((previous) => {
                            const next = new Set(previous);
                            if (checked) next.add(report.id);
                            else next.delete(report.id);
                            return next;
                          })
                        }
                        aria-label={`Pilih laporan ${report.mapel} untuk dicetak`}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold">{waktuIndonesia(report.tanggal)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {report.mapel || report.ujian_judul}
                      </p>
                      {report.kelas && (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          Kelas {report.kelas}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {report.deskripsi || report.ujian_judul}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{report.guru_nama}</p>
                      <p className="text-xs text-muted-foreground">
                        NIP. {report.guru_nip}
                      </p>
                    </td>
                    <td className="px-4 py-4">{report.ruang}</td>
                    <td className="px-4 py-4">
                      <p>{report.jumlah_hadir} hadir</p>
                      <p className="text-muted-foreground">
                        {report.jumlah_tidak_hadir} tidak hadir dari{" "}
                        {report.jumlah_seharusnya}
                      </p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {report.jam_mulai.slice(0, 5)}–{report.jam_selesai.slice(0, 5)}
                    </td>
                    <td className="max-w-64 px-4 py-4">
                      {report.catatan ? (
                        <details>
                          <summary className="cursor-pointer text-emerald-700">
                            Lihat catatan
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                            {report.catatan}
                          </p>
                        </details>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          title="Cetak berita acara"
                          aria-label={`Cetak laporan ${report.mapel}`}
                          onClick={() => cetak([report])}
                        >
                          <Printer className="size-4" />
                        </Button>
                        {!isAdmin && (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Edit laporan"
                              aria-label={`Edit laporan ${report.mapel}`}
                              onClick={() => edit(report)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Hapus laporan"
                              aria-label={`Hapus laporan ${report.mapel}`}
                              className="text-destructive hover:text-destructive"
                              onClick={() => void hapus(report)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {printTargets.length > 0 && (
        <div className="laporan-cetak" aria-hidden="true">
          {printTargets.map((report) => {
            const tanggal = tanggalIndonesia(report.tanggal);
            return (
              <section className="laporan-cetak__lembar" key={report.id}>
                <div className="laporan-cetak__isi">
                  <h1>BERITA ACARA</h1>
                  <h2>
                    PELAKSANAAN{" "}
                    {(report.deskripsi || report.ujian_judul).toLocaleUpperCase(
                      "id-ID",
                    )}
                  </h2>
                  <p className="laporan-cetak__pembuka">
                    Pada hari ini {tanggal.hari} tanggal {tanggal.tanggal} bulan{" "}
                    {tanggal.bulan} tahun {tanggal.tahun}, telah diselenggarakan{" "}
                    {report.deskripsi || report.ujian_judul} untuk Mata
                    Pelajaran {report.mapel || report.ujian_judul} kelas{" "}
                    {report.kelas} dari pukul{" "}
                    {report.jam_mulai.slice(0, 5)} sampai dengan pukul{" "}
                    {report.jam_selesai.slice(0, 5)}.
                  </p>
                  <div className="laporan-cetak__bagian">
                    <span className="laporan-cetak__nomor">1.</span>
                    <div className="laporan-cetak__identitas">
                      <div className="laporan-cetak__baris">
                        <span>Madrasah Penyelenggara</span>
                        <span>:</span>
                        <span>MAN 2 PALEMBANG</span>
                      </div>
                      <div className="laporan-cetak__baris">
                        <span>Alamat</span>
                        <span>:</span>
                        <span>
                          Komplek UIN Raden Fatah, Jl. Prof. K. H. Zainal Abidin
                          Fikri, Pahlawan, Kec. Kemuning, Kelurahan Pahlawan
                        </span>
                      </div>
                      <div className="laporan-cetak__baris">
                        <span>Ruang</span>
                        <span>:</span>
                        <span>{report.ruang}</span>
                      </div>
                      <div className="laporan-cetak__baris">
                        <span>Kelas / tingkat</span>
                        <span>:</span>
                        <span>{report.kelas}</span>
                      </div>
                      <div className="laporan-cetak__baris">
                        <span>Jumlah peserta seharusnya</span>
                        <span>:</span>
                        <span>{report.jumlah_seharusnya} orang</span>
                      </div>
                      <div className="laporan-cetak__baris">
                        <span>Jumlah hadir (ikut asesmen)</span>
                        <span>:</span>
                        <span>{report.jumlah_hadir} orang</span>
                      </div>
                      <div className="laporan-cetak__baris">
                        <span>Jumlah tidak hadir</span>
                        <span>:</span>
                        <span>{report.jumlah_tidak_hadir} orang</span>
                      </div>
                    </div>
                  </div>
                  <div className="laporan-cetak__bagian laporan-cetak__bagian-catatan">
                    <span className="laporan-cetak__nomor">2.</span>
                    <div>
                      <h3>Catatan selama pelaksanaan ujian:</h3>
                      <div className="laporan-cetak__catatan">
                        {report.catatan ||
                          "............................................................................................"}
                      </div>
                    </div>
                  </div>
                  <p className="laporan-cetak__penutup">
                    Berita Acara ini dibuat dengan sesungguhnya untuk dapat
                    dipergunakan sebagaimana mestinya.
                  </p>
                  <div className="laporan-cetak__ttd">
                    <p>Pengawas</p>
                    <div className="laporan-cetak__ruang-ttd">
                      {report.ttd_data && (
                        <img src={report.ttd_data} alt="Tanda tangan pengawas" />
                      )}
                    </div>
                    <p>({report.guru_nama || report.guru_username})</p>
                    <p>NIP. {report.guru_nip}</p>
                  </div>
                  <p className="laporan-cetak__catatan-kaki">
                    Catatan: 1 (satu) lembar untuk Madrasah
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <style>{`
        .laporan-cetak { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 20mm 22mm; }
          body * { visibility: hidden !important; }
          .laporan-cetak, .laporan-cetak * { visibility: visible !important; }
          .laporan-cetak {
            display: block !important;
            position: absolute;
            inset: 0;
            width: 100%;
            color: #111;
            background: #fff;
            font-family: "Times New Roman", serif;
            font-size: 12pt;
          }
          .laporan-cetak__isi { width: 100%; }
          .laporan-cetak__lembar + .laporan-cetak__lembar { break-before: page; page-break-before: always; }
          .laporan-cetak h1, .laporan-cetak h2 { text-align: center; }
          .laporan-cetak h1 { margin: 0 0 12pt; font-size: 15pt; }
          .laporan-cetak h2 { margin: 0 auto 24pt; max-width: 150mm; font-size: 13pt; }
          .laporan-cetak__pembuka { margin: 0 0 16pt; line-height: 1.6; text-align: justify; text-indent: 10mm; }
          .laporan-cetak__bagian { display: grid; grid-template-columns: 8mm minmax(0, 1fr); margin-left: 8mm; }
          .laporan-cetak__nomor { line-height: 1.7; }
          .laporan-cetak__identitas { min-width: 0; line-height: 1.7; }
          .laporan-cetak__baris { display: grid; grid-template-columns: 50mm 4mm minmax(0, 1fr); }
          .laporan-cetak__baris > span:last-child { min-width: 0; }
          .laporan-cetak__bagian-catatan { margin-top: 18pt; }
          .laporan-cetak h3 { margin: 0 0 8pt; font-size: 12pt; line-height: 1.7; }
          .laporan-cetak__catatan { min-height: 42mm; white-space: pre-wrap; line-height: 1.6; }
          .laporan-cetak__penutup { margin-top: 18pt; line-height: 1.6; text-align: justify; }
          .laporan-cetak__ttd { width: 55mm; margin: 18pt 0 0 auto; text-align: center; line-height: 1.5; }
          .laporan-cetak__ttd p { margin: 0; }
          .laporan-cetak__ruang-ttd { display: flex; height: 24mm; align-items: center; justify-content: center; }
          .laporan-cetak__ruang-ttd img { max-width: 48mm; max-height: 22mm; object-fit: contain; }
          .laporan-cetak__catatan-kaki { margin-top: 22pt; font-size: 10pt; }
        }
      `}</style>
    </div>
  );
}
