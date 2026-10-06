/**
 * ============================================================================
 * UjianAman — perender format penulisan soal.
 * ----------------------------------------------------------------------------
 * Guru menulis soal dengan penanda ringkas di kotak tulis (atau memakai
 * toolbar tebal/miring/numbering/rata). Teks disimpan di database SEBAGAI
 * TEKS BIASA (kolom `pertanyaan` / `opsi_*` tetap TEXT), lalu diubah jadi
 * HTML aman saat ditampilkan ke siswa & daftar soal guru.
 *
 * Penanda yang didukung:
 *   **teks**     → tebal            __teks__  → garis bawah
 *   *teks*       → miring           _teks_    → miring
 *   baris baru   → paragraf baru (rata kiri-kanan / justify)
 *   [tengah]…[/tengah] / [kanan]…[/kanan] / [kiri]…[/kiri]
 *                → rata paragraf untuk blok teks (boleh lintas baris)
 *
 * KEAMANAN: seluruh teks guru di-escape dulu (`<`, `>`, `&`, `"`) SEBELUM
 * tag buatan kita disisipkan, jadi tidak ada HTML mentah yang tembus.
 */

/** Escape teks mentah — satu-satunya gerbang masuk ke HTML. */
function escapeHTML(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format inline satu blok: __bawah__, **tebal**, *miring*, _miring_. */
function inlineHTML(teks: string): string {
  return teks
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
}

const RATA: Record<string, string> = {
  kiri: "left",
  tengah: "center",
  kanan: "right",
};

/**
 * Teks pertanyaan (boleh multi-baris + penanda) → HTML blok yang aman.
 * Tiap baris jadi satu paragraf rata kiri-kanan (justify), sehingga paragraf
 * yang diketik guru tampil persis seperti yang ditulis.
 */
export function soalHTML(teks: string): string {
  if (!teks) return "";
  let s = escapeHTML(teks.replace(/\r\n?/g, "\n"));

  // Penanda rata paragraf — diproses dulu karena boleh lintas baris.
  s = s.replace(
    /\[(tengah|kanan|kiri)\]([\s\S]*?)\[\/\1\]/g,
    (_m, nama: string, isi: string) =>
      `<span style="display:block;text-align:${RATA[nama] ?? "center"}">${isi.replace(/\n/g, "<br/>")}</span>`,
  );

  return s
    .split("\n")
    .filter((b) => b.trim() !== "")
    .map((b) => `<p style="margin:0.3em 0;text-align:justify">${inlineHTML(b)}</p>`)
    .join("");
}

/**
 * Teks pilihan jawaban → HTML inline (tanpa blok `<p>`) — aman dipakai di
 * dalam `<span>` tombol jawaban maupun `<li>` daftar soal.
 */
export function opsiHTML(teks: string): string {
  if (!teks) return "";
  return inlineHTML(escapeHTML(teks.replace(/\s+/g, " ")));
}

/** Perlu ditampilkan lewat perender (ada penanda format / multi-baris)? */
export function adaFormat(teks: string): boolean {
  return teks.includes("\n") || /[*_~]|\[(?:tengah|kanan|kiri)\]/.test(teks);
}
