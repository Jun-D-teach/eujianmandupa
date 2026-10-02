/**
 * Pembaca file Excel/CSV untuk fitur impor massal (Data Siswa & Data Guru).
 * File dibaca di browser (lazy import "xlsx") lalu dikirim sebagai baris teks
 * ke backend — server tidak perlu tahu format Excel.
 */

/** Deteksi baris header supaya tidak ikut terimpor. */
function barisHeader(sel: string[]): boolean {
  const h = sel.map((s) => s.trim().toLowerCase());
  const gabung = h.join("|");
  return (
    gabung.includes("nisn") ||
    gabung.includes("nip") ||
    gabung.includes("nuptk") ||
    gabung.startsWith("nama") ||
    gabung.includes("mata pelajaran") ||
    gabung.includes("mapel")
  );
}

function keTeks(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === "number") {
    // NISN/NIP terbaca sebagai bilangan — hilangkan desimal yang tidak perlu.
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v ?? "").trim();
}

/**
 * Baca sheet pertama dari file Excel/CSV → baris string.
 * Baris header otomatis dibuang; baris kosong dibuang.
 */
export async function bacaBarisExcel(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const namaSheet = wb.SheetNames[0];
  if (!namaSheet) throw new Error("File tidak memiliki sheet.");
  const ws = wb.Sheets[namaSheet];
  const matriks = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  let baris = matriks.map((r) =>
    (Array.isArray(r) ? r : []).map((c) => keTeks(c)),
  );
  if (baris.length > 0 && barisHeader(baris[0])) baris = baris.slice(1);
  return baris.filter((r) => r.some((s) => s.trim() !== ""));
}
