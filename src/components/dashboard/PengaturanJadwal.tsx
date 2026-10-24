import { useEffect, useMemo, useState } from "react";
import {
  getJadwalHarianGas,
  getSetelJadwalGas,
  gasCall,
  setelJadwalGas,
  simpanJadwalHarianGas,
  type BarisJadwalHarianGas,
  type JadwalPengawasGas,
  type KolomJadwalGas,
  type RuangSetGas,
  type SetelJadwalGas,
} from "@/lib/api";
import { SET_KOSONG, type SetKartu } from "@/lib/kartu";
import { cetakDokumen } from "@/lib/cetak-ruang";
import {
  hitungSesiTanggal,
  jamMulaiOtomatis,
  jadwalHarianHTML,
  labelTanggal,
  normalisasiJam,
} from "@/lib/jadwal-harian";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  CalendarDays,
  Plus,
  Printer,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

type TabId = "jadwal" | "kalender";

const TABS: { id: TabId; label: string; ikon: typeof CalendarDays }[] = [
  { id: "jadwal", label: "Jadwal harian", ikon: CalendarDays },
  { id: "kalender", label: "Kalender (hari kerja & libur)", ikon: CalendarDays },
];

/** 1=Senin … 7=Minggu (nomor hari Indonesia — sama dengan kalender). */
const HARI_NM: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

function hariIniISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Jadwal harian — admin.
 * Per TANGGAL (ujian bisa beberapa hari): atur jumlah sesi, jam mulai & mapel
 * tiap sesi — semuanya TERSIMPAN per hari. Pengawas tidak diatur di sini;
 * diambil otomatis dari "Jadwal pengawas otomatis" (Ruang ujian) saat mencetak.
 * Kalender (hari kerja & libur) menentukan tanggal mana yang bisa diatur.
 */
export function PengaturanJadwal() {
  const [tab, setTab] = useState<TabId>("jadwal");
  const [setel, setSetel] = useState<SetelJadwalGas | null>(null);
  const [kartu, setKartu] = useState<SetKartu>({ ...SET_KOSONG });
  const [memuat, setMemuat] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pemetaan kolom tabel siswa — hanya dari setelan server (deteksi otomatis);
  // tab "Pengaturan kolom" sudah dibuang, nilai ini tetap dipakai saat memuat baris.
  const [kolom, setKolom] = useState<KolomJadwalGas>({
    tingkat: "",
    kelas: "",
    nis: "",
    absen: "",
  });
  const [hariKerja, setHariKerja] = useState<number[]>([1, 2, 3, 4, 5]);
  const [libur, setLibur] = useState<string[]>([]);
  const [liburBaru, setLiburBaru] = useState("");
  const [busySetel, setBusySetel] = useState(false);

  // Jadwal satu tanggal — jumlah sesi, jam & mapel TERSIMPAN per hari.
  // sesiTeks = teks bebas agar angka bisa dihapus/ditulis ulang bebas;
  // angka final diambil dari `jumlahSesi` (dibatasi 1–10).
  const [tanggal, setTanggal] = useState(hariIniISO());
  const [sesiTeks, setSesiTeks] = useState("3");
  const [jamSesi, setJamSesi] = useState<string[]>(jamMulaiOtomatis(3));
  const [mapelSesi, setMapelSesi] = useState<string[]>(["", "", ""]);
  // Penugasan pengawas per tanggal — sumber kebenarannya "Jadwal pengawas
  // otomatis" (Ruang ujian); hanya dipakai untuk mencetak.
  const [jadwalPeng, setJadwalPeng] = useState<JadwalPengawasGas[]>([]);
  const [baris, setBaris] = useState<BarisJadwalHarianGas[] | null>(null);
  // Mulai true: baris pertama dimuat begitu setelan siap; di-set "true" hanya
  // dari handler perubahan tanggal agar tidak ada setState sinkron di efek.
  const [memuatJadwal, setMemuatJadwal] = useState(true);
  const [busy, setBusy] = useState(false);

  /** Jumlah sesi valid (1–10) dari teks yang sedang diketik. */
  const jumlahSesi = Math.max(1, Math.min(10, parseInt(sesiTeks, 10) || 1));
  /** Bawaan jam otomatis 07.30, 10.00, … untuk sesi yang belum punya jam tersimpan. */
  const autoJam = useMemo(() => jamMulaiOtomatis(jumlahSesi), [jumlahSesi]);
  // `??` (bukan `||`) supaya kolom jam yang dikosongkan user tetap kosong,
  // tidak langsung tertimpa bawaan otomatis.
  const jamKe = (i: number) => jamSesi[i] ?? autoJam[i] ?? "";

  // Muat setelan + setelan kop kartu (sekali).
  useEffect(() => {
    let hidup = true;
    Promise.all([getSetelJadwalGas(), gasCall<SetKartu>("getKartuSet")])
      .then(([s, k]) => {
        if (!hidup) return;
        setSetel(s);
        setKolom(s.kolom);
        setHariKerja(s.hari_kerja);
        setLibur(s.libur);
        setKartu({
          sekolah: k.sekolah ?? SET_KOSONG.sekolah,
          alamat: k.alamat ?? "",
          kota: k.kota ?? SET_KOSONG.kota,
          kepala: k.kepala ?? "",
          nip: k.nip ?? "",
          logo: k.logo ?? "",
          ttd: k.ttd ?? "",
        });
      })
      .catch((err) => {
        if (hidup)
          setError(
            err instanceof Error ? err.message : "Gagal memuat setelan jadwal.",
          );
      })
      .finally(() => {
        if (hidup) setMemuat(false);
      });
    return () => {
      hidup = false;
    };
  }, []);

  // Muat setelan per hari (jumlah sesi + jam + mapel tersimpan) + penugasan
  // pengawas terbaru dari "Jadwal pengawas otomatis" untuk tanggal terpilih.
  useEffect(() => {
    if (setel === null) return;
    let hidup = true;
    Promise.all([
      getJadwalHarianGas(tanggal, kolom),
      gasCall<RuangSetGas>("getRuangSet"),
    ])
      .then(([res, rs]) => {
        if (!hidup) return;
        setBaris(res.baris);
        setJadwalPeng(rs?.jadwal ?? []);
        const set = res.set;
        const n = set && set.jumlah_sesi > 0 ? set.jumlah_sesi : 3;
        const auto = jamMulaiOtomatis(n);
        setSesiTeks(String(n));
        setJamSesi(Array.from({ length: n }, (_, i) => set?.jam?.[i] ?? auto[i]));
        setMapelSesi(Array.from({ length: n }, (_, i) => set?.mapel?.[i] ?? ""));
      })
      .catch((err) => {
        if (hidup) {
          setBaris(null);
          toast.error(
            err instanceof Error ? err.message : "Gagal memuat jadwal harian.",
          );
        }
      })
      .finally(() => {
        if (hidup) setMemuatJadwal(false);
      });
    return () => {
      hidup = false;
    };
  }, [setel, tanggal, kolom]);

  const hitung = setel
    ? hitungSesiTanggal(tanggal, hariKerja, libur)
    : { libur: true, alasan: null, sesi: [] as number[] };

  // Pengawas per sesi (otomatis — tanpa pilih manual): nama unik per sesi
  // pada tanggal ini, diambil dari tabel jadwal pengawas (Ruang ujian).
  const pengawasSesi = useMemo(() => {
    const barisTgl = jadwalPeng.filter((r) => r.tanggal === tanggal);
    const n = Math.max(
      jumlahSesi,
      barisTgl.reduce((m, r) => Math.max(m, r.sesi), 0),
    );
    const out: string[][] = Array.from({ length: n }, () => []);
    for (const r of barisTgl) {
      if (r.sesi < 1) continue;
      const arr = out[r.sesi - 1];
      const nama = r.nama.trim();
      if (arr && nama && !arr.includes(nama)) arr.push(nama);
    }
    return out;
  }, [jadwalPeng, tanggal, jumlahSesi]);

  const ubahJam = (i: number, v: string) =>
    setJamSesi((j) => {
      const n = [...j];
      n[i] = v;
      return n;
    });

  const ubahMapel = (s: number, v: string) =>
    setMapelSesi((m) => {
      const n = [...m];
      n[s - 1] = v;
      return n;
    });

  const toggleHariKerja = (h: number) =>
    setHariKerja((hk) => {
      const n = hk.includes(h) ? hk.filter((x) => x !== h) : [...hk, h].sort();
      return n.length ? n : hk; // minimal satu hari kerja
    });

  const tambahLibur = () => {
    if (!liburBaru) return;
    if (libur.includes(liburBaru)) {
      toast.error("Tanggal itu sudah ada di daftar libur.");
      return;
    }
    setLibur((l) => [...l, liburBaru].sort());
    setLiburBaru("");
  };

  const simpanSetelan = async () => {
    setBusySetel(true);
    try {
      await setelJadwalGas({ kolom, hari_kerja: hariKerja, libur });
      setSetel((s) => (s ? { ...s, kolom, hari_kerja: hariKerja, libur } : s));
      setMemuatJadwal(true);
      toast.success("Setelan kalender disimpan.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan setelan.",
      );
    } finally {
      setBusySetel(false);
    }
  };

  /**
   * Validasi bersama simpan & cetak: jam valid (07.30) dan mapel terisi
   * untuk SEMUA sesi 1..jumlahSesi. Mengembalikan { jam, mapel } atau null
   * (toast kesalahan sudah ditampilkan).
   */
  const siapkanIsi = (): { jam: string[]; mapel: string[] } | null => {
    const jam: string[] = [];
    for (let i = 0; i < jumlahSesi; i++) {
      const j = normalisasiJam(jamKe(i));
      if (!j) {
        toast.error(`Jam sesi ${i + 1} tidak valid (format 07.30).`);
        return null;
      }
      jam.push(j);
    }
    const mapel: string[] = [];
    const kosong: number[] = [];
    for (let i = 0; i < jumlahSesi; i++) {
      const m = (mapelSesi[i] ?? "").trim();
      mapel.push(m);
      if (!m) kosong.push(i + 1);
    }
    if (kosong.length) {
      toast.error(`Lengkapi mapel sesi ${kosong.join(", ")} terlebih dahulu.`);
      return null;
    }
    return { jam, mapel };
  };

  const simpanTanggal = async () => {
    const isi = siapkanIsi();
    if (!isi) return;
    setBusy(true);
    try {
      const res = await simpanJadwalHarianGas({
        tanggal,
        jumlah_sesi: jumlahSesi,
        jam: isi.jam,
        mapel: isi.mapel,
      });
      toast.success(res.message || `Jadwal ${labelTanggal(tanggal)} tersimpan.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan jadwal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const cetak = () => {
    if (!baris || !baris.length) {
      toast.error("Belum ada baris peserta untuk tanggal ini.");
      return;
    }
    const isi = siapkanIsi();
    if (!isi) return;
    const html = jadwalHarianHTML(baris, {
      sekolah: kartu.sekolah,
      alamat: kartu.alamat,
      kota: kartu.kota,
      totalSesi: jumlahSesi,
      jamSesi: isi.jam,
      mapelSesi: isi.mapel,
      pengawasSesi: Array.from(
        { length: jumlahSesi },
        (_, i) => pengawasSesi[i] ?? [],
      ),
    });
    cetakDokumen(html, `Jadwal Harian ${labelTanggal(tanggal)}`, (pesan) =>
      toast.error(pesan),
    );
  };

  if (memuat) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-border/70 p-5">
        <p className="text-sm font-semibold text-red-600">{error}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pastikan folder <code>api</code> ter-upload dan database aktif.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">
          Jadwal harian peserta
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur per tanggal (ujian bisa beberapa hari): jumlah sesi, jam mulai &
          mapel tiap sesi — tersimpan per hari. Pengawas diambil otomatis dari
          "Jadwal pengawas otomatis" (Ruang ujian & pengawas), lalu jadwal
          dicetak sebagai daftar peserta per tanggal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const aktif = tab === t.id;
          const Ikon = t.ikon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                aktif
                  ? "bg-ink text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Ikon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- */}
      {/* TAB: JADWAL HARIAN                                         */}
      {/* ---------------------------------------------------------- */}
      {tab === "jadwal" && (
        <div className="space-y-5">
          <Card className="border-border/70 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="jadwal-tanggal">Tanggal ujian</Label>
                <Input
                  id="jadwal-tanggal"
                  type="date"
                  value={tanggal}
                  onChange={(e) => {
                    setMemuatJadwal(true);
                    setTanggal(e.target.value);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="jadwal-sesi">Jumlah sesi hari ini</Label>
                <Input
                  id="jadwal-sesi"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  value={sesiTeks}
                  onChange={(e) => setSesiTeks(e.target.value)}
                  onBlur={() => setSesiTeks(String(jumlahSesi))}
                />
                <p className="text-[11px] leading-4 text-muted-foreground">
                  1–10 sesi per hari — berlaku untuk tanggal ini saja, lalu klik
                  Simpan.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Peserta</Label>
                <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5">
                  {baris && baris.length > 0
                    ? `${baris.length} peserta · digilir antar tingkat (A, B, C, …)`
                    : "Belum ada peserta"}
                </p>
              </div>
            </div>

            {!hitung.libur && (
              <div className="mt-4">
                <Label>Jam mulai & mapel tiap sesi</Label>
                <div className="mt-2 grid gap-2">
                  {Array.from({ length: jumlahSesi }, (_, i) => (
                    <div
                      key={i}
                      className="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[6.5rem_9rem_1fr] sm:items-center"
                    >
                      <span className="text-xs font-bold text-muted-foreground">
                        Sesi {i + 1}
                      </span>
                      <Input
                        value={jamKe(i)}
                        onChange={(e) => ubahJam(i, e.target.value)}
                        placeholder="07.30"
                        inputMode="numeric"
                        aria-label={`Jam mulai sesi ${i + 1}`}
                      />
                      <Input
                        value={mapelSesi[i] ?? ""}
                        onChange={(e) => ubahMapel(i + 1, e.target.value)}
                        placeholder="Mapel sesi ini (cth. Matematika)"
                        aria-label={`Mapel sesi ${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                  Jam bawaan otomatis 07.30, 10.00, 12.30, … (jeda 2,5 jam) —
                  bebas diubah (format 07.30). Pengawas tidak diatur di sini:
                  otomatis mengikuti "Jadwal pengawas otomatis" saat dicetak.
                </p>
              </div>
            )}
          </Card>

          {hitung.libur ? (
            <Card className="border-amber-300/60 bg-amber-50 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="size-4" /> Tidak ada jadwal
              </p>
              <p className="mt-1 text-sm text-amber-800/90">{hitung.alasan}</p>
            </Card>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="gap-2"
                disabled={busy || memuatJadwal}
                onClick={() => void simpanTanggal()}
              >
                <Save className="size-4" />
                {busy ? "Menyimpan…" : "Simpan jadwal tanggal ini"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={memuatJadwal}
                onClick={cetak}
              >
                <Printer className="size-4" /> Cetak jadwal harian
              </Button>
              <p className="text-[11px] leading-5 text-muted-foreground">
                Simpan per tanggal — ulangi untuk hari ujian berikutnya. Cetak A4
                lanskap: kolom <strong>mapel & pengawas</strong> per sesi;
                pengawas mengikuti <strong>Jadwal pengawas otomatis</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- */}
      {/* TAB: KALENDER                                              */}
      {/* ---------------------------------------------------------- */}
      {tab === "kalender" && (
        <div className="space-y-5">
          <Card className="border-border/70 p-5">
            <p className="text-sm font-bold">Hari kerja ujian</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tanggal dengan hari ini bisa diatur jadwal hariannya; selain itu
              (akhir pekan / tanggal libur) tidak ada jadwal.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 7 }, (_, i) => i + 1).map((h) => {
                const aktif = hariKerja.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHariKerja(h)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      aktif
                        ? "bg-emerald-600 text-white"
                        : "border border-border/70 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {HARI_NM[h]}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="border-border/70 p-5">
            <p className="text-sm font-bold">Tanggal libur</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tanggal merah / libur madrasah — tidak ada jadwal ujian.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="libur-baru">Tanggal libur</Label>
                <Input
                  id="libur-baru"
                  type="date"
                  value={liburBaru}
                  onChange={(e) => setLiburBaru(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={tambahLibur}
              >
                <Plus className="size-4" /> Tambah
              </Button>
            </div>
            {libur.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {libur.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium"
                  >
                    {labelTanggal(t)}
                    <button
                      type="button"
                      aria-label={`Hapus libur ${t}`}
                      onClick={() => setLibur((l) => l.filter((x) => x !== t))}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Button
            type="button"
            className="gap-2"
            disabled={busySetel}
            onClick={() => void simpanSetelan()}
          >
            <Save className="size-4" />
            {busySetel ? "Menyimpan…" : "Simpan kalender"}
          </Button>
        </div>
      )}
    </div>
  );
}
