/**
 * ============================================================================
 * UjianAman — klien API backend PHP + MySQL + sesi pengguna.
 * ----------------------------------------------------------------------------
 * Semua komunikasi backend lewat SATU endpoint same-origin:
 *   POST  <folder-app>/api/index.php   body JSON { action, sesi, ...data }
 *   GET   <folder-app>/api/index.php?action=ping   (tes cepat)
 *
 * Tidak ada lagi Google Apps Script / JSONP — endpoint berada di hosting yang
 * sama sehingga bebas CORS & tidak diblokir ad-blocker.
 * ============================================================================
 */

export type Role = "admin" | "guru" | "siswa";

export type UserGas = {
  id: string;
  username: string;
  nama: string;
  kelas: string;
  role: Role;
};

export type UjianGas = {
  id: string;
  judul: string;
  deskripsi: string;
  durasi_menit: number;
  aktif: boolean;
  jumlah_soal: number;
  /** "YYYY-MM-DDTHH:mm" — wajib nol di sisi siswa sampai waktu ini. */
  tgl_mulai?: string;
  /** "": semua | "tingkat" | "kelas" */
  sasar_jenis?: string;
  /** tingkat: "X|XI|XII" · kelas: "X.1,X.2" */
  sasar_nilai?: string;
  /** Label ramah baca dari server. */
  sasaran?: string;
  /** Server: apakah kelas siswa lolos sasaran (undefined utk admin). */
  boleh?: boolean;
  /** Izin bagikan dari admin — siswa baru boleh MENGUNDUH saat true. */
  boleh_unduh?: boolean;
  /** Server: apakah siswa ini sudah mengunduh soal mapel ini. */
  sudah_unduh?: boolean;
  /** Nomor revisi isi soal — naik tiap guru menambah/mengubah/menghapus soal.
   *  Bila berbeda dengan salinan di HP, siswa wajib sinkron ulang. */
  revisi?: number;
  /** Konfirmasi guru: soal sudah selesai & siap dibagikan (lampu admin). */
  konfirmasi_guru?: boolean;
  /** Waktu konfirmasi dari server ("YYYY-MM-DD HH:MM:SS") atau "". */
  konfirmasi_pada?: string;
  /** Mata pelajaran ujian (penugasan guru per ujian). */
  mapel?: string;
  /** NIP guru yang ditugaskan menyiapkan soal ujian ini (login guru = NIP). */
  guru_nip?: string;
  /** Nama guru penugasan — hanya pada daftar petugas (ikut token). */
  guru_nama?: string;
  /** Hanya ada pada daftar admin/petugas — TIDAK PERNAH dikirim ke siswa. */
  token?: string;
};

export type SiswaGas = {
  id: string;
  nisn: string;
  nama: string;
  tgllahir: string;
  kelas: string;
};

export type GuruGas = {
  id: string;
  nip: string;
  nama: string;
  mapel: string;
};

/** Tipe soal: pg = pilihan ganda (dinilai otomatis); essay & uraian
 *  dinilai manual guru lewat menu Koreksi. */
export type TipeSoalGas = "pg" | "essay" | "uraian";

export type SoalGas = {
  id: string;
  ujian_id: string;
  pertanyaan: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  opsi_e: string;
  kunci_jawaban?: string;
  /** Gambar soal (data URL JPEG) — opsional, untuk soal bergambar. */
  gambar?: string;
  /** 1 = teks pilihan sudah menyertakan huruf A–E (tampil apa adanya). */
  opsi_huruf?: number;
  /** Default "pg". Essay/uraian: opsi & kunci huruf tidak dipakai. */
  tipe?: TipeSoalGas;
  /** Kunci/rubrik jawaban untuk koreksi manual (hanya non-PG). */
  kunci_teks?: string;
  /** id teks bacaan bersama yang menempel pada soal ini. */
  bacaan_id?: string;
  /** Isi teks bacaan (disertakan server agar tersimpan di HP siswa). */
  bacaan?: string;
};

/** Teks bacaan bersama satu ujian (dipakai beberapa soal). */
export type BacaanGas = {
  id: string;
  ujian_id: string;
  judul: string;
  teks: string;
};

export type HasilGas = {
  id: string;
  ujian_id: string;
  ujian_judul: string;
  nama: string;
  kelas: string;
  token: string;
  benar: number;
  total_soal: number;
  nilai: number;
  /** Total poin (PG benar = 100 + skor koreksi essay/uraian). */
  poin?: number;
  /** Jumlah jawaban essay/uraian yang belum dikoreksi guru. */
  menunggu?: number;
  total_pelanggaran: number;
  timestamp: string;
};

export type PenggunaGas = {
  id: string;
  username: string;
  /** Hanya untuk admin (menu Pengguna) — dipakai unduh CSV akun. */
  password?: string;
  nama: string;
  kelas: string;
  role: Role;
};

/* Data ruang ujian, jadwal pengawas & penempatan tempat duduk (admin). */

export type KomposisiRuang = Record<string, number>;

export type RuangGas = {
  id: string;
  nama: string;
  kapasitas: number;
  /** {"X": 10, "XI": 10} — kosong = diisi otomatis menggilir data siswa. */
  komposisi: KomposisiRuang;
  urutan: number;
};

export type JadwalPengawasGas = {
  id: string;
  hari_ke: number;
  /** "YYYY-MM-DD" */
  tanggal: string;
  sesi: number;
  /** "07.30" */
  jam: string;
  ruang_id: string;
  ruang_nama: string;
  nip: string;
  nama: string;
};

export type PenempatanGas = {
  ruang_id: string;
  ruang_nama: string;
  nisn: string;
  nama: string;
  kelas: string;
  kursi: number;
};

export type RuangSetGas = {
  ruang: RuangGas[];
  pengawas: string[];
  jadwal: JadwalPengawasGas[];
  penempatan: PenempatanGas[];
};

const KUNCI_USER = "ujianaman:user";
const KUNCI_SESI = "ujianaman:sesi";

/* ------------------------------------------------------------------ */
/* URL endpoint (same-origin — ikut folder hosting aplikasi)           */
/* ------------------------------------------------------------------ */

/**
 * Folder tempat aplikasi di-host, tanpa segment rute (auth/dashboard/ujian).
 * Contoh: /eujian-mandupa/ujian/u_123 → /eujian-mandupa
 */
function pathFolderApp(): string {
  let path = window.location.pathname.replace(/\/index\.html$/i, "");
  path = path.replace(/\/(auth|dashboard|ujian)(\/[^/]*)?$/, "");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path === "/" ? "" : path;
}

/** URL endpoint backend PHP (api/index.php). */
export function urlServer(): string {
  return `${pathFolderApp()}/api/index.php`;
}

/* ------------------------------------------------------------------ */
/* Sesi pengguna (auth dikelola admin di tabel pengguna)               */
/* ------------------------------------------------------------------ */

export function muatUser(): UserGas | null {
  try {
    const raw = window.localStorage.getItem(KUNCI_USER);
    if (!raw) return null;
    const user = JSON.parse(raw) as UserGas;
    if (!user || !user.username) return null;
    return user;
  } catch {
    return null;
  }
}

export function simpanUser(user: UserGas): void {
  try {
    window.localStorage.setItem(KUNCI_USER, JSON.stringify(user));
  } catch {
    /* noop */
  }
}

export function hapusUser(): void {
  try {
    window.localStorage.removeItem(KUNCI_USER);
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* Token sesi server (diterima saat login, dikirim ulang di tiap call) */
/* ------------------------------------------------------------------ */

export function muatSesiToken(): string {
  try {
    return (window.localStorage.getItem(KUNCI_SESI) ?? "").trim();
  } catch {
    return "";
  }
}

export function simpanSesiToken(token: string): void {
  try {
    if (token) window.localStorage.setItem(KUNCI_SESI, token);
  } catch {
    /* noop */
  }
}

export function hapusSesiToken(): void {
  try {
    window.localStorage.removeItem(KUNCI_SESI);
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* Transport: POST JSON same-origin                                    */
/* ------------------------------------------------------------------ */

/** Event: server menolak karena sesi habis/tidak sah → logout paksa. */
export const EVENT_PERLU_LOGIN = "ujianaman:perlu-login";

/** Bersihkan kredensial lokal + beri tahu provider auth, lalu gagalkan call. */
function tanganiPerluLogin(pesan: string): never {
  hapusSesiToken();
  hapusUser();
  try {
    window.dispatchEvent(new CustomEvent(EVENT_PERLU_LOGIN, { detail: pesan }));
  } catch {
    /* noop */
  }
  throw new Error(pesan || "Sesi habis — silakan login ulang.");
}

/**
 * Panggilan utama ke backend PHP. Token sesi server disisipkan otomatis
 * (field "sesi") ke setiap payload.
 */
export async function apiCall<T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown> = {},
  timeoutMs = 20000,
): Promise<T> {
  const url = urlServer();
  let res: {
    success?: boolean;
    message?: string;
    perlu_login?: boolean;
  };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sesi: muatSesiToken(), ...data }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      throw new Error(
        `Server merespons HTTP ${r.status} — pastikan folder api ter-upload dan PHP aktif di hosting.`,
      );
    }
    res = (await r.json()) as typeof res;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error("Server tidak menjawab (timeout). Coba lagi beberapa saat.");
    }
    if (err instanceof SyntaxError) {
      throw new Error(
        "Respons server bukan JSON — pastikan folder api ter-upload di hosting dan MySQL sudah aktif.",
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        "Gagal menghubungi server. Periksa koneksi internet dan pastikan folder api ada di hosting.",
      );
    }
    throw err;
  }
  if (res && res.perlu_login) {
    tanganiPerluLogin(res.message || "Sesi habis — silakan login ulang.");
  }
  if (res && res.success === false) {
    throw new Error(res.message || "Permintaan gagal di server.");
  }
  return res as T;
}

/** Nama lama gasCall (Google Apps Script) — tetap disediakan agar kode lama jalan. */
export const gasCall = apiCall;

/* ------------------------------------------------------------------ */
/* PIN pengawas (verifikasi lokal di perangkat)                        */
/* ------------------------------------------------------------------ */

/** PIN bila pengaturan belum diatur / tidak tersedia. */
export const PIN_BAWAAN = "123456";
const KUNCI_PIN = "ujianaman:pinPengawas";

/** PIN aktif: cache dari server (ikut unduh soal), fallback 123456. */
export function pinPengawas(): string {
  try {
    return window.localStorage.getItem(KUNCI_PIN) || PIN_BAWAAN;
  } catch {
    return PIN_BAWAAN;
  }
}

/** Simpan PIN hasil unduhan soal / dari menu admin (cache lokal, offline-safe). */
export function simpanPinTersimpan(pin: string): void {
  try {
    window.localStorage.setItem(KUNCI_PIN, pin);
  } catch {
    /* noop */
  }
}

/** Verifikasi PIN pengawas — dilakukan LOKAL agar layar kunci bisa dibuka offline. */
export function cekPin(nilai: string): boolean {
  return nilai.trim() === pinPengawas();
}

/* ------------------------------------------------------------------ */
/* Token ujian (validasi lokal — ujian bisa mulai offline)             */
/* ------------------------------------------------------------------ */

export function tokenValid(nilai: string): boolean {
  return /^[A-Z0-9]{4,12}$/.test(nilai.trim().toUpperCase());
}

/**
 * Cocokkan token yang dimasukkan siswa dengan hash SHA-256 dari server
 * (field `token_hash` pada respons getSoal) — verifikasi LOkal agar ujian
 * bisa dimulai saat HP offline.
 */
export async function cocokToken(
  nilai: string,
  hashServer: string,
): Promise<boolean> {
  const teks = nilai.trim().toUpperCase();
  const subtle =
    typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (!subtle) {
    throw new Error(
      "Perangkat tidak mendukung verifikasi token — buka aplikasi lewat https://.",
    );
  }
  const buf = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(teks),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === hashServer.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Jadwal harian — kolom siswa, kalender, baris per tanggal (admin)    */
/* ------------------------------------------------------------------ */

/** Pemetaan kolom tabel siswa yang dipakai jadwal harian. */
export type KolomJadwalGas = {
  /** "tingkat" | "#kelas" (diturunkan dari kelas) | "" */
  tingkat: string;
  kelas: string;
  nis: string;
  /** "" = absensi diisi otomatis 1, 2, 3, … per kelas. */
  absen: string;
};

export type SetelJadwalGas = {
  kolom: KolomJadwalGas;
  /** Saran otomatis dari server (nama kolom terdeteksi). */
  auto: KolomJadwalGas;
  /** Semua nama kolom tabel siswa. */
  daftar_kolom: string[];
  /** Cuplikan data asli untuk membantu memilih kolom. */
  contoh: Record<string, unknown>[];
  /** Nomor hari Indonesia: 1=Senin … 7=Minggu. */
  hari_kerja: number[];
  /** Tanggal libur "YYYY-MM-DD". */
  libur: string[];
};

export type BarisJadwalHarianGas = {
  tanggal: string;
  /** SENIN, SELASA, … */
  hari: string;
  /** 1, 2, 3, … = kolom A, B, C pada cetakan. */
  sesi: number;
  mapel: string;
  pengawas: string[];
  nis: string;
  nama: string;
  kelas: string;
  tingkat: string;
  absen: string;
};

export type JadwalHarianGas = {
  tanggal: string;
  hari: string;
  total: number;
  baris: BarisJadwalHarianGas[];
};

export type GuruRingkasGas = { nip: string; nama: string; mapel: string };

/** Ambil setelan jadwal harian (deteksi kolom + kalender). */
export function getSetelJadwalGas(): Promise<SetelJadwalGas> {
  return apiCall<SetelJadwalGas>("getSetelGas");
}

/** Simpan pemetaan kolom + kalender (hari kerja & libur). */
export function setelJadwalGas(data: {
  kolom: KolomJadwalGas;
  hari_kerja: number[];
  libur: string[];
}): Promise<{ message?: string }> {
  return apiCall("setelGas", data);
}

/** Daftar guru untuk kolom Pengawas. */
export function getGuruRingkasGas(): Promise<{ guru: GuruRingkasGas[] }> {
  return apiCall("getGuruGas");
}

/** Baris jadwal harian satu tanggal (digilir antar tingkat). */
export function getJadwalHarianGas(
  tanggal: string,
  kolom: KolomJadwalGas,
): Promise<JadwalHarianGas> {
  return apiCall("jadwalHarianHarianGas", { tanggal, kolom });
}

/** Simpan mapel + pengawas manual satu baris (tanggal + sesi). */
export function simpanJadwalHarianGas(data: {
  tanggal: string;
  sesi: number;
  mapel: string;
  pengawas: string[];
}): Promise<{ message?: string }> {
  return apiCall("jadwalHarianSimpanGas", data);
}
