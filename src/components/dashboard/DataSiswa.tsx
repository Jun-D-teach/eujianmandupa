import { useEffect, useMemo, useState } from "react";
import { gasCall, type SiswaGas } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

const kosong = { nisn: "", nama: "", tgllahir: "", kelas: "" };

/** Panel kelola data siswa — khusus admin. */
export function DataSiswa() {
  const [daftar, setDaftar] = useState<SiswaGas[] | null>(null);
  const [cari, setCari] = useState("");
  const [form, setForm] = useState<typeof kosong>(kosong);
  const [editId, setEditId] = useState<string | null>(null);
  const [bukaForm, setBukaForm] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<SiswaGas | null>(null);
  const [bukaImpor, setBukaImpor] = useState(false);
  const [teksImpor, setTeksImpor] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (!q || !daftar) return daftar ?? [];
    return daftar.filter(
      (s) =>
        s.nama.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q),
    );
  }, [daftar, cari]);

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
      toast.error("Tempel data dulu (NISN, Nama, Tgl Lahir, Kelas).");
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

      {/* Pencarian */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama / NISN / kelas…"
          className="pl-9"
        />
      </div>

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
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
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
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold">{s.nisn}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          <UserRound className="size-4" />
                        </span>
                        {s.nama}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{s.tgllahir || "—"}</td>
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
              Salin dari Excel/CSV lalu tempel di sini. Format per baris:{" "}
              <code className="rounded bg-muted px-1">NISN, Nama, Tgl Lahir, Kelas</code>{" "}
              (pemisah tab/koma/titik-koma). NISN yang sudah ada dilewati.
            </DialogDescription>
          </DialogHeader>
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
    </div>
  );
}
