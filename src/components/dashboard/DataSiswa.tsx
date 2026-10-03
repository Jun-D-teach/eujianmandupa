import { useEffect, useMemo, useState } from "react";
import { gasCall, type SiswaGas } from "@/lib/api";
import { bacaBarisExcel } from "@/lib/xlsx-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  FileUp,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

const kosong = { nisn: "", nama: "", tgllahir: "", kelas: "" };

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Panel kelola data siswa — khusus admin. */
export function DataSiswa() {
  const [daftar, setDaftar] = useState<SiswaGas[] | null>(null);
  const [cari, setCari] = useState("");
  const [form, setForm] = useState<typeof kosong>(kosong);
  const [editId, setEditId] = useState<string | null>(null);
  const [bukaForm, setBukaForm] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<SiswaGas | null>(null);
  const [kelasDipilih, setKelasDipilih] = useState("");
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [bukaHapusMassal, setBukaHapusMassal] = useState(false);
  const [bukaImpor, setBukaImpor] = useState(false);
  const [teksImpor, setTeksImpor] = useState("");
  const [busy, setBusy] = useState(false);
  const [bukaAkun, setBukaAkun] = useState(false);

  const muat = () => {
    setDaftar(null);
    gasCall<{ siswa: SiswaGas[] }>("getSiswa")
      .then((res) => setDaftar(res.siswa))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Gagal memuat data siswa.");
        setDaftar([]);
      });
  };

  useEffect(muat, []);

  // Kelas unik dari data siswa — dipakai panel Kelola Ujian lewat event ini juga.
  const kelasList = useMemo(() => {
    const urutTingkat = ["X", "XI", "XII"];
    const unik = Array.from(new Set(daftar?.map((s) => s.kelas.trim()).filter(Boolean) ?? []));
    const tingkatDari = (k: string) => (k.includes(".") ? k.split(".")[0].trim() : k).toUpperCase();
    return unik.sort((a, b) => {
      const ta = urutTingkat.indexOf(tingkatDari(a));
      const tb = urutTingkat.indexOf(tingkatDari(b));
      if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
      return a.localeCompare(b, "id", { numeric: true });
    });
  }, [daftar]);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const dasar = (daftar ?? []).filter((s) => !kelasDipilih || s.kelas === kelasDipilih);
    if (!q) return dasar;
    return dasar.filter(
      (s) =>
        s.nama.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q),
    );
  }, [daftar, cari, kelasDipilih]);

  /* -------------------------------------------------------------- */
  /* Kotak centang: pilih banyak → hapus massal                      */
  /* -------------------------------------------------------------- */
  const semuaTerpilih =
    tersaring.length > 0 && tersaring.every((s) => terpilih.has(s.id));
  const sebagianTerpilih =
    !semuaTerpilih && tersaring.some((s) => terpilih.has(s.id));

  const toggleSemua = () =>
    setTerpilih((lama) => {
      const baru = new Set(lama);
      for (const s of tersaring) {
        if (semuaTerpilih) baru.delete(s.id);
        else baru.add(s.id);
      }
      return baru;
    });

  const togglePilih = (id: string) =>
    setTerpilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });

  const hapusTerpilih = async () => {
    if (terpilih.size === 0) return;
    try {
      const res = await gasCall<{ hapus?: number; message?: string }>(
        "hapusSiswaMassal",
        { ids: Array.from(terpilih) },
      );
      toast.success(res.message || "Siswa terpilih dihapus.");
      setTerpilih(new Set());
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setBukaHapusMassal(false);
    }
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editId) {
        await gasCall("ubahSiswa", { id: editId, ...form });
        toast.success("Data siswa diperbarui.");
      } else {
        await gasCall("tambahSiswa", { ...form });
        toast.success('Siswa "' + form.nama + '" ditambahkan.');
      }
      setBukaForm(false);
      setEditId(null);
      setForm(kosong);
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const konfirmasiHapus = async () => {
    if (!hapusTarget) return;
    try {
      await gasCall("hapusSiswa", { id: hapusTarget.id });
      toast.success("Siswa dihapus.");
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setHapusTarget(null);
    }
  };

  /** Nilai mentah dari server (bisa "2008-05-12" dari Date Sheets, bisa teks) —
   *  untuk tooltip saat format tidak dikenal. */
  const tanggalMentah = (s: SiswaGas) => s.tgllahir;

  /** Tampilkan tanggal lahir konsisten: 12 Mei 2008. */
  const formatTgl = (nilai: string): string => {
    const t = nilai.trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${Number(m[3])} ${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
    m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${Number(m[1])} ${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[3]}`;
    return t; // biarkan apa adanya + tooltip nilai mentah
  };

  const buatAkunMassal = async () => {
    setBusy(true);
    try {
      const res = await gasCall<{
        dibuat: number;
        lewati: number;
        tanpa_tgl?: number;
        message?: string;
      }>("buatAkunSiswa", {});
      toast.success(res.message || "Akun siswa dibuat.");
      setBukaAkun(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat akun siswa.");
    } finally {
      setBusy(false);
    }
  };

  const impor = async () => {
    const rows = teksImpor
      .trim()
      .split(/\r?\n/)
      .map((baris) =>
        baris
          .split(/\t|,|;/)
          .map((sel) => sel.trim().replace(/^"(.*)"$/, "$1")),
      )
      .filter((r) => r.some(Boolean));
    if (rows.length === 0) {
      toast.error("Tempel data dulu (NISN, Nama, Tgl Lahir, Kelas) atau pilih file Excel.");
      return;
    }
    setBusy(true);
    try {
      const res = await gasCall<{ masuk: number; lewati: number }>("importSiswa", { rows });
      toast.success(
        `${res.masuk} siswa diimpor${res.lewati ? `, ${res.lewati} dilewati (NISN duplikat/kosong)` : ""}.`,
      );
      setBukaImpor(false);
      setTeksImpor("");
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengimpor.");
    } finally {
      setBusy(false);
    }
  };

  /** Impor langsung dari file Excel/CSV (.xlsx/.xls/.csv). */
  const imporFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await bacaBarisExcel(file);
      if (rows.length === 0) {
        toast.error("File tidak berisi baris data.");
        return;
      }
      const res = await gasCall<{ masuk: number; lewati: number }>("importSiswa", { rows });
      toast.success(
        `${res.masuk} siswa diimpor dari ${file.name}${
          res.lewati ? `, ${res.lewati} dilewati (NISN duplikat/kosong)` : ""
        }.`,
      );
      setBukaImpor(false);
      setTeksImpor("");
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca file.");
    } finally {
      setBusy(false);
    }
  };

  if (daftar === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Data siswa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            NISN, nama, tanggal lahir, dan kelas — daftar kelas ujian dibaca dari
            sini ({kelasList.length} kelas).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setBukaAkun(true)}
            disabled={daftar.length === 0}
          >
            <UserPlus className="size-4" /> Buat akun siswa
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setBukaImpor(true)}>
            <FileUp className="size-4" /> Impor massal
          </Button>
          <Button
            className="gap-2"
            onClick={() => {
              setEditId(null);
              setForm(kosong);
              setBukaForm(true);
            }}
          >
            <Plus className="size-4" /> Tambah siswa
          </Button>
        </div>
      </div>

      {/* Pencarian + filter kelas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama / NISN / kelas…"
            className="pl-9"
          />
        </div>
        <Select
          value={kelasDipilih || "semua"}
          onValueChange={(v) => setKelasDipilih(v === "semua" ? "" : v)}
        >
          <SelectTrigger className="w-auto min-w-[10.5rem]" aria-label="Filter kelas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua kelas ({daftar.length})</SelectItem>
            {kelasList.map((k) => (
              <SelectItem key={k} value={k}>
                {k} ({daftar.filter((s) => s.kelas === k).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bar aksi massal — muncul saat ada kotak centang terpilih */}
      {terpilih.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm font-semibold">
            {terpilih.size} siswa dipilih
            {tersaring.length !== daftar.length
              ? ` (dari ${tersaring.length} pada tampilan ini)`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTerpilih(new Set())}>
              Batalkan pilihan
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
              onClick={() => setBukaHapusMassal(true)}
            >
              <Trash2 className="size-4" /> Hapus {terpilih.size} siswa
            </Button>
          </div>
        </div>
      )}

      {daftar.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada data siswa</EmptyTitle>
            <EmptyDescription>
              Tambahkan satu per satu atau impor massal dari Excel/CSV.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="overflow-hidden border-border/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-5 py-3">
                    <Checkbox
                      checked={
                        semuaTerpilih ? true : sebagianTerpilih ? "indeterminate" : false
                      }
                      onCheckedChange={toggleSemua}
                      aria-label="Pilih semua siswa pada daftar ini"
                    />
                  </th>
                  <th className="px-5 py-3">NISN</th>
                  <th className="px-5 py-3">Nama</th>
                  <th className="px-5 py-3">Tgl lahir</th>
                  <th className="px-5 py-3">Kelas</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tersaring.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <Checkbox
                        checked={terpilih.has(s.id)}
                        onCheckedChange={() => togglePilih(s.id)}
                        aria-label={`Pilih ${s.nama}`}
                      />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold">{s.nisn}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          <UserRound className="size-4" />
                        </span>
                        {s.nama}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3.5 text-muted-foreground"
                      title={formatTgl(s.tgllahir) !== s.tgllahir ? tanggalMentah(s) : undefined}
                    >
                      {s.tgllahir ? formatTgl(s.tgllahir) : <span className="italic">belum diisi</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant="secondary">{s.kelas}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setEditId(s.id);
                            setForm({
                              nisn: s.nisn,
                              nama: s.nama,
                              tgllahir: s.tgllahir,
                              kelas: s.kelas,
                            });
                            setBukaForm(true);
                          }}
                          aria-label={`Ubah ${s.nama}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-red-600"
                          onClick={() => setHapusTarget(s)}
                          aria-label={`Hapus ${s.nama}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tersaring.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Tidak ada siswa yang cocok dengan pencarian / filter kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog form siswa */}
      <Dialog open={bukaForm} onOpenChange={setBukaForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Ubah data siswa" : "Tambah siswa"}</DialogTitle>
            <DialogDescription>
              Kelas yang diketik di sini otomatis jadi pilihan sasaran ujian.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={simpan} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sw-nisn">NISN *</Label>
              <Input
                id="sw-nisn"
                value={form.nisn}
                onChange={(e) => setForm({ ...form, nisn: e.target.value })}
                placeholder="cth. 0056781234"
                inputMode="numeric"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sw-nama">Nama siswa *</Label>
              <Input
                id="sw-nama"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="cth. Ayu Lestari"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sw-tgl">Tanggal lahir</Label>
                <Input
                  id="sw-tgl"
                  type="date"
                  value={form.tgllahir}
                  onChange={(e) => setForm({ ...form, tgllahir: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sw-kelas">Kelas *</Label>
                <Input
                  id="sw-kelas"
                  value={form.kelas}
                  onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                  placeholder="cth. X.1"
                  list="kelas-terdaftar"
                  required
                />
                <datalist id="kelas-terdaftar">
                  {kelasList.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBukaForm(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {editId ? "Simpan perubahan" : "Tambah siswa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog impor massal */}
      <Dialog open={bukaImpor} onOpenChange={setBukaImpor}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Impor massal siswa</DialogTitle>
            <DialogDescription>
              Pilih file Excel (<code className="rounded bg-muted px-1">.xlsx</code>{" "}
              / <code className="rounded bg-muted px-1">.csv</code>) atau salin
              dari Excel lalu tempel di bawah. Format kolom:{" "}
              <code className="rounded bg-muted px-1">NISN, Nama, Tgl Lahir, Kelas</code>
              {" "}(baris header otomatis dilewati). NISN yang sudah ada
              dilewati.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="file-siswa" className="gap-1.5">
              <FileUp className="size-3.5" /> File Excel / CSV
            </Label>
            <Input
              id="file-siswa"
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={busy}
              onChange={(e) => void imporFile(e.target.files?.[0] ?? null)}
              className="cursor-pointer"
            />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            — atau tempel data di bawah —
          </p>
          <textarea
            value={teksImpor}
            onChange={(e) => setTeksImpor(e.target.value)}
            placeholder={"0056781234, Ayu Lestari, 2008-05-12, X.1\n0056781235, Budi Santoso, 2008-08-03, X.1"}
            rows={8}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBukaImpor(false)}>
              Batal
            </Button>
            <Button className="gap-2" onClick={impor} disabled={busy}>
              <Download className="size-4" /> Impor sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi buat akun massal */}
      <AlertDialog open={bukaAkun} onOpenChange={setBukaAkun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buat akun untuk semua siswa?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun dibuat dari data siswa: <strong>username = NISN</strong>,
              <strong> password = tanggal lahir (DDMMYYYY)</strong>, peran
              siswa. Akun yang sudah ada dilewati (password tidak berubah).
              Setelah ini unduh daftar akun di menu Pengguna untuk dibagikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={buatAkunMassal}
              disabled={busy}
              className="bg-ink text-white hover:bg-ink/90"
            >
              {busy ? "Membuat…" : "Ya, buat akun"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konfirmasi hapus */}
      <AlertDialog
        open={hapusTarget !== null}
        onOpenChange={(open) => !open && setHapusTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus siswa ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {hapusTarget?.nama} (NISN {hapusTarget?.nisn}) akan dihapus dari
              data siswa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={konfirmasiHapus}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Ya, hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konfirmasi hapus massal (kotak centang) */}
      <AlertDialog open={bukaHapusMassal} onOpenChange={setBukaHapusMassal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus {terpilih.size} siswa terpilih?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh data siswa yang dicentang akan dihapus permanen dari
              database. Akun login (bila sudah dibuat) tidak ikut terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={hapusTerpilih}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Ya, hapus semuanya
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
