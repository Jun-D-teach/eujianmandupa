/**
 * ============================================================================
 * Cetak dokumen ruang ujian — jadwal pengawas, bagan tempat duduk per ruang,
 * dan daftar hadir peserta ujian.
 * ----------------------------------------------------------------------------
 * Sama seperti kartu ujian (src/lib/kartu.ts): semua HTML/CSS dibangun sebagai
 * string murni supaya hasil cetak identik di browser mana pun dan tidak
 * bergantung pada Tailwind. Kop memakai setelan kartu (logo madrasah).
 * ============================================================================
 */

import type {
  JadwalPengawasGas,
  PenempatanGas,
  RuangGas,
} from "@/lib/api";
import type { SetKartu } from "@/lib/kartu";

export type RuangDenganKursi = {
  ruang: RuangGas;
  kursi: PenempatanGas[];
};

function esc(v: string): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "Jumat, 3 Oktober 2026" dari "2026-10-03" (zona sekolah). */
export function labelTanggal(tanggal: string): string {
  const t = tanggal.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(`${t}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Label komposisi ruang: "10 X + 10 XI" (atau "otomatis" bila kosong). */
export function labelKomposisi(r: RuangGas): string {
  const entri = Object.entries(r.komposisi ?? {}).filter(([, n]) => n > 0);
  if (entri.length === 0) return "diisi otomatis dari data siswa";
  return entri
    .sort((a, b) => panjangTingkat(a[0]) - panjangTingkat(b[0]))
    .map(([t, n]) => `${n} ${t}`)
    .join(" + ");
}

/** Urut tingkat X → XI → XII (untuk tampilan yang rapi). */
function panjangTingkat(t: string): number {
  const map: Record<string, number> = { X: 1, XI: 2, XII: 3, XIII: 4 };
  return map[t.trim().toUpperCase()] ?? 99;
}

/* ------------------------------------------------------------------ */
/* Gaya & kop dokumen                                                  */
/* ------------------------------------------------------------------ */

function gayaDokumen(): string {
  return `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #14171c;
  font-family: Arial, Helvetica, sans-serif; font-size: 10pt; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 12mm; }
.kop { display: flex; align-items: center; gap: 4mm;
  border-bottom: 2.5px solid #14171c; padding-bottom: 2.5mm; }
.kop .logo { width: 17mm; height: 17mm; object-fit: contain; flex: none; }
.kop .t { flex: 1; text-align: center; line-height: 1.25; min-width: 0; }
.kop .n { font-size: 14pt; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.04em; }
.kop .a { font-size: 9pt; color: #333; }
.judul { margin: 4.5mm 0 0.5mm; text-align: center; font-size: 12.5pt;
  font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; }
.sub { text-align: center; font-size: 9.5pt; color: #333; margin-bottom: 4mm; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #14171c; padding: 1.5mm 2mm; font-size: 9.5pt;
  vertical-align: top; }
th { background: #f0f1f3; font-weight: 700; text-align: center; }
td.no { text-align: center; width: 9mm; }
td.ctr, th.ctr { text-align: center; }
tr { page-break-inside: avoid; break-inside: avoid; }
tr.kelompok td { background: #e8eaee; font-weight: 700; text-align: center; }
.halaman { page-break-after: always; break-after: page; }
.halaman:last-child { page-break-after: auto; break-after: auto; }
.ttd { margin-top: 9mm; display: flex; justify-content: space-between;
  font-size: 9.5pt; page-break-inside: avoid; }
.ttd .kotak { width: 72mm; text-align: center; }
.ttd .spasi { height: 20mm; }
.ttd .nm { font-weight: 700; }
.ttd .nip { color: #333; font-size: 9pt; }
.tanda td { height: 7.5mm; }
.catatan { margin-top: 3mm; font-size: 8.5pt; color: #444; line-height: 1.5; }
`;
}

function gayaBagan(): string {
  return `
.bagan { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3.2mm;
  margin-top: 2mm; }
.kursi { border: 1.5px solid #14171c; border-radius: 2mm; padding: 2mm;
  min-height: 17mm; page-break-inside: avoid; break-inside: avoid; }
.kursi .n { display: inline-block; background: #14171c; color: #fff;
  font-size: 8pt; font-weight: 800; padding: 0 1.8mm; border-radius: 1.6mm; }
.kursi .nm { font-size: 9.5pt; font-weight: 700; line-height: 1.2;
  margin-top: 1.4mm; word-break: break-word; }
.kursi .kl { font-size: 8.5pt; color: #444; }
.kursi.kosong { border-style: dashed; color: #999; }
.kursi.kosong .nm { color: #999; font-weight: 400; }
.jejak { margin-top: 4mm; padding: 2.5mm 3mm; border: 1px dashed #999;
  font-size: 8.5pt; color: #444; line-height: 1.5; }
`;
}

/** Kop + judul halaman — memakai setelan kartu (logo & nama madrasah). */
function kepalaHTML(set: SetKartu, judul: string, sub?: string): string {
  const logo =
    set.logo !== "" ? `<img class="logo" src="${esc(set.logo)}" alt="" />` : "";
  return `
<div class="kop">
  ${logo}
  <div class="t">
    <div class="n">${esc(set.sekolah) || "&nbsp;"}</div>
    <div class="a">${esc(set.alamat) || "&nbsp;"}</div>
  </div>
</div>
<div class="judul">${esc(judul)}</div>
${sub ? `<div class="sub">${esc(sub)}</div>` : "<div class=\"sub\">&nbsp;</div>"}`;
}

/** Blok tanda tangan Kepala Madrasah (memakai setelan kartu). */
function ttdHTML(set: SetKartu, jabatan?: string): string {
  return `
<div class="ttd">
  <div></div>
  <div class="kotak">
    <div>${esc(set.kota || "")}, ${tanggalHariIni()}</div>
    <div>${esc(jabatan ?? "Kepala Madrasah")}</div>
    <div class="spasi"></div>
    <div class="nm">${esc(set.kepala) || "&nbsp;"}</div>
    ${set.nip ? `<div class="nip">NIP. ${esc(set.nip)}</div>` : ""}
  </div>
</div>`;
}

function tanggalHariIni(): string {
  return new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function dokumenHTML(set: SetKartu, isi: string, gayaTambahan = ""): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${esc(set.sekolah)}</title>
<style>${gayaDokumen()}${gayaTambahan}</style>
</head>
<body>
${isi}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* 1. Jadwal pengawas ruang                                            */
/* ------------------------------------------------------------------ */

/** Jadwal pengawas seluruh hari/sesi — null bila belum ada jadwal. */
export function jadwalPengawasHTML(
  set: SetKartu,
  jadwal: JadwalPengawasGas[],
): string | null {
  if (!jadwal.length) return null;

  const tanggalUnik: string[] = [];
  for (const j of jadwal) {
    if (!tanggalUnik.includes(j.tanggal)) tanggalUnik.push(j.tanggal);
  }
  tanggalUnik.sort((a, b) => a.localeCompare(b));

  let no = 0;
  let isi = "";
  for (const tgl of tanggalUnik) {
    const perHari = jadwal
      .filter((j) => j.tanggal === tgl)
      .sort((a, b) => a.sesi - b.sesi || a.ruang_nama.localeCompare(b.ruang_nama, "id"));
    const hariKe = perHari[0]?.hari_ke ?? 0;
    isi += `<tr class="kelompok"><td colspan="7">Hari ke-${hariKe} — ${esc(labelTanggal(tgl))}</td></tr>`;
    for (const j of perHari) {
      no++;
      isi += `<tr>
        <td class="no">${no}</td>
        <td class="ctr">Sesi ${j.sesi}</td>
        <td class="ctr">${esc(j.jam)}</td>
        <td>${esc(j.ruang_nama)}</td>
        <td>${esc(j.nama)}</td>
        <td class="ctr">${esc(j.nip)}</td>
        <td>&nbsp;</td>
      </tr>`;
    }
  }

  const totalHari = tanggalUnik.length;
  const totalSesi = Math.max(...jadwal.map((j) => j.sesi));
  const sub = `${totalHari} hari · ${totalSesi} sesi per hari · ${jadwal.length} penugasan`;

  const isiDokumen = `
<div class="halaman">
  ${kepalaHTML(set, "Jadwal Pengawas Ruang Ujian", sub)}
  <table>
    <thead>
      <tr>
        <th class="no">No</th>
        <th style="width:16mm">Sesi</th>
        <th style="width:16mm">Jam</th>
        <th>Ruang</th>
        <th>Guru Pengawas</th>
        <th style="width:34mm">NIP</th>
        <th style="width:36mm">Tanda Tangan</th>
      </tr>
    </thead>
    <tbody>${isi}</tbody>
  </table>
  <div class="catatan">
    Setiap guru mengawasi satu ruang per sesi; penugasan digilir merata
    seluruh guru pengawas yang dipilih pada menu Pengaturan → Ruang ujian.
  </div>
  ${ttdHTML(set)}
</div>`;

  return dokumenHTML(set, isiDokumen);
}

/* ------------------------------------------------------------------ */
/* 2. Bagan tempat duduk per ruang                                     */
/* ------------------------------------------------------------------ */

/**
 * Bagan tempat duduk seluruh ruang (satu halaman per ruang).
 * Pasangan tempat duduk bergantian antar tingkat (1 siswa X dan 1 siswa XI
 * duduk bersebelahan sesuai komposisi ruang).
 */
export function baganDudukHTML(
  set: SetKartu,
  daftar: RuangDenganKursi[],
): string | null {
  if (!daftar.length) return null;

  const halaman = daftar.map(({ ruang, kursi }) => {
    const peta = new Map(kursi.map((p) => [p.kursi, p]));
    let kotak = "";
    for (let i = 1; i <= ruang.kapasitas; i++) {
      const p = peta.get(i);
      kotak += p
        ? `<div class="kursi">
            <span class="n">No. ${i}</span>
            <div class="nm">${esc(p.nama)}</div>
            <div class="kl">${esc(p.kelas)} · NISN ${esc(p.nisn)}</div>
          </div>`
        : `<div class="kursi kosong">
            <span class="n">No. ${i}</span>
            <div class="nm">— kosong —</div>
          </div>`;
    }
    const isiKursi = kursi.length;
    return `
<div class="halaman">
  ${kepalaHTML(
    set,
    "Bagan Tempat Duduk Peserta Ujian",
    `Ruang: ${ruang.nama} · kapasitas ${ruang.kapasitas} kursi (${labelKomposisi(ruang)}) · terisi ${isiKursi}`,
  )}
  <div class="bagan">${kotak}</div>
  <div class="catatan">
    <strong>Petunjuk:</strong> tempat duduk digilir antar tingkat — nomor ganjil
    dan genap bersebelahan, sehingga 1 siswa tingkat X dan 1 siswa tingkat XI
    duduk berdampingan sesuai komposisi ruang. Peserta wajib duduk pada nomor
    yang tercantum pada kartu ujian.
  </div>
  ${ttdHTML(set)}
</div>`;
  });

  return dokumenHTML(set, halaman.join("\n"), gayaBagan());
}

/* ------------------------------------------------------------------ */
/* 3. Daftar hadir peserta ujian                                       */
/* ------------------------------------------------------------------ */

/** Daftar hadir per ruang (satu halaman per ruang) — kolom tanda tangan. */
export function daftarHadirHTML(
  set: SetKartu,
  daftar: RuangDenganKursi[],
): string | null {
  if (!daftar.length) return null;

  const halaman = daftar.map(({ ruang, kursi }) => {
    const urut = [...kursi].sort((a, b) => a.kursi - b.kursi);
    const baris = urut
      .map(
        (p, i) => `<tr>
        <td class="no">${i + 1}</td>
        <td class="ctr">${esc(p.nisn)}</td>
        <td>${esc(p.nama)}</td>
        <td class="ctr">${esc(p.kelas)}</td>
        <td class="ctr">${p.kursi}</td>
        <td class="tanda">&nbsp;</td>
      </tr>`,
      )
      .join("\n");
    const kosong = urut.length === 0
      ? `<tr><td class="ctr" colspan="6" style="height:12mm;color:#777">
          Belum ada peserta — jalankan “Susun tempat duduk otomatis”.
        </td></tr>`
      : "";

    return `
<div class="halaman">
  ${kepalaHTML(
    set,
    "Daftar Hadir Peserta Ujian",
    `Ruang: ${ruang.nama} · kapasitas ${ruang.kapasitas} kursi (${labelKomposisi(ruang)}) · ${urut.length} peserta`,
  )}
  <table>
    <thead>
      <tr>
        <th class="no">No</th>
        <th style="width:30mm">NISN</th>
        <th>Nama Peserta</th>
        <th style="width:18mm">Kelas</th>
        <th style="width:16mm">No. Duduk</th>
        <th style="width:42mm">Tanda Tangan Peserta</th>
      </tr>
    </thead>
    <tbody>${baris}${kosong}</tbody>
  </table>
  <div class="ttd">
    <div class="kotak">
      <div>Pengawas Ruang</div>
      <div class="spasi"></div>
      <div class="nm">..............................</div>
    </div>
    <div class="kotak">
      <div>${esc(set.kota || "")}, ${tanggalHariIni()}</div>
      <div>Kepala Madrasah</div>
      <div class="spasi"></div>
      <div class="nm">${esc(set.kepala) || "&nbsp;"}</div>
      ${set.nip ? `<div class="nip">NIP. ${esc(set.nip)}</div>` : ""}
    </div>
  </div>
</div>`;
  });

  return dokumenHTML(set, halaman.join("\n"));
}

/* ------------------------------------------------------------------ */
/* Pratinjau di layar (dialog)                                         */
/* ------------------------------------------------------------------ */

/** Kotak pratinjau bagan — ringkas, dipakai sebelum mencetak. */
export function ringkasKursi(kursi: PenempatanGas[]): PenempatanGas[] {
  return [...kursi].sort((a, b) => a.kursi - b.kursi);
}

/* ------------------------------------------------------------------ */
/* Cetak lewat iframe tersembunyi                                      */
/* ------------------------------------------------------------------ */

/**
 * Cetak dokumen HTML lengkap lewat iframe tersembunyi (aman dari popup
 * blocker — dipicu klik pengguna), sama seperti cetakKartu.
 */
export function cetakDokumen(
  html: string | null,
  judul: string,
  onGagal?: (pesan: string) => void,
): void {
  if (!html) {
    onGagal?.("Tidak ada data untuk dicetak.");
    return;
  }
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", judul);
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
  doc.write(html);
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
    window.setTimeout(cetak, 3000);
  }

  const bersihkan = () => frame.remove();
  win.onafterprint = bersihkan;
  window.setTimeout(bersihkan, 5 * 60_000);
}
