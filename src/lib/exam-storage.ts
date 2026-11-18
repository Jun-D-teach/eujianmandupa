/**
Penyimpanan sesi ujian di IndexedDB (via localforage) HP siswa.
Semua data yang dibutuhkan saat fase ujian (soal hasil unduhan, jawaban,
token, strike, riwayat pelanggaran) disimpan DI PERANGKAT sehingga ujian
tetap berjalan penuh saat internet dimatikan.
*/
import { penyimpanan } from "@/lib/app-storage";

export type Fase = "setup" | "instruksi" | "ujian" | "kirim" | "selesai";

/** Huruf pilihan jawaban — hanya huruf inilah yang disimpan saat siswa menjawab. */
export type Pilihan = "A" | "B" | "C" | "D" | "E";

export type SoalUjian = {
  id: string;
  pertanyaan: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  opsi_e?: string;
  /** Gambar soal (data URL) — disimpan di HP agar tampil saat offline. */
  gambar?: string;
  /** 1 = teks pilihan sudah menyertakan huruf A–E. */
  opsi_huruf?: number;
  /** "pg" (default) | "essay" | "uraian" — dua terakhir dijawab teks
      bebas dan dikoreksi manual guru. */
  tipe?: "pg" | "essay" | "uraian";
  /** Teks bacaan bersama (dari server) — tampil di HP walau offline. */
  bacaan?: string;
};

export type Pelanggaran = {
  /**
    online  = internet menyala saat ujian.
    pindah  = pindah tab/aplikasi atau jendela kehilangan fokus (split-screen).
    salin   = mencoba memilih/menyalin teks soal.
  */
  jenis: "online" | "pindah" | "salin";
  waktu: number;
};

export type HasilAkhir = {
  nilai: number;
  benar: number;
  total_soal: number;
  total_pelanggaran: number;
  jumlah_pg?: number;
  jumlah_uraian?: number;
};

export type SesiUjian = {
  versi: 1;
  ujianId: string;
  judul: string;
  deskripsi?: string;
  fase: Fase;
  nama: string;
  kelas: string;
  /** Token ujian yang dimasukkan siswa saat MULAI ujian (dibagikan
      pengawas). Kosong saat baru diunduh. */
  token?: string;
  /** SHA-256 token (dari server saat unduh) — dicocokkan lokal saat Mulai
      Ujian supaya token bisa diverifikasi walau HP offline. */
  tokenHash?: string;
  /** Durasi ujian (menit) yang diset admin. */
  durasi_menit?: number;
  /** Revisi soal saat unduhan dibuat — dicocokkan dengan server; bila beda
      berarti guru memperbaiki soal → wajib sinkron ulang (sebelum mulai). */
  revisi?: number;
  /** Jadwal mulai "YYYY-MM-DDTHH:mm" — gerbang waktu diperiksa lokal. */
  tglMulai?: string;
  /** Batas waktu pengerjaan (epoch ms), dihitung saat ujian dimulai. */
  batasWaktu?: number;
  unduhPada: number;
  mulaiPada?: number;
  kirimPada?: number;
  soal: SoalUjian[];
  jawaban: Record<string, Pilihan>;
  /** Jawaban teks soal essay/uraian: id soal → teks jawaban siswa. */
  jawabanTeks?: Record<string, string>;
  indeks: number;
  /** Hitungan strike menuju kunci layar (direset saat PIN pengawas dibuka). */
  strike: number;
  /** Seluruh pelanggaran sepanjang ujian (dilaporkan ke sheet Hasil). */
  pelanggaran: Pelanggaran[];
  /**
    Sirene peringatan sedang menyala → ujian TERKUNCI sampai sirene dimatikan
    lewat tombol (hanya bisa saat HP offline). Disimpan di sesi supaya reload /
    buka lagi tidak menyiasati blokir.
  */
  sirene?: boolean;
  hasil?: HasilAkhir;
};

const PREFIKS = "ujianaman:sesi:";

/** Kunci sesi per siswa + per ujian agar HP bisa dipakai bergantian. */
const kunciSesi = (ujianId: string, username: string): string => {
  const id = username.trim().toLowerCase();
  return id
    ? `${PREFIKS}${ujianId}:${encodeURIComponent(id)}`
    : `${PREFIKS}${ujianId}`;
};

/** Normalisasi soal lama yang memakai _id (sebelum migrasi ke GAS). */
function normalisasiSoal(data: SesiUjian): SesiUjian {
  data.soal = data.soal.map((s) => {
    const lama = s as unknown as { _id?: string };
    return { ...s, id: s.id || String(lama._id ?? "") };
  });
  return data;
}

/**
Muat sesi ujian dari IndexedDB.
@return SesiUjian atau null bila tidak ada/rusak.
*/
export async function muatSesi(
  ujianId: string,
  username: string
): Promise<SesiUjian | null> {
  const key = kunciSesi(ujianId, username);
  let data = await penyimpanan.getItem<SesiUjian | string>(key);
  if (!data && username.trim()) {
    const keyLama = `${PREFIKS}${ujianId}`;
    const lama = await penyimpanan.getItem<SesiUjian | string>(keyLama);
    if (lama) {
      try {
        data = typeof lama === "string" ? (JSON.parse(lama) as SesiUjian) : lama;
      } catch {
        return null;
      }
      await penyimpanan.setItem(key, data);
      await penyimpanan.removeItem(keyLama);
    }
  }
  if (!data) return null;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as SesiUjian;
    } catch {
      return null;
    }
  }
  if (data.versi !== 1 || !Array.isArray(data.soal)) return null;
  return normalisasiSoal(data);
}

/**
Simpan sesi ujian ke IndexedDB.
*/
export async function simpanSesi(
  sesi: SesiUjian,
  username: string
): Promise<void> {
  await penyimpanan.setItem(kunciSesi(sesi.ujianId, username), sesi);
}

/**
Hapus sesi ujian dari IndexedDB.
*/
export async function hapusSesi(
  ujianId: string,
  username: string
): Promise<void> {
  await penyimpanan.removeItem(kunciSesi(ujianId, username));
}

/**
Hapus semua sesi ujian milik siswa tertentu (untuk logout).
*/
export async function hapusSemuaSesiSiswa(username: string): Promise<void> {
  const keys = await penyimpanan.keys();
  const suffix = `:${encodeURIComponent(username.trim().toLowerCase())}`;
  for (const key of keys) {
    if (key.startsWith(PREFIKS) && key.endsWith(suffix)) {
      await penyimpanan.removeItem(key);
    }
  }
}