/**
 * ============================================================================
 * UjianAman — rumus Word (Insert → Equation / OMML) → teks linear Unicode.
 * Berdiri sendiri (tanpa pustaka, tanpa jaringan): dipakai saat impor .docx
 * oleh soal-import.ts → xmlKeTeks(). Murni teks, aman untuk mode offline.
 * ============================================================================
 */

/* ------------------------------------------------------------------ */
/* Rumus Word (Equation / OMML) → teks linear Unicode                  */
/* ------------------------------------------------------------------ */
/*
 * Rumus yang diketik dengan Insert → Equation disimpan Word sebagai tag
 * <m:f> (pecahan), <m:sSup> (pangkat), <m:rad> (akar), dst. Tanpa
 * penanganan khusus tag itu dibuang dan strukturnya hilang ("½" → "12").
 * Di sini rumus diubah jadi TEKS BIASA yang terbaca: (x+1)/(x−2), x², √(x+1),
 * ∑₁ⁿ … — murni teks, jadi disimpan & ditampilkan persis seperti soal biasa
 * (tanpa pustaka, tanpa jaringan → aman untuk mode offline siswa).
 */

const NS_M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Hanya karakter yang glyph-nya ada di hampir semua HP (angka & tanda). */
const NAIK: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ",
};
const TURUN: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
};

function petakan(s: string, peta: Record<string, string>): string | null {
  if (!s) return "";
  let out = "";
  for (const c of s) {
    const m = peta[c];
    if (!m) return null;
    out += m;
  }
  return out;
}

/** Kurung seimbang yang membungkus seluruh teks: "(a+b)". */
function sudahDikurung(s: string): boolean {
  if (!s.startsWith("(") || !s.endsWith(")")) return false;
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") d--;
    if (d === 0 && i < s.length - 1) return false;
  }
  return d === 0;
}

/** Bungkus dengan kurung bila lebih dari satu "suku" sederhana. */
function bungkus(s: string): string {
  if (/^[\p{L}\p{N}.,]+$/u.test(s) || sudahDikurung(s)) return s;
  return `(${s})`;
}

function naik(s: string): string {
  if (!s) return "";
  return petakan(s, NAIK) ?? "^" + bungkus(s);
}
function turun(s: string): string {
  if (!s) return "";
  return petakan(s, TURUN) ?? "_" + bungkus(s);
}

function anakM(el: Element, nama: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === nama && c.namespaceURI === NS_M) return c;
  }
  return null;
}

/** Nilai m:val pada elemen properti (mis. dPr/begChr); `bawaan` bila tak ada. */
function nilaiProp(el: Element, prop: string, nama: string, bawaan: string): string {
  const p = anakM(el, prop);
  const n = p ? anakM(p, nama) : null;
  if (!n) return bawaan;
  return n.hasAttributeNS(NS_M, "val") ? (n.getAttributeNS(NS_M, "val") ?? "") : bawaan;
}

function benar(v: string): boolean {
  return v === "1" || v === "on" || v === "true";
}

function isiRumus(el: Element): string {
  let out = "";
  for (const c of Array.from(el.children)) {
    if (c.namespaceURI === NS_M && c.localName.endsWith("Pr")) continue;
    out += rumus(c);
  }
  return out;
}

function bagian(el: Element, nama: string): string {
  const a = anakM(el, nama);
  return a ? rumus(a) : "";
}

function rumus(el: Element): string {
  switch (el.localName) {
    case "t":
      return el.textContent ?? "";
    case "r": {
      let s = "";
      for (const c of Array.from(el.children)) {
        if (c.localName === "t") s += c.textContent ?? "";
      }
      return s;
    }
    case "f": {
      const n = bagian(el, "num");
      const d = bagian(el, "den");
      const tipe = nilaiProp(el, "fPr", "type", "bar");
      if (tipe === "lin") return `${n}/${d}`;
      if (tipe === "noBar") return `(${n}; ${d})`;
      return `${bungkus(n)}/${bungkus(d)}`;
    }
    case "sSup":
      return bagian(el, "e") + naik(bagian(el, "sup"));
    case "sSub":
      return bagian(el, "e") + turun(bagian(el, "sub"));
    case "sSubSup":
      return bagian(el, "e") + turun(bagian(el, "sub")) + naik(bagian(el, "sup"));
    case "sPre":
      return turun(bagian(el, "sub")) + naik(bagian(el, "sup")) + bagian(el, "e");
    case "rad": {
      const e = bungkus(bagian(el, "e"));
      const deg = bagian(el, "deg").trim();
      if (!deg || benar(nilaiProp(el, "radPr", "degHide", "0"))) return "√" + e;
      if (deg === "3") return "∛" + e;
      if (deg === "4") return "∜" + e;
      return naik(deg) + "√" + e;
    }
    case "d": {
      const beg = nilaiProp(el, "dPr", "begChr", "(");
      const end = nilaiProp(el, "dPr", "endChr", ")");
      const sep = nilaiProp(el, "dPr", "sepChr", "|");
      const bagianE = Array.from(el.children)
        .filter((c) => c.namespaceURI === NS_M && c.localName === "e")
        .map(rumus);
      return beg + bagianE.join(sep) + end;
    }
    case "nary": {
      const chr = nilaiProp(el, "naryPr", "chr", "∫");
      const sub = benar(nilaiProp(el, "naryPr", "subHide", "0")) ? "" : bagian(el, "sub");
      const sup = benar(nilaiProp(el, "naryPr", "supHide", "0")) ? "" : bagian(el, "sup");
      return `${chr}${turun(sub)}${naik(sup)} ${bagian(el, "e")}`.trim();
    }
    case "func": {
      const nama = bagian(el, "fName");
      const e = bagian(el, "e");
      return e.startsWith("(") ? nama + e : `${nama} ${e}`;
    }
    case "limLow":
      return bagian(el, "e") + turun(bagian(el, "lim"));
    case "limUpp":
      return bagian(el, "e") + naik(bagian(el, "lim"));
    case "acc":
      return bagian(el, "e") + nilaiProp(el, "accPr", "chr", "̂");
    case "bar": {
      const bawah = nilaiProp(el, "barPr", "pos", "top") === "bot";
      const tanda = bawah ? "̲" : "̅";
      return Array.from(bagian(el, "e")).map((c) => c + tanda).join("");
    }
    case "eqArr":
      return Array.from(el.children)
        .filter((c) => c.namespaceURI === NS_M && c.localName === "e")
        .map(rumus)
        .join(" ; ");
    case "m": {
      const baris = Array.from(el.children)
        .filter((c) => c.namespaceURI === NS_M && c.localName === "mr")
        .map((mr) =>
          Array.from(mr.children)
            .filter((c) => c.namespaceURI === NS_M && c.localName === "e")
            .map(rumus)
            .join(", "),
        );
      return `[${baris.join("; ")}]`;
    }
    default:
      return isiRumus(el);
  }
}

function escapeXml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Ganti tiap blok rumus <m:oMath>/<m:oMathPara> dengan teks linearnya.
 * Bila ada yang gagal dibaca, blok itu dibiarkan (jatuh ke perilaku lama:
 * tag dibuang) — impor tidak pernah gagal gara-gara rumus.
 */
export function rumusKeTeks(xml: string): string {
  if (typeof DOMParser === "undefined" || !/<m:oMath[\s>]/.test(xml)) return xml;
  return xml.replace(
    /<m:oMathPara>[\s\S]*?<\/m:oMathPara>|<m:oMath>[\s\S]*?<\/m:oMath>/g,
    (blok) => {
      try {
        // Properti font (w:rPr) tidak berisi teks rumus — buang agar parser
        // tidak tersangkut atribut namespace tambahan (w14, dll).
        const bersih = blok
          .replace(/<w:rPr\s*\/>/g, "")
          .replace(/<w:rPr>[\s\S]*?<\/w:rPr>/g, "");
        const doc = new DOMParser().parseFromString(
          `<r xmlns:m="${NS_M}" xmlns:w="${NS_W}">${bersih}</r>`,
          "application/xml",
        );
        if (doc.getElementsByTagName("parsererror").length > 0) return blok;
        const teks = isiRumus(doc.documentElement).replace(/\s+/g, " ").trim();
        return teks ? escapeXml(` ${teks} `) : blok;
      } catch {
        return blok;
      }
    },
  );
}
