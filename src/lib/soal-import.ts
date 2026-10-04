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

/** Keyword kunci di akhir baris: "Kunci: B", "Jawaban : (C)". */
const RE_KUNCI_EKOR =
  /(?:^|\s)(?:kunci(?:\s*(?:jawaban|jawab))?|jawab(?:an)?)\s*[:=-]?\s*\(?\s*([A-E])\)?\s*$/i;

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

/** Ketat: huruf harus diawali spasi/awal baris — dipakai MENENTUKAN apakah
 *  baris ini baris pilihan (mencegah "nilai A. adalah" dianggap pilihan). */
const RE_TANDA_KETAT = /(^|\s)([A-Ea-e])[.)\-–—:]\s*/g;
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
      ketat.length > 0 && b.slice(0, ketat[0].pos).trim() === "";
    const pakai = ketat.length >= 2 || (ketat.length === 1 && diAwal);
    if (pakai) {
      const penanda = cariPenanda(b, true);
      const prefix = b.slice(0, penanda[0].pos).trim();
      if (prefix) tambah(prefix);
      for (let i = 0; i < penanda.length; i++) {
        const p = penanda[i];
        const akhir = i + 1 < penanda.length ? penanda[i + 1].pos : b.length;
        const idx = DAFTAR_HURUF.indexOf(p.huruf);
        if (idx < 0) continue;
        const teksBersih = b.slice(p.isi, akhir).trim();
        const teksMentah = b.slice(p.pos, akhir).trim();
        slot[idx] = slot[idx] ? `${slot[idx]} ${teksBersih}` : teksBersih;
        mentah[idx] = mentah[idx] ? `${mentah[idx]} ${teksMentah}` : teksMentah;
        opsiTerakhir = idx;
      }
      continue;
    }
    // 4) Baris biasa — lanjutan pertanyaan / pilihan terakhir.
    tambah(b);
  }

  let pertanyaan = tanya.join(" ").replace(/\s+/g, " ").trim();

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

/** Pecah teks (dokumen Word hasil salin-tempel / .docx terurai) jadi daftar soal. */
export function parseTeksSoal(teks: string): BarisSoalOtomat[] {
  const garis = normalisasi(teks).split("\n");
  if (garis.every((g) => g.trim() === "")) return [];

  const { isi, peta, urut } = pisahKunciAkhir(garis);

  // Pecah menjadi blok per nomor soal.
  const blok: Blok[] = [];
  for (const line of isi) {
    const m = line.match(RE_SOAL) ?? line.match(RE_SOAL_LABEL);
    if (m) {
      blok.push({ nomor: m[1] ?? "", baris: [m[2] ?? ""] });
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
function xmlKeTeks(xml: string): string {
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
  return t.replace(/\n{3,}/g, "\n\n").trim();
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
