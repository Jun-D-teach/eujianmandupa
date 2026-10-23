import { useEffect, useMemo, useState } from "react";
import {
  gasCall,
  type HasilGas,
  type KoreksiJawabanGas,
  type KoreksiSoalGas,
  type UjianGas,
} from "@/lib/api";
import { soalHTML } from "@/lib/soal-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  CircleDashed,
  Save,
  Trophy,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

const LABEL_TIPE: Record<string, string> = { essay: "Essay", uraian: "Uraian" };

/** Tampilan poin (float) — buang desimal nol di belakang (7.5 → 7.5, 8.0 → 8). */
function formatPoin(poin: number | undefined): string {
  const n = Number(poin ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Layar Koreksi Nilai — guru/admin menilai jawaban essay & uraian satu per
 * satu kiriman siswa. Pilihan ganda dinilai otomatis server, jadi tidak muncul
 * di sini. Setelah disimpan, poin & nilai akhir dihitung ulang di server.
 */
export function KoreksiNilai() {
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [pilihUjian, setPilihUjian] = useState<string | null>(null);

  // Soal essay/uraian (acuan) + daftar kiriman siswa untuk ujian terpilih.
  const [soal, setSoal] = useState<KoreksiSoalGas[]>([]);
  const [hasil, setHasil] = useState<HasilGas[] | null>(null);
  const [memuat, setMemuat] = useState(false);

  // Kiriman siswa terpilih + jawaban teksnya.
  const [pilihHasil, setPilihHasil] = useState<string | null>(null);
  const [jawaban, setJawaban] = useState<KoreksiJawabanGas[] | null>(null);
  const [skor, setSkor] = useState<Record<string, string>>({});
  const [simpan, setSimpan] = useState(false);

  // Daftar ujian (sekali).
  useEffect(() => {
    let hidup = true;
    gasCall<{ ujian: UjianGas[] }>("getUjian")
      .then((res) => {
        if (!hidup) return;
        setUjian(res.ujian);
        setPilihUjian((s) => s ?? res.ujian[0]?.id ?? null);
      })
      .catch((err) => {
        if (hidup) {
          setUjian([]);
          toast.error(err instanceof Error ? err.message : "Gagal memuat daftar ujian.");
        }
      });
    return () => {
      hidup = false;
    };
  }, []);

  // Muat soal essay/uraian + kiriman siswa saat ujian berubah.
  useEffect(() => {
    setPilihHasil(null);
    setJawaban(null);
    setSkor({});
    if (!pilihUjian) {
      setSoal([]);
      setHasil(null);
      return;
    }
    let hidup = true;
    setMemuat(true);
    setHasil(null);
    gasCall<{ soal: KoreksiSoalGas[]; hasil: HasilGas[] }>("getKoreksi", {
      ujian_id: pilihUjian,
    })
      .then((res) => {
        if (!hidup) return;
        setSoal(res.soal);
        setHasil(res.hasil);
      })
      .catch((err) => {
        if (hidup) {
          setSoal([]);
          setHasil([]);
          toast.error(err instanceof Error ? err.message : "Gagal memuat data koreksi.");
        }
      })
      .finally(() => {
        if (hidup) setMemuat(false);
      });
    return () => {
      hidup = false;
    };
  }, [pilihUjian]);

  // Muat jawaban teks siswa terpilih + isi skor yang sudah ada.
  useEffect(() => {
    setSkor({});
    if (!pilihHasil) {
      setJawaban(null);
      return;
    }
    let hidup = true;
    setJawaban(null);
    gasCall<{ jawaban: KoreksiJawabanGas[] }>("getJawabanKoreksi", {
      hasil_id: pilihHasil,
    })
      .then((res) => {
        if (!hidup) return;
        setJawaban(res.jawaban);
        const awal: Record<string, string> = {};
        for (const j of res.jawaban) {
          if (j.skor !== null && j.skor !== undefined) awal[j.id_soal] = String(j.skor);
        }
        setSkor(awal);
      })
      .catch((err) => {
        if (hidup) {
          setJawaban([]);
          toast.error(err instanceof Error ? err.message : "Gagal memuat jawaban siswa.");
        }
      });
    return () => {
      hidup = false;
    };
  }, [pilihHasil]);

  const perSoal = useMemo(() => new Map((jawaban ?? []).map((j) => [j.id_soal, j])), [jawaban]);

  const setSkorSoal = (idSoal: string, nilai: string) => {
    const bersih = nilai.replace(/[^0-9]/g, "").slice(0, 3);
    setSkor((s) => ({ ...s, [idSoal]: bersih }));
  };

  const jumlahMenunggu = useMemo(
    () => soal.filter((s) => (skor[s.id] ?? "").trim() === "").length,
    [soal, skor],
  );

  const simpanKoreksi = async () => {
    if (!pilihHasil) return;
    const daftar = soal
      .filter((s) => (skor[s.id] ?? "").trim() !== "")
      .map((s) => ({ id_soal: s.id, skor: Math.max(0, Math.min(100, Number(skor[s.id]))) }));
    if (daftar.length === 0) {
      toast.error("Isi minimal satu skor (0–100) sebelum menyimpan.");
      return;
    }
    setSimpan(true);
    try {
      const res = await gasCall<{
        benar: number;
        poin: number;
        nilai: number;
        menunggu: number;
        total_soal: number;
        message?: string;
      }>("simpanKoreksi", { hasil_id: pilihHasil, skor: daftar });
      toast.success(res.message || "Koreksi tersimpan.");
      setHasil((hs) =>
        (hs ?? []).map((h) =>
          h.id === pilihHasil
            ? {
                ...h,
                benar: res.benar,
                poin: res.poin,
                nilai: res.nilai,
                menunggu: res.menunggu,
                total_soal: res.total_soal,
              }
            : h,
        ),
      );
      // Muat ulang jawaban agar skor tersimpan tampil (dan menunggu diperbarui).
      const ulang = await gasCall<{ jawaban: KoreksiJawabanGas[] }>("getJawabanKoreksi", {
        hasil_id: pilihHasil,
      });
      setJawaban(ulang.jawaban);
      const awal: Record<string, string> = {};
      for (const j of ulang.jawaban) {
        if (j.skor !== null && j.skor !== undefined) awal[j.id_soal] = String(j.skor);
      }
      setSkor(awal);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan koreksi.");
    } finally {
      setSimpan(false);
    }
  };

  if (ujian === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const kirimanTerpilih = (hasil ?? []).find((h) => h.id === pilihHasil) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Koreksi nilai</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nilai jawaban essay &amp; uraian ditentukan manual di sini. Pilihan
            ganda dinilai otomatis server. Setiap skor 0–100, nilai akhir
            dihitung ulang otomatis.
          </p>
        </div>
      </div>

      {ujian.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada ujian</EmptyTitle>
            <EmptyDescription>Buat ujian dulu di tab Kelola Ujian.</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {ujian.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setPilihUjian(u.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  pilihUjian === u.id
                    ? "bg-ink text-white"
                    : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.judul}
              </button>
            ))}
          </div>

          {memuat ? (
            <Skeleton className="h-64 w-full" />
          ) : soal.length === 0 ? (
            <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
              <EmptyContent>
                <EmptyTitle>Tidak ada yang dikoreksi manual</EmptyTitle>
                <EmptyDescription>
                  Ujian ini hanya berisi pilihan ganda — semuanya dinilai otomatis.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
              {/* Daftar kiriman siswa */}
              <Card className="h-fit overflow-hidden border-border/70">
                <div className="border-b border-border/60 bg-muted/60 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Kiriman siswa
                  </p>
                </div>
                {hasil === null ? (
                  <div className="p-4">
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : hasil.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Belum ada siswa mengirim jawaban.
                  </p>
                ) : (
                  <ul className="max-h-[520px] divide-y divide-border/60 overflow-y-auto">
                    {hasil.map((h) => {
                      const aktif = h.id === pilihHasil;
                      const menunggu = (h.menunggu ?? 0) > 0;
                      return (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => setPilihHasil(h.id)}
                            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                              aktif ? "bg-ink text-white" : "hover:bg-muted/60"
                            }`}
                          >
                            <span
                              className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                                aktif ? "bg-white/15 text-white" : "bg-accent text-accent-foreground"
                              }`}
                            >
                              <UserRound className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {h.nama}
                              </span>
                              <span
                                className={`block text-xs ${aktif ? "text-white/70" : "text-muted-foreground"}`}
                              >
                                {h.kelas} · Nilai {h.nilai}
                              </span>
                            </span>
                            {menunggu ? (
                              <Badge
                                variant="secondary"
                                className={aktif ? "bg-white/20 text-white" : "bg-amber-500/15 text-amber-700"}
                              >
                                {h.menunggu} ⌛
                              </Badge>
                            ) : (
                              <CheckCircle2
                                className={`size-4 shrink-0 ${aktif ? "text-white/80" : "text-emerald-600"}`}
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              {/* Panel koreksi */}
              <div className="space-y-4">
                {!kirimanTerpilih ? (
                  <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
                    <EmptyContent>
                      <EmptyTitle>Pilih kiriman siswa</EmptyTitle>
                      <EmptyDescription>
                        Pilih salah satu siswa di daftar untuk mulai mengoreksi
                        jawaban essay &amp; uraian.
                      </EmptyDescription>
                    </EmptyContent>
                  </Empty>
                ) : jawaban === null ? (
                  <Skeleton className="h-72 w-full" />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
                      <div>
                        <p className="text-base font-bold tracking-tight">
                          {kirimanTerpilih.nama}
                          <span className="ml-2 text-sm font-medium text-muted-foreground">
                            {kirimanTerpilih.kelas}
                          </span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Trophy className="size-3.5" /> Nilai saat ini:{" "}
                          <strong className="text-foreground">{kirimanTerpilih.nilai}</strong>
                          <span className="mx-1">·</span> Poin{" "}
                          <strong className="text-foreground">
                            {formatPoin(kirimanTerpilih.poin)}
                          </strong>
                          {jumlahMenunggu > 0 && (
                            <>
                              <span className="mx-1">·</span>
                              <span className="font-semibold text-amber-700">
                                {jumlahMenunggu} belum dinilai
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setPilihHasil(null)}
                        >
                          Tutup
                        </Button>
                        <Button size="sm" className="gap-2" onClick={simpanKoreksi} disabled={simpan}>
                          <Save className="size-4" />
                          {simpan ? "Menyimpan…" : "Simpan koreksi"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {soal.map((s) => {
                        const j = perSoal.get(s.id);
                        const nilaiSkor = skor[s.id] ?? "";
                        const dinilai = nilaiSkor.trim() !== "";
                        return (
                          <Card key={s.id} className="border-border/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Soal {s.nomor} · {LABEL_TIPE[s.tipe] ?? s.tipe}
                              </p>
                              {dinilai ? (
                                <Badge variant="secondary" className="gap-1 bg-emerald-500/15 text-emerald-700">
                                  <CircleDashed className="size-3" /> Dinilai {nilaiSkor}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-700">
                                  <CircleDashed className="size-3" /> Menunggu
                                </Badge>
                              )}
                            </div>

                            {s.bacaan && (
                              <div className="mt-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground">
                                <div dangerouslySetInnerHTML={{ __html: soalHTML(s.bacaan) }} />
                              </div>
                            )}
                            <div
                              className="mt-2 text-sm font-semibold leading-6"
                              dangerouslySetInnerHTML={{ __html: soalHTML(s.pertanyaan) }}
                            />

                            <div className="mt-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Jawaban siswa
                              </p>
                              {j && j.teks.trim() !== "" ? (
                                <div className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm leading-6">
                                  {j.teks}
                                </div>
                              ) : (
                                <p className="mt-1 rounded-xl border border-dashed border-border/70 px-3 py-2 text-sm italic text-muted-foreground">
                                  Siswa tidak mengisi jawaban teks ini.
                                </p>
                              )}
                            </div>

                            {s.kunci_teks && (
                              <div className="mt-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Acuan koreksi (kunci)
                                </p>
                                <div className="mt-1 whitespace-pre-wrap rounded-xl border border-emerald-600/30 bg-emerald-500/5 px-3 py-2 text-sm leading-6 text-emerald-900 dark:text-emerald-100">
                                  {s.kunci_teks}
                                </div>
                              </div>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Label
                                htmlFor={`skor-${s.id}`}
                                className="text-xs font-semibold text-muted-foreground"
                              >
                                Skor (0–100)
                              </Label>
                              <Input
                                id={`skor-${s.id}`}
                                type="number"
                                min={0}
                                max={100}
                                inputMode="numeric"
                                value={nilaiSkor}
                                onChange={(e) => setSkorSoal(s.id, e.target.value)}
                                className="h-9 w-20 text-center font-bold"
                                placeholder="—"
                              />
                              {[0, 50, 100].map((n) => (
                                <Button
                                  key={n}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2.5 text-xs"
                                  onClick={() => setSkorSoal(s.id, String(n))}
                                >
                                  {n}
                                </Button>
                              ))}
                            </div>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="flex justify-end">
                      <Button className="gap-2" onClick={simpanKoreksi} disabled={simpan}>
                        <Save className="size-4" />
                        {simpan ? "Menyimpan…" : "Simpan koreksi"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
