import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { muatSesi, hapusSesi, type SesiUjian } from "@/lib/exam-storage";
import {
  ArrowRight,
  ClipboardList,
  History,
  Pencil,
  PlayCircle,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

function statusSesi(ujianId: string): SesiUjian | null {
  return muatSesi(ujianId);
}

/** Daftar ujian aktif + pintasan melanjutkan sesi tersimpan. */
export function SiswaUjian() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const ujian = useQuery(api.ujian.listAktif);
  const perbarui = useMutation(api.profil.perbarui);
  const [nama, setNama] = useState(user?.name ?? "");
  const [kelas, setKelas] = useState(user?.kelas ?? "");
  const [saving, setSaving] = useState(false);
  const [, setSegarkan] = useState(0);

  const profilLengkap = Boolean(user?.name && user?.kelas);

  const simpanProfil = async () => {
    if (!nama.trim() || !kelas.trim()) {
      toast.error("Nama dan kelas wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await perbarui({ nama: nama.trim(), kelas: kelas.trim() });
      toast.success("Data tersimpan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  if (ujian === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!profilLengkap && (
        <Card className="border-border/70">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="nama">Nama lengkap</Label>
                <Input
                  id="nama"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="cth. Ayu Lestari"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kelas">Kelas</Label>
                <Input
                  id="kelas"
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                  placeholder="cth. XII-IPA-2"
                />
              </div>
            </div>
            <Button onClick={simpanProfil} disabled={saving}>
              Simpan data
            </Button>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Ujian aktif</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Unduh soal saat online, kerjakan setelah internet dimatikan.
            </p>
          </div>
        </div>

        {ujian.length === 0 ? (
          <Empty className="mt-6 rounded-3xl border border-dashed border-border/70 py-14">
            <EmptyContent>
              <EmptyTitle>Belum ada ujian aktif</EmptyTitle>
              <EmptyDescription>
                Pengawas atau guru belum mengaktifkan ujian untukmu.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {ujian.map((u) => {
              const sesi = statusSesi(u._id);
              const lanjut = sesi && sesi.fase !== "setup";
              return (
                <Card
                  key={u._id}
                  className="group relative overflow-hidden border-border/70 shadow-[0_1px_2px_rgba(16,20,24,0.04)] transition-shadow hover:shadow-[0_18px_40px_-26px_rgba(16,20,24,0.4)]"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                        <ClipboardList className="size-5" />
                      </span>
                      <Badge variant="secondary">{u.jumlah_soal} soal</Badge>
                    </div>

                    <h3 className="mt-4 text-lg font-bold leading-6 tracking-tight">
                      {u.judul}
                    </h3>
                    {u.deskripsi && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {u.deskripsi}
                      </p>
                    )}

                    {lanjut && (
                      <p className="mt-3 text-xs font-semibold text-emerald-700">
                        Sesi tersimpan · fase {sesi!.fase}
                      </p>
                    )}

                    <div className="mt-5 flex items-center gap-2">
                      <Button
                        className="gap-2"
                        onClick={() => navigate(`/ujian/${u._id}`)}
                      >
                        {lanjut ? (
                          <>
                            <PlayCircle className="size-4" /> Lanjutkan
                          </>
                        ) : (
                          <>
                            <ArrowRight className="size-4" /> Kerjakan
                          </>
                        )}
                      </Button>
                      {sesi && sesi.fase === "setup" && (
                        <Button
                          variant="ghost"
                          className="gap-2 text-muted-foreground"
                          onClick={() => {
                            hapusSesi(u._id);
                            toast.success("Sesi dihapus, mulai dari awal.");
                            setSegarkan((n) => n + 1);
                          }}
                        >
                          <Pencil className="size-4" /> Mulai ulang
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Riwayat nilai milik siswa. */
export function SiswaRiwayat() {
  const hasil = useQuery(api.hasil.saya);

  if (hasil === undefined) {
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
        <h1 className="text-2xl font-extrabold tracking-tight">Riwayat nilai</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nilai dihitung otomatis di server saat jawaban terkirim.
        </p>
      </div>

      {hasil.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada nilai</EmptyTitle>
            <EmptyDescription>
              Nilai akan muncul setelah kamu mengirim jawaban ujian.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="overflow-hidden border-border/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Ujian</th>
                  <th className="px-5 py-3">Kelas</th>
                  <th className="px-5 py-3">Benar</th>
                  <th className="px-5 py-3">Pelanggaran</th>
                  <th className="px-5 py-3 text-right">Nilai</th>
                  <th className="px-5 py-3 text-right">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {hasil.map((h) => (
                  <tr key={h._id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5 font-semibold">{h.judul_ujian}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{h.kelas}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {h.benar}/{h.total_soal}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          h.total_pelanggaran > 0
                            ? "bg-red-500/10 text-red-600"
                            : "bg-emerald-500/10 text-emerald-700"
                        }`}
                      >
                        <History className="size-3.5" />
                        {h.total_pelanggaran}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1.5 font-bold">
                        <Trophy className="size-4 text-emerald-600" />
                        {h.nilai}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                      {new Date(h.timestamp).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
