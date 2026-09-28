import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { gasCall, tokenValid, type SoalGas, type UjianGas } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  ClipboardList,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const PILIHAN = ["A", "B", "C", "D", "E"] as const;
const OPSI_WAJIB = ["A", "B", "C", "D"] as const;

type Kunci = "A" | "B" | "C" | "D" | "E";

const ACAPAN_TOKEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tokenAcak(): string {
  return Array.from(
    { length: 6 },
    () => ACAPAN_TOKEN[Math.floor(Math.random() * ACAPAN_TOKEN.length)],
  ).join("");
}

/** Kelola ujian: buat, aktifkan, susun soal, hapus. (guru & admin) */
export function KelolaUjian() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [ujian, setUjian] = useState<UjianGas[] | null>(null);
  const [versi, setVersi] = useState(0);

  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [tokenBaru, setTokenBaru] = useState("");
  const [durasi, setDurasi] = useState(60);
  const [busy, setBusy] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<{ id: string; judul: string } | null>(
    null,
  );

  useEffect(() => {
    let hidup = true;
    setUjian(null);
    gasCall<{ ujian: UjianGas[] }>("getUjian")
      .then((res) => {
        if (hidup) setUjian(res.ujian);
      })
      .catch((err) => {
        if (hidup) {
          toast.error(
            err instanceof Error ? err.message : "Gagal memuat daftar ujian.",
          );
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
    setBusy(true);
    try {
      await gasCall("buatUjian", {
        judul: judul.trim(),
        deskripsi: deskripsi.trim(),
        token: tokenBaru.trim() || undefined,
        durasi_menit: durasi,
      });
      setJudul("");
      setDeskripsi("");
      setTokenBaru("");
      setDurasi(60);
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
          ? `"${judulUjian}" aktif — siswa bisa mengunduh soal.`
          : `"${judulUjian}" dinonaktifkan.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status.");
    }
  };

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
            ? "Buat ujian, atur token & waktu, lalu aktifkan; token dibagikan ke pengawas ruang."
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="token-baru">Token ujian (opsional)</Label>
                <Input
                  id="token-baru"
                  value={tokenBaru}
                  onChange={(e) => setTokenBaru(e.target.value.toUpperCase())}
                  placeholder="kosong = dibuat otomatis"
                  maxLength={12}
                  autoComplete="off"
                  className="font-mono font-bold uppercase tracking-[0.3em]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="durasi-baru">Waktu ujian (menit)</Label>
                <Input
                  id="durasi-baru"
                  type="number"
                  min={1}
                  max={600}
                  value={durasi}
                  onChange={(e) => setDurasi(Number(e.target.value))}
                />
              </div>
            </div>
            <Button onClick={buat} disabled={busy} className="gap-2">
              <Plus className="size-4" /> Buat ujian
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Token, waktu, dan status aktif ujian diset oleh{" "}
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
                      {u.jumlah_soal} soal · durasi {u.durasi_menit} menit
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-2">
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
                        variant="outline"
                        size="sm"
                        className="gap-2 text-red-600 hover:text-red-700"
                        onClick={() => setHapusTarget({ id: u.id, judul: u.judul })}
                      >
                        <Trash2 className="size-4" /> Hapus ujian
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Badge variant={u.aktif ? "default" : "secondary"}>
                        {u.aktif ? "Aktif" : "Draft"}
                      </Badge>
                      <span>{u.jumlah_soal} soal tersusun</span>
                    </div>
                  )}

                  {isAdmin && (
                    <PanelPengaturan ujianId={u.id} token={u.token ?? ""} durasi={u.durasi_menit} />
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
              dihapus permanen dari Google Sheets.
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
    </div>
  );
}

/** Daftar soal + form tambah soal untuk satu ujian (GAS, dengan kunci). */
function PanelSoal({ ujianId }: { ujianId: string }) {
  const [soal, setSoal] = useState<SoalGas[] | null>(null);
  const [form, setForm] = useState({
    pertanyaan: "",
    opsi_a: "",
    opsi_b: "",
    opsi_c: "",
    opsi_d: "",
    opsi_e: "",
  });
  const [kunci, setKunci] = useState<Kunci>("A");
  const [busy, setBusy] = useState(false);

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
      await gasCall("tambahSoal", {
        ujian_id: ujianId,
        pertanyaan: form.pertanyaan.trim(),
        opsi_a: form.opsi_a.trim(),
        opsi_b: form.opsi_b.trim(),
        opsi_c: form.opsi_c.trim(),
        opsi_d: form.opsi_d.trim(),
        opsi_e: form.opsi_e.trim(),
        kunci_jawaban: kunci,
      });
      setForm({
        pertanyaan: "",
        opsi_a: "",
        opsi_b: "",
        opsi_c: "",
        opsi_d: "",
        opsi_e: "",
      });
      setKunci("A");
      muat();
      toast.success("Soal ditambahkan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menambah soal.");
    } finally {
      setBusy(false);
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
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={isiContoh}
            disabled={busy}
          >
            <Sparkles className="size-4" /> Isi 5 soal contoh
          </Button>
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
                  <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <li>A. {s.opsi_a}</li>
                    <li>B. {s.opsi_b}</li>
                    <li>C. {s.opsi_c}</li>
                    <li>D. {s.opsi_d}</li>
                    {s.opsi_e && <li>E. {s.opsi_e}</li>}
                  </ul>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <KeyRound className="size-3.5" /> Kunci: {s.kunci_jawaban}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-red-600"
                  onClick={() => buang(s.id)}
                  aria-label="Hapus soal"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Tambah soal */}
      <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
        <p className="text-sm font-bold">Tambah soal</p>
        <div className="mt-3 space-y-3">
          <Input
            value={form.pertanyaan}
            onChange={set("pertanyaan")}
            placeholder="Tulis pertanyaan…"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {PILIHAN.map((p) => (
              <Input
                key={p}
                value={form[`opsi_${p}` as keyof typeof form]}
                onChange={set(`opsi_${p}` as keyof typeof form)}
                placeholder={p === "E" ? "Opsi E (opsional)" : `Opsi ${p}`}
              />
            ))}
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
            <Button
              className="ml-auto gap-2"
              size="sm"
              onClick={simpan}
              disabled={busy}
            >
              <Plus className="size-4" /> Simpan soal
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pengaturan ujian khusus admin: token & durasi waktu. */
function PanelPengaturan({
  ujianId,
  token,
  durasi,
}: {
  ujianId: string;
  token: string;
  durasi: number;
}) {
  const [nilaiToken, setNilaiToken] = useState(token);
  const [nilaiDurasi, setNilaiDurasi] = useState(String(durasi));
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
    setBusy(true);
    try {
      await gasCall("aturUjian", {
        id: ujianId,
        token: nilaiToken.trim().toUpperCase(),
        durasi_menit: menit,
      });
      toast.success("Token & waktu ujian disimpan.");
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
        <p className="text-sm font-bold">Token & waktu ujian</p>
        <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider">
          Admin
        </Badge>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`token-${ujianId}`}>Token ujian</Label>
          <div className="flex gap-2">
            <Input
              id={`token-${ujianId}`}
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
          <Label htmlFor={`durasi-${ujianId}`}>Waktu ujian (menit)</Label>
          <Input
            id={`durasi-${ujianId}`}
            type="number"
            min={1}
            max={600}
            value={nilaiDurasi}
            onChange={(e) => setNilaiDurasi(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={simpan} disabled={busy}>
          Simpan pengaturan
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Token dibagikan ke <strong>pengawas ruang</strong>; siswa memasukkannya
          saat menekan Mulai Ujian (validasi lokal, bisa offline).
        </p>
      </div>
    </div>
  );
}
