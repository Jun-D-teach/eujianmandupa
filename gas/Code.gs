/**
 * ============================================================================
 * UjianAman — Google Apps Script (Backend Google Sheets)
 * ----------------------------------------------------------------------------
 * SATU-SATUNYA backend aplikasi. Semua akun (admin/guru/siswa) dibuat &
 * diatur admin di sheet "Pengguna". Data siswa (NISN, nama, tgl lahir, kelas)
 * dikelola admin di sheet "Siswa" — daftar kelas ujian dibaca dari sini.
 *
 * STRUKTUR GOOGLE SHEETS (dibuat/ dilengkapi otomatis oleh pastikanStruktur_)
 * Ujian    : id | judul | deskripsi | token | durasi_menit | aktif | dibuat
 *            | tgl_mulai | sasar_jenis | sasar_nilai
 * Soal     : id | ujian_id | pertanyaan | opsi_a..e | kunci_jawaban | dibuat
 * Hasil    : id | ujian_id | ujian_judul | nama | kelas | token | benar |
 *            total_soal | nilai | total_pelanggaran | timestamp
 * Pengguna : id | username | password | nama | kelas | role | dibuat
 * Siswa    : id | nisn | nama | tgllahir | kelas | dibuat
 * BukaKunci: timestamp | ujian_id | nama | catatan
 * Pengaturan: kunci | nilai   (mis. kunci "pin_pengawas" → 6 angka)
 *
 * PENARGETAN UJIAN (sasar)
 *  - sasar_jenis ""          : semua tingkat & kelas (tanpa batasan)
 *  - sasar_jenis "tingkat"   : sasar_nilai = X | XI | XII (seluruh tingkat)
 *  - sasar_jenis "kelas"     : sasar_nilai = "X.1,X.2" (daftar kelas)
 *  - tgl_mulai               : "YYYY-MM-DDTHH:mm" (waktu sekolah). Gerbang
 *    waktu diperiksa di perangkat siswa (zona sama dengan admin); gerbang
 *    kelas/tingkat diperiksa di server saat unduh soal.
 *
 * Deploy: Deploy > New deployment > Web app — Execute as Me, access Anyone.
 * Semua action GET mendukung JSONP (&callback=fn) + payloadB64 (bebas CORS).
 *
 * KEAMANAN (per action):
 *  - Sesi ber-token: setelah login/setupAdmin server mengeluarkan token sesi
 *    "username|exp|hmac" (HMAC-SHA256, umur SESI_ADA_JAM jam). Klien mengirim
 *    kembali token itu di setiap panggilan (field "sesi"); role DIVALIDASI
 *    LANGSUNG dari sheet Pengguna, bukan dari klien.
 *  - Tabel AKSES_ membatasi action per peran; action tanpa entri terbuka.
 *  - getSoal_ (unduh soal) WAJIB menyertakan token ujian — dicocokkan dengan
 *    kolom token di sheet Ujian sebelum soal dikirim.
 * ============================================================================
 */

var SHEET_UJIAN = "Ujian";
var SHEET_SOAL = "Soal";
var SHEET_HASIL = "Hasil";
var SHEET_PENGGUNA = "Pengguna";
var SHEET_SISWA = "Siswa";
var SHEET_BUKA_KUNCI = "BukaKunci";
var SHEET_PENGATURAN = "Pengaturan";

var HEADER_UJIAN = ["id", "judul", "deskripsi", "token", "durasi_menit", "aktif", "dibuat", "tgl_mulai", "sasar_jenis", "sasar_nilai"];
var HEADER_SOAL = ["id", "ujian_id", "pertanyaan", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "opsi_e", "kunci_jawaban", "dibuat"];
var HEADER_HASIL = ["id", "ujian_id", "ujian_judul", "nama", "kelas", "token", "benar", "total_soal", "nilai", "total_pelanggaran", "timestamp"];
var HEADER_PENGGUNA = ["id", "username", "password", "nama", "kelas", "role", "dibuat"];
var HEADER_SISWA = ["id", "nisn", "nama", "tgllahir", "kelas", "dibuat"];
var HEADER_BUKA_KUNCI = ["timestamp", "ujian_id", "nama", "catatan"];
var HEADER_PENGATURAN = ["kunci", "nilai"];

/** Pastikan semua sheet ada & header lengkap (menambah kolom baru bila perlu). */
function pastikanStruktur_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var defs = [
    [SHEET_UJIAN, HEADER_UJIAN],
    [SHEET_SOAL, HEADER_SOAL],
    [SHEET_HASIL, HEADER_HASIL],
    [SHEET_PENGGUNA, HEADER_PENGGUNA],
    [SHEET_SISWA, HEADER_SISWA],
    [SHEET_BUKA_KUNCI, HEADER_BUKA_KUNCI],
    [SHEET_PENGATURAN, HEADER_PENGATURAN],
  ];
  defs.forEach(function (item) {
    var sh = ss.getSheetByName(item[0]);
    if (!sh) sh = ss.insertSheet(item[0]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(item[1]);
      sh.setFrozenRows(1);
      return;
    }
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var ada = {};
    head.forEach(function (h) { ada[String(h).trim()] = true; });
    var kurang = item[1].filter(function (h) { return !ada[h]; });
    if (kurang.length) {
      sh.getRange(1, sh.getLastColumn() + 1, 1, kurang.length).setValues([kurang]);
      sh.setFrozenRows(1);
    }
  });
}

/** Jalankan sekali dari editor bila perlu — sama dengan yang dipanggil router. */
function setupSheet() {
  pastikanStruktur_();
  return { success: true, message: "Sheet siap." };
}

function getSheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) {
    pastikanStruktur_();
    sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
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
/* KEAMANAN — sesi ber-token (HMAC) + matriks akses per peran           */
/* ------------------------------------------------------------------ */

var SESI_ADA_JAM = 12; // umur token sesi (jam) — habis → login ulang.
var KUNCI_SECRET = "server_secret"; // kunci sheet Pengaturan untuk HMAC.

/** Peran minimum yang boleh menjalankan tiap action. Tanpa entri = terbuka
 *  (ping/login/setupAdmin). Tingkatan: siswa < guru < admin. */
var AKSES_ = {
  // Siswa ke atas (dipakai setelah login akun apa pun).
  getUjianSiswa: 0, getUjianInfo: 0, getSoal: 0, getHasilSaya: 0,
  submitJawaban: 0, catatBukaKunci: 0,
  // Guru/admin (petugas).
  getUjian: 1, getSoalAdmin: 1, getHasil: 1, getSiswa: 1, getKelasList: 1,
  tambahSiswa: 1, ubahSiswa: 1, hapusSiswa: 1, importSiswa: 1, buatAkunSiswa: 1,
  buatUjian: 1, aturUjian: 1, setAktifUjian: 1, hapusUjian: 1,
  tambahSoal: 1, tambahSoalContoh: 1, hapusSoal: 1,
  // Admin saja.
  getPengaturan: 2, aturPin: 2, buatPengguna: 2, ubahPeran: 2, getPengguna: 2,
};

function tingkatPeran_(role) {
  var r = String(role || "").trim().toLowerCase();
  if (r === "admin") return 2;
  if (r === "guru") return 1;
  return 0;
}

/** Secret acak sekali — disimpan di sheet Pengaturan key "server_secret". */
function serverSecret_() {
  var s = bacaPengaturan_(KUNCI_SECRET, "");
  if (s) return s;
  s = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  simpanPengaturan_(KUNCI_SECRET, s);
  return s;
}

function hmacHex_(kunci, pesan) {
  var bytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_256, pesan, kunci
  );
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    hex += (bytes[i] < 16 ? "0" : "") + (bytes[i] & 0xff).toString(16);
  }
  return hex;
}

/** Token sesi "username|expMs|hmac" untuk pengguna yang baru login. */
function buatSesi_(username) {
  var exp = Date.now() + SESI_ADA_JAM * 3600 * 1000;
  var inti = String(username).toLowerCase() + "|" + exp;
  var tanda = hmacHex_(serverSecret_(), inti);
  return inti + "|" + tanda;
}

/**
 * Validasi token sesi + peran. Role dibaca LANGSUNG dari sheet Pengguna —
 * klien tidak dipercaya. Hasil: {ok, pesan?, perlu_login?}.
 */
function validasiSesi_(token, peranDiizinkan) {
  var t = String(token || "").trim();
  if (!t) return { ok: false, pesan: "Sesi habis — silakan login.", perlu_login: true };
  var bagi = t.split("|");
  if (bagi.length !== 3) return { ok: false, pesan: "Sesi tidak sah — silakan login.", perlu_login: true };
  var username = bagi[0], exp = Number(bagi[1]), tanda = bagi[2];
  if (!isFinite(exp) || exp < Date.now()) {
    return { ok: false, pesan: "Sesi kedaluwarsa — silakan login ulang.", perlu_login: true };
  }
  if (hmacHex_(serverSecret_(), username + "|" + bagi[1]) !== tanda) {
    return { ok: false, pesan: "Sesi tidak sah — silakan login ulang.", perlu_login: true };
  }
  // Role terkini dari sheet (admin bisa mengubah peran kapan saja).
  var role = "";
  var users = bacaBaris_(SHEET_PENGGUNA);
  for (var i = 0; i < users.rows.length; i++) {
    if (String(users.rows[i][users.idx.username]).trim().toLowerCase() === username) {
      role = String(users.rows[i][users.idx.role] || "").trim().toLowerCase();
      break;
    }
  }
  if (!role) return { ok: false, pesan: "Akun tidak ditemukan — silakan login ulang.", perlu_login: true };
  if (tingkatPeran_(role) < peranDiizinkan) {
    return { ok: false, pesan: "Akses ditolak — peran " + role + " tidak diizinkan untuk aksi ini." };
  }
  return { ok: true, username: username, role: role };
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
    pastikanStruktur_();
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
    pastikanStruktur_();
    var body = JSON.parse(e.postData.contents);
    return kirimOutput_(e, jalankan_(String(body.action || ""), body));
  } catch (err) {
    return kirimOutput_(e, { success: false, message: String(err && err.message ? err.message : err) });
  }
}

function jalankan_(action, data) {
  // Gerbang kredensial: sesi wajib kecuali action yang terbuka (tanpa entri).
  if (AKSES_.hasOwnProperty(action)) {
    var cek = validasiSesi_(data && data.sesi, AKSES_[action]);
    if (!cek.ok) return { success: false, message: cek.pesan, perlu_login: !!cek.perlu_login };
  }
  switch (action) {
    case "ping": return ping_();
    case "setupAdmin": return setupAdmin_(data);
    case "login": return login_(data);
    case "getUjianSiswa": return getUjianSiswa_(data);
    case "getUjianInfo": return getUjianInfo_(data);
    case "getUjian": return getUjian_();
    case "getSoal": return getSoal_(data);
    case "getSoalAdmin": return getSoalAdmin_(data);
    case "getHasil": return getHasil_(data);
    case "getHasilSaya": return getHasilSaya_(data);
    case "getPengguna": return getPengguna_();
    case "getSiswa": return getSiswa_();
    case "getKelasList": return getKelasList_();
    case "tambahSiswa": return tambahSiswa_(data);
    case "ubahSiswa": return ubahSiswa_(data);
    case "hapusSiswa": return hapusSiswa_(data);
    case "importSiswa": return importSiswa_(data);
    case "buatAkunSiswa": return buatAkunSiswa_(data);
    case "buatUjian": return buatUjian_(data);
    case "aturUjian": return aturUjian_(data);
    case "setAktifUjian": return setAktifUjian_(data);
    case "hapusUjian": return hapusUjian_(data);
    case "tambahSoal": return tambahSoal_(data);
    case "tambahSoalContoh": return tambahSoalContoh_(data);
    case "hapusSoal": return hapusSoal_(data);
    case "submitJawaban": return submitJawaban_(data);
    case "catatBukaKunci": return catatBukaKunci_(data);
    case "getPengaturan": return getPengaturan_();
    case "aturPin": return aturPin_(data);
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

  var ujianId = idBaru_("u");
  getSheet_(SHEET_UJIAN).appendRow([
    ujianId, "Contoh Ujian — Trigonometri", "Ujian percobaan 5 soal pilihan ganda.",
    buatTokenAcak_(), 60, true, new Date(), "", "", "",
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
    sesi: buatSesi_(username),
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
        sesi: buatSesi_(u),
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

/**
 * Buat akun login massal dari sheet Siswa (guru/admin).
 * Username = NISN, password = tanggal lahir DDMMYYYY (cth. 12 Mei 2008 ->
 * 12052008). Akun yang sudah ada dilewati — password tidak diubah. Siswa
 * tanpa tanggal lahir memakai password bawaan "siswa123".
 */
function buatAkunSiswa_(data) {
  var siswa = bacaBaris_(SHEET_SISWA);
  if (!siswa.rows.length) return { success: false, message: "Sheet Siswa masih kosong — impor data dulu." };
  var users = bacaBaris_(SHEET_PENGGUNA);
  var sudahAda = {};
  users.rows.forEach(function (row) {
    sudahAda[String(row[users.idx.username]).trim().toLowerCase()] = true;
  });
  var sh = getSheet_(SHEET_PENGGUNA);
  var dibuat = 0, lewati = 0, tanpaTgl = 0;
  siswa.rows.forEach(function (row) {
    var nisn = String(row[siswa.idx.nisn] || "").trim();
    var nama = String(row[siswa.idx.nama] || "").trim();
    var kelas = String(row[siswa.idx.kelas] || "").trim();
    var tgl = teksTgl_(row[siswa.idx.tgllahir]);
    if (!nisn || sudahAda[nisn.toLowerCase()]) { lewati++; return; }
    var password = "";
    var m = tgl.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      password = m[3] + m[2] + m[1]; // YYYY-MM-DD -> DDMMYYYY
    } else if (/^\d{8}$/.test(tgl)) {
      password = tgl; // sudah DDMMYYYY
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(tgl)) {
      var p = tgl.split("/");
      password = p[2] + p[1] + p[0]; // DD/MM/YYYY -> DDMMYYYY
    } else {
      tanpaTgl++;
      password = "siswa123";
    }
    sh.appendRow([idBaru_("p"), nisn, password, nama || nisn, kelas, "siswa", new Date()]);
    sudahAda[nisn.toLowerCase()] = true;
    dibuat++;
  });
  var pesan = dibuat + " akun siswa dibuat (username = NISN, password = tgl lahir DDMMYYYY).";
  if (lewati) pesan += " " + lewati + " dilewati (sudah ada / NISN kosong).";
  if (tanpaTgl) pesan += " " + tanpaTgl + " tanpa tgl lahir memakai password \"siswa123\".";
  return { success: true, dibuat: dibuat, lewati: lewati, tanpa_tgl: tanpaTgl, message: pesan };
}

function getPengguna_() {
  var users = bacaBaris_(SHEET_PENGGUNA);
  var daftar = users.rows.map(function (row) {
    return {
      id: String(row[users.idx.id]),
      username: String(row[users.idx.username] || ""),
      password: String(row[users.idx.password] || ""),
      nama: String(row[users.idx.nama] || ""),
      kelas: String(row[users.idx.kelas] || ""),
      role: String(row[users.idx.role] || "siswa"),
    };
  });
  return { success: true, pengguna: daftar };
}

/* ------------------------------------------------------------------ */
/* DATA SISWA (NISN, nama, tgl lahir, kelas)                           */
/* ------------------------------------------------------------------ */

/** Normalisasi nilai sel tanggal lahir -> "YYYY-MM-DD".
 *  Sheets sering mengubah teks tanggal menjadi objek Date otomatis; tanpa ini
 *  tampilan & password turunan tanggal lahir jadi rusak. */
function teksTgl_(v) {
  if (v instanceof Date) {
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return v.getFullYear() + "-" + p(v.getMonth() + 1) + "-" + p(v.getDate());
  }
  return String(v || "").trim();
}

function barisSiswa_(row, idx) {
  return {
    id: String(row[idx.id]),
    nisn: String(row[idx.nisn] || "").trim(),
    nama: String(row[idx.nama] || "").trim(),
    tgllahir: idx.tgllahir !== undefined ? teksTgl_(row[idx.tgllahir]) : "",
    kelas: String(row[idx.kelas] || "").trim(),
  };
}

function getSiswa_() {
  var siswa = bacaBaris_(SHEET_SISWA);
  return { success: true, siswa: siswa.rows.map(function (row) { return barisSiswa_(row, siswa.idx); }) };
}

function validasiSiswa_(data) {
  var nisn = String(data.nisn || "").trim();
  var nama = String(data.nama || "").trim();
  var kelas = String(data.kelas || "").trim();
  if (!nisn) return { error: "NISN wajib diisi." };
  if (!nama) return { error: "Nama siswa wajib diisi." };
  if (!kelas) return { error: "Kelas wajib diisi (cth. X.1)." };
  return {
    nisn: nisn,
    nama: nama,
    tgllahir: String(data.tgllahir || "").trim(),
    kelas: kelas,
  };
}

function tambahSiswa_(data) {
  var v = validasiSiswa_(data);
  if (v.error) return { success: false, message: v.error };
  var siswa = bacaBaris_(SHEET_SISWA);
  for (var i = 0; i < siswa.rows.length; i++) {
    if (String(siswa.rows[i][siswa.idx.nisn]).trim() === v.nisn) {
      return { success: false, message: 'NISN "' + v.nisn + '" sudah terdaftar (' + String(siswa.rows[i][siswa.idx.nama]) + ")." };
    }
  }
  var id = idBaru_("sw");
  getSheet_(SHEET_SISWA).appendRow([id, v.nisn, v.nama, v.tgllahir, v.kelas, new Date()]);
  return { success: true, id: id, message: 'Siswa "' + v.nama + '" ditambahkan.' };
}

function ubahSiswa_(data) {
  var v = validasiSiswa_(data);
  if (v.error) return { success: false, message: v.error };
  var sh = getSheet_(SHEET_SISWA);
  var values = sh.getDataRange().getValues();
  var idx = indexHeader_(values[0]);
  var cari = String(data.id || "");
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx.id]) === cari) {
      values[r][idx.nisn] = v.nisn;
      values[r][idx.nama] = v.nama;
      values[r][idx.tgllahir] = v.tgllahir;
      values[r][idx.kelas] = v.kelas;
      sh.getRange(r + 1, 1, 1, values[0].length).setValues([values[r]]);
      return { success: true, message: "Data siswa diperbarui." };
    }
  }
  return { success: false, message: "Siswa tidak ditemukan." };
}

function hapusSiswa_(data) {
  hapusBaris_(getSheet_(SHEET_SISWA), "id", String(data.id || ""));
  return { success: true, message: "Siswa dihapus." };
}

/**
 * Impor massal dari tempelan Excel/CSV.
 * data.rows = [["123","Ayu","2008-05-12","X.1"], ...] (tab/koma dipisah klien).
 */
function importSiswa_(data) {
  var rows = data.rows || [];
  if (!rows.length) return { success: false, message: "Tidak ada baris untuk diimpor." };
  var siswa = bacaBaris_(SHEET_SISWA);
  var adaNisn = {};
  siswa.rows.forEach(function (row) {
    adaNisn[String(row[siswa.idx.nisn]).trim()] = true;
  });
  var sh = getSheet_(SHEET_SISWA);
  var masuk = 0, lewati = 0;
  rows.forEach(function (r) {
    var nisn = String(r[0] || "").trim();
    var nama = String(r[1] || "").trim();
    var tgllahir = String(r[2] || "").trim();
    var kelas = String(r[3] || "").trim();
    if (!nisn || !nama || !kelas || adaNisn[nisn]) { lewati++; return; }
    adaNisn[nisn] = true;
    sh.appendRow([idBaru_("sw"), nisn, nama, tgllahir, kelas, new Date()]);
    masuk++;
  });
  return {
    success: true,
    masuk: masuk,
    lewati: lewati,
    message: masuk + " siswa diimpor, " + lewati + " dilewati (kosong/NISN duplikat).",
  };
}

/** Daftar kelas & tingkat unik — dari sheet Siswa (+ kelas akun Pengguna). */
function getKelasList_() {
  var urutTingkat = ["X", "XI", "XII"];
  var kelas = {};
  var s = bacaBaris_(SHEET_SISWA);
  s.rows.forEach(function (row) {
    var k = String(row[s.idx.kelas] || "").trim();
    if (k) kelas[k] = true;
  });
  var p = bacaBaris_(SHEET_PENGGUNA);
  p.rows.forEach(function (row) {
    var k = String(row[p.idx.kelas] || "").trim();
    if (k) kelas[k] = true;
  });
  var daftar = Object.keys(kelas).sort(function (a, b) {
    var ta = urutTingkat.indexOf(tingkatDari_(a));
    var tb = urutTingkat.indexOf(tingkatDari_(b));
    if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
    return a.localeCompare(b, "id", { numeric: true });
  });
  var tingkat = {};
  daftar.forEach(function (k) { tingkat[tingkatDari_(k)] = true; });
  var daftarTingkat = Object.keys(tingkat).sort(function (a, b) {
    var ia = urutTingkat.indexOf(a);
    var ib = urutTingkat.indexOf(b);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  return { success: true, kelas: daftar, tingkat: daftarTingkat };
}

/* ------------------------------------------------------------------ */
/* UJIAN + PENARGETAN (tingkat / kelas)                                */
/* ------------------------------------------------------------------ */

function hitungSoal_(ujianId) {
  var soal = bacaBaris_(SHEET_SOAL);
  var n = 0;
  soal.rows.forEach(function (row) {
    if (String(row[soal.idx.ujian_id]) === ujianId) n++;
  });
  return n;
}

/** "X.2" -> "X" (tingkat = bagian sebelum titik pertama). */
function tingkatDari_(kelas) {
  var k = String(kelas || "").trim().toUpperCase();
  if (!k) return "";
  var titik = k.indexOf(".");
  return titik > 0 ? k.slice(0, titik).trim() : k;
}

function sasaranLabel_(jenis, nilai) {
  jenis = String(jenis || "").trim().toLowerCase();
  nilai = String(nilai || "").trim();
  if (!jenis || !nilai) return "Semua tingkat & kelas";
  if (jenis === "tingkat") return "Seluruh tingkat " + nilai.toUpperCase();
  return "Kelas: " + nilai;
}

/** Cocokkan kelas siswa dengan sasaran ujian. */
function cocokSasar_(u, kelas) {
  var jenis = String(u.sasar_jenis || "").trim().toLowerCase();
  var nilai = String(u.sasar_nilai || "").trim();
  if (!jenis || !nilai) return true; // tanpa batasan
  kelas = String(kelas || "").trim().toUpperCase();
  if (!kelas) return false;
  if (jenis === "tingkat") return tingkatDari_(kelas) === nilai.toUpperCase();
  var daftar = nilai.split(",").map(function (s) { return s.trim().toUpperCase(); });
  return daftar.indexOf(kelas) !== -1;
}

function barisUjian_(row, idx, sertakanToken, kelasSiswa) {
  var id = String(row[idx.id]);
  var u = {
    id: id,
    judul: String(row[idx.judul] || ""),
    deskripsi: String(row[idx.deskripsi] || ""),
    durasi_menit: Number(row[idx.durasi_menit]) || 60,
    aktif: String(row[idx.aktif]).trim().toUpperCase() === "TRUE",
    jumlah_soal: hitungSoal_(id),
    tgl_mulai: idx.tgl_mulai !== undefined ? String(row[idx.tgl_mulai] || "").trim() : "",
    sasar_jenis: idx.sasar_jenis !== undefined ? String(row[idx.sasar_jenis] || "").trim() : "",
    sasar_nilai: idx.sasar_nilai !== undefined ? String(row[idx.sasar_nilai] || "").trim() : "",
  };
  u.sasaran = sasaranLabel_(u.sasar_jenis, u.sasar_nilai);
  u.boleh = kelasSiswa === undefined ? true : cocokSasar_(u, kelasSiswa);
  if (sertakanToken) u.token = String(row[idx.token] || "");
  return u;
}

/** Daftar ujian aktif untuk siswa (tanpa token) + kelayakan per kelas. */
function getUjianSiswa_(data) {
  var kelas = String((data && data.kelas) || "").trim();
  var ujian = bacaBaris_(SHEET_UJIAN);
  var daftar = [];
  ujian.rows.forEach(function (row) {
    var u = barisUjian_(row, ujian.idx, false, kelas);
    if (u.aktif) daftar.push(u);
  });
  return { success: true, ujian: daftar };
}

/** Info satu ujian untuk siswa (tanpa token, tanpa gerbang kelas — info saja). */
function getUjianInfo_(data) {
  var ujian = bacaBaris_(SHEET_UJIAN);
  var cari = String(data.id || "");
  for (var i = 0; i < ujian.rows.length; i++) {
    if (String(ujian.rows[i][ujian.idx.id]) === cari) {
      var u = barisUjian_(ujian.rows[i], ujian.idx, false, undefined);
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
    ujian: ujian.rows.map(function (row) { return barisUjian_(row, ujian.idx, true, undefined); }),
  };
}

function validasiSasar_(jenis, nilai) {
  jenis = String(jenis || "").trim().toLowerCase();
  nilai = String(nilai || "").trim();
  if (!jenis) return { jenis: "", nilai: "" };
  if (jenis === "tingkat") {
    var t = nilai.toUpperCase();
    if (["X", "XI", "XII"].indexOf(t) === -1) return { error: "Tingkat harus X, XI, atau XII." };
    return { jenis: "tingkat", nilai: t };
  }
  if (jenis === "kelas") {
    if (!nilai) return { error: "Pilih minimal satu kelas." };
    var bersih = nilai.split(",").map(function (s) { return s.trim(); }).filter(Boolean).join(",");
    if (!bersih) return { error: "Pilih minimal satu kelas." };
    return { jenis: "kelas", nilai: bersih };
  }
  return { error: "Jenis sasaran tidak valid." };
}

function validasiTglMulai_(nilai) {
  var t = String(nilai || "").trim();
  if (!t) return "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) {
    throw new Error("Format tanggal/jam mulai tidak valid.");
  }
  return t.slice(0, 16);
}

function buatUjian_(data) {
  var judul = String(data.judul || "").trim();
  if (!judul) return { success: false, message: "Judul ujian wajib diisi." };
  var token = String(data.token || "").trim().toUpperCase() || buatTokenAcak_();
  if (!/^[A-Z0-9]{4,12}$/.test(token)) return { success: false, message: "Token harus 4–12 huruf/angka tanpa spasi." };
  var durasi = Math.floor(Number(data.durasi_menit) || 60);
  if (durasi < 1 || durasi > 600) return { success: false, message: "Durasi harus 1–600 menit." };
  var sasar;
  try {
    sasar = validasiSasar_(data.sasar_jenis, data.sasar_nilai);
    if (sasar.error) return { success: false, message: sasar.error };
    var tgl = validasiTglMulai_(data.tgl_mulai);
    var id = idBaru_("u");
    getSheet_(SHEET_UJIAN).appendRow([id, judul, String(data.deskripsi || "").trim(), token, durasi, false, new Date(), tgl, sasar.jenis, sasar.nilai]);
    return { success: true, id: id, token: token, message: "Ujian dibuat (masih draft)." };
  } catch (err) {
    return { success: false, message: String(err && err.message ? err.message : err) };
  }
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
  var sasar = validasiSasar_(data.sasar_jenis, data.sasar_nilai);
  if (sasar.error) return { success: false, message: sasar.error };
  var tgl;
  try {
    tgl = validasiTglMulai_(data.tgl_mulai);
  } catch (err) {
    return { success: false, message: String(err && err.message ? err.message : err) };
  }
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx.id]) === cari) {
      values[r][idx.token] = token;
      values[r][idx.durasi_menit] = durasi;
      values[r][idx.tgl_mulai] = tgl;
      values[r][idx.sasar_jenis] = sasar.jenis;
      values[r][idx.sasar_nilai] = sasar.nilai;
      sh.getRange(r + 1, 1, 1, values[0].length).setValues([values[r]]);
      return { success: true, message: "Pengaturan ujian disimpan." };
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

/**
 * Soal untuk siswa: TANPA token, TANPA kunci.
 * Gerbang: ujian aktif + kelas/tingkat sesuai sasaran (data.kelas).
 * Gerbang tanggal/jam diperiksa di perangkat siswa (zona waktu sekolah).
 */
function getSoal_(data) {
  var ujian = bacaBaris_(SHEET_UJIAN);
  var cari = String(data.id || "");
  var kelas = String(data.kelas || "").trim();
  // TOKEN UJIAN WAJIB saat sinkron/unduh — dicocokkan dengan kolom token.
  var token = String(data.token || "").trim().toUpperCase();
  if (!token) {
    return { success: false, message: "Token ujian wajib diisi untuk mengunduh soal." };
  }
  var meta = null;
  for (var i = 0; i < ujian.rows.length; i++) {
    if (String(ujian.rows[i][ujian.idx.id]) === cari) {
      meta = barisUjian_(ujian.rows[i], ujian.idx, false, kelas || undefined);
      // Kolom token diambil langsung dari baris (barisUjian_ tak menyertakannya).
      meta._token_asli = String(ujian.rows[i][ujian.idx.token] || "").trim().toUpperCase();
      break;
    }
  }
  if (!meta) return { success: false, message: "Ujian tidak ditemukan." };
  if (meta._token_asli !== token) {
    return { success: false, message: "Token ujian salah. Minta token yang benar dari pengawas/admin." };
  }
  if (!meta.aktif) return { success: false, message: "Ujian belum diaktifkan admin." };
  if (!meta.boleh) {
    return {
      success: false,
      message: meta.sasaran + " — kelasmu tidak terdaftar untuk ujian ini." +
        (kelas ? "" : " Lengkapi kelas pada data siswa/akunmu."),
    };
  }

  var soal = bacaBaris_(SHEET_SOAL);
  var daftar = [];
  soal.rows.forEach(function (row) {
    if (String(row[soal.idx.ujian_id]) === cari) daftar.push(barisSoal_(row, soal.idx, false));
  });
  // PIN pengawas ikut dikirim agar layar kunci bisa dibuka offline.
  return { success: true, ujian: meta, soal: daftar, pin_pengawas: pinPengawas_() };
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
      meta = barisUjian_(ujian.rows[i], ujian.idx, true, kelas);
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
/* PENGATURAN (sheet "Pengaturan" — pasangan kunci | nilai)            */
/* ------------------------------------------------------------------ */

var PIN_BAWAAN = "123456";

function bacaPengaturan_(kunci, bawaan) {
  try {
    // Dibaca LANGSUNG dari sheet — JANGAN lewat bacaBaris_() karena sheet
    // Pengaturan tidak punya kolom "id" (bacaBaris_ melewatkan baris tanpa id,
    // sehingga selalu kosong → secret/PIN terus dianggap belum diatur).
    var sh = getSheet_(SHEET_PENGATURAN);
    var values = sh.getDataRange().getValues();
    var idx = indexHeader_(values[0]);
    if (idx.kunci === undefined || idx.nilai === undefined) return bawaan;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idx.kunci]).trim() === kunci) {
        var v = String(values[r][idx.nilai] || "").trim();
        if (v) return v;
      }
    }
  } catch (err) { /* sheet belum siap — pakai bawaan */ }
  return bawaan;
}

function simpanPengaturan_(kunci, nilai) {
  var sh = getSheet_(SHEET_PENGATURAN);
  var values = sh.getDataRange().getValues();
  var idx = indexHeader_(values[0]);
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idx.kunci]).trim() === kunci) {
      values[r][idx.nilai] = nilai;
      sh.getRange(r + 1, 1, 1, values[0].length).setValues([values[r]]);
      return;
    }
  }
  sh.appendRow([kunci, nilai]);
}

function pinPengawas_() {
  var pin = bacaPengaturan_("pin_pengawas", PIN_BAWAAN);
  return /^\d{6}$/.test(pin) ? pin : PIN_BAWAAN;
}

function getPengaturan_() {
  return { success: true, pin_pengawas: pinPengawas_() };
}

function aturPin_(data) {
  var pin = String(data.pin || "").trim();
  var ulang = String(data.pin_ulang || data.pin || "").trim();
  if (!/^\d{6}$/.test(pin)) return { success: false, message: "PIN harus tepat 6 angka." };
  if (pin !== ulang) return { success: false, message: "PIN dan konfirmasi PIN tidak sama." };
  simpanPengaturan_("pin_pengawas", pin);
  return { success: true, message: "PIN buka blokir diperbarui." };
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
