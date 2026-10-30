import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  GraduationCap,
  History,
  LogOut,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  SiswaUjian,
  SiswaRiwayat,
} from "@/components/dashboard/SiswaBeranda";
import { KelolaUjian } from "@/components/dashboard/KelolaUjian";
import { HasilUjian } from "@/components/dashboard/HasilUjian";
import { Pengguna } from "@/components/dashboard/Pengguna";
import { DataSiswa } from "@/components/dashboard/DataSiswa";
import { DataGuru } from "@/components/dashboard/DataGuru";
import { PengaturanPin } from "@/components/dashboard/PengaturanPin";
import { PengaturanRuang } from "@/components/dashboard/PengaturanRuang";
import { PengaturanJadwal } from "@/components/dashboard/PengaturanJadwal";
import { PengaturanKartu } from "@/components/dashboard/PengaturanKartu";

type TabId =
  | "ujian"
  | "riwayat"
  | "kelola"
  | "hasil"
  | "siswa"
  | "guru"
  | "pengguna"
  | "atur";

const LABEL_PERAN: Record<string, string> = {
  admin: "Admin",
  guru: "Guru",
  siswa: "Siswa",
};

const TABS: Record<TabId, { label: string; ikon: typeof Users }> = {
  ujian: { label: "Ujian Saya", ikon: ClipboardList },
  riwayat: { label: "Riwayat Ujian", ikon: History },
  kelola: { label: "Kelola Ujian", ikon: ClipboardList },
  hasil: { label: "Hasil Ujian", ikon: ShieldCheck },
  siswa: { label: "Data Siswa", ikon: Users },
  guru: { label: "Data Guru", ikon: GraduationCap },
  pengguna: { label: "Pengguna", ikon: UserCog },
  atur: { label: "Pengaturan", ikon: Settings },
};

function tabsUntuk(role: string | undefined): TabId[] {
  if (role === "admin") return ["kelola", "hasil", "siswa", "guru", "pengguna", "atur"];
  if (role === "guru") return ["kelola", "hasil"];
  return ["ujian", "riwayat"];
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("ujian");
  /** Memicu dialog cetak kartu di Kelola Ujian (dari menu Ruang ujian). */
  const [bukaCetakKartu, setBukaCetakKartu] = useState(0);

  const role = user?.role;
  const tabs = tabsUntuk(role);
  // Tab aktif selalu salah satu yang valid untuk peran ini.
  const tabAktif: TabId = tabs.includes(tab) ? tab : tabs[0];

  const handleSignOut = () => {
    signOut();
    navigate("/");
  };

  if (!user) {
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
      {/* Header - Modern Design */}
<header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
  <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
    {/* Logo */}
    <button
      type="button"
      onClick={() => navigate("/")}
      className="group flex items-center gap-3 rounded-xl p-1.5 transition-all hover:bg-emerald-500/10"
    >
      <div className="relative">
        <img
          src="./logo-sekolah.png"
          alt="MAN 2 Palembang"
          className="size-9 rounded-lg bg-white object-contain p-0.5 shadow-sm transition-transform group-hover:scale-110"
        />
        <div className="absolute -bottom-1 -right-1 size-3 rounded-full bg-emerald-500 ring-2 ring-background" />
      </div>
      <span className="hidden max-w-[220px] text-[12px] font-extrabold leading-tight tracking-tight text-foreground sm:block">
        MADRASAH ALIYAH NEGERI 2 PALEMBANG
      </span>
    </button>

    {/* Navigation Menu - Enhanced */}
    {/* Navigation Menu - Responsive: ikon saja di HP, ikon+teks di desktop */}
<nav className="flex flex-1 items-center justify-center gap-1 md:gap-1.5">
  {tabs.map((id) => {
    const item = TABS[id];
    const aktif = tabAktif === id;
    const Ikon = item.ikon;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        title={item.label}
        className={`
          group relative inline-flex shrink-0 items-center justify-center gap-1.5
          rounded-xl px-2 py-2 text-xs font-bold transition-all duration-300 ease-out
          md:px-4 md:py-2.5 md:text-sm
          ${aktif
            ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 scale-105"
            : "bg-transparent text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-700"
          }
        `}
      >
        <Ikon className={`size-4 transition-transform ${aktif ? "scale-110" : "group-hover:scale-110"}`} />
        {/* Teks label: disembunyikan di HP, tampil di layar medium ke atas */}
        <span className="hidden md:inline whitespace-nowrap">{item.label}</span>
        {aktif && (
          <span className="absolute -bottom-1 left-1/2 h-0.5 w-6 md:w-8 -translate-x-1/2 rounded-full bg-emerald-400" />
        )}
      </button>
    );
  })}
</nav>

    {/* User Profile */}
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="max-w-[180px] truncate text-sm font-bold leading-4 text-foreground">
          {user.nama || user.username}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          {LABEL_PERAN[user.role]}
          {user.kelas ? ` · ${user.kelas}` : ""}
        </p>
      </div>
      <Badge
        variant="secondary"
        className="hidden uppercase tracking-wider sm:inline-flex bg-emerald-500/10 text-emerald-700 font-bold"
      >
        {LABEL_PERAN[user.role]}
      </Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="group gap-2 border-red-200 bg-red-50 text-red-600 transition-all hover:bg-red-100 hover:text-red-700 hover:border-red-300 hover:shadow-md"
        onClick={handleSignOut}
      >
        <LogOut className="size-4 transition-transform group-hover:-translate-x-0.5" />
        <span className="hidden sm:inline">Keluar</span>
      </Button>
    </div>
  </div>
</header>

      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        {tabAktif === "ujian" && <SiswaUjian />}
        {tabAktif === "riwayat" && <SiswaRiwayat />}
        {tabAktif === "kelola" && (
          <KelolaUjian bukaCetakNonce={bukaCetakKartu} />
        )}
        {tabAktif === "hasil" && <HasilUjian />}
        {tabAktif === "siswa" && <DataSiswa />}
        {tabAktif === "guru" && <DataGuru />}
        {tabAktif === "pengguna" && <Pengguna />}
        {tabAktif === "atur" && (
          <div className="space-y-10">
            <PengaturanPin />
            <PengaturanJadwal />
            <PengaturanRuang
              onBukaKartuUjian={() => {
                setTab("kelola");
                setBukaCetakKartu((n) => n + 1);
              }}
            />
            <PengaturanKartu />
          </div>
        )}
      </div>
    </main>
  );
}
