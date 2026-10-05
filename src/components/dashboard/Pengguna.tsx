import { useEffect, useState } from "react";
import { gasCall, type PenggunaGas } from "@/lib/api";
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
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

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
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
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
    </div>
  );
}
