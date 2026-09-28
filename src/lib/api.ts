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

/* ------------------------------------------------------------------ */
/* URL server GAS                                                      */
/* ------------------------------------------------------------------ */

export function muatUrlServer(): string {
  try {
    return window.localStorage.getItem(KUNCI_URL) ?? "";
  } catch {
    return "";
  }
}

export function simpanUrlServer(url: string): void {
  try {
    window.localStorage.setItem(KUNCI_URL, url.trim());
  } catch {
    /* noop */
  }
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
/* Transport: JSONP (bebas CORS) + POST fallback                       */
/* ------------------------------------------------------------------ */

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

/** Panggilan utama ke GAS: GET + JSONP dengan payloadB64. */
export async function gasCall<T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const url = muatUrlServer();
  if (!url) throw new Error("URL server Google Sheets belum diatur.");
  const penuh = `${url}?action=${encodeURIComponent(action)}&payloadB64=${encodeURIComponent(
    encodePayloadB64(data),
  )}`;
  const res = (await panggilJsonp(penuh)) as { success?: boolean; message?: string };
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...data }),
  });
  const json = (await res.json()) as { success?: boolean; message?: string };
  if (json && json.success === false) {
    throw new Error(json.message || "Permintaan gagal di server.");
  }
  return json as T;
}

/* ------------------------------------------------------------------ */
/* PIN pengawas (verifikasi lokal di perangkat)                        */
/* ------------------------------------------------------------------ */

export const PIN_PENGAWAS = "123456";

export function cekPin(nilai: string): boolean {
  return nilai.trim() === PIN_PENGAWAS;
}

/* ------------------------------------------------------------------ */
/* Token ujian (validasi lokal — ujian bisa mulai offline)             */
/* ------------------------------------------------------------------ */

export function tokenValid(nilai: string): boolean {
  return /^[A-Z0-9]{4,12}$/.test(nilai.trim().toUpperCase());
}
