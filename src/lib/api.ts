/**
 * Klien Google Apps Script (GAS) + sesi pengguna UjianAman.
 *
 * Semua komunikasi backend lewat Web App GAS (Google Sheets):
 *  - GET + JSONP  : bebas CORS, dipakai untuk semua panggilan.
 *  - POST         : fallback (payload JSON, Content-Type text/plain).
 * Payload dikirim sebagai payloadB64 (base64 JSON) agar aman di query string.
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
  /** "" | "tingkat" | "kelas" */
  sasar_jenis?: string;
  /** tingkat: "X|XI|XII" · kelas: "X.1,X.2" */
  sasar_nilai?: string;
  /** Label ramah baca dari server. */
  sasaran?: string;
  /** Server: apakah kelas siswa lolos sasaran (undefined utk admin). */
  boleh?: boolean;
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
  total_pelanggaran: number;
  timestamp: string;
};

export type PenggunaGas = {
  id: string;
  username: string;
  nama: string;
  kelas: string;
  role: Role;
};

const KUNCI_URL = "ujianaman:gasUrl";
const KUNCI_USER = "ujianaman:user";
const KUNCI_SESI = "ujianaman:sesi";

/**
 * URL Web App GAS sekolah — dibake langsung di sini agar siswa/guru TIDAK
 * perlu memasukkan URL server lagi. Ganti nilai di bawah bila deployment GAS
 * dibuat ulang. Prioritas: env VITE_GAS_URL (bila ada) > nilai bake ini.
 */
const GAS_URL_BAKE =
  "https://script.google.com/macros/s/AKfycby29tQY2OndE-1YNDTdf5fkmdsplD8GFfjTrXsugOYBeYcbq9IvzHpXKf3XEWRTW0SC/exec";

const GAS_URL_BAWAAN = (
  (import.meta.env.VITE_GAS_URL as string | undefined) || GAS_URL_BAKE
).trim();

/** URL /exec GAS harus berformat script.google.com agar app tidak bisa
 *  diarahkan ke server palsu dari perangkat yang sama. */
export function urlServerValid(url: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/(exec|dev)$/.test(
    url.trim(),
  );
}

/** Apakah URL server sudah dibake saat build (VITE_GAS_URL). */
export function adaKonfigurasiBawaan(): boolean {
  return GAS_URL_BAWAAN !== "";
}

/* ------------------------------------------------------------------ */
/* URL server GAS                                                      */
/* ------------------------------------------------------------------ */

export function muatUrlServer(): string {
  try {
    const t = (window.localStorage.getItem(KUNCI_URL) ?? "").trim();
    if (t) return t;
  } catch {
    /* noop */
  }
  return GAS_URL_BAWAAN;
}

/** Simpan URL hanya bila formatnya URL /exec GAS yang sah. */
export function simpanUrlServer(url: string): boolean {
  const bersih = url.trim();
  if (!urlServerValid(bersih)) return false;
  try {
    window.localStorage.setItem(KUNCI_URL, bersih);
  } catch {
    /* noop */
  }
  return true;
}

export function hapusUrlServer(): void {
  try {
    window.localStorage.removeItem(KUNCI_URL);
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------------ */
/* Sesi pengguna (auth dikelola admin di sheet Pengguna)               */
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
/* Transport: JSONP (bebas CORS) + POST fallback                       */
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

function encodePayloadB64(data: Record<string, unknown>): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

function panggilJsonp(url: string, timeoutMs = 20000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const nama = `ujianaman_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement("script");
    const bersih = () => {
      delete (window as unknown as Record<string, unknown>)[nama];
      script.remove();
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      bersih();
      reject(new Error("Server tidak menjawab (timeout). Periksa URL Web App GAS."));
    }, timeoutMs);

    (window as unknown as Record<string, unknown>)[nama] = (data: unknown) => {
      bersih();
      resolve(data);
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${nama}`;
    script.onerror = () => {
      bersih();
      reject(new Error("Gagal menghubungi server. Periksa URL /exec dan deployment GAS."));
    };
    document.head.appendChild(script);
  });
}

/** Panggilan utama ke GAS: GET + JSONP dengan payloadB64. Token sesi
 *  server disisipkan otomatis (field "sesi") ke setiap payload. */
export async function gasCall<T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const url = muatUrlServer();
  if (!url) throw new Error("URL server Google Sheets belum diatur.");
  if (!urlServerValid(url))
    throw new Error("URL server tidak valid — harus https://script.google.com/macros/s/…/exec");
  const penuh = `${url}?action=${encodeURIComponent(action)}&payloadB64=${encodeURIComponent(
    encodePayloadB64({ sesi: muatSesiToken(), ...data }),
  )}`;
  const res = (await panggilJsonp(penuh)) as {
    success?: boolean;
    message?: string;
    perlu_login?: boolean;
  };
  if (res && res.perlu_login) {
    tanganiPerluLogin(res.message || "Sesi habis — silakan login ulang.");
  }
  if (res && res.success === false) {
    throw new Error(res.message || "Permintaan gagal di server.");
  }
  return res as T;
}

/** POST langsung (fallback, dipakai bila JSONP tidak tersedia). */
export async function gasPost<T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const url = muatUrlServer();
  if (!url) throw new Error("URL server Google Sheets belum diatur.");
  if (!urlServerValid(url))
    throw new Error("URL server tidak valid — harus https://script.google.com/macros/s/…/exec");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, sesi: muatSesiToken(), ...data }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    message?: string;
    perlu_login?: boolean;
  };
  if (json && json.perlu_login) {
    tanganiPerluLogin(json.message || "Sesi habis — silakan login ulang.");
  }
  if (json && json.success === false) {
    throw new Error(json.message || "Permintaan gagal di server.");
  }
  return json as T;
}

/* ------------------------------------------------------------------ */
/* PIN pengawas (verifikasi lokal di perangkat)                        */
/* ------------------------------------------------------------------ */

/** PIN bila sheet Pengaturan belum diatur / tidak tersedia. */
export const PIN_BAWAAN = "123456";
const KUNCI_PIN = "ujianaman:pinPengawas";

/** PIN aktif: cache dari sheet Pengaturan (ikutan unduh soal), fallback 123456. */
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
