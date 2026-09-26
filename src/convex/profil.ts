import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES, roleValidator } from "./schema";
import { requireRole } from "./lib";
import { buatUjianContoh } from "./ujian";

/**
 * Dipanggil sekali oleh Dashboard setelah masuk.
 * Akun PERTAMA otomatis menjadi admin (bootstrap) sekaligus mendapat
 * ujian contoh; akun berikutnya menjadi siswa, lalu admin bisa
 * menaikkan peran guru/siswa lewat menu Pengguna.
 */
export const siapkan = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Anda harus masuk terlebih dahulu.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Data pengguna tidak ditemukan.");
    if (user.role !== undefined) return user.role;

    const semua = await ctx.db.query("users").collect();
    const sudahAdaAdmin = semua.some((u) => u.role === ROLES.ADMIN);

    if (!sudahAdaAdmin) {
      await ctx.db.patch(userId, { role: ROLES.ADMIN });
      const adaUjian = (await ctx.db.query("ujian").first()) !== null;
      if (!adaUjian) await buatUjianContoh(ctx, userId);
      return ROLES.ADMIN;
    }

    await ctx.db.patch(userId, { role: ROLES.SISWA });
    return ROLES.SISWA;
  },
});

/** Simpan nama & kelas siswa (dipakai saat setup unduh soal). */
export const perbarui = mutation({
  args: {
    nama: v.optional(v.string()),
    kelas: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Anda harus masuk terlebih dahulu.");
    const patch: { name?: string; kelas?: string } = {};
    if (args.nama !== undefined && args.nama.trim().length > 0) {
      patch.name = args.nama.trim();
    }
    if (args.kelas !== undefined) {
      patch.kelas = args.kelas.trim();
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(userId, patch);
  },
});

/** Daftar seluruh akun — hanya admin. */
export const daftarPengguna = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, [ROLES.ADMIN]);
    const rows = await ctx.db.query("users").collect();
    return rows.map((u) => ({
      _id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      kelas: u.kelas ?? null,
    }));
  },
});

/** Ubah peran pengguna — hanya admin; admin terakhir tidak bisa diturunkan. */
export const aturRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, [ROLES.ADMIN]);
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");

    if (target.role === ROLES.ADMIN && args.role !== ROLES.ADMIN) {
      const semua = await ctx.db.query("users").collect();
      const jumlahAdmin = semua.filter((u) => u.role === ROLES.ADMIN).length;
      if (jumlahAdmin <= 1 && target._id === admin._id) {
        throw new Error(
          "Tidak bisa menurunkan peran admin terakhir. Tambahkan admin lain dulu.",
        );
      }
    }

    await ctx.db.patch(args.userId, { role: args.role });
  },
});
