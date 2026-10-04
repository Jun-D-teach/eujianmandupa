import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  EyeOff,
  GraduationCap,
  Lock,
  Power,
  ShieldAlert,
  Siren,
  Smartphone,
  Upload,
  Users,
  WifiOff,
} from "lucide-react";
import logo from "@/assets/logo.svg";

const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: easeOut }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-white">
        <ShieldAlert className="size-4" />
      </span>
      <span className="text-[15px] font-bold tracking-tight">UjianAman</span>
    </span>
  );
}

const LANGKAH = [
  {
    judul: "Unduh semua mapel (online)",
    teks: "Setelah admin menekan Bagikan, mapel ujian muncul di beranda siswa dengan lampu kuning (siap diunduh). Sekali klik, soal tersimpan di HP dan lampu berubah hijau.",
    ikon: Download,
  },
  {
    judul: "Matikan internet + token",
    teks: "Instruksi tegas muncul: nonaktifkan WiFi & data seluler, lalu masukkan token pengawas ruang sebelum menekan Mulai Ujian.",
    ikon: WifiOff,
  },
  {
    judul: "Kerjakan offline",
    teks: "Berjalan dengan hitung mundur sesuai durasi yang diset admin. Sirene menyala bila terdeteksi online atau pindah aplikasi.",
    ikon: Power,
  },
  {
    judul: "Nyalakan & kirim",
    teks: "Setelah selesai, siswa menyalakan internet kembali untuk mengirim jawaban.",
    ikon: Upload,
  },
];

const FITUR = [
  {
    judul: "Wajib offline saat ujian",
    teks: "Online watcher memantau navigator.onLine sepanjang ujian. Koneksi yang menyala langsung dihitung pelanggaran.",
    ikon: WifiOff,
  },
  {
    judul: "Sirene Web Audio",
    teks: "Peringatan berupa suara sirine yang dibangkitkan langsung di browser — tanpa file audio eksternal.",
    ikon: Siren,
  },
  {
    judul: "Kunci 3 strike",
    teks: "Tiga pelanggaran membuat layar terkunci total dengan overlay merah, hanya bisa dibuka PIN pengawas.",
    ikon: Lock,
  },
  {
    judul: "Deteksi pindah aplikasi",
    teks: "visibilitychange mendeteksi siswa yang meminimize atau berpindah tab saat ujian berlangsung.",
    ikon: Smartphone,
  },
  {
    judul: "Kunci jawaban tersembunyi",
    teks: "Daftar soal untuk siswa tidak pernah menyertakan kunci. Nilai dihitung di sisi server saat pengiriman.",
    ikon: EyeOff,
  },
  {
    judul: "PWA, siap dipasang",
    teks: "Bisa ditambahkan ke layar utama HP, dibuka penuh layar, dan tetap punya shell saat offline.",
    ikon: ClipboardList,
  },
];

const PERAN = [
  {
    judul: "Admin",
    teks: "Mengatur ujian dan akun.",
    ikon: Users,
    poin: [
      "Menaikkan peran guru & siswa",
      "Mengaktifkan atau menutup ujian",
      "Memantau seluruh hasil ujian",
    ],
  },
  {
    judul: "Guru",
    teks: "Menyusun bank soal.",
    ikon: GraduationCap,
    poin: [
      "Membuat ujian & menambah soal",
      "Menentukan kunci jawaban A–D",
      "Melihat nilai dan total pelanggaran",
    ],
  },
  {
    judul: "Siswa",
    teks: "Mengerjakan ujian di HP.",
    ikon: Smartphone,
    poin: [
      "Login lalu melihat ujian aktif",
      "Mengunduh soal, mematikan internet",
      "Mengirim jawaban saat online kembali",
    ],
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 72);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header
        className={`sticky top-0 z-50 transition-colors duration-300 ${
          scrolled
            ? "border-b border-border/70 bg-background/85 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className={`transition-colors ${scrolled ? "text-foreground" : "text-white"}`}
          >
            <Logo />
          </button>
          <nav
            className={`hidden items-center gap-7 text-sm font-medium md:flex ${
              scrolled ? "text-muted-foreground" : "text-white/70"
            }`}
          >
            <a href="#cara-kerja" className="transition-colors hover:text-emerald-400">
              Cara kerja
            </a>
            <a href="#fitur" className="transition-colors hover:text-emerald-400">
              Fitur keamanan
            </a>
            <a href="#peran" className="transition-colors hover:text-emerald-400">
              Untuk siapa
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                scrolled
                  ? "text-foreground hover:bg-muted"
                  : "text-white/85 hover:bg-white/10"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-emerald-300"
            >
              Coba sekarang
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#14171c] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 78% 18%, rgba(61,220,151,0.22), transparent 42%), radial-gradient(circle at 8% 78%, rgba(61,220,151,0.10), transparent 45%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 pb-24 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-28 lg:pt-20">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: easeOut }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-emerald-300"
            >
              <span className="size-1.5 rounded-full bg-emerald-400" />
              PWA · Offline-first · Dirancang untuk HP siswa
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06, ease: easeOut }}
              className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]"
            >
              Unduh soal. Matikan internet.{" "}
              <span className="text-emerald-400">Kerjakan dengan tenang.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14, ease: easeOut }}
              className="mt-5 max-w-xl text-base leading-7 text-white/65 sm:text-lg"
            >
              Ujian online dengan aturan <strong className="font-semibold text-white">wajib offline</strong>{" "}
              saat pengerjaan. Jawaban hanya bisa dikirim setelah siswa menyalakan
              kembali internetnya — dan setiap pelanggaran dibunyikan, dihitung,
              lalu mengunci layar pada strike ketiga.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22, ease: easeOut }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="group inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-emerald-300"
              >
                Masuk & mulai ujian
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#cara-kerja"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white/85 transition-colors hover:border-white/40 hover:bg-white/5"
              >
                Lihat cara kerja
              </a>
            </motion.div>

            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.34 }}
              className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-white/50"
            >
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" /> Sirene
                otomatis saat online
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" /> Token &
                durasi diset admin
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" /> 3 strike →
                terkunci
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-400" /> Kunci
                jawaban disembunyikan
              </li>
            </motion.ul>
          </div>

          {/* Mockup HP */}
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: easeOut }}
            className="relative mx-auto w-full max-w-[330px]"
          >
            <div className="rounded-[2.6rem] border border-white/12 bg-[#0b0d10] p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
              <div className="overflow-hidden rounded-[2.1rem] bg-white text-ink">
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Offline · Aman
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    Strike
                    <span className="ml-1 flex gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <span className="size-1.5 rounded-full border border-black/20" />
                    </span>
                  </span>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>Soal 3 dari 10</span>
                    <span>Terjawab 2/10</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-[20%] rounded-full bg-ink" />
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
                    <p className="text-[13px] font-semibold leading-5">
                      Berapa hasil dari 12 × 4?
                    </p>
                    <div className="mt-3 space-y-2">
                      {[
                        ["A", "44"],
                        ["B", "48"],
                        ["C", "54"],
                        ["D", "56"],
                      ].map(([huruf, teks]) => (
                        <div
                          key={huruf}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12px] ${
                            huruf === "B"
                              ? "border-emerald-500 bg-emerald-50 font-semibold"
                              : "border-border/70 text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`flex size-5 items-center justify-center rounded-md text-[10px] font-bold ${
                              huruf === "B"
                                ? "bg-emerald-500 text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {huruf}
                          </span>
                          {teks}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 rounded-xl border border-border/70 py-2 text-center text-[11px] font-semibold text-muted-foreground">
                      Sebelumnya
                    </div>
                    <div className="flex-1 rounded-xl bg-ink py-2 text-center text-[11px] font-semibold text-white">
                      Berikutnya
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notifikasi pelanggaran melayang */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.7, ease: easeOut }}
              className="absolute -left-3 top-10 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-[#1d1013] px-3.5 py-2.5 shadow-xl sm:-left-8"
            >
              <Siren className="size-4 text-red-400" />
              <span className="text-[11px] font-bold text-red-300">
                Online terdeteksi
                <span className="block font-medium text-red-400/70">
                  +1 strike · sirene menyala
                </span>
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.85, ease: easeOut }}
              className="absolute -right-2 bottom-12 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-[#0f1a15] px-3.5 py-2.5 shadow-xl sm:-right-6"
            >
              <Download className="size-4 text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-300">
                10 soal tersimpan
                <span className="block font-medium text-emerald-400/70">
                  siap dikerjakan offline
                </span>
              </span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Angka */}
      <section className="border-b border-border/70 bg-background">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px overflow-hidden px-5 py-0 lg:grid-cols-4">
          {[
            ["3×", "strike sebelum layar terkunci"],
            ["0", "file audio — sirene dari browser"],
            ["A–D", "kunci jawaban tak pernah ke HP siswa"],
            ["100%", "soal dibaca dari penyimpanan HP"],
          ].map(([angka, teks], i) => (
            <Reveal
              key={teks}
              delay={i * 0.06}
              className="border-border/60 px-2 py-8 text-center lg:border-r lg:last:border-r-0"
            >
              <p className="text-3xl font-extrabold tracking-tight text-foreground">
                {angka}
              </p>
              <p className="mx-auto mt-1.5 max-w-[190px] text-xs leading-5 text-muted-foreground">
                {teks}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara-kerja" className="scroll-mt-24 px-5 py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              Alur pengerjaan
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Empat langkah, satu aturan: ujian berjalan tanpa internet.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Alur dibuat sederhana untuk HP siswa — dari unduh soal sampai
              kirim jawaban, setiap fase punya perannya sendiri.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LANGKAH.map((l, i) => (
              <Reveal key={l.judul} delay={i * 0.08}>
                <div className="relative h-full rounded-3xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_rgba(16,20,24,0.04)] transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(16,20,24,0.35)]">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">
                      <l.ikon className="size-5" />
                    </span>
                    <span className="text-xs font-bold text-muted-foreground/70">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-bold tracking-tight">
                    {l.judul}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {l.teks}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Fitur keamanan */}
      <section id="fitur" className="scroll-mt-24 bg-[#14171c] px-5 py-20 text-white sm:py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
              Sistem keamanan
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Pelanggaran terdengar, terhitung, lalu terkunci.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/60">
              Tiga lapis pengawasan berjalan otomatis di perangkat siswa tanpa
              perlu aplikasi tambahan.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FITUR.map((f, i) => (
              <Reveal key={f.judul} delay={(i % 3) * 0.07}>
                <div className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-emerald-400/40">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400">
                    <f.ikon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-base font-bold tracking-tight">
                    {f.judul}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">{f.teks}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Peran */}
      <section id="peran" className="scroll-mt-24 px-5 py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              Untuk siapa
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Satu aplikasi, tiga peran.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PERAN.map((p, i) => (
              <Reveal key={p.judul} delay={i * 0.08}>
                <div className="flex h-full flex-col rounded-3xl border border-border/70 bg-card p-7 shadow-[0_1px_2px_rgba(16,20,24,0.04)]">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                    <p.ikon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold tracking-tight">
                    {p.judul}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.teks}</p>
                  <ul className="mt-5 space-y-2.5">
                    {p.poin.map((x) => (
                      <li
                        key={x}
                        className="flex items-start gap-2 text-sm leading-6 text-foreground/80"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <Reveal className="mx-auto w-full max-w-6xl">
          <div className="relative overflow-hidden rounded-[2rem] bg-ink px-7 py-14 text-center text-white sm:px-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 0%, rgba(61,220,151,0.25), transparent 55%)",
              }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                Siap menjalankan ujian offline di HP siswa?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
                Masuk untuk mengatur ujian sebagai admin atau guru, atau mulai
                mengunduh soal sebagai siswa.
              </p>
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-400 px-7 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-emerald-300"
              >
                Buka aplikasi
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70 px-5 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="flex items-center gap-2.5">
            <img src={logo} alt="UjianAman" className="size-7 rounded-md" />
            <span className="text-sm font-bold tracking-tight">UjianAman</span>
          </span>
          <p className="text-xs text-muted-foreground">
            PWA ujian online wajib offline · Backend PHP + MySQL di hosting
            sekolah
          </p>
        </div>
      </footer>
    </div>
  );
}
