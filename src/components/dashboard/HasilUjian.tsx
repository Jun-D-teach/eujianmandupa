import { useEffect, useState } from "react";
import { gasCall, type HasilGas, type UjianGas } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, RefreshCw, ShieldAlert, Trophy } from "lucide-react";

/** Rekap hasil per ujian (guru & admin). */
export function HasilUjian() {
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [pilih, setPilih] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilGas[] | null>(null);
  const [versi, setVersi] = useState(0);

  // Muat daftar ujian (dengan token, untuk petugas).
  useEffect(() => {
    let hidup = true;
    setUjian(null);
    gasCall<{ ujian: UjianGas[] }>("getUjian")
      .then((res) => {
        if (!hidup) return;
        setUjian(res.ujian);
        setPilih((sebelumnya) => sebelumnya ?? res.ujian[0]?.id ?? null);
      })
      .catch(() => {
        if (hidup) setUjian([]);
      });
    return () => {
      hidup = false;
    };
  }, [versi]);

  // Muat hasil ujian terpilih.
  useEffect(() => {
    if (!pilih) {
      setHasil(null);
      return;
    }
    let hidup = true;
    setHasil(null);
    gasCall<{ hasil: HasilGas[] }>("getHasil", { ujian_id: pilih })
      .then((res) => {
        if (hidup) setHasil(res.hasil);
      })
      .catch(() => {
        if (hidup) setHasil([]);
      });
    return () => {
      hidup = false;
    };
  }, [pilih]);

  if (ujian === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Hasil ujian</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nilai dihitung server-side (Google Apps Script); total pelanggaran
            ikut tercatat.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setVersi((v) => v + 1)}
        >
          <RefreshCw className="size-4" /> Segarkan
        </Button>
      </div>

      {ujian.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada ujian</EmptyTitle>
            <EmptyDescription>
              Buat ujian dulu di tab Kelola Ujian.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {ujian.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setPilih(u.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  pilih === u.id
                    ? "bg-ink text-white"
                    : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.judul}
                <span className="ml-2 text-xs opacity-70">{u.jumlah_soal} soal</span>
              </button>
            ))}
          </div>

          <Card className="overflow-hidden border-border/70">
            {hasil === null ? (
              <div className="p-6">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : hasil.length === 0 ? (
              <Empty className="py-14">
                <EmptyContent>
                  <EmptyTitle>Belum ada jawaban masuk</EmptyTitle>
                  <EmptyDescription>
                    Hasil akan tampil setelah siswa mengirim jawabannya.
                  </EmptyDescription>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">#</th>
                      <th className="px-5 py-3">Nama</th>
                      <th className="px-5 py-3">Kelas</th>
                      <th className="px-5 py-3">Token</th>
                      <th className="px-5 py-3">Benar</th>
                      <th className="px-5 py-3">Pelanggaran</th>
                      <th className="px-5 py-3 text-right">Nilai</th>
                      <th className="px-5 py-3 text-right">Dikirim</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {hasil.map((h, i) => (
                      <tr key={h.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-3.5 font-bold text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-5 py-3.5 font-semibold">{h.nama}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {h.kelas}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold">
                            {h.token || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {h.benar}/{h.total_soal}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge
                            variant={
                              h.total_pelanggaran > 0 ? "destructive" : "secondary"
                            }
                            className="gap-1"
                          >
                            <ShieldAlert className="size-3.5" />
                            {h.total_pelanggaran}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="inline-flex items-center gap-1.5 font-bold">
                            <Trophy
                              className={`size-4 ${
                                h.nilai >= 75
                                  ? "text-emerald-600"
                                  : "text-muted-foreground"
                              }`}
                            />
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
            )}
          </Card>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Riwayat buka kunci tercatat di sheet "BukaKunci" saat pengawas
            membuka layar siswa dalam keadaan online.
          </p>
        </>
      )}
    </div>
  );
}
