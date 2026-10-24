<?php
/**
 * ============================================================================
 * UjianAman — Backend PHP + MySQL (pengganti Google Apps Script)
 * ----------------------------------------------------------------------------
 * SATU-SATUNYA endpoint: semua aksi aplikasi lewat file ini.
 *  - Method POST dengan body JSON: { action, sesi, ...data }
 *  - Method GET  : ?action=ping (tes cepat dari browser)
 *  - Tabel dibuat OTOMATIS saat pertama kali dipanggil.
 *
 * KEAMANAN (sama persis dengan versi GAS lama):
 *  - Token sesi "username|exp|hmac" (HMAC-SHA256, umur 12 jam) diterbitkan
 *    saat login; peran DIVALIDASI langsung dari tabel pengguna.
 *  - Tabel $AKSES membatasi aksi per peran (0 siswa, 1 guru, 2 admin).
 *  - getSoal (unduh soal) izin bagikan dari admin — TANPA token; token
 *    diverifikasi siswa saat Mulai Ujian (bandingkan hash SHA-256).
 * ============================================================================
 */

require __DIR__ . '/config.php';

date_default_timezone_set(defined('APP_ZONE') ? APP_ZONE : 'Asia/Jakarta');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

/* ------------------------------------------------------------------ */
/* Database (PDO)                                                      */
/* ------------------------------------------------------------------ */

function konfigurasiKosong(): bool
{
    return DB_NAME === 'ISI_NAMA_DATABASE'
        || DB_USER === 'ISI_USERNAME_DATABASE';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    if (konfigurasiKosong()) {
        throw new RuntimeException(
            'Database belum dikonfigurasi — isi api/config.php (DB_NAME, DB_USER, DB_PASS) lalu upload ulang.'
        );
    }

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[UjianAman] Koneksi DB gagal: ' . $e->getMessage());
        throw new RuntimeException(
            'Tidak bisa terhubung ke database. Periksa nama database, user, dan password di api/config.php.'
        );
    }
    return $pdo;
}

/** Ambil semua baris. */
function semua(string $sql, array $p = []): array
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st->fetchAll();
}

/** Ambil satu baris (atau null). */
function satu(string $sql, array $p = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($p);
    $r = $st->fetch();
    return $r === false ? null : $r;
}

/** Eksekusi perintah tulis; mengembalikan affected rows. */
function jalan(string $sql, array $p = []): int
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st->rowCount();
}

/* ------------------------------------------------------------------ */
/* Struktur tabel (dibuat otomatis, aman diulang)                       */
/* ------------------------------------------------------------------ */

function pastikanStruktur(): void
{
    static $siap = false;
    if ($siap) return;

    $ddl = [
        "CREATE TABLE IF NOT EXISTS pengguna (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            username VARCHAR(64) NOT NULL,
            password VARCHAR(128) NOT NULL DEFAULT '',
            nama VARCHAR(160) NOT NULL DEFAULT '',
            kelas VARCHAR(64) NOT NULL DEFAULT '',
            role VARCHAR(16) NOT NULL DEFAULT 'siswa',
            dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pengguna_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS siswa (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            nisn VARCHAR(32) NOT NULL,
            nama VARCHAR(160) NOT NULL DEFAULT '',
            tgllahir VARCHAR(32) NOT NULL DEFAULT '',
            kelas VARCHAR(64) NOT NULL DEFAULT '',
            dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_siswa_nisn (nisn)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS guru (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            nip VARCHAR(32) NOT NULL,
            nama VARCHAR(160) NOT NULL DEFAULT '',
            mapel VARCHAR(100) NOT NULL DEFAULT '',
            password VARCHAR(64) NOT NULL DEFAULT 'guru123',
            dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_guru_nip (nip)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS ujian (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            judul VARCHAR(200) NOT NULL DEFAULT '',
            deskripsi TEXT NULL,
            token VARCHAR(12) NOT NULL DEFAULT '',
            durasi_menit INT NOT NULL DEFAULT 60,
            aktif TINYINT(1) NOT NULL DEFAULT 0,
            boleh_unduh TINYINT(1) NOT NULL DEFAULT 0,
            revisi INT NOT NULL DEFAULT 1,
            dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            tgl_mulai VARCHAR(16) NOT NULL DEFAULT '',
            sasar_jenis VARCHAR(16) NOT NULL DEFAULT '',
            sasar_nilai VARCHAR(255) NOT NULL DEFAULT '',
            mapel VARCHAR(100) NOT NULL DEFAULT '',
            guru_nip VARCHAR(32) NOT NULL DEFAULT '',
            guru_nama VARCHAR(160) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS soal (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            ujian_id VARCHAR(40) NOT NULL,
            pertanyaan TEXT NOT NULL,
            opsi_a VARCHAR(600) NOT NULL DEFAULT '',
            opsi_b VARCHAR(600) NOT NULL DEFAULT '',
            opsi_c VARCHAR(600) NOT NULL DEFAULT '',
            opsi_d VARCHAR(600) NOT NULL DEFAULT '',
            opsi_e VARCHAR(600) NOT NULL DEFAULT '',
            opsi_huruf TINYINT(1) NOT NULL DEFAULT 0,
            kunci_jawaban VARCHAR(1) NOT NULL DEFAULT '',
            tipe VARCHAR(10) NOT NULL DEFAULT 'pg',
            kunci_teks TEXT NULL,
            bacaan_id VARCHAR(40) NOT NULL DEFAULT '',
            gambar MEDIUMTEXT NULL,
            dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_soal_ujian (ujian_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS hasil (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            ujian_id VARCHAR(40) NOT NULL,
            ujian_judul VARCHAR(200) NOT NULL DEFAULT '',
            nama VARCHAR(160) NOT NULL DEFAULT '',
            kelas VARCHAR(64) NOT NULL DEFAULT '',
            token VARCHAR(12) NOT NULL DEFAULT '',
            benar INT NOT NULL DEFAULT 0,
            total_soal INT NOT NULL DEFAULT 0,
            nilai INT NOT NULL DEFAULT 0,
            poin INT NOT NULL DEFAULT 0,
            total_pelanggaran INT NOT NULL DEFAULT 0,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_hasil_ujian (ujian_id),
            KEY idx_hasil_nama (nama)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS unduhan (
            ujian_id VARCHAR(40) NOT NULL,
            username VARCHAR(64) NOT NULL,
            waktu DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (ujian_id, username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS buka_kunci (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ujian_id VARCHAR(40) NOT NULL DEFAULT '',
            nama VARCHAR(160) NOT NULL DEFAULT '',
            catatan TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS pengaturan (
            kunci VARCHAR(64) NOT NULL PRIMARY KEY,
            nilai TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS ruang (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            nama VARCHAR(64) NOT NULL,
            kapasitas INT NOT NULL DEFAULT 20,
            komposisi TEXT NULL,
            urutan INT NOT NULL DEFAULT 0,
            dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS penempatan (
            ruang_id VARCHAR(40) NOT NULL,
            nisn VARCHAR(32) NOT NULL,
            nama VARCHAR(160) NOT NULL DEFAULT '',
            kelas VARCHAR(64) NOT NULL DEFAULT '',
            kursi INT NOT NULL DEFAULT 0,
            PRIMARY KEY (ruang_id, kursi),
            KEY idx_penempatan_nisn (nisn)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS jadwal_pengawas (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            hari_ke INT NOT NULL DEFAULT 1,
            tanggal VARCHAR(16) NOT NULL DEFAULT '',
            sesi INT NOT NULL DEFAULT 1,
            jam VARCHAR(16) NOT NULL DEFAULT '',
            ruang_id VARCHAR(40) NOT NULL DEFAULT '',
            ruang_nama VARCHAR(64) NOT NULL DEFAULT '',
            nip VARCHAR(32) NOT NULL DEFAULT '',
            nama VARCHAR(160) NOT NULL DEFAULT '',
            KEY idx_jadwal_tanggal (tanggal)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS jadwal_harian (
            tanggal VARCHAR(16) NOT NULL,
            sesi INT NOT NULL DEFAULT 1,
            mapel VARCHAR(160) NOT NULL DEFAULT '',
            pengawas TEXT NULL,
            PRIMARY KEY (tanggal, sesi)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];

    foreach ($ddl as $sql) db()->exec($sql);

    // Upgrade ringan bila tabel sudah ada dari versi lama.
    $st = db()->query("SHOW COLUMNS FROM ujian LIKE 'boleh_unduh'");
    if ($st->fetch() === false) {
        db()->exec("ALTER TABLE ujian ADD COLUMN boleh_unduh TINYINT(1) NOT NULL DEFAULT 0 AFTER aktif");
    }
    $st = db()->query("SHOW COLUMNS FROM ujian LIKE 'revisi'");
    if ($st->fetch() === false) {
        db()->exec("ALTER TABLE ujian ADD COLUMN revisi INT NOT NULL DEFAULT 1 AFTER boleh_unduh");
    }
    // Konfirmasi guru: soal selesai & siap dibagikan (lampu status admin).
    $st = db()->query("SHOW COLUMNS FROM ujian LIKE 'konfirmasi_guru'");
    if ($st->fetch() === false) {
        db()->exec("ALTER TABLE ujian ADD COLUMN konfirmasi_guru TINYINT(1) NOT NULL DEFAULT 0 AFTER revisi");
    }
    $st = db()->query("SHOW COLUMNS FROM ujian LIKE 'konfirmasi_pada'");
    if ($st->fetch() === false) {
        db()->exec("ALTER TABLE ujian ADD COLUMN konfirmasi_pada DATETIME NULL AFTER konfirmasi_guru");
    }
    // Soal bergambar + flag "pilihan sudah menyertakan huruf A–E".
    $st = db()->query("SHOW COLUMNS FROM soal LIKE 'gambar'");
    if ($st->fetch() === false) {
        db()->exec("ALTER TABLE soal ADD COLUMN gambar MEDIUMTEXT NULL AFTER kunci_jawaban");
    }
    $st = db()->query("SHOW COLUMNS FROM soal LIKE 'opsi_huruf'");
    if ($st->fetch() === false) {
        db()->exec("ALTER TABLE soal ADD COLUMN opsi_huruf TINYINT(1) NOT NULL DEFAULT 0 AFTER opsi_e");
    }
    // Kolom nilai pengaturan dinaikkan ke MEDIUMTEXT agar muat gambar logo &
    // tanda tangan (base64) untuk kartu ujian.
    $st = db()->query(
        "SELECT DATA_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pengaturan' AND COLUMN_NAME = 'nilai'"
    );
    $kolom = $st->fetch();
    if ($kolom && strtolower((string) ($kolom['t'] ?? '')) === 'text') {
        db()->exec('ALTER TABLE pengaturan MODIFY nilai MEDIUMTEXT NULL');
    }

    // Upgrade v2: mapel ujian + guru penanggung jawab soal, tipe soal
    // (pilihan ganda / essay / uraian), teks bacaan bersama & poin koreksi.
    foreach ([
        ['ujian', 'mapel', "ALTER TABLE ujian ADD COLUMN mapel VARCHAR(100) NOT NULL DEFAULT '' AFTER sasar_nilai"],
        ['ujian', 'guru_nip', "ALTER TABLE ujian ADD COLUMN guru_nip VARCHAR(32) NOT NULL DEFAULT '' AFTER mapel"],
        ['ujian', 'guru_nama', "ALTER TABLE ujian ADD COLUMN guru_nama VARCHAR(160) NOT NULL DEFAULT '' AFTER guru_nip"],
        ['soal', 'tipe', "ALTER TABLE soal ADD COLUMN tipe VARCHAR(10) NOT NULL DEFAULT 'pg' AFTER kunci_jawaban"],
        ['soal', 'kunci_teks', 'ALTER TABLE soal ADD COLUMN kunci_teks TEXT NULL AFTER tipe'],
        ['soal', 'bacaan_id', "ALTER TABLE soal ADD COLUMN bacaan_id VARCHAR(40) NOT NULL DEFAULT '' AFTER kunci_teks"],
        ['hasil', 'poin', 'ALTER TABLE hasil ADD COLUMN poin INT NOT NULL DEFAULT 0 AFTER nilai'],
    ] as $mig) {
        $st = db()->query("SHOW COLUMNS FROM {$mig[0]} LIKE '{$mig[1]}'");
        if ($st->fetch() === false) db()->exec($mig[2]);
    }

    // Teks bacaan bersama (dipakai beberapa soal) + jawaban essay/uraian
    // yang dinilai manual lewat menu Koreksi.
    db()->exec(
        "CREATE TABLE IF NOT EXISTS bacaan (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            ujian_id VARCHAR(40) NOT NULL,
            judul VARCHAR(200) NOT NULL DEFAULT '',
            teks MEDIUMTEXT NOT NULL,
            KEY idx_bacaan_ujian (ujian_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    db()->exec(
        "CREATE TABLE IF NOT EXISTS jawaban_teks (
            hasil_id VARCHAR(40) NOT NULL,
            soal_id VARCHAR(40) NOT NULL,
            ujian_id VARCHAR(40) NOT NULL DEFAULT '',
            teks MEDIUMTEXT NOT NULL,
            skor INT NULL,
            PRIMARY KEY (hasil_id, soal_id),
            KEY idx_jawaban_teks_hasil (hasil_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $siap = true;
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                            */
/* ------------------------------------------------------------------ */

function idBaru(string $prefix): string
{
    return $prefix . '_' . base_convert((string) time(), 10, 36)
        . '_' . bin2hex(random_bytes(3));
}

function buatTokenAcak(): string
{
    $alfabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $t = '';
    for ($i = 0; $i < 6; $i++) $t .= $alfabet[random_int(0, strlen($alfabet) - 1)];
    return $t;
}

function bersih($v): string
{
    return trim((string) ($v ?? ''));
}

/* ------------------------------------------------------------------ */
/* Sesi ber-token HMAC + matriks akses per peran                        */
/* ------------------------------------------------------------------ */

const SESI_ADA_JAM = 12;

/** Soal contoh — didefinisikan SEBELUM router berjalan agar aman dipanggil
 *  dari setupAdmin/tambahSoalContoh saat request pertama. */
const SOAL_CONTOH = [
    ['pertanyaan' => 'Nilai dari sin 30° adalah …', 'opsi_a' => '1/2', 'opsi_b' => '1/2√2', 'opsi_c' => '1/2√3', 'opsi_d' => '1', 'opsi_e' => '0', 'kunci_jawaban' => 'A'],
    ['pertanyaan' => 'Hasil dari 2⁵ adalah …', 'opsi_a' => '10', 'opsi_b' => '16', 'opsi_c' => '25', 'opsi_d' => '32', 'opsi_e' => '64', 'kunci_jawaban' => 'D'],
    ['pertanyaan' => 'Ibu kota Provinsi Jawa Barat adalah …', 'opsi_a' => 'Bandung', 'opsi_b' => 'Semarang', 'opsi_c' => 'Surabaya', 'opsi_d' => 'Serang', 'opsi_e' => 'Denpasar', 'kunci_jawaban' => 'A'],
    ['pertanyaan' => 'Planet terdekat dengan Matahari adalah …', 'opsi_a' => 'Venus', 'opsi_b' => 'Bumi', 'opsi_c' => 'Mars', 'opsi_d' => 'Merkurius', 'opsi_e' => 'Jupiter', 'kunci_jawaban' => 'D'],
    ['pertanyaan' => 'Nilai x yang memenuhi x + 7 = 12 adalah …', 'opsi_a' => '3', 'opsi_b' => '4', 'opsi_c' => '5', 'opsi_d' => '6', 'opsi_e' => '7', 'kunci_jawaban' => 'C'],
];

/** Peran minimum per aksi (0 siswa, 1 guru, 2 admin). Tanpa entri = terbuka. */
const AKSES = [
    'getUjianSiswa' => 0, 'getUjianInfo' => 0, 'getSoal' => 0,
    'getHasilSaya' => 0, 'submitJawaban' => 0, 'catatBukaKunci' => 0,

    'getUjian' => 1, 'getSoalAdmin' => 1, 'getHasil' => 1, 'getSiswa' => 1,
    'getKelasList' => 1, 'tambahSiswa' => 1, 'ubahSiswa' => 1, 'hapusSiswa' => 1,
    'hapusSiswaMassal' => 1, 'importSiswa' => 1, 'buatAkunSiswa' => 1,
    'buatUjian' => 1, 'aturUjian' => 1,
    'setAktifUjian' => 1, 'setIzinUnduh' => 1, 'hapusUjian' => 1, 'konfirmasiUjian' => 1,
    'tambahSoal' => 1, 'ubahSoal' => 1, 'tambahSoalContoh' => 1, 'hapusSoal' => 1,
    'imporSoal' => 1,
    'getGuru' => 1, 'tambahGuru' => 1, 'ubahGuru' => 1, 'hapusGuru' => 1,
    'hapusGuruMassal' => 1, 'ubahPasswordGuru' => 1,
    'importGuru' => 1, 'buatAkunGuru' => 1,
    'simpanBacaan' => 1, 'hapusBacaan' => 1,
    'getKoreksi' => 1, 'getJawabanKoreksi' => 1, 'simpanKoreksi' => 1,

    'getPengaturan' => 2, 'aturPin' => 2, 'buatPengguna' => 2,
    'ubahPeran' => 2, 'getPengguna' => 2, 'ubahPasswordPengguna' => 2,
    'getKartuSet' => 2, 'aturKartuSet' => 2,

    'getRuangSet' => 2, 'simpanRuang' => 2, 'hapusRuang' => 2,
    'simpanPengawas' => 2, 'buatJadwalPengawas' => 2, 'buatPenempatan' => 2,

    'getSetelGas' => 2, 'setelGas' => 2, 'getGuruGas' => 2,
    'jadwalHarianHarianGas' => 2, 'jadwalHarianSimpanGas' => 2,
];

function tingkatPeran($role): int
{
    $r = strtolower(bersih($role));
    if ($r === 'admin') return 2;
    if ($r === 'guru') return 1;
    return 0;
}

function bacaPengaturan(string $kunci, string $bawaan = ''): string
{
    $r = satu('SELECT nilai FROM pengaturan WHERE kunci = ?', [$kunci]);
    $v = $r ? bersih($r['nilai']) : '';
    return $v !== '' ? $v : $bawaan;
}

function simpanPengaturan(string $kunci, string $nilai): void
{
    jalan(
        'INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)',
        [$kunci, $nilai]
    );
}

function serverSecret(): string
{
    $s = bacaPengaturan('server_secret');
    if ($s !== '') return $s;
    $s = bin2hex(random_bytes(32)) . bin2hex(random_bytes(16));
    simpanPengaturan('server_secret', $s);
    return $s;
}

function hmacHex(string $pesan): string
{
    return hash_hmac('sha256', $pesan, serverSecret());
}

function buatSesi(string $username): string
{
    $exp = (string) (time() + SESI_ADA_JAM * 3600);
    $inti = strtolower($username) . '|' . $exp;
    return $inti . '|' . hmacHex($inti);
}

/**
 * Validasi token sesi + peran. Role dibaca LANGSUNG dari tabel pengguna.
 * @return array{ok:bool, pesan?:string, perlu_login?:bool, username?:string, role?:string}
 */
function validasiSesi($token, int $peranDiizinkan): array
{
    $t = bersih($token);
    if ($t === '') {
        return ['ok' => false, 'pesan' => 'Sesi habis — silakan login.', 'perlu_login' => true];
    }
    $bagi = explode('|', $t);
    if (count($bagi) !== 3) {
        return ['ok' => false, 'pesan' => 'Sesi tidak sah — silakan login.', 'perlu_login' => true];
    }
    [$username, $expStr, $tanda] = $bagi;
    $exp = (int) $expStr;
    if ($exp < time()) {
        return ['ok' => false, 'pesan' => 'Sesi kedaluwarsa — silakan login ulang.', 'perlu_login' => true];
    }
    if (!hash_equals(hmacHex($username . '|' . $expStr), $tanda)) {
        return ['ok' => false, 'pesan' => 'Sesi tidak sah — silakan login ulang.', 'perlu_login' => true];
    }
    $u = satu('SELECT role FROM pengguna WHERE username = ?', [strtolower($username)]);
    if (!$u) {
        return ['ok' => false, 'pesan' => 'Akun tidak ditemukan — silakan login ulang.', 'perlu_login' => true];
    }
    $role = strtolower(bersih($u['role']));
    if (tingkatPeran($role) < $peranDiizinkan) {
        return ['ok' => false, 'pesan' => 'Akses ditolak — peran ' . $role . ' tidak diizinkan untuk aksi ini.'];
    }
    return ['ok' => true, 'username' => strtolower($username), 'role' => $role];
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

$data = [];
$aksi = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $body = file_get_contents('php://input');
    $json = json_decode($body ?: '{}', true);
    if (!is_array($json)) $json = [];
    $data = $json;
    $aksi = bersih($json['action'] ?? '');
} else {
    $data = $_GET;
    $aksi = bersih($_GET['action'] ?? '');
}
if ($aksi === '') $aksi = 'ping';

try {
    pastikanStruktur();

    if (isset(AKSES[$aksi])) {
        $cek = validasiSesi($data['sesi'] ?? '', AKSES[$aksi]);
        if (!$cek['ok']) {
            kirim([
                'success' => false,
                'message' => $cek['pesan'],
                'perlu_login' => !empty($cek['perlu_login']),
            ]);
        }
        $data['sesi_role'] = $cek['role'];
        $data['sesi_user'] = $cek['username'];
    }

    kirim(jalankan($aksi, $data));
} catch (Throwable $e) {
    error_log('[UjianAman] ' . $aksi . ': ' . $e->getMessage());
    kirim(['success' => false, 'message' => pesanGalat($e)]);
}

function pesanGalat(Throwable $e): string
{
    $m = $e->getMessage();
    if (strpos($m, 'database') !== false || strpos($m, 'Database') !== false) return $m;
    if ($e instanceof PDOException) {
        return 'Terjadi kesalahan pada database. Coba lagi; bila berulang, periksa api/config.php.';
    }
    return $m;
}

function kirim(array $payload): void
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function galat(string $pesan): array
{
    return ['success' => false, 'message' => $pesan];
}

/* ------------------------------------------------------------------ */
/* Handler aksi                                                        */
/* ------------------------------------------------------------------ */

function jalankan(string $action, array $d): array
{
    switch ($action) {
        case 'ping': return a_ping();
        case 'setupAdmin': return a_setupAdmin($d);
        case 'login': return a_login($d);
        case 'getUjianSiswa': return a_getUjianSiswa($d);
        case 'getUjianInfo': return a_getUjianInfo($d);
        case 'getUjian': return a_getUjian($d);
        case 'getSoal': return a_getSoal($d);
        case 'getSoalAdmin': return a_getSoalAdmin($d);
        case 'getHasil': return a_getHasil($d);
        case 'getHasilSaya': return a_getHasilSaya($d);
        case 'getPengguna': return a_getPengguna();
        case 'getSiswa': return a_getSiswa();
        case 'getKelasList': return a_getKelasList();
        case 'tambahSiswa': return a_tambahSiswa($d);
        case 'ubahSiswa': return a_ubahSiswa($d);
        case 'hapusSiswa': return a_hapusSiswa($d);
        case 'hapusSiswaMassal': return a_hapusSiswaMassal($d);
        case 'importSiswa': return a_importSiswa($d);
        case 'buatAkunSiswa': return a_buatAkunSiswa($d);
        case 'buatUjian': return a_buatUjian($d);
        case 'aturUjian': return a_aturUjian($d);
        case 'setAktifUjian': return a_setAktifUjian($d);
        case 'setIzinUnduh': return a_setIzinUnduh($d);
        case 'konfirmasiUjian': return a_konfirmasiUjian($d);
        case 'hapusUjian': return a_hapusUjian($d);
        case 'tambahSoal': return a_tambahSoal($d);
        case 'ubahSoal': return a_ubahSoal($d);
        case 'tambahSoalContoh': return a_tambahSoalContoh($d);
        case 'imporSoal': return a_imporSoal($d);
        case 'hapusSoal': return a_hapusSoal($d);
        case 'simpanBacaan': return a_simpanBacaan($d);
        case 'hapusBacaan': return a_hapusBacaan($d);
        case 'getKoreksi': return a_getKoreksi($d);
        case 'getJawabanKoreksi': return a_getJawabanKoreksi($d);
        case 'simpanKoreksi': return a_simpanKoreksi($d);
        case 'submitJawaban': return a_submitJawaban($d);
        case 'catatBukaKunci': return a_catatBukaKunci($d);
        case 'getPengaturan': return a_getPengaturan();
        case 'aturPin': return a_aturPin($d);
        case 'getKartuSet': return a_getKartuSet();
        case 'aturKartuSet': return a_aturKartuSet($d);
        case 'getRuangSet': return a_getRuangSet();
        case 'simpanRuang': return a_simpanRuang($d);
        case 'hapusRuang': return a_hapusRuang($d);
        case 'simpanPengawas': return a_simpanPengawas($d);
        case 'buatJadwalPengawas': return a_buatJadwalPengawas($d);
        case 'buatPenempatan': return a_buatPenempatan($d);
        case 'getSetelGas': return a_getSetelGas();
        case 'setelGas': return a_setelGas($d);
        case 'getGuruGas': return a_getGuruGas();
        case 'jadwalHarianHarianGas': return a_jadwalHarianHarianGas($d);
        case 'jadwalHarianSimpanGas': return a_jadwalHarianSimpanGas($d);
        case 'buatPengguna': return a_buatPengguna($d);
        case 'ubahPeran': return a_ubahPeran($d);
        case 'ubahPasswordPengguna': return a_ubahPasswordPengguna($d);
        case 'getGuru': return a_getGuru();
        case 'tambahGuru': return a_tambahGuru($d);
        case 'ubahGuru': return a_ubahGuru($d);
        case 'hapusGuru': return a_hapusGuru($d);
        case 'hapusGuruMassal': return a_hapusGuruMassal($d);
        case 'ubahPasswordGuru': return a_ubahPasswordGuru($d);
        case 'importGuru': return a_importGuru($d);
        case 'buatAkunGuru': return a_buatAkunGuru($d);
        default: return galat('Action tidak dikenal: ' . $action);
    }
}

/* ------------------------------------------------------------------ */
/* AUTH                                                                */
/* ------------------------------------------------------------------ */

function a_ping(): array
{
    $r = satu('SELECT COUNT(*) AS n FROM pengguna');
    return ['success' => true, 'siap' => (int) ($r['n'] ?? 0) > 0];
}

function a_setupAdmin(array $d): array
{
    $r = satu('SELECT COUNT(*) AS n FROM pengguna');
    if ((int) $r['n'] > 0) {
        return galat('Akun sudah ada. Login dengan akun dari admin.');
    }
    $username = strtolower(bersih($d['username'] ?? 'admin'));
    $password = bersih($d['password'] ?? '');
    if (strlen($password) < 4) return galat('Password minimal 4 karakter.');

    $id = idBaru('p');
    jalan(
        'INSERT INTO pengguna (id, username, password, nama, kelas, role) VALUES (?,?,?,?,?,?)',
        [$id, $username, $password, 'Administrator', '', 'admin']
    );

    // Ujian contoh + 5 soal contoh.
    $ujianId = idBaru('u');
    jalan(
        'INSERT INTO ujian (id, judul, deskripsi, token, durasi_menit, aktif, boleh_unduh, tgl_mulai, sasar_jenis, sasar_nilai)
         VALUES (?,?,?,?,?,?,1,?,?,?)',
        [
            $ujianId,
            'Contoh Ujian — Trigonometri',
            'Ujian percobaan 5 soal pilihan ganda.',
            buatTokenAcak(),
            60,
            1,
            '',
            '',
            '',
        ]
    );
    foreach (SOAL_CONTOH as $s) {
        sisipSoal($ujianId, $s);
    }

    return [
        'success' => true,
        'message' => 'Admin "' . $username . '" dibuat beserta ujian contoh.',
        'user' => ['id' => $username, 'username' => $username, 'nama' => 'Administrator', 'kelas' => '', 'role' => 'admin'],
        'sesi' => buatSesi($username),
    ];
}

function a_login(array $d): array
{
    $username = strtolower(bersih($d['username'] ?? ''));
    $password = bersih($d['password'] ?? '');
    if ($username === '' || $password === '') {
        return galat('Username dan password wajib diisi.');
    }
    $u = satu(
        'SELECT id, username, password, nama, kelas, role FROM pengguna WHERE username = ? LIMIT 1',
        [$username]
    );
    if ($u && (string) $u['password'] === $password) {
        return [
            'success' => true,
            'user' => [
                'id' => (string) $u['id'],
                'username' => (string) $u['username'],
                'nama' => (string) ($u['nama'] !== '' ? $u['nama'] : $u['username']),
                'kelas' => (string) $u['kelas'],
                'role' => (string) ($u['role'] !== '' ? $u['role'] : 'siswa'),
            ],
            'sesi' => buatSesi($u['username']),
        ];
    }
    return galat('Username atau password salah.');
}

function a_buatPengguna(array $d): array
{
    $username = strtolower(bersih($d['username'] ?? ''));
    $password = bersih($d['password'] ?? '');
    $role = bersih($d['role'] ?? 'siswa');
    if ($username === '' || $password === '') return galat('Username & password wajib diisi.');
    if (!in_array($role, ['admin', 'guru', 'siswa'], true)) return galat('Peran tidak valid.');
    if (satu('SELECT id FROM pengguna WHERE username = ?', [$username])) {
        return galat('Username "' . $username . '" sudah dipakai.');
    }
    $id = idBaru('p');
    jalan(
        'INSERT INTO pengguna (id, username, password, nama, kelas, role) VALUES (?,?,?,?,?,?)',
        [
            $id,
            $username,
            $password,
            bersih($d['nama'] ?? '') !== '' ? bersih($d['nama']) : $username,
            bersih($d['kelas'] ?? ''),
            $role,
        ]
    );
    return ['success' => true, 'id' => $id, 'message' => 'Akun ' . $role . ' "' . $username . '" dibuat.'];
}

function a_ubahPeran(array $d): array
{
    $role = bersih($d['role'] ?? '');
    if (!in_array($role, ['admin', 'guru', 'siswa'], true)) return galat('Peran tidak valid.');
    $n = jalan('UPDATE pengguna SET role = ? WHERE id = ?', [$role, bersih($d['id'] ?? '')]);
    return $n > 0
        ? ['success' => true, 'message' => 'Peran diperbarui.']
        : galat('Pengguna tidak ditemukan.');
}

function a_getPengguna(): array
{
    $rows = semua('SELECT id, username, password, nama, kelas, role FROM pengguna ORDER BY role DESC, nama');
    return ['success' => true, 'pengguna' => array_map(function ($r) {
        return [
            'id' => (string) $r['id'],
            'username' => (string) $r['username'],
            'password' => (string) $r['password'],
            'nama' => (string) $r['nama'],
            'kelas' => (string) $r['kelas'],
            'role' => (string) ($r['role'] !== '' ? $r['role'] : 'siswa'),
        ];
    }, $rows)];
}

/** Buat akun login massal dari data siswa (username = NISN, pass = DDMMYYYY). */
function a_buatAkunSiswa(array $d): array
{
    $siswa = semua('SELECT nisn, nama, tgllahir, kelas FROM siswa');
    if (!$siswa) return galat('Data siswa masih kosong — impor data dulu.');

    $ada = [];
    foreach (semua('SELECT username FROM pengguna') as $r) {
        $ada[strtolower($r['username'])] = true;
    }

    $dibuat = 0;
    $lewati = 0;
    $tanpaTgl = 0;
    foreach ($siswa as $s) {
        $nisn = bersih($s['nisn']);
        $kunci = strtolower($nisn);
        if ($nisn === '' || isset($ada[$kunci])) {
            $lewati++;
            continue;
        }
        $tgl = bersih($s['tgllahir']);
        $password = '';
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $tgl, $m)) {
            $password = $m[3] . $m[2] . $m[1];
        } elseif (preg_match('/^\d{8}$/', $tgl)) {
            $password = $tgl;
        } elseif (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $tgl, $m)) {
            $password = $m[3] . $m[2] . $m[1];
        } else {
            $tanpaTgl++;
            $password = 'siswa123';
        }
        jalan(
            'INSERT INTO pengguna (id, username, password, nama, kelas, role) VALUES (?,?,?,?,?,?)',
            [idBaru('p'), $kunci, $password, bersih($s['nama']) ?: $nisn, bersih($s['kelas']), 'siswa']
        );
        $ada[$kunci] = true;
        $dibuat++;
    }

    $pesan = $dibuat . ' akun siswa dibuat (username = NISN, password = tgl lahir DDMMYYYY).';
    if ($lewati) $pesan .= ' ' . $lewati . ' dilewati (sudah ada / NISN kosong).';
    if ($tanpaTgl) $pesan .= ' ' . $tanpaTgl . ' tanpa tgl lahir memakai password "siswa123".';
    return ['success' => true, 'dibuat' => $dibuat, 'lewati' => $lewati, 'tanpa_tgl' => $tanpaTgl, 'message' => $pesan];
}

/* ------------------------------------------------------------------ */
/* DATA SISWA                                                          */
/* ------------------------------------------------------------------ */

function barisSiswa(array $r): array
{
    return [
        'id' => (string) $r['id'],
        'nisn' => (string) $r['nisn'],
        'nama' => (string) $r['nama'],
        'tgllahir' => (string) $r['tgllahir'],
        'kelas' => (string) $r['kelas'],
    ];
}

function a_getSiswa(): array
{
    return ['success' => true, 'siswa' => array_map('barisSiswa', semua('SELECT * FROM siswa ORDER BY kelas, nama'))];
}

function validasiSiswa(array $d): array
{
    $nisn = bersih($d['nisn'] ?? '');
    $nama = bersih($d['nama'] ?? '');
    $kelas = bersih($d['kelas'] ?? '');
    if ($nisn === '') return ['error' => 'NISN wajib diisi.'];
    if ($nama === '') return ['error' => 'Nama siswa wajib diisi.'];
    if ($kelas === '') return ['error' => 'Kelas wajib diisi (cth. X.1).'];
    return [
        'nisn' => $nisn,
        'nama' => $nama,
        'tgllahir' => bersih($d['tgllahir'] ?? ''),
        'kelas' => $kelas,
    ];
}

function a_tambahSiswa(array $d): array
{
    $v = validasiSiswa($d);
    if (isset($v['error'])) return galat($v['error']);
    if (satu('SELECT id FROM siswa WHERE nisn = ?', [$v['nisn']])) {
        return galat('NISN "' . $v['nisn'] . '" sudah terdaftar.');
    }
    $id = idBaru('sw');
    jalan(
        'INSERT INTO siswa (id, nisn, nama, tgllahir, kelas) VALUES (?,?,?,?,?)',
        [$id, $v['nisn'], $v['nama'], $v['tgllahir'], $v['kelas']]
    );
    return ['success' => true, 'id' => $id, 'message' => 'Siswa "' . $v['nama'] . '" ditambahkan.'];
}

function a_ubahSiswa(array $d): array
{
    $v = validasiSiswa($d);
    if (isset($v['error'])) return galat($v['error']);
    $id = bersih($d['id'] ?? '');
    if ($id === '') return galat('Siswa tidak ditemukan.');
    if (satu('SELECT id FROM siswa WHERE nisn = ? AND id <> ?', [$v['nisn'], $id])) {
        return galat('NISN "' . $v['nisn'] . '" sudah dipakai siswa lain.');
    }
    $lama = satu('SELECT nisn FROM siswa WHERE id = ?', [$id]);
    $n = jalan(
        'UPDATE siswa SET nisn = ?, nama = ?, tgllahir = ?, kelas = ? WHERE id = ?',
        [$v['nisn'], $v['nama'], $v['tgllahir'], $v['kelas'], $id]
    );
    if ($n > 0) {
        // Sinkron akun login siswa (username = NISN). Login membaca tabel
        // pengguna, bukan tabel siswa — tanpa sinkron ini, siswa yang login
        // masih melihat nama/kelas lama walau data siswa sudah benar.
        $kunciLama = $lama ? strtolower(bersih($lama['nisn'])) : '';
        $kunciBaru = strtolower($v['nisn']);
        if ($kunciLama !== '') {
            jalan(
                "UPDATE pengguna SET nama = ?, kelas = ? WHERE username = ? AND role NOT IN ('guru','admin')",
                [$v['nama'], $v['kelas'], $kunciLama]
            );
            // NISN berubah → username akun login ikut diganti (dengan jaga
            // agar tidak menimpa akun lain yang sudah memakai NISN baru).
            if ($kunciBaru !== $kunciLama
                && !satu('SELECT id FROM pengguna WHERE username = ?', [$kunciBaru])) {
                jalan(
                    "UPDATE pengguna SET username = ? WHERE username = ? AND role NOT IN ('guru','admin')",
                    [$kunciBaru, $kunciLama]
                );
            }
        }
    }
    return $n > 0 ? ['success' => true, 'message' => 'Data siswa diperbarui.'] : galat('Siswa tidak ditemukan.');
}

function a_hapusSiswa(array $d): array
{
    jalan('DELETE FROM siswa WHERE id = ?', [bersih($d['id'] ?? '')]);
    return ['success' => true, 'message' => 'Siswa dihapus.'];
}

/** Hapus massal lewat kotak centang: ids = [id, id, ...] */
function a_hapusSiswaMassal(array $d): array
{
    $ids = is_array($d['ids'] ?? null) ? $d['ids'] : [];
    if (!$ids) return galat('Tidak ada siswa yang dipilih.');
    $n = 0;
    foreach ($ids as $id) {
        $id = bersih($id);
        if ($id !== '') $n += jalan('DELETE FROM siswa WHERE id = ?', [$id]);
    }
    return $n > 0
        ? ['success' => true, 'hapus' => $n, 'message' => $n . ' siswa dihapus.']
        : galat('Siswa tidak ditemukan.');
}

/** Impor massal: rows = [[nisn, nama, tgllahir, kelas], ...] */
function a_importSiswa(array $d): array
{
    $rows = is_array($d['rows'] ?? null) ? $d['rows'] : [];
    if (!$rows) return galat('Tidak ada baris untuk diimpor.');

    $ada = [];
    foreach (semua('SELECT nisn FROM siswa') as $r) $ada[$r['nisn']] = true;

    $masuk = 0;
    $lewati = 0;
    foreach ($rows as $r) {
        $nisn = bersih($r[0] ?? '');
        $nama = bersih($r[1] ?? '');
        $tgllahir = bersih($r[2] ?? '');
        $kelas = bersih($r[3] ?? '');
        if ($nisn === '' || $nama === '' || $kelas === '' || isset($ada[$nisn])) {
            $lewati++;
            continue;
        }
        $ada[$nisn] = true;
        jalan(
            'INSERT INTO siswa (id, nisn, nama, tgllahir, kelas) VALUES (?,?,?,?,?)',
            [idBaru('sw'), $nisn, $nama, $tgllahir, $kelas]
        );
        $masuk++;
    }
    return [
        'success' => true,
        'masuk' => $masuk,
        'lewati' => $lewati,
        'message' => $masuk . ' siswa diimpor, ' . $lewati . ' dilewati (kosong/NISN duplikat).',
    ];
}

/** Daftar kelas & tingkat unik (dari data siswa + kelas akun pengguna). */
function a_getKelasList(): array
{
    $kelas = [];
    foreach (semua('SELECT kelas FROM siswa') as $r) {
        $k = bersih($r['kelas']);
        if ($k !== '') $kelas[$k] = true;
    }
    foreach (semua('SELECT kelas FROM pengguna') as $r) {
        $k = bersih($r['kelas']);
        if ($k !== '') $kelas[$k] = true;
    }
    $urutTingkat = ['X', 'XI', 'XII'];
    $tingkatDari = function ($k) {
        $k = strtoupper(trim((string) $k));
        $i = strpos($k, '.');
        return $i !== false && $i > 0 ? trim(substr($k, 0, $i)) : $k;
    };
    $daftar = array_keys($kelas);
    usort($daftar, function ($a, $b) use ($urutTingkat, $tingkatDari) {
        $ta = array_search($tingkatDari($a), $urutTingkat, true);
        $tb = array_search($tingkatDari($b), $urutTingkat, true);
        $ta = $ta === false ? 99 : $ta;
        $tb = $tb === false ? 99 : $tb;
        if ($ta !== $tb) return $ta <=> $tb;
        return strnatcmp($a, $b);
    });
    $tingkat = [];
    foreach ($daftar as $k) $tingkat[$tingkatDari($k)] = true;
    $daftarTingkat = array_keys($tingkat);
    usort($daftarTingkat, function ($a, $b) use ($urutTingkat) {
        $ia = array_search($a, $urutTingkat, true);
        $ib = array_search($b, $urutTingkat, true);
        $ia = $ia === false ? 99 : $ia;
        $ib = $ib === false ? 99 : $ib;
        return $ia <=> $ib;
    });
    return ['success' => true, 'kelas' => $daftar, 'tingkat' => $daftarTingkat];
}

/* ------------------------------------------------------------------ */
/* DATA GURU                                                           */
/* ------------------------------------------------------------------ */

function barisGuru(array $r): array
{
    return [
        'id' => (string) $r['id'],
        'nip' => (string) $r['nip'],
        'nama' => (string) $r['nama'],
        'mapel' => (string) $r['mapel'],
    ];
}

function a_getGuru(): array
{
    return ['success' => true, 'guru' => array_map('barisGuru', semua('SELECT * FROM guru ORDER BY nama'))];
}

function validasiGuru(array $d): array
{
    $nip = bersih($d['nip'] ?? '');
    $nama = bersih($d['nama'] ?? '');
    if ($nip === '') return ['error' => 'NIP/NUPTK wajib diisi.'];
    if ($nama === '') return ['error' => 'Nama guru wajib diisi.'];
    return [
        'nip' => $nip,
        'nama' => $nama,
        'mapel' => bersih($d['mapel'] ?? ''),
        'password' => bersih($d['password'] ?? '') !== '' ? bersih($d['password']) : 'guru123',
    ];
}

function a_tambahGuru(array $d): array
{
    $v = validasiGuru($d);
    if (isset($v['error'])) return galat($v['error']);
    if (satu('SELECT id FROM guru WHERE nip = ?', [$v['nip']])) {
        return galat('NIP "' . $v['nip'] . '" sudah terdaftar.');
    }
    $id = idBaru('gr');
    jalan(
        'INSERT INTO guru (id, nip, nama, mapel, password) VALUES (?,?,?,?,?)',
        [$id, $v['nip'], $v['nama'], $v['mapel'], $v['password']]
    );
    return ['success' => true, 'id' => $id, 'message' => 'Guru "' . $v['nama'] . '" ditambahkan.'];
}

function a_ubahGuru(array $d): array
{
    $v = validasiGuru($d);
    if (isset($v['error'])) return galat($v['error']);
    $id = bersih($d['id'] ?? '');
    $lama = satu('SELECT nip FROM guru WHERE id = ?', [$id]);
    $n = jalan(
        'UPDATE guru SET nip = ?, nama = ?, mapel = ? WHERE id = ?',
        [$v['nip'], $v['nama'], $v['mapel'], $id]
    );
    if ($n > 0 && $lama) {
        // Username login guru = NIP → ikut diganti supaya bisa login memakai NIP baru.
        $lamaKunci = strtolower(bersih($lama['nip']));
        $baruKunci = strtolower($v['nip']);
        if ($lamaKunci !== '' && $baruKunci !== '' && $lamaKunci !== $baruKunci
            && !satu('SELECT id FROM pengguna WHERE username = ?', [$baruKunci])) {
            $p = jalan("UPDATE pengguna SET username = ? WHERE username = ? AND role = 'guru'", [$baruKunci, $lamaKunci]);
            if ($p === 0) jalan('UPDATE pengguna SET username = ? WHERE username = ?', [$baruKunci, $lamaKunci]);
            // Rename bisa mengenai akun bekas peran 'siswa' — samakan peran.
            samakanPeranGuru($baruKunci, bersih($v['nama']));
        }
        // Sinkron nama & mapel ke akun login (username = NIP). Login membaca
        // tabel pengguna — tanpa sinkron ini tampilan guru tetap nama/mapel
        // lama walau data guru sudah benar (sama seperti kasus siswa).
        if ($baruKunci !== '') {
            jalan(
                "UPDATE pengguna SET nama = ?, kelas = ? WHERE username = ? AND role = 'guru'",
                [bersih($v['nama']), bersih($v['mapel']), $baruKunci]
            );
        }
    }
    return $n > 0 ? ['success' => true, 'message' => 'Data guru diperbarui.'] : galat('Guru tidak ditemukan.');
}

function a_hapusGuru(array $d): array
{
    jalan('DELETE FROM guru WHERE id = ?', [bersih($d['id'] ?? '')]);
    return ['success' => true, 'message' => 'Guru dihapus.'];
}

/** Hapus massal lewat kotak centang: ids = [id, id, ...] */
function a_hapusGuruMassal(array $d): array
{
    $ids = is_array($d['ids'] ?? null) ? $d['ids'] : [];
    if (!$ids) return galat('Tidak ada guru yang dipilih.');
    $n = 0;
    foreach ($ids as $id) {
        $id = bersih($id);
        if ($id !== '') $n += jalan('DELETE FROM guru WHERE id = ?', [$id]);
    }
    return $n > 0
        ? ['success' => true, 'hapus' => $n, 'message' => $n . ' guru dihapus.']
        : galat('Guru tidak ditemukan.');
}

/**
 * Kembalikan akun login guru (username = NIP) ke peran 'guru' bila masih
 * berperan 'siswa' — kasus lama: akun dibuat lebih dulu dari data siswa /
 * peran lupa diset, sehingga login guru masuk tampilan siswa. Perbaikan
 * hanya dilakukan bila aman: nama akun cocok dengan nama guru, atau nama
 * akun masih placeholder (= username). Selain itu admin diminta memeriksa
 * menu Pengguna (jangan otomatis menaikkan peran akun yang namanya beda).
 * @return array{status:'sudah'|'diperbaiki'|'perlu-cek', role:string}
 */
function samakanPeranGuru(string $kunciUsername, string $namaGuru): array
{
    $u = satu('SELECT id, nama, role FROM pengguna WHERE username = ? LIMIT 1', [$kunciUsername]);
    if (!$u) return ['status' => 'perlu-cek', 'role' => ''];
    $role = strtolower(bersih($u['role']));
    if ($role === 'guru') return ['status' => 'sudah', 'role' => $role];
    $namaAkun = strtolower(trim(bersih($u['nama'])));
    $namaGuruBersih = strtolower(trim($namaGuru));
    $cocok = ($namaGuruBersih !== '' && $namaAkun === $namaGuruBersih)
        || $namaAkun === '' || $namaAkun === strtolower($kunciUsername);
    if ($role === 'siswa' && $cocok) {
        jalan("UPDATE pengguna SET role = 'guru' WHERE id = ?", [(string) $u['id']]);
        return ['status' => 'diperbaiki', 'role' => 'guru'];
    }
    return ['status' => 'perlu-cek', 'role' => $role];
}

/**
 * Ubah password guru — WAJIB disinkronkan ke akun login (tabel pengguna),
 * karena login selalu membaca tabel pengguna, bukan tabel guru.
 */
function a_ubahPasswordGuru(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $pass = bersih($d['password'] ?? '');
    if (strlen($pass) < 4) return galat('Password minimal 4 karakter.');
    $g = satu('SELECT nip, nama, mapel FROM guru WHERE id = ?', [$id]);
    if (!$g) return galat('Guru tidak ditemukan.');
    jalan('UPDATE guru SET password = ? WHERE id = ?', [$pass, $id]);

    $nip = bersih($g['nip']);
    $kunci = strtolower($nip);
    if ($kunci === '') {
        return [
            'success' => true,
            'message' => 'Password guru diperbarui, tetapi NIP belum diisi sehingga akun login belum bisa dibuat. Isi NIP lalu gunakan "Buat akun login".',
        ];
    }

    // (1) Akun login yang username-nya = NIP (peran apa pun) — login selalu mencari berdasarkan username.
    $ada = satu('SELECT id FROM pengguna WHERE username = ? LIMIT 1', [$kunci]);
    // (2) Akun dibuat manual dengan username lain — cocokkan lewat nama pada peran guru.
    if (!$ada && bersih($g['nama']) !== '') {
        $ada = satu(
            "SELECT id FROM pengguna WHERE role = 'guru' AND LOWER(nama) = LOWER(?) ORDER BY dibuat LIMIT 1",
            [bersih($g['nama'])]
        );
    }
    if ($ada) {
        jalan('UPDATE pengguna SET password = ? WHERE id = ?', [$pass, (string) $ada['id']]);
        // Akun guru bisa tersisa berperan 'siswa' (dibuat lama dari data siswa
        // / peran lupa diset) — perbaiki otomatis bila namanya cocok, supaya
        // login guru tidak masuk tampilan siswa.
        $peran = samakanPeranGuru($kunci, bersih($g['nama']));
        if ($peran['status'] === 'diperbaiki') {
            return ['success' => true, 'message' => 'Password guru & akun login (username ' . $nip . ') diperbarui — peran akun diperbaiki otomatis menjadi Guru.'];
        }
        if ($peran['status'] === 'perlu-cek') {
            return ['success' => true, 'message' => 'Password guru diperbarui, tetapi akun username ' . $nip . ' berperan "' . $peran['role'] . '" — buka tab Pengguna dan ubah perannya ke Guru bila akun ini memang untuk guru.'];
        }
    } else {
        // (3) Akun login belum ada sama sekali → buat otomatis supaya password baru bisa dipakai.
        jalan(
            'INSERT INTO pengguna (id, username, password, nama, kelas, role) VALUES (?,?,?,?,?,?)',
            [idBaru('p'), $kunci, $pass, bersih($g['nama']) ?: $nip, bersih($g['mapel']), 'guru']
        );
        return ['success' => true, 'message' => 'Password guru diperbarui. Akun login baru dibuat — username ' . $nip . '.'];
    }
    return ['success' => true, 'message' => 'Password guru & akun login (username ' . $nip . ') diperbarui. Login memakai username itu.'];
}

/** Ganti password akun apa pun (admin/guru/siswa) — khusus admin. */
function a_ubahPasswordPengguna(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $pass = bersih($d['password'] ?? '');
    if (strlen($pass) < 4) return galat('Password minimal 4 karakter.');
    $u = satu('SELECT username, nama, role FROM pengguna WHERE id = ?', [$id]);
    if (!$u) return galat('Pengguna tidak ditemukan.');
    jalan('UPDATE pengguna SET password = ? WHERE id = ?', [$pass, $id]);
    // Bila ini akun guru (username = NIP), samakan password di tabel guru juga.
    jalan('UPDATE guru SET password = ? WHERE nip = ?', [$pass, (string) $u['username']]);
    $nama = bersih($u['nama']) !== '' ? bersih($u['nama']) : (string) $u['username'];
    return ['success' => true, 'message' => 'Password ' . $nama . ' (username ' . $u['username'] . ') diperbarui.'];
}

/** Impor massal guru: rows = [[nip, nama, mapel, password?], ...] */
function a_importGuru(array $d): array
{
    $rows = is_array($d['rows'] ?? null) ? $d['rows'] : [];
    if (!$rows) return galat('Tidak ada baris untuk diimpor.');

    $ada = [];
    foreach (semua('SELECT nip FROM guru') as $r) $ada[$r['nip']] = true;

    $masuk = 0;
    $lewati = 0;
    foreach ($rows as $r) {
        $nip = bersih($r[0] ?? '');
        $nama = bersih($r[1] ?? '');
        $mapel = bersih($r[2] ?? '');
        $password = bersih($r[3] ?? '') !== '' ? bersih($r[3]) : 'guru123';
        if ($nip === '' || $nama === '' || isset($ada[$nip])) {
            $lewati++;
            continue;
        }
        $ada[$nip] = true;
        jalan(
            'INSERT INTO guru (id, nip, nama, mapel, password) VALUES (?,?,?,?,?)',
            [idBaru('gr'), $nip, $nama, $mapel, $password]
        );
        $masuk++;
    }
    return [
        'success' => true,
        'masuk' => $masuk,
        'lewati' => $lewati,
        'message' => $masuk . ' guru diimpor, ' . $lewati . ' dilewati (kosong/NIP duplikat).',
    ];
}

/** Buat akun login guru (username = NIP, password dari data guru). */
function a_buatAkunGuru(array $d): array
{
    $guru = semua('SELECT nip, nama, mapel, password FROM guru');
    if (!$guru) return galat('Data guru masih kosong — impor data dulu.');

    $ada = [];
    foreach (semua('SELECT username FROM pengguna') as $r) {
        $ada[strtolower($r['username'])] = true;
    }

    $dibuat = 0;
    $lewati = 0;
    $diperbaiki = 0;
    $perluCek = [];
    foreach ($guru as $g) {
        $nip = bersih($g['nip']);
        $kunci = strtolower($nip);
        if ($nip === '') {
            $lewati++;
            continue;
        }
        if (isset($ada[$kunci])) {
            // Akun sudah ada — pastikan perannya 'guru', bukan sisa 'siswa'
            // (login guru dengan akun itu akan masuk tampilan siswa).
            $peran = samakanPeranGuru($kunci, bersih($g['nama']));
            if ($peran['status'] === 'diperbaiki') {
                $diperbaiki++;
            } elseif ($peran['status'] === 'perlu-cek') {
                $perluCek[] = $nip . ' (peran: ' . $peran['role'] . ')';
            }
            $lewati++;
            continue;
        }
        $password = bersih($g['password']) !== '' ? bersih($g['password']) : 'guru123';
        jalan(
            'INSERT INTO pengguna (id, username, password, nama, kelas, role) VALUES (?,?,?,?,?,?)',
            [idBaru('p'), $kunci, $password, bersih($g['nama']) ?: $nip, bersih($g['mapel']), 'guru']
        );
        $ada[$kunci] = true;
        $dibuat++;
    }
    $pesan = $dibuat . ' akun guru dibuat (username = NIP).';
    if ($lewati) $pesan .= ' ' . $lewati . ' dilewati (sudah ada).';
    if ($diperbaiki) $pesan .= ' ' . $diperbaiki . ' peran diperbaiki otomatis menjadi Guru.';
    if ($perluCek) $pesan .= ' Periksa tab Pengguna untuk: ' . implode(', ', $perluCek) . '.';
    return ['success' => true, 'dibuat' => $dibuat, 'lewati' => $lewati, 'message' => $pesan];
}

/* ------------------------------------------------------------------ */
/* UJIAN + PENARGETAN                                                  */
/* ------------------------------------------------------------------ */

function jumlahSoal(string $ujianId): int
{
    $r = satu('SELECT COUNT(*) AS n FROM soal WHERE ujian_id = ?', [$ujianId]);
    return (int) ($r['n'] ?? 0);
}

/**
 * Tandai revisi soal — disetiap perubahan isi soal (tambah/ubah/hapus).
 * Klien siswa membandingkan `revisi` ini dengan salinan di HP; bila beda,
 * siswa diminta sinkron ulang (wajib sebelum Mulai Ujian).
 */
function naikkanRevisi(string $ujianId): void
{
    if ($ujianId === '') return;
    // Isi soal berubah → konfirmasi "siap dibagikan" otomatis dicabut,
    // guru harus mencentang ulang setelah perbaikan selesai.
    jalan(
        'UPDATE ujian SET revisi = revisi + 1, konfirmasi_guru = 0, konfirmasi_pada = NULL WHERE id = ?',
        [$ujianId]
    );
}

/** "X.2" -> "X" */
function tingkatDari($kelas): string
{
    $k = strtoupper(trim((string) $kelas));
    if ($k === '') return '';
    $i = strpos($k, '.');
    return $i !== false && $i > 0 ? trim(substr($k, 0, $i)) : $k;
}

function sasaranLabel($jenis, $nilai): string
{
    $jenis = strtolower(bersih($jenis));
    $nilai = bersih($nilai);
    if ($jenis === '' || $nilai === '') return 'Semua tingkat & kelas';
    if ($jenis === 'tingkat') return 'Seluruh tingkat ' . strtoupper($nilai);
    return 'Kelas: ' . $nilai;
}

function cocokSasar(array $u, string $kelas): bool
{
    $jenis = strtolower(bersih($u['sasar_jenis'] ?? ''));
    $nilai = bersih($u['sasar_nilai'] ?? '');
    if ($jenis === '' || $nilai === '') return true;
    $kelas = strtoupper(trim($kelas));
    if ($kelas === '') return false;
    if ($jenis === 'tingkat') return tingkatDari($kelas) === strtoupper($nilai);
    $daftar = array_map('strtoupper', array_map('trim', explode(',', $nilai)));
    return in_array($kelas, $daftar, true);
}

/**
 * Bentuk objek ujian untuk klien.
 * @param bool|null $kelasSiswa null = tanpa pengecekan (admin)
 * @param bool $sertakanToken
 */
function barisUjian(array $r, ?string $kelasSiswa, bool $sertakanToken = false): array
{
    $aktif = (int) $r['aktif'] === 1;
    $u = [
        'id' => (string) $r['id'],
        'judul' => (string) $r['judul'],
        'deskripsi' => (string) ($r['deskripsi'] ?? ''),
        'durasi_menit' => (int) $r['durasi_menit'],
        'aktif' => $aktif,
        'boleh_unduh' => (int) ($r['boleh_unduh'] ?? 0) === 1,
        'revisi' => (int) ($r['revisi'] ?? 1),
        'konfirmasi_guru' => (int) ($r['konfirmasi_guru'] ?? 0) === 1,
        'konfirmasi_pada' => (string) ($r['konfirmasi_pada'] ?? ''),
        'jumlah_soal' => jumlahSoal((string) $r['id']),
        'tgl_mulai' => (string) $r['tgl_mulai'],
        'sasar_jenis' => (string) $r['sasar_jenis'],
        'sasar_nilai' => (string) $r['sasar_nilai'],
        'mapel' => (string) ($r['mapel'] ?? ''),
    ];
    if ($sertakanToken) {
        $u['guru_nip'] = (string) ($r['guru_nip'] ?? '');
        $u['guru_nama'] = (string) ($r['guru_nama'] ?? '');
    }
    $u['sasaran'] = sasaranLabel($u['sasar_jenis'], $u['sasar_nilai']);
    $u['boleh'] = $kelasSiswa === null ? true : cocokSasar($u, $kelasSiswa);
    if ($sertakanToken) $u['token'] = (string) $r['token'];
    return $u;
}

function cariUjian(string $id): ?array
{
    return satu('SELECT * FROM ujian WHERE id = ? LIMIT 1', [$id]);
}

/**
 * Bolehkah peran saat ini mengelola ujian ini?
 * Admin bebas; guru HANYA ujian yang ditugaskan kepadanya
 * (ujian.guru_nip = username login guru = NIP, huruf kecil).
 */
function bolehUjian(?array $ujian, string $peran, string $pengguna): bool
{
    if ($ujian === null) return false;
    if (strtolower($peran) === 'admin') return true;
    if (strtolower($peran) !== 'guru') return false;
    $nip = strtolower(bersih($ujian['guru_nip'] ?? ''));
    return $nip !== '' && $nip === strtolower(bersih($pengguna));
}

/** Gerbang guard: kembalikan galat bila guru tidak berhak atas ujian ini. */
function tolakBilaBukanMilik(array $d, string $ujianId, string $pesan = ''): ?array
{
    $u = cariUjian($ujianId);
    if (!$u) return galat('Ujian tidak ditemukan.');
    if (!bolehUjian($u, (string) ($d['sesi_role'] ?? ''), (string) ($d['sesi_user'] ?? ''))) {
        return galat($pesan !== '' ? $pesan : 'Ujian ini ditugaskan ke guru lain.');
    }
    return null;
}

/** Daftar ujian aktif untuk siswa + kelayakan, izin unduh & status unduh. */
function a_getUjianSiswa(array $d): array
{
    $kelas = bersih($d['kelas'] ?? '');
    $username = bersih($d['sesi_user'] ?? '');
    $unduh = [];
    foreach (semua('SELECT ujian_id FROM unduhan WHERE username = ?', [$username]) as $r) {
        $unduh[$r['ujian_id']] = true;
    }
    $daftar = [];
    foreach (semua('SELECT * FROM ujian WHERE aktif = 1 ORDER BY dibuat') as $r) {
        $u = barisUjian($r, $kelas);
        if (!$u['aktif']) continue;
        $u['sudah_unduh'] = isset($unduh[$u['id']]);
        $daftar[] = $u;
    }
    return ['success' => true, 'ujian' => $daftar];
}

/** Info satu ujian untuk siswa (tanpa token). */
function a_getUjianInfo(array $d): array
{
    $r = cariUjian(bersih($d['id'] ?? ''));
    if (!$r) return galat('Ujian tidak ditemukan.');
    $u = barisUjian($r, null);
    if (!$u['aktif']) return galat('Ujian belum diaktifkan admin.');
    return ['success' => true, 'ujian' => $u];
}

/**
 * Daftar ujian untuk petugas — DENGAN token.
 * Admin melihat semua; guru HANYA ujian yang ditugaskan kepadanya.
 */
function a_getUjian(array $d): array
{
    $rows = semua('SELECT * FROM ujian ORDER BY dibuat DESC');
    $peran = (string) ($d['sesi_role'] ?? '');
    $pengguna = (string) ($d['sesi_user'] ?? '');
    $daftar = [];
    foreach ($rows as $r) {
        if (!bolehUjian($r, $peran, $pengguna)) continue;
        $daftar[] = barisUjian($r, null, true);
    }
    return ['success' => true, 'ujian' => $daftar];
}

function validasiSasar($jenis, $nilai): array
{
    $jenis = strtolower(bersih($jenis));
    $nilai = bersih($nilai);
    if ($jenis === '') return ['jenis' => '', 'nilai' => ''];
    if ($jenis === 'tingkat') {
        $t = strtoupper($nilai);
        if (!in_array($t, ['X', 'XI', 'XII'], true)) return ['error' => 'Tingkat harus X, XI, atau XII.'];
        return ['jenis' => 'tingkat', 'nilai' => $t];
    }
    if ($jenis === 'kelas') {
        $bersih = implode(',', array_filter(array_map('trim', explode(',', $nilai))));
        if ($bersih === '') return ['error' => 'Pilih minimal satu kelas.'];
        return ['jenis' => 'kelas', 'nilai' => $bersih];
    }
    return ['error' => 'Jenis sasaran tidak valid.'];
}

function validasiTglMulai($nilai): string
{
    $t = bersih($nilai);
    if ($t === '') return '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $t)) {
        throw new RuntimeException('Format tanggal/jam mulai tidak valid.');
    }
    return substr($t, 0, 16);
}

function a_buatUjian(array $d): array
{
    $judul = bersih($d['judul'] ?? '');
    if ($judul === '') return galat('Judul ujian wajib diisi.');
    $token = strtoupper(bersih($d['token'] ?? '')) ?: buatTokenAcak();
    if (!preg_match('/^[A-Z0-9]{4,12}$/', $token)) {
        return galat('Token harus 4–12 huruf/angka tanpa spasi.');
    }
    $durasi = (int) floor((float) ($d['durasi_menit'] ?? 60));
    if ($durasi < 1 || $durasi > 600) return galat('Durasi harus 1–600 menit.');
    $sasar = validasiSasar($d['sasar_jenis'] ?? '', $d['sasar_nilai'] ?? '');
    if (isset($sasar['error'])) return galat($sasar['error']);
    $tgl = validasiTglMulai($d['tgl_mulai'] ?? '');

    $id = idBaru('u');
    jalan(
        'INSERT INTO ujian (id, judul, deskripsi, token, durasi_menit, aktif, boleh_unduh, tgl_mulai, sasar_jenis, sasar_nilai, mapel, guru_nip, guru_nama)
         VALUES (?,?,?,?,?,0,0,?,?,?,?,?,?)',
        [
            $id,
            $judul,
            bersih($d['deskripsi'] ?? ''),
            $token,
            $durasi,
            $tgl,
            $sasar['jenis'],
            $sasar['nilai'],
            bersih($d['mapel'] ?? ''),
            bersih($d['guru_nip'] ?? ''),
            bersih($d['guru_nama'] ?? ''),
        ]
    );
    return ['success' => true, 'id' => $id, 'token' => $token, 'message' => 'Ujian dibuat (masih draft).'];
}

function a_aturUjian(array $d): array
{
    $token = strtoupper(bersih($d['token'] ?? ''));
    $durasi = (int) floor((float) ($d['durasi_menit'] ?? 0));
    if (!preg_match('/^[A-Z0-9]{4,12}$/', $token)) return galat('Token harus 4–12 huruf/angka.');
    if ($durasi < 1 || $durasi > 600) return galat('Durasi harus 1–600 menit.');
    $sasar = validasiSasar($d['sasar_jenis'] ?? '', $d['sasar_nilai'] ?? '');
    if (isset($sasar['error'])) return galat($sasar['error']);
    $tgl = validasiTglMulai($d['tgl_mulai'] ?? '');
    $id = bersih($d['id'] ?? '');
    if (array_key_exists('mapel', $d) || array_key_exists('guru_nip', $d)) {
        // Admin mengubah mapel & guru penanggung jawab soal.
        jalan(
            'UPDATE ujian SET mapel = ?, guru_nip = ?, guru_nama = ? WHERE id = ?',
            [bersih($d['mapel'] ?? ''), bersih($d['guru_nip'] ?? ''), bersih($d['guru_nama'] ?? ''), $id]
        );
    }

    $n = jalan(
        'UPDATE ujian SET token = ?, durasi_menit = ?, tgl_mulai = ?, sasar_jenis = ?, sasar_nilai = ? WHERE id = ?',
        [$token, $durasi, $tgl, $sasar['jenis'], $sasar['nilai'], $id]
    );
    return $n > 0 ? ['success' => true, 'message' => 'Pengaturan ujian disimpan.'] : galat('Ujian tidak ditemukan.');
}

function a_setAktifUjian(array $d): array
{
    $aktif = !empty($d['aktif']) ? 1 : 0;
    $n = jalan('UPDATE ujian SET aktif = ? WHERE id = ?', [$aktif, bersih($d['id'] ?? '')]);
    return $n > 0
        ? ['success' => true, 'message' => $aktif ? 'Ujian aktif.' : 'Ujian dinonaktifkan.']
        : galat('Ujian tidak ditemukan.');
}

/** Izin bagikan: admin membuka/menutup unduh soal per mapel. */
function a_setIzinUnduh(array $d): array
{
    $boleh = !empty($d['boleh']) ? 1 : 0;
    $n = jalan('UPDATE ujian SET boleh_unduh = ? WHERE id = ?', [$boleh, bersih($d['id'] ?? '')]);
    return $n > 0
        ? ['success' => true, 'message' => $boleh ? 'Siswa boleh mengunduh soal.' : 'Izin unduh ditutup.']
        : galat('Ujian tidak ditemukan.');
}

/** Konfirmasi guru: soal sudah selesai & siap dibagikan (lampu status admin). */
function a_konfirmasiUjian(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $on = !empty($d['konfirmasi']) ? 1 : 0;
    $tolak = tolakBilaBukanMilik($d, $id);
    if ($tolak) return $tolak;
    if (!satu('SELECT id FROM ujian WHERE id = ?', [$id])) return galat('Ujian tidak ditemukan.');
    if ($on) {
        jalan('UPDATE ujian SET konfirmasi_guru = 1, konfirmasi_pada = NOW() WHERE id = ?', [$id]);
    } else {
        jalan('UPDATE ujian SET konfirmasi_guru = 0, konfirmasi_pada = NULL WHERE id = ?', [$id]);
    }
    return [
        'success' => true,
        'message' => $on
            ? 'Konfirmasi terkirim — admin melihat lampu hijau.'
            : 'Konfirmasi dibatalkan — lampu admin jadi merah.',
    ];
}

function a_hapusUjian(array $d): array
{
    $id = bersih($d['id'] ?? '');
    jalan('DELETE FROM soal WHERE ujian_id = ?', [$id]);
    jalan('DELETE FROM hasil WHERE ujian_id = ?', [$id]);
    jalan('DELETE FROM unduhan WHERE ujian_id = ?', [$id]);
    jalan('DELETE FROM ujian WHERE id = ?', [$id]);
    return ['success' => true, 'message' => 'Ujian beserta soal & hasilnya dihapus.'];
}

/* ------------------------------------------------------------------ */
/* SOAL                                                                */
/* ------------------------------------------------------------------ */

function sisipSoal(string $ujianId, array $s): string
{
    $id = idBaru('s');
    jalan(
        'INSERT INTO soal (id, ujian_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, opsi_huruf, kunci_jawaban, gambar, tipe, kunci_teks, bacaan_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
            $id,
            $ujianId,
            $s['pertanyaan'],
            $s['opsi_a'],
            $s['opsi_b'],
            $s['opsi_c'],
            $s['opsi_d'],
            $s['opsi_e'] ?? '',
            (int) ($s['opsi_huruf'] ?? 0),
            $s['kunci_jawaban'],
            (string) ($s['gambar'] ?? ''),
            (string) ($s['tipe'] ?? 'pg'),
            (string) ($s['kunci_teks'] ?? ''),
            (string) ($s['bacaan_id'] ?? ''),
        ]
    );
    return $id;
}

function barisSoal(array $r, bool $denganKunci, array $petaBacaan = []): array
{
    $tipe = strtolower(bersih($r['tipe'] ?? 'pg'));
    if (!in_array($tipe, ['pg', 'essay', 'uraian'], true)) $tipe = 'pg';
    $bacaanId = (string) ($r['bacaan_id'] ?? '');
    $out = [
        'id' => (string) $r['id'],
        'ujian_id' => (string) $r['ujian_id'],
        'pertanyaan' => (string) $r['pertanyaan'],
        'opsi_a' => (string) $r['opsi_a'],
        'opsi_b' => (string) $r['opsi_b'],
        'opsi_c' => (string) $r['opsi_c'],
        'opsi_d' => (string) $r['opsi_d'],
        'opsi_e' => (string) $r['opsi_e'],
        'opsi_huruf' => (int) ($r['opsi_huruf'] ?? 0),
        'gambar' => (string) ($r['gambar'] ?? ''),
        'tipe' => $tipe,
        'bacaan_id' => $bacaanId,
    ];
    // Teks bacaan bersama ikut disertakan agar tersimpan di HP siswa (offline).
    if ($bacaanId !== '' && $petaBacaan !== []) {
        $out['bacaan'] = (string) ($petaBacaan[$bacaanId] ?? '');
    }
    if ($denganKunci) {
        $out['kunci_jawaban'] = strtoupper(bersih($r['kunci_jawaban']));
        $out['kunci_teks'] = (string) ($r['kunci_teks'] ?? '');
    }
    return $out;
}

/** Peta bacaan_id → teks untuk satu ujian (dipakai render daftar soal). */
function petaBacaan(string $ujianId): array
{
    $peta = [];
    foreach (semua('SELECT id, teks FROM bacaan WHERE ujian_id = ?', [$ujianId]) as $b) {
        $peta[(string) $b['id']] = (string) $b['teks'];
    }
    return $peta;
}

/** Daftar teks bacaan milik satu ujian. */
function daftarBacaan(string $ujianId): array
{
    return array_map(fn($b) => [
        'id' => (string) $b['id'],
        'ujian_id' => (string) $b['ujian_id'],
        'judul' => (string) $b['judul'],
        'teks' => (string) $b['teks'],
    ], semua('SELECT * FROM bacaan WHERE ujian_id = ? ORDER BY id', [$ujianId]));
}

/**
 * Unduh soal untuk siswa — izin bagikan (tombol "Bagikan" admin) + ujian
 * aktif + kelas sesuai sasaran. TANPA token: siswa boleh mengunduh semua
 * mapel yang sudah dibagikan kapan pun (online); token justru dimasukkan
 * saat MULAI UJIAN dan diverifikasi lokal terhadap `token_hash` di bawah.
 * Berhasil → catat unduhan (status sinkron).
 */
function a_getSoal(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $kelas = bersih($d['kelas'] ?? '');

    $r = cariUjian($id);
    if (!$r) return galat('Ujian tidak ditemukan.');
    if ((int) $r['aktif'] !== 1) return galat('Ujian belum diaktifkan admin.');

    // Izin bagikan mengatur unduh PERTAMA; siswa yang PERNAH mengunduh tetap
    // boleh sinkron ulang (mis. setelah guru memperbaiki soal) walau izin
    // sudah ditutup admin.
    $username = bersih($d['sesi_user'] ?? '');
    $pernahUnduh = false;
    if ($username !== '') {
        $p = satu('SELECT username FROM unduhan WHERE ujian_id = ? AND username = ?', [$id, $username]);
        $pernahUnduh = $p !== null;
    }
    if ((int) ($r['boleh_unduh'] ?? 0) !== 1 && !$pernahUnduh) {
        return galat('Admin belum membuka izin unduh soal untuk mapel ini. Tunggu info pengawas.');
    }

    $meta = barisUjian($r, $kelas !== '' ? $kelas : null);
    if (!$meta['boleh']) {
        return galat(
            $meta['sasaran'] . ' — kelasmu tidak terdaftar untuk ujian ini.'
            . ($kelas === '' ? ' Lengkapi kelas pada data siswa/akunmu.' : '')
        );
    }

    jalan(
        'INSERT INTO unduhan (ujian_id, username, waktu) VALUES (?,?,NOW())
         ON DUPLICATE KEY UPDATE waktu = NOW()',
        [$id, $username]
    );

    $daftar = [];
    $peta = petaBacaan($id);
    foreach (semua('SELECT * FROM soal WHERE ujian_id = ?', [$id]) as $s) {
        $daftar[] = barisSoal($s, false, $peta);
    }
    if (!$daftar) return galat('Ujian ini belum memiliki soal.');

    return [
        'success' => true,
        'ujian' => $meta,
        'soal' => $daftar,
        // Komitmen token — siswa memasukkan token pengawas saat Mulai Ujian,
        // lalu SHA-256 input dicocokkan secara LOKAL (bisa offline).
        'token_hash' => hash('sha256', strtoupper(bersih($r['token']))),
        'pin_pengawas' => pinPengawas(),
    ];
}

/** Soal untuk petugas: DENGAN kunci jawaban + daftar teks bacaan. */
function a_getSoalAdmin(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;
    $peta = petaBacaan($ujianId);
    $daftar = [];
    foreach (semua('SELECT * FROM soal WHERE ujian_id = ?', [$ujianId]) as $s) {
        $daftar[] = barisSoal($s, true, $peta);
    }
    return ['success' => true, 'soal' => $daftar, 'bacaan' => daftarBacaan($ujianId)];
}

/**
 * Validasi isi soal bersama (tambah / ubah / impor massal).
 * @return array{error:string}|array{pertanyaan:string,opsi_a:string,opsi_b:string,opsi_c:string,opsi_d:string,opsi_e:string,kunci_jawaban:string,gambar:string,opsi_huruf:int,tipe:string,kunci_teks:string,bacaan_id:string}
 */
function validasiIsiSoal(array $d): array
{
    $pertanyaan = bersih($d['pertanyaan'] ?? '');
    if ($pertanyaan === '') return ['error' => 'Pertanyaan wajib diisi.'];

    // Tipe soal: pg (pilihan ganda) | essay | uraian — dua terakhir dinilai
    // manual guru lewat menu Koreksi, jadi opsi & kunci huruf tidak dipakai.
    $tipe = strtolower(bersih($d['tipe'] ?? 'pg'));
    if ($tipe === '') $tipe = 'pg';
    if (!in_array($tipe, ['pg', 'essay', 'uraian'], true)) {
        return ['error' => 'Tipe soal tidak valid (pilihan ganda / essay / uraian).'];
    }
    $kunciTeks = (string) ($d['kunci_teks'] ?? '');
    if (panjangTeks($kunciTeks) > 20000) return ['error' => 'Kunci/rubrik jawaban terlalu panjang (maks 20.000 karakter).'];
    $bacaanId = bersih($d['bacaan_id'] ?? '');

    if ($tipe !== 'pg') {
        $gambar = (string) ($d['gambar'] ?? '');
        if ($gambar !== '' && (strpos($gambar, 'data:image/') !== 0 || strlen($gambar) > 400000)) {
            return ['error' => 'Format/ukuran gambar soal tidak valid.'];
        }
        return [
            'pertanyaan' => $pertanyaan,
            'opsi_a' => '', 'opsi_b' => '', 'opsi_c' => '', 'opsi_d' => '', 'opsi_e' => '',
            'kunci_jawaban' => '',
            'gambar' => $gambar,
            'opsi_huruf' => 0,
            'tipe' => $tipe,
            'kunci_teks' => $kunciTeks,
            'bacaan_id' => $bacaanId,
        ];
    }

    // Huruf depan pilihan tidak perlu dipilih mode lagi — DETEKSI OTOMATIS:
    // bila semua pilihan berisi memakai penanda hurufnya sendiri ("A. …" di
    // kolom A, "B. …" di kolom B), teks disimpan apa adanya; selain itu
    // penanda dibuang dan huruf dipasang saat tampil ke siswa.
    // Klien yang mengirim opsi_huruf secara eksplisit tetap dihormati.
    $opsiHuruf = (array_key_exists('opsi_huruf', $d) && $d['opsi_huruf'] !== null && $d['opsi_huruf'] !== '')
        ? (!empty($d['opsi_huruf']) ? 1 : 0)
        : deteksiHurufOpsi($d);

    $opsi = [];
    foreach (['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d'] as $w) {
        $huruf = strtoupper(substr($w, -1));
        $asli = bersih($d[$w] ?? '');
        $polos = $asli === '' ? '' : buangHurufOpsi($asli);
        if ($polos === '') {
            // Bedakan "kosong" vs "hanya huruf" agar guru tahu opsi mana
            // yang perlu diperbaiki (mis. mengetik "A." saja di kolom B).
            if ($asli !== '') {
                return ['error' => 'Opsi ' . $huruf . ' hanya berisi huruf ("' . $asli . '") — tulis teks pilihan, mis. "' . $huruf . '. Jawaban".'];
            }
            return ['error' => 'Opsi ' . $huruf . ' wajib diisi (opsi E opsional).'];
        }
        $v = $opsiHuruf ? $asli : $polos;
        if (panjangTeks($v) > 600) return ['error' => 'Setiap pilihan maksimal 600 karakter.'];
        $opsi[$w] = $v;
    }
    $opsiE = bersih($d['opsi_e'] ?? '');
    if ($opsiE !== '') {
        $polosE = buangHurufOpsi($opsiE);
        if ($polosE === '') {
            return ['error' => 'Opsi E hanya berisi huruf ("' . $opsiE . '") — tulis teks pilihannya atau kosongkan kolomnya.'];
        }
        if (!$opsiHuruf) $opsiE = $polosE;
        if (panjangTeks($opsiE) > 600) return ['error' => 'Setiap pilihan maksimal 600 karakter.'];
    }

    $kunci = strtoupper(bersih($d['kunci_jawaban'] ?? ''));
    if (!in_array($kunci, ['A', 'B', 'C', 'D', 'E'], true)) return ['error' => 'Kunci jawaban harus huruf A–E.'];
    if ($kunci === 'E' && $opsiE === '') return ['error' => 'Opsi E kosong — kunci tidak boleh E.'];

    $gambar = (string) ($d['gambar'] ?? '');
    if ($gambar !== '') {
        if (strpos($gambar, 'data:image/') !== 0) return ['error' => 'Format gambar soal tidak valid.'];
        if (strlen($gambar) > 400000) {
            return ['error' => 'Gambar soal terlalu besar (maks ±300 KB setelah dikompres). Pilih gambar yang lebih sederhana.'];
        }
    }

    return [
        'pertanyaan' => $pertanyaan,
        'opsi_a' => $opsi['opsi_a'],
        'opsi_b' => $opsi['opsi_b'],
        'opsi_c' => $opsi['opsi_c'],
        'opsi_d' => $opsi['opsi_d'],
        'opsi_e' => $opsiE,
        'kunci_jawaban' => $kunci,
        'gambar' => $gambar,
        'opsi_huruf' => $opsiHuruf,
        'tipe' => 'pg',
        'kunci_teks' => $kunciTeks,
        'bacaan_id' => $bacaanId,
    ];
}/** Mode "belum berhuruf": buang penanda "A." / "B)" / "C -" di depan teks.
 *  Catatan: tanda hubung HARUS di-escape (\-) — tanpa itu PCRE membacanya
 *  sebagai rentang " "–"–" dan ikut menghapus seluruh teks berawalan A–E. */
function buangHurufOpsi(string $v): string
{
    $b = preg_replace('/^[A-E][\s.)\-–—:]+/iu', '', $v);
    if ($b === null) return trim($v); // UTF-8 tidak valid — biarkan apa adanya
    return trim($b);
}

/**
 * Deteksi otomatis: 1 bila SEMUA pilihan berisi memakai penanda hurufnya
 * sendiri ("A. …" di kolom A dst.) — teks disimpan apa adanya.
 * Selain itu (sebagian berhuruf / tidak ada) → 0, penanda dibuang semua.
 */
function deteksiHurufOpsi(array $d): int
{
    $jumlah = 0;
    $semua = true;
    foreach (['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e'] as $w) {
        $teks = bersih($d[$w] ?? '');
        if ($teks === '') continue;
        $jumlah++;
        $huruf = strtoupper(substr($w, -1));
        if (!preg_match('/^' . $huruf . '[\s.)\-–—:]+/iu', $teks)) $semua = false;
    }
    return ($jumlah > 0 && $semua) ? 1 : 0;
}

/** Panjang teks dalam karakter (fallback bila ekstensi mbstring tidak ada). */
function panjangTeks(string $t): int
{
    return function_exists('mb_strlen') ? mb_strlen($t) : strlen($t);
}

function a_tambahSoal(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;
    $v = validasiIsiSoal($d);
    if (isset($v['error'])) return galat($v['error']);

    $id = sisipSoal($ujianId, $v);
    naikkanRevisi($ujianId);
    return ['success' => true, 'id' => $id, 'message' => 'Soal ditambahkan.'];
}

/** Perbaiki soal yang sudah ada (pertanyaan/opsi/kunci/gambar) — menaikkan revisi. */
function a_ubahSoal(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $v = validasiIsiSoal($d);
    if (isset($v['error'])) return galat($v['error']);

    $lama = satu('SELECT ujian_id FROM soal WHERE id = ?', [$id]);
    if (!$lama) return galat('Soal tidak ditemukan.');
    $tolak = tolakBilaBukanMilik($d, (string) $lama['ujian_id']);
    if ($tolak) return $tolak;

    jalan(
        'UPDATE soal SET pertanyaan = ?, opsi_a = ?, opsi_b = ?, opsi_c = ?, opsi_d = ?, opsi_e = ?, opsi_huruf = ?, kunci_jawaban = ?, gambar = ?, tipe = ?, kunci_teks = ?, bacaan_id = ? WHERE id = ?',
        [
            $v['pertanyaan'],
            $v['opsi_a'],
            $v['opsi_b'],
            $v['opsi_c'],
            $v['opsi_d'],
            $v['opsi_e'],
            $v['opsi_huruf'],
            $v['kunci_jawaban'],
            $v['gambar'],
            $v['tipe'],
            $v['kunci_teks'],
            $v['bacaan_id'],
            $id,
        ]
    );
    naikkanRevisi((string) $lama['ujian_id']);
    return [
        'success' => true,
        'message' => 'Soal diperbarui — siswa yang sudah mengunduh perlu sinkron ulang.',
    ];
}

/** Impor massal hasil pemecah teks Word: soal = [ {pertanyaan, opsi_*, kunci_jawaban}, … ] */
function a_imporSoal(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    if ($ujianId === '') return galat('Ujian tidak valid.');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;
    $daftar = is_array($d['soal'] ?? null) ? $d['soal'] : [];
    if (!$daftar) return galat('Tidak ada soal untuk diimpor.');
    if (count($daftar) > 200) return galat('Maksimal 200 soal per sekali impor.');

    $masuk = 0;
    $lewati = 0;
    foreach ($daftar as $s) {
        if (!is_array($s)) {
            $lewati++;
            continue;
        }
        $v = validasiIsiSoal($s);
        if (isset($v['error'])) {
            $lewati++;
            continue;
        }
        sisipSoal($ujianId, $v);
        $masuk++;
    }
    if ($masuk === 0) return galat('Tidak ada soal yang valid untuk diimpor.');
    naikkanRevisi($ujianId);

    $pesan = $masuk . ' soal diimpor.';
    if ($lewati) $pesan .= ' ' . $lewati . ' dilewati (belum lengkap).';
    return ['success' => true, 'masuk' => $masuk, 'lewati' => $lewati, 'message' => $pesan];
}

function a_tambahSoalContoh(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;
    foreach (SOAL_CONTOH as $s) sisipSoal($ujianId, ['tipe' => 'pg', 'bacaan_id' => '', 'kunci_teks' => ''] + $s);
    naikkanRevisi($ujianId);
    return ['success' => true, 'message' => count(SOAL_CONTOH) . ' soal contoh ditambahkan.'];
}

function a_hapusSoal(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $lama = satu('SELECT ujian_id FROM soal WHERE id = ?', [$id]);
    if ($lama) {
        $tolak = tolakBilaBukanMilik($d, (string) $lama['ujian_id']);
        if ($tolak) return $tolak;
    }
    jalan('DELETE FROM soal WHERE id = ?', [$id]);
    if ($lama) naikkanRevisi((string) $lama['ujian_id']);
    return ['success' => true, 'message' => 'Soal dihapus.'];
}

/* ------------------------------------------------------------------ */
/* HASIL (grading di server)                                           */
/* ------------------------------------------------------------------ */

function a_submitJawaban(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $nama = bersih($d['nama'] ?? '');
    $kelas = bersih($d['kelas'] ?? '');
    $token = strtoupper(bersih($d['token'] ?? ''));
    $totalPelanggaran = max(0, (int) ($d['total_pelanggaran'] ?? 0));
    $jawaban = is_array($d['jawaban'] ?? null) ? $d['jawaban'] : [];

    if ($ujianId === '') return galat('Ujian tidak valid.');
    if ($nama === '' || $kelas === '') return galat('Nama dan kelas wajib diisi.');

    $meta = cariUjian($ujianId);
    if (!$meta) return galat('Ujian tidak ditemukan.');

    // Bobot: tiap soal bernilai 100 poin. PG benar = 100; essay/uraian
    // dinilai manual (awalnya 0, menunggu koreksi guru).
    $kunciMap = [];
    $tipeMap = [];
    $totalSoal = 0;
    foreach (semua('SELECT id, kunci_jawaban, tipe FROM soal WHERE ujian_id = ?', [$ujianId]) as $s) {
        $idS = (string) $s['id'];
        $kunciMap[$idS] = strtoupper(bersih($s['kunci_jawaban']));
        $tipe = strtolower(bersih($s['tipe'] ?? 'pg'));
        $tipeMap[$idS] = in_array($tipe, ['essay', 'uraian'], true) ? $tipe : 'pg';
        $totalSoal++;
    }

    $hasilId = idBaru('h');
    $poin = 0;
    foreach ($jawaban as $item) {
        $idSoal = (string) ($item['id_soal'] ?? '');
        if (!isset($tipeMap[$idSoal]) || $tipeMap[$idSoal] !== 'pg') continue;
        $pilihan = strtoupper(bersih($item['pilihan'] ?? ''));
        if ($pilihan !== '' && $kunciMap[$idSoal] === $pilihan) $poin += 100;
    }

    // Jawaban teks (essay/uraian) disimpan untuk dikoreksi manual guru.
    foreach ($jawaban as $item) {
        $idSoal = (string) ($item['id_soal'] ?? '');
        if (!isset($tipeMap[$idSoal]) || $tipeMap[$idSoal] === 'pg') continue;
        $teks = (string) ($item['teks'] ?? '');
        if (function_exists('mb_substr')) $teks = mb_substr($teks, 0, 20000);
        else $teks = substr($teks, 0, 20000);
        if (trim($teks) === '') continue;
        jalan(
            'INSERT INTO jawaban_teks (hasil_id, soal_id, ujian_id, teks, skor) VALUES (?,?,?,?,NULL)
             ON DUPLICATE KEY UPDATE teks = VALUES(teks), skor = NULL',
            [$hasilId, $idSoal, $ujianId, $teks]
        );
    }

    $nilai = $totalSoal > 0 ? (int) round($poin / $totalSoal) : 0;
    $benar = (int) round($poin / 100);
    jalan(
        'INSERT INTO hasil (id, ujian_id, ujian_judul, nama, kelas, token, benar, total_soal, nilai, poin, total_pelanggaran)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [
            $hasilId,
            $ujianId,
            (string) $meta['judul'],
            $nama,
            $kelas,
            $token,
            $benar,
            $totalSoal,
            $nilai,
            $poin,
            $totalPelanggaran,
        ]
    );

    return [
        'success' => true,
        'nilai' => $nilai,
        'benar' => $benar,
        'poin' => $poin,
        'total_soal' => $totalSoal,
        'total_pelanggaran' => $totalPelanggaran,
        'message' => 'Jawaban tersimpan.',
    ];
}

/** Hitung ulang poin/nilai/benar satu kiriman dari soal + skor koreksi. */
function hitungUlangHasil(string $hasilId): void
{
    $h = satu('SELECT ujian_id FROM hasil WHERE id = ?', [$hasilId]);
    if (!$h) return;
    $ujianId = (string) $h['ujian_id'];

    $totalSoal = 0;
    $pgBenar = 0;
    foreach (semua('SELECT id, tipe FROM soal WHERE ujian_id = ?', [$ujianId]) as $s) {
        $totalSoal++;
        if (strtolower(bersih($s['tipe'] ?? 'pg')) !== 'pg') continue;
        $r = satu(
            'SELECT pilihan FROM jawaban WHERE hasil_id = ? AND soal_id = ?',
            [$hasilId, (string) $s['id']]
        );
        if ($r) $pgBenar++;
    }

    $poin = $pgBenar * 100;
    $tipeMap = [];
    foreach (semua('SELECT id, tipe FROM soal WHERE ujian_id = ?', [$ujianId]) as $s) {
        $tipeMap[(string) $s['id']] = strtolower(bersih($s['tipe'] ?? 'pg'));
    }
    foreach (semua('SELECT soal_id, skor FROM jawaban_teks WHERE hasil_id = ?', [$hasilId]) as $j) {
        $idS = (string) $j['soal_id'];
        if (($tipeMap[$idS] ?? 'pg') === 'pg') continue;
        if ($j['skor'] === null) continue;
        $skor = max(0, min(100, (int) $j['skor']));
        $poin += $skor;
    }

    $nilai = $totalSoal > 0 ? (int) round($poin / $totalSoal) : 0;
    jalan(
        'UPDATE hasil SET poin = ?, nilai = ?, benar = ? WHERE id = ?',
        [$poin, $nilai, (int) round($poin / 100), $hasilId]
    );
}

/** Jumlah soal essay/uraian yang jawabannya belum dikoreksi. */
function jumlahMenunggu(string $hasilId, string $ujianId): int
{
    $sql = "SELECT COUNT(*) AS n FROM jawaban_teks j
            JOIN soal s ON s.id = j.soal_id
            WHERE j.hasil_id = ? AND j.skor IS NULL
              AND LOWER(COALESCE(s.tipe,'pg')) IN ('essay','uraian')";
    $r = satu($sql, [$hasilId]);
    return (int) ($r['n'] ?? 0);
}

function barisHasil(array $r): array
{
    $hasilId = (string) $r['id'];
    $ujianId = (string) $r['ujian_id'];
    return [
        'id' => $hasilId,
        'ujian_id' => $ujianId,
        'ujian_judul' => (string) $r['ujian_judul'],
        'nama' => (string) $r['nama'],
        'kelas' => (string) $r['kelas'],
        'token' => (string) $r['token'],
        'benar' => (int) $r['benar'],
        'total_soal' => (int) $r['total_soal'],
        'nilai' => (int) $r['nilai'],
        'poin' => (int) ($r['poin'] ?? 0),
        'menunggu' => jumlahMenunggu($hasilId, $ujianId),
        'total_pelanggaran' => (int) $r['total_pelanggaran'],
        'timestamp' => isset($r['timestamp']) && $r['timestamp'] ? (string) $r['timestamp'] : '',
    ];
}

function a_getHasil(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;
    $rows = semua('SELECT * FROM hasil WHERE ujian_id = ? ORDER BY timestamp DESC', [$ujianId]);
    return ['success' => true, 'hasil' => array_map('barisHasil', $rows)];
}

function a_getHasilSaya(array $d): array
{
    $cari = strtolower(bersih($d['nama'] ?? ''));
    $rows = semua('SELECT * FROM hasil ORDER BY timestamp DESC');
    $daftar = [];
    foreach ($rows as $r) {
        if (strtolower(bersih($r['nama'])) === $cari) $daftar[] = barisHasil($r);
    }
    return ['success' => true, 'hasil' => $daftar];
}

/* ------------------------------------------------------------------ */
/* KOREKSI MANUAL (essay & uraian)                                     */
/* ------------------------------------------------------------------ */

/** Daftar kiriman siswa satu ujian + jumlah yang menunggu koreksi. */
function a_getKoreksi(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;

    $soal = [];
    foreach (semua('SELECT * FROM soal WHERE ujian_id = ? ORDER BY id', [$ujianId]) as $s) {
        $b = barisSoal($s, true, petaBacaan($ujianId));
        if ($b['tipe'] === 'pg') continue;
        $soal[] = $b;
    }

    $kiriman = array_map('barisHasil', semua(
        'SELECT * FROM hasil WHERE ujian_id = ? ORDER BY timestamp DESC',
        [$ujianId]
    ));

    return ['success' => true, 'soal' => $soal, 'kiriman' => $kiriman];
}

/** Jawaban teks satu kiriman siswa (untuk layar koreksi). */
function a_getJawabanKoreksi(array $d): array
{
    $hasilId = bersih($d['hasil_id'] ?? '');
    $h = satu('SELECT ujian_id, nama, kelas FROM hasil WHERE id = ?', [$hasilId]);
    if (!$h) return galat('Kiriman jawaban tidak ditemukan.');
    $tolak = tolakBilaBukanMilik($d, (string) $h['ujian_id']);
    if ($tolak) return $tolak;

    $jawaban = [];
    foreach (semua('SELECT soal_id, teks, skor FROM jawaban_teks WHERE hasil_id = ?', [$hasilId]) as $j) {
        $jawaban[(string) $j['soal_id']] = [
            'soal_id' => (string) $j['soal_id'],
            'teks' => (string) $j['teks'],
            'skor' => $j['skor'] === null ? null : (int) $j['skor'],
        ];
    }

    return [
        'success' => true,
        'hasil' => [
            'id' => $hasilId,
            'ujian_id' => (string) $h['ujian_id'],
            'nama' => (string) $h['nama'],
            'kelas' => (string) $h['kelas'],
        ],
        'jawaban' => $jawaban,
    ];
}

/** Simpan skor 0–100 per soal essay/uraian, lalu hitung ulang nilai. */
function a_simpanKoreksi(array $d): array
{
    $hasilId = bersih($d['hasil_id'] ?? '');
    $h = satu('SELECT ujian_id FROM hasil WHERE id = ?', [$hasilId]);
    if (!$h) return galat('Kiriman jawaban tidak ditemukan.');
    $tolak = tolakBilaBukanMilik($d, (string) $h['ujian_id']);
    if ($tolak) return $tolak;

    $skor = is_array($d['skor'] ?? null) ? $d['skor'] : [];
    if (!$skor) return galat('Tidak ada skor untuk disimpan.');

    $tipeSoal = [];
    foreach (semua('SELECT id, tipe FROM soal WHERE ujian_id = ?', [(string) $h['ujian_id']]) as $s) {
        $tipeSoal[(string) $s['id']] = strtolower(bersih($s['tipe'] ?? 'pg'));
    }

    $tersimpan = 0;
    foreach ($skor as $soalId => $nilai) {
        $soalId = bersih($soalId);
        if ($soalId === '' || !isset($tipeSoal[$soalId]) || $tipeSoal[$soalId] === 'pg') continue;
        $n = max(0, min(100, (int) $nilai));
        $k = jalan(
            'UPDATE jawaban_teks SET skor = ? WHERE hasil_id = ? AND soal_id = ?',
            [$n, $hasilId, $soalId]
        );
        if ($k > 0) $tersimpan++;
    }
    if ($tersimpan === 0) return galat('Tidak ada skor yang tersimpan — pastikan soal essay/uraian punya jawaban siswa.');

    hitungUlangHasil($hasilId);
    $r = satu('SELECT benar, total_soal, nilai, poin FROM hasil WHERE id = ?', [$hasilId]);
    return [
        'success' => true,
        'message' => $tersimpan . ' jawaban dikoreksi — nilai dihitung ulang.',
        'hasil' => [
            'benar' => (int) ($r['benar'] ?? 0),
            'total_soal' => (int) ($r['total_soal'] ?? 0),
            'nilai' => (int) ($r['nilai'] ?? 0),
            'poin' => (int) ($r['poin'] ?? 0),
            'menunggu' => jumlahMenunggu($hasilId, (string) $h['ujian_id']),
        ],
    ];
}

/** Tambah/perbarui teks bacaan bersama (dipakai beberapa soal). */
function a_simpanBacaan(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
    $tolak = tolakBilaBukanMilik($d, $ujianId);
    if ($tolak) return $tolak;

    $judul = bersih($d['judul'] ?? '');
    $teks = (string) ($d['teks'] ?? '');
    if (trim($teks) === '') return galat('Isi teks bacaan wajib diisi.');
    if (panjangTeks($teks) > 60000) return galat('Teks bacaan terlalu panjang (maks 60.000 karakter).');

    $id = bersih($d['id'] ?? '');
    if ($id !== '') {
        $n = jalan('UPDATE bacaan SET judul = ?, teks = ? WHERE id = ? AND ujian_id = ?', [$judul, $teks, $id, $ujianId]);
        return $n > 0
            ? ['success' => true, 'id' => $id, 'message' => 'Teks bacaan diperbarui — semua soal terkait ikut terbaru.']
            : galat('Teks bacaan tidak ditemukan.');
    }

    $id = idBaru('bc');
    jalan('INSERT INTO bacaan (id, ujian_id, judul, teks) VALUES (?,?,?,?)', [$id, $ujianId, $judul, $teks]);
    return ['success' => true, 'id' => $id, 'message' => 'Teks bacaan ditambahkan.'];
}

/** Hapus teks bacaan — soal terkait otomatis lepas (bacaan_id dikosongkan). */
function a_hapusBacaan(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $b = satu('SELECT ujian_id FROM bacaan WHERE id = ?', [$id]);
    if (!$b) return galat('Teks bacaan tidak ditemukan.');
    $tolak = tolakBilaBukanMilik($d, (string) $b['ujian_id']);
    if ($tolak) return $tolak;

    jalan('UPDATE soal SET bacaan_id = \'\' WHERE bacaan_id = ?', [$id]);
    jalan('DELETE FROM bacaan WHERE id = ?', [$id]);
    naikkanRevisi((string) $b['ujian_id']);
    return ['success' => true, 'message' => 'Teks bacaan dihapus — soal terkait tidak lagi memakainya.'];
}

/* ------------------------------------------------------------------ */
/* PENGATURAN (PIN pengawas, secret)                                   */
/* ------------------------------------------------------------------ */

function pinPengawas(): string
{
    $pin = bacaPengaturan('pin_pengawas', '123456');
    return preg_match('/^\d{6}$/', $pin) ? $pin : '123456';
}

function a_getPengaturan(): array
{
    return ['success' => true, 'pin_pengawas' => pinPengawas()];
}

function a_aturPin(array $d): array
{
    $pin = bersih($d['pin'] ?? '');
    $ulang = bersih($d['pin_ulang'] ?? '') !== '' ? bersih($d['pin_ulang']) : $pin;
    if (!preg_match('/^\d{6}$/', $pin)) return galat('PIN harus tepat 6 angka.');
    if ($pin !== $ulang) return galat('PIN dan konfirmasi PIN tidak sama.');
    simpanPengaturan('pin_pengawas', $pin);
    return ['success' => true, 'message' => 'PIN buka blokir diperbarui.'];
}

/* ------------------------------------------------------------------ */
/* KARTU UJIAN (kop, logo, tanda tangan kepala madrasah — admin)       */
/* ------------------------------------------------------------------ */

/** Baca setelan kartu: kop madrasah, kota, kepala madrasah, logo & TTD. */
function a_getKartuSet(): array
{
    $set = [
        'sekolah' => 'MAN 2 PALEMBANG',
        'alamat' => '',
        'kota' => 'Palembang',
        'kepala' => '',
        'nip' => '',
    ];
    $teks = bacaPengaturan('kartu_teks', '');
    if ($teks !== '') {
        $j = json_decode($teks, true);
        if (is_array($j)) {
            foreach ($set as $k => $bawaan) {
                if (isset($j[$k]) && is_string($j[$k])) $set[$k] = $j[$k];
            }
        }
    }
    return [
        'success' => true,
        'sekolah' => $set['sekolah'],
        'alamat' => $set['alamat'],
        'kota' => $set['kota'],
        'kepala' => $set['kepala'],
        'nip' => $set['nip'],
        'logo' => bacaPengaturan('kartu_logo', ''),
        'ttd' => bacaPengaturan('kartu_ttd', ''),
    ];
}

/** Simpan setelan kartu (teks + gambar base64 "data:image/...;"). */
function a_aturKartuSet(array $d): array
{
    $teks = [
        'sekolah' => bersih($d['sekolah'] ?? ''),
        'alamat' => bersih($d['alamat'] ?? ''),
        'kota' => bersih($d['kota'] ?? ''),
        'kepala' => bersih($d['kepala'] ?? ''),
        'nip' => bersih($d['nip'] ?? ''),
    ];
    if ($teks['sekolah'] === '') return galat('Nama madrasah (kop) wajib diisi.');

    foreach (['logo', 'ttd'] as $k) {
        $g = (string) ($d[$k] ?? '');
        if ($g !== '' && strpos($g, 'data:image/') !== 0) {
            return galat('Format gambar logo/tanda tangan tidak valid.');
        }
        if (strlen($g) > 600000) {
            return galat('Gambar terlalu besar — gunakan gambar berukuran lebih kecil.');
        }
    }

    simpanPengaturan('kartu_teks', (string) json_encode($teks, JSON_UNESCAPED_UNICODE));
    simpanPengaturan('kartu_logo', (string) ($d['logo'] ?? ''));
    simpanPengaturan('kartu_ttd', (string) ($d['ttd'] ?? ''));
    return ['success' => true, 'message' => 'Pengaturan kartu ujian disimpan.'];
}

/* ------------------------------------------------------------------ */
/* RUANG UJIAN, JADWAL PENGAWAS & PENEMPATAN TEMPAT DUDUK (admin)      */
/* ------------------------------------------------------------------ */

/** Tingkat dari kelas: "X.1" → "X", "XI" → "XI". */
function tingkatDariKelas(string $kelas): string
{
    $k = strtoupper(trim($kelas));
    if ($k === '') return '';
    $pos = strpos($k, '.');
    return $pos !== false ? trim(substr($k, 0, $pos)) : $k;
}

/** Urut tingkat: X, XI, XII — selain itu di belakang. */
function urutTingkat(string $t): int
{
    $map = ['X' => 1, 'XI' => 2, 'XII' => 3, 'XIII' => 4];
    return $map[strtoupper(trim($t))] ?? 99;
}

/** Daftar ruang (terurut urutan buat). */
function daftarRuang(): array
{
    return array_map(function ($r) {
        $komp = [];
        $j = json_decode((string) ($r['komposisi'] ?? ''), true);
        if (is_array($j)) {
            foreach ($j as $t => $n) {
                $tk = strtoupper(bersih($t));
                if ($tk !== '' && (int) $n > 0) $komp[$tk] = (int) $n;
            }
        }
        return [
            'id' => (string) $r['id'],
            'nama' => (string) $r['nama'],
            'kapasitas' => (int) $r['kapasitas'],
            'komposisi' => $komp,
            'urutan' => (int) $r['urutan'],
        ];
    }, semua('SELECT * FROM ruang ORDER BY urutan, nama'));
}

/** NIP guru pengawas terpilih (tersimpan JSON di tabel pengaturan). */
function daftarPengawas(): array
{
    $j = json_decode(bacaPengaturan('ruang_pengawas', '[]'), true);
    $out = [];
    if (is_array($j)) {
        foreach ($j as $nip) {
            $n = bersih($nip);
            if ($n !== '') $out[] = $n;
        }
    }
    return array_values(array_unique($out));
}

/** Normalisasi jam "07:30" / "7.30" → "07.30" (bila valid). */
function jamNormal(string $v): string
{
    if (!preg_match('/^(\d{1,2})[:.\-](\d{2})$/', trim($v), $m)) return '';
    $j = (int) $m[1];
    $mi = (int) $m[2];
    if ($j > 23 || $mi > 59) return '';
    return sprintf('%02d.%02d', $j, $mi);
}

function a_getRuangSet(): array
{
    $ruang = daftarRuang();
    $namaRuang = [];
    foreach ($ruang as $r) $namaRuang[$r['id']] = $r['nama'];

    $jadwal = [];
    foreach (semua('SELECT * FROM jadwal_pengawas ORDER BY tanggal, sesi, ruang_nama') as $r) {
        $rid = (string) $r['ruang_id'];
        $jadwal[] = [
            'id' => (string) $r['id'],
            'hari_ke' => (int) $r['hari_ke'],
            'tanggal' => (string) $r['tanggal'],
            'sesi' => (int) $r['sesi'],
            'jam' => (string) $r['jam'],
            'ruang_id' => $rid,
            'ruang_nama' => (string) ($r['ruang_nama'] !== '' ? $r['ruang_nama'] : ($namaRuang[$rid] ?? '')),
            'nip' => (string) $r['nip'],
            'nama' => (string) $r['nama'],
        ];
    }

    $penempatan = [];
    $sql = 'SELECT p.ruang_id, p.nisn, p.nama, p.kelas, p.kursi, r.nama AS rnama
            FROM penempatan p LEFT JOIN ruang r ON r.id = p.ruang_id
            ORDER BY r.urutan, r.nama, p.kursi';
    foreach (semua($sql) as $p) {
        $penempatan[] = [
            'ruang_id' => (string) $p['ruang_id'],
            'ruang_nama' => (string) ($p['rnama'] ?? ''),
            'nisn' => (string) $p['nisn'],
            'nama' => (string) $p['nama'],
            'kelas' => (string) $p['kelas'],
            'kursi' => (int) $p['kursi'],
        ];
    }

    return [
        'success' => true,
        'ruang' => $ruang,
        'pengawas' => daftarPengawas(),
        'jadwal' => $jadwal,
        'penempatan' => $penempatan,
    ];
}

function a_simpanRuang(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $nama = bersih($d['nama'] ?? '');
    if ($nama === '') return galat('Nama ruang wajib diisi.');
    if (strlen($nama) > 64) return galat('Nama ruang maksimal 64 karakter.');
    $kapasitas = max(1, min(200, (int) ($d['kapasitas'] ?? 0)));

    $komp = [];
    if (is_array($d['komposisi'] ?? null)) {
        foreach ($d['komposisi'] as $t => $n) {
            $tk = strtoupper(bersih($t));
            $jml = (int) $n;
            if ($tk === '' || $jml < 0) continue;
            if ($jml > 0) $komp[$tk] = $jml;
        }
    }
    // Setiap ruang = campuran TEPAT dua tingkat (X+XI, X+XII, atau XI+XII)
    // dan jumlah keduanya harus sama dengan kapasitas ruang.
    if (count($komp) !== 2) {
        return galat(
            'Komposisi ruang harus tepat 2 tingkat (mis. X & XI, X & XII, atau XI & XII) — '
            . 'kosongkan tingkat yang tidak dipakai.'
        );
    }
    $totalKomp = (int) array_sum($komp);
    if ($totalKomp !== $kapasitas) {
        return galat(
            "Total kedua tingkat ($totalKomp siswa) harus SAMA dengan kapasitas ruang ($kapasitas)."
        );
    }

    $kompJson = $komp ? (string) json_encode($komp, JSON_UNESCAPED_UNICODE) : '';
    $pesanTambahan = '';

    if ($id !== '') {
        $lama = satu('SELECT kapasitas, komposisi FROM ruang WHERE id = ?', [$id]);
        if (!$lama) return galat('Ruang tidak ditemukan.');
        $strukturBaru = ((int) $lama['kapasitas'] !== $kapasitas)
            || (string) $lama['komposisi'] !== $kompJson;
        jalan(
            'UPDATE ruang SET nama = ?, kapasitas = ?, komposisi = ? WHERE id = ?',
            [$nama, $kapasitas, $kompJson, $id]
        );
        // Jadwal pengawas ikut memakai nama ruang terbaru.
        jalan('UPDATE jadwal_pengawas SET ruang_nama = ? WHERE ruang_id = ?', [$nama, $id]);
        if ($strukturBaru) {
            jalan('DELETE FROM penempatan WHERE ruang_id = ?', [$id]);
            $pesanTambahan = ' Struktur ruang berubah — penempatan pada ruang ini direset, susun ulang tempat duduk.';
        }
    } else {
        $maks = satu('SELECT MAX(urutan) AS m FROM ruang');
        $id = idBaru('rg');
        jalan(
            'INSERT INTO ruang (id, nama, kapasitas, komposisi, urutan) VALUES (?,?,?,?,?)',
            [$id, $nama, $kapasitas, $kompJson, ((int) ($maks['m'] ?? 0)) + 1]
        );
    }

    return ['success' => true, 'id' => $id, 'message' => 'Ruang "' . $nama . '" tersimpan.' . $pesanTambahan];
}

function a_hapusRuang(array $d): array
{
    $id = bersih($d['id'] ?? '');
    if ($id === '') return galat('Ruang tidak valid.');
    $lama = satu('SELECT nama FROM ruang WHERE id = ?', [$id]);
    if (!$lama) return galat('Ruang tidak ditemukan.');
    jalan('DELETE FROM ruang WHERE id = ?', [$id]);
    jalan('DELETE FROM penempatan WHERE ruang_id = ?', [$id]);
    jalan('DELETE FROM jadwal_pengawas WHERE ruang_id = ?', [$id]);
    return ['success' => true, 'message' => 'Ruang "' . bersih($lama['nama']) . '" beserta jadwal & penempatannya dihapus.'];
}

function a_simpanPengawas(array $d): array
{
    $namaGuru = [];
    foreach (semua('SELECT nip, nama FROM guru') as $g) {
        $namaGuru[strtolower(bersih($g['nip']))] = true;
    }
    $pilih = [];
    $tanpa = 0;
    foreach ((is_array($d['nips'] ?? null) ? $d['nips'] : []) as $nip) {
        $n = bersih($nip);
        if ($n === '') continue;
        if (!isset($namaGuru[strtolower($n)])) {
            $tanpa++;
            continue;
        }
        $pilih[] = $n;
    }
    $pilih = array_values(array_unique($pilih));
    simpanPengaturan('ruang_pengawas', (string) json_encode($pilih));
    $pesan = count($pilih) . ' guru ditetapkan sebagai pengawas ruang.';
    if ($tanpa > 0) $pesan .= " $tanpa NIP tidak ditemukan di Data Guru dan dilewati.";
    return ['success' => true, 'pengawas' => $pilih, 'message' => $pesan];
}

function a_buatJadwalPengawas(array $d): array
{
    $mulai = bersih($d['tanggal_mulai'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $mulai)) {
        return galat('Tanggal mulai ujian wajib diisi (format YYYY-MM-DD).');
    }
    $totalHari = max(1, min(60, (int) ($d['total_hari'] ?? 0)));
    $sesiHari = max(1, min(10, (int) ($d['sesi_per_hari'] ?? 0)));

    $ruang = daftarRuang();
    if (!$ruang) return galat('Belum ada ruang — buat daftar ruang dulu.');
    $pengawas = daftarPengawas();
    if (!$pengawas) return galat('Belum ada guru pengawas — centang guru pengawas dulu.');

    $namaGuru = [];
    foreach (semua('SELECT nip, nama FROM guru') as $g) {
        $namaGuru[strtolower(bersih($g['nip']))] = bersih($g['nama']);
    }

    // Jam per sesi: dari input (pisah koma/spasi/baris) atau default 2,5 jam.
    $jam = [];
    $potong = preg_split('/[,;\n]+/', (string) ($d['jam'] ?? '')) ?: [];
    foreach ($potong as $p) {
        $n = jamNormal($p);
        if ($n !== '' && !in_array($n, $jam, true)) $jam[] = $n;
    }
    while (count($jam) < $sesiHari) {
        $menit = 450 + count($jam) * 150; // 07.30, 10.00, 12.30, 15.00, …
        $jam[] = sprintf('%02d.%02d', intdiv($menit, 60) % 24, $menit % 60);
    }
    $jam = array_slice($jam, 0, max($sesiHari, 1));

    jalan('DELETE FROM jadwal_pengawas', []);
    $idx = 0;
    $dibuat = 0;
    $awal = new DateTime($mulai);
    for ($h = 1; $h <= $totalHari; $h++) {
        $tanggal = (clone $awal)->modify('+' . ($h - 1) . ' days')->format('Y-m-d');
        for ($s = 1; $s <= $sesiHari; $s++) {
            foreach ($ruang as $rg) {
                $nip = $pengawas[$idx % count($pengawas)];
                $idx++;
                jalan(
                    'INSERT INTO jadwal_pengawas
                     (id, hari_ke, tanggal, sesi, jam, ruang_id, ruang_nama, nip, nama)
                     VALUES (?,?,?,?,?,?,?,?,?)',
                    [
                        idBaru('jp'),
                        $h,
                        $tanggal,
                        $s,
                        $jam[$s - 1],
                        $rg['id'],
                        $rg['nama'],
                        $nip,
                        $namaGuru[strtolower($nip)] ?? $nip,
                    ]
                );
                $dibuat++;
            }
        }
    }

    $pesan = "$dibuat penugasan dibuat: $totalHari hari × $sesiHari sesi/hari × "
        . count($ruang) . ' ruang, merata dari ' . count($pengawas) . ' guru pengawas.';
    if (count($pengawas) < count($ruang)) {
        $pesan .= ' PERINGATAN: guru pengawas lebih sedikit dari jumlah ruang — ada guru yang mengawasi lebih dari satu ruang dalam sesi sama.';
    }
    return ['success' => true, 'dibuat' => $dibuat, 'jam' => $jam, 'message' => $pesan];
}

function a_buatPenempatan(array $d): array
{
    $ruang = daftarRuang();
    if (!$ruang) return galat('Belum ada ruang — buat daftar ruang dulu.');
    $siswa = semua('SELECT nisn, nama, kelas FROM siswa');
    if (!$siswa) return galat('Data siswa masih kosong — impor data siswa dulu.');

    // Urut: tingkat (X, XI, XII) → kelas → nama → NISN (natural).
    usort($siswa, function ($a, $b) {
        $ta = urutTingkat(tingkatDariKelas((string) $a['kelas']));
        $tb = urutTingkat(tingkatDariKelas((string) $b['kelas']));
        if ($ta !== $tb) return $ta <=> $tb;
        $ka = strnatcasecmp((string) $a['kelas'], (string) $b['kelas']);
        if ($ka !== 0) return $ka;
        $na = strnatcasecmp((string) $a['nama'], (string) $b['nama']);
        if ($na !== 0) return $na;
        return strnatcasecmp((string) $a['nisn'], (string) $b['nisn']);
    });

    // Kantong siswa per tingkat (belum terpakai semua).
    $kantong = [];
    foreach ($siswa as $s) {
        $t = tingkatDariKelas((string) $s['kelas']);
        if ($t === '') $t = 'LAIN';
        $kantong[$t][] = [
            'nisn' => bersih($s['nisn']),
            'nama' => bersih($s['nama']),
            'kelas' => bersih($s['kelas']),
        ];
    }

    jalan('DELETE FROM penempatan', []);
    $total = 0;
    $ringkas = [];
    $kurang = [];

    foreach ($ruang as $rg) {
        $kursi = 1;
        $terisi = 0;
        $pakai = []; // tingkat => sisa jatah (menipis saat digilir)
        if ($rg['komposisi']) {
            foreach ($rg['komposisi'] as $t => $n) $pakai[$t] = (int) $n;
        } else {
            foreach (array_keys($kantong) as $t) $pakai[$t] = PHP_INT_MAX;
        }
        // Urut tingkat agar hasil rapat: X, XI, XII, …
        uksort($pakai, function ($a, $b) {
            return urutTingkat($a) <=> urutTingkat($b);
        });
        $tingkats = array_keys($pakai);
        $perTingkat = [];
        $i = 0;
        while ($terisi < $rg['kapasitas'] && $tingkats) {
            // Berhenti bila tak ada lagi siswa yang bisa diambil.
            $ada = false;
            foreach ($tingkats as $t) {
                if ($pakai[$t] > 0 && !empty($kantong[$t])) {
                    $ada = true;
                    break;
                }
            }
            if (!$ada) break;
            $t = $tingkats[$i % count($tingkats)];
            $i++;
            if ($pakai[$t] <= 0 || empty($kantong[$t])) continue;
            $s = array_shift($kantong[$t]);
            if (!$s || $s['nisn'] === '') continue;
            $pakai[$t] = $pakai[$t] === PHP_INT_MAX ? PHP_INT_MAX : $pakai[$t] - 1;
            $perTingkat[$t] = ($perTingkat[$t] ?? 0) + 1;
            jalan(
                'INSERT INTO penempatan (ruang_id, nisn, nama, kelas, kursi) VALUES (?,?,?,?,?)',
                [$rg['id'], $s['nisn'], $s['nama'], $s['kelas'], $kursi]
            );
            $kursi++;
            $terisi++;
            $total++;
        }
        // Catat kekurangan terhadap komposisi yang diminta.
        $kurangRuang = [];
        foreach ($rg['komposisi'] as $t => $n) {
            $isi = (int) ($perTingkat[$t] ?? 0);
            if ($isi < $n) $kurangRuang[] = "$t hanya $isi/$n";
        }
        $ringkas[] = [
            'ruang' => $rg['nama'],
            'terisi' => $terisi,
            'kapasitas' => $rg['kapasitas'],
        ];
        if ($terisi < $rg['kapasitas'] || $kurangRuang) {
            $ket = $terisi . '/' . $rg['kapasitas'];
            if ($kurangRuang) $ket .= ' — kurang: ' . implode(', ', $kurangRuang);
            $kurang[] = $rg['nama'] . ' (' . $ket . ')';
        }
    }

    // Sisa siswa yang belum punya tempat (di luar total kapasitas semua ruang).
    $sisaSiswa = 0;
    foreach ($kantong as $q) $sisaSiswa += count($q);

    $pesan = "$total siswa ditempatkan di " . count($ruang) . ' ruang.';
    if ($kurang) $pesan .= ' Ruang belum penuh: ' . implode(', ', $kurang) . ' (data siswa sesuai tingkat kurang).';
    if ($sisaSiswa > 0) $pesan .= " $sisaSiswa siswa belum terbagi — tambah ruang/kapasitas lalu susun ulang.";

    return ['success' => true, 'ditempatkan' => $total, 'ringkas' => $ringkas, 'message' => $pesan];
}

/* ------------------------------------------------------------------ */
/* JADWAL HARIAN — satu tanggal, N baris = N sesi (digilir antar tingkat) */
/* ------------------------------------------------------------------ */

/** Nama kolom pada tabel siswa (huruf kecil semua). */
function kolomSiswa(): array
{
    $out = [];
    foreach (db()->query('SHOW COLUMNS FROM siswa')->fetchAll() as $r) {
        $out[] = strtolower(bersih($r['Field'] ?? ''));
    }
    return $out;
}

/** Nama hari besar (MINGGU…SABTU) dari tanggal "YYYY-MM-DD". */
function namaHari(string $tanggal): string
{
    static $h = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    $ts = strtotime($tanggal);
    return $ts === false ? '' : ($h[(int) date('w', $ts)] ?? '');
}

/**
 * Deteksi otomatis kolom tingkat/kelas/nis/absen dari nama kolom tabel siswa.
 * "#kelas" berarti tingkat diturunkan dari kolom kelas (mis. "X.1" → "X").
 */
function deteksiKolomSiswa(): array
{
    $ada = [];
    foreach (kolomSiswa() as $k) $ada[$k] = true;

    $auto = ['tingkat' => '', 'kelas' => '', 'nis' => '', 'absen' => ''];
    foreach (['tingkat', 'grade', 'jenjang'] as $k) {
        if (isset($ada[$k])) { $auto['tingkat'] = $k; break; }
    }
    foreach (['kelas', 'class', 'rombel'] as $k) {
        if (isset($ada[$k])) { $auto['kelas'] = $k; break; }
    }
    if ($auto['tingkat'] === '' && $auto['kelas'] !== '') $auto['tingkat'] = '#' . $auto['kelas'];
    foreach (['nis', 'nisn', 'no_induk'] as $k) {
        if (isset($ada[$k])) { $auto['nis'] = $k; break; }
    }
    foreach (['absen', 'no_absen', 'nomor_absen'] as $k) {
        if (isset($ada[$k])) { $auto['absen'] = $k; break; }
    }
    return $auto;
}

/** Setelan jadwal harian: deteksi kolom, pilihan admin, kalender (hari kerja + libur). */
function a_getSetelGas(): array
{
    $auto = deteksiKolomSiswa();

    $konf = json_decode(bacaPengaturan('jadwal_kolom'), true);
    if (!is_array($konf)) $konf = [];
    $kolom = [
        'tingkat' => bersih($konf['tingkat'] ?? ''),
        'kelas' => bersih($konf['kelas'] ?? ''),
        'nis' => bersih($konf['nis'] ?? ''),
        'absen' => bersih($konf['absen'] ?? ''),
    ];
    foreach ($kolom as $kunci => $v) {
        if ($v === '') $kolom[$kunci] = $auto[$kunci];
    }

    $kal = json_decode(bacaPengaturan('kalender_ajaran'), true);
    if (!is_array($kal)) $kal = [];
    $hariKerja = [];
    foreach ((array) ($kal['hari_kerja'] ?? [1, 2, 3, 4, 5]) as $h) {
        $h = (int) $h;
        if ($h >= 1 && $h <= 7 && !in_array($h, $hariKerja, true)) $hariKerja[] = $h;
    }
    if (!$hariKerja) $hariKerja = [1, 2, 3, 4, 5];
    sort($hariKerja);
    $libur = [];
    foreach ((array) ($kal['libur'] ?? []) as $tgl) {
        $tgl = bersih($tgl);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $tgl) && !in_array($tgl, $libur, true)) $libur[] = $tgl;
    }
    sort($libur);

    // Contoh baris data siswa — membantu admin mengenali kolom yang tepat.
    $pilih = [];
    foreach ([$kolom['tingkat'], $kolom['kelas'], $kolom['nis'], $kolom['absen']] as $c) {
        if ($c !== '' && strpos($c, '#') !== 0 && !in_array($c, $pilih, true)) $pilih[] = $c;
    }
    $contoh = [];
    if ($pilih) {
        $sel = 'SELECT ' . implode(', ', array_map(function ($c) {
            return '`' . str_replace('`', '', $c) . '`';
        }, $pilih)) . ' FROM siswa ORDER BY kelas, nama LIMIT 6';
        $contoh = semua($sel);
    }

    return [
        'success' => true,
        'kolom' => $kolom,
        'auto' => $auto,
        'daftar_kolom' => kolomSiswa(),
        'contoh' => $contoh,
        'hari_kerja' => $hariKerja,
        'libur' => $libur,
    ];
}

/** Simpan setelan jadwal harian (pilihan kolom + kalender hari kerja/libur). */
function a_setelGas(array $d): array
{
    $k = is_array($d['kolom'] ?? null) ? $d['kolom'] : [];
    $kolom = [
        'tingkat' => bersih($k['tingkat'] ?? ''),
        'kelas' => bersih($k['kelas'] ?? ''),
        'nis' => bersih($k['nis'] ?? ''),
        'absen' => bersih($k['absen'] ?? ''),
    ];
    $valid = kolomSiswa();
    foreach ($kolom as $c) {
        // Nilai "#kelas" bukan kolom nyata — tingkat diturunkan dari kolom kelas.
        if ($c !== '' && strpos($c, '#') !== 0 && !in_array($c, $valid, true)) {
            return galat("Kolom siswa \"$c\" tidak ada di tabel siswa.");
        }
    }
    if ($kolom['tingkat'] === '' && $kolom['kelas'] === '') {
        return galat('Pilih minimal kolom Tingkat atau Kelas.');
    }

    $hariKerja = [];
    foreach ((array) ($d['hari_kerja'] ?? []) as $h) {
        $h = (int) $h;
        if ($h >= 1 && $h <= 7 && !in_array($h, $hariKerja, true)) $hariKerja[] = $h;
    }
    if (!$hariKerja) $hariKerja = [1, 2, 3, 4, 5];
    sort($hariKerja);

    $libur = [];
    foreach ((array) ($d['libur'] ?? []) as $tgl) {
        $tgl = bersih($tgl);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $tgl) && !in_array($tgl, $libur, true)) $libur[] = $tgl;
    }
    sort($libur);

    simpanPengaturan('jadwal_kolom', json_encode($kolom, JSON_UNESCAPED_UNICODE));
    simpanPengaturan(
        'kalender_ajaran',
        json_encode(['hari_kerja' => $hariKerja, 'libur' => $libur], JSON_UNESCAPED_UNICODE)
    );

    return ['success' => true, 'message' => 'Setelan kolom & kalender jadwal disimpan.'];
}

/** Daftar guru untuk kolom "Pengawas" jadwal harian (admin). */
function a_getGuruGas(): array
{
    return ['success' => true, 'guru' => semua('SELECT nip, nama, mapel FROM guru ORDER BY nama')];
}

/** Baris jadwal harian siap cetak untuk satu tanggal (digilir antar tingkat). */
function a_jadwalHarianHarianGas(array $d): array
{
    $tanggal = bersih($d['tanggal'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
        return galat('Tanggal tidak valid.');
    }
    $k = is_array($d['kolom'] ?? null) ? $d['kolom'] : [];
    $tTingkat = bersih($k['tingkat'] ?? '');
    $tKelas = bersih($k['kelas'] ?? '');
    $tNis = bersih($k['nis'] ?? '');
    $tAbsen = bersih($k['absen'] ?? '');
    if ($tTingkat === '' && $tKelas === '') {
        return galat('Kolom tingkat/kelas belum terpetakan — periksa kolom pada tabel data siswa.');
    }
    $valid = kolomSiswa();
    foreach ([$tTingkat, $tKelas, $tNis, $tAbsen] as $c) {
        if ($c !== '' && strpos($c, '#') !== 0 && !in_array($c, $valid, true)) {
            return galat("Kolom siswa \"$c\" tidak ada di tabel siswa.");
        }
    }

    $kolomSel = array_values(array_filter(
        array_unique([$tTingkat, $tKelas, $tNis, $tAbsen]),
        function ($c) { return $c !== '' && strpos($c, '#') !== 0; }
    ));
    $sel = 'SELECT ' . implode(', ', array_map(function ($c) {
        return '`' . str_replace('`', '', $c) . '`';
    }, $kolomSel)) . ' FROM siswa';
    $semuaSiswa = semua($sel);

    $baris = [];
    foreach ($semuaSiswa as $s) {
        $kelas = $tKelas !== '' ? bersih($s[$tKelas] ?? '') : '';
        $tingkat = $tTingkat !== '' && strpos($tTingkat, '#') !== 0
            ? bersih($s[$tTingkat] ?? '')
            : tingkatDariKelas($kelas);
        if ($tingkat === '') $tingkat = 'LAIN';
        $baris[] = [
            'nis' => $tNis !== '' ? bersih($s[$tNis] ?? '') : '',
            'nama' => bersih($s['nama'] ?? ''),
            'kelas' => $kelas,
            'tingkat' => $tingkat,
            'absen' => $tAbsen !== '' ? (string) (int) ($s[$tAbsen] ?? 0) : '',
        ];
    }
    if (!$baris) return galat('Data siswa masih kosong — impor data siswa dulu.');

    // Urut dalam tiap tingkat: kelas → nama.
    usort($baris, function ($a, $b) {
        $ka = strnatcasecmp($a['kelas'], $b['kelas']);
        if ($ka !== 0) return $ka;
        return strnatcasecmp($a['nama'], $b['nama']);
    });

    // Gilir antar tingkat: baris 1 = siswa pertama tiap tingkat (kolom A, B, C, …).
    $kelompok = [];
    foreach ($baris as $b) $kelompok[$b['tingkat']][] = $b;
    $urut = array_keys($kelompok);
    usort($urut, function ($a, $b) {
        return urutTingkat($a) <=> urutTingkat($b);
    });
    $gilir = [];
    $i = 0;
    while (true) {
        $ada = false;
        foreach ($urut as $t) {
            if (isset($kelompok[$t][$i])) {
                $gilir[] = $kelompok[$t][$i];
                $ada = true;
            }
        }
        if (!$ada) break;
        $i++;
    }

    // Absensi otomatis per kelas bila kolom absen tidak dipilih.
    $perKelas = [];
    foreach ($gilir as $idx => $b) {
        $kunciKelas = $b['kelas'] !== '' ? $b['kelas'] : $b['tingkat'];
        $perKelas[$kunciKelas] = ($perKelas[$kunciKelas] ?? 0) + 1;
        if ($gilir[$idx]['absen'] === '') $gilir[$idx]['absen'] = (string) $perKelas[$kunciKelas];
    }

    // Mapel & pengawas manual yang tersimpan untuk tanggal + sesi ini.
    $simpanan = [];
    $sql = 'SELECT tanggal, sesi, mapel, pengawas FROM jadwal_harian WHERE tanggal = ?';
    foreach (semua($sql, [$tanggal]) as $r) {
        $simpanan[(int) $r['sesi']] = [
            'mapel' => bersih($r['mapel']),
            'pengawas' => json_decode(bersih($r['pengawas']), true) ?: [],
        ];
    }

    // Setelan per hari (jumlah sesi + jam) — disimpan di tabel pengaturan.
    $jumlahSesi = 0;
    $jamTersimpan = [];
    $setJson = bacaPengaturan('jadwal_set:' . $tanggal, '');
    if ($setJson !== '') {
        $sj = json_decode($setJson, true);
        if (is_array($sj)) {
            $jumlahSesi = max(0, (int) ($sj['jumlah_sesi'] ?? 0));
            foreach ((array) ($sj['jam'] ?? []) as $j) {
                $j = bersih($j);
                if ($j !== '') $jamTersimpan[] = $j;
            }
        }
    }
    // Data lama yang belum punya setelan: jumlah sesi = sesi terbesar tersimpan.
    if ($jumlahSesi < 1 && $simpanan) $jumlahSesi = max(array_keys($simpanan));
    $mapelTersimpan = [];
    for ($i = 1; $i <= $jumlahSesi; $i++) {
        $mapelTersimpan[] = $simpanan[$i]['mapel'] ?? '';
    }

    $out = [];
    foreach ($gilir as $idx => $b) {
        $sesi = $idx + 1;
        $s = isset($simpanan[$sesi]) ? $simpanan[$sesi] : ['mapel' => '', 'pengawas' => []];
        $out[] = $b + [
            'tanggal' => $tanggal,
            'hari' => namaHari($tanggal),
            'sesi' => $sesi,
            'mapel' => $s['mapel'],
            'pengawas' => $s['pengawas'],
        ];
    }

    return [
        'success' => true,
        'tanggal' => $tanggal,
        'hari' => namaHari($tanggal),
        'total' => count($out),
        'set' => [
            'jumlah_sesi' => $jumlahSesi,
            'jam' => $jamTersimpan,
            'mapel' => $mapelTersimpan,
        ],
        'baris' => $out,
    ];
}

/**
 * Simpan jadwal SATU tanggal sekaligus: jumlah sesi + jam + mapel per sesi.
 * Pengawas TIDAK disimpan di sini — diambil otomatis dari "Jadwal pengawas
 * otomatis" (Ruang ujian) saat jadwal dicetak.
 */
function a_jadwalHarianSimpanGas(array $d): array
{
    $tanggal = bersih($d['tanggal'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
        return galat('Tanggal tidak valid.');
    }
    $jumlah = (int) ($d['jumlah_sesi'] ?? 0);
    if ($jumlah < 1 || $jumlah > 10) {
        return galat('Jumlah sesi harus antara 1 dan 10.');
    }

    $jamIn = is_array($d['jam'] ?? null) ? $d['jam'] : [];
    $jam = [];
    for ($i = 0; $i < $jumlah; $i++) {
        $v = bersih($jamIn[$i] ?? '');
        if (!preg_match('/^(\d{1,2})[:.]?(\d{2})$/', $v, $m)) {
            return galat('Jam sesi ' . ($i + 1) . ' tidak valid (format 07.30).');
        }
        $h = (int) $m[1];
        $menit = (int) $m[2];
        if ($h > 23 || $menit > 59) {
            return galat('Jam sesi ' . ($i + 1) . ' tidak valid (format 07.30).');
        }
        $jam[] = sprintf('%02d.%02d', $h, $menit);
    }

    $mapelIn = is_array($d['mapel'] ?? null) ? $d['mapel'] : [];
    $mapel = [];
    for ($i = 0; $i < $jumlah; $i++) {
        $mapel[] = bersih($mapelIn[$i] ?? '');
    }

    simpanPengaturan(
        'jadwal_set:' . $tanggal,
        json_encode(['jumlah_sesi' => $jumlah, 'jam' => $jam], JSON_UNESCAPED_UNICODE)
    );

    // Ganti seluruh baris mapel tanggal ini agar tidak ada sisa sesi lama.
    jalan('DELETE FROM jadwal_harian WHERE tanggal = ?', [$tanggal]);
    for ($i = 0; $i < $jumlah; $i++) {
        if ($mapel[$i] === '') continue;
        jalan(
            'INSERT INTO jadwal_harian (tanggal, sesi, mapel, pengawas) VALUES (?,?,?,?)',
            [$tanggal, $i + 1, $mapel[$i], '[]']
        );
    }

    return ['success' => true, 'message' => 'Jadwal harian tersimpan.'];
}

/* ------------------------------------------------------------------ */
/* AUDIT BUKA KUNCI (best-effort, hanya saat online)                   */
/* ------------------------------------------------------------------ */

function a_catatBukaKunci(array $d): array
{
    jalan(
        'INSERT INTO buka_kunci (ujian_id, nama, catatan) VALUES (?,?,?)',
        [
            bersih($d['ujian_id'] ?? ''),
            bersih($d['nama'] ?? ''),
            bersih($d['catatan'] ?? 'PIN diverifikasi lokal (offline)'),
        ]
    );
    return ['success' => true];
}
