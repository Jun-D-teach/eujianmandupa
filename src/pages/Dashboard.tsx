import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  History,
  LogOut,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  SiswaUjian,
  SiswaRiwayat,
} from "@/components/dashboard/SiswaBeranda";
import { KelolaUjian } from "@/components/dashboard/KelolaUjian";
import { HasilUjian } from "@/components/dashboard/HasilUjian";
import { Pengguna } from "@/components/dashboard/Pengguna";

type TabId = "ujian" | "riwayat" | "kelola" | "hasil" | "pengguna";

const LABEL_PERAN: Record<string, string> = {
  admin: "Admin",
  guru: "Guru",
  siswa: "Siswa",
};

const TABS: Record<TabId, { label: string; ikon: typeof Users }> = {
  ujian: { label: "Ujian Saya", ikon: ClipboardList },
  riwayat: { label: "Riwayat Nilai", ikon: History },
  kelola: { label: "Kelola Ujian", ikon: ClipboardList },
  hasil: { label: "Hasil Ujian", ikon: ShieldCheck },
  pengguna: { label: "Pengguna", ikon: UserCog },
};

function tabsUntuk(role: string | undefined): TabId[] {
  if (role === "admin") return ["kelola", "hasil", "pengguna"];
  if (role === "guru") return ["kelola", "hasil"];
  return ["ujian", "riwayat"];
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const siapkan = useMutation(api.profil.siapkan);
  const [tab, setTab] = useState<TabId>("ujian");
  const [bootstrap, setBootstrap] = useState(false);
  const diminta = useRef(false);

  const role = user?.role;
  const tabs = tabsUntuk(role);

  // Bootstrap peran: akun pertama menjadi admin + ujian contoh.
  useEffect(() => {
    if (!user || diminta.current) return;
    diminta.current = true;
    void siapkan({})
      .then(() => setBootstrap(true))
      .catch((err) => {
        console.warn("[bootstrap] gagal:", err);
        setBootstrap(true);
      });
  }, [user, siapkan]);

  // Pindahkan tab aktif ke tab pertama yang valid saat peran berubah.
  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error(err);
      toast.error("Gagal keluar. Coba lagi.");
    }
  };

  if (!user || (user.role === undefined && !bootstrap)) {
    return (
      <main className="min-h-screen bg-background p-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-white">
              <ShieldCheck className="size-4" />
            </span>
            <span className="hidden text-[15px] font-bold tracking-tight sm:block">
              UjianAman
            </span>
          </button>

          <nav className="scrollbar-none flex flex-1 items-center gap-1 overflow-x-auto md:justify-center">
            {tabs.map((id) => {
              const item = TABS[id];
              const aktif = tab === id;
              const Ikon = item.ikon;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    aktif
                      ? "bg-ink text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Ikon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[180px] truncate text-sm font-semibold leading-4">
                {user.name || user.email || "Pengguna"}
              </p>
              <p className="text-xs text-muted-foreground">
                {LABEL_PERAN[user.role ?? "siswa"]}
                {user.kelas ? ` · ${user.kelas}` : ""}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="hidden uppercase tracking-wider sm:inline-flex"
            >
              {LABEL_PERAN[user.role ?? "siswa"]}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Keluar
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        {tab === "ujian" && <SiswaUjian />}
        {tab === "riwayat" && <SiswaRiwayat />}
        {tab === "kelola" && <KelolaUjian />}
        {tab === "hasil" && <HasilUjian />}
        {tab === "pengguna" && <Pengguna />}
      </div>
    </main>
  );
}
