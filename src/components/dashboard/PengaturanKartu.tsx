import { useEffect, useRef, useState } from "react";
import { gasCall } from "@/lib/api";
import { SET_KOSONG, gambarKeDataUrl, type SetKartu } from "@/lib/kartu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUp, Save, Signature, X } from "lucide-react";
import { toast } from "sonner";

const JUDUL_FIELD: Record<"logo" | "ttd", string> = {
  logo: "Logo madrasah",
  ttd: "Tanda tangan kepala madrasah",
};

/** Pengaturan kop, logo & TTD kepala madrasah untuk kartu ujian — admin. */
export function PengaturanKartu() {
  const [set, setSet] = useState<SetKartu | null>(null);
  const [busy, setBusy] = useState(false);
  const [prosesGambar, setProsesGambar] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const ttdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hidup = true;
    gasCall<SetKartu>("getKartuSet")
      .then((res) => {
        if (!hidup) return;
        setSet({
          sekolah: res.sekolah ?? SET_KOSONG.sekolah,
          alamat: res.alamat ?? "",
          kota: res.kota ?? SET_KOSONG.kota,
          kepala: res.kepala ?? "",
          nip: res.nip ?? "",
          logo: res.logo ?? "",
          ttd: res.ttd ?? "",
        });
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Gagal memuat setelan kartu.",
        );
        if (hidup) setSet({ ...SET_KOSONG });
      });
    return () => {
      hidup = false;
    };
  }, []);

  const ubah = (kunci: keyof SetKartu) => (nilai: string) =>
    setSet((s) => (s ? { ...s, [kunci]: nilai } : s));

  const pilihGambar = (kunci: "logo" | "ttd") => async (file: File | null) => {
    if (!file) return;
    setProsesGambar(true);
    try {
      const dataUrl = await gambarKeDataUrl(
        file,
        kunci === "logo" ? 360 : 480,
      );
      setSet((s) => (s ? { ...s, [kunci]: dataUrl } : s));
      toast.success(`${JUDUL_FIELD[kunci]} siap — jangan lupa disimpan.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal membaca gambar.",
      );
    } finally {
      setProsesGambar(false);
    }
  };

  const hapusGambar = (kunci: "logo" | "ttd") => {
    setSet((s) => (s ? { ...s, [kunci]: "" } : s));
    if (kunci === "logo" && logoRef.current) logoRef.current.value = "";
    if (kunci === "ttd" && ttdRef.current) ttdRef.current.value = "";
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!set) return;
    if (!set.sekolah.trim()) {
      toast.error("Nama madrasah (kop) wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const res = await gasCall<{ message?: string }>("aturKartuSet", {
        ...set,
        sekolah: set.sekolah.trim(),
        alamat: set.alamat.trim(),
        kota: set.kota.trim(),
        kepala: set.kepala.trim(),
        nip: set.nip.trim(),
      });
      toast.success(res.message || "Pengaturan kartu ujian disimpan.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan setelan kartu.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (set === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const uploader = (kunci: "logo" | "ttd") => {
    const nilai = set[kunci];
    const inputId = `kartu-${kunci}`;
    return (
      <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={inputId} className="gap-1.5 cursor-pointer">
            {kunci === "logo" ? (
              <ImageUp className="size-3.5" />
            ) : (
              <Signature className="size-3.5" />
            )}
            {JUDUL_FIELD[kunci]}
          </Label>
          {nilai && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-red-600 hover:text-red-700"
              onClick={() => hapusGambar(kunci)}
            >
              <X className="size-3.5" /> Hapus gambar
            </Button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-4">
          <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-card">
            {nilai ? (
              <img
                src={nilai}
                alt={JUDUL_FIELD[kunci]}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="px-2 text-center text-[10px] leading-tight text-muted-foreground">
                Belum ada gambar
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <Input
              id={inputId}
              ref={kunci === "logo" ? logoRef : ttdRef}
              type="file"
              accept="image/*"
              disabled={prosesGambar}
              onChange={(e) => void pilihGambar(kunci)(e.target.files?.[0] ?? null)}
              className="cursor-pointer"
            />
            <p className="text-[11px] leading-4 text-muted-foreground">
              {kunci === "logo"
                ? "Ditempatkan di kiri kop kartu. JPG/PNG, otomatis dikompres."
                : "Dicetak di atas nama Kepala Madrasah. JPG/PNG, otomatis dikompres."}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">
          Kop, logo &amp; tanda tangan kartu ujian
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dicetak pada kartu ujian berukuran KTP (85,6 × 54 mm) — buka menu{" "}
          <strong>Kelola Ujian</strong> lalu tombol <strong>Cetak kartu</strong>.
        </p>
      </div>

      <Card className="border-border/70">
        <form onSubmit={simpan} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="kop-sekolah">Nama madrasah (kop) *</Label>
              <Input
                id="kop-sekolah"
                value={set.sekolah}
                onChange={(e) => ubah("sekolah")(e.target.value)}
                placeholder="cth. MAN 2 PALEMBANG"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kop-alamat">Alamat / kontak kop</Label>
              <Input
                id="kop-alamat"
                value={set.alamat}
                onChange={(e) => ubah("alamat")(e.target.value)}
                placeholder="cth. Jl. K.H. Ahmad Dahlan No. 1 Palembang"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kop-kota">Kota tanda tangan</Label>
              <Input
                id="kop-kota"
                value={set.kota}
                onChange={(e) => ubah("kota")(e.target.value)}
                placeholder="cth. Palembang"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kop-kepala">Nama kepala madrasah</Label>
              <Input
                id="kop-kepala"
                value={set.kepala}
                onChange={(e) => ubah("kepala")(e.target.value)}
                placeholder="cth. Drs. H. Ahmad Fauzi, M.Pd."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kop-nip">NIP kepala madrasah</Label>
              <Input
                id="kop-nip"
                value={set.nip}
                onChange={(e) => ubah("nip")(e.target.value)}
                placeholder="cth. 197101011996031002"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {uploader("logo")}
            {uploader("ttd")}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="gap-2" disabled={busy || prosesGambar}>
              <Save className="size-4" />
              {busy ? "Menyimpan…" : "Simpan pengaturan kartu"}
            </Button>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Tersimpan di database (tabel pengaturan) dan berlaku untuk semua
              cetakan kartu.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
