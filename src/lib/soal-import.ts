/**
 * ============================================================================
 * UjianAman — Pemecah soal "pintar" untuk impor dari Word / tempel-teks.
 * ----------------------------------------------------------------------------
 * Dipakai menu guru: KelolaUjian → PanelSoal → "Impor dari Word" dan kotak
 * "Pecah otomatis" pada form tambah soal.
 *
 * Dua sumber teks:
 *  1. File .docx — dibaca langsung di browser: ZIP → word/document.xml → teks
 *     (tanpa pustaka tambahan; memakai DecompressionStream bawaan browser)
 *  2. Tempel-teks (salin-tempel dari Word / Google Docs)
 *
 * Heuristik pemecahan:
 *  - Soal baru : baris bernomor "1." "2)" "3 -" "4:" atau label "Soal 5."
 *  - Pilihan   : penanda "A." "B)" "C:" "D -" — boleh satu baris per pilihan
 *                atau seluruh pilihan dalam satu baris panjang; bullet "•"
 *                juga dikenali bila tidak ada penanda huruf.
 *  - Kunci     : "Kunci: B", "Jawaban: (C)", baris "(B)" sendirian setelah
 *                pilihan, atau blok "Kunci Jawaban:" + daftar "1. A 2. B"
 *                di akhir dokumen.
 */

import { rumusKeTeks } from "./rumus-docx";

export type Huruf = "A" | "B" | "C" | "D" | "E";

export type BarisSoalOtomat = {
  /** Nomor asli dari dokumen ("" bila soal tanpa nomor). */
  nomor: string;
  pertanyaan: string;
  /** Pilihan TANPA huruf depan — index 0 = A … 4 = E ("" bila tidak ada). */
  opsi: string[];
  /** Pilihan DENGAN huruf depan persis seperti diketik guru. */
  opsiMentah: string[];
  kunci: Huruf | "";
};

const DAFTAR_HURUF: readonly string[] = ["A", "B", "C", "D", "E"];

function keHuruf(c: string): Huruf | null {
  const u = c.toUpperCase();
  return DAFTAR_HURUF.includes(u) ? (u as Huruf) : null;
}

/* ------------------------------------------------------------------ */
/* Normalisasi & pola dasar                                            */
/* ------------------------------------------------------------------ */

/** Rapikan karakter tak terlihat dari salin-tempel Word. */
function normalisasi(teks: string): string {
  return teks
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "");
}

/** Awal baris soal bernomor: "1." "2)" "3 -" "4:" — spasi setelah tanda wajib
 *  (atau baris berakhir tepat di tanda) supaya "3.5 cm" tidak salah pecah. */
const RE_SOAL = /^\s*(?:soal\s*)?(\d{1,3})[.)\-–—:](?:\s+(.*))?$/i;
/** Label tanpa tanda: "Soal 5 — …". */
const RE_SOAL_LABEL = /^\s*soal\s+(\d{1,3})\b\s*(.*)$/i;

/** Satu baris yang isinya hanya huruf kunci: "B", "(B)", "*B". */
const RE_HURUF_KOTA = /^\s*(?:\(\s*([A-E])\s*\)|([*#]?)\s*([A-E]))\s*$/i;
function hurufDariBaris(baris: string): Huruf | null {
  const m = baris.match(RE_HURUF_KOTA);
  if (!m) return null;
  return keHuruf(m[1] ?? m[3] ?? "");
}

/** Baris daftar kunci bernomor: "1. A", "2) B", "3 - C". */
const RE_BARIS_KUNCI = /^\s*(?:kunci(?:\s*(?:jawaban|jawab))?\s*[:=-]?\s*)?(\d{1,3})[.)\-–—:]\s*\(?\s*([A-E])\s*\)?[.\s,;]*$/i;
/** Satu baris berisi banyak pasangan: "1.A 2.B 3.C". */
const RE_BARIS_KUNCI_GANDA =
  /^\s*(?:kunci(?:\s*(?:jawaban|jawab))?\s*[:=-]?\s*)?(?:\d{1,3}[.)\-–—:]\s*\(?\s*[A-E]\s*\)?[.,;]?\s*)+$/i;
/** Baris berisi satu huruf saja (blok kunci tanpa nomor): "A". */
const RE_BARIS_HURUF = /^\s*\(?\s*([A-E])\s*\)?\s*$/i;

/** Keyword kunci di akhir baris: "Kunci: B", "Jawaban : (C)".
 *  Toleran penanda format penulisan: "**Kunci: B**" juga dikenali. */
const RE_KUNCI_EKOR =
  /(?:^|[\s*_~])(?:kunci(?:\s*(?:jawaban|jawab))?|jawab(?:an)?)\s*[:=-]?\s*\(?\s*([A-E])\)?[\s*]*$/i;

/** Pasangan "nomor + huruf" untuk menguras blok kunci. */
const RE_PASANGAN = /(\d{1,3})[.)\-–—:]\s*\(?\s*([A-E])\)?/g;

/* ------------------------------------------------------------------ */
/* Blok "Kunci Jawaban" di akhir dokumen                               */
/* ------------------------------------------------------------------ */

function barisKunciCocok(l: string): boolean {
  return (
    RE_BARIS_KUNCI.test(l) ||
    RE_BARIS_KUNCI_GANDA.test(l) ||
    RE_BARIS_HURUF.test(l)
  );
}

/**
 * Pisahkan baris penjawab akhir dokumen ("Kunci Jawaban:" + daftar, atau
 * deretan "1. A" tanpa judul) sebelum teks dipecah jadi soal-soal.
 */
function pisahKunciAkhir(lines: string[]): {
  isi: string[];
  peta: Map<string, Huruf>;
  urut: Huruf[];
} {
  const peta = new Map<string, Huruf>();
  const urut: Huruf[] = [];

  let batas = -1; // index baris pertama region kunci
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!/^\s*(?:kunci|jawaban)\b/i.test(lines[i])) continue;
    const sisa = lines.slice(i + 1).filter((l) => l.trim() !== "");
    const cocok = sisa.filter(barisKunciCocok).length;
    if (sisa.length > 0 && cocok / sisa.length >= 0.6) batas = i;
    break; // hanya periksa judul kunci TERAKHIR
  }
  if (batas < 0) {
    let ujung = lines.length;
    while (ujung > 0 && lines[ujung - 1].trim() === "") ujung--;
    let e = ujung;
    while (e > 0 && barisKunciCocok(lines[e - 1])) e--;
    if (ujung - e >= 2) batas = e;
  }
  if (batas < 0) return { isi: lines, peta, urut };

  for (const l of lines.slice(batas)) {
    const t = l
      .replace(/^\s*kunci(?:\s*(?:jawaban|jawab))?\s*[:=-]?\s*/i, "")
      .replace(/^\s*jawab(?:an)?\s*[:=-]?\s*/i, "")
      .trim();
    if (t === "") continue;
    const mBare = t.match(RE_BARIS_HURUF);
    if (mBare) {
      const h = keHuruf(mBare[1] ?? "");
      if (h) urut.push(h);
      continue;
    }
    for (const m of t.matchAll(RE_PASANGAN)) {
      const h = keHuruf(m[2] ?? "");
      if (h) peta.set(String(parseInt(m[1], 10)), h);
    }
  }
  return { isi: lines.slice(0, batas), peta, urut };
}

/* ------------------------------------------------------------------ */
/* Penguraian satu blok soal                                           */
/* ------------------------------------------------------------------ */

type Blok = { nomor: string; baris: string[] };

type Penanda = { huruf: Huruf; pos: number; isi: number };

/** Ketat: huruf harus diawali spasi/penanda format/awal baris — dipakai
 *  MENENTUKAN apakah baris ini baris pilihan (mencegah "nilai A. adalah"
 *  dianggap pilihan; "**A. …**" tetap dikenali sebagai pilihan). */
const RE_TANDA_KETAT = /(^|[\s*_~])([A-Ea-e])[.)\-–—:]\s*/g;
/** Longgar: mendeteksi pilihan yang menempel tanpa spasi (hasil XML Word
 *  yang memecah run, mis. "VenusB. Bumi") — dipakai SETELAH baris pasti
 *  baris pilihan. */
const RE_TANDA_LONGGAR = /([A-Ea-e])[.)\-–—:]\s*/g;

function cariPenanda(baris: string, longgar = false): Penanda[] {
  const re = longgar ? RE_TANDA_LONGGAR : RE_TANDA_KETAT;
  re.lastIndex = 0;
  const keluar: Penanda[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(baris)) !== null) {
    if (longgar) {
      // Huruf kecil yang menempel huruf sebelumnya = bagian dari kata,
      // bukan penanda pilihan ("siswa-siswa", "jakarta.") — kalau dianggap
      // penanda, teks opsi terpotong di tengah kata. Penanda asli tetap
      // terkena: di awal baris, setelah spasi, atau huruf besar menempel
      // ("VenusB. Bumi" hasil run Word yang menempel).
      const sebelum = m.index > 0 ? baris[m.index - 1] : "";
      if (m.index > 0) {
        const kecil = m[1] === m[1].toLowerCase();
        // Huruf kecil hanya penanda bila diawali spasi, "(" / "[" atau
        // penanda format — "(a+b)" / "(√c)" dari rumus BUKAN penanda "b)".
        if (kecil && !/[\s(\[*_~]/.test(sebelum)) continue;
        // Huruf besar yang menempel operator matematika ("A+B)", "x=B.")
        // juga bagian rumus, bukan penanda pilihan.
        if (!kecil && /[+−×÷=/^<>√]/.test(sebelum)) continue;
      }
    }
    const pos = m.index + (longgar ? 0 : m[1].length);
    const h = keHuruf(longgar ? m[1] : m[2]);
    if (h) keluar.push({ huruf: h, pos, isi: m.index + m[0].length });
  }
  return keluar;
}

/** Uraikan satu blok soal menjadi pertanyaan + pilihan + kunci. */
function uraikanBlok(blok: Blok): BarisSoalOtomat {
  /* Mode bullet: bila tidak ada penanda huruf sama sekali tetapi ada ≥2 baris
     "• …", pilihan dianggap memakai bullet dan disusun berurutan A, B, C, … */
  const adaHuruf = blok.baris.some((l) => cariPenanda(l).length > 0);
  const jumlahBullet = blok.baris.filter((l) =>
    /^\s*[•●▪‣∙]\s*\S/.test(l),
  ).length;
  const modeBullet = !adaHuruf && jumlahBullet >= 2;
  // Bullet "•" diubah menjadi penanda "A. " sesuai urutan baris.
  let baris = blok.baris;
  if (modeBullet) {
    let i = 0;
    baris = blok.baris.map((l) => {
      const m = l.match(/^\s*[•●▪‣∙]\s*(\S.*)$/);
      if (!m) return l;
      const huruf = DAFTAR_HURUF[i] ?? "*";
      i++;
      return `${huruf}. ${m[1]}`;
    });
  }

  const slot = ["", "", "", "", ""]; // teks bersih (tanpa huruf)
  const mentah = ["", "", "", "", ""]; // teks persis guru (dengan huruf)
  const tanya: string[] = [];
  let kunci: Huruf | "" = "";
  let opsiTerakhir = -1;

  const jumlahOpsi = () => slot.filter((s) => s !== "").length;

  const tambah = (teks: string) => {
    const t = teks.trim();
    if (t === "") return;
    if (opsiTerakhir >= 0) {
      slot[opsiTerakhir] = slot[opsiTerakhir] ? `${slot[opsiTerakhir]} ${t}` : t;
      mentah[opsiTerakhir] = mentah[opsiTerakhir]
        ? `${mentah[opsiTerakhir]} ${t}`
        : t;
    } else {
      tanya.push(t);
    }
  };

  for (const b of baris) {
    // 1) Baris kunci keyword: "Kunci: B" / "Jawaban: (C)".
    const mK = b.match(RE_KUNCI_EKOR);
    if (mK && !kunci) {
      const h = keHuruf(mK[1]);
      if (h) {
        kunci = h;
        continue;
      }
    }
    // 2) Baris hanya huruf "(B)" / "B" — hanya setelah pilihan terbuka.
    if (jumlahOpsi() >= 2) {
      const h = hurufDariBaris(b);
      if (h) {
        if (!kunci) kunci = h;
        continue;
      }
    }
    // 3) Penanda pilihan di baris ini. Keputusan pakai memakai pola ketat;
    //    posisi pemecahan memakai pola longgar (menangkap pilihan menempel).
    const ketat = cariPenanda(b);
    const diAwal =
      ketat.length > 0 &&
      b.slice(0, ketat[0].pos).replace(/[*_~]/g, "").trim() === "";
    const pakai = ketat.length >= 2 || (ketat.length === 1 && diAwal);
    if (pakai) {
      const penanda = cariPenanda(b, true);
      const prefix = b.slice(0, penanda[0].pos).trim();
      // Hanya penanda format ("**" di depan baris pilihan)? Bukan teks
      // pertanyaan — pindahkan ke isi pilihan supaya tebal/miring seimbang.
      const prefixFormat = /^[*_~]+$/.test(prefix) ? prefix : "";
      if (prefix && !prefixFormat) tambah(prefix);
      for (let i = 0; i < penanda.length; i++) {
        const p = penanda[i];
        const akhir = i + 1 < penanda.length ? penanda[i + 1].pos : b.length;
        const idx = DAFTAR_HURUF.indexOf(p.huruf);
        if (idx < 0) continue;
        let teksBersih = b.slice(p.isi, akhir).trim();
        let teksMentah = b.slice(p.pos, akhir).trim();
        if (prefixFormat && i === 0) {
          teksBersih = prefixFormat + teksBersih;
          teksMentah = prefixFormat + teksMentah;
        }
        slot[idx] = slot[idx] ? `${slot[idx]} ${teksBersih}` : teksBersih;
        mentah[idx] = mentah[idx] ? `${mentah[idx]} ${teksMentah}` : teksMentah;
        opsiTerakhir = idx;
      }
      continue;
    }
    // 4) Baris biasa — lanjutan pertanyaan / pilihan terakhir.
    tambah(b);
  }

  // Baris baru dari guru = paragraf baru saat ditampilkan — jangan diratakan
  // jadi satu baris (lihat src/lib/soal-format.ts).
  let pertanyaan = tanya
    .map((t) => t.replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Kunci tertempel di ekor pertanyaan: "… adalah (C)".
  if (!kunci && jumlahOpsi() >= 2) {
    const mEkor = pertanyaan.match(/\s+\(([A-E])\)\s*$/i);
    if (mEkor && typeof mEkor.index === "number") {
      kunci = keHuruf(mEkor[1]) ?? "";
      if (kunci) pertanyaan = pertanyaan.slice(0, mEkor.index).trimEnd();
    }
  }

  return {
    nomor: blok.nomor,
    pertanyaan,
    opsi: slot,
    opsiMentah: mentah,
    kunci,
  };
}

/* ------------------------------------------------------------------ */
/* API utama                                                           */
/* ------------------------------------------------------------------ */

/**
 * Pecah awal baris bernomor ("1.", "2)", "Soal 5.") jadi nomor + isi.
 * Toleran penanda format penulisan: "**1. Pertanyaan**" diperlakukan sama
 * dengan "1. Pertanyaan" — penanda yang ikut tertelan dikembalikan ke isi
 * supaya pasangan tebal/miring tetap seimbang saat dirender.
 */
function pecahNomor(line: string): { nomor: string; sisa: string } | null {
  const penanda = (line.match(/^\s*[*_~]{1,4}/) ?? [""])[0];
  const polos = line.slice(penanda.length);
  const m = polos.match(RE_SOAL) ?? polos.match(RE_SOAL_LABEL);
  if (!m) return null;
  return { nomor: m[1] ?? "", sisa: (penanda + (m[2] ?? "")).trim() };
}

/** Pecah teks (dokumen Word hasil salin-tempel / .docx terurai) jadi daftar soal. */
export function parseTeksSoal(teks: string): BarisSoalOtomat[] {
  const garis = normalisasi(teks).split("\n");
  if (garis.every((g) => g.trim() === "")) return [];

  const { isi, peta, urut } = pisahKunciAkhir(garis);

  // Pecah menjadi blok per nomor soal.
  const blok: Blok[] = [];
  for (const line of isi) {
    const m = pecahNomor(line);
    if (m) {
      blok.push({ nomor: m.nomor, baris: [m.sisa] });
    } else if (blok.length > 0) {
      blok[blok.length - 1].baris.push(line);
    } else {
      // Teks sebelum nomor pertama (judul/pengantar) — kumpulkan dulu.
      blok.push({ nomor: "", baris: [line] });
    }
  }
  // Buang pengantar tanpa nomor & tanpa pilihan bila ada soal lain sesudahnya.
  while (
    blok.length > 1 &&
    blok[0].nomor === "" &&
    blok[0].baris.every((l) => cariPenanda(l).length === 0)
  ) {
    blok.shift();
  }

  const hasil = blok
    .filter((b) => b.baris.some((l) => l.trim() !== ""))
    .map(uraikanBlok)
    .filter((s) => s.pertanyaan !== "" || s.opsi.some((o) => o !== ""));

  // Terapkan kunci dari blok "Kunci Jawaban".
  for (const s of hasil) {
    if (s.kunci || !s.nomor) continue;
    const h = peta.get(String(parseInt(s.nomor, 10)));
    if (h) s.kunci = h;
  }
  let iUrut = 0;
  for (const s of hasil) {
    if (!s.kunci && iUrut < urut.length) {
      s.kunci = urut[iUrut];
      iUrut++;
    }
  }
  return hasil;
}

/* ------------------------------------------------------------------ */
/* Pembaca .docx (ZIP → word/document.xml → teks) — tanpa pustaka       */
/* ------------------------------------------------------------------ */

/** Buffer yang selalu berbasis ArrayBuffer (syarat BlobPart TS 5.9+). */
type Bytes = Uint8Array<ArrayBuffer>;

async function inflateRaw(b: Bytes): Promise<Bytes> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([b]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Ambil satu berkas dari arsip ZIP (metode store & deflate). */
async function ambilDariZip(
  bytes: Bytes,
  nama: string,
): Promise<Bytes | null> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Cari End Of Central Directory (signature 0x06054b50) dari belakang.
  let eocd = -1;
  const batas = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= batas; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const jumlah = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true); // offset central directory
  const dec = new TextDecoder();

  for (let i = 0; i < jumlah; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const metode = dv.getUint16(p + 10, true);
    const ukuranKompres = dv.getUint32(p + 20, true);
    const panjangNama = dv.getUint16(p + 28, true);
    const panjangExtra = dv.getUint16(p + 30, true);
    const panjangKomentar = dv.getUint16(p + 32, true);
    const lokal = dv.getUint32(p + 42, true);
    const teksNama = dec.decode(bytes.subarray(p + 46, p + 46 + panjangNama));

    if (teksNama === nama) {
      if (lokal + 30 > bytes.length || dv.getUint32(lokal, true) !== 0x04034b50) {
        return null;
      }
      const pn = dv.getUint16(lokal + 26, true);
      const pe = dv.getUint16(lokal + 28, true);
      const mulai = lokal + 30 + pn + pe;
      const mentah = bytes.subarray(mulai, mulai + ukuranKompres);
      if (metode === 0) return mentah.slice();
      if (metode === 8) return await inflateRaw(mentah);
      return null;
    }
    p += 46 + panjangNama + panjangExtra + panjangKomentar;
  }
  return null;
}

/** XML word/document.xml → teks biasa (paragraf & sel tabel jadi baris). */
function xmlKeTeks(xmlMentah: string): string {
  const xml = rumusKeTeks(xmlMentah);
  let t = xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:(?:br|cr)[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
  return t.replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Baca file .docx menjadi teks. */
export async function bacaDocx(file: File): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Browser ini belum mendukung pembacaan .docx — salin-tempel teksnya ke kotak di bawah saja.",
    );
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const xml = await ambilDariZip(buf, "word/document.xml");
  if (!xml) {
    throw new Error(
      "Bukan file .docx yang valid. Simpan ulang dari Word dengan format .docx, atau salin-tempel isinya.",
    );
  }
  return xmlKeTeks(new TextDecoder("utf-8").decode(xml));
}
/**
 * BERI NOMOR SOAL + PILIHAN A-E OTOMATIS
 * 
 * Cara pakai:
 * 1. Paste teks dari Word ke textarea
 * 2. Blok teks yang mau dinomori (misal soal 1-5)
 * 3. Klik tombol "Beri Nomor Otomatis"
 * 4. Sistem otomatis tambah "1.", "2.", dst. dan "A.", "B.", dst.
 * 
 * Logika:
 * - Deteksi paragraf yang terlihat seperti pertanyaan (panjang > 20 char, tidak mulai dengan A-E)
 * - Deteksi paragraf yang terlihat seperti pilihan (pendek, mulai dengan A-E atau hanya teks)
 * - Tambahkan nomor urut untuk pertanyaan
 * - Tambahkan A. B. C. D. E. untuk 5 baris berikutnya
 */
// ============================================================================
// FITUR PENOMORAN OTOMATIS CANGGIH (Smart Heuristic)
// ============================================================================

export interface OpsiPenomoran {
  /** Jumlah pilihan per soal pilihan ganda (maks 8). Default 5 (A-E). */
  jumlahPilihan?: number;
  /** Sisipkan baris kosong antar soal. Default true. */
  spasiAntarSoal?: boolean;
  /** Indentasi tiap pilihan. Default 3 spasi. */
  indentPilihan?: string;
}

const HURUF = ["A", "B", "C", "D", "E", "F", "G", "H"];

// "1. teks", "2) teks" — tapi BUKAN "3.5 kg" atau "20.000"
const RE_NOMOR = /^(\d{1,3})\s*(?:[.)]\s+|[.)](?=[^\d]))(.*)$/;
// "A. teks", "b) teks", "(c) teks"
const RE_HURUF = /^\(?([A-Ha-h])[.)]\s+(.*)$/;
// bullet hasil copy dari Word/markdown: "- ", "• ", "* "
const RE_BULLET = /^[-•●▪◦*]\s+/;

// berakhir ? … …. ... : atau ____
const RE_AKHIRAN_KUAT = /(\?|…+\.?|\.{3,}\.?|:|_{2,})\s*$/;
const RE_AKHIRAN_TUTUP = /(\?|…+\.?|\.{3,}\.?|_{2,})\s*$/;
// stem belum selesai: berakhir ":" atau kata sambung
const RE_STEM_TERBUKA = /(:|\b(dan|maka|diketahui|dengan|yaitu|jika|atau|sehingga))\s*$/i;
const RE_KATA_TANYA = /^(apa|berapa|tentukan|hitung|carilah|manakah|bagaimana|mengapa|kapan|di\s*mana|siapa|jelaskan|uraikan|sebutkan|tuliskan|perhatikan|diketahui|diberikan)\b/i;
const RE_KATA_SOAL = /\b(adalah|merupakan|berikut|dimaksud|diketahui|jika|maka)\b/i;

// Judul bagian
const RE_BAGIAN_PG = /^(pilihan\s+ganda)\s*:?$/i;
const RE_BAGIAN_NON_PG = /^(essay|esai|uraian|isian\s+singkat|benar\s*[-/]?\s*salah)\s*:?$/i;

const adalahBarisTabel = (t: string) => t.includes("\t") || t.startsWith("|");

/** Apakah baris ini tampak seperti kalimat soal (bukan pilihan jawaban)? */
function adalahPertanyaan(t: string): boolean {
  if (!t) return false;
  if (RE_AKHIRAN_KUAT.test(t)) return true;
  if (RE_KATA_TANYA.test(t)) return true;
  if (t.length >= 25 && RE_KATA_SOAL.test(t)) return true;
  if (t.length >= 60) return true;
  return false;
}

/**
 * BERI NOMOR SOAL + PILIHAN A-E OTOMATIS (VERSI CANGGIH)
 * Mampu menangani:
 * 1. Mencegah "3.5 cm" terbaca sebagai soal no 3.
 * 2. Menangani pertanyaan multi-baris (diakhiri ":" lalu ada tabel/rumus).
 * 3. Mengabaikan baris tabel agar tidak dianggap pilihan.
 * 4. Membedakan bagian "Pilihan Ganda" dan "Essay/Uraian".
 */
export function beriNomorDanPilihanOtomatis(
  teks: string,
  opsi: OpsiPenomoran = {}
): string {
  if (!teks.trim()) return teks;

  const jumlahPG = Math.min(opsi.jumlahPilihan ?? 5, HURUF.length);
  const spasiAntarSoal = opsi.spasiAntarSoal ?? true;
  const indent = opsi.indentPilihan ?? "   ";

  const baris = teks.split(/\r?\n/);
  const hasil: string[] = [];

  // Lewati kop soal sampai menemukan judul "PILIHAN GANDA" (jika ada)
  const idxMulai = baris.findIndex((b) => RE_BAGIAN_PG.test(b.trim()));
  for (let k = 0; k < (idxMulai >= 0 ? idxMulai :0); k++) {
    hasil.push(baris[k]);
  }

  let batasPilihan = jumlahPG; // 0 untuk bagian essay/uraian
  let nomor = 1;
  let sedangPilihan = false;
  let terisi = 0;

  const terakhirKosong = () =>
    hasil.length === 0 || hasil[hasil.length - 1].trim() === "";

  const tulisSoal = (n: number, isi: string) => {
    if (spasiAntarSoal && !terakhirKosong()) hasil.push("");
    hasil.push(`${n}. ${isi}`);
    sedangPilihan = batasPilihan > 0;
    terisi = 0;
  };

  /**
   * Stem yang terpecah beberapa baris (mis. "Nilai m dan n memenuhi:" 
   * diikuti persamaan di baris berikutnya). Mengembalikan indeks baris terakhir yang terpakai.
   */
  const sambungStem = (dari: number, stem: string): number => {
    if (batasPilihan === 0 || !RE_STEM_TERBUKA.test(stem)) return dari;
    const kandidat: string[] = [];
    let idx = dari + 1;
    let akhir = -1;
    while (idx < baris.length && kandidat.length < 3) {
      const u = baris[idx].trim().replace(RE_BULLET, "");
      if (u !== "") {
        if (
          adalahBarisTabel(u) ||
          RE_NOMOR.test(u) ||
          RE_HURUF.test(u) ||
          RE_BAGIAN_PG.test(u) ||
          RE_BAGIAN_NON_PG.test(u)
        ) {
          break;
        }
        kandidat.push(u);
        if (RE_AKHIRAN_TUTUP.test(u)) {
          akhir = kandidat.length;
          break;
        }
      }
      idx++;
    }
    if (akhir < 0) return dari;
    kandidat.slice(0, akhir).forEach((u) => hasil.push(u));
    return idx;
  };

  for (let k = Math.max(idxMulai >= 0 ? idxMulai : 0, 0); k < baris.length; k++) {
    const mentah = baris[k];
    let t = mentah.trim().replace(RE_BULLET, "");

    if (t === "") {
      if (!sedangPilihan && !terakhirKosong()) hasil.push("");
      continue;
    }

    // Judul bagian
    if (RE_BAGIAN_PG.test(t)) {
      batasPilihan = jumlahPG;
      nomor = 1;
      sedangPilihan = false;
      if (!terakhirKosong()) hasil.push("");
      hasil.push(t);
      continue;
    }
    if (RE_BAGIAN_NON_PG.test(t)) {
      batasPilihan = 0;
      nomor = 1;
      sedangPilihan = false;
      if (!terakhirKosong()) hasil.push("");
      hasil.push(t);
      continue;
    }

    // Tabel: biarkan utuh, jangan dihitung sebagai pilihan
    if (adalahBarisTabel(t)) {
      hasil.push(t);
      continue;
    }

    const m = t.match(RE_NOMOR);
    const h = t.match(RE_HURUF);

    // --- Sedang mengumpulkan pilihan ---
    if (sedangPilihan) {
      const soalBaru =
        terisi >= 2 && (m !== null || (!h && RE_AKHIRAN_KUAT.test(t)));

      if (!soalBaru) {
        hasil.push(`${indent}${HURUF[terisi]}. ${h ? h[2] : t}`);
        terisi++;
        if (terisi >= batasPilihan) sedangPilihan = false;
        continue;
      }
      sedangPilihan = false;
    }

    // --- Mencari soal ---
    if (m) {
      nomor = parseInt(m[1], 10);
      tulisSoal(nomor, m[2]);
      nomor++;
      k = sambungStem(k, m[2]);
      continue;
    }

    if (h && batasPilihan > 0) {
      hasil.push(`${indent}${h[1].toUpperCase()}. ${h[2]}`);
      continue;
    }

    if (adalahPertanyaan(t)) {
      tulisSoal(nomor, t);
      nomor++;
      k = sambungStem(k, t);
      continue;
    }

    // Fallback: jika tidak terdeteksi sebagai apa-apa, biarkan apa adanya
    hasil.push(t);
  }

  return hasil.join("\n").trimEnd();
}

/**
 * HAPUS SEMUA NOMOR DAN PILIHAN
 * Berguna untuk reset sebelum auto-numbering
 */
export function hapusNomorDanPilihan(teks: string): string {
  const barisList = teks.split(/\r?\n/);
  const hasil: string[] = [];
  
  for (const b of barisList) {
    const trim = b.trim();
    if (trim === '') {
      hasil.push(b);
      continue;
    }
    // Hapus nomor soal di awal (1., 2), dst.)
    let bersih = trim.replace(/^\d{1,3}[\.\)\-\s]+\s*/, '');
    // Hapus pilihan di awal (A., B), a), dst.)
    bersih = bersih.replace(/^[A-Ha-h][\.\)\-\s]+\s*/, '');
    hasil.push(bersih);
  }
  
  return hasil.join('\n');
}

/**
 * Baca file soal apa pun yang didukung → teks.
 * .docx dibaca otomatis; .doc/RTF lama diminta disalin-tempel.
 */
export async function bacaFileSoal(file: File): Promise<string> {
  const nama = file.name.toLowerCase();
  if (file.size > 4_000_000) {
    throw new Error("File terlalu besar (maks 4 MB).");
  }
  if (nama.endsWith(".docx")) return bacaDocx(file);
  if (nama.endsWith(".doc")) {
    throw new Error(
      "Format .doc (Word lama) belum didukung — simpan sebagai .docx, atau salin-tempel isinya ke kotak teks.",
    );
  }
  const teks = (await file.text()).replace(/\r\n?/g, "\n");
  if (teks.trimStart().startsWith("{\\rtf")) {
    throw new Error("File RTF tidak didukung — salin-tempel isinya ke kotak teks.");
  }
  return teks;
}
import * as XLSX from 'xlsx';

/**
 * Generate template Excel untuk import soal
 */
export function downloadTemplateExcel(): void {
  // Header template
  const headers = ['pertanyaan', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'kunci_jawaban', 'tipe'];
  
  // Contoh data
  const contoh = [
    [
      'Apa ibu kota Indonesia?',
      'Jakarta',
      'Bandung',
      'Surabaya',
      'Semarang',
      'Medan',
      'A',
      'pg'
    ],
    [
      'Berapa hasil 2 + 2?',
      '3',
      '4',
      '5',
      '6',
      '7',
      'B',
      'pg'
    ],
    [
      'Jelaskan pengertian fotosintesis!',
      '',
      '',
      '',
      '',
      '',
      '',
      'essay'
    ],
  ];
  
  // Buat worksheet
  const wsData = [headers, ...contoh];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Atur lebar kolom
  ws['!cols'] = [
    { wch: 50 }, // pertanyaan
    { wch: 20 }, // opsi_a
    { wch: 20 }, // opsi_b
    { wch: 20 }, // opsi_c
    { wch: 20 }, // opsi_d
    { wch: 20 }, // opsi_e
    { wch: 15 }, // kunci_jawaban
    { wch: 10 }, // tipe
  ];
  
  // Buat workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template Soal');
  
  // Download
  XLSX.writeFile(wb, 'Template_Impor_Soal.xlsx');
}

/**
 * Parse file Excel menjadi array soal
 */
export function parseExcelFile(file: File): Promise<Array<{
  pertanyaan: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  opsi_e: string;
  kunci_jawaban: string;
  tipe: string;
}>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Ambil sheet pertama
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        
        // Convert ke JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          reject(new Error('File Excel kosong atau tidak ada data.'));
          return;
        }
        
        // Baris pertama adalah header, data mulai dari baris kedua
        const rows = jsonData.slice(1) as any[][];
        
        const soal = rows
          .filter(row => row[0] && String(row[0]).trim() !== '') // Filter baris kosong
          .map(row => ({
            pertanyaan: String(row[0] || '').trim(),
            opsi_a: String(row[1] || '').trim(),
            opsi_b: String(row[2] || '').trim(),
            opsi_c: String(row[3] || '').trim(),
            opsi_d: String(row[4] || '').trim(),
            opsi_e: String(row[5] || '').trim(),
            kunci_jawaban: String(row[6] || '').trim().toUpperCase(),
            tipe: String(row[7] || 'pg').trim().toLowerCase(),
          }));
        
        resolve(soal);
      } catch (err) {
        reject(new Error('Gagal membaca file Excel. Pastikan format benar.'));
      }
    };
    
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsArrayBuffer(file);
  });
}