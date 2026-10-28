import { useEffect, useState } from "react";
import { gasCall, type PenggunaGas } from "@/lib/api";
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
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, KeyRound, Shuffle, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

/** Satu baris hasil generate password acak (untuk dialog hasil & CSV). */
type HasilAcak = {
  id: string;
  username: string;
  nama: string;
  password: string;
};

const PERAN = [
  { nilai: "admin", label: "Admin", ket: "Kelola ujian, hasil, & pengguna" },
  { nilai: "guru", label: "Guru", ket: "Buat ujian, soal, & lihat hasil" },
  { nilai: "siswa", label: "Siswa", ket: "Unduh soal & kerjakan ujian" },
] as const;

/** Manajemen akun & peran — khusus admin (tabel pengguna di database). */
export function Pengguna() {
  const [daftar, setDaftar] = useState<PenggunaGas[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    nama: "",
    kelas: "",
    role: "siswa",
  });
  // Ganti password akun yang sudah ada (termasuk akun admin sendiri).
  const [passTarget, setPassTarget] = useState<PenggunaGas | null>(null);
  const [passBaru, setPassBaru] = useState("");
  const [passUlang, setPassUlang] = useState("");
  const [busyPass, setBusyPass] = useState(false);
  // Ubah password MASSAL — akun yang dicentang di tabel dapat password seragam.
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [bukaPassMassal, setBukaPassMassal] = useState(false);
  const [massalBaru, setMassalBaru] = useState("");
  const [massalUlang, setMassalUlang] = useState("");
  const [busyMassal, setBusyMassal] = useState(false);
  // Hasil generate password ACak — ditampilkan sekali lalu disebarkan admin.
  const [hasilAcak, setHasilAcak] = useState<HasilAcak[] | null>(null);
  const [busyAcak, setBusyAcak] = useState(false);

  const muat = () => {
    setDaftar(null);
    gasCall<{ pengguna: PenggunaGas[] }>("getPengguna")
      .then((res) => setDaftar(res.pengguna))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Gagal memuat pengguna.");
        setDaftar([]);
      });
  };

  useEffect(muat, []);

  const buatAkun = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password.trim()) {
      toast.error("Username & password wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await gasCall("buatPengguna", {
        username: form.username.trim(),
        password: form.password,
        nama: form.nama.trim() || form.username.trim(),
        kelas: form.kelas.trim(),
        role: form.role,
      });
      setForm({ username: "", password: "", nama: "", kelas: "", role: "siswa" });
      muat();
      toast.success("Akun dibuat — bagikan username & password ke pengguna.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat akun.");
    } finally {
      setBusy(false);
    }
  };

  const ubah = async (id: string, role: string) => {
    try {
      await gasCall("ubahPeran", { id, role });
      muat();
      toast.success("Peran diperbarui.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui peran.");
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
    setBusyPass(true);
    try {
      const res = await gasCall<{ message?: string }>("ubahPasswordPengguna", {
        id: passTarget.id,
        password: passBaru,
      });
      muat();
      tutupDialogPass();
      toast.success(res.message || `Password ${passTarget.nama || passTarget.username} diperbarui.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah password.");
    } finally {
      setBusyPass(false);
    }
  };

  /** Ganti password seragam untuk semua akun yang dicentang. */
  const simpanPassMassal = async () => {
    if (terpilih.size === 0) return;
    if (massalBaru.length < 4) {
      toast.error("Password minimal 4 karakter.");
      return;
    }
    if (massalBaru !== massalUlang) {
      toast.error("Password dan ulangan tidak sama.");
      return;
    }
    setBusyMassal(true);
    try {
      const res = await gasCall<{ ubah?: number; message?: string }>(
        "ubahPasswordMassal",
        { ids: Array.from(terpilih), password: massalBaru },
      );
      const n = res.ubah ?? terpilih.size;
      setBukaPassMassal(false);
      setMassalBaru("");
      setMassalUlang("");
      setTerpilih(new Set());
      muat();
      toast.success(res.message || `Password ${n} akun diperbarui.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah password.");
    } finally {
      setBusyMassal(false);
    }
  };

  /** Ganti password terpilih jadi ACak — hasilnya dibuka agar bisa disebarkan. */
  const generateAcak = async () => {
    if (terpilih.size === 0) return;
    setBusyAcak(true);
    try {
      const res = await gasCall<{
        ubah?: number;
        daftar?: HasilAcak[];
        message?: string;
      }>("generatePasswordMassal", { ids: Array.from(terpilih) });
      setHasilAcak(res.daftar ?? []);
      setTerpilih(new Set());
      muat();
      toast.success(
        res.message || `${res.ubah ?? 0} password diganti otomatis (acak).`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal generate password.",
      );
    } finally {
      setBusyAcak(false);
    }
  };

  /** Unduh hasil generate sebagai CSV (siap dibagikan ke siswa). */
  const unduhHasilAcak = () => {
    if (!hasilAcak || hasilAcak.length === 0) return;
    const esc = (v: string) => '"' + (v ?? '').replace(/"/g, '""') + '"';
    const csv =
      "\uFEFF" +
      [
        "Username,Password,Nama",
        ...hasilAcak.map((h) =>
          [h.username, h.password, h.nama].map(esc).join(","),
        ),
      ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "password-acak.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${hasilAcak.length} password diunduh ke password-acak.csv.`);
  };

  /** Unduh daftar akun sebagai CSV (pakai Excel/LibreOffice). */
  const unduhCsv = () => {
    if (!daftar || daftar.length === 0) return;
    const esc = (v: string) => '"' + (v ?? '').replace(/"/g, '""') + '"';
    const baris = daftar.map((u) =>
      [u.username, u.password ?? "", u.nama ?? "", u.kelas ?? "", u.role]
        .map(esc)
        .join(","),
    );
    const csv =
      "\uFEFF" +
      ["Username,Password,Nama,Kelas,Peran", ...baris].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "akun-ujianaman.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${daftar.length} akun diunduh ke akun-ujianaman.csv.`);
  };

  if (daftar === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  /* Kotak centang: pilih banyak → ubah password massal */
  const semuaTerpilih =
    daftar.length > 0 && daftar.every((u) => terpilih.has(u.id));
  const sebagianTerpilih =
    !semuaTerpilih && daftar.some((u) => terpilih.has(u.id));

  const toggleSemua = () =>
    setTerpilih((lama) => {
      const baru = new Set(lama);
      for (const u of daftar) {
        if (semuaTerpilih) baru.delete(u.id);
        else baru.add(u.id);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pengguna</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua akun dibuat & diatur admin di database — tanpa email/OTP.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={unduhCsv}
          disabled={daftar.length === 0}
        >
          <Download className="size-4" /> Unduh CSV akun
        </Button>
      </div>

      {/* Buat akun baru */}
      <Card className="border-border/70">
        <form onSubmit={buatAkun} className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="bu-username">Username *</Label>
            <Input
              id="bu-username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="cth. ayu.lestari"
              autoComplete="off"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bu-password">Password *</Label>
            <Input
              id="bu-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="minimal 4 karakter"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bu-nama">Nama lengkap</Label>
            <Input
              id="bu-nama"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              placeholder="cth. Ayu Lestari"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bu-kelas">Kelas</Label>
            <Input
              id="bu-kelas"
              value={form.kelas}
              onChange={(e) => setForm({ ...form, kelas: e.target.value })}
              placeholder="cth. XII-IPA-2"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Peran akun</Label>
            <div className="flex flex-wrap gap-2">
              {PERAN.map((p) => (
                <button
                  key={p.nilai}
                  type="button"
                  onClick={() => setForm({ ...form, role: p.nilai })}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                    form.role === p.nilai
                      ? "border-ink bg-ink text-white"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="gap-2" disabled={busy}>
              <UserPlus className="size-4" /> Buat akun
            </Button>
          </div>
        </form>
      </Card>

      {/* Bar aksi massal — muncul saat ada kotak centang terpilih */}
      {terpilih.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/20 bg-ink/5 px-4 py-3">
          <p className="text-sm font-semibold">
            {terpilih.size} pengguna dipilih
            {terpilih.size === daftar.length ? " (seluruh daftar)" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTerpilih(new Set())}
            >
              Batalkan pilihan
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setMassalBaru("");
                setMassalUlang("");
                setBukaPassMassal(true);
              }}
            >
              <KeyRound className="size-4" /> Ubah password {terpilih.size} akun
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void generateAcak()}
              disabled={busyAcak}
              title="Ganti password akun terpilih jadi acak, beda tiap akun"
            >
              <Shuffle className="size-4" />
              {busyAcak ? "Menggenerate…" : `Generate acak ${terpilih.size} akun`}
            </Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden border-border/70">
        {daftar.length === 0 ? (
          <Empty className="py-14">
            <EmptyContent>
              <EmptyTitle>Belum ada pengguna</EmptyTitle>
              <EmptyDescription>
                Buat akun pertama menggunakan formulir di atas.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-5 py-3">
                    <Checkbox
                      checked={
                        semuaTerpilih
                          ? true
                          : sebagianTerpilih
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSemua}
                      aria-label="Pilih semua pengguna pada daftar ini"
                    />
                  </th>
                  <th className="px-5 py-3">Nama</th>
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3">Kelas</th>
                  <th className="px-5 py-3 text-right">Peran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {daftar.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <Checkbox
                        checked={terpilih.has(u.id)}
                        onCheckedChange={() => togglePilih(u.id)}
                        aria-label={`Pilih ${u.nama || u.username}`}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          {(u.nama || u.username).slice(0, 1).toUpperCase()}
                        </span>
                        {u.nama || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                      {u.username}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {u.kelas || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {u.role === "admin" && (
                          <Badge className="gap-1 bg-ink text-white">
                            <ShieldCheck className="size-3.5" /> Admin
                          </Badge>
                        )}
                        <select
                          value={u.role}
                          onChange={(e) => ubah(u.id, e.target.value)}
                          className="rounded-xl border border-input bg-card px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                          aria-label={`Peran ${u.nama || u.username}`}
                        >
                          {PERAN.map((p) => (
                            <option key={p.nilai} value={p.nilai}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setPassTarget(u);
                            setPassBaru("");
                            setPassUlang("");
                          }}
                          className="inline-flex size-9 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition-colors hover:border-ink hover:text-foreground"
                          aria-label={`Ganti password ${u.nama || u.username}`}
                          title="Ganti password akun ini"
                        >
                          <KeyRound className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {PERAN.map((p) => (
          <div
            key={p.nilai}
            className="rounded-2xl border border-border/70 bg-card p-4"
          >
            <p className="text-sm font-bold">{p.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{p.ket}</p>
          </div>
        ))}
      </div>

      {/* Dialog ganti password akun (admin/guru/siswa) */}
      <Dialog
        open={passTarget !== null}
        onOpenChange={(open) => !open && tutupDialogPass()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ganti password akun</DialogTitle>
            <DialogDescription>
              {passTarget?.nama || passTarget?.username} — username{" "}
              <code className="rounded bg-muted px-1">{passTarget?.username}</code>
              . Password baru langsung dipakai untuk login.
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
              <Label htmlFor="pg-pass-baru">Password baru *</Label>
              <Input
                id="pg-pass-baru"
                type="password"
                value={passBaru}
                onChange={(e) => setPassBaru(e.target.value)}
                placeholder="minimal 4 karakter"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pg-pass-ulang">Ulangi password *</Label>
              <Input
                id="pg-pass-ulang"
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
              <Button type="submit" disabled={busyPass}>
                {busyPass ? "Menyimpan…" : "Simpan password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog ganti password MASSAL untuk akun yang dicentang */}
      <Dialog
        open={bukaPassMassal}
        onOpenChange={(open) => !open && setBukaPassMassal(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah password {terpilih.size} akun</DialogTitle>
            <DialogDescription>
              Password baru dipakai seragam untuk semua akun yang dicentang
              pada tabel. Beri tahu pengguna setelah disimpan.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void simpanPassMassal();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="pg-massal-baru">Password baru *</Label>
              <Input
                id="pg-massal-baru"
                type="password"
                value={massalBaru}
                onChange={(e) => setMassalBaru(e.target.value)}
                placeholder="minimal 4 karakter"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pg-massal-ulang">Ulangi password *</Label>
              <Input
                id="pg-massal-ulang"
                type="password"
                value={massalUlang}
                onChange={(e) => setMassalUlang(e.target.value)}
                placeholder="ketik ulang password baru"
                autoComplete="new-password"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBukaPassMassal(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={busyMassal}>
                {busyMassal
                  ? "Menyimpan…"
                  : `Simpan ${terpilih.size} password`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog hasil generate password acak (siap disebarkan ke siswa) */}
      <Dialog
        open={hasilAcak !== null}
        onOpenChange={(open) => !open && setHasilAcak(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Password acak berhasil dibuat</DialogTitle>
            <DialogDescription>
              {hasilAcak?.length ?? 0} akun kini punya password baru yang beda
              tiap akun. Catat atau unduh CSV lalu bagikan ke pemilik akunnya.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2 text-right">Password baru</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(hasilAcak ?? []).map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2 font-semibold">{h.nama}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {h.username}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {h.password}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={unduhHasilAcak}
              disabled={(hasilAcak ?? []).length === 0}
            >
              <Download className="size-4" /> Unduh CSV
            </Button>
            <Button type="button" onClick={() => setHasilAcak(null)}>
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
