/**
 * ============================================================================
 * Jadwal harian — logika tanggal/sesi + pembangun dokumen cetak (A4 lanskap).
 * ----------------------------------------------------------------------------
 * Satu tanggal memakai N sesi (N = jumlah hari kerja pada kalender):
 *   sesi ke-k = hari kerja ke-k (Senin=1 … Sabtu=7 sesuai `hari_kerja`).
 * Selain hari kerja / tanggal libur tidak ada jadwal.
 * Baris digilir antar tingkat: baris 1 = siswa pertama tiap tingkat (A, B, C…).
 * ============================================================================
 */

import type { BarisJadwalHarianGas } from "@/lib/api";

const HARI_ID = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Parse "YYYY-MM-DD" → Date lokal (null bila tidak valid). */
function parseISO(tanggal: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const tgl = new Date(y, mo - 1, d);
  if (
    tgl.getFullYear() !== y ||
    tgl.getMonth() !== mo - 1 ||
    tgl.getDate() !== d
  )
    return null;
  return tgl;
}

/** "2025-11-03" → "Senin, 3 November 2025". */
export function labelTanggal(tanggal: string): string {
  const d = parseISO(tanggal);
  if (!d) return tanggal;
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/** Nomor hari Indonesia (1=Senin … 7=Minggu) dari "YYYY-MM-DD"; null bila invalid. */
function nomorHari(tanggal: string): number | null {
  const d = parseISO(tanggal);
  if (!d) return null;
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** "7:30" / "07.30" / "0730" → "07.30"; "" bila tidak valid. */
export function normalisasiJam(v: string): string {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(v.trim());
  if (!m) return "";
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return "";
  return `${String(h).padStart(2, "0")}.${String(mi).padStart(2, "0")}`;
}

/**
 * Jam mulai otomatis per sesi: mulai 07.30, jeda 150 menit antar sesi
 * (07.30, 10.00, 12.30, 15.00, 17.30, …). Di-edit bebas di UI.
 */
export function jamMulaiOtomatis(total: number, mulaiMenit = 7 * 60 + 30): string[] {
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const menit = (mulaiMenit + i * 150) % (24 * 60);
    out.push(
      `${String(Math.floor(menit / 60)).padStart(2, "0")}.${String(menit % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

/** Hari sejak epoch (lokal) — offset giliran yang stabil per tanggal. */
function offsetTanggal(tanggal: string): number {
  const d = parseISO(tanggal);
  if (!d) return 0;
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
}

/**
 * Penugasan pengawas otomatis per sesi satu tanggal: daftar nama digilir
 * merata (perSesi nama per sesi, berputar bila guru kurang dari kebutuhan),
 * dan urutan digeser per tanggal — hari berbeda mendapat urutan berbeda,
 * tanggal sama selalu menghasilkan hasil yang sama.
 * Mengembalikan array sepanjang daftarSesi (berurutan sesuai daftarSesi).
 */
export function pengawasOtomatis(
  tanggal: string,
  namaGuru: readonly string[],
  daftarSesi: readonly number[],
  perSesi = 1,
): string[][] {
  const hasil: string[][] = daftarSesi.map(() => []);
  const unik = Array.from(
    new Set(namaGuru.map((n) => n.trim()).filter(Boolean)),
  );
  if (!unik.length || !daftarSesi.length) return hasil;
  const p = Math.max(1, Math.floor(perSesi));
  const geser = offsetTanggal(tanggal) % unik.length;
  const urut = [...unik.slice(geser), ...unik.slice(0, geser)];
  daftarSesi.forEach((_s, i) => {
    const dipakai = new Set<string>();
    for (let k = 0; k < p; k++) {
      const nama = urut[(i * p + k) % urut.length];
      if (!dipakai.has(nama)) {
        dipakai.add(nama);
        hasil[i].push(nama);
      }
    }
  });
  return hasil;
}

/**
 * Apakah tanggal ini punya jadwal? Sesi = urutan hari kerja pada kalender.
 * Nomor hari Indonesia: 1=Senin … 7=Minggu.
 * Contoh hariKerja [1..5] (Senin–Jumat): Senin → sesi [1, 6], Kamis → [4, 9];
 * Sabtu/Minggu & tanggal libur → [].
 */
export function hitungSesiTanggal(
  tanggal: string,
  hariKerja: number[],
  libur: string[],
): { libur: boolean; alasan: string | null; sesi: number[] } {
  const nh = nomorHari(tanggal);
  if (nh === null) return { libur: true, alasan: "Tanggal tidak valid.", sesi: [] };
  if (libur.includes(tanggal))
    return { libur: true, alasan: "Tanggal ini libur (kalender).", sesi: [] };
  const unik = Array.from(new Set(hariKerja)).sort((a, b) => a - b);
  if (!unik.includes(nh))
    return {
      libur: true,
      alasan: "Bukan hari kerja pada kalender — tidak ada jadwal.",
      sesi: [],
    };
  const posisi = unik.indexOf(nh);
  return {
    libur: false,
    alasan: null,
    sesi: [posisi + 1, posisi + 1 + unik.length],
  };
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type OpsiCetakJadwalHarian = {
  sekolah: string;
  alamat: string;
  kota: string;
  /** Jumlah kolom sesi global (mis. 3 → kolom Sesi 1–3). */
  totalSesi: number;
  /** Jam mulai tiap sesi global ("07.30"). */
  jamSesi: string[];
  /** Mapel/pengawas manual per sesi global (bila tersimpan). */
  mapelSesi: string[];
  pengawasSesi: string[][];
};

/**
 * Dokumen A4 lanskap: kop + tabel peserta per baris (sesi) dengan kolom
 * mapel, pengawas & tanda tangan. Kolom sesi di luar hari ini dicetak abu tipis.
 */
export function jadwalHarianHTML(
  baris: BarisJadwalHarianGas[],
  opsi: OpsiCetakJadwalHarian,
): string {
  const infoHari = baris[0] ? esc(labelTanggal(baris[0].tanggal)) : "";

  const kolomJudul = Array.from({ length: opsi.totalSesi }, (_, i) => {
    const s = i + 1;
    const jam = opsi.jamSesi[i] ? ` · ${esc(opsi.jamSesi[i])}` : "";
    return `<th class="grup" colspan="2">SESI ${s}${jam}</th>`;
  }).join("");

  const kolomIsi = Array.from({ length: opsi.totalSesi }, (_, i) => {
    const s = i + 1;
    const mapel = opsi.mapelSesi[i] ?? "";
    const pengawas = (opsi.pengawasSesi[i] ?? []).filter(Boolean).join(", ");
    const aktif = baris.some((b) => b.sesi === s);
    return `<td class="${aktif ? "" : "redup"}">${esc(mapel) || "&nbsp;"}</td>
        <td class="${aktif ? "" : "redup"}">${esc(pengawas) || "&nbsp;"}</td>`;
  }).join("");

  const barisHTML = baris
    .map((b, i) => {
      return `<tr>
        <td class="pusat">${i + 1}</td>
        <td class="pusat">${esc(b.absen) || "&nbsp;"}</td>
        <td class="pusat">${esc(b.nis) || "&nbsp;"}</td>
        <td>${esc(b.nama)}</td>
        <td class="pusat">${esc(b.kelas) || "&nbsp;"}</td>
        <td class="pusat">${esc(b.tingkat) || "&nbsp;"}</td>
        ${kolomIsi}
        <td class="ttd"></td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Jadwal Harian ${esc(labelTanggal(baris[0]?.tanggal ?? ""))}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11px; }
  .kop { text-align: center; border-bottom: 3px double #111; padding-bottom: 8px; margin-bottom: 12px; }
  .kop h1 { font-size: 17px; margin: 0; letter-spacing: .02em; }
  .kop p { margin: 2px 0 0; font-size: 11px; }
  h2.judul { text-align: center; font-size: 14px; text-transform: uppercase; margin: 0 0 2px; }
  p.sub { text-align: center; margin: 0 0 12px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 5px 6px; vertical-align: middle; }
  thead th { background: #f1f1f1; font-size: 10px; }
  th.grup { text-align: center; font-size: 10px; }
  td.pusat { text-align: center; }
  td.redup { color: #aaa; background: #fafafa; }
  td.ttd { min-width: 90px; }
  tbody tr:nth-child(even) td { background: #fbfbfb; }
  .ttd-bawah { margin-top: 18px; display: flex; justify-content: space-between; font-size: 11px; }
  .ttd-bawah .kotak { text-align: center; min-width: 200px; }
  .ttd-bawah .isi { height: 64px; }
</style>
</head>
<body>
  <div class="kop">
    <h1>${esc(opsi.sekolah) || "MADRASAH"}</h1>
    <p>${esc(opsi.alamat)}</p>
    <p>${esc(opsi.kota)}</p>
  </div>
  <h2 class="judul">Jadwal Harian Peserta Ujian</h2>
  <p class="sub">${infoHari} — satu baris = satu sesi (kolom A, B, C, … berurutan).</p>
  <table>
    <thead>
      <tr>
        <th rowspan="2" class="pusat">No.</th>
        <th rowspan="2" class="pusat">No.<br />absen</th>
        <th rowspan="2" class="pusat">NIS /<br />NISN</th>
        <th rowspan="2">Nama Peserta</th>
        <th rowspan="2" class="pusat">Kelas</th>
        <th rowspan="2" class="pusat">Tingkat</th>
        ${kolomJudul}
        <th rowspan="2" class="pusat">Tanda<br />Tangan</th>
      </tr>
      <tr>
        ${Array.from({ length: opsi.totalSesi }, () => `<th class="pusat">Mapel</th>\n        <th class="pusat">Pengawas</th>`).join("\n        ")}
      </tr>
    </thead>
    <tbody>
      ${barisHTML}
    </tbody>
  </table>
  <div class="ttd-bawah">
    <div class="kotak">
      <div>Mengetahui,</div>
      <div>Kepala Madrasah</div>
      <div class="isi"></div>
      <div>…………………………</div>
    </div>
    <div class="kotak" style="text-align:right">
      <div>${esc(labelTanggal(baris[0]?.tanggal ?? ""))}</div>
      <div>Petugas Panitia</div>
      <div class="isi"></div>
      <div>…………………………</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Uji internal fungsi murni (dijalankan skrip verifikasi — tidak dijalankan
 * aplikasi produksi). Mengembalikan daftar pesan kegagalan; [] = lulus.
 */
export function ujiIntern(): string[] {
  const gagal: string[] = [];
  const cek = (nama: string, kondisi: boolean) => {
    if (!kondisi) gagal.push(nama);
  };

  cek("label senin", labelTanggal("2025-11-03") === "Senin, 3 November 2025");
  cek("label minggu", labelTanggal("2025-08-17") === "Minggu, 17 Agustus 2025");
  cek("label invalid", labelTanggal("abc") === "abc");

  cek("jam 7:30", normalisasiJam("7:30") === "07.30");
  cek("jam 07.30", normalisasiJam("07.30") === "07.30");
  cek("jam 2359", normalisasiJam("2359") === "23.59");
  cek("jam sampah", normalisasiJam("x") === "");
  cek("jam 25.00", normalisasiJam("25.00") === "");

  const auto3 = jamMulaiOtomatis(3);
  cek("auto 3 sesi", auto3.join(",") === "07.30,10.00,12.30");
  cek(
    "auto 5 sesi",
    jamMulaiOtomatis(5).join(",") === "07.30,10.00,12.30,15.00,17.30",
  );

  const kerja5 = [1, 2, 3, 4, 5];
  const senin = hitungSesiTanggal("2025-11-03", kerja5, []);
  cek("senin sesi [1,6]", !senin.libur && senin.sesi.join(",") === "1,6");
  const kamis = hitungSesiTanggal("2025-11-06", kerja5, []);
  cek("kamis sesi [4,9]", !kamis.libur && kamis.sesi.join(",") === "4,9");
  const sabtu = hitungSesiTanggal("2025-11-08", kerja5, []);
  cek("sabtu libur", sabtu.libur && sabtu.sesi.length === 0);
  const libur = hitungSesiTanggal("2025-11-04", kerja5, ["2025-11-04"]);
  cek("tanggal libur", libur.libur && libur.sesi.length === 0);
  const kerja6 = [1, 3, 5];
  const rabu6 = hitungSesiTanggal("2025-11-05", kerja6, []);
  cek("rabu kerja6 sesi [2,5]", !rabu6.libur && rabu6.sesi.join(",") === "2,5");

  const baris: BarisJadwalHarianGas[] = [
    {
      tanggal: "2025-11-03",
      hari: "SENIN",
      sesi: 1,
      mapel: "Matematika",
      pengawas: ["Budi Santoso, S.Pd"],
      nis: "0081234567",
      nama: "Aisyah Putri",
      kelas: "X.1",
      tingkat: "X",
      absen: "1",
    },
    {
      tanggal: "2025-11-03",
      hari: "SENIN",
      sesi: 2,
      mapel: "",
      pengawas: [],
      nis: "0092233445",
      nama: "Rahmat Hidayat",
      kelas: "XI.2",
      tingkat: "XI",
      absen: "1",
    },
  ];
  const html = jadwalHarianHTML(baris, {
    sekolah: "MAN 2 PALEMBANG",
    alamat: "Jl. Contoh No. 1",
    kota: "Palembang",
    totalSesi: 3,
    jamSesi: ["07.30", "10.00", "12.30"],
    mapelSesi: ["Matematika", "", ""],
    pengawasSesi: [["Budi Santoso, S.Pd"], [], []],
  });
  cek("html judul", html.includes("Jadwal Harian Peserta Ujian"));
  cek("html kop", html.includes("MAN 2 PALEMBANG"));
  cek("html 2 baris", (html.match(/<tr>/g) || []).length >= 4); // 2 header + 2 baris
  cek("html nama", html.includes("Aisyah Putri") && html.includes("Rahmat Hidayat"));
  cek("html sesi 3", html.includes("SESI 3"));
  cek("html jam", html.includes("07.30") && html.includes("12.30"));
  cek("html mapel", html.includes("Matematika"));
  cek("html ttd", html.includes("Tanda<br />Tangan") || html.includes("Tanda"));
  cek("html escape", jadwalHarianHTML(
    [{ ...baris[0], nama: "<script>" }],
    { sekolah: "X", alamat: "", kota: "", totalSesi: 1, jamSesi: ["07.30"], mapelSesi: [""], pengawasSesi: [[]] },
  ).includes("&lt;script&gt;"));

  return gagal;
}
