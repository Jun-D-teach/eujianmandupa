import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { gasCall, simpanPinTersimpan, type HasilGas, type SoalGas, type UjianGas } from "@/lib/api";
import {
  muatSesi,
  simpanSesi,
  hapusSesi,
  type SesiUjian,
} from "@/lib/exam-storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Download,
  History,
  KeyRound,
  Pencil,
  PlayCircle,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Jadwal ramah baca: Jumat, 12 Oktober 2026 pukul 08.00. */
function jadwalLabel(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
}

/** Belum sampai waktu mulai? */
function belumWaktunya(v?: string): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  return !Number.isNaN(t) && Date.now() < t;
}

/**
 * Lampu status unduhan per mapel:
 * kuning = admin sudah klik "Bagikan" (siap diunduh),
 * hijau  = soal sudah selesai diunduh & tersimpan di HP ini,
 * mati   = belum dibagikan admin / di luar sasaran kelas.
 */
function LampuStatus({
  warna,
  teks,
}: {
  warna: "kuning" | "hijau" | "mati";
  teks: string;
}) {
  const titik =
    warna === "hijau"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]"
      : warna === "kuning"
        ? "animate-pulse bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]"
        : "bg-border";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <span className={`size-2.5 rounded-full ${titik}`} aria-hidden />
      {teks}
    </span>
  );
}

/**
 * Bangun sesi ujian baru hasil unduhan langsung dari beranda — fase
 * "instruksi" (siap terima token pengawas saat waktunya ujian).
 */
function baruSesiUnduh(
  ujianId: string,
  data: { ujian: UjianGas; soal: SoalGas[]; token_hash?: string },
  nama: string,
  kelas: string,
): SesiUjian {
  return {
    versi: 1,
    ujianId,
    judul: data.ujian.judul,
    deskripsi: data.ujian.deskripsi,
    fase: "instruksi",
    nama,
    kelas,
    tokenHash: data.token_hash,
    durasi_menit: data.ujian.durasi_menit,
    revisi: data.ujian.revisi,
    tglMulai: data.ujian.tgl_mulai || undefined,
    unduhPada: Date.now(),
    soal: data.soal.map((s) => ({
      id: s.id,
      pertanyaan: s.pertanyaan,
      opsi_a: s.opsi_a,
      opsi_b: s.opsi_b,
      opsi_c: s.opsi_c,
      opsi_d: s.opsi_d,
      opsi_e: s.opsi_e || undefined,
      gambar: s.gambar || undefined,
      opsi_huruf: s.opsi_huruf || undefined,
    })),
    jawaban: {},
    indeks: 0,
    strike: 0,
    pelanggaran: [],
  };
}

/** Daftar ujian aktif (tanpa token) + pintasan melanjutkan sesi tersimpan. */
export function SiswaUjian() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();
  const [ujian, setUjian] = useState<UjianGas[] | null>(null); // null = memuat
  const [error, setError] = useState<string | null>(null);
  const [versi, setVersi] = useState(0); // memicu muat ulang daftar/sesi
  const [sinkronBusy, setSinkronBusy] = useState<string | null>(null);
  const [unduhBusy, setUnduhBusy] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    setUjian(null);
    setError(null);
    gasCall<{ ujian: UjianGas[] }>("getUjianSiswa", { kelas: user?.kelas ?? "" })
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
  }, [versi, user?.kelas]);

  /**
   * Sinkron ulang soal — dipakai saat guru memperbaiki soal setelah siswa
   * mengunduh. Hanya untuk sesi yang BELUM dimulai; jawaban yang sudah ada
   * tetap dipertahankan untuk id soal yang tidak berubah.
   */
  const sinkronUlang = async (u: UjianGas) => {
    const sesiLama = muatSesi(u.id);
    if (!sesiLama) return;
    if (!online) {
      toast.error("Nyalakan internet sementara untuk sinkron ulang soal.");
      return;
    }
    setSinkronBusy(u.id);
    try {
      const data = await gasCall<{
        ujian: UjianGas;
        soal: SoalGas[];
        token_hash?: string;
        pin_pengawas?: string;
      }>("getSoal", { id: u.id, kelas: sesiLama.kelas });
      if (
        typeof data.pin_pengawas === "string" &&
        /^\d{6}$/.test(data.pin_pengawas)
      ) {
        simpanPinTersimpan(data.pin_pengawas);
      }
      const idBaru = new Set(data.soal.map((s) => s.id));
      const jawaban: SesiUjian["jawaban"] = {};
      for (const [k, v] of Object.entries(sesiLama.jawaban)) {
        if (idBaru.has(k)) jawaban[k] = v;
      }
      const baru: SesiUjian = {
        ...sesiLama,
        revisi: data.ujian.revisi,
        tokenHash: data.token_hash ?? sesiLama.tokenHash,
        soal: data.soal.map((s) => ({
          id: s.id,
          pertanyaan: s.pertanyaan,
          opsi_a: s.opsi_a,
          opsi_b: s.opsi_b,
          opsi_c: s.opsi_c,
          opsi_d: s.opsi_d,
          opsi_e: s.opsi_e || undefined,
          gambar: s.gambar || undefined,
          opsi_huruf: s.opsi_huruf || undefined,
        })),
        jawaban,
        indeks: Math.max(0, Math.min(sesiLama.indeks, data.soal.length - 1)),
      };
      simpanSesi(baru);
      toast.success(
        `Soal diperbarui — ${baru.soal.length} soal terbaru tersimpan di HP.`,
      );
      setVersi((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal sinkron ulang soal.");
    } finally {
      setSinkronBusy(null);
    }
  };

  /**
   * Unduh soal LANGSUNG dari beranda (tanpa token) — hanya untuk mapel yang
   * sudah dibagikan admin (lampu kuning). Sesi dibuat fase "instruksi",
   * jadi lampu langsung hijau dan siswa tinggal masuk saat waktunya ujian.
   */
  const unduhMapel = async (u: UjianGas) => {
    if (!online) {
      toast.error("Nyalakan internet sementara untuk mengunduh soal.");
      return;
    }
    const nama = user?.nama ?? "";
    const kelas = user?.kelas ?? "";
    if (!nama || !kelas) {
      toast.error("Nama/kelas akun belum lengkap — minta admin perbarui data siswa.");
      return;
    }
    setUnduhBusy(u.id);
    try {
      const data = await gasCall<{
        ujian: UjianGas;
        soal: SoalGas[];
        token_hash?: string;
        pin_pengawas?: string;
      }>("getSoal", { id: u.id, kelas });
      if (
        typeof data.pin_pengawas === "string" &&
        /^\d{6}$/.test(data.pin_pengawas)
      ) {
        simpanPinTersimpan(data.pin_pengawas);
      }
      if (data.soal.length === 0) {
        throw new Error("Ujian ini belum memiliki soal.");
      }
      simpanSesi(baruSesiUnduh(u.id, data, nama, kelas));
      toast.success(`${data.soal.length} soal tersimpan di HP — lampu hijau.`);
      setVersi((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunduh soal.");
    } finally {
      setUnduhBusy(null);
    }
  };

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
              Alurnya: <strong>admin membagikan</strong> (lampu kuning) →
              unduh semua mapel → <strong> matikan internet</strong> → masukkan
              token pengawas → kerjakan → nyalakan internet lagi untuk
              mengirim.
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
              const lanjut =
                sesi && (sesi.fase === "ujian" || sesi.fase === "kirim");
              const takBoleh = u.boleh === false; // server: kelas tidak termasuk sasaran
              const izin = u.boleh_unduh !== false; // izin bagikan dari admin
              // Soal benar-benar tersimpan di HP ini — syarat bisa mengerjakan.
              const adaSoalLokal = Boolean(sesi && sesi.soal.length > 0);
              const terkunciJadwal = belumWaktunya(u.tgl_mulai);
              // Guru memperbaiki soal setelah unduhan dibuat → wajib sinkron ulang.
              const revisiBeda = Boolean(
                sesi &&
                  typeof u.revisi === "number" &&
                  (sesi.revisi ?? 1) !== u.revisi,
              );
              const bisaSinkron =
                revisiBeda &&
                sesi !== null &&
                (sesi.fase === "setup" || sesi.fase === "instruksi");
              return (
                <Card
                  key={u.id}
                  className={`group relative overflow-hidden border-border/70 shadow-[0_1px_2px_rgba(16,20,24,0.04)] transition-shadow hover:shadow-[0_18px_40px_-26px_rgba(16,20,24,0.4)] ${
                    takBoleh || !izin ? "opacity-70" : ""
                  }`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                        <ClipboardList className="size-5" />
                      </span>
                      <div className="flex flex-wrap justify-end gap-2">
                        <LampuStatus
                          warna={
                            takBoleh || !izin
                              ? "mati"
                              : adaSoalLokal
                                ? "hijau"
                                : "kuning"
                          }
                          teks={
                            takBoleh
                              ? "Di luar sasaran"
                              : !izin
                                ? "Belum dibagikan"
                                : adaSoalLokal
                                  ? "Sudah diunduh"
                                  : "Siap diunduh"
                          }
                        />
                        <Badge variant="secondary">
                          {u.jumlah_soal} soal · {u.durasi_menit} menit
                        </Badge>
                      </div>
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
                      <CalendarClock className="size-3" />
                      {u.tgl_mulai
                        ? `Pelaksanaan: ${jadwalLabel(u.tgl_mulai)}`
                        : "Tanpa jadwal tetap — langsung dikerjakan"}
                    </p>

                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                      <KeyRound className="size-3" />
                      Token pengawas dimasukkan saat Mulai Ujian (bisa offline)
                    </p>

                    {u.sasaran && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sasaran:{" "}
                        <span className="font-semibold text-foreground">{u.sasaran}</span>
                      </p>
                    )}

                    {takBoleh ? (
                      <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
                        Kelasmu tidak terdaftar untuk ujian ini.
                      </p>
                    ) : !izin ? (
                      <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
                        Admin belum membagikan mapel ini — lampu akan menyala
                        kuning saat siap diunduh.
                      </p>
                    ) : adaSoalLokal && lanjut ? (
                      <p className="mt-2 text-xs font-semibold text-emerald-700">
                        Sesi tersimpan · fase {sesi!.fase}
                      </p>
                    ) : null}

                    {revisiBeda && (
                      <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
                        {bisaSinkron
                          ? "Guru memperbaiki soal — sinkron ulang dulu saat online sebelum mengerjakan."
                          : "Guru memperbaiki soal — versi terbaru berlaku untuk pengerjaan berikutnya."}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      {takBoleh ? (
                        <Button disabled>Kerjakan</Button>
                      ) : !izin ? (
                        <Button disabled className="gap-2">
                          <Download className="size-4" /> Menunggu dibagikan
                        </Button>
                      ) : !adaSoalLokal ? (
                        <Button
                          className="gap-2"
                          disabled={!online || unduhBusy === u.id}
                          onClick={() => void unduhMapel(u)}
                        >
                          <Download
                            className={`size-4 ${
                              unduhBusy === u.id ? "animate-spin" : ""
                            }`}
                          />
                          {unduhBusy === u.id ? "Mengunduh…" : "Unduh Soal"}
                        </Button>
                      ) : (
                        <Button
                          className="gap-2"
                          disabled={terkunciJadwal || online}
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
                      )}
                      {bisaSinkron && (
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={!online || sinkronBusy === u.id}
                          onClick={() => void sinkronUlang(u)}
                        >
                          <RefreshCw
                            className={`size-4 ${
                              sinkronBusy === u.id ? "animate-spin" : ""
                            }`}
                          />
                          {sinkronBusy === u.id
                            ? "Sinkron…"
                            : "Sinkron ulang soal"}
                        </Button>
                      )}
                      {adaSoalLokal && sesi && sesi.fase === "setup" && (
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

                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      {takBoleh
                        ? "Hubungi admin bila menurutmu ini keliru."
                        : !izin
                          ? "Tunggu admin membagikan mapel ini (lampu kuning = siap diunduh)."
                          : !adaSoalLokal
                            ? online
                              ? "Klik Unduh Soal — soal disimpan ke HP. Saat waktunya ujian, matikan internet & masukkan token pengawas."
                              : "Nyalakan internet sementara untuk mengunduh soal."
                            : terkunciJadwal
                              ? `Baru bisa diklik & dikerjakan pada ${jadwalLabel(u.tgl_mulai)}.`
                              : online
                                ? "Soal sudah di HP — matikan WiFi/data seluler untuk mulai mengerjakan."
                                : "HP offline — siap mengerjakan ujian."}
                    </p>
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
