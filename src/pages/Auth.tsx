import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  gasCall,
  simpanSesiToken,
  simpanUser,
  type UserGas,
} from "@/lib/api";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Lock, Server, ShieldCheck } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authBusy, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isi, setIsi] = useState<unknown>(undefined); // undefined = cek server
  const [galatCek, setGalatCek] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  // Cek status server sekali saat halaman dibuka (timeout panjang + 1x retry).
  useEffect(() => {
    let hidup = true;
    const cek = async () => {
      let galat: string | null = null;
      for (let percobaan = 0; percobaan < 2; percobaan++) {
        try {
          const res = await gasCall<{ siap: boolean }>("ping", {}, 45000);
          if (hidup) {
            setIsi(res.siap);
            setGalatCek(null);
          }
          return;
        } catch (err) {
          galat = err instanceof Error ? err.message : "Gagal menghubungi server.";
        }
      }
      if (hidup) {
        setIsi(null);
        setGalatCek(galat);
      }
    };
    void cek();
    return () => {
      hidup = false;
    };
  }, []);

  /** Cek ulang server (tombol "Coba lagi"). */
  const ulangiCek = async () => {
    setIsi(undefined);
    setGalatCek(null);
    try {
      const res = await gasCall<{ siap: boolean }>("ping", {}, 45000);
      setIsi(res.siap);
    } catch (err) {
      setIsi(null);
      setGalatCek(err instanceof Error ? err.message : "Gagal menghubungi server.");
    }
  };

  useEffect(() => {
    if (!authBusy && isAuthenticated) navigate(redirect);
  }, [authBusy, isAuthenticated, navigate, redirect]);

  const masuk = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setPesan(null);
    try {
      await signIn(username.trim(), password);
      navigate(redirect);
    } catch (err) {
      setPesan(err instanceof Error ? err.message : "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  };

  const buatAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setPesan(null);
    try {
      const res = await gasCall<{ user: UserGas; sesi?: string }>("setupAdmin", {
        username: username.trim(),
        password,
      });
      simpanSesiToken(res.sesi ?? "");
      simpanUser(res.user);
      toast.success("Admin pertama dibuat. Selamat datang!");
      navigate(redirect);
    } catch (err) {
      setPesan(err instanceof Error ? err.message : "Gagal membuat admin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center p-5">
        <Card className="w-full max-w-md border shadow-md">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <img
                src={logo}
                alt="UjianAman"
                width={56}
                height={56}
                className="mb-3 mt-3 cursor-pointer rounded-lg"
                onClick={() => navigate("/")}
              />
            </div>
            <CardTitle className="text-xl">Masuk UjianAman</CardTitle>
            <CardDescription>
              Backend MySQL · akun dikelola admin
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pb-6">
            <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <Server className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {isi === undefined
                  ? "Memeriksa server…"
                  : isi === null
                    ? "Server belum terhubung — pastikan folder api ter-upload & api/config.php sudah diisi."
                    : isi
                      ? "✓ Terhubung — akun sudah tersedia di database."
                      : "✓ Terhubung — database masih kosong: buat akun admin pertama di bawah."}
              </span>
              {isi === null && (
                <button
                  type="button"
                  onClick={() => void ulangiCek()}
                  className="ml-auto shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-semibold text-foreground transition hover:bg-muted"
                >
                  Coba lagi
                </button>
              )}
            </div>
            {isi === null && galatCek && (
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-700">
                {galatCek}
              </p>
            )}

            {pesan && (
              <p className="rounded-xl bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-600">
                {pesan}
              </p>
            )}

            {isi === false ? (
              /* SETUP ADMIN PERTAMA */
              <form onSubmit={buatAdmin} className="space-y-3">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-emerald-800">
                  <ShieldCheck className="mb-1 size-4" />
                  Sheet Pengguna masih kosong. Akun pertama yang dibuat akan
                  menjadi <strong>admin</strong> beserta ujian contoh.
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="su-username">Username admin</Label>
                  <Input
                    id="su-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="cth. admin"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="su-password">Password</Label>
                  <Input
                    id="su-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="minimal 4 karakter"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 size-4" />
                  )}
                  Buat admin & mulai
                </Button>
              </form>
            ) : (
              /* LOGIN */
              <form onSubmit={masuk} className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username dari admin"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 size-4" />
                  )}
                  Masuk
                  <ArrowRight className="ml-2 size-4" />
                </Button>
                <p className="text-center text-xs leading-5 text-muted-foreground">
                  Akun dibagikan admin — siswa, guru, dan pengawas memakai
                  username/password yang diberikan.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
