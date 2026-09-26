/**
 * ============================================================================
 * UjianAman — Google Apps Script (Backend Google Sheets)
 * ----------------------------------------------------------------------------
 * Berkas INI adalah varian backend Google Sheets sesuai permintaan asli.
 * Aplikasi yang berjalan di preview memakai Convex dengan KONTRAK YANG SAMA:
 *   - GET  ?action=getSoal          -> daftar soal TANPA kunci jawaban
 *   - POST action=submitJawaban     -> nilai dihitung di server, disimpan ke
 *                                      sheet "Hasil" (timestamp, nama, kelas,
 *                                      nilai, total_pelanggaran)
 *
 * STRUKTUR GOOGLE SHEETS
 * ----------------------
 * Sheet "Ujian":
 *   judul | token | durasi_menit | aktif
 *   (token & durasi_menit diset admin; aktif = TRUE/FALSE)
 *
 * Sheet "Soal":
 *   id_soal | pertanyaan | opsi_a | opsi_b | opsi_c | opsi_d | opsi_e | kunci_jawaban
 *   (opsi_e opsional; kunci_jawaban berupa huruf A–E)
 *
 * Sheet "Hasil":
 *   timestamp | nama | kelas | nilai | total_pelanggaran
 *   (yang disimpan dari jawaban siswa hanyalah huruf A–E — nilai dihitung
 *    di server GAS lalu disimpan ke sini bersama total_pelanggaran)
 *
 * CARA PASANG
 * 1. Siapkan Google Spreadsheet kosong, beri nama sheet "Soal" dan "Hasil".
 * 2. Extensions > Apps Script, tempel seluruh isi berkas ini.
 * 3. Jalankan fungsi setupSheet() sekali (beri izin) untuk membuat header.
 * 4. Isi sheet "Ujian" (judul, token, durasi_menit, aktif=TRUE) dan isi soal
 *    di sheet "Soal" (kunci jawaban A–E).
 * 5. Deploy > New deployment > Web app:
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Salin URL /exec.
 * 6. GET  (aman dibuka di browser / JSONP):
 *      {URL_EXEC}?action=getSoal&token=K7XM3P
 *    JSONP (aman dibaca dari domain lain):
 *      {URL_EXEC}?action=getSoal&token=K7XM3P&callback=proses
 * 7. POST (dari aplikasi siswa):
 *      fetch("{URL_EXEC}", {
 *        method: "POST",
 *        headers: { "Content-Type": "text/plain;charset=utf-8" },
 *        body: JSON.stringify({
 *          action: "submitJawaban",
 *          nama: "Ayu Lestari",
 *          kelas: "XII-IPA-2",
 *          total_pelanggaran: 1,
 *          jawaban: [{ id_soal: "1", pilihan: "B" }, ...]
 *        })
 *      });
 *    Catatan CORS: respons web app GAS tidak menyertakan header CORS untuk
 *    browser lintas origin, maka GET memakai JSONP (callback) dan POST
 *    dikirim dari aplikasi/skrip yang berjalan di origin yang sama atau dari
 *    sisi server. Kunci jawaban TIDAK PERNAH ikut dalam respons getSoal.
 * ============================================================================
 */

var SHEET_UJIAN = "Ujian";
var SHEET_SOAL = "Soal";
var SHEET_HASIL = "Hasil";

var HEADER_UJIAN = ["judul", "token", "durasi_menit", "aktif"];

var HEADER_SOAL = [
  "id_soal",
  "pertanyaan",
  "opsi_a",
  "opsi_b",
  "opsi_c",
  "opsi_d",
  "opsi_e",
  "kunci_jawaban",
];

var HEADER_HASIL = [
  "timestamp",
  "nama",
  "kelas",
  "nilai",
  "total_pelanggaran",
];

/** Membuat header kedua sheet bila belum ada (jalankan sekali). */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [ [ SHEET_UJIAN, HEADER_UJIAN ], [ SHEET_SOAL, HEADER_SOAL ], [ SHEET_HASIL, HEADER_HASIL ] ].forEach(
    function (item) {
      var sh = ss.getSheetByName(item[0]);
      if (!sh) sh = ss.insertSheet(item[0]);
      if (sh.getLastRow() === 0) {
        sh.appendRow(item[1]);
        sh.setFrozenRows(1);
      }
    }
  );
}

function getSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan.');
  return sh;
}

/** Peta header -> indeks kolom. */
function indexHeader_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    map[String(headerRow[i]).trim()] = i;
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* RESPON (JSON & JSONP)                                               */
/* ------------------------------------------------------------------ */

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function jsonp_(e, payload) {
  var out = JSON.stringify(payload);
  var cb =
    e && e.parameter && e.parameter.callback ? e.parameter.callback : null;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + out + ");").setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return json_(payload);
}

/* ------------------------------------------------------------------ */
/* GET: action=getSoal (KUNCI JAWABAN DISSEMBUNYIKAN)                  */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : "";
  try {
    if (action === "getSoal") {
      return jsonp_(e, getSoal_(e));
    }
    return jsonp_(e, {
      success: false,
      message: "Action tidak dikenal. Gunakan ?action=getSoal",
    });
  } catch (err) {
    return jsonp_(e, { success: false, message: String(err) });
  }
}

/**
 * Mengambil daftar soal untuk siswa.
 * - Wajib token ujian aktif dari sheet "Ujian" (diset admin).
 * - KOLOM kunci_jawaban TIDAK ikut dalam response demi keamanan ujian.
 */
function getSoal_(e) {
  var token =
    e && e.parameter ? String(e.parameter.token || "").trim().toUpperCase() : "";
  if (!token) throw new Error("Token ujian wajib diisi.");

  // Validasi token terhadap sheet "Ujian" yang sedang aktif.
  var ujSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UJIAN);
  if (!ujSh) throw new Error('Sheet "Ujian" belum ada. Jalankan setupSheet().');
  var ujValues = ujSh.getDataRange().getValues();
  if (ujValues.length < 2) throw new Error("Sheet Ujian masih kosong.");
  var ujIdx = indexHeader_(ujValues[0]);
  var valid = false;
  for (var u = 1; u < ujValues.length; u++) {
    var status = String(ujValues[u][ujIdx.aktif]).trim().toUpperCase();
    var aktif = status === "TRUE" || status === "YA" || status === "1";
    var tokenBaris = String(ujValues[u][ujIdx.token] || "").trim().toUpperCase();
    if (aktif && tokenBaris && tokenBaris === token) {
      valid = true;
      break;
    }
  }
  if (!valid) throw new Error("Token ujian salah atau ujian tidak aktif.");

  var sh = getSheet_(SHEET_SOAL);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return { success: true, jumlah: 0, soal: [] };
  }
  var idx = indexHeader_(values[0]);
  var soal = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = String(row[idx.id_soal]).trim();
    if (!id) continue;
    soal.push({
      id_soal: id,
      pertanyaan: String(row[idx.pertanyaan]),
      opsi_a: String(row[idx.opsi_a]),
      opsi_b: String(row[idx.opsi_b]),
      opsi_c: String(row[idx.opsi_c]),
      opsi_d: String(row[idx.opsi_d]),
      opsi_e: idx.opsi_e !== undefined ? String(row[idx.opsi_e] || "") : "",
      // kunci_jawaban: sengaja TIDAK disertakan
    });
  }

  return { success: true, jumlah: soal.length, soal: soal };
}

/* ------------------------------------------------------------------ */
/* POST: action=submitJawaban (NILAI DIHITUNG DI SERVER)               */
/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === "submitJawaban") {
      return json_(submitJawaban_(body));
    }
    return json_({ success: false, message: "Action tidak dikenal." });
  } catch (err) {
    return json_({ success: false, message: String(err) });
  }
}

/**
 * Mencocokkan jawaban siswa dengan kunci di sheet "Soal",
 * menghitung nilai, lalu menyimpannya ke sheet "Hasil".
 *
 * Payload:
 * {
 *   action: "submitJawaban",
 *   nama: "Ayu Lestari",
 *   kelas: "XII-IPA-2",
 *   total_pelanggaran: 1,
 *   jawaban: [{ id_soal: "1", pilihan: "B" }, ...]
 * }
 */
function submitJawaban_(payload) {
  var nama = String(payload.nama || "").trim();
  var kelas = String(payload.kelas || "").trim();
  var totalPelanggaran = Math.max(
    0,
    parseInt(payload.total_pelanggaran, 10) || 0
  );
  var jawaban = payload.jawaban || [];

  if (!nama || !kelas) {
    return { success: false, message: "Nama dan kelas wajib diisi." };
  }

  // Bangun peta kunci dari sheet Soal.
  var sh = getSheet_(SHEET_SOAL);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return { success: false, message: "Sheet Soal masih kosong." };
  }
  var idx = indexHeader_(values[0]);
  var kunci = {};
  var totalSoal = 0;
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][idx.id_soal]).trim();
    if (!id) continue;
    kunci[id] = String(values[r][idx.kunci_jawaban]).trim().toUpperCase();
    totalSoal++;
  }

  // Hitung jawaban benar.
  var benar = 0;
  for (var j = 0; j < jawaban.length; j++) {
    var item = jawaban[j];
    var idSoal = String(item.id_soal);
    var pilihan = String(item.pilihan || "").trim().toUpperCase();
    if (kunci[idSoal] && pilihan && kunci[idSoal] === pilihan) {
      benar++;
    }
  }

  var nilai = totalSoal > 0 ? Math.round((benar / totalSoal) * 100) : 0;

  // Simpan ke sheet Hasil: timestamp, nama, kelas, nilai, total_pelanggaran.
  var hasilSh = getSheet_(SHEET_HASIL);
  hasilSh.appendRow([
    new Date(),
    nama,
    kelas,
    nilai,
    totalPelanggaran,
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
