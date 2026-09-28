/**
 * ============================================================================
 * UjianAman — Google Apps Script (Backend Google Sheets)
 * ----------------------------------------------------------------------------
 * SATU-SATUNYA backend aplikasi. Tidak ada auth penyedia lain: semua akun
 * (admin / guru / siswa) dibuat & diatur admin di sheet "Pengguna".
 *
 * STRUKTUR GOOGLE SHEETS (dibuat otomatis oleh setupSheet)
 * --------------------------------------------------------
 * Ujian    : id | judul | deskripsi | token | durasi_menit | aktif | dibuat
 * Soal     : id | ujian_id | pertanyaan | opsi_a..opsi_e | kunci_jawaban | dibuat
 * Hasil    : id | ujian_id | ujian_judul | nama | kelas | token | benar |
 *            total_soal | nilai | total_pelanggaran | timestamp
 * Pengguna : id | username | password | nama | kelas | role | dibuat
 * BukaKunci: timestamp | ujian_id | nama | catatan
 *
 * ALUR SISWA (sesuai permintaan)
 *  - Unduh soal TANPA token : action=getSoal&id=...
 *  - Token diset admin dan DIBAGIKAN PENGAWAS RUANG; siswa memasukkannya
 *    saat menekan "Mulai Ujian". Validasi token dilakukan LOKAL di perangkat
 *    siswa sehingga ujian tetap bisa dimulai saat offline.
 *  - Kirim jawaban saat online: action=submitJawaban — nilai dihitung di
 *    server dari huruf A–E lalu disimpan ke sheet "Hasil".
 *
 * CARA PASANG
 * 1. Buat Spreadsheet kosong, Extensions > Apps Script, tempel berkas ini.
 * 2. Jalankan setupSheet() sekali (beri izin) — opsional, sheet dibuat otomatis.
 * 3. Deploy > New deployment > Web app — Execute as: Me, access: Anyone.
 * 4. Salin URL /exec ke aplikasi (diisi di halaman login aplikasi).
 *
 * SEMUA action GET mendukung JSONP (tambahkan &callback=fn). POST menerima
 * JSON body; klien web memakai GET+JSONP dengan payloadB64 agar bebas CORS.
 * ============================================================================
 */

var SHEET_UJIAN = "Ujian";
var SHEET_SOAL = "Soal";
var SHEET_HASIL = "Hasil";
var SHEET_PENGGUNA = "Pengguna";
var SHEET_BUKA_KUNCI = "BukaKunci";

var HEADER_UJIAN = ["id", "judul", "deskripsi", "token", "durasi_menit", "aktif", "dibuat"];
var HEADER_SOAL = ["id", "ujian_id", "pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "opsi_e", "kunci_jawaban", "dibuat"];
var HEADER_HASIL = ["id", "ujian_id", "ujian_judul", "nama", "kelas", "token", "benar", "total_soal", "nilai", "total_pelanggaran", "timestamp"];
var HEADER_PENGGUNA = ["id", "username", "password", "nama", "kelas", "role", "dibuat"];
var HEADER_BUKA_KUNCI = ["timestamp", "ujian_id", "nama", "catatan"];

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var defs = [
    [SHEET_UJIAN, HEADER_UJIAN],
    [SHEET_SOAL, HEADER_SOAL],
    [SHEET_HASIL, HEADER_HASIL],
    [SHEET_PENGGUNA, HEADER_PENGGUNA],
    [SHEET_BUKA_KUNCI, HEADER_BUKA_KUNCI],
  ];
  defs.forEach(function (item) {
    var sh = ss.getSheetByName(item[0]);
    if (!sh) sh = ss.insertSheet(item[0]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(item[1]);
      sh.setFrozenRows(1);
    }
  });
  return { success: true, message: "Sheet siap." };
}

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    setupSheet();
    sh = ss.getSheetByName(name);
  }
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sh;
}

function indexHeader_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) map[String(headerRow[i]).trim()] = i;
  return map;
}

function bacaBaris_(sheetName) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  var out = { idx: indexHeader_(values[0] || []), rows: [] };
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!String(row[out.idx.id] || "").trim()) continue;
    out.rows.push(row);
  }
  return out;
}

function idBaru_(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function buatTokenAcak_() {
  var alfabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var t = "";
  for (var i = 0; i < 6; i++) t += alfabet.charAt(Math.floor(Math.random() * alfabet.length));
  return t;
}

/* ------------------------------------------------------------------ */
/* RESPON (JSON & JSONP)                                               */
/* ------------------------------------------------------------------ */

function kirimOutput_(e, payload) {
  var out = JSON.stringify(payload);
  var cb = e && e.parameter && e.parameter.callback ? e.parameter.callback : null;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + out + ");").setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* ROUTER                                                              */
/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var payload = {};
    if (params.payloadB64) {
      payload = JSON.parse(
        Utilities.newBlob(Utilities.base64Decode(String(params.payloadB64))).getDataAsString("UTF-8")
      );
    }
    var data = {};
    for (var k in params) if (k !== "callback" && k !== "payloadB64") data[k] = params[k];
    for (var p in payload) data[p] = payload[p];
    return kirimOutput_(e, jalankan_(String(data.action || ""), data));
  } catch (err) {
    return kirimOutput_(e, { success: false, message: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    return kirimOutput_(e, jalankan_(String(body.action || ""), body));
  } catch (err) {
    return kirimOutput_(e, { success: false, message: String(err && err.message ? err.message : err) });
  }
}

function jalankan_(action, data) {
  switch (action) {
    case "ping": return ping_();
    case "setupAdmin": return setupAdmin_(data);
    case "login": return login_(data);
    case "getUjianSiswa": return getUjianSiswa_();
    case "getUjianInfo": return getUjianInfo_(data);
    case "getUjian": return getUjian_();
    case "getSoal": return getSoal_(data);
    case "getSoalAdmin": return getSoalAdmin_(data);
    case "getHasil": return getHasil_(data);
    case "getHasilSaya": return getHasilSaya_(data);
    case "getPengguna": return getPengguna_();
    case "buatUjian": return buatUjian_(data);
    case "aturUjian": return aturUjian_(data);
    case "setAktifUjian": return setAktifUjian_(data);
    case "hapusUjian": return hapusUjian_(data);
    case "tambahSoal": return tambahSoal_(data);
    case "tambahSoalContoh": return tambahSoalContoh_(data);
    case "hapusSoal": return hapusSoal_(data);
    case "submitJawaban": return submitJawaban_(data);
    case "catatBukaKunci": return catatBukaKunci_(data);
    case "buatPengguna": return buatPengguna_(data);
    case "ubahPeran": return ubahPeran_(data);
    default: return { success: false, message: "Action tidak dikenal: " + action };
  }
}

/* ------------------------------------------------------------------ */
/* AUTH — semua akun diatur admin                                      */
/* ------------------------------------------------------------------ */

function ping_() {
  var users = bacaBaris_(SHEET_PENGGUNA);
  return { success: true, siap: users.rows.length > 0 };
}

function setupAdmin_(data) {
  var users = bacaBaris_(SHEET_PENGGUNA);
  if (users.rows.length > 0) {
    return { success: false, message: "Akun sudah ada. Login dengan akun dari admin." };
  }
  var username = String(data.username || "admin").trim().toLowerCase();
  var password = String(data.password || "").trim();
  if (password.length < 4) return { success: false, message: "Password minimal 4 karakter." };
  getSheet_(SHEET_PENGGUNA).appendRow([idBaru_("p"), username, password, "Administrator", "", "admin", new Date()]);

  // Ujian contoh + 5 soal contoh agar langsung bisa dicoba.
  var ujianId = idBaru_("u");
  getSheet_(SHEET_UJIAN).appendRow([
    ujianId, "Contoh Ujian — Trigonometri", "Ujian percobaan 5 soal pilihan ganda.",
    buatTokenAcak_(), 60, true, new Date(),
  ]);
  SOAL_CONTOH.forEach(function (s) {
    getSheet_(SHEET_SOAL).appendRow([
      idBaru_("s"), ujianId, s.pertanyaan, s.opsi_a, s.opsi_b, s.opsi_c, s.opsi_d,
      s.opsi_e || "", s.kunci_jawaban, new Date(),
    ]);
  });
  return {
    success: true,
    message: 'Admin "' + username + '" dibuat beserta ujian contoh.',
    user: { id: username, username: username, nama: "Administrator", kelas: "", role: "admin" },
  };
}

function login_(data) {
  var username = String(data.username || "").trim().toLowerCase();
  var password = String(data.password || "").trim();
  if (!username || !password) return { success: false, message: "Username dan password wajib diisi." };
  var users = bacaBaris_(SHEET_PENGGUNA);
  for (var i = 0; i < users.rows.length; i++) {
    var row = users.rows[i];
    var u = String(row[users.idx.username] || "").trim().toLowerCase();
    var p = String(row[users.idx.password] || "").trim();
    if (u === username && p === password) {
      return {
        success: true,
        user: {
          id: String(row[users.idx.id]),
          username: u,
          nama: String(row[users.idx.nama] || u),
          kelas: String(row[users.idx.kelas] || ""),
          role: String(row[users.idx.role] || "siswa"),
        },
      };
    }
  }
  return { success: false, message: "Username atau password salah." };
}

function buatPengguna_(data) {
  var username = String(data.username || "").trim().toLowerCase();
  var password = String(data.password || "").trim();
  var role = String(data.role || "siswa").trim();
  if (!username || !password) return { success: false, message: "Username & password wajib diisi." };
  if (["admin", "guru", "siswa"].indexOf(role) === -1) return { success: false, message: "Peran tidak valid." };
  var users = bacaBaris_(SHEET_PENGGUNA);
  for (var i = 0; i < users.rows.length; i++) {
    if (String(users.rows[i][users.idx.username]).trim().toLowerCase() === username) {
      return { success: false, message: 'Username "' + username + '" sudah dipakai.' };
    }
  }
  var id = idBaru_("p");
  getSheet_(SHEET_PENGGUNA).appendRow([
    id, username, password, String(data.nama || username).trim(), String(data.kelas || "").trim(), role, new Date(),
  ]);
  return { success: true, id: id, message: 'Akun ' + role + ' "' + username + '" dibuat.' };
}

function ubahPeran_(data) {
  var sh = getSheet_(SHEET_PENGGUNA);
  var values = sh.getDataRange().getValues();
  var idx = indexHeader_(values[0]);
  var cari = String(data.id || "");
  var role = String(data.role || "");
  if (["admin", "guru", "siswa"].indexOf(role) === -1) return { success: false, message: "Peran tidak valid." };
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx.id]) === cari) {
      values[r][idx.role] = role;
      sh.getRange(r + 1, 1, 1, values[0].length).setValues([values[r]]);
      return { success: true, message: "Peran diperbarui." };
    }
  }
  return { success: false, message: "Pengguna tidak ditemukan." };
}

function getPengguna_() {
  var users = bacaBaris_(SHEET_PENGGUNA);
  var daftar = users.rows.map(function (row) {
    return {
      id: String(row[users.idx.id]),
      username: String(row[users.idx.username] || ""),
      nama: String(row[users.idx.nama] || ""),
      kelas: String(row[users.idx.kelas] || ""),
      role: String(row[users.idx.role] || "siswa"),
    };
  });
  return { success: true, pengguna: daftar };
}

/* ------------------------------------------------------------------ */
/* UJIAN                                                               */
/* ------------------------------------------------------------------ */

function hitungSoal_(ujianId) {
  var soal = bacaBaris_(SHEET_SOAL);
  var n = 0;
  soal.rows.forEach(function (row) {
    if (String(row[soal.idx.ujian_id]) === ujianId) n++;
  });
  return n;
}

function barisUjian_(row, idx, sertakanToken) {
  var id = String(row[idx.id]);
  var out = {
    id: id,
    judul: String(row[idx.judul] || ""),
    deskripsi: String(row[idx.deskripsi] || ""),
    durasi_menit: Number(row[idx.durasi_menit]) || 60,
    aktif: String(row[idx.aktif]).trim().toUpperCase() === "TRUE",
    jumlah_soal: hitungSoal_(id),
  };
  if (sertakanToken) out.token = String(row[idx.token] || "");
  return out;
}

/** Daftar ujian untuk siswa: hanya yang aktif, TANPA token. */
function getUjianSiswa_() {
  var ujian = bacaBaris_(SHEET_UJIAN);
  var daftar = [];
  ujian.rows.forEach(function (row) {
    var u = barisUjian_(row, ujian.idx, false);
    if (u.aktif) daftar.push(u);
  });
  return { success: true, ujian: daftar };
}

/** Info satu ujian untuk siswa (tanpa token). */
function getUjianInfo_(data) {
  var ujian = bacaBaris_(SHEET_UJIAN);
  var cari = String(data.id || "");
  for (var i = 0; i < ujian.rows.length; i++) {
    if (String(ujian.rows[i][ujian.idx.id]) === cari) {
      var u = barisUjian_(ujian.rows[i], ujian.idx, false);
      if (!u.aktif) return { success: false, message: "Ujian belum diaktifkan admin." };
      return { success: true, ujian: u };
    }
  }
  return { success: false, message: "Ujian tidak ditemukan." };
}

/** Daftar semua ujian untuk admin/petugas — DENGAN token. */
function getUjian_() {
  var ujian = bacaBaris_(SHEET_UJIAN);
  return {
    success: true,
    ujian: ujian.rows.map(function (row) { return barisUjian_(row, ujian.idx, true); }),
  };
}

function buatUjian_(data) {
  var judul = String(data.judul || "").trim();
  if (!judul) return { success: false, message: "Judul ujian wajib diisi." };
  var token = String(data.token || "").trim().toUpperCase() || buatTokenAcak_();
  if (!/^[A-Z0-9]{4,12}$/.test(token)) return { success: false, message: "Token harus 4–12 huruf/angka tanpa spasi." };
  var durasi = Math.floor(Number(data.durasi_menit) || 60);
  if (durasi < 1 || durasi > 600) return { success: false, message: "Durasi harus 1–600 menit." };
  var id = idBaru_("u");
  getSheet_(SHEET_UJIAN).appendRow([id, judul, String(data.deskripsi || "").trim(), token, durasi, false, new Date()]);
  return { success: true, id: id, token: token, message: "Ujian dibuat (masih draft)." };
}

function aturUjian_(data) {
  var sh = getSheet_(SHEET_UJIAN);
  var values = sh.getDataRange().getValues();
  var idx = indexHeader_(values[0]);
  var cari = String(data.id || "");
  var token = String(data.token || "").trim().toUpperCase();
  var durasi = Math.floor(Number(data.durasi_menit) || 0);
  if (!/^[A-Z0-9]{4,12}$/.test(token)) return { success: false, message: "Token harus 4–12 huruf/angka." };
  if (durasi < 1 || durasi > 600) return { success: false, message: "Durasi harus 1–600 menit." };
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx.id]) === cari) {
      values[r][idx.token] = token;
      values[r][idx.durasi_menit] = durasi;
      sh.getRange(r + 1, 1, 1, values[0].length).setValues([values[r]]);
      return { success: true, message: "Token & waktu disimpan." };
    }
  }
  return { success: false, message: "Ujian tidak ditemukan." };
}

function setAktifUjian_(data) {
  var sh = getSheet_(SHEET_UJIAN);
  var values = sh.getDataRange().getValues();
  var idx = indexHeader_(values[0]);
  var cari = String(data.id || "");
  var aktif = Boolean(data.aktif);
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx.id]) === cari) {
      values[r][idx.aktif] = aktif;
      sh.getRange(r + 1, 1, 1, values[0].length).setValues([values[r]]);
      return { success: true, message: aktif ? "Ujian aktif." : "Ujian dinonaktifkan." };
    }
  }
  return { success: false, message: "Ujian tidak ditemukan." };
}

function hapusUjian_(data) {
  var cari = String(data.id || "");
  hapusBaris_(getSheet_(SHEET_UJIAN), "id", cari);
  hapusBaris_(getSheet_(SHEET_SOAL), "ujian_id", cari);
  hapusBaris_(getSheet_(SHEET_HASIL), "ujian_id", cari);
  return { success: true, message: "Ujian beserta soal & hasilnya dihapus." };
}

function hapusBaris_(sh, kolomId, nilai) {
  var values = sh.getDataRange().getValues();
  var idx = indexHeader_(values[0]);
  if (idx[kolomId] === undefined) return;
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idx[kolomId]]) === nilai) sh.deleteRow(r + 1);
  }
}

/* ------------------------------------------------------------------ */
/* SOAL                                                                */
/* ------------------------------------------------------------------ */

var SOAL_CONTOH = [
  { pertanyaan: "Nilai dari sin 30° adalah …", opsi_a: "1/2", opsi_b: "1/2√2", opsi_c: "1/2√3", opsi_d: "1", opsi_e: "0", kunci_jawaban: "A" },
  { pertanyaan: "Hasil dari 2⁵ adalah …", opsi_a: "10", opsi_b: "16", opsi_c: "25", opsi_d: "32", opsi_e: "64", kunci_jawaban: "D" },
  { pertanyaan: "Ibu kota Provinsi Jawa Barat adalah …", opsi_a: "Bandung", opsi_b: "Semarang", opsi_c: "Surabaya", opsi_d: "Serang", opsi_e: "Denpasar", kunci_jawaban: "A" },
  { pertanyaan: "Planet terdekat dengan Matahari adalah …", opsi_a: "Venus", opsi_b: "Bumi", opsi_c: "Mars", opsi_d: "Merkurius", opsi_e: "Jupiter", kunci_jawaban: "D" },
  { pertanyaan: "Nilai x yang memenuhi x + 7 = 12 adalah …", opsi_a: "3", opsi_b: "4", opsi_c: "5", opsi_d: "6", opsi_e: "7", kunci_jawaban: "C" },
];

function barisSoal_(row, idx, denganKunci) {
  var out = {
    id: String(row[idx.id]),
    ujian_id: String(row[idx.ujian_id] || ""),
    pertanyaan: String(row[idx.pertanyaan] || ""),
    opsi_a: String(row[idx.opsi_a] || ""),
    opsi_b: String(row[idx.opsi_b] || ""),
    opsi_c: String(row[idx.opsi_c] || ""),
    opsi_d: String(row[idx.opsi_d] || ""),
    opsi_e: String(row[idx.opsi_e] || ""),
  };
  if (denganKunci) out.kunci_jawaban = String(row[idx.kunci_jawaban] || "").trim().toUpperCase();
  return out;
}

/** Soal untuk siswa: TANPA token, TANPA kunci jawaban. */
function getSoal_(data) {
  var ujian = bacaBaris_(SHEET_UJIAN);
  var cari = String(data.id || "");
  var meta = null;
  for (var i = 0; i < ujian.rows.length; i++) {
    if (String(ujian.rows[i][ujian.idx.id]) === cari) {
      meta = barisUjian_(ujian.rows[i], ujian.idx, false);
      break;
    }
  }
  if (!meta) return { success: false, message: "Ujian tidak ditemukan." };
  if (!meta.aktif) return { success: false, message: "Ujian belum diaktifkan admin." };

  var soal = bacaBaris_(SHEET_SOAL);
  var daftar = [];
  soal.rows.forEach(function (row) {
    if (String(row[soal.idx.ujian_id]) === cari) daftar.push(barisSoal_(row, soal.idx, false));
  });
  return { success: true, ujian: meta, soal: daftar };
}

/** Soal untuk petugas: DENGAN kunci jawaban. */
function getSoalAdmin_(data) {
  var soal = bacaBaris_(SHEET_SOAL);
  var cari = String(data.ujian_id || "");
  var daftar = [];
  soal.rows.forEach(function (row) {
    if (String(row[soal.idx.ujian_id]) === cari) daftar.push(barisSoal_(row, soal.idx, true));
  });
  return { success: true, soal: daftar };
}

function tambahSoal_(data) {
  var ujianId = String(data.ujian_id || "");
  var pertanyaan = String(data.pertanyaan || "").trim();
  var wajib = ["opsi_a", "opsi_b", "opsi_c", "opsi_d"];
  for (var i = 0; i < wajib.length; i++) {
    if (!String(data[wajib[i]] || "").trim()) return { success: false, message: "Opsi A–D wajib diisi (opsi E opsional)." };
  }
  var kunci = String(data.kunci_jawaban || "").trim().toUpperCase();
  if (["A", "B", "C", "D", "E"].indexOf(kunci) === -1) return { success: false, message: "Kunci jawaban harus huruf A–E." };
  if (kunci === "E" && !String(data.opsi_e || "").trim()) return { success: false, message: "Opsi E kosong — kunci tidak boleh E." };
  if (!pertanyaan) return { success: false, message: "Pertanyaan wajib diisi." };
  var id = idBaru_("s");
  getSheet_(SHEET_SOAL).appendRow([
    id, ujianId, pertanyaan,
    String(data.opsi_a).trim(), String(data.opsi_b).trim(), String(data.opsi_c).trim(), String(data.opsi_d).trim(),
    String(data.opsi_e || "").trim(), kunci, new Date(),
  ]);
  return { success: true, id: id, message: "Soal ditambahkan." };
}

function tambahSoalContoh_(data) {
  var ujianId = String(data.ujian_id || "");
  SOAL_CONTOH.forEach(function (s) {
    getSheet_(SHEET_SOAL).appendRow([
      idBaru_("s"), ujianId, s.pertanyaan, s.opsi_a, s.opsi_b, s.opsi_c, s.opsi_d,
      s.opsi_e || "", s.kunci_jawaban, new Date(),
    ]);
  });
  return { success: true, message: SOAL_CONTOH.length + " soal contoh ditambahkan." };
}

function hapusSoal_(data) {
  hapusBaris_(getSheet_(SHEET_SOAL), "id", String(data.id || ""));
  return { success: true, message: "Soal dihapus." };
}

/* ------------------------------------------------------------------ */
/* HASIL (grading di server — siswa hanya mengirim huruf A–E)          */
/* ------------------------------------------------------------------ */

function submitJawaban_(data) {
  var ujianId = String(data.ujian_id || "");
  var nama = String(data.nama || "").trim();
  var kelas = String(data.kelas || "").trim();
  var token = String(data.token || "").trim().toUpperCase();
  var totalPelanggaran = Math.max(0, parseInt(data.total_pelanggaran, 10) || 0);
  var jawaban = data.jawaban || [];
  if (!ujianId) return { success: false, message: "Ujian tidak valid." };
  if (!nama || !kelas) return { success: false, message: "Nama dan kelas wajib diisi." };

  var meta = null;
  var ujian = bacaBaris_(SHEET_UJIAN);
  for (var i = 0; i < ujian.rows.length; i++) {
    if (String(ujian.rows[i][ujian.idx.id]) === ujianId) {
      meta = barisUjian_(ujian.rows[i], ujian.idx, true);
      break;
    }
  }
  if (!meta) return { success: false, message: "Ujian tidak ditemukan." };

  var soal = bacaBaris_(SHEET_SOAL);
  var kunciMap = {};
  var totalSoal = 0;
  soal.rows.forEach(function (row) {
    if (String(row[soal.idx.ujian_id]) === ujianId) {
      kunciMap[String(row[soal.idx.id])] = String(row[soal.idx.kunci_jawaban]).trim().toUpperCase();
      totalSoal++;
    }
  });

  var benar = 0;
  jawaban.forEach(function (item) {
    var idSoal = String(item.id_soal || "");
    var pilihan = String(item.pilihan || "").trim().toUpperCase();
    if (pilihan && kunciMap[idSoal] && kunciMap[idSoal] === pilihan) benar++;
  });

  var nilai = totalSoal > 0 ? Math.round((benar / totalSoal) * 100) : 0;
  getSheet_(SHEET_HASIL).appendRow([
    idBaru_("h"), ujianId, meta.judul, nama, kelas, token,
    benar, totalSoal, nilai, totalPelanggaran, new Date(),
  ]);

  return {
    success: true,
    nilai: nilai,
    benar: benar,
    total_soal: totalSoal,
    total_pelanggaran: totalPelanggaran,
    message: "Jawaban tersimpan.",
  };
}

function barisHasil_(row, idx) {
  return {
    id: String(row[idx.id]),
    ujian_id: String(row[idx.ujian_id] || ""),
    ujian_judul: String(row[idx.ujian_judul] || ""),
    nama: String(row[idx.nama] || ""),
    kelas: String(row[idx.kelas] || ""),
    token: String(row[idx.token] || ""),
    benar: Number(row[idx.benar]) || 0,
    total_soal: Number(row[idx.total_soal]) || 0,
    nilai: Number(row[idx.nilai]) || 0,
    total_pelanggaran: Number(row[idx.total_pelanggaran]) || 0,
    timestamp: row[idx.timestamp] ? String(row[idx.timestamp]) : "",
  };
}

function getHasil_(data) {
  var hasil = bacaBaris_(SHEET_HASIL);
  var cari = String(data.ujian_id || "");
  var daftar = [];
  hasil.rows.forEach(function (row) {
    if (String(row[hasil.idx.ujian_id]) === cari) daftar.push(barisHasil_(row, hasil.idx));
  });
  return { success: true, hasil: daftar };
}

function getHasilSaya_(data) {
  var cari = String(data.nama || "").trim().toLowerCase();
  var hasil = bacaBaris_(SHEET_HASIL);
  var daftar = [];
  hasil.rows.forEach(function (row) {
    if (String(row[hasil.idx.nama] || "").trim().toLowerCase() === cari) {
      daftar.push(barisHasil_(row, hasil.idx));
    }
  });
  return { success: true, hasil: daftar };
}

/* ------------------------------------------------------------------ */
/* AUDIT BUKA KUNCI (best-effort, hanya saat online)                   */
/* ------------------------------------------------------------------ */

function catatBukaKunci_(data) {
  getSheet_(SHEET_BUKA_KUNCI).appendRow([
    new Date(),
    String(data.ujian_id || ""),
    String(data.nama || ""),
    String(data.catatan || "PIN diverifikasi lokal (offline)"),
  ]);
  return { success: true };
}
