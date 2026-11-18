const TANDA_INDENTASI = "\u2060";

function escapeHTML(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineHTML(teks: string): string {
  return teks
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>")
    // KIMIA/MATEMATIKA: ~x~ = indeks bawah (a~2~ → a₂),
    // ^x^ = indeks atas (x^2^ → x²), => = panah reaksi
    .replace(/~([^~\n]+)~/g, "<sub>$1</sub>")
    .replace(/\^([^^\n]+)\^/g, "<sup>$1</sup>")
    .replace(/=&gt;/g, "→");
}

const RE_ARAB = /\p{Script=Arabic}/u;
const RE_SEGMENT_ARAB =
  /[\p{Script_Extensions=Arabic}]+(?:\s+[\p{Script_Extensions=Arabic}]+)*/gu;
const RATA: Record<string, string> = {
  kiri: "left",
  tengah: "center",
  kanan: "right",
};

function bungkusSegmenArab(teks: string): string {
  return teks.replace(
    RE_SEGMENT_ARAB,
    '<bdi class="arab-segmen" dir="rtl">$&</bdi>',
  );
}

function lebihBanyakArab(teks: string): boolean {
  const arab = teks.match(/\p{Script=Arabic}/gu)?.length ?? 0;
  const latin = teks.match(/[A-Za-z]/g)?.length ?? 0;
  return arab >= 4 && arab >= latin * 0.5;
}

/** Ubah tab awal baris menjadi penanda yang aman dari trim di backend. */
export function siapkanPertanyaanUntukSimpan(teks: string): string {
  return teks.replace(/(^|\n)\t+/g, `$1${TANDA_INDENTASI}`).trim();
}

/** Kembalikan penanda indentasi ke tab saat guru mengedit soal kembali. */
export function pertanyaanUntukEdit(teks: string): string {
  return teks.replace(new RegExp(TANDA_INDENTASI, "g"), "\t");
}

/** Render teks soal sebagai paragraf aman, dengan arah Arab yang sesuai. */
export function soalHTML(teks: string): string {
  if (!teks) return "";

  let alignment: string | null = null;
  const paragraphs = teks.replace(/\r\n?/g, "\n").split(/\n+/);
  const html = paragraphs
    .map((rawParagraph) => {
      let paragraphAlignment = alignment;
      const text = rawParagraph.replace(
        /\[(\/)?(kanan|tengah|kiri)\]/g,
        (_match, tutup: string | undefined, mode: string) => {
          if (tutup) {
            alignment = null;
          } else {
            alignment = mode;
            paragraphAlignment = mode;
          }
          return "";
        },
      );
      const indent =
        /^(?:\t+|\u2060)/.test(text);
      const plain = text.replace(/^(?:\t+|\u2060)/, "");
      if (!plain.trim()) return "";

      const arab = lebihBanyakArab(plain);
      const align = paragraphAlignment
        ? RATA[paragraphAlignment]
        : arab
          ? "right"
          : "justify";
      const classes = [
        "soal-paragraf",
        indent ? "soal-paragraf-indent" : "",
        arab ? "soal-paragraf-arab" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const isi = bungkusSegmenArab(inlineHTML(escapeHTML(plain)));
      return `<p class="${classes}" style="text-align:${align}">${isi}</p>`;
    })
    .filter(Boolean)
    .join("");

  return `<div class="soal-container">${html}</div>`;
}

/** Render teks pilihan secara aman dan mempertahankan campuran Arab-Latin. */
export function opsiHTML(teks: string): string {
  if (!teks) return "";
  const aman = bungkusSegmenArab(inlineHTML(escapeHTML(teks)));
  return RE_ARAB.test(teks)
    ? `<span class="opsi-teks-arab">${aman}</span>`
    : aman;
}

export function adaFormat(teks: string): boolean {
  return /\n|\t|\u2060|~~|\*\*|\*|__|\[(?:\/)?(?:tengah|kanan|kiri)\]/.test(teks);
}
