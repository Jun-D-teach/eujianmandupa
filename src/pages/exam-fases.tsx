import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Grid3X3,
  KeyRound,
  Send,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { Pilihan, SesiUjian } from "@/lib/exam-storage";

/** Label waktu mulai id-ID (duplikat ringan dari ExamPage). */
function labelTgl(tglMulai?: string): string {
  if (!tglMulai) return "";
  const d = new Date(tglMulai);
  if (Number.isNaN(d.getTime())) return tglMulai;
  return d.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
}

/* ------------------------------------------------------------------ */
/* FASE: SETUP — nama/kelas + TOKEN ujian, lalu unduh soal (online)     */
/* ------------------------------------------------------------------ */
export function SetupFase(props: {
  judul: string;
  deskripsi?: string;
  jumlahSoal: number;
  durasiMenit: number;
  tglMulai?: string;
  sasaran?: string;
  nama: string;
  kelas: string;
  setNama: (v: string) => void;
  setKelas: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  pesan: string | null;
  busy: boolean;
  online: boolean;
  onUnduh: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Badge variant="secondary" className="mb-3">
          Tahap 1 · Unduh soal
        </Badge>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {props.judul || "Ujian"}
        </h1>
        {props.deskripsi && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {props.deskripsi}
          </p>
        )}
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {props.jumlahSoal} soal · durasi {props.durasiMenit} menit
        </p>
        {(props.sasaran || props.tglMulai) && (
          <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
            {props.sasaran && (
              <p>
                Sasaran: <span className="font-semibold text-foreground">{props.sasaran}</span>
              </p>
            )}
            {props.tglMulai && (
              <p>
                Dibuka: <span className="font-semibold text-foreground">{labelTgl(props.tglMulai)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <Card className="border-border/70">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nama">Nama lengkap</Label>
              <Input
                id="nama"
                value={props.nama}
                onChange={(e) => props.setNama(e.target.value)}
                placeholder="cth. Ayu Lestari"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kelas">Kelas</Label>
              <Input
                id="kelas"
                value={props.kelas}
                onChange={(e) => props.setKelas(e.target.value)}
                placeholder="cth. XII-IPA-2"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="token-ujian" className="gap-1.5">
              <KeyRound className="size-3.5" /> Token ujian
            </Label>
            <Input
              id="token-ujian"
              value={props.token}
              onChange={(e) => props.setToken(e.target.value.toUpperCase())}
              placeholder="cth. K7XM3P"
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              className="h-12 text-center font-mono text-xl font-bold uppercase tracking-[0.35em]"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Token diperiksa server saat unduh — soal hanya terkirim kalau
              token cocok. Token dibagikan pengawas/admin.
            </p>
          </div>

          <div
            className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-5 ${
              props.online
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                : "border-amber-500/30 bg-amber-500/10 text-amber-800"
            }`}
          >
            {props.online ? (
              <>
                <Wifi className="mt-0.5 size-4 shrink-0" />
                <span>
                  Terhubung internet — lengkapi data di atas lalu unduh soal.
                </span>
              </>
            ) : (
              <>
                <WifiOff className="mt-0.5 size-4 shrink-0" />
                <span>
                  Tidak ada koneksi. Sambungkan internet sementara untuk
                  mengunduh soal.
                </span>
              </>
            )}
          </div>

          {props.pesan && (
            <p className="rounded-xl bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-600">
              {props.pesan}
            </p>
          )}

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={props.onUnduh}
            disabled={props.busy || !props.online}
          >
            <Download className="size-4" />
            {!props.online
              ? "Nyalakan internet untuk mengunduh"
              : props.busy
                ? "Mengunduh…"
                : "Unduh Soal"}
          </Button>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">
            Unduh hanya bisa bila admin sudah membuka izin unduh mapel ini.
            Soal disimpan ke HP dan dibaca lokal saat ujian — kunci jawaban
            tidak pernah dikirim ke perangkat siswa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: INSTRUKSI — persiapan offline (token sudah lolos server)       */
/* ------------------------------------------------------------------ */
export function InstruksiFase(props: {
  sesi: SesiUjian;
  online: boolean;
  terkunciJadwal: boolean;
  onMulai: () => void;
  onUlang: () => void;
}) {
  const aturan = [
    "MATIKAN WiFi dan paket data seluler sekarang. Ujian hanya boleh dikerjakan dalam keadaan offline — selama masih online, tombol Mulai Ujian tidak bisa diklik.",
    "Token ujian sudah diverifikasi server saat unduh — ujian bisa langsung dimulai walau HP sudah offline.",
    `Waktu ujian ${props.sesi.durasi_menit ?? 60} menit dihitung sejak tombol Mulai Ujian. Saat habis, sistem otomatis berpindah ke pengiriman jawaban.`,
    "Setiap pelanggaran membunyikan sirene dan menambah 1 strike. Matikan sirene lewat tombol khusus setelah kembali ke ujian — tombol hanya aktif saat HP offline.",
    "Pada strike ke-3 layar terkunci; pengawas membukanya dengan PIN (tanpa internet).",
    "Jawaban tersimpan otomatis di HP. Setelah selesai, nyalakan internet untuk mengirim.",
  ];

  return (
    <div className="space-y-5">
      <div>
        <Badge variant="secondary" className="mb-3">
          Tahap 2 · Persiapan offline
        </Badge>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Matikan internet, lalu mulai
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {props.sesi.judul} · {props.sesi.soal.length} soal · durasi{" "}
          {props.sesi.durasi_menit ?? 60} menit · {props.sesi.nama} (
          {props.sesi.kelas})
        </p>
      </div>

      <Card
        className={`border-2 ${
          props.online
            ? "border-red-500/50 bg-red-500/5"
            : "border-emerald-500/40 bg-emerald-500/5"
        }`}
      >
        <CardContent className="flex items-center gap-3 p-5">
          {props.online ? (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-600">
                <Wifi className="size-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-red-600">
                  Internet masih MENYALA
                </p>
                <p className="text-xs leading-5 text-red-600/80">
                  Matikan WiFi & data seluler sekarang sebelum menekan Mulai
                  Ujian.
                </p>
              </div>
            </>
          ) : (
            <>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
                <WifiOff className="size-5" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-emerald-700">
                  Internet sudah mati — siap!
                </p>
                <p className="text-xs leading-5 text-emerald-700/80">
                  HP dalam keadaan offline. Ujian boleh dimulai kapan saja.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Ketentuan wajib
          </p>
          <ol className="mt-4 space-y-3">
            {aturan.map((a, i) => (
              <li key={a} className="flex gap-3 text-sm leading-6">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span
                  className={
                    i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"
                  }
                >
                  {a}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full"
        onClick={props.onMulai}
        disabled={props.online || props.terkunciJadwal}
      >
        {props.terkunciJadwal
          ? "Belum sesuai jadwal — lihat jadwal di bawah"
          : props.online
            ? "Matikan internet dulu, lalu Mulai Ujian"
            : "Mulai Ujian"}
      </Button>
      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={props.onUlang}
      >
        Hapus sesi & unduh ulang soal
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: UJIAN — wajib offline                                         */
/* ------------------------------------------------------------------ */
export function UjianFase(props: {
  sesi: SesiUjian;
  totalTerjawab: number;
  onJawab: (p: Pilihan) => void;
  onPindah: (i: number) => void;
  onSelesai: () => void;
  onGrid: () => void;
  tampilGrid: boolean;
}) {
  const { sesi } = props;
  const soal = sesi.soal[sesi.indeks];
  const terjawab = sesi.jawaban[soal?.id ?? ""];

  /** Huruf di depan teks pilihan ("A. …") untuk deteksi teks berhuruf. */
  const RE_HURUF_DEPAN = /^[A-E][\s.)\-–—:]+/i;
  /** Mode "sudah berhuruf": tampil apa adanya (lengkapi bila huruf hilang);
   *  mode normal: teks polos — huruf ditunjukkan lewat kotak di kiri. */
  const sudahHuruf = Boolean(soal?.opsi_huruf);
  const siapkan = (huruf: Pilihan, teks: string): string => {
    if (!sudahHuruf) return teks.replace(RE_HURUF_DEPAN, "");
    return RE_HURUF_DEPAN.test(teks) ? teks : `${huruf}. ${teks}`;
  };

  const opsi: { huruf: Pilihan; teks: string }[] = soal
    ? [
        { huruf: "A", teks: siapkan("A", soal.opsi_a) },
        { huruf: "B", teks: siapkan("B", soal.opsi_b) },
        { huruf: "C", teks: siapkan("C", soal.opsi_c) },
        { huruf: "D", teks: siapkan("D", soal.opsi_d) },
        ...(soal.opsi_e
          ? [{ huruf: "E" as Pilihan, teks: siapkan("E", soal.opsi_e) }]
          : []),
      ]
    : [];

  return (
    <div className="space-y-4">
      {props.tampilGrid && (
        <Card className="border-border/70">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Daftar soal
            </p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {sesi.soal.map((s, i) => {
                const dijawab = Boolean(sesi.jawaban[s.id]);
                const aktif = i === sesi.indeks;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => props.onPindah(i)}
                    className={`aspect-square rounded-xl text-xs font-bold transition-colors ${
                      aktif
                        ? "bg-ink text-white"
                        : dijawab
                          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40"
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-[0_1px_2px_rgba(16,20,24,0.04)]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>
              Soal {sesi.indeks + 1} dari {sesi.soal.length}
            </span>
            <button
              type="button"
              onClick={props.onGrid}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[11px] transition-colors hover:bg-muted"
            >
              <Grid3X3 className="size-3.5" />
              {props.tampilGrid ? "Tutup" : "Semua soal"}
            </button>
          </div>

          <p className="mt-4 text-base font-semibold leading-7 sm:text-lg">
            {soal?.pertanyaan}
          </p>

          {soal?.gambar && (
            <img
              src={soal.gambar}
              alt={`Gambar soal ${sesi.indeks + 1}`}
              className="mt-4 max-h-64 w-full rounded-2xl border border-border/70 object-contain"
            />
          )}

          <div className="mt-5 space-y-2.5">
            {opsi.map(({ huruf, teks }) => {
              const aktif = terjawab === huruf;
              return (
                <button
                  key={huruf}
                  type="button"
                  onClick={() => props.onJawab(huruf)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm transition-all ${
                    aktif
                      ? "border-emerald-600 bg-emerald-500/10 font-semibold shadow-[0_0_0_1px_rgba(16,185,129,0.5)]"
                      : "border-border/70 bg-card hover:border-foreground/30"
                  }`}
                >
                  {sudahHuruf ? null : (
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        aktif
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {huruf}
                    </span>
                  )}
                  <span className="leading-6">{teks}</span>
                  {aktif && (
                    <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-600" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="gap-2"
          disabled={sesi.indeks === 0}
          onClick={() => props.onPindah(sesi.indeks - 1)}
        >
          <ArrowLeft className="size-4" /> Sebelumnya
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={sesi.indeks >= sesi.soal.length - 1}
          onClick={() => props.onPindah(sesi.indeks + 1)}
        >
          Berikutnya <ArrowRight className="size-4" />
        </Button>
        <Button className="ml-auto gap-2" onClick={props.onSelesai}>
          <Send className="size-4" /> Selesai
        </Button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        {props.totalTerjawab}/{sesi.soal.length} terjawab · jawaban tersimpan
        otomatis di HP
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: KIRIM — wajib online kembali                                  */
/* ------------------------------------------------------------------ */
export function KirimFase(props: {
  sesi: SesiUjian;
  totalTerjawab: number;
  online: boolean;
  busy: boolean;
  onKirim: () => void;
  onKembali: () => void;
}) {
  const { sesi } = props;
  const kosong = sesi.soal.length - props.totalTerjawab;

  return (
    <div className="space-y-5">
      <div>
        <Badge variant="secondary" className="mb-3">
          Tahap 3 · Kirim jawaban
        </Badge>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Periksa lalu kirim
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Pengiriman hanya bisa dilakukan setelah internet dinyalakan kembali.
        </p>
      </div>

      <Card className="border-border/70">
        <CardContent className="divide-y divide-border/60 p-0">
          {[
            ["Nama", sesi.nama],
            ["Kelas", sesi.kelas],
            ["Token", sesi.token || "—"],
            ["Terjawab", `${props.totalTerjawab} / ${sesi.soal.length}`],
            ["Belum dijawab", String(kosong)],
            ["Total pelanggaran", `${sesi.pelanggaran.length} strike`],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between px-5 py-3.5 text-sm"
            >
              <span className="text-muted-foreground">{k}</span>
              <span
                className={`font-semibold ${
                  k === "Total pelanggaran" && sesi.pelanggaran.length > 0
                    ? "text-red-600"
                    : "text-foreground"
                }`}
              >
                {v}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div
        className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm leading-6 ${
          props.online
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
            : "border-amber-500/40 bg-amber-500/10 text-amber-800"
        }`}
      >
        {props.online ? (
          <>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>Terhubung internet. Jawaban dikirim ke server untuk dinilai.</span>
          </>
        ) : (
          <>
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            <span>
              Nyalakan WiFi / paket data terlebih dahulu — pengiriman jawaban
              membutuhkan koneksi.
            </span>
          </>
        )}
      </div>

      <Button
        size="lg"
        className="w-full gap-2"
        onClick={props.onKirim}
        disabled={!props.online || props.busy}
      >
        <Send className="size-4" />
        {props.busy ? "Mengirim…" : "Kirim Jawaban"}
      </Button>
      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={props.onKembali}
        disabled={props.busy}
      >
        Kembali memeriksa jawaban
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FASE: SELESAI                                                       */
/* ------------------------------------------------------------------ */
export function SelesaiFase(props: {
  sesi: SesiUjian;
  onBeranda: () => void;
}) {
  const hasil = props.sesi.hasil;
  const nilai = hasil?.nilai ?? 0;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-border/70">
        <div className="bg-ink px-6 py-8 text-center text-white">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Trophy className="size-6 text-emerald-400" />
          </span>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
            Jawaban terkirim
          </p>
          <p className="mt-2 text-6xl font-extrabold tracking-tight text-emerald-400">
            {nilai}
          </p>
          <p className="mt-1 text-sm text-white/60">
            {hasil?.benar ?? 0} benar dari {hasil?.total_soal ?? 0} soal
          </p>
        </div>
        <CardContent className="divide-y divide-border/60 p-0">
          {[
            ["Nama", props.sesi.nama],
            ["Kelas", props.sesi.kelas],
            ["Token", props.sesi.token || "—"],
            ["Pelanggaran", `${props.sesi.pelanggaran.length} strike`],
            [
              "Waktu kirim",
              props.sesi.kirimPada
                ? new Date(props.sesi.kirimPada).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—",
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between px-5 py-3.5 text-sm"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={props.onBeranda}>
        Kembali ke beranda
      </Button>
    </div>
  );
}
