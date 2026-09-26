import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const PERAN = [
  { nilai: "admin", label: "Admin", ket: "Kelola ujian, hasil, & pengguna" },
  { nilai: "guru", label: "Guru", ket: "Buat ujian, soal, & lihat hasil" },
  { nilai: "siswa", label: "Siswa", ket: "Unduh soal & kerjakan ujian" },
] as const;

/** Manajemen peran pengguna — khusus admin. */
export function Pengguna() {
  const daftar = useQuery(api.profil.daftarPengguna);
  const aturRole = useMutation(api.profil.aturRole);

  const ubah = async (userId: string, role: string) => {
    try {
      await aturRole({ userId: userId as never, role: role as never });
      toast.success("Peran diperbarui.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui peran.");
    }
  };

  if (daftar === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Pengguna</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Akun pertama otomatis menjadi admin. Naikkan akun guru agar bisa
          menyusun soal.
        </p>
      </div>

      <Card className="overflow-hidden border-border/70">
        {daftar.length === 0 ? (
          <Empty className="py-14">
            <EmptyContent>
              <EmptyTitle>Belum ada pengguna</EmptyTitle>
              <EmptyDescription>
                Pengguna akan muncul setelah melakukan login.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Nama</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Kelas</th>
                  <th className="px-5 py-3 text-right">Peran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {daftar.map((u) => (
                  <tr key={u._id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                          {(u.name || u.email || "?").slice(0, 1).toUpperCase()}
                        </span>
                        {u.name || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {u.kelas ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {u.role === "admin" && (
                          <Badge className="gap-1 bg-ink text-white">
                            <ShieldCheck className="size-3.5" /> Admin
                          </Badge>
                        )}
                        <select
                          value={u.role ?? "siswa"}
                          onChange={(e) => ubah(u._id, e.target.value)}
                          className="rounded-xl border border-input bg-card px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
                          aria-label={`Peran ${u.name ?? u.email}`}
                        >
                          {PERAN.map((p) => (
                            <option key={p.nilai} value={p.nilai}>
                              {p.label}
                            </option>
                          ))}
                        </select>
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
    </div>
  );
}
