import { useEffect, useMemo, useState } from "react";
import { gasCall, type GuruGas } from "@/lib/api";
import { bacaBarisExcel } from "@/lib/xlsx-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  FileUp,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

const kosong = { nip: "", nama: "", mapel: "" };

/** Panel kelola data guru — khusus admin (tabel `guru` di MySQL). */
export function DataGuru() {
  const [daftar, setDaftar] = useState<GuruGas[] | null>(null);
  const [cari, setCari] = useState("");
  const [form, setForm] = useState<typeof kosong>(kosong);
  const [editId, setEditId] = useState<string | null>(null);
  const [bukaForm, setBukaForm] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<GuruGas | null>(null);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [bukaHapusMassal, setBukaHapusMassal] = useState(false);
  const [passTarget, setPassTarget] = useState<GuruGas | null>(null);
  const [passBaru, setPassBaru] = useState("");
  const [passUlang, setPassUlang] = useState("");
  const [bukaImpor, setBukaImpor] = useState(false);
  const [teksImpor, setTeksImpor] = useState("");
  const [busy, setBusy] = useState(false);
  const [bukaAkun, setBukaAkun] = useState(false);

  const muat = () => {
    setDaftar(null);
    gasCall<{ guru: GuruGas[] }>("getGuru")
      .then((res) => setDaftar(res.guru))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Gagal memuat data guru.");
        setDaftar([]);
      });
  };

  useEffect(muat, []);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q || !daftar) return daftar ?? [];
    return daftar.filter(
      (g) =>
        g.nama.toLowerCase().includes(q) ||
        g.nip.toLowerCase().includes(q) ||
        g.mapel.toLowerCase().includes(q),
    );
  }, [daftar, cari]);

  /* -------------------------------------------------------------- */
  /* Kotak centang: pilih banyak → hapus massal                      */
  /* -------------------------------------------------------------- */
  const semuaTerpilih =
    tersaring.length > 0 && tersaring.every((g) => terpilih.has(g.id));
  const sebagianTerpilih =
    !semuaTerpilih && tersaring.some((g) => terpilih.has(g.id));

  const toggleSemua = () =>
    setTerpilih((lama) => {
      const baru = new Set(lama);
      for (const g of tersaring) {
        if (semuaTerpilih) baru.delete(g.id);
        else baru.add(g.id);
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
        "hapusGuruMassal",
        { ids: Array.from(terpilih) },
      );
      toast.success(res.message || "Guru terpilih dihapus.");
      setTerpilih(new Set());
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setBukaHapusMassal(false);
    }
  };

  const tutupDialogPass = () => {
    setPassTarget(null);
    setPassBaru("");
    setPassUlang("");
  };

  const simpanPassword = async () => {
    if (!passTarget) return;
    if (passBaru.length < 4) {
      toast.error("Password minimal 4 karakter.");
      return;
    }
    if (passBaru !== passUlang) {
      toast.error("Password dan ulangan tidak sama.");
      return;
    }
    setBusy(true);
    try {
      await gasCall("ubahPasswordGuru", {
        id: passTarget.id,
        password: passBaru,
      });
      toast.success(`Password ${passTarget.nama} diperbarui.`);
      tutupDialogPass();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengubah password.",
      );
    } finally {
      setBusy(false);
    }
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editId) {
        await gasCall("ubahGuru", { id: editId, ...form });
        toast.success("Data guru diperbarui.");
      } else {
        await gasCall("tambahGuru", { ...form });
        toast.success(`Guru "${form.nama}" ditambahkan.`);
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
      await gasCall("hapusGuru", { id: hapusTarget.id });
      toast.success("Guru dihapus.");
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
      toast.error("Tempel data dulu (NIP, Nama, Mapel) atau pilih file Excel.");
      return;
    }
    setBusy(true);
    try {
      const res = await gasCall<{ masuk: number; lewati: number }>("importGuru", { rows });
      toast.success(
        `${res.masuk} guru diimpor${res.lewati ? `, ${res.lewati} dilewati (NIP duplikat/kosong)` : ""}.`,
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
      const res = await gasCall<{ masuk: number; lewati: number }>("importGuru", { rows });
      toast.success(
        `${res.masuk} guru diimpor dari ${file.name}${
          res.lewati ? `, ${res.lewati} dilewati (NIP duplikat/kosong)` : ""
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

  const buatAkunMassal = async () => {
    setBusy(true);
    try {
      const res = await gasCall<{
        dibuat: number;
        lewati: number;
        message?: string;
      }>("buatAkunGuru", {});
      toast.success(res.message || "Akun guru dibuat.");
      setBukaAkun(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat akun guru.");
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
          <h1 className="text-2xl font-extrabold tracking-tight">Data guru</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            NIP/NUPTK, nama, dan mata pelajaran — impor massal dari Excel lalu
            buat akun login guru dari data ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setBukaAkun(true)}
            disabled={daftar.length === 0}
          >
            <UserPlus className="size-4" /> Buat akun guru
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
            <Plus className="size-4" /> Tambah guru
          </Button>
        </div>
      </div>

      {/* Pencarian */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama / NIP / mapel…"
          className="pl-9"
        />
      </div>

      {/* Bar aksi massal — muncul saat ada kotak centang terpilih */}
      {terpilih.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm font-semibold">
            {terpilih.size} guru dipilih
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
              <Trash2 className="size-4" /> Hapus {terpilih.size} guru
            </Button>
          </div>
        </div>
      )}

      {daftar.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada data guru</EmptyTitle>
            <EmptyDescription>
              Tambahkan satu per satu atau impor massal dari Excel/CSV.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="overflow-hidden border-border/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-5 py-3">
                    <Checkbox
                      checked={
                        semuaTerpilih ? true : sebagianTerpilih ? "indeterminate" : false
                      }
                      onCheckedChange={toggleSemua}
                      aria-label="Pilih semua guru pada daftar ini"
                    />
                  </th>
                  <th className="px-5 py-3">NIP/NUPTK</th>
                  <th className="px-5 py-3">Nama</th>
                  <th className="px-5 py-3">Mata Pelajaran</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {tersaring.map((g) => (
                  <tr key={g.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <Checkbox
                        checked={terpilih.has(g.id)}
                        onCheckedChange={() => togglePilih(g.id)}
                        aria-label={`Pilih ${g.nama}`}
                      />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold">{g.nip}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          <UserRound className="size-4" />
                        </span>
                        {g.nama}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant="secondary">{g.mapel || "—"}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setEditId(g.id);
                            setForm({ nip: g.nip, nama: g.nama, mapel: g.mapel });
                            setBukaForm(true);
                          }}
                          aria-label={`Ubah ${g.nama}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setPassTarget(g);
                            setPassBaru("");
                            setPassUlang("");
                          }}
                          aria-label={`Ubah password ${g.nama}`}
                          title="Ubah password guru"
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-red-600"
                          onClick={() => setHapusTarget(g)}
                          aria-label={`Hapus ${g.nama}`}
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
                      colSpan={5}
                      className="px-5 py-8 text-center text-sm text-muted-foreground"
                    >
                      Tidak ada guru yang cocok dengan pencarian ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog form guru */}
      <Dialog open={bukaForm} onOpenChange={setBukaForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Ubah data guru" : "Tambah guru"}</DialogTitle>
            <DialogDescription>
              NIP/NUPTK dipakai sebagai username login guru saat akun dibuat.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={simpan} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gr-nip">NIP / NUPTK *</Label>
              <Input
                id="gr-nip"
                value={form.nip}
                onChange={(e) => setForm({ ...form, nip: e.target.value })}
                placeholder="cth. 197501012000031001"
                inputMode="numeric"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gr-nama">Nama guru *</Label>
              <Input
                id="gr-nama"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="cth. Budi Santoso, S.Pd."
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gr-mapel">Mata pelajaran</Label>
              <Input
                id="gr-mapel"
                value={form.mapel}
                onChange={(e) => setForm({ ...form, mapel: e.target.value })}
                placeholder="cth. Matematika"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBukaForm(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                {editId ? "Simpan perubahan" : "Tambah guru"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog impor massal */}
      <Dialog open={bukaImpor} onOpenChange={setBukaImpor}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Impor massal guru</DialogTitle>
            <DialogDescription>
              Pilih file Excel (<code className="rounded bg-muted px-1">.xlsx</code> /{" "}
              <code className="rounded bg-muted px-1">.csv</code>) atau salin dari
              Excel lalu tempel di bawah. Format kolom:{" "}
              <code className="rounded bg-muted px-1">NIP, Nama, Mapel, Password (opsional)</code>
              {" "}(baris header otomatis dilewati). NIP yang sudah ada dilewati.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="file-guru" className="gap-1.5">
              <FileUp className="size-3.5" /> File Excel / CSV
            </Label>
            <Input
              id="file-guru"
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
            placeholder={
              "197501012000031001, Budi Santoso S.Pd, Matematika\n197802022001042002, Siti Aminah S.Pd, Bahasa Indonesia"
            }
            rows={8}
            className="w-full rounded-xl border border-input bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBukaImpor(false)}>
              Batal
            </Button>
            <Button className="gap-2" onClick={impor} disabled={busy}>
              <FileUp className="size-4" /> Impor sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi buat akun massal */}
      <AlertDialog open={bukaAkun} onOpenChange={setBukaAkun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buat akun untuk semua guru?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun dibuat dari data guru: <strong>username = NIP</strong>,{" "}
              <strong>password = password dari impor (default "guru123")</strong>,
              peran guru. Akun yang sudah ada dilewati (password tidak berubah).
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
            <AlertDialogTitle>Hapus guru ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {hapusTarget?.nama} (NIP {hapusTarget?.nip}) akan dihapus dari data
              guru. Akun login yang sudah dibuat tidak ikut terhapus.
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

      {/* Dialog ubah password guru */}
      <Dialog
        open={passTarget !== null}
        onOpenChange={(open) => !open && tutupDialogPass()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah password guru</DialogTitle>
            <DialogDescription>
              {passTarget?.nama} — username login{" "}
              <code className="rounded bg-muted px-1">{passTarget?.nip}</code>.
              Akun login ikut diperbarui — dibuat otomatis bila belum ada,
              sehingga password baru pasti bisa dipakai untuk masuk.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void simpanPassword();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="gr-pass-baru">Password baru *</Label>
              <Input
                id="gr-pass-baru"
                type="password"
                value={passBaru}
                onChange={(e) => setPassBaru(e.target.value)}
                placeholder="minimal 4 karakter"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gr-pass-ulang">Ulangi password *</Label>
              <Input
                id="gr-pass-ulang"
                type="password"
                value={passUlang}
                onChange={(e) => setPassUlang(e.target.value)}
                placeholder="ketik ulang password baru"
                autoComplete="new-password"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={tutupDialogPass}>
                Batal
              </Button>
              <Button type="submit" disabled={busy}>
                Simpan password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus massal (kotak centang) */}
      <AlertDialog open={bukaHapusMassal} onOpenChange={setBukaHapusMassal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus {terpilih.size} guru terpilih?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh guru yang dicentang akan dihapus permanen dari data
              guru. Akun login (bila sudah dibuat) tidak ikut terhapus.
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
