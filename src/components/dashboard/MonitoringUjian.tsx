import { useEffect, useMemo, useState } from "react";
import { gasCall, type RuangGas, type UjianGas } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, RefreshCw, Search, Users } from "lucide-react";

type PesertaMonitoring = {
  ruang_id: string;
  ruang_nama: string;
  nisn: string;
  nama: string;
  kelas: string;
  kursi: number;
  ikut_ujian: boolean;
  sudah_kirim: boolean;
};

type DataMonitoring = {
  tanggal: string;
  mapel: string;
  versi: number;
  ruang: RuangGas[];
  peserta: PesertaMonitoring[];
  error?: string;
};

function labelTanggal(tanggal: string): string {
  return new Date(`${tanggal}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function MonitoringUjian() {
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [errorUjian, setErrorUjian] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [mapel, setMapel] = useState("");
  const [ruangId, setRuangId] = useState("semua");
  const [cari, setCari] = useState("");
  const [versi, setVersi] = useState(0);
  const [monitor, setMonitor] = useState<DataMonitoring | null>(null);

  useEffect(() => {
    let hidup = true;
    gasCall<{ ujian: UjianGas[] }>("getUjian")
      .then((res) => {
        if (!hidup) return;
        setUjian(res.ujian);
        const tanggalTersedia = [
          ...new Set(
            res.ujian
              .map((item) => item.tgl_mulai?.slice(0, 10) ?? "")
              .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
          ),
        ].sort((a, b) => b.localeCompare(a));
        setTanggal((sebelumnya) =>
          tanggalTersedia.includes(sebelumnya)
            ? sebelumnya
            : (tanggalTersedia[0] ?? ""),
        );
      })
      .catch((err) => {
        if (!hidup) return;
        setUjian([]);
        setErrorUjian(
          err instanceof Error ? err.message : "Gagal memuat daftar ujian.",
        );
      });
    return () => {
      hidup = false;
    };
  }, []);

  const tanggalTersedia = useMemo(
    () =>
      [
        ...new Set(
          (ujian ?? [])
            .map((item) => item.tgl_mulai?.slice(0, 10) ?? "")
            .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
        ),
      ].sort((a, b) => b.localeCompare(a)),
    [ujian],
  );

  const mapelTersedia = useMemo(() => {
    const unik = new Map<string, string>();
    for (const item of ujian ?? []) {
      if (item.tgl_mulai?.slice(0, 10) !== tanggal) continue;
      const nama = (item.mapel || item.judul || "").trim();
      const kunci = nama.toLocaleLowerCase("id");
      if (nama && !unik.has(kunci)) unik.set(kunci, nama);
    }
    return [...unik.values()].sort((a, b) => a.localeCompare(b, "id"));
  }, [ujian, tanggal]);

  const mapelEfektif =
    mapelTersedia.find(
      (item) => item.toLocaleLowerCase("id") === mapel.toLocaleLowerCase("id"),
    ) ??
    mapelTersedia[0] ??
    "";

  useEffect(() => {
    if (!tanggal || !mapelEfektif) return;
    let hidup = true;
    gasCall<{ ruang: RuangGas[]; peserta: PesertaMonitoring[] }>(
      "getMonitoringUjian",
      { tanggal, mapel: mapelEfektif },
    )
      .then((res) => {
        if (hidup) {
          setMonitor({
            tanggal,
            mapel: mapelEfektif,
            versi,
            ruang: res.ruang,
            peserta: res.peserta,
          });
        }
      })
      .catch((err) => {
        if (hidup) {
          setMonitor({
            tanggal,
            mapel: mapelEfektif,
            versi,
            ruang: [],
            peserta: [],
            error:
              err instanceof Error
                ? err.message
                : "Gagal memuat monitoring ujian.",
          });
        }
      });
    return () => {
      hidup = false;
    };
  }, [tanggal, mapelEfektif, versi]);

  const data =
    monitor?.tanggal === tanggal &&
    monitor.mapel === mapelEfektif &&
    monitor.versi === versi
      ? monitor
      : null;
  const pesertaRuang = useMemo(
    () =>
      (data?.peserta ?? []).filter(
        (peserta) => ruangId === "semua" || peserta.ruang_id === ruangId,
      ),
    [data?.peserta, ruangId],
  );
  const pesertaTampil = useMemo(() => {
    const kueri = cari.trim().toLocaleLowerCase("id");
    return pesertaRuang.filter(
      (peserta) =>
        !kueri ||
        peserta.nama.toLocaleLowerCase("id").includes(kueri) ||
        peserta.nisn.toLocaleLowerCase("id").includes(kueri) ||
        peserta.kelas.toLocaleLowerCase("id").includes(kueri),
    );
  }, [pesertaRuang, cari]);
  const pesertaSasaran = pesertaRuang.filter((peserta) => peserta.ikut_ujian);
  const sudahKirim = pesertaSasaran.filter((peserta) => peserta.sudah_kirim).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Monitor className="size-6 text-emerald-700" />
            Monitoring ujian
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau status siswa berdasarkan tanggal, ruang, dan mata pelajaran.
            Nilai ujian tidak ditampilkan.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!tanggal || !mapelEfektif || data === null}
          onClick={() => setVersi((n) => n + 1)}
        >
          <RefreshCw className="size-4" />
          Segarkan
        </Button>
      </div>

      {ujian === null ? (
        <Skeleton className="h-24 w-full" />
      ) : errorUjian ? (
        <Card className="p-5 text-sm text-destructive">{errorUjian}</Card>
      ) : tanggalTersedia.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">
          Belum ada ujian dengan tanggal yang dapat dimonitor.
        </Card>
      ) : (
        <>
          <Card className="grid gap-4 border-border/70 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
            <div className="grid gap-2">
              <label htmlFor="monitor-tanggal" className="text-sm font-semibold">
                Tanggal ujian
              </label>
              <Select value={tanggal} onValueChange={setTanggal}>
                <SelectTrigger id="monitor-tanggal">
                  <SelectValue placeholder="Pilih tanggal" />
                </SelectTrigger>
                <SelectContent>
                  {tanggalTersedia.map((item) => (
                    <SelectItem key={item} value={item}>
                      {labelTanggal(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="monitor-mapel" className="text-sm font-semibold">
                Mata pelajaran
              </label>
              <Select
                value={mapelEfektif}
                onValueChange={setMapel}
                disabled={mapelTersedia.length === 0}
              >
                <SelectTrigger id="monitor-mapel">
                  <SelectValue placeholder="Pilih mapel" />
                </SelectTrigger>
                <SelectContent>
                  {mapelTersedia.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="monitor-ruang" className="text-sm font-semibold">
                Ruang
              </label>
              <Select value={ruangId} onValueChange={setRuangId}>
                <SelectTrigger id="monitor-ruang">
                  <SelectValue placeholder="Semua ruang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua ruang</SelectItem>
                  {(data?.ruang ?? []).map((ruang) => (
                    <SelectItem key={ruang.id} value={ruang.id}>
                      {ruang.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="monitor-cari" className="text-sm font-semibold">
                Cari siswa
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="monitor-cari"
                  value={cari}
                  onChange={(event) => setCari(event.target.value)}
                  placeholder="Nama, NISN, atau kelas"
                  className="pl-9"
                />
              </div>
            </div>
          </Card>

          {data === null ? (
            <Skeleton className="h-64 w-full" />
          ) : data.error ? (
            <Card className="p-5 text-sm text-destructive">{data.error}</Card>
          ) : (
            <>
              <Card className="flex flex-wrap items-center justify-between gap-3 border-border/70 p-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4 text-muted-foreground" />
                    {sudahKirim} dari {pesertaSasaran.length} siswa sasaran sudah
                    mengirim
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pesertaRuang.length} siswa di ruang
                    {pesertaRuang.length - pesertaSasaran.length > 0 &&
                      ` · ${pesertaRuang.length - pesertaSasaran.length} di luar sasaran`}
                    {" · "}
                    {labelTanggal(tanggal)} ·{" "}
                    {ruangId === "semua"
                      ? "Semua ruang"
                      : data.ruang.find((ruang) => ruang.id === ruangId)?.nama ??
                        "Ruang"}
                    {" · "}
                    {mapelEfektif}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {pesertaTampil.length} siswa ditampilkan
                </span>
              </Card>

              <Card className="overflow-hidden border-border/70">
                {pesertaTampil.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {pesertaRuang.length === 0
                      ? "Tidak ada siswa ditempatkan pada pilihan ruang dan mapel ini."
                      : "Tidak ada siswa yang cocok dengan pencarian."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">No. kursi</th>
                          <th className="px-4 py-3">NISN</th>
                          <th className="px-4 py-3">Nama siswa</th>
                          <th className="px-4 py-3">Kelas</th>
                          <th className="px-4 py-3">Ruang</th>
                          <th className="px-4 py-3">Status ujian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {pesertaTampil.map((peserta) => (
                          <tr key={`${peserta.ruang_id}:${peserta.kursi}`}>
                            <td className="px-4 py-3 font-semibold">
                              {peserta.kursi}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {peserta.nisn}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              {peserta.nama}
                            </td>
                            <td className="px-4 py-3">{peserta.kelas}</td>
                            <td className="px-4 py-3">{peserta.ruang_nama}</td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="secondary"
                                className={
                                  !peserta.ikut_ujian
                                    ? "border-slate-200 bg-slate-100 text-slate-700"
                                    : peserta.sudah_kirim
                                    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                                    : "border-amber-200 bg-amber-100 text-amber-800"
                                }
                              >
                                {!peserta.ikut_ujian
                                  ? "Bukan sasaran"
                                  : peserta.sudah_kirim
                                  ? "Sudah kirim"
                                  : "Belum kirim"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
