/**
 * Penyimpanan sesi ujian di LocalStorage HP siswa.
 *
 * Semua data yang dibutuhkan saat fase ujian (soal hasil unduhan, jawaban,
 * token, strike, riwayat pelanggaran) disimpan DI PERANGKAT sehingga ujian
 * tetap berjalan penuh saat internet dimatikan.
 */

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
};

export type Pelanggaran = {
  /**
   * online  = internet menyala saat ujian.
   * pindah  = pindah tab/aplikasi atau jendela kehilangan fokus (split-screen).
   * salin   = mencoba memilih/menyalin teks soal.
   */
  jenis: "online" | "pindah" | "salin";
  waktu: number;
};

export type HasilAkhir = {
  nilai: number;
  benar: number;
  total_soal: number;
  total_pelanggaran: number;
};

export type SesiUjian = {
  versi: 1;
  ujianId: string;
  judul: string;
  deskripsi?: string;
  fase: Fase;
  nama: string;
  kelas: string;
  /** Token ujian yang dimasukkan siswa saat mulai (dibagikan pengawas). */
  token?: string;
  /** Durasi ujian (menit) yang diset admin. */
  durasi_menit?: number;
  /** Jadwal mulai "YYYY-MM-DDTHH:mm" — gerbang waktu diperiksa lokal. */
  tglMulai?: string;
  /** Batas waktu pengerjaan (epoch ms), dihitung saat ujian dimulai. */
  batasWaktu?: number;
  unduhPada: number;
  mulaiPada?: number;
  kirimPada?: number;
  soal: SoalUjian[];
  jawaban: Record<string, Pilihan>;
  indeks: number;
  /** Hitungan strike menuju kunci layar (direset saat PIN pengawas dibuka). */
  strike: number;
  /** Seluruh pelanggaran sepanjang ujian (dilaporkan ke sheet Hasil). */
  pelanggaran: Pelanggaran[];
  hasil?: HasilAkhir;
};

const kunci = (ujianId: string) => `ujianaman:sesi:${ujianId}`;

export function muatSesi(ujianId: string): SesiUjian | null {
  try {
    const raw = window.localStorage.getItem(kunci(ujianId));
    if (!raw) return null;
    const data = JSON.parse(raw) as SesiUjian;
    if (!data || data.versi !== 1 || !Array.isArray(data.soal)) return null;
    // Normalisasi soal lama yang memakai _id (sebelum migrasi ke GAS).
    data.soal = data.soal.map((s) => {
      const lama = s as unknown as { _id?: string };
      return { ...s, id: s.id || String(lama._id ?? "") };
    });
    return data;
  } catch {
    return null;
  }
}

export function simpanSesi(sesi: SesiUjian): void {
  try {
    window.localStorage.setItem(kunci(sesi.ujianId), JSON.stringify(sesi));
  } catch {
    /* penyimpanan penuh — abaikan */
  }
}

export function hapusSesi(ujianId: string): void {
  try {
    window.localStorage.removeItem(kunci(ujianId));
  } catch {
    /* noop */
  }
}
