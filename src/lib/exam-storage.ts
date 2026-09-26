/**
 * Penyimpanan sesi ujian di LocalStorage HP siswa.
 *
 * Semua data yang dibutuhkan saat fase ujian (soal hasil unduhan, jawaban,
 * strike, riwayat pelanggaran) disimpan DI PERANGKAT sehingga ujian tetap
 * berjalan penuh saat internet dimatikan.
 */

export type Fase = "setup" | "instruksi" | "ujian" | "kirim" | "selesai";

export type SoalUjian = {
  _id: string;
  pertanyaan: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  urutan: number;
};

export type Pelanggaran = {
  jenis: "online" | "pindah";
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
  unduhPada: number;
  mulaiPada?: number;
  kirimPada?: number;
  soal: SoalUjian[];
  jawaban: Record<string, "A" | "B" | "C" | "D">;
  indeks: number;
  /** Hitungan strike menuju kunci layar (direset saat PIN pengawas dibuka). */
  strike: number;
  /** Seluruh pelanggaran sepanjang ujian (dilaporkan ke tabel hasil). */
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
