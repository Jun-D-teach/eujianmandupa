/**
 * Penyimpanan sesi ujian di LocalStorage HP siswa.
 *
 * Semua data yang dibutuhkan saat fase ujian (soal hasil unduhan, jawaban,
 * token, strike, riwayat pelanggaran) disimpan DI PERANGKAT sehingga ujian
 * tetap berjalan penuh saat internet dimatikan.
 */

export type Fase = "setup" | "instruksi" | "ujian" | "kirim" | "selesai";

/** Huruf pilihan jawaban — hanya huruf inilah yang disimpan saat siswa menjawab. */
export type Pilihan = "A" | "B" | "C" | "D" | "E";export type SoalUjian = {
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
   *  bebas dan dikoreksi manual guru. */
  tipe?: "pg" | "essay" | "uraian";
  /** Teks bacaan bersama (dari server) — tampil di HP walau offline. */
  bacaan?: string;
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
  /** Token ujian yang dimasukkan siswa saat MULAI ujian (dibagikan
   *  pengawas). Kosong saat baru diunduh. */
  token?: string;
  /** SHA-256 token (dari server saat unduh) — dicocokkan lokal saat Mulai
   *  Ujian supaya token bisa diverifikasi walau HP offline. */
  tokenHash?: string;
  /** Durasi ujian (menit) yang diset admin. */
  durasi_menit?: number;
  /** Revisi soal saat unduhan dibuat — dicocokkan dengan server; bila beda
   *  berarti guru memperbaiki soal → wajib sinkron ulang (sebelum mulai). */
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
   * Sirene peringatan sedang menyala → ujian TERKUNCI sampai sirene dimatikan
   * lewat tombol (hanya bisa saat HP offline). Disimpan di sesi supaya reload /
   * buka lagi tidak menyiasati blokir.
   */
  sirene?: boolean;
  hasil?: HasilAkhir;
};

/**
 * Sesi ujian disimpan PER SISWA + per ujian, supaya satu HP bisa dipakai
 * bergantian oleh beberapa siswa. Sebelumnya kuncinya hanya berdasarkan id
 * ujian, sehingga siswa kedua yang login di HP yang sama "mewarisi" sesi
 * siswa pertama (nama lama, fase "selesai", jawaban lama).
 *
 *   ujianaman:sesi:<ujianId>:<username>   ← kunci baru (per siswa)
 *   ujianaman:sesi:<ujianId>              ← kunci lama (kompatibilitas)
 */
const PREFIKS = "ujianaman:sesi:";

/** Identitas siswa yang sedang login di HP ini ("" bila tidak ada). */
function penggunaAktif(): { id: string; nama: string } {
  try {
    const raw = window.localStorage.getItem("ujianaman:user");
    if (!raw) return { id: "", nama: "" };
    const u = JSON.parse(raw) as { username?: string; nama?: string };
    return { id: String(u?.username ?? "").trim(), nama: String(u?.nama ?? "") };
  } catch {
    return { id: "", nama: "" };
  }
}

const kunciLama = (ujianId: string) => `${PREFIKS}${ujianId}`;

/** Kunci sesi milik pengguna aktif; tanpa login → kunci lama (perilaku awal). */
const kunci = (ujianId: string) => {
  const { id } = penggunaAktif();
  return id
    ? `${PREFIKS}${ujianId}:${encodeURIComponent(id.toLowerCase())}`
    : kunciLama(ujianId);
};

const samaNama = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() ===
  b.trim().replace(/\s+/g, " ").toLowerCase();

function bacaSesi(raw: string | null): SesiUjian | null {
  if (!raw) return null;
  const data = JSON.parse(raw) as SesiUjian;
  if (!data || data.versi !== 1 || !Array.isArray(data.soal)) return null;
  // Normalisasi soal lama yang memakai _id (sebelum migrasi ke GAS).
  data.soal = data.soal.map((s) => {
    const lama = s as unknown as { _id?: string };
    return { ...s, id: s.id || String(lama._id ?? "") };
  });
  return data;
}

export function muatSesi(ujianId: string): SesiUjian | null {
  try {
    const { id, nama } = penggunaAktif();
    const k = kunci(ujianId);
    const milikSaya = bacaSesi(window.localStorage.getItem(k));
    if (milikSaya) return milikSaya;
    if (!id) return null; // tidak login → kunci lama sudah dicoba di atas

    // Sesi lama (kunci tanpa siswa) hanya diwarisi bila memang milik siswa ini
    // (nama cocok). Milik siswa lain dibiarkan utuh & TIDAK ditampilkan.
    const lama = bacaSesi(window.localStorage.getItem(kunciLama(ujianId)));
    if (lama && nama && samaNama(lama.nama, nama)) {
      try {
        window.localStorage.setItem(k, JSON.stringify(lama));
        window.localStorage.removeItem(kunciLama(ujianId));
      } catch {
        /* penyimpanan penuh — tetap pakai sesi lama di memori */
      }
      return lama;
    }
    return null;
  } catch {
    return null;
  }
}

/** Hapus sesi SELESAI milik siswa lain (jawabannya sudah di server) untuk
 *  melapangkan LocalStorage yang penuh. Sesi yang masih berjalan tak disentuh. */
function bersihkanSesiSelesaiLain(kecuali: string): boolean {
  let terhapus = false;
  try {
    const ls = window.localStorage;
    const { id } = penggunaAktif();
    const akhiranSaya = id ? `:${encodeURIComponent(id.toLowerCase())}` : "";
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (!k || !k.startsWith(PREFIKS) || k === kecuali) continue;
      // Sesi milik siswa yang sedang login (ujian lain) jangan disentuh.
      if (akhiranSaya && k.endsWith(akhiranSaya)) continue;
      try {
        const s = JSON.parse(ls.getItem(k) ?? "null") as SesiUjian | null;
        if (s && s.fase === "selesai" && s.hasil) {
          ls.removeItem(k);
          terhapus = true;
        }
      } catch {
        /* abaikan entri rusak */
      }
    }
  } catch {
    /* noop */
  }
  return terhapus;
}

export function simpanSesi(sesi: SesiUjian): void {
  const k = kunci(sesi.ujianId);
  const isi = JSON.stringify(sesi);
  try {
    window.localStorage.setItem(k, isi);
  } catch {
    // Penuh: buang sesi selesai milik siswa lain di HP ini, lalu coba lagi.
    if (!bersihkanSesiSelesaiLain(k)) return;
    try {
      window.localStorage.setItem(k, isi);
    } catch {
      /* tetap penuh — abaikan */
    }
  }
}

export function hapusSesi(ujianId: string): void {
  try {
    window.localStorage.removeItem(kunci(ujianId));
  } catch {
    /* noop */
  }
}
