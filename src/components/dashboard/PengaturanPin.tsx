import { useEffect, useState } from "react";
import {
  gasCall,
  PIN_BAWAAN,
  pinPengawas,
  simpanPinTersimpan,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyRound, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/** Pengaturan PIN pengawas — khusus admin (tabel pengaturan di database MySQL). */
export function PengaturanPin() {
  const [pinSekarang, setPinSekarang] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinUlang, setPinUlang] = useState("");
  const [busy, setBusy] = useState(false);

  const simpanAman = (p: string) => simpanPinTersimpan(p);

  useEffect(() => {
    let hidup = true;
    gasCall<{ pin_pengawas: string }>("getPengaturan")
      .then((res) => {
        if (hidup) {
          setPinSekarang(res.pin_pengawas);
          // Sinkronkan cache lokal perangkat admin juga.
          simpanAman(res.pin_pengawas);
        }
      })
      .catch(() => {
        if (hidup) setPinSekarang(null);
      });
    return () => {
      hidup = false;
    };
  }, []);

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin.trim())) {
      toast.error("PIN harus tepat 6 angka.");
      return;
    }
    if (pin.trim() !== pinUlang.trim()) {
      toast.error("PIN dan konfirmasi PIN tidak sama.");
      return;
    }
    setBusy(true);
    try {
      await gasCall("aturPin", { pin: pin.trim(), pin_ulang: pinUlang.trim() });
      setPinSekarang(pin.trim());
      simpanAman(pin.trim());
      setPin("");
      setPinUlang("");
      toast.success("PIN buka blokir diperbarui. Siswa mendapat PIN baru saat unduh soal berikutnya.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan PIN.");
    } finally {
      setBusy(false);
    }
  };

  if (pinSekarang === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Pengaturan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PIN untuk membuka layar terkunci siswa yang terkena 3 strike.
        </p>
      </div>

      <Card className="border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-ink text-white">
              <KeyRound className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold">PIN buka blokir aktif</p>
              <p className="text-xs text-muted-foreground">
                Diverifikasi lokal di HP siswa — bisa membuka walau offline.
              </p>
            </div>
          </div>
          <p className="rounded-2xl bg-muted px-5 py-3 font-mono text-2xl font-extrabold tracking-[0.4em]">
            {pinSekarang || PIN_BAWAAN}
          </p>
        </div>
      </Card>

      <Card className="border-border/70">
        <form onSubmit={simpan} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pin-baru">PIN baru (6 angka) *</Label>
              <Input
                id="pin-baru"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="cth. 048521"
                inputMode="numeric"
                autoComplete="new-password"
                className="font-mono text-lg tracking-[0.3em]"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pin-ulang">Ulangi PIN baru *</Label>
              <Input
                id="pin-ulang"
                value={pinUlang}
                onChange={(e) => setPinUlang(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="ulangi 6 angka"
                inputMode="numeric"
                autoComplete="new-password"
                className="font-mono text-lg tracking-[0.3em]"
                required
              />
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-800">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Bagikan PIN baru hanya kepada pengawas ruang. Siswa mendapat PIN
              terbaru otomatis saat mengunduh soal — pastikan soal diunduh ulang
              setelah PIN diganti agar perangkat lama ikut terbarui.
            </span>
          </div>

          <Button type="submit" className="gap-2" disabled={busy}>
            <Save className="size-4" />
            {busy ? "Menyimpan…" : "Simpan PIN"}
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground">
            PIN tersimpan di database MySQL (tabel pengaturan). PIN aktif di
            perangkat ini sekarang:{" "}
            <strong className="font-mono tracking-widest">{pinPengawas()}</strong>
          </p>
        </form>
      </Card>
    </div>
  );
}
