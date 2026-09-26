import { getAuthUserId } from "@convex-dev/auth/server";
import { ROLES, type Role } from "./schema";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Wajib masuk. Mengembalikan dokumen user yang sedang login. */
export async function requireUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Anda harus masuk terlebih dahulu.");
  }
  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new Error("Data pengguna tidak ditemukan.");
  }
  return user;
}

/** Wajib masuk dengan salah satu peran yang diizinkan. */
export async function requireRole(ctx: Ctx, roles: Role[]) {
  const user = await requireUser(ctx);
  if (user.role === undefined || !roles.includes(user.role)) {
    throw new Error("Anda tidak memiliki akses untuk melakukan aksi ini.");
  }
  return user;
}

/** Peran yang boleh mengelola ujian, soal, dan hasil. */
export const PETUGAS: Role[] = [ROLES.ADMIN, ROLES.GURU];
