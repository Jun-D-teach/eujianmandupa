import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const PILIHAN = ["A", "B", "C", "D"] as const;

type Kunci = "A" | "B" | "C" | "D";

/** Kelola ujian: buat, aktifkan, susun soal, hapus. (guru & admin) */
export function KelolaUjian() {
  const ujian = useQuery(api.ujian.listSemua);
  const buatUjian = useMutation(api.ujian.buat);
  const setAktif = useMutation(api.ujian.setAktif);
  const hapusUjian = useMutation(api.ujian.hapus);

  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [busy, setBusy] = useState(false);
  const [hapusTarget, setHapusTarget] = useState<{ id: string; judul: string } | null>(
    null,
  );

  const buat = async () => {
    if (!judul.trim()) {
      toast.error("Judul ujian wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await buatUjian({
        judul: judul.trim(),
        deskripsi: deskripsi.trim() || undefined,
      });
      setJudul("");
      setDeskripsi("");
      toast.success("Ujian dibuat. Susun soalnya lalu aktifkan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat ujian.");
    } finally {
      setBusy(false);
    }
  };

  const ubahAktif = async (id: string, aktif: boolean, judul: string) => {
    try {
      await setAktif({ ujianId: id as never, aktif });
      toast.success(
        aktif
          ? `"${judul}" aktif — siswa bisa mengunduh soal.`
          : `"${judul}" dinonaktifkan.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status.");
    }
  };

  const konfirmasiHapus = async () => {
    if (!hapusTarget) return;
    try {
      await hapusUjian({ ujianId: hapusTarget.id as never });
      toast.success("Ujian beserta soal & hasilnya dihapus.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setHapusTarget(null);
    }
  };

  if (ujian === undefined) {
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
          Buat ujian, susun soal beserta kunci jawaban, lalu aktifkan untuk
          siswa.
        </p>
      </div>

      {/* Form ujian baru */}
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
          <Button onClick={buat} disabled={busy} className="gap-2">
            <Plus className="size-4" /> Buat ujian
          </Button>
        </CardContent>
      </Card>

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
              key={u._id}
              value={u._id}
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
                      {u.jumlah_soal} soal · {u.jumlah_hasil} siswa mengirim
                      jawaban
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
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={u.aktif ? "outline" : "default"}
                      size="sm"
                      className="gap-2"
                      onClick={() => ubahAktif(u._id, !u.aktif, u.judul)}
                    >
                      <Power className="size-4" />
                      {u.aktif ? "Nonaktifkan" : "Aktifkan ujian"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-red-600 hover:text-red-700"
                      onClick={() => setHapusTarget({ id: u._id, judul: u.judul })}
                    >
                      <Trash2 className="size-4" /> Hapus ujian
                    </Button>
                  </div>

                  <PanelSoal ujianId={u._id} />
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
              dihapus permanen.
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

/** Daftar soal + form tambah soal untuk satu ujian. */
function PanelSoal({ ujianId }: { ujianId: string }) {
  const soal = useQuery(api.soal.daftar, { ujianId: ujianId as never });
  const tambah = useMutation(api.soal.tambah);
  const tambahContoh = useMutation(api.soal.tambahContoh);
  const hapusSoal = useMutation(api.soal.hapus);

  const [form, setForm] = useState({
    pertanyaan: "",
    opsi_a: "",
    opsi_b: "",
    opsi_c: "",
    opsi_d: "",
  });
  const [kunci, setKunci] = useState<Kunci>("A");
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const simpan = async () => {
    if (!form.pertanyaan.trim()) {
      toast.error("Pertanyaan wajib diisi.");
      return;
    }
    if (PILIHAN.some((p) => !form[`opsi_${p}` as keyof typeof form].trim())) {
      toast.error("Semua opsi A–D wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await tambah({
        ujianId: ujianId as never,
        pertanyaan: form.pertanyaan.trim(),
        opsi_a: form.opsi_a.trim(),
        opsi_b: form.opsi_b.trim(),
        opsi_c: form.opsi_c.trim(),
        opsi_d: form.opsi_d.trim(),
        kunci_jawaban: kunci,
      });
      setForm({ pertanyaan: "", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "" });
      setKunci("A");
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
      const n = await tambahContoh({ ujianId: ujianId as never });
      toast.success(`${n} soal contoh ditambahkan.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengisi contoh.");
    } finally {
      setBusy(false);
    }
  };

  const buang = async (id: string) => {
    try {
      await hapusSoal({ soalId: id as never });
      toast.success("Soal dihapus.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus soal.");
    }
  };

  if (soal === undefined) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-5">
      {/* Daftar soal */}
      {soal.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
          <p className="text-sm font-semibold">Belum ada soal</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Tambahkan soal satu per satu, atau isi 5 soal contoh untuk
            percobaan.
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
              key={s._id}
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
                  </ul>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <KeyRound className="size-3.5" /> Kunci: {s.kunci_jawaban}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-red-600"
                  onClick={() => buang(s._id)}
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
                placeholder={`Opsi ${p}`}
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
