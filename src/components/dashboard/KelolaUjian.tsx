import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { gasCall, tokenValid, type SoalGas, type SiswaGas, type UjianGas } from "@/lib/api";
import {
  cetakKartu,
  cocokSasaran,
  gambarKeDataUrl,
  gayaKartu,
  kartuHTML,
  type CetakMode,
  type IsiKartu,
  type SetKartu,
} from "@/lib/kartu";
import {
  bacaFileSoal,
  parseTeksSoal,
  type BarisSoalOtomat,
} from "@/lib/soal-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  ImagePlus,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Printer,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const PILIHAN = ["A", "B", "C", "D", "E"] as const;
const OPSI_WAJIB = ["A", "B", "C", "D"] as const;
const FORM_KOSONG = {
  pertanyaan: "",
  opsi_a: "",
  opsi_b: "",
  opsi_c: "",
  opsi_d: "",
  opsi_e: "",
  gambar: "",
};

/** Batas data URL gambar soal — menjaga kuota penyimpanan offline HP siswa. */
const MAKS_GAMBAR_SOAL = 350_000;

/** Deteksi huruf "A." / "B)" di depan teks pilihan. */
const RE_HURUF_DEPAN = /^[A-E][\s.)\-–—:]+/i;

/** Teks pilihan untuk daftar admin — selalu tampil lengkap berhuruf A–E. */
function labelOpsi(huruf: string, teks: string, sudahHuruf?: number): string {
  if (!sudahHuruf) return `${huruf}. ${teks.replace(RE_HURUF_DEPAN, "")}`;
  return RE_HURUF_DEPAN.test(teks) ? teks : `${huruf}. ${teks}`;
}

/** Label jadwal ramah baca: Jumat, 12 Oktober 2026 pukul 08.00. */
function jadwalLabel(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
}

type Kunci = "A" | "B" | "C" | "D" | "E";
type SasarJenis = "" | "tingkat" | "kelas";

const ACAPAN_TOKEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tokenAcak(): string {
  return Array.from(
    { length: 6 },
    () => ACAPAN_TOKEN[Math.floor(Math.random() * ACAPAN_TOKEN.length)],
  ).join("");
}

/** Hook kecil: daftar kelas & tingkat dari Data Siswa. */
function useKelasSiswa() {
  const [kelas, setKelas] = useState<string[]>([]);
  const [tingkat, setTingkat] = useState<string[]>([]);
  useEffect(() => {
    let hidup = true;
    gasCall<{ siswa: SiswaGas[] }>("getSiswa")
      .then((res) => {
        if (!hidup) return;
        const urut = ["X", "XI", "XII"];
        const tDari = (k: string) => (k.includes(".") ? k.split(".")[0] : k).trim().toUpperCase();
        const unik = Array.from(new Set(res.siswa.map((s) => s.kelas.trim()).filter(Boolean)));
        unik.sort((a, b) => {
          const ta = urut.indexOf(tDari(a));
          const tb = urut.indexOf(tDari(b));
          if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
          return a.localeCompare(b, "id", { numeric: true });
        });
        setKelas(unik);
        setTingkat(Array.from(new Set(unik.map(tDari))).sort(
          (a, b) => urut.indexOf(a) - urut.indexOf(b),
        ));
      })
      .catch(() => {});
    return () => {
      hidup = false;
    };
  }, []);
  return { kelas, tingkat };
}

/** Pemilih sasaran: tingkat saja ATAU centang kelas. */
function PemilihSasaran(props: {
  jenis: SasarJenis;
  setJenis: (v: SasarJenis) => void;
  nilai: string;
  setNilai: (v: string) => void;
  kelasList: string[];
  tingkatList: string[];
}) {
  const kelasTerpilih = props.nilai ? props.nilai.split(",").filter(Boolean) : [];

  const toggleKelas = (k: string) => {
    const ada = kelasTerpilih.includes(k);
    const baru = ada
      ? kelasTerpilih.filter((x) => x !== k)
      : [...kelasTerpilih, k];
    props.setNilai(baru.join(","));
  };

  const toggleTingkat = (t: string) => {
    props.setJenis("tingkat");
    props.setNilai(t);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-muted-foreground" />
        <p className="text-sm font-bold">Siapa yang melaksanakan?</p>
      </div>

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
          props.jenis === ""
            ? "border-emerald-600 bg-emerald-500/10"
            : "border-border/70 bg-card hover:border-foreground/30"
        }`}
      >
        <input
          type="radio"
          name="sasar"
          className="mt-1 accent-emerald-600"
          checked={props.jenis === ""}
          onChange={() => {
            props.setJenis("");
            props.setNilai("");
          }}
        />
        <span>
          <span className="block text-sm font-semibold">Semua siswa</span>
          <span className="text-xs text-muted-foreground">
            Tanpa batasan tingkat/kelas.
          </span>
        </span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
          props.jenis === "tingkat"
            ? "border-emerald-600 bg-emerald-500/10"
            : "border-border/70 bg-card hover:border-foreground/30"
        }`}
      >
        <input
          type="radio"
          name="sasar"
          className="mt-1 accent-emerald-600"
          checked={props.jenis === "tingkat"}
          onChange={() => toggleTingkat(props.tingkatList[0] ?? "X")}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Seluruh tingkat</span>
          <span className="text-xs text-muted-foreground">
            Pilih tingkat yang melaksanakan ujian.
          </span>
          {props.jenis === "tingkat" && (
            <span className="mt-2 flex flex-wrap gap-2">
              {props.tingkatList.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    props.setNilai(t);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                    props.nilai === t
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tingkat {t}
                </button>
              ))}
            </span>
          )}
        </span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
          props.jenis === "kelas"
            ? "border-emerald-600 bg-emerald-500/10"
            : "border-border/70 bg-card hover:border-foreground/30"
        }`}
      >
        <input
          type="radio"
          name="sasar"
          className="mt-1 accent-emerald-600"
          checked={props.jenis === "kelas"}
          onChange={() => {
            props.setJenis("kelas");
            if (kelasTerpilih.length === 0) props.setNilai(props.kelasList[0] ?? "");
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Kelas tertentu</span>
          <span className="text-xs text-muted-foreground">
            Centang kelas mana saja yang boleh melaksanakan.
          </span>
          {props.jenis === "kelas" && (
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {props.kelasList.length === 0 ? (
                <span className="text-xs font-semibold text-amber-600">
                  Belum ada kelas — isi Data Siswa dulu.
                </span>
              ) : (
                props.kelasList.map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={kelasTerpilih.includes(k)}
                      onCheckedChange={() => toggleKelas(k)}
                    />
                    {k}
                  </label>
                ))
              )}
            </span>
          )}
        </span>
      </label>
    </div>
  );
}

/** Kelola ujian: buat, aktifkan, susun soal, hapus. (guru & admin) */
export function KelolaUjian() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { kelas: kelasList, tingkat: tingkatList } = useKelasSiswa();

  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [versi, setVersi] = useState(0);

  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [tokenBaru, setTokenBaru] = useState("");
  const [durasi, setDurasi] = useState(60);
  const [tglMulai, setTglMulai] = useState("");
  const [sasarJenis, setSasarJenis] = useState<SasarJenis>("");
  const [sasarNilai, setSasarNilai] = useState("");
  const [busy, setBusy] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<{ id: string; judul: string } | null>(null);
  const [cetakTarget, setCetakTarget] = useState<UjianGas | null>(null);
  const [cetakSet, setCetakSet] = useState<SetKartu | null>(null);
  const [cetakSiswa, setCetakSiswa] = useState<SiswaGas[] | null>(null);
  const [cetakMode, setCetakMode] = useState<CetakMode>("A4");
  const [cetakMuat, setCetakMuat] = useState(false);

  useEffect(() => {
    let hidup = true;
    setUjian(null);
    gasCall<{ ujian: UjianGas[] }>("getUjian")
      .then((res) => {
        if (hidup) setUjian(res.ujian);
      })
      .catch((err) => {
        if (hidup) {
          toast.error(err instanceof Error ? err.message : "Gagal memuat daftar ujian.");
          setUjian([]);
        }
      });
    return () => {
      hidup = false;
    };
  }, [versi]);

  const segarkan = () => setVersi((v) => v + 1);

  const buat = async () => {
    if (!judul.trim()) {
      toast.error("Judul ujian wajib diisi.");
      return;
    }
    if (tokenBaru.trim() && !tokenValid(tokenBaru)) {
      toast.error("Token harus 4–12 huruf/angka tanpa spasi.");
      return;
    }
    if (sasarJenis === "kelas" && !sasarNilai) {
      toast.error("Centang minimal satu kelas.");
      return;
    }
    setBusy(true);
    try {
      await gasCall("buatUjian", {
        judul: judul.trim(),
        deskripsi: deskripsi.trim(),
        token: tokenBaru.trim() || undefined,
        durasi_menit: durasi,
        tgl_mulai: tglMulai,
        sasar_jenis: sasarJenis,
        sasar_nilai: sasarNilai,
      });
      setJudul("");
      setDeskripsi("");
      setTokenBaru("");
      setDurasi(60);
      setTglMulai("");
      setSasarJenis("");
      setSasarNilai("");
      segarkan();
      toast.success("Ujian dibuat (draft). Susun soal lalu aktifkan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat ujian.");
    } finally {
      setBusy(false);
    }
  };

  const ubahAktif = async (id: string, aktif: boolean, judulUjian: string) => {
    try {
      await gasCall("setAktifUjian", { id, aktif });
      segarkan();
      toast.success(
        aktif
          ? `"${judulUjian}" aktif — siswa sesuai sasaran bisa mengunduh soal.`
          : `"${judulUjian}" dinonaktifkan.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status.");
    }
  };

  const ubahIzin = async (id: string, boleh: boolean, judulUjian: string) => {
    try {
      await gasCall("setIzinUnduh", { id, boleh });
      segarkan();
      toast.success(
        boleh
          ? `"${judulUjian}" — siswa boleh mengunduh soal (izin dibuka).`
          : `"${judulUjian}" — izin unduh ke siswa ditutup.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah izin unduh.");
    }
  };

  /** Guru/admin menandai: soal selesai & siap dibagikan → lampu admin hijau. */
  const konfirmasiSoal = async (id: string, aktif: boolean, judul: string) => {
    try {
      await gasCall("konfirmasiUjian", { id, konfirmasi: aktif });
      segarkan();
      toast.success(
        aktif
          ? `Konfirmasi "${judul}" terkirim — admin melihat lampu hijau.`
          : `Konfirmasi "${judul}" dibatalkan.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengirim konfirmasi.",
      );
    }
  };

  /** Buka dialog cetak kartu — muat setelan kop/TTD + siswa sesuai sasaran. */
  const bukaCetak = async (u: UjianGas) => {
    setCetakTarget(u);
    setCetakSet(null);
    setCetakSiswa(null);
    setCetakMuat(true);
    try {
      const [set, siswa] = await Promise.all([
        gasCall<SetKartu>("getKartuSet"),
        gasCall<{ siswa: SiswaGas[] }>("getSiswa"),
      ]);
      setCetakSet(set);
      setCetakSiswa(siswa.siswa.filter((s) => cocokSasaran(u, s.kelas)));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memuat data kartu ujian.",
      );
      setCetakTarget(null);
    } finally {
      setCetakMuat(false);
    }
  };

  const jalankanCetak = () => {
    if (!cetakTarget || !cetakSet || !cetakSiswa || cetakSiswa.length === 0) return;
    const kartu: IsiKartu[] = cetakSiswa.map((s) => ({
      nisn: s.nisn,
      nama: s.nama,
      kelas: s.kelas,
      judul: cetakTarget.judul,
      jadwal: cetakTarget.tgl_mulai
        ? jadwalLabel(cetakTarget.tgl_mulai)
        : "Tanpa jadwal (langsung dibuka)",
      durasi: cetakTarget.durasi_menit,
    }));
    cetakKartu(cetakSet, kartu, cetakMode, (pesan) => toast.error(pesan));
  };

  /** Kartu contoh untuk pratinjau (siswa pertama yang cocok sasaran). */
  const contohKartu: IsiKartu | null =
    cetakTarget && cetakSiswa && cetakSiswa.length > 0
      ? {
          nisn: cetakSiswa[0].nisn,
          nama: cetakSiswa[0].nama,
          kelas: cetakSiswa[0].kelas,
          judul: cetakTarget.judul,
          jadwal: cetakTarget.tgl_mulai
            ? jadwalLabel(cetakTarget.tgl_mulai)
            : "Tanpa jadwal (langsung dibuka)",
          durasi: cetakTarget.durasi_menit,
        }
      : null;

  const konfirmasiHapus = async () => {
    if (!hapusTarget) return;
    try {
      await gasCall("hapusUjian", { id: hapusTarget.id });
      toast.success("Ujian beserta soal & hasilnya dihapus.");
      segarkan();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setHapusTarget(null);
    }
  };

  if (ujian === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Kelola ujian</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "Atur jadwal, token per mapel, kelas peserta, aktif/nonaktif & izin unduh ke siswa; token dibagikan ke pengawas ruang."
            : "Susun soal, pilihan jawaban, dan kunci jawaban ujian yang sudah dibuat admin."}
        </p>
      </div>

      {/* Form ujian baru — ADMIN */}
      {isAdmin ? (
        <Card className="border-border/70">
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-2">
              <Label htmlFor="judul">Judul ujian baru</Label>
              <Input
                id="judul"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="cth. Matematika — Bab Trigonometri"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deskripsi">Deskripsi (opsional)</Label>
              <Textarea
                id="deskripsi"
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                placeholder="cth. 10 soal pilihan ganda, kerjakan 30 menit."
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="token-baru" className="gap-1.5">
                  <KeyRound className="size-3.5" /> Token
                </Label>
                <Input
                  id="token-baru"
                  value={tokenBaru}
                  onChange={(e) => setTokenBaru(e.target.value.toUpperCase())}
                  placeholder="otomatis bila kosong"
                  maxLength={12}
                  autoComplete="off"
                  className="font-mono font-bold uppercase tracking-[0.25em]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="durasi-baru">Durasi (menit)</Label>
                <Input
                  id="durasi-baru"
                  type="number"
                  min={1}
                  max={600}
                  value={durasi}
                  onChange={(e) => setDurasi(Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tgl-mulai" className="gap-1.5">
                  <CalendarClock className="size-3.5" /> Mulai ujian
                </Label>
                <Input
                  id="tgl-mulai"
                  type="datetime-local"
                  value={tglMulai}
                  onChange={(e) => setTglMulai(e.target.value)}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs leading-5 text-muted-foreground">
              "Mulai ujian" = jadwal peserta: siswa baru bisa mengklik/mulai
              mengerjakan pada tanggal & jam tersebut. Unduh soal ke siswa
              dibuka lewat tombol <strong>izin unduh</strong> di daftar bawah.
            </p>

            <PemilihSasaran
              jenis={sasarJenis}
              setJenis={setSasarJenis}
              nilai={sasarNilai}
              setNilai={setSasarNilai}
              kelasList={kelasList}
              tingkatList={tingkatList}
            />

            <Button onClick={buat} disabled={busy} className="gap-2">
              <Plus className="size-4" /> Buat ujian
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Jadwal, sasaran, token, dan status aktif diset oleh{" "}
          <strong className="text-foreground">admin</strong>. Kamu fokus menyusun
          soal dan kunci jawabannya.
        </div>
      )}

      {ujian.length === 0 ? (
        <Empty className="rounded-3xl border border-dashed border-border/70 py-14">
          <EmptyContent>
            <EmptyTitle>Belum ada ujian</EmptyTitle>
            <EmptyDescription>
              Buat ujian pertama menggunakan formulir di atas.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Accordion type="multiple" className="space-y-4">
          {ujian.map((u) => (
            <AccordionItem
              key={u.id}
              value={u.id}
              className="overflow-hidden rounded-3xl border border-border/70 bg-card px-5 shadow-[0_1px_2px_rgba(16,20,24,0.04)]"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-3 pr-4 text-left">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <ClipboardList className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold tracking-tight sm:text-base">
                      {u.judul}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {u.jumlah_soal} soal · {u.durasi_menit} menit
                      {u.tgl_mulai
                        ? ` · Jadwal ${jadwalLabel(u.tgl_mulai)}`
                        : " · Tanpa jadwal (langsung dibuka)"}
                      {isAdmin && u.token ? ` · Token ${u.token}` : ""}
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <Users className="size-3" /> {u.sasaran}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`gap-1 text-[11px] ${
                        u.boleh_unduh
                          ? "border-emerald-600 text-emerald-700"
                          : "border-amber-500 text-amber-700"
                      }`}
                    >
                      <Download className="size-3" />
                      {u.boleh_unduh ? "Izin unduh ON" : "Izin unduh OFF"}
                    </Badge>
                    {isAdmin && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          u.konfirmasi_guru
                            ? "border-emerald-600 bg-emerald-500/10 text-emerald-700"
                            : "border-red-500 bg-red-500/10 text-red-600"
                        }`}
                        title={
                          u.konfirmasi_guru
                            ? `Soal dikonfirmasi siap dibagikan${
                                u.konfirmasi_pada ? ` (${u.konfirmasi_pada})` : ""
                              }`
                            : "Guru belum mengirim konfirmasi soal selesai — lampu merah."
                        }
                      >
                        <span
                          className={`size-2 rounded-full ${
                            u.konfirmasi_guru
                              ? "animate-pulse bg-emerald-500"
                              : "bg-red-500"
                          }`}
                        />
                        {u.konfirmasi_guru ? "Soal siap" : "Belum konfirmasi"}
                      </span>
                    )}
                    <Badge
                      variant={u.aktif ? "default" : "secondary"}
                      className={u.aktif ? "bg-emerald-600 text-white" : ""}
                    >
                      {u.aktif ? "Aktif" : "Draft"}
                    </Badge>
                  </span>
                </div>
              </AccordionTrigger>

              <AccordionContent className="pb-5">
                <div className="space-y-5">
                  {isAdmin ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={u.aktif ? "outline" : "default"}
                        size="sm"
                        className="gap-2"
                        onClick={() => ubahAktif(u.id, !u.aktif, u.judul)}
                      >
                        <Power className="size-4" />
                        {u.aktif ? "Nonaktifkan" : "Aktifkan ujian"}
                      </Button>
                      <Button
                        variant={u.boleh_unduh ? "outline" : "default"}
                        size="sm"
                        className="gap-2"
                        onClick={() => ubahIzin(u.id, !u.boleh_unduh, u.judul)}
                        disabled={!u.aktif}
                        title={
                          u.aktif
                            ? undefined
                            : "Aktifkan ujian dulu sebelum membuka izin unduh."
                        }
                      >
                        <Share2 className="size-4" />
                        {u.boleh_unduh
                          ? "Tutup izin unduh"
                          : "Izinkan unduh ke siswa"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-red-600 hover:text-red-700"
                        onClick={() => setHapusTarget({ id: u.id, judul: u.judul })}
                      >
                        <Trash2 className="size-4" /> Hapus ujian
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => void bukaCetak(u)}
                      >
                        <Printer className="size-4" /> Cetak kartu
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Badge variant={u.aktif ? "default" : "secondary"}>
                        {u.aktif ? "Aktif" : "Draft"}
                      </Badge>
                      <span>{u.jumlah_soal} soal tersusun</span>
                      <Badge
                        variant="outline"
                        className={
                          u.boleh_unduh
                            ? "border-emerald-600 text-emerald-700"
                            : "border-amber-500 text-amber-700"
                        }
                      >
                        {u.boleh_unduh
                          ? "Siswa boleh unduh"
                          : "Unduh belum dibuka"}
                      </Badge>
                    </div>
                  )}

                  {/* Konfirmasi guru: soal selesai & siap dibagikan */}
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-background/60 p-4 transition-colors hover:border-foreground/30">
                    <Checkbox
                      checked={u.konfirmasi_guru ?? false}
                      onCheckedChange={(v) =>
                        void konfirmasiSoal(u.id, v === true, u.judul)
                      }
                      className="mt-0.5"
                      disabled={u.jumlah_soal === 0}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        Kirim konfirmasi — soal sudah selesai & siap dibagikan
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {u.jumlah_soal === 0
                          ? "Belum ada soal — susun soal dulu sebelum mengonfirmasi."
                          : u.konfirmasi_guru
                            ? `Terkirim${
                                u.konfirmasi_pada ? ` ${u.konfirmasi_pada}` : ""
                              } — admin melihat lampu hijau.`
                            : "Centang setelah seluruh soal final. Perubahan isi soal otomatis membatalkan konfirmasi ini."}
                      </span>
                    </span>
                  </label>

                  {isAdmin && (
                    <PanelPengaturan
                      ujianId={u.id}
                      token={u.token ?? ""}
                      durasi={u.durasi_menit}
                      tglMulai={u.tgl_mulai ?? ""}
                      sasarJenis={(u.sasar_jenis ?? "") as SasarJenis}
                      sasarNilai={u.sasar_nilai ?? ""}
                      kelasList={kelasList}
                      tingkatList={tingkatList}
                    />
                  )}

                  <PanelSoal ujianId={u.id} />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <AlertDialog
        open={hapusTarget !== null}
        onOpenChange={(open) => !open && setHapusTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus ujian ini?</AlertDialogTitle>
            <AlertDialogDescription>
              "{hapusTarget?.judul}" beserta seluruh soal dan hasil siswanya akan
              dihapus permanen dari database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={konfirmasiHapus}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Ya, hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog cetak kartu ujian (ukuran KTP) */}
      <Dialog
        open={cetakTarget !== null}
        onOpenChange={(open) => !open && setCetakTarget(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cetak kartu ujian</DialogTitle>
            <DialogDescription>
              "{cetakTarget?.judul}" — kartu ukuran KTP (85,6 × 54 mm) untuk {" "}
              {cetakSiswa?.length ?? 0} siswa sesuai sasaran ujian, lengkap
              dengan kop, logo & tanda tangan kepala madrasah.
            </DialogDescription>
          </DialogHeader>

          {cetakMuat || !cetakSet || !cetakSiswa ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-4">
              {/* Pilihan kertas */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={cetakMode === "A4" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCetakMode("A4")}
                >
                  A4 — 10 kartu (siap potong)
                </Button>
                <Button
                  variant={cetakMode === "KTP" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCetakMode("KTP")}
                >
                  KTP — 1 kartu / halaman
                </Button>
              </div>

              {(!cetakSet.logo || !cetakSet.ttd || !cetakSet.kepala) && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-800">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Setelan kartu belum lengkap (
                    {[
                      !cetakSet.logo ? "logo" : null,
                      !cetakSet.ttd ? "tanda tangan" : null,
                      !cetakSet.kepala ? "nama kepala madrasah" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    ). Lengkapi di menu <strong>Pengaturan</strong> agar kartu
                    tampil sempurna.
                  </span>
                </div>
              )}

              {/* Pratinjau */}
              <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Pratinjau
                  {contohKartu ? ` — ${contohKartu.nama}` : ""}
                </p>
                {contohKartu ? (
                  <div className="mt-3 h-[300px] w-full overflow-hidden">
                    <div
                      style={{
                        width: "85.6mm",
                        transform: "scale(1.4)",
                        transformOrigin: "top left",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: kartuHTML(cetakSet, contohKartu),
                      }}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tidak ada siswa yang cocok dengan sasaran ujian ini —
                    periksa Data Siswa atau sasaran ujian.
                  </p>
                )}
              </div>
              <style>{gayaKartu()}</style>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCetakTarget(null)}>
              Tutup
            </Button>
            <Button
              className="gap-2"
              onClick={jalankanCetak}
              disabled={
                cetakMuat ||
                !cetakSet ||
                !cetakSiswa ||
                cetakSiswa.length === 0
              }
            >
              <Printer className="size-4" /> Cetak {cetakSiswa?.length ?? 0}{" "}
              kartu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Daftar soal + form tambah soal untuk satu ujian (dengan kunci jawaban). */
function PanelSoal({ ujianId }: { ujianId: string }) {
  const [soal, setSoal] = useState<SoalGas[] | null>(null);
  const [form, setForm] = useState(FORM_KOSONG);
  const [kunci, setKunci] = useState<Kunci>("A");
  /** Pilihan sudah menyertakan huruf A–E (teks diketik beserta hurufnya). */
  const [sudahHuruf, setSudahHuruf] = useState(false);
  /** Kotak tempel: satu soal lengkap dipecah otomatis ke kolom A–E. */
  const [tempel, setTempel] = useState("");
  const [prosesGambar, setProsesGambar] = useState(false);
  const refGambar = useRef<HTMLInputElement | null>(null);
  /** id soal yang sedang diperbaiki (null = mode tambah). */
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dialog impor soal dari Word (.docx / tempel teks).
  const [imporBuka, setImporBuka] = useState(false);
  const [teksImpor, setTeksImpor] = useState("");
  const [namaFileImpor, setNamaFileImpor] = useState("");
  const [pratinjau, setPratinjau] = useState<BarisSoalOtomat[] | null>(null);
  const [imporBusy, setImporBusy] = useState(false);
  const refFileImpor = useRef<HTMLInputElement | null>(null);

  const muat = () => {
    setSoal(null);
    gasCall<{ soal: SoalGas[] }>("getSoalAdmin", { ujian_id: ujianId })
      .then((res) => setSoal(res.soal))
      .catch(() => setSoal([]));
  };

  useEffect(muat, [ujianId]);

  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  /** Isi form dari soal terpilih → mode ubah. */
  const mulaiEdit = (s: SoalGas) => {
    setEditId(s.id);
    setForm({
      pertanyaan: s.pertanyaan,
      opsi_a: s.opsi_a,
      opsi_b: s.opsi_b,
      opsi_c: s.opsi_c,
      opsi_d: s.opsi_d,
      opsi_e: s.opsi_e || "",
      gambar: s.gambar || "",
    });
    setKunci(((s.kunci_jawaban || "A").toUpperCase() as Kunci) || "A");
    setSudahHuruf((s.opsi_huruf ?? 0) === 1);
    setTempel("");
  };

  const batalEdit = () => {
    setEditId(null);
    setForm(FORM_KOSONG);
    setKunci("A");
    setTempel("");
    // Mode "sudah berhuruf" sengaja dipertahankan agar nyaman untuk soal berikutnya.
  };

  const simpan = async () => {
    if (!form.pertanyaan.trim()) {
      toast.error("Pertanyaan wajib diisi.");
      return;
    }
    if (OPSI_WAJIB.some((p) => !form[`opsi_${p}` as keyof typeof form].trim())) {
      toast.error("Opsi A–D wajib diisi; opsi E bersifat opsional.");
      return;
    }
    if (kunci === "E" && !form.opsi_e.trim()) {
      toast.error("Opsi E kosong — pilih kunci A–D atau isi opsi E.");
      return;
    }
    setBusy(true);
    try {
      const muatan = {
        ujian_id: ujianId,
        pertanyaan: form.pertanyaan.trim(),
        opsi_a: form.opsi_a.trim(),
        opsi_b: form.opsi_b.trim(),
        opsi_c: form.opsi_c.trim(),
        opsi_d: form.opsi_d.trim(),
        opsi_e: form.opsi_e.trim(),
        kunci_jawaban: kunci,
        gambar: form.gambar,
        opsi_huruf: sudahHuruf ? 1 : 0,
      };
      if (editId) {
        await gasCall("ubahSoal", { id: editId, ...muatan });
        toast.success("Soal diperbarui — siswa yang sudah unduh diminta sinkron ulang.");
      } else {
        await gasCall("tambahSoal", muatan);
        toast.success("Soal ditambahkan.");
      }
      setForm(FORM_KOSONG);
      setKunci("A");
      setEditId(null);
      setTempel("");
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan soal.");
    } finally {
      setBusy(false);
    }
  };

  /** Upload gambar soal → data URL JPEG ukuran HP (dikecilkan otomatis). */
  const pilihGambar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProsesGambar(true);
    try {
      const dataUrl = await gambarKeDataUrl(file, 900, 0.72);
      if (dataUrl.length > MAKS_GAMBAR_SOAL) {
        throw new Error(
          "Gambar masih terlalu besar setelah dikompres (maks ±300 KB). Pilih gambar yang lebih sederhana atau potong dulu gambarnya.",
        );
      }
      setForm((f) => ({ ...f, gambar: dataUrl }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca gambar.");
    } finally {
      setProsesGambar(false);
    }
  };

  /** Pecah kotak tempel (satu soal lengkap) menjadi kolom pertanyaan & A–E. */
  const pecahTempel = () => {
    const hasil = parseTeksSoal(tempel);
    const b = hasil[0];
    if (!b) {
      toast.error(
        'Tidak menemukan pilihan berhuruf A–E. Tulis pilihan seperti "A. … B. …" lalu coba lagi.',
      );
      return;
    }
    if (hasil.length > 1) {
      toast.warning(
        `Teks berisi ${hasil.length} soal — hanya soal pertama yang dipakai. Untuk banyak soal, gunakan “Impor dari Word”.`,
      );
    }
    const amb = (i: number) => (sudahHuruf ? b.opsiMentah[i] : b.opsi[i]);
    setForm((f) => ({
      ...f,
      pertanyaan: b.pertanyaan || f.pertanyaan,
      opsi_a: amb(0),
      opsi_b: amb(1),
      opsi_c: amb(2),
      opsi_d: amb(3),
      opsi_e: amb(4),
    }));
    if (b.kunci) setKunci(b.kunci);
    setTempel("");
    const jumlah = [0, 1, 2, 3, 4].filter((i) => amb(i) !== "").length;
    toast.success(
      `Teks terurai: ${jumlah} pilihan${b.kunci ? `, kunci ${b.kunci}` : " — kunci belum terdeteksi"}.`,
    );
  };

  /* ---------------- Impor dari Word (dialog) ---------------- */

  const bukaImpor = () => {
    setTeksImpor("");
    setNamaFileImpor("");
    setPratinjau(null);
    setImporBuka(true);
  };

  const pilihFileImpor = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporBusy(true);
    try {
      const teks = await bacaFileSoal(file);
      if (!teks.trim()) throw new Error("File tidak berisi teks.");
      setTeksImpor(teks);
      setNamaFileImpor(file.name);
      setPratinjau(null);
      toast.success('File dibaca — klik "Baca & pratinjau".');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca file.");
    } finally {
      setImporBusy(false);
    }
  };

  const uraiTeks = () => {
    const hasil = parseTeksSoal(teksImpor);
    if (hasil.length === 0) {
      toast.error(
        'Tidak menemukan soal. Format yang didukung: nomor "1." atau "1)" + pilihan "A. …" (per baris atau satu baris).',
      );
      return;
    }
    setPratinjau(hasil);
  };

  const barisSiap = (pratinjau ?? []).filter(
    (b) =>
      b.pertanyaan.trim() !== "" &&
      [0, 1, 2, 3].every((i) => b.opsi[i].trim() !== "") &&
      b.kunci !== "",
  );

  const setKunciPratinjau = (i: number, h: Kunci) =>
    setPratinjau((rows) =>
      rows ? rows.map((r, j) => (j === i ? { ...r, kunci: h } : r)) : rows,
    );

  const hapusPratinjau = (i: number) =>
    setPratinjau((rows) => (rows ? rows.filter((_, j) => j !== i) : rows));

  const jalankanImpor = async () => {
    if (barisSiap.length === 0) return;
    setImporBusy(true);
    try {
      const res = await gasCall<{ message?: string }>("imporSoal", {
        ujian_id: ujianId,
        soal: barisSiap.map((b) => ({
          pertanyaan: b.pertanyaan.trim(),
          opsi_a: b.opsi[0].trim(),
          opsi_b: b.opsi[1].trim(),
          opsi_c: b.opsi[2].trim(),
          opsi_d: b.opsi[3].trim(),
          opsi_e: b.opsi[4].trim(),
          kunci_jawaban: b.kunci,
        })),
      });
      const dilewati = (pratinjau?.length ?? 0) - barisSiap.length;
      toast.success(
        `${res.message ?? `${barisSiap.length} soal diimpor.`}${
          dilewati > 0 ? ` ${dilewati} baris belum lengkap dilewati.` : ""
        }`,
      );
      setImporBuka(false);
      setTeksImpor("");
      setNamaFileImpor("");
      setPratinjau(null);
      muat();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengimpor soal.");
    } finally {
      setImporBusy(false);
    }
  };

  const isiContoh = async () => {
    setBusy(true);
    try {
      await gasCall("tambahSoalContoh", { ujian_id: ujianId });
      muat();
      toast.success("5 soal contoh ditambahkan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengisi contoh.");
    } finally {
      setBusy(false);
    }
  };

  const buang = async (id: string) => {
    try {
      await gasCall("hapusSoal", { id });
      muat();
      toast.success("Soal dihapus.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus soal.");
    }
  };

  if (soal === null) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-5">
      {soal.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
          <p className="text-sm font-semibold">Belum ada soal</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Tambahkan soal satu per satu, atau isi 5 soal contoh untuk percobaan.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={isiContoh}
              disabled={busy}
            >
              <Sparkles className="size-4" /> Isi 5 soal contoh
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={bukaImpor}>
              <FileText className="size-4" /> Impor dari Word
            </Button>
          </div>
        </div>
      ) : (
        <ol className="space-y-3">
          {soal.map((s, i) => (
            <li
              key={s.id}
              className="rounded-2xl border border-border/70 bg-background/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Soal {i + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-6">
                    {s.pertanyaan}
                  </p>
                  {s.gambar && (
                    <img
                      src={s.gambar}
                      alt={`Gambar soal ${i + 1}`}
                      className="mt-2 max-h-44 rounded-xl border border-border/70 object-contain"
                    />
                  )}
                  <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <li>{labelOpsi("A", s.opsi_a, s.opsi_huruf)}</li>
                    <li>{labelOpsi("B", s.opsi_b, s.opsi_huruf)}</li>
                    <li>{labelOpsi("C", s.opsi_c, s.opsi_huruf)}</li>
                    <li>{labelOpsi("D", s.opsi_d, s.opsi_huruf)}</li>
                    {s.opsi_e && (
                      <li>{labelOpsi("E", s.opsi_e, s.opsi_huruf)}</li>
                    )}
                  </ul>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <KeyRound className="size-3.5" /> Kunci: {s.kunci_jawaban}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => mulaiEdit(s)}
                    aria-label="Ubah soal"
                    title="Perbaiki soal"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-red-600"
                    onClick={() => buang(s.id)}
                    aria-label="Hapus soal"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Tambah soal */}
      <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">
            {editId ? "Ubah / perbaiki soal" : "Tambah soal"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={bukaImpor}
            disabled={busy || imporBusy}
          >
            <FileText className="size-3.5" /> Impor dari Word
          </Button>
        </div>
        {editId && (
          <p className="mt-1 text-xs leading-5 text-amber-700">
            Perbaikan menaikkan revisi soal — siswa yang sudah mengunduh akan
            diminta sinkron ulang (wajib online sesaat sebelum mengerjakan).
          </p>
        )}
        <div className="mt-3 space-y-3">
          <Input
            value={form.pertanyaan}
            onChange={set("pertanyaan")}
            placeholder="Tulis pertanyaan…"
          />

          {/* Pilihan gaya penulisan pilihan jawaban */}
          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-3">
            <p className="text-xs font-bold">Pilihan jawaban saat menulis soal:</p>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name={`huruf-${ujianId}`}
                className="mt-0.5 accent-emerald-600"
                checked={!sudahHuruf}
                onChange={() => setSudahHuruf(false)}
              />
              <span className="text-xs leading-5">
                <strong>Belum menyertakan huruf</strong> — isi pilihan tanpa A., B., …
                (huruf ditambahkan otomatis saat tampil ke siswa).
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name={`huruf-${ujianId}`}
                className="mt-0.5 accent-emerald-600"
                checked={sudahHuruf}
                onChange={() => setSudahHuruf(true)}
              />
              <span className="text-xs leading-5">
                <strong>Sudah menyertakan huruf A–E</strong> — pilihan diketik beserta
                hurufnya (mis. “A. Jakarta”) dan tampil apa adanya untuk siswa.
              </span>
            </label>
          </div>

          {/* Tempel satu soal lengkap → pecah otomatis */}
          <div className="rounded-2xl border border-dashed border-border/70 p-3">
            <Textarea
              value={tempel}
              onChange={(e) => setTempel(e.target.value)}
              rows={3}
              placeholder="Opsional: tempel satu soal lengkap di sini — pertanyaan + pilihan A. B. C. D. (kunci seperti “Kunci: B” terdeteksi otomatis)"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={pecahTempel}
                disabled={!tempel.trim()}
              >
                <Wand2 className="size-3.5" /> Pecah otomatis ke kolom A–E
              </Button>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {sudahHuruf
                  ? "Huruf A., B., … dipertahankan apa adanya."
                  : "Huruf A., B., … dibuang dari kolom."}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PILIHAN.map((p) => (
              <Input
                key={p}
                value={form[`opsi_${p}` as keyof typeof form]}
                onChange={set(`opsi_${p}` as keyof typeof form)}
                placeholder={
                  sudahHuruf
                    ? p === "E"
                      ? `E. … (opsional)`
                      : `${p}. …`
                    : p === "E"
                      ? "Opsi E (opsional)"
                      : `Opsi ${p}`
                }
              />
            ))}
          </div>

          {/* Gambar soal (untuk soal bergambar) */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={refGambar}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void pilihGambar(e)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => refGambar.current?.click()}
              disabled={prosesGambar}
            >
              <ImagePlus className="size-3.5" />
              {prosesGambar
                ? "Memproses…"
                : form.gambar
                  ? "Ganti gambar"
                  : "Tambah gambar soal"}
            </Button>
            {form.gambar && (
              <span className="relative inline-block">
                <img
                  src={form.gambar}
                  alt="Pratinjau gambar soal"
                  className="h-16 rounded-lg border border-border/70 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, gambar: "" }))}
                  className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
                  aria-label="Hapus gambar"
                  title="Hapus gambar"
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            {form.gambar && (
              <span className="text-[11px] leading-4 text-muted-foreground">
                Gambar otomatis dikompres & ikut tersimpan di HP siswa.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Kunci jawaban:
            </span>
            {PILIHAN.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setKunci(p)}
                className={`size-9 rounded-xl border text-sm font-bold transition-colors ${
                  kunci === p
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-border/70 bg-card text-muted-foreground hover:border-foreground/40"
                }`}
                aria-label={`Kunci ${p}`}
              >
                {p}
              </button>
            ))}
            {editId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={batalEdit}
                disabled={busy}
              >
                Batal
              </Button>
            )}
            <Button
              className="ml-auto gap-2"
              size="sm"
              onClick={simpan}
              disabled={busy}
            >
              <Plus className="size-4" />
              {editId ? "Simpan perubahan" : "Simpan soal"}
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog impor soal dari Word (.docx / tempel teks) */}
      <Dialog open={imporBuka} onOpenChange={(open) => !open && setImporBuka(false)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Impor soal dari Word</DialogTitle>
            <DialogDescription>
              Unggah file .docx atau tempel teks soal — nomor “1.”, pilihan
              “A. …”, dan kunci jawaban dibaca otomatis lalu ditampilkan untuk
              diperiksa dulu sebelum masuk. Gambar di dalam dokumen belum ikut
              diimpor (bisa ditambahkan manual per soal).
            </DialogDescription>
          </DialogHeader>

          <input
            ref={refFileImpor}
            type="file"
            accept=".docx,.txt"
            className="hidden"
            onChange={(e) => void pilihFileImpor(e)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => refFileImpor.current?.click()}
              disabled={imporBusy}
            >
              <Upload className="size-4" /> Pilih file .docx
            </Button>
            {namaFileImpor && (
              <span className="text-xs font-semibold text-muted-foreground">
                {namaFileImpor}
              </span>
            )}
          </div>

          <Textarea
            value={teksImpor}
            onChange={(e) => setTeksImpor(e.target.value)}
            rows={7}
            placeholder="… atau tempel langsung isi dokumen Word di sini."
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={uraiTeks}
              disabled={imporBusy || !teksImpor.trim()}
            >
              <Wand2 className="size-4" /> Baca & pratinjau
            </Button>
            {pratinjau && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPratinjau(null)}
              >
                Ulang
              </Button>
            )}
          </div>

          {pratinjau && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pratinjau — {barisSiap.length} dari {pratinjau.length} soal siap
                diimpor
              </p>
              {pratinjau.map((b, i) => {
                const siap = barisSiap.includes(b);
                const kurangPilihan = [0, 1, 2, 3].some(
                  (idx) => b.opsi[idx].trim() === "",
                );
                return (
                  <div
                    key={`${b.nomor}-${i}`}
                    className="rounded-xl border border-border/70 bg-background/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-xs font-semibold leading-5">
                        <span className="text-muted-foreground">
                          {b.nomor ? `${b.nomor}. ` : ""}
                        </span>
                        {b.pertanyaan || "(pertanyaan kosong)"}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={() => hapusPratinjau(i)}
                        aria-label="Keluarkan dari daftar impor"
                        title="Keluarkan dari daftar impor"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <ul className="mt-1.5 grid gap-0.5 text-[11px] leading-4 text-muted-foreground sm:grid-cols-2">
                      {(["A", "B", "C", "D", "E"] as const).map((h, idx) =>
                        b.opsi[idx] ? (
                          <li key={h}>
                            <span className="font-bold text-foreground">{h}.</span>{" "}
                            {b.opsi[idx]}
                          </li>
                        ) : null,
                      )}
                    </ul>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Kunci:
                      </span>
                      {(["A", "B", "C", "D", "E"] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setKunciPratinjau(i, h)}
                          className={`size-6 rounded-lg text-[11px] font-bold transition-colors ${
                            b.kunci === h
                              ? "bg-emerald-600 text-white"
                              : "border border-border/70 bg-card text-muted-foreground hover:border-foreground/40"
                          }`}
                          aria-label={`Pilih kunci ${h}`}
                        >
                          {h}
                        </button>
                      ))}
                      {!siap && (
                        <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          {!b.pertanyaan.trim()
                            ? "pertanyaan kosong"
                            : kurangPilihan
                              ? "pilihan kurang dari 4"
                              : "kunci belum dipilih"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImporBuka(false)}
              disabled={imporBusy}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="gap-2"
              onClick={jalankanImpor}
              disabled={imporBusy || barisSiap.length === 0}
            >
              <FileText className="size-4" /> Impor {barisSiap.length} soal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pengaturan ujian khusus admin: token, durasi, jadwal, sasaran. */
function PanelPengaturan(props: {
  ujianId: string;
  token: string;
  durasi: number;
  tglMulai: string;
  sasarJenis: SasarJenis;
  sasarNilai: string;
  kelasList: string[];
  tingkatList: string[];
}) {
  const [nilaiToken, setNilaiToken] = useState(props.token);
  const [nilaiDurasi, setNilaiDurasi] = useState(String(props.durasi));
  const [tgl, setTgl] = useState(props.tglMulai);
  const [jenis, setJenis] = useState<SasarJenis>(props.sasarJenis);
  const [nilai, setNilai] = useState(props.sasarNilai);
  const [busy, setBusy] = useState(false);

  const simpan = async () => {
    const menit = Math.floor(Number(nilaiDurasi));
    if (!tokenValid(nilaiToken)) {
      toast.error("Token harus 4–12 huruf/angka tanpa spasi.");
      return;
    }
    if (!Number.isFinite(menit) || menit < 1 || menit > 600) {
      toast.error("Durasi harus 1–600 menit.");
      return;
    }
    if (jenis === "kelas" && !nilai) {
      toast.error("Centang minimal satu kelas.");
      return;
    }
    setBusy(true);
    try {
      await gasCall("aturUjian", {
        id: props.ujianId,
        token: nilaiToken.trim().toUpperCase(),
        durasi_menit: menit,
        tgl_mulai: tgl,
        sasar_jenis: jenis,
        sasar_nilai: nilai,
      });
      toast.success("Pengaturan ujian disimpan.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan pengaturan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <p className="text-sm font-bold">Token, waktu & sasaran</p>
        <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider">
          Admin
        </Badge>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`token-${props.ujianId}`}>Token ujian</Label>
          <div className="flex gap-2">
            <Input
              id={`token-${props.ujianId}`}
              value={nilaiToken}
              onChange={(e) => setNilaiToken(e.target.value.toUpperCase())}
              maxLength={12}
              autoComplete="off"
              className="font-mono font-bold uppercase tracking-[0.3em]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => setNilaiToken(tokenAcak())}
              aria-label="Acak token"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`durasi-${props.ujianId}`}>Durasi (menit)</Label>
          <Input
            id={`durasi-${props.ujianId}`}
            type="number"
            min={1}
            max={600}
            value={nilaiDurasi}
            onChange={(e) => setNilaiDurasi(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor={`tgl-${props.ujianId}`} className="gap-1.5">
            <CalendarClock className="size-3.5" /> Tanggal & jam mulai
          </Label>
          <Input
            id={`tgl-${props.ujianId}`}
            type="datetime-local"
            value={tgl}
            onChange={(e) => setTgl(e.target.value)}
            className="sm:max-w-xs"
          />
        </div>
      </div>

      <div className="mt-3">
        <PemilihSasaran
          jenis={jenis}
          setJenis={setJenis}
          nilai={nilai}
          setNilai={setNilai}
          kelasList={props.kelasList}
          tingkatList={props.tingkatList}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={simpan} disabled={busy}>
          Simpan pengaturan
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Token dibagikan ke <strong>pengawas ruang</strong>; siswa memasukkannya
          saat Mulai Ujian (validasi lokal, bisa offline).
        </p>
      </div>
    </div>
  );
}
