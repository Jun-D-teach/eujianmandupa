import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// Peran pengguna aplikasi ujian online.
export const ROLES = {
  ADMIN: "admin",
  GURU: "guru",
  SISWA: "siswa",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.GURU),
  v.literal(ROLES.SISWA),
);
export type Role = Infer<typeof roleValidator>;

/** Kunci jawaban hanya boleh A–E — sama seperti kolom kunci_jawaban di Sheet. */
export const pilihanValidator = v.union(
  v.literal("A"),
  v.literal("B"),
  v.literal("C"),
  v.literal("D"),
  v.literal("E"),
);
export type Pilihan = Infer<typeof pilihanValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // admin | guru | siswa
      kelas: v.optional(v.string()), // kelas siswa, mis. "XII-IPA-2"
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Setara Sheet "Soal" + kolom judul ujian.
    ujian: defineTable({
      judul: v.string(),
      deskripsi: v.optional(v.string()),
      aktif: v.boolean(), // aktif = siswa bisa mengunduh soal
      token: v.optional(v.string()), // token ujian, diset & bisa diacak admin
      durasi_menit: v.optional(v.number()), // waktu ujian (menit), diset admin
      dibuat_oleh: v.id("users"),
      dibuat_pada: v.number(),
    }).index("by_aktif", ["aktif"]),

    // Setara Sheet "Soal": id_soal, pertanyaan, opsi_a..e, kunci_jawaban.
    soal: defineTable({
      ujian_id: v.id("ujian"),
      pertanyaan: v.string(),
      opsi_a: v.string(),
      opsi_b: v.string(),
      opsi_c: v.string(),
      opsi_d: v.string(),
      opsi_e: v.optional(v.string()), // opsi kelima (opsional)
      kunci_jawaban: pilihanValidator, // tidak pernah dikirim ke siswa
      urutan: v.number(),
    }).index("by_ujian", ["ujian_id"]),

    // Setara Sheet "Hasil": timestamp, nama, kelas, nilai, total_pelanggaran.
    hasil: defineTable({
      ujian_id: v.id("ujian"),
      user_id: v.id("users"),
      timestamp: v.number(),
      nama: v.string(),
      kelas: v.string(),
      nilai: v.number(),
      benar: v.number(),
      total_soal: v.number(),
      total_pelanggaran: v.number(),
      jawaban: v.array(
        v.object({
          soal_id: v.id("soal"),
          pilihan: v.optional(v.string()),
        }),
      ),
    })
      .index("by_ujian", ["ujian_id"])
      .index("by_user", ["user_id"])
      .index("by_ujian_user", ["ujian_id", "user_id"]),

    // Audit pembukaan kunci layar (3 strike) — hanya bisa terjadi saat siswa
    // online di depan pengawas; PIN diverifikasi di server.
    buka_kunci: defineTable({
      ujian_id: v.id("ujian"),
      user_id: v.id("users"),
      waktu: v.number(),
    })
      .index("by_ujian", ["ujian_id"])
      .index("by_user", ["user_id"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
