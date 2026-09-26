import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { PETUGAS, requireRole, requireUser } from "./lib";
import { tulisSoalContoh } from "./soal";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

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

/** Daftar ujian AKTIF untuk siswa (setara unduhan soal via GAS). */
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
        dibuat_pada: u.dibuat_pada,
        jumlah_soal: await hitungSoal(ctx, u._id),
      })),
    );
    return hasil.sort((a, b) => b.dibuat_pada - a.dibuat_pada);
  },
});

/** Semua ujian untuk guru/admin. */
export const listSemua = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, PETUGAS);
    const rows = await ctx.db.query("ujian").collect();
    const hasil = await Promise.all(
      rows.map(async (u) => ({
        ...u,
        jumlah_soal: await hitungSoal(ctx, u._id),
        jumlah_hasil: await hitungHasil(ctx, u._id),
      })),
    );
    return hasil.sort((a, b) => b.dibuat_pada - a.dibuat_pada);
  },
});

/** Info satu ujian (untuk layar setup siswa & pengelola). */
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
      dibuat_pada: ujian.dibuat_pada,
      jumlah_soal: await hitungSoal(ctx, ujian._id),
    };
  },
});

export const buat = mutation({
  args: {
    judul: v.string(),
    deskripsi: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, PETUGAS);
    const judul = args.judul.trim();
    if (judul.length === 0) throw new Error("Judul ujian wajib diisi.");
    return await ctx.db.insert("ujian", {
      judul,
      deskripsi: args.deskripsi?.trim() || undefined,
      aktif: false, // dibuat belum aktif; diaktifkan setelah soal lengkap
      dibuat_oleh: user._id,
      dibuat_pada: Date.now(),
    });
  },
});

export const setAktif = mutation({
  args: { ujianId: v.id("ujian"), aktif: v.boolean() },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    if (args.aktif && (await hitungSoal(ctx, args.ujianId)) === 0) {
      throw new Error("Tidak bisa mengaktifkan ujian yang belum punya soal.");
    }
    await ctx.db.patch(args.ujianId, { aktif: args.aktif });
  },
});

export const hapus = mutation({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
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
    dibuat_oleh: dibuatOleh,
    dibuat_pada: Date.now(),
  });
  await tulisSoalContoh(ctx, ujianId);
  return ujianId;
}
