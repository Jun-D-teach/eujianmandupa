import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { PETUGAS, requireRole, requireUser } from "./lib";

const Pilihan = v.union(
  v.literal("A"),
  v.literal("B"),
  v.literal("C"),
  v.literal("D"),
  v.literal("E"),
);

/**
 * Endpoint setara GAS `action=submitJawaban`.
 * Nilai dihitung DI SISI SERVER dengan mencocokkan jawaban siswa ke
 * kunci_jawaban di database, lalu hasilnya disimpan ke tabel "hasil".
 */
export const kirim = mutation({
  args: {
    ujianId: v.id("ujian"),
    nama: v.string(),
    kelas: v.string(),
    total_pelanggaran: v.number(),
    jawaban: v.array(
      v.object({
        soal_id: v.id("soal"),
        pilihan: v.optional(Pilihan),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const ujian = await ctx.db.get(args.ujianId);
    if (ujian === null) throw new Error("Ujian tidak ditemukan.");

    const soalList = await ctx.db
      .query("soal")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    if (soalList.length === 0) {
      throw new Error("Ujian ini belum memiliki soal.");
    }
    soalList.sort((a, b) => a.urutan - b.urutan);

    const jawabanMap = new Map<string, string | undefined>();
    for (const j of args.jawaban) {
      jawabanMap.set(j.soal_id, j.pilihan);
    }

    let benar = 0;
    const jawabanTervalidasi: {
      soal_id: typeof soalList[number]["_id"];
      pilihan?: "A" | "B" | "C" | "D" | "E";
    }[] = [];
    for (const s of soalList) {
      const pilihan = jawabanMap.get(s._id);
      if (pilihan !== undefined && pilihan === s.kunci_jawaban) benar++;        jawabanTervalidasi.push({ soal_id: s._id, pilihan: pilihan as "A" | "B" | "C" | "D" | "E" | undefined });
    }

    const total_soal = soalList.length;
    const nilai = Math.round((benar / total_soal) * 100);
    const total_pelanggaran = Math.min(
      999,
      Math.max(0, Math.floor(args.total_pelanggaran)),
    );
    const nama = args.nama.trim() || user.name || "Tanpa Nama";
    const kelas = args.kelas.trim() || user.kelas || "-";

    const dokumen = {
      ujian_id: args.ujianId,
      user_id: user._id,
      timestamp: Date.now(),
      nama,
      kelas,
      nilai,
      benar,
      total_soal,
      total_pelanggaran,
      jawaban: jawabanTervalidasi,
    };

    const lama = await ctx.db
      .query("hasil")
      .withIndex("by_ujian_user", (q) =>
        q.eq("ujian_id", args.ujianId).eq("user_id", user._id),
      )
      .unique();

    if (lama !== null) {
      await ctx.db.patch(lama._id, dokumen);
    } else {
      await ctx.db.insert("hasil", dokumen);
    }

    return { nilai, benar, total_soal, total_pelanggaran };
  },
});

/** Riwayat nilai milik siswa yang sedang login. */
export const saya = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("hasil")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .order("desc")
      .collect();
    return await Promise.all(
      rows.map(async (h) => {
        const u = await ctx.db.get(h.ujian_id);
        return {
          _id: h._id,
          ujian_id: h.ujian_id,
          timestamp: h.timestamp,
          judul_ujian: u?.judul ?? "Ujian dihapus",
          nama: h.nama,
          kelas: h.kelas,
          nilai: h.nilai,
          benar: h.benar,
          total_soal: h.total_soal,
          total_pelanggaran: h.total_pelanggaran,
        };
      }),
    );
  },
});

/** Semua hasil sebuah ujian — guru/admin. */
export const perUjian = query({
  args: { ujianId: v.id("ujian") },
  handler: async (ctx, args) => {
    await requireRole(ctx, PETUGAS);
    const rows = await ctx.db
      .query("hasil")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();

    // Berapa kali layar terkunci siswa dibuka oleh pengawas (audit online).
    const logBuka = await ctx.db
      .query("buka_kunci")
      .withIndex("by_ujian", (q) => q.eq("ujian_id", args.ujianId))
      .collect();
    const jumlahPerUser = new Map<string, number>();
    for (const l of logBuka) {
      jumlahPerUser.set(l.user_id, (jumlahPerUser.get(l.user_id) ?? 0) + 1);
    }

    return rows
      .sort((a, b) => b.nilai - a.nilai || b.timestamp - a.timestamp)
      .map((h) => ({
        ...h,
        jumlah_buka_kunci: jumlahPerUser.get(h.user_id) ?? 0,
      }));
  },
});
