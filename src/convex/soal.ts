import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { pilihanValidator } from "./schema";
import { PETUGAS, requireRole, requireUser } from "./lib";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/** Soal contoh dipakai saat bootstrap admin & tombol "Isi soal contoh". */
export const SOAL_CONTOH: {
  pertanyaan: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  kunci_jawaban: "A" | "B" | "C" | "D";
}[] = [
  {
    pertanyaan: "Berapa hasil dari 12 × 4?",
    opsi_a: "44",
    opsi_b: "48",
    opsi_c: "54",
    opsi_d: "56",
    kunci_jawaban: "B",
  },
  {
    pertanyaan: "Planet manakah yang dijuluki sebagai Planet Merah?",
    opsi_a: "Venus",
    opsi_b: "Jupiter",
    opsi_c: "Mars",
    opsi_d: "Merkurius",
    kunci_jawaban: "C",
  },
  {
    pertanyaan: "Apa ibu kota Negara Indonesia?",
    opsi_a: "Jakarta",
    opsi_b: "Surabaya",
    opsi_c: "Bandung",
    opsi_d: "Semarang",
    kunci_jawaban: "A",
  },
  {
    pertanyaan: "Gas apa yang dibutuhkan tumbuhan untuk fotosintesis?",
    opsi_a: "Oksigen",
    opsi_b: "Karbon dioksida",
    opsi_c: "Nitrogen",
    opsi_d: "Hidrogen",
    kunci_jawaban: "B",
  },
  {
    pertanyaan: "Siapa presiden pertama Republik Indonesia?",
    opsi_a: "Soeharto",
    opsi_b: "B.J. Habibie",
    opsi_c: "Moh. Hatta",
    opsi_d: "Ir. Soekarno",
    kunci_jawaban: "D",
  },
];

/** Menulis sekumpulan soal contoh ke satu ujian. */
export async function tulisSoalContoh(
  ctx: MutationCtx,
  ujianId: Id<"ujian">,
): Promise<number> {
  const urut = (await ctx.db.query("soal").collect()).length;
  for (let i = 0; i < SOAL_CONTOH.length; i++) {
    await ctx.db.insert("soal", {
      ujian_id: ujianId,
      ...SOAL_CONTOH[i],
      urutan: urut + i + 1,
    });
  }
  return SOAL_CONTOH.length;
}

/** Guru/admin menambahkan satu soal ke sebuah ujian. */
export const tambah = mutation({
  args: {
    ujianId: v.id("ujian"),
    pertanyaan: v.string(),
    opsi_a: v.string(),
    opsi_b: v.string(),
    opsi_c: v.string(),
    opsi_d: v.string(),
    kunci_jawaban: pilihanValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    if (args.pertanyaan.trim().length === 0) {
      throw new Error("Pertanyaan tidak boleh kosong.");
    }
    const jumlah = await ctx.db
      .query("soal")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    return await ctx.db.insert("soal", {
      ujian_id: args.ujianId,
      pertanyaan: args.pertanyaan.trim(),
      opsi_a: args.opsi_a.trim(),
      opsi_b: args.opsi_b.trim(),
      opsi_c: args.opsi_c.trim(),
      opsi_d: args.opsi_d.trim(),
      kunci_jawaban: args.kunci_jawaban,
      urutan: jumlah.length + 1,
    });
  },
});

/** Mengisi ujian kosong dengan 5 soal contoh sekaligus. */
export const tambahContoh = mutation({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    const jumlah = await ctx.db
      .query("soal")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    if (jumlah.length > 0) {
      throw new Error("Ujian ini sudah berisi soal.");
    }
    return await tulisSoalContoh(ctx, args.ujianId);
  },
});

/** Daftar soal LENGKAP (termasuk kunci) — hanya guru/admin. */
export const daftar = query({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
    const rows = await ctx.db
      .query("soal")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    return rows.sort((a, b) => a.urutan - b.urutan);
  },
});

/**
 * Endpoint setara GAS `action=getSoal` untuk siswa.
 * Kunci jawaban DISEMBUNYIKAN dari response demi keamanan.
 */
export const untukSiswa = query({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");
    if (!ujian.aktif) throw new Error("Ujian ini belum diaktifkan pengawas.");
    const rows = await ctx.db
      .query("soal")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    const sorted = rows.sort((a, b) => a.urutan - b.urutan);
    return {
      ujian: {
        _id: ujian._id,
        judul: ujian.judul,
        deskripsi: ujian.deskripsi,
        aktif: ujian.aktif,
      },
      soal: sorted.map((s) => ({
        _id: s._id,
        pertanyaan: s.pertanyaan,
        opsi_a: s.opsi_a,
        opsi_b: s.opsi_b,
        opsi_c: s.opsi_c,
        opsi_d: s.opsi_d,
        urutan: s.urutan,
      })),
    };
  },
});

export const hapus = mutation({
  args: { soalId: v.id("soal") },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
    const soal = await ctx.db.get(args.soalId);
    if (soal === null) throw new Error("Soal tidak ditemukan.");
    await ctx.db.delete(args.soalId);
  },
});
