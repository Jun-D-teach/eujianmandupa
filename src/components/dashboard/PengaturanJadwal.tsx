import { useEffect, useState } from "react";
import {
  getGuruRingkasGas,
  getJadwalHarianGas,
  getSetelJadwalGas,
  gasCall,
  setelJadwalGas,
  simpanJadwalHarianGas,
  type BarisJadwalHarianGas,
  type GuruRingkasGas,
  type KolomJadwalGas,
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
  Columns3,
  Plus,
  Printer,
  Save,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

type TabId = "jadwal" | "kalender" | "kolom";

const TABS: { id: TabId; label: string; ikon: typeof CalendarDays }[] = [
  { id: "jadwal", label: "Jadwal harian", ikon: CalendarDays },
  { id: "kalender", label: "Kalender (hari kerja & libur)", ikon: CalendarDays },
  { id: "kolom", label: "Pengaturan kolom", ikon: Columns3 },
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
 * Satu tanggal = N sesi (N = jumlah hari kerja kalender); tiap sesi diisi
 * mapel + pengawas, lalu dicetak menjadi daftar peserta per sesi (A, B, C…).
 */
export function PengaturanJadwal() {
  const [tab, setTab] = useState<TabId>("jadwal");
  const [setel, setSetel] = useState<SetelJadwalGas | null>(null);
  const [guru, setGuru] = useState<GuruRingkasGas[]>([]);
  const [kartu, setKartu] = useState<SetKartu>({ ...SET_KOSONG });
  const [memuat, setMemuat] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Draft setelan (kolom + kalender).
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

  // Jadwal satu tanggal.
  const [tanggal, setTanggal] = useState(hariIniISO());
  const [totalSesi, setTotalSesi] = useState(3);
  const [jamSesi, setJamSesi] = useState<string[]>(jamMulaiOtomatis(3));
  const [mapelSesi, setMapelSesi] = useState<string[]>(["", "", ""]);
  const [pengawasSesi, setPengawasSesi] = useState<string[][]>([[], [], []]);
  const [baris, setBaris] = useState<BarisJadwalHarianGas[] | null>(null);
  // Mulai true: baris pertama dimuat begitu setelan siap; di-set "true" hanya
  // dari handler perubahan (tanggal/kolom) agar tidak ada setState sinkron di efek.
  const [memuatJadwal, setMemuatJadwal] = useState(true);
  const [cariGuru, setCariGuru] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  // Muat setelan + daftar guru + setelan kop kartu (sekali).
  useEffect(() => {
    let hidup = true;
    Promise.all([
      getSetelJadwalGas(),
      getGuruRingkasGas(),
      gasCall<SetKartu>("getKartuSet"),
    ])
      .then(([s, g, k]) => {
        if (!hidup) return;
        setSetel(s);
        setKolom(s.kolom);
        setHariKerja(s.hari_kerja);
        setLibur(s.libur);
        setGuru(g.guru ?? []);
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

  // Muat baris jadwal untuk tanggal terpilih (sinkron mapel/pengawas tersimpan).
  useEffect(() => {
    if (setel === null) return;
    let hidup = true;
    getJadwalHarianGas(tanggal, kolom)
      .then((res) => {
        if (!hidup) return;
        setBaris(res.baris);
        setMapelSesi((m) => {
          const n = Array.from(
            { length: Math.max(m.length, res.total) },
            (_, i) => m[i] ?? "",
          );
          res.baris.forEach((b) => {
            n[b.sesi - 1] = b.mapel;
          });
          return n;
        });
        setPengawasSesi((p) => {
          const n = Array.from(
            { length: Math.max(p.length, res.total) },
            (_, i) => p[i] ?? [],
          );
          res.baris.forEach((b) => {
            n[b.sesi - 1] = b.pengawas;
          });
          return n;
        });
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
  const sesiAktif = hitung.sesi;

  const ubahTotalSesi = (n: number) => {
    setTotalSesi(n);
    const auto = jamMulaiOtomatis(n);
    setJamSesi((j) => Array.from({ length: n }, (_, i) => j[i] || auto[i]));
    setMapelSesi((m) => Array.from({ length: n }, (_, i) => m[i] ?? ""));
    setPengawasSesi((p) => Array.from({ length: n }, (_, i) => p[i] ?? []));
  };

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

  const togglePengawas = (s: number, nama: string) =>
    setPengawasSesi((p) => {
      const n = [...p];
      const set = new Set(n[s - 1] ?? []);
      if (set.has(nama)) set.delete(nama);
      else set.add(nama);
      n[s - 1] = Array.from(set);
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
    if (kolom.tingkat === "" && kolom.kelas === "") {
      toast.error("Pilih minimal kolom Tingkat atau Kelas di tab Pengaturan kolom.");
      setTab("kolom");
      return;
    }
    setBusySetel(true);
    try {
      await setelJadwalGas({ kolom, hari_kerja: hariKerja, libur });
      setSetel((s) => (s ? { ...s, kolom, hari_kerja: hariKerja, libur } : s));
      setMemuatJadwal(true);
      toast.success("Setelan jadwal disimpan.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan setelan.",
      );
    } finally {
      setBusySetel(false);
    }
  };

  /** Validasi sebelum cetak/simpan: kolom sesi aktif harus ≤ total sesi & terisi. */
  const validasiSesi = (): boolean => {
    const terlalu = sesiAktif.filter((s) => s > totalSesi);
    if (terlalu.length) {
      toast.error(
        `Naikkan "Jumlah sesi" menjadi minimal ${Math.max(...terlalu)} — hari ini memakai ${sesiAktif.length} sesi.`,
      );
      return false;
    }
    const kosongMapel = sesiAktif.filter((s) => !(mapelSesi[s - 1] ?? "").trim());
    const kosongPengawas = sesiAktif.filter(
      (s) => !(pengawasSesi[s - 1] ?? []).length,
    );
    if (kosongMapel.length || kosongPengawas.length) {
      const bagian: string[] = [];
      if (kosongMapel.length) bagian.push(`mapel sesi ${kosongMapel.join(", ")}`);
      if (kosongPengawas.length)
        bagian.push(`pengawas sesi ${kosongPengawas.join(", ")}`);
      toast.error(`Lengkapi ${bagian.join(" dan ")} terlebih dahulu.`);
      return false;
    }
    return true;
  };

  const simpanTanggal = async () => {
    if (!validasiSesi()) return;
    setBusy(true);
    try {
      for (const s of sesiAktif) {
        await simpanJadwalHarianGas({
          tanggal,
          sesi: s,
          mapel: (mapelSesi[s - 1] ?? "").trim(),
          pengawas: pengawasSesi[s - 1] ?? [],
        });
      }
      toast.success(`Jadwal ${labelTanggal(tanggal)} tersimpan.`);
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
    if (!validasiSesi()) return;
    const jam = Array.from({ length: totalSesi }, (_, i) => {
      const j = normalisasiJam(jamSesi[i] ?? "");
      if (!j) {
        toast.error(`Jam sesi ${i + 1} tidak valid (format 07.30).`);
        throw new Error("jam");
      }
      return j;
    });
    const html = jadwalHarianHTML(baris, {
      sekolah: kartu.sekolah,
      alamat: kartu.alamat,
      kota: kartu.kota,
      totalSesi,
      jamSesi: jam,
      mapelSesi: Array.from({ length: totalSesi }, (_, i) => mapelSesi[i] ?? ""),
      pengawasSesi: Array.from({ length: totalSesi }, (_, i) => pengawasSesi[i] ?? []),
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

  const guruTersaring = (cari: string) => {
    const q = cari.trim().toLowerCase();
    if (!q) return guru;
    return guru.filter((g) =>
      `${g.nama} ${g.nip} ${g.mapel}`.toLowerCase().includes(q),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">
          Jadwal harian peserta
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Satu tanggal memakai beberapa sesi (sesi 1, 2, 3, … berurutan dari
          hari kerja pada kalender) — tiap sesi diisi mapel &amp; pengawas, lalu
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
                <Label htmlFor="jadwal-sesi">Jumlah sesi (per hari)</Label>
                <select
                  id="jadwal-sesi"
                  value={totalSesi}
                  onChange={(e) => ubahTotalSesi(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} sesi
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Kolom peserta &amp; sesi aktif</Label>
                <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5">
                  {baris && baris.length > 0
                    ? `${baris.length} peserta · digilir antar tingkat (A, B, C, …)`
                    : "Belum ada peserta"}
                  {sesiAktif.length > 0 && (
                    <> · hari ini sesi {sesiAktif.join(", ")}</>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Label>Jam mulai tiap sesi</Label>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: totalSesi }, (_, i) => (
                  <div key={i} className="grid gap-1">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Sesi {i + 1}
                    </span>
                    <Input
                      value={jamSesi[i] ?? ""}
                      onChange={(e) => ubahJam(i, e.target.value)}
                      placeholder="07.30"
                      inputMode="numeric"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Bawaan otomatis 07.30, 10.00, 12.30, … — bebas diubah (format
                07.30).
              </p>
            </div>
          </Card>

          {hitung.libur ? (
            <Card className="border-amber-300/60 bg-amber-50 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="size-4" /> Tidak ada jadwal
              </p>
              <p className="mt-1 text-sm text-amber-800/90">{hitung.alasan}</p>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {sesiAktif.map((s) => {
                  const cari = cariGuru[s] ?? "";
                  const daftar = guruTersaring(cari);
                  const dipilih = pengawasSesi[s - 1] ?? [];
                  return (
                    <Card key={s} className="border-border/70 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-bold">
                          Sesi {s} · {normalisasiJam(jamSesi[s - 1] ?? "") || "—"}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              try {
                                await simpanJadwalHarianGas({
                                  tanggal,
                                  sesi: s,
                                  mapel: (mapelSesi[s - 1] ?? "").trim(),
                                  pengawas: dipilih,
                                });
                                toast.success(`Sesi ${s} tersimpan.`);
                              } catch (err) {
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : "Gagal menyimpan sesi.",
                                );
                              }
                            })();
                          }}
                        >
                          <Save className="size-3.5" /> Simpan sesi {s}
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-4 lg:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor={`mapel-${s}`}>Mapel ujian</Label>
                          <Input
                            id={`mapel-${s}`}
                            value={mapelSesi[s - 1] ?? ""}
                            onChange={(e) => ubahMapel(s, e.target.value)}
                            placeholder="cth. Matematika"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Pengawas {s}</Label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={cari}
                              onChange={(e) =>
                                setCariGuru((c) => ({ ...c, [s]: e.target.value }))
                              }
                              placeholder="Cari guru (nama / NIP / mapel)…"
                              className="pl-9"
                            />
                          </div>
                          <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl border border-border/70 bg-background/60 p-1.5">
                            {daftar.map((g) => {
                              const aktif = dipilih.includes(g.nama);
                              return (
                                <label
                                  key={g.nip || g.nama}
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors ${
                                    aktif ? "bg-emerald-50 font-medium" : "hover:bg-muted"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={aktif}
                                    onChange={() => togglePengawas(s, g.nama)}
                                    className="size-4 accent-emerald-600"
                                  />
                                  <span className="min-w-0 truncate">
                                    {g.nama}
                                    {g.mapel ? (
                                      <span className="text-muted-foreground">
                                        {" "}· {g.mapel}
                                      </span>
                                    ) : null}
                                  </span>
                                </label>
                              );
                            })}
                            {!daftar.length && (
                              <p className="px-2 py-1 text-xs text-muted-foreground">
                                Tidak ada guru yang cocok.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

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
                  Cetak A4 lanskap: kolom <strong>A, B, C…</strong> = sesi 1, 2,
                  3… (kolom di luar hari ini dicetak tipis).
                </p>
              </div>
            </>
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
              Jumlah hari kerja menentukan jumlah sesi per hari: urutan hari
              inilah yang menjadi sesi 1, 2, 3, …
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
              Tanggal merah / libur madrasah — tidak dihitung sebagai hari
              kerja.
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

      {/* ---------------------------------------------------------- */}
      {/* TAB: KOLOM                                                 */}
      {/* ---------------------------------------------------------- */}
      {tab === "kolom" && setel && (
        <div className="space-y-5">
          <Card className="border-border/70 p-5">
            <p className="text-sm font-bold">Pemetaan kolom tabel siswa</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Otomatis terdeteksi dari tabel <code>siswa</code> (ditandai{" "}
              <em>deteksi otomatis</em>). Ubah bila nama kolom berbeda.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["tingkat", "Kolom tingkat (X / XI / XII)"],
                  ["kelas", "Kolom kelas (mis. X.1)"],
                  ["nis", "Kolom NIS / NISN"],
                  ["absen", "Kolom nomor absen"],
                ] as const
              ).map(([kunci, label]) => {
                const auto = setel.auto[kunci];
                return (
                  <div key={kunci} className="grid gap-2">
                    <Label htmlFor={`kolom-${kunci}`}>{label}</Label>
                    <select
                      id={`kolom-${kunci}`}
                      value={kolom[kunci]}
                      onChange={(e) =>
                        setKolom((k) => ({ ...k, [kunci]: e.target.value }))
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">— tidak dipakai —</option>
                      {kunci === "tingkat" && (
                        <option value="#kelas">
                          Tingkat diturunkan dari kolom kelas
                        </option>
                      )}
                      {setel.daftar_kolom.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {auto && (
                      <p className="text-[11px] text-muted-foreground">
                        Deteksi otomatis: <strong>{auto}</strong>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              Minimal satu dari <strong>tingkat</strong> atau{" "}
              <strong>kelas</strong> harus dipilih. Absen{" "}
              <em>tidak dipakai</em> akan diisi otomatis 1, 2, 3, … per kelas.
            </p>
          </Card>

          {setel.contoh.length > 0 && (
            <Card className="border-border/70 p-5">
              <p className="text-sm font-bold">Cuplikan data siswa</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                      {Object.keys(setel.contoh[0]).map((c) => (
                        <th key={c} className="px-2 py-1.5 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {setel.contoh.map((r, i) => (
                      <tr key={i} className="border-b border-border/40">
                        {Object.keys(setel.contoh[0]).map((c) => (
                          <td key={c} className="px-2 py-1.5">
                            {String(r[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Button
            type="button"
            className="gap-2"
            disabled={busySetel}
            onClick={() => void simpanSetelan()}
          >
            <Save className="size-4" />
            {busySetel ? "Menyimpan…" : "Simpan pengaturan kolom"}
          </Button>
        </div>
      )}
    </div>
  );
}
