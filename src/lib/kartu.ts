/**
 * ============================================================================
 * Kartu ujian ukuran KTP (85,6 × 54 mm) — kop madrasah, logo, dan tanda
 * tangan Kepala Madrasah yang di-upload lewat menu Pengaturan (admin).
 * Semua HTML/CSS dibangun sebagai string murni supaya hasil cetak identik
 * di browser mana pun dan tidak bergantung pada Tailwind.
 * ============================================================================
 */

export type SetKartu = {
  /** Kop baris 1 — nama madrasah. */
  sekolah: string;
  /** Kop baris 2 — alamat / kontak. */
  alamat: string;
  /** Kota pada baris "…, tanggal" tanda tangan. */
  kota: string;
  /** Nama Kepala Madrasah (pengguna tanda tangan). */
  kepala: string;
  /** NIP Kepala Madrasah. */
  nip: string;
  /** Data URL hasil upload (logo madrasah). */
  logo: string;
  /** Data URL hasil upload (tanda tangan kepala madrasah). */
  ttd: string;
};

export type IsiKartu = {
  nisn: string;
  nama: string;
  kelas: string;
  judul: string;
  /** Label jadwal jadi, mis. "Jumat, 12 Oktober 2026 pukul 08.00". */
  jadwal: string;
  durasi: number;
};

export type CetakMode = "A4" | "KTP";

/** Ukuran kartu KTP/CR80 dalam milimeter. */
export const UKURAN_KARTU = { lebar: 85.6, tinggi: 54 } as const;

/** Setelan awal (dipakai saat belum pernah diatur / gagal memuat). */
export const SET_KOSONG: SetKartu = {
  sekolah: "MAN 2 PALEMBANG",
  alamat: "",
  kota: "Palembang",
  kepala: "",
  nip: "",
  logo: "",
  ttd: "",
};

/* ------------------------------------------------------------------ */
/* Gambar upload → data URL (dikecilkan dulu agar muat di database)    */
/* ------------------------------------------------------------------ */

/**
 * Baca file gambar, skalakan ke lebar maksimal, lalu kembalikan data URL JPEG.
 * Memastikan ukuran hasil jauh di bawah batas kolom database.
 */
export function gambarKeDataUrl(file: File, lebarMaks = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`"${file.name}" bukan file gambar.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error("Gambar tidak valid atau rusak — coba file lain."));
      img.onload = () => {
        if (!img.width || !img.height) {
          reject(new Error("Ukuran gambar tidak terbaca."));
          return;
        }
        const skala = Math.min(1, lebarMaks / img.width);
        const lebar = Math.max(1, Math.round(img.width * skala));
        const tinggi = Math.max(1, Math.round(img.height * skala));
        const canvas = document.createElement("canvas");
        canvas.width = lebar;
        canvas.height = tinggi;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas tidak didukung browser ini."));
          return;
        }
        // Latar putih supaya JPEG tidak menghasilkan kotak hitam.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, lebar, tinggi);
        ctx.drawImage(img, 0, 0, lebar, tinggi);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch {
          reject(new Error("Gagal mengubah gambar."));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Sasaran ujian (cerminan logika server)                              */
/* ------------------------------------------------------------------ */

function tingkatDari(kelas: string): string {
  const k = kelas.trim().toUpperCase();
  return k.includes(".") ? k.split(".")[0].trim() : k;
}

/** Apakah siswa berkelas $kelas termasuk sasaran ujian ini? */
export function cocokSasaran(
  u: { sasar_jenis?: string; sasar_nilai?: string },
  kelas: string,
): boolean {
  const jenis = (u.sasar_jenis ?? "").toLowerCase();
  const nilai = (u.sasar_nilai ?? "").trim();
  if (!jenis || !nilai) return true;
  const k = kelas.trim().toUpperCase();
  if (!k) return false;
  if (jenis === "tingkat") return tingkatDari(k) === nilai.toUpperCase();
  const daftar = nilai
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return daftar.includes(k);
}

/* ------------------------------------------------------------------ */
/* Markup & gaya kartu                                                 */
/* ------------------------------------------------------------------ */

function esc(v: string): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Gaya CSS kartu — HANYA selektor .halaman/.kartu (tanpa aturan global
 * html/body/@page) supaya aman dipakai untuk pratinjau di dalam dialog.
 */
export function gayaKartu(): string {
  return `
.halaman { display: flex; flex-wrap: wrap; gap: 4mm; }
.kartu {
  width: 85.6mm; height: 54mm; position: relative; overflow: hidden;
  display: flex; flex-direction: column; background: #fff;
  color: #14171c; font-family: Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  border: 0.3mm solid #14171c; border-radius: 2.5mm;
  page-break-inside: avoid; break-inside: avoid;
}
.kop { display: flex; align-items: center; gap: 1.8mm;
  padding: 1.6mm 2.5mm; border-bottom: 0.35mm solid #14171c; }
.kop .logo { width: 9.5mm; height: 9.5mm; object-fit: contain; flex: none; }
.kop-teks { flex: 1; min-width: 0; text-align: center; line-height: 1.2; }
.kop-nama { font-size: 8pt; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.kop-alamat { font-size: 5.2pt; color: #333; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.kop-judul { background: #14171c; color: #fff; text-align: center;
  font-size: 6.6pt; font-weight: 800; letter-spacing: 0.35em;
  text-indent: 0.35em; padding: 0.9mm 0 0.7mm; }
.isi { flex: 1; min-height: 0; display: flex; flex-direction: column;
  gap: 1.2mm; padding: 1.6mm 2.5mm 1.4mm; }
table.data { border-collapse: collapse; width: 100%; font-size: 6pt;
  line-height: 1.45; }
table.data td { padding: 0.15mm 0; vertical-align: top; }
table.data td.lbl { width: 13mm; color: #444; }
table.data td.dot { width: 1.6mm; }
table.data td.val { font-weight: 600; }
.bawah { flex: 1; display: flex; justify-content: space-between;
  align-items: flex-end; gap: 1.5mm; }
table.ujian { width: auto; max-width: 45mm; table-layout: fixed; }
.ttd { flex: none; width: 34mm; text-align: center; font-size: 5.2pt;
  line-height: 1.3; }
.ttd-jabatan { font-weight: 700; }
.ttd-foto { height: 9mm; display: flex; align-items: center;
  justify-content: center; }
.ttd-foto img { max-height: 9mm; max-width: 30mm; object-fit: contain; }
.ttd-nama { font-weight: 700; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.ttd-nip { color: #333; }
`;
}

/** Satu kartu (satu siswa) berukuran KTP. */
export function kartuHTML(set: SetKartu, k: IsiKartu): string {
  const logo =
    set.logo !== ""
      ? `<img class="logo" src="${esc(set.logo)}" alt="" />`
      : "";
  const ttd =
    set.ttd !== ""
      ? `<img src="${esc(set.ttd)}" alt="" />`
      : "";
  const baris = (label: string, nilai: string): string =>
    `<tr><td class="lbl">${label}</td><td class="dot">:</td>` +
    `<td class="val">${esc(nilai) || "&nbsp;"}</td></tr>`;

  return `
<div class="kartu">
  <div class="kop">
    ${logo}
    <div class="kop-teks">
      <div class="kop-nama">${esc(set.sekolah) || "&nbsp;"}</div>
      <div class="kop-alamat">${esc(set.alamat) || "&nbsp;"}</div>
    </div>
  </div>
  <div class="kop-judul">KARTU UJIAN</div>
  <div class="isi">
    <table class="data">
      ${baris("NISN", k.nisn)}
      ${baris("Nama", k.nama)}
      ${baris("Kelas", k.kelas)}
    </table>
    <div class="bawah">
      <table class="data ujian">
        ${baris("Ujian", k.judul)}
        ${baris("Jadwal", k.jadwal)}
        ${baris("Durasi", `${k.durasi} menit`)}
      </table>
      <div class="ttd">
        <div class="ttd-kota">${esc(set.kota)}, ${tanggalPanjang()}</div>
        <div class="ttd-jabatan">Kepala Madrasah</div>
        <div class="ttd-foto">${ttd}</div>
        <div class="ttd-nama">${esc(set.kepala) || "&nbsp;"}</div>
        <div class="ttd-nip">${set.nip ? `NIP. ${esc(set.nip)}` : "&nbsp;"}</div>
      </div>
    </div>
  </div>
</div>`;
}

/** "3 Oktober 2026" — tanggal tanda tangan mengikuti waktu cetak. */
function tanggalPanjang(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Dokumen HTML lengkap siap dicetak. */
export function halamanHTML(
  set: SetKartu,
  kartu: IsiKartu[],
  mode: CetakMode,
): string {
  const kartuHTMLs = kartu.map((k) => kartuHTML(set, k)).join("\n");
  // A4: 2 kolom × 5 baris kartu (siap potong). KTP: 1 kartu per halaman.
  const modeCss =
    mode === "KTP"
      ? `@page { size: 85.6mm 54mm; margin: 0; }
.halaman { display: block; gap: 0; }
.kartu { border: none; border-radius: 0; page-break-after: always;
  break-after: page; }
.kartu:last-child { page-break-after: auto; break-after: auto; }`
      : `@page { size: A4; margin: 4mm; }`;

  const dasar = `* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Kartu Ujian — ${esc(set.sekolah)}</title>
<style>${dasar}${gayaKartu()}${modeCss}</style>
</head>
<body>
<div class="halaman">
${kartuHTMLs}
</div>
</body>
</html>`;
}

/**
 * Cetak lewat iframe tersembunyi (aman dari popup blocker — dipicu klik
 * pengguna). Jendela cetak browser muncul setelah konten siap.
 */
export function cetakKartu(
  set: SetKartu,
  kartu: IsiKartu[],
  mode: CetakMode,
  onGagal?: (pesan: string) => void,
): void {
  if (kartu.length === 0) {
    onGagal?.("Tidak ada kartu untuk dicetak.");
    return;
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Cetak kartu ujian");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;" +
    "opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    onGagal?.("Browser tidak mendukung pratinjau cetak.");
    return;
  }

  doc.open();
  doc.write(halamanHTML(set, kartu, mode));
  doc.close();

  let mulaiCetak = false;
  const cetak = () => {
    if (mulaiCetak) return;
    mulaiCetak = true;
    try {
      win.focus();
      win.print();
    } catch (err) {
      onGagal?.(
        err instanceof Error
          ? `Gagal membuka jendela cetak: ${err.message}`
          : "Gagal membuka jendela cetak.",
      );
    }
  };

  if (doc.readyState === "complete") {
    window.setTimeout(cetak, 150);
  } else {
    frame.addEventListener("load", () => window.setTimeout(cetak, 150));
    // Jaring pengaman bila event load tidak datang.
    window.setTimeout(cetak, 3000);
  }

  const bersihkan = () => frame.remove();
  win.onafterprint = bersihkan;
  window.setTimeout(bersihkan, 5 * 60_000);
}
