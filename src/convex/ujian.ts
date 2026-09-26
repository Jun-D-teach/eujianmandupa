import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES } from "./schema";
import { PETUGAS, requireRole, requireUser } from "./lib";
import { tulisSoalContoh } from "./soal";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const DURASI_DEFAULT = 60;
const HURUF_TOKEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa 0/O/1/I

/**
 * PIN pengawas untuk membuka layar terkunci — HANYA disimpan di server
 * sehingga tidak pernah masuk ke bundle JavaScript klien.
 */
const PIN_PENGAWAS = "123456";

/** Token ujian acak, mis. "K7XM3P". */
export function buatTokenAcak(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += HURUF_TOKEN[Math.floor(Math.random() * HURUF_TOKEN.length)];
  }
  return out;
}

function normalisasiToken(token: string): string {
  const t = token.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(t)) {
    throw new Error("Token harus 4–12 karakter (huruf/angka).");
  }
  return t;
}

function validasiDurasi(durasi: number): number {
  const d = Math.floor(durasi);
  if (!Number.isFinite(d) || d < 1 || d > 600) {
    throw new Error("Durasi ujian harus 1–600 menit.");
  }
  return d;
}

async function hitungSoal(ctx: QueryCtx | MutationCtx, ujianId: Id<"ujian">) {
  const rows = await ctx.db
    .query("soal")
    .withIndex("by_ujian", (q) => q.eq("ujian_id", ujianId))
    .collect();
  return rows.length;
}

async function hitungHasil(ctx: QueryCtx | MutationCtx, ujianId: Id<"ujian">) {
  const rows = await ctx.db
    .query("hasil")
    .withIndex("by_ujian", (q) => q.eq("ujian_id", ujianId))
    .collect();
  return rows.length;
}

/** Daftar ujian AKTIF untuk siswa (tanpa token — token dimasukkan manual). */
export const listAktif = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("ujian")
      .withIndex("by_aktif", (q) => q.eq("aktif", true))
      .collect();
    const hasil = await Promise.all(
      rows.map(async (u) => ({
        _id: u._id,
        judul: u.judul,
        deskripsi: u.deskripsi,
        aktif: u.aktif,
        durasi_menit: u.durasi_menit ?? DURASI_DEFAULT,
        dibuat_pada: u.dibuat_pada,
        jumlah_soal: await hitungSoal(ctx, u._id),
      })),
    );
    return hasil.sort((a, b) => b.dibuat_pada - a.dibuat_pada);
  },
});

/** Semua ujian + token/pengaturan untuk guru/admin. */
export const listSemua = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, PETUGAS);
    const rows = await ctx.db.query("ujian").collect();
    const hasil = await Promise.all(
      rows.map(async (u) => ({
        ...u,
        durasi_menit: u.durasi_menit ?? DURASI_DEFAULT,
        token: u.token ?? "",
        jumlah_soal: await hitungSoal(ctx, u._id),
        jumlah_hasil: await hitungHasil(ctx, u._id),
      })),
    );
    return hasil.sort((a, b) => b.dibuat_pada - a.dibuat_pada);
  },
});

/** Info satu ujian untuk layar setup siswa — TOKEN TIDAK DISERTAKAN. */
export const get = query({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) return null;
    return {
      _id: ujian._id,
      judul: ujian.judul,
      deskripsi: ujian.deskripsi,
      aktif: ujian.aktif,
      durasi_menit: ujian.durasi_menit ?? DURASI_DEFAULT,
      dibuat_pada: ujian.dibuat_pada,
      jumlah_soal: await hitungSoal(ctx, ujian._id),
    };
  },
});

/** Buat ujian — ADMIN (token & durasi juga diset di sini). */
export const buat = mutation({
  args: {
    judul: v.string(),
    deskripsi: v.optional(v.string()),
    token: v.optional(v.string()),
    durasi_menit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [ROLES.ADMIN]);
    const judul = args.judul.trim();
    if (judul.length === 0) throw new Error("Judul ujian wajib diisi.");
    const token = args.token?.trim()
      ? normalisasiToken(args.token)
      : buatTokenAcak();
    const durasi = args.durasi_menit
      ? validasiDurasi(args.durasi_menit)
      : DURASI_DEFAULT;
    return await ctx.db.insert("ujian", {
      judul,
      deskripsi: args.deskripsi?.trim() || undefined,
      aktif: false, // dibuat belum aktif; diaktifkan setelah soal lengkap
      token,
      durasi_menit: durasi,
      dibuat_oleh: user._id,
      dibuat_pada: Date.now(),
    });
  },
});

/** Ubah token & durasi ujian — ADMIN. */
export const aturPengaturan = mutation({
  args: {
    ujianId: v.id("ujian"),
    token: v.string(),
    durasi_menit: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.ADMIN]);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    await ctx.db.patch(args.ujianId, {
      token: normalisasiToken(args.token),
      durasi_menit: validasiDurasi(args.durasi_menit),
    });
  },
});

/**
 * Membuka kunci layar setelah 3 strike.
 * Siswa HARUS online (mutasi ini adalah bukti koneksi ke server), PIN
 * diverifikasi di server, lalu pembukaan dicatat sebagai audit — sehingga
 * setelah terbuka siswa kembali mengerjakan ujian secara OFFLINE dengan
 * jawaban yang sudah tersimpan.
 */
export const bukaKunci = mutation({
  args: { ujianId: v.id("ujian"), pin: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.pin.trim() !== PIN_PENGAWAS) {
      throw new Error("PIN pengawas salah.");
    }
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    const waktu = Date.now();
    await ctx.db.insert("buka_kunci", {
      ujian_id: args.ujianId,
      user_id: user._id,
      waktu,
    });
    return { berhasil: true, waktu };
  },
});

/** Aktif/nonaktifkan ujian — ADMIN. */
export const setAktif = mutation({
  args: { ujianId: v.id("ujian"), aktif: v.boolean() },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.ADMIN]);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    if (args.aktif && (await hitungSoal(ctx, args.ujianId)) === 0) {
      throw new Error("Tidak bisa mengaktifkan ujian yang belum punya soal.");
    }
    await ctx.db.patch(args.ujianId, { aktif: args.aktif });
  },
});

/** Hapus ujian beserta soal & hasil — ADMIN. */
export const hapus = mutation({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireRole(ctx, [ROLES.ADMIN]);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    const soal = await ctx.db
      .query("soal")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    const hasil = await ctx.db
      .query("hasil")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    for (const s of soal) await ctx.db.delete(s._id);
    for (const h of hasil) await ctx.db.delete(h._id);
    await ctx.db.delete(args.ujianId);
  },
});

/** Membuat ujian contoh lengkap (dipakai saat bootstrap admin pertama). */
export async function buatUjianContoh(
  ctx: MutationCtx,
  dibuatOleh: Id<"users">,
) {
  const ujianId = await ctx.db.insert("ujian", {
    judul: "Ujian Contoh: Pengetahuan Umum",
    deskripsi:
      "Ujian percontohan untuk menguji alur unduh-soal offline. Boleh dihapus.",
    aktif: true,
    token: buatTokenAcak(),
    durasi_menit: DURASI_DEFAULT,
    dibuat_oleh: dibuatOleh,
    dibuat_pada: Date.now(),
  });
  await tulisSoalContoh(ctx, ujianId);
  return ujianId;
}
