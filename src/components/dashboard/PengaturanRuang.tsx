import { useEffect, useMemo, useState } from "react";
import {
  gasCall,
  type GuruGas,
  type PenempatanGas,
  type RuangGas,
  type RuangSetGas,
  type SiswaGas,
} from "@/lib/api";
import { SET_KOSONG, type SetKartu } from "@/lib/kartu";
import {
  baganDudukHTML,
  cetakDokumen,
  daftarHadirHTML,
  jadwalPengawasHTML,
  labelKomposisi,
  labelTanggal,
  ringkasKursi,
  type RuangDenganKursi,
} from "@/lib/cetak-ruang";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  CalendarDays,
  ClipboardList,
  LayoutGrid,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  UserCheck,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

/** Urut tingkat untuk tampilan yang rapi (X, XI, XII, …). */
function urutTingkatT(t: string): number {
  const map: Record<string, number> = { X: 1, XI: 2, XII: 3, XIII: 4 };
  return map[t.trim().toUpperCase()] ?? 99;
}

type RuangForm = {
  id: string;
  nama: string;
  kapasitas: number;
  komposisi: Record<string, number>;
};

const FORM_RUANG_KOSONG: RuangForm = {
  id: "",
  nama: "",
  kapasitas: 20,
  komposisi: {},
};

const KOSONG: RuangSetGas = { ruang: [], pengawas: [], jadwal: [], penempatan: [] };

/**
 * Pengaturan ruang ujian (admin):
 *  a) guru pengawas (pilih dengan kotak centang + pencarian),
 *  b) total hari & sesi per hari → jadwal pengawas otomatis + cetak,
 *  c) daftar ruang: kapasitas & komposisi tingkat (penempatan silang),
 *  d) bagan tempat duduk & daftar hadir — hasilnya tampil di kartu ujian.
 */
export function PengaturanRuang() {
  const [ruangSet, setRuangSet] = useState<RuangSetGas | null>(null);
  const [guru, setGuru] = useState<GuruGas[]>([]);
  const [tingkatList, setTingkatList] = useState<string[]>([]);
  const [setKartu, setSetKartu] = useState<SetKartu>({ ...SET_KOSONG });

  const [cari, setCari] = useState("");
  const [pilih, setPilih] = useState<string[]>([]);
  const [busyPengawas, setBusyPengawas] = useState(false);

  const [form, setForm] = useState<RuangForm | null>(null);
  const [busyRuang, setBusyRuang] = useState(false);
  const [hapusRuang, setHapusRuang] = useState<RuangGas | null>(null);

  const [tglMulai, setTglMulai] = useState("");
  const [totalHari, setTotalHari] = useState(3);
  const [sesiHari, setSesiHari] = useState(2);
  const [jamSesi, setJamSesi] = useState("");
  const [busyJadwal, setBusyJadwal] = useState(false);

  const [busyTempat, setBusyTempat] = useState(false);
  const [cetakRuang, setCetakRuang] = useState("semua");

  /* ---------------- muat data ---------------- */
  useEffect(() => {
    let hidup = true;
    Promise.all([
      gasCall<RuangSetGas>("getRuangSet"),
      gasCall<{ guru: GuruGas[] }>("getGuru"),
      gasCall<{ siswa: SiswaGas[] }>("getSiswa"),
      gasCall<SetKartu>("getKartuSet"),
    ])
      .then(([rs, g, s, kartu]) => {
        if (!hidup) return;
        setRuangSet(rs ?? KOSONG);
        setPilih(rs.pengawas ?? []);
        setGuru(g.guru ?? []);
        const t = Array.from(
          new Set(
            (s.siswa ?? [])
              .map((x) => {
                const k = x.kelas.trim().toUpperCase();
                if (!k) return "";
                const titik = k.indexOf(".");
                return (titik !== -1 ? k.slice(0, titik) : k).trim();
              })
              .filter(Boolean),
          ),
        ).sort((a, b) => urutTingkatT(a) - urutTingkatT(b));
        setTingkatList(t);
        setSetKartu({
          sekolah: kartu.sekolah ?? SET_KOSONG.sekolah,
          alamat: kartu.alamat ?? "",
          kota: kartu.kota ?? SET_KOSONG.kota,
          kepala: kartu.kepala ?? "",
          nip: kartu.nip ?? "",
          logo: kartu.logo ?? "",
          ttd: kartu.ttd ?? "",
        });
        // Tanggal default: hari ini (untuk jadwal pengawas).
        setTglMulai((v) => v || new Date().toISOString().slice(0, 10));
      })
      .catch((err) => {
        if (!hidup) return;
        setRuangSet(KOSONG);
        toast.error(
          err instanceof Error ? err.message : "Gagal memuat pengaturan ruang.",
        );
      });
    return () => {
      hidup = false;
    };
  }, []);

  const muatUlang = async () => {
    try {
      const rs = await gasCall<RuangSetGas>("getRuangSet");
      setRuangSet(rs ?? KOSONG);
      setPilih(rs.pengawas ?? []);
      if (cetakRuang !== "semua" && !rs.ruang.some((r) => r.id === cetakRuang)) {
        setCetakRuang("semua");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memuat ulang data ruang.",
      );
    }
  };

  /* ---------------- a. guru pengawas ---------------- */
  const guruTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return guru;
    return guru.filter((g) =>
      [g.nama, g.nip, g.mapel].some((v) => v.toLowerCase().includes(q)),
    );
  }, [guru, cari]);

  const togglePengawas = (nip: string) =>
    setPilih((p) => (p.includes(nip) ? p.filter((x) => x !== nip) : [...p, nip]));

  const simpanPengawas = async () => {
    setBusyPengawas(true);
    try {
      const res = await gasCall<{ message?: string }>("simpanPengawas", {
        nips: pilih,
      });
      toast.success(res.message || "Daftar pengawas disimpan.");
      await muatUlang();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan pengawas.",
      );
    } finally {
      setBusyPengawas(false);
    }
  };

  /* ---------------- b. ruang ---------------- */
  const totalKomposisi = form
    ? Object.values(form.komposisi).reduce((a, b) => a + (b || 0), 0)
    : 0;

  const buatForm = () => setForm({ ...FORM_RUANG_KOSONG });

  const ubahKapasitas = (v: number) =>
    setForm((f) => (f ? { ...f, kapasitas: Math.max(1, Math.min(200, v)) } : f));

  const ubahKomposisi = (t: string, v: number) =>
    setForm((f) =>
      f
        ? {
            ...f,
            komposisi: {
              ...f.komposisi,
              [t]: Math.max(0, Math.min(200, v)),
            },
          }
        : f,
    );

  const simpanRuang = async () => {
    if (!form) return;
    if (!form.nama.trim()) {
      toast.error("Nama ruang wajib diisi.");
      return;
    }
    if (totalKomposisi > 0 && totalKomposisi !== form.kapasitas) {
      toast.error(
        `Total komposisi (${totalKomposisi}) harus sama dengan kapasitas ruang (${form.kapasitas}).`,
      );
      return;
    }
    setBusyRuang(true);
    try {
      const komposisi: Record<string, number> = {};
      for (const [t, n] of Object.entries(form.komposisi)) {
        if (n > 0) komposisi[t] = n;
      }
      const res = await gasCall<{ message?: string }>("simpanRuang", {
        id: form.id || undefined,
        nama: form.nama.trim(),
        kapasitas: form.kapasitas,
        komposisi,
      });
      toast.success(res.message || "Ruang tersimpan.");
      setForm(null);
      await muatUlang();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan ruang.");
    } finally {
      setBusyRuang(false);
    }
  };

  const konfirmasiHapusRuang = async () => {
    if (!hapusRuang) return;
    try {
      const res = await gasCall<{ message?: string }>("hapusRuang", {
        id: hapusRuang.id,
      });
      toast.success(res.message || "Ruang dihapus.");
      await muatUlang();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus ruang.");
    } finally {
      setHapusRuang(null);
    }
  };

  /* ---------------- c. jadwal pengawas ---------------- */
  const buatJadwal = async () => {
    if (!tglMulai) {
      toast.error("Pilih tanggal mulai ujian.");
      return;
    }
    setBusyJadwal(true);
    try {
      const res = await gasCall<{ message?: string }>("buatJadwalPengawas", {
        tanggal_mulai: tglMulai,
        total_hari: totalHari,
        sesi_per_hari: sesiHari,
        jam: jamSesi,
      });
      toast.success(res.message || "Jadwal pengawas dibuat.");
      await muatUlang();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal membuat jadwal pengawas.",
      );
    } finally {
      setBusyJadwal(false);
    }
  };

  /** Jadwal dikelompokkan per tanggal + sesi agar pratinjau ringkas. */
  const grupJadwal = useMemo(() => {
    const map = new Map<
      string,
      {
        tanggal: string;
        hariKe: number;
        sesi: number;
        jam: string;
        anggota: { ruang: string; nama: string }[];
      }
    >();
    for (const j of ruangSet?.jadwal ?? []) {
      const k = `${j.tanggal}|${j.sesi}`;
      const g =
        map.get(k) ??
        {
          tanggal: j.tanggal,
          hariKe: j.hari_ke,
          sesi: j.sesi,
          jam: j.jam,
          anggota: [],
        };
      g.anggota.push({ ruang: j.ruang_nama, nama: j.nama });
      map.set(k, g);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        a.tanggal.localeCompare(b.tanggal) || a.sesi - b.sesi,
    );
  }, [ruangSet]);

  const cetakJadwal = () =>
    cetakDokumen(
      jadwalPengawasHTML(setKartu, ruangSet?.jadwal ?? []),
      "Jadwal Pengawas",
      (pesan) => toast.error(pesan),
    );

  /* ---------------- d. penempatan & cetakan ---------------- */
  const buatTempat = async () => {
    setBusyTempat(true);
    try {
      const res = await gasCall<{ message?: string }>("buatPenempatan", {});
      toast.success(res.message || "Tempat duduk disusun.");
      await muatUlang();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyusun tempat duduk.",
      );
    } finally {
      setBusyTempat(false);
    }
  };

  /** Kelompokkan penempatan per ruang (untuk cetak bagan & daftar hadir). */
  const daftarCetak = useMemo<RuangDenganKursi[]>(() => {
    if (!ruangSet) return [];
    const perRuang = new Map<string, PenempatanGas[]>();
    for (const p of ruangSet.penempatan) {
      const arr = perRuang.get(p.ruang_id) ?? [];
      arr.push(p);
      perRuang.set(p.ruang_id, arr);
    }
    return ruangSet.ruang
      .filter((r) => cetakRuang === "semua" || r.id === cetakRuang)
      .map((r) => ({ ruang: r, kursi: ringkasKursi(perRuang.get(r.id) ?? []) }));
  }, [ruangSet, cetakRuang]);

  const cetakBagan = () =>
    cetakDokumen(
      baganDudukHTML(setKartu, daftarCetak),
      "Bagan Tempat Duduk",
      (pesan) => toast.error(pesan),
    );

  const cetakHadir = () =>
    cetakDokumen(
      daftarHadirHTML(setKartu, daftarCetak),
      "Daftar Hadir",
      (pesan) => toast.error(pesan),
    );

  const terisi = ruangSet?.penempatan.length ?? 0;
  const kapasitasTotal = (ruangSet?.ruang ?? []).reduce(
    (a, r) => a + r.kapasitas,
    0,
  );
  const jumlahRuang = ruangSet?.ruang.length ?? 0;
  const jumlahSesiJadwal = ruangSet?.jadwal.length ?? 0;
  const adaTempat = daftarCetak.some((d) => d.kursi.length > 0);

  if (ruangSet === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">
          Ruang ujian &amp; pengawas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih guru pengawas, tentukan ruang &amp; kapasitas peserta, buat
          jadwal pengawas otomatis, lalu cetak bagan tempat duduk dan daftar
          hadir — hasil penentuan ruang ikut tercetak di kartu ujian.
        </p>
      </div>

      {/* ---------------- 1. Guru pengawas ---------------- */}
      <Card className="border-border/70">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">
                <UserCheck className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold">Guru pengawas ruang</p>
                <p className="text-xs text-muted-foreground">
                  {pilih.length} guru terpilih dari {guru.length} guru
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="gap-2"
              onClick={() => void simpanPengawas()}
              disabled={busyPengawas}
            >
              <Save className="size-4" />
              {busyPengawas ? "Menyimpan…" : "Simpan pengawas"}
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari guru (nama, NIP, atau mapel)…"
              className="pl-9"
            />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border/70 bg-background/60 p-2">
            {guruTampil.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {guru.length === 0
                  ? "Belum ada data guru — tambahkan guru di menu Data Guru."
                  : "Tidak ada guru yang cocok dengan pencarian."}
              </p>
            ) : (
              guruTampil.map((g) => {
                const aktif = pilih.includes(g.nip);
                return (
                  <label
                    key={g.id || g.nip}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      checked={aktif}
                      onCheckedChange={() => togglePengawas(g.nip)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {g.nama}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {g.mapel ? `${g.mapel} · ` : ""}NIP {g.nip}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPilih((p) => Array.from(new Set([...p, ...guruTampil.map((g) => g.nip)])))
              }
              disabled={guruTampil.length === 0}
            >
              Centang semua hasil pencarian
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPilih([])}
              disabled={pilih.length === 0}
            >
              Kosongkan pilihan
            </Button>
            <p className="text-[11px] leading-4 text-muted-foreground">
              Penugasan digilir merata ke seluruh guru yang dicentang.
            </p>
          </div>
        </div>
      </Card>

      {/* ---------------- 2. Daftar ruang ---------------- */}
      <Card className="border-border/70">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">
                <LayoutGrid className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold">Daftar ruang peserta</p>
                <p className="text-xs text-muted-foreground">
                  {jumlahRuang} ruang · total kapasitas {kapasitasTotal} kursi ·{" "}
                  {terisi} terisi
                </p>
              </div>
            </div>
            {!form && (
              <Button type="button" variant="outline" className="gap-2" onClick={buatForm}>
                <Plus className="size-4" /> Tambah ruang
              </Button>
            )}
          </div>

          {/* Form tambah/edit ruang */}
          {form && (
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="ruang-nama">Nama ruang *</Label>
                  <Input
                    id="ruang-nama"
                    value={form.nama}
                    onChange={(e) => setForm({ ...form, nama: e.target.value })}
                    placeholder="cth. Ruang 1"
                    autoFocus
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ruang-kap">Kapasitas (jumlah siswa) *</Label>
                  <Input
                    id="ruang-kap"
                    type="number"
                    min={1}
                    max={200}
                    value={form.kapasitas}
                    onChange={(e) => ubahKapasitas(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Komposisi peserta per tingkat</Label>
                <div className="flex flex-wrap gap-3">
                  {(Array.from(
                    new Set([...tingkatList, ...Object.keys(form.komposisi)]),
                  )
                    .filter(Boolean)
                    .sort((a, b) => urutTingkatT(a) - urutTingkatT(b))
                    .map((t) => (
                      <div
                        key={t}
                        className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                      >
                        <Label
                          htmlFor={`kom-${t}`}
                          className="text-xs font-bold text-muted-foreground"
                        >
                          Tingkat {t}
                        </Label>
                        <Input
                          id={`kom-${t}`}
                          type="number"
                          min={0}
                          max={200}
                          value={form.komposisi[t] ?? 0}
                          onChange={(e) =>
                            ubahKomposisi(t, Number(e.target.value))
                          }
                          className="h-8 w-20 text-center"
                        />
                      </div>
                    )))}
                  {tingkatList.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Belum ada data siswa — komposisi tingkat muncul setelah
                      Data Siswa diisi.
                    </p>
                  )}
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  Total komposisi sekarang:{" "}
                  <strong className={totalKomposisi === form.kapasitas ? "text-emerald-600" : totalKomposisi > 0 ? "text-red-600" : ""}>
                    {totalKomposisi}
                  </strong>{" "}
                  dari kapasitas {form.kapasitas}. Bila semua 0, ruang diisi
                  otomatis dengan menggilir seluruh tingkat (1 siswa X dan 1
                  siswa XI bergantian duduk bersebelahan).
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => void simpanRuang()}
                  disabled={busyRuang}
                >
                  <Save className="size-4" />
                  {busyRuang ? "Menyimpan…" : form.id ? "Simpan perubahan" : "Tambah ruang"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* Daftar ruang */}
          {jumlahRuang === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
              Belum ada ruang. Klik <strong>Tambah ruang</strong> — misal Ruang 1
              berkapasitas 20 (10 siswa X + 10 siswa XI).
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {ruangSet.ruang.map((r) => {
                const isi = ruangSet.penempatan.filter(
                  (p) => p.ruang_id === r.id,
                ).length;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/60 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{r.nama}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        Kapasitas {r.kapasitas} · {labelKomposisi(r)}
                        {kapasitasTotal > 0 &&
                          ` · ${isi} siswa sudah ditempatkan`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          setForm({
                            id: r.id,
                            nama: r.nama,
                            kapasitas: r.kapasitas,
                            komposisi: { ...r.komposisi },
                          })
                        }
                      >
                        <Pencil className="size-3.5" /> Ubah
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-red-600 hover:text-red-700"
                        onClick={() => setHapusRuang(r)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ---------------- 3. Jadwal pengawas otomatis ---------------- */}
      <Card className="border-border/70">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">
                <CalendarDays className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold">Jadwal pengawas otomatis</p>
                <p className="text-xs text-muted-foreground">
                  {jumlahSesiJadwal > 0
                    ? `${jumlahSesiJadwal} penugasan tersimpan`
                    : "Belum ada jadwal — isi lalu klik Buat jadwal."}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={cetakJadwal}
              disabled={jumlahSesiJadwal === 0}
            >
              <Printer className="size-4" /> Cetak jadwal pengawas
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="jd-tgl">Tanggal mulai ujian *</Label>
              <Input
                id="jd-tgl"
                type="date"
                value={tglMulai}
                onChange={(e) => setTglMulai(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jd-hari">Total hari ujian</Label>
              <Input
                id="jd-hari"
                type="number"
                min={1}
                max={60}
                value={totalHari}
                onChange={(e) => setTotalHari(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jd-sesi">Sesi per hari</Label>
              <Input
                id="jd-sesi"
                type="number"
                min={1}
                max={10}
                value={sesiHari}
                onChange={(e) => setSesiHari(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jd-jam">Jam per sesi (opsional)</Label>
              <Input
                id="jd-jam"
                value={jamSesi}
                onChange={(e) => setJamSesi(e.target.value)}
                placeholder="07.30, 13.00"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] leading-5 text-muted-foreground">
            Isi jam dengan tanda koma (mis. 07.30, 13.00); bila dikosongkan jam
            dihitung otomatis. Setiap sesi, tiap ruang dijaga satu guru —
            penugasan digilir merata ke seluruh guru pengawas.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="gap-2"
              onClick={() => void buatJadwal()}
              disabled={busyJadwal || jumlahRuang === 0 || pilih.length === 0}
            >
              <Wand2 className="size-4" />
              {busyJadwal ? "Menyusun…" : "Buat jadwal otomatis"}
            </Button>
            {jumlahRuang === 0 && (
              <span className="self-center text-xs text-muted-foreground">
                Tambah ruang dulu.
              </span>
            )}
            {jumlahRuang > 0 && pilih.length === 0 && (
              <span className="self-center text-xs text-muted-foreground">
                Centang guru pengawas dulu.
              </span>
            )}
            {jumlahSesiJadwal > 0 && (
              <span className="self-center text-xs text-muted-foreground">
                Membuat ulang jadwal akan menimpa yang sekarang.
              </span>
            )}
          </div>

          {/* Pratinjau jadwal */}
          {grupJadwal.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-border/70">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">Hari / Tanggal</th>
                    <th className="px-3 py-2">Sesi</th>
                    <th className="px-3 py-2">Jam</th>
                    <th className="px-3 py-2">Pengawas (ruang)</th>
                  </tr>
                </thead>
                <tbody>
                  {grupJadwal.map((g) => (
                    <tr
                      key={`${g.tanggal}-${g.sesi}`}
                      className="border-t border-border/60 align-top"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-semibold">
                          Hari ke-{g.hariKe}
                        </span>
                        <br />
                        <span className="text-muted-foreground">
                          {labelTanggal(g.tanggal)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        Sesi {g.sesi}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono">
                        {g.jam}
                      </td>
                      <td className="px-3 py-2">
                        {g.anggota
                          .map((a) => `${a.ruang} — ${a.nama}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ---------------- 4. Penempatan tempat duduk & cetak ---------------- */}
      <Card className="border-border/70">
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">
                <Users className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold">Penempatan tempat duduk</p>
                <p className="text-xs text-muted-foreground">
                  {terisi} siswa ditempatkan dari kapasitas {kapasitasTotal} ·
                  hasilnya tampil pada kartu ujian
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="gap-2"
              onClick={() => void buatTempat()}
              disabled={busyTempat || jumlahRuang === 0}
            >
              <Wand2 className="size-4" />
              {busyTempat ? "Menyusun…" : "Susun tempat duduk otomatis"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="cetak-ruang" className="shrink-0">
              Ruang yang dicetak
            </Label>
            <select
              id="cetak-ruang"
              value={cetakRuang}
              onChange={(e) => setCetakRuang(e.target.value)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="semua">Semua ruang</option>
              {ruangSet.ruang.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nama}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={cetakBagan}
              disabled={jumlahRuang === 0}
            >
              <Printer className="size-4" /> Cetak bagan tempat duduk
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={cetakHadir}
              disabled={jumlahRuang === 0}
            >
              <ClipboardList className="size-4" /> Cetak daftar hadir
            </Button>
            {jumlahRuang > 0 && !adaTempat && (
              <span className="text-xs text-muted-foreground">
                Belum ada peserta ditempatkan — jalankan “Susun tempat duduk
                otomatis”.
              </span>
            )}
          </div>

          {/* Ringkasan isi tiap ruang */}
          {jumlahRuang > 0 && (
            <div className="flex flex-wrap gap-2">
              {daftarCetak.map(({ ruang, kursi }) => (
                <span
                  key={ruang.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3 py-1.5 text-xs"
                >
                  <span className="font-bold">{ruang.nama}</span>
                  <span className="text-muted-foreground">
                    {kursi.length}/{ruang.kapasitas} kursi terisi
                  </span>
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] leading-5 text-muted-foreground">
            Bagan tempat duduk menampilkan nomor kursi + nama peserta per ruang;
            daftar hadir menyediakan kolom tanda tangan. Setelah penempatan
            dibuat, buka <strong>Kelola Ujian → Cetak kartu</strong> — nomor
            ruang &amp; duduk otomatis ikut tercetak pada kartu ujian.
          </p>
        </div>
      </Card>

      <AlertDialog
        open={hapusRuang !== null}
        onOpenChange={(open) => !open && setHapusRuang(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus ruang ini?</AlertDialogTitle>
            <AlertDialogDescription>
              "{hapusRuang?.nama}" beserta jadwal pengawas dan penempatan
              tempat duduk pada ruang ini akan dihapus. Bisa disusun ulang
              kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={konfirmasiHapusRuang}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Ya, hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
