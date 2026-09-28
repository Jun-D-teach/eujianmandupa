import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { gasCall, type HasilGas, type UjianGas } from "@/lib/api";
import { muatSesi, hapusSesi, type SesiUjian } from "@/lib/exam-storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  ClipboardList,
  History,
  KeyRound,
  Pencil,
  PlayCircle,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Daftar ujian aktif (tanpa token) + pintasan melanjutkan sesi tersimpan. */
export function SiswaUjian() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ujian, setUjian] = useState<UjianGas[] | null>(null); // null = memuat
  const [error, setError] = useState<string | null>(null);
  const [versi, setVersi] = useState(0); // memicu muat ulang daftar/sesi

  useEffect(() => {
    let hidup = true;
    setUjian(null);
    setError(null);
    gasCall<{ ujian: UjianGas[] }>("getUjianSiswa")
      .then((res) => {
        if (hidup) setUjian(res.ujian);
      })
      .catch((err) => {
        if (hidup)
          setError(err instanceof Error ? err.message : "Gagal memuat ujian.");
      });
    return () => {
      hidup = false;
    };
  }, [versi]);

  if (error) {
    return (
      <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
        <EmptyContent>
          <EmptyTitle>Gagal memuat</EmptyTitle>
          <EmptyDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setVersi((v) => v + 1)}
            >
              Coba lagi
            </Button>
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  if (ujian === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Ujian aktif</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Unduh soal tanpa token; token dimasukkan saat mulai ujian sesuai
              yang dibagikan pengawas ruang.
            </p>
            {user?.kelas && (
              <p className="mt-1 text-xs text-muted-foreground">
                Kelas: {user.kelas}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVersi((v) => v + 1)}
          >
            Muat ulang
          </Button>
        </div>

        {ujian.length === 0 ? (
          <Empty className="mt-6 rounded-3xl border border-dashed border-border/70 py-14">
            <EmptyContent>
              <EmptyTitle>Belum ada ujian aktif</EmptyTitle>
              <EmptyDescription>
                Admin belum mengaktifkan ujian. Token akan dibagikan pengawas
                ruang saat ujian dimulai.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {ujian.map((u) => {
              const sesi: SesiUjian | null = muatSesi(u.id);
              const lanjut = sesi && sesi.fase !== "setup";
              return (
                <Card
                  key={u.id}
                  className="group relative overflow-hidden border-border/70 shadow-[0_1px_2px_rgba(16,20,24,0.04)] transition-shadow hover:shadow-[0_18px_40px_-26px_rgba(16,20,24,0.4)]"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                        <ClipboardList className="size-5" />
                      </span>
                      <Badge variant="secondary">
                        {u.jumlah_soal} soal · {u.durasi_menit} menit
                      </Badge>
                    </div>

                    <h3 className="mt-4 text-lg font-bold leading-6 tracking-tight">
                      {u.judul}
                    </h3>
                    {u.deskripsi && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {u.deskripsi}
                      </p>
                    )}

                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      <KeyRound className="size-3" />
                      Token dibagikan pengawas saat mulai ujian
                    </p>

                    {lanjut && (
                      <p className="mt-2 text-xs font-semibold text-emerald-700">
                        Sesi tersimpan · fase {sesi!.fase}
                      </p>
                    )}

                    <div className="mt-5 flex items-center gap-2">
                      <Button
                        className="gap-2"
                        onClick={() => navigate(`/ujian/${u.id}`)}
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
                            hapusSesi(u.id);
                            toast.success("Sesi dihapus, mulai dari awal.");
                            setVersi((v) => v + 1);
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

/** Riwayat nilai milik siswa (dicocokkan dari nama di sheet Hasil). */
export function SiswaRiwayat() {
  const { user } = useAuth();
  const [hasil, setHasil] = useState<HasilGas[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    setHasil(null);
    setError(null);
    gasCall<{ hasil: HasilGas[] }>("getHasilSaya", { nama: user?.nama ?? "" })
      .then((res) => {
        if (hidup) setHasil(res.hasil);
      })
      .catch((err) => {
        if (hidup)
          setError(err instanceof Error ? err.message : "Gagal memuat riwayat.");
      });
    return () => {
      hidup = false;
    };
  }, [user?.nama]);

  if (error) {
    return (
      <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
        <EmptyContent>
          <EmptyTitle>Gagal memuat</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  if (hasil === null) {
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
                  <tr key={h.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3.5 font-semibold">{h.ujian_judul}</td>
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
                      {h.timestamp
                        ? new Date(h.timestamp).toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
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
