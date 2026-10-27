import { useEffect, useState } from "react";
import { gasCall, type HasilGas, type SoalGas, type UjianGas } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { soalHTML } from "@/lib/soal-format";
import {
  BookOpen,
  CheckCheck,
  Lock,
  PenLine,
  RefreshCw,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

/** Rekap hasil per ujian (guru & admin). */
export function HasilUjian() {
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [pilih, setPilih] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilGas[] | null>(null);
  const [versi, setVersi] = useState(0);
  const [koreksi, setKoreksi] = useState<HasilGas | null>(null);

  // Muat daftar ujian
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

  // Muat hasil ujian terpilih
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
  }, [pilih, versi]);

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
            Pilihan ganda dinilai otomatis (100 poin/soal); essay & uraian
            dikoreksi manual lewat tombol Koreksi. Total pelanggaran ikut
            tercatat.
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
                <table className="w-full min-w-[820px] text-sm">
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
                      <th className="px-5 py-3 text-right">Koreksi</th>
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
                          {(h.menunggu ?? 0) > 0 && (
                            <span className="mt-1 block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              {h.menunggu} menunggu koreksi
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                          {h.timestamp
                            ? new Date(h.timestamp).toLocaleString("id-ID", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`gap-1.5 ${
                              (h.menunggu ?? 0) > 0
                                ? "border-amber-600 text-amber-700 hover:text-amber-800"
                                : ""
                            }`}
                            onClick={() => setKoreksi(h)}
                          >
                            <PenLine className="size-3.5" />
                            {(h.menunggu ?? 0) > 0 ? "Koreksi" : "Periksa"}
                          </Button>
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

      <DialogKoreksi
        target={koreksi}
        onTutup={() => setKoreksi(null)}
        onSelesai={() => setVersi((v) => v + 1)}
      />
    </div>
  );
}

/** Layar koreksi manual */
function DialogKoreksi({
  target,
  onTutup,
  onSelesai,
}: {
  target: HasilGas | null;
  onTutup: () => void;
  onSelesai: () => void;
}) {
  const [soal, setSoal] = useState<SoalGas[] | null>(null);
  const [jawaban, setJawaban] = useState<
    Record<string, { teks: string; skor: number | null }>
  >({});
  const [skor, setSkor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    let hidup = true;
    setSoal(null);
    setJawaban({});
    setSkor({});
    Promise.all([
      gasCall<{ soal: SoalGas[] }>("getKoreksi", { ujian_id: target.ujian_id }),
      gasCall<{
        jawaban: Record<string, { teks: string; skor: number | null }>;
      }>("getJawabanKoreksi", { hasil_id: target.id }),
    ])
      .then(([k, j]) => {
        if (!hidup) return;
        setSoal(k.soal);
        setJawaban(j.jawaban);
        const awal: Record<string, string> = {};
        for (const [id, b] of Object.entries(j.jawaban)) {
          if (b.skor !== null && b.skor !== undefined) awal[id] = String(b.skor);
        }
        setSkor(awal);
      })
      .catch((err) => {
        if (!hidup) return;
        toast.error(err instanceof Error ? err.message : "Gagal memuat data koreksi.");
        setSoal([]);
      });
    return () => {
      hidup = false;
    };
  }, [target]);

  const simpan = async () => {
    if (!target) return;
    const muatan: Record<string, number> = {};
    for (const s of soal ?? []) {
      if (!(s.id in jawaban)) continue;
      const v = Number(skor[s.id] ?? "");
      if (!Number.isFinite(v)) continue;
      muatan[s.id] = Math.max(0, Math.min(100, Math.round(v)));
    }
    if (Object.keys(muatan).length === 0) {
      toast.error(
        "Isi skor 0–100 minimal satu jawaban — siswa ini belum mengirim jawaban teks.",
      );
      return;
    }
    setBusy(true);
    try {
      const res = await gasCall<{ message?: string }>("simpanKoreksi", {
        hasil_id: target.id,
        skor: muatan,
      });
      toast.success(res.message ?? "Koreksi tersimpan — nilai dihitung ulang.");
      onSelesai();
      onTutup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan koreksi.");
    } finally {
      setBusy(false);
    }
  };

  const adaJawaban = (soal ?? []).some((s) => s.id in jawaban);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onTutup()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Koreksi manual</DialogTitle>
          <DialogDescription>
            {target
              ? `${target.nama} (${target.kelas}) — ${target.ujian_judul}`
              : ""}
            . Beri skor 0–100 per jawaban; nilai akhir dihitung ulang otomatis
            saat disimpan.
          </DialogDescription>
        </DialogHeader>

        {soal === null ? (
          <Skeleton className="h-40 w-full" />
        ) : soal.length === 0 ? (
          <Empty className="rounded-3xl border border-dashed border-border/70 py-10">
            <EmptyContent>
              <EmptyTitle>Tidak ada soal essay/uraian</EmptyTitle>
              <EmptyDescription>
                Ujian ini seluruhnya pilihan ganda — nilainya sudah final.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : !adaJawaban ? (
          <p className="rounded-2xl border border-border/70 bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Siswa ini belum mengirim jawaban teks untuk soal essay/uraian.
          </p>
        ) : (
          <ol className="space-y-4">
            {soal.map((s, i) => {
              const j = jawaban[s.id];
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-border/70 bg-background/60 p-4"
                >
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Soal {i + 1}
                    <Badge variant="outline" className="text-[10px] normal-case">
                      {(s.tipe ?? "") === "uraian" ? "Uraian" : "Essay"}
                    </Badge>
                    {j?.skor !== null && j?.skor !== undefined && (
                      <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        sudah dinilai
                      </span>
                    )}
                  </p>
                  <div
                    className="mt-1.5 text-sm font-semibold leading-6"
                    dangerouslySetInnerHTML={{ __html: soalHTML(s.pertanyaan) }}
                  />

                  {s.bacaan && (
                    <div className="mt-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                        <BookOpen className="size-3" /> Bacaan
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">
                        {s.bacaan}
                      </p>
                    </div>
                  )}

                  {s.kunci_teks && (
                    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        <PenLine className="size-3" /> Kunci / rubrik
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">
                        {s.kunci_teks}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 grid gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Jawaban siswa
                    </p>
                    {j ? (
                      <p className="whitespace-pre-wrap rounded-xl border border-border/70 bg-card px-3 py-2.5 text-sm leading-6">
                        {j.teks}
                      </p>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                        Tidak dijawab.
                      </p>
                    )}
                  </div>

                  {j && (
                    <div className="mt-3 flex items-center gap-3">
                      <label
                        htmlFor={`skor-${s.id}`}
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        Skor (0–100)
                      </label>
                      <Input
                        id={`skor-${s.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={skor[s.id] ?? ""}
                        onChange={(e) =>
                          setSkor((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        className="w-24 text-right font-bold"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onTutup} disabled={busy}>
            Batal
          </Button>
          <Button className="gap-2" onClick={simpan} disabled={busy || soal === null}>
            <CheckCheck className="size-4" />
            {busy ? "Menyimpan…" : "Simpan & hitung ulang nilai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}