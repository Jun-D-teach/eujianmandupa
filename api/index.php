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
 *  - getSoal (unduh soal) WAJIB token ujian + izin bagikan dari admin.
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
            sasar_nilai VARCHAR(255) NOT NULL DEFAULT ''
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

    'getPengaturan' => 2, 'aturPin' => 2, 'buatPengguna' => 2,
    'ubahPeran' => 2, 'getPengguna' => 2,
    'getKartuSet' => 2, 'aturKartuSet' => 2,
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
        case 'getUjian': return a_getUjian();
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
        case 'submitJawaban': return a_submitJawaban($d);
        case 'catatBukaKunci': return a_catatBukaKunci($d);
        case 'getPengaturan': return a_getPengaturan();
        case 'aturPin': return a_aturPin($d);
        case 'getKartuSet': return a_getKartuSet();
        case 'aturKartuSet': return a_aturKartuSet($d);
        case 'buatPengguna': return a_buatPengguna($d);
        case 'ubahPeran': return a_ubahPeran($d);
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
    $n = jalan(
        'UPDATE siswa SET nisn = ?, nama = ?, tgllahir = ?, kelas = ? WHERE id = ?',
        [$v['nisn'], $v['nama'], $v['tgllahir'], $v['kelas'], bersih($d['id'] ?? '')]
    );
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
    $n = jalan(
        'UPDATE guru SET nip = ?, nama = ?, mapel = ? WHERE id = ?',
        [$v['nip'], $v['nama'], $v['mapel'], bersih($d['id'] ?? '')]
    );
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

/** Ubah password guru — sinkron ke akun login (username = NIP) bila sudah dibuat. */
function a_ubahPasswordGuru(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $pass = bersih($d['password'] ?? '');
    if (strlen($pass) < 4) return galat('Password minimal 4 karakter.');
    $g = satu('SELECT nip FROM guru WHERE id = ?', [$id]);
    if (!$g) return galat('Guru tidak ditemukan.');
    jalan('UPDATE guru SET password = ? WHERE id = ?', [$pass, $id]);
    // Sinkronkan akun login guru bila sudah ada (username = NIP, peran guru).
    jalan(
        'UPDATE pengguna SET password = ? WHERE username = ? AND role = ?',
        [$pass, strtolower(bersih($g['nip'])), 'guru']
    );
    return ['success' => true, 'message' => 'Password guru diperbarui.'];
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
    foreach ($guru as $g) {
        $nip = bersih($g['nip']);
        $kunci = strtolower($nip);
        if ($nip === '' || isset($ada[$kunci])) {
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
    ];
    $u['sasaran'] = sasaranLabel($u['sasar_jenis'], $u['sasar_nilai']);
    $u['boleh'] = $kelasSiswa === null ? true : cocokSasar($u, $kelasSiswa);
    if ($sertakanToken) $u['token'] = (string) $r['token'];
    return $u;
}

function cariUjian(string $id): ?array
{
    return satu('SELECT * FROM ujian WHERE id = ? LIMIT 1', [$id]);
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

/** Daftar semua ujian untuk admin/guru — DENGAN token. */
function a_getUjian(): array
{
    $rows = semua('SELECT * FROM ujian ORDER BY dibuat DESC');
    return ['success' => true, 'ujian' => array_map(fn($r) => barisUjian($r, null, true), $rows)];
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
        'INSERT INTO ujian (id, judul, deskripsi, token, durasi_menit, aktif, boleh_unduh, tgl_mulai, sasar_jenis, sasar_nilai)
         VALUES (?,?,?,?,?,0,0,?,?,?)',
        [
            $id,
            $judul,
            bersih($d['deskripsi'] ?? ''),
            $token,
            $durasi,
            $tgl,
            $sasar['jenis'],
            $sasar['nilai'],
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

    $n = jalan(
        'UPDATE ujian SET token = ?, durasi_menit = ?, tgl_mulai = ?, sasar_jenis = ?, sasar_nilai = ? WHERE id = ?',
        [$token, $durasi, $tgl, $sasar['jenis'], $sasar['nilai'], bersih($d['id'] ?? '')]
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
        'INSERT INTO soal (id, ujian_id, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, opsi_huruf, kunci_jawaban, gambar)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)',
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
        ]
    );
    return $id;
}

function barisSoal(array $r, bool $denganKunci): array
{
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
    ];
    if ($denganKunci) $out['kunci_jawaban'] = strtoupper(bersih($r['kunci_jawaban']));
    return $out;
}

/**
 * Unduh soal untuk siswa — TOKEN WAJIB + ujian aktif + izin bagikan +
 * kelas sesuai sasaran. Berhasil → catat unduhan (status sinkron).
 */
function a_getSoal(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $kelas = bersih($d['kelas'] ?? '');
    $token = strtoupper(bersih($d['token'] ?? ''));
    if ($token === '') return galat('Token ujian wajib diisi untuk mengunduh soal.');

    $r = cariUjian($id);
    if (!$r) return galat('Ujian tidak ditemukan.');
    if (strtoupper(bersih($r['token'])) !== $token) {
        return galat('Token ujian salah. Minta token yang benar dari pengawas/admin.');
    }
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
    foreach (semua('SELECT * FROM soal WHERE ujian_id = ?', [$id]) as $s) {
        $daftar[] = barisSoal($s, false);
    }
    if (!$daftar) return galat('Ujian ini belum memiliki soal.');

    return [
        'success' => true,
        'ujian' => $meta,
        'soal' => $daftar,
        'pin_pengawas' => pinPengawas(),
    ];
}

/** Soal untuk petugas: DENGAN kunci jawaban. */
function a_getSoalAdmin(array $d): array
{
    $daftar = [];
    foreach (semua('SELECT * FROM soal WHERE ujian_id = ?', [bersih($d['ujian_id'] ?? '')]) as $s) {
        $daftar[] = barisSoal($s, true);
    }
    return ['success' => true, 'soal' => $daftar];
}

/**
 * Validasi isi soal bersama (tambah / ubah / impor massal).
 * @return array{error:string}|array{pertanyaan:string,opsi_a:string,opsi_b:string,opsi_c:string,opsi_d:string,opsi_e:string,kunci_jawaban:string,gambar:string,opsi_huruf:int}
 */
function validasiIsiSoal(array $d): array
{
    $pertanyaan = bersih($d['pertanyaan'] ?? '');
    if ($pertanyaan === '') return ['error' => 'Pertanyaan wajib diisi.'];

    // Mode "sudah menyertakan huruf" — teks pilihan diketik beserta A., B., …
    $opsiHuruf = !empty($d['opsi_huruf']) ? 1 : 0;

    $opsi = [];
    foreach (['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d'] as $w) {
        $v = bersih($d[$w] ?? '');
        if (!$opsiHuruf && $v !== '') $v = buangHurufOpsi($v);
        if ($v === '') return ['error' => 'Opsi A–D wajib diisi (opsi E opsional).'];
        if (panjangTeks($v) > 600) return ['error' => 'Setiap pilihan maksimal 600 karakter.'];
        $opsi[$w] = $v;
    }
    $opsiE = bersih($d['opsi_e'] ?? '');
    if (!$opsiHuruf && $opsiE !== '') $opsiE = buangHurufOpsi($opsiE);
    if ($opsiE !== '' && panjangTeks($opsiE) > 600) return ['error' => 'Setiap pilihan maksimal 600 karakter.'];

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
    ];
}

/** Mode "belum berhuruf": buang penanda "A." / "B)" / "C -" di depan teks. */
function buangHurufOpsi(string $v): string
{
    $b = preg_replace('/^[A-E][\s.):\-–]+/iu', '', $v);
    if ($b === null) return trim($v); // UTF-8 tidak valid — biarkan apa adanya
    return trim($b);
}

/** Panjang teks dalam karakter (fallback bila ekstensi mbstring tidak ada). */
function panjangTeks(string $t): int
{
    return function_exists('mb_strlen') ? mb_strlen($t) : strlen($t);
}

function a_tambahSoal(array $d): array
{
    $ujianId = bersih($d['ujian_id'] ?? '');
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

    jalan(
        'UPDATE soal SET pertanyaan = ?, opsi_a = ?, opsi_b = ?, opsi_c = ?, opsi_d = ?, opsi_e = ?, opsi_huruf = ?, kunci_jawaban = ?, gambar = ? WHERE id = ?',
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
    foreach (SOAL_CONTOH as $s) sisipSoal($ujianId, $s);
    naikkanRevisi($ujianId);
    return ['success' => true, 'message' => count(SOAL_CONTOH) . ' soal contoh ditambahkan.'];
}

function a_hapusSoal(array $d): array
{
    $id = bersih($d['id'] ?? '');
    $lama = satu('SELECT ujian_id FROM soal WHERE id = ?', [$id]);
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

    $kunciMap = [];
    $totalSoal = 0;
    foreach (semua('SELECT id, kunci_jawaban FROM soal WHERE ujian_id = ?', [$ujianId]) as $s) {
        $kunciMap[$s['id']] = strtoupper(bersih($s['kunci_jawaban']));
        $totalSoal++;
    }

    $benar = 0;
    foreach ($jawaban as $item) {
        $idSoal = (string) ($item['id_soal'] ?? '');
        $pilihan = strtoupper(bersih($item['pilihan'] ?? ''));
        if ($pilihan !== '' && isset($kunciMap[$idSoal]) && $kunciMap[$idSoal] === $pilihan) $benar++;
    }

    $nilai = $totalSoal > 0 ? (int) round(($benar / $totalSoal) * 100) : 0;
    jalan(
        'INSERT INTO hasil (id, ujian_id, ujian_judul, nama, kelas, token, benar, total_soal, nilai, total_pelanggaran)
         VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
            idBaru('h'),
            $ujianId,
            (string) $meta['judul'],
            $nama,
            $kelas,
            $token,
            $benar,
            $totalSoal,
            $nilai,
            $totalPelanggaran,
        ]
    );

    return [
        'success' => true,
        'nilai' => $nilai,
        'benar' => $benar,
        'total_soal' => $totalSoal,
        'total_pelanggaran' => $totalPelanggaran,
        'message' => 'Jawaban tersimpan.',
    ];
}

function barisHasil(array $r): array
{
    return [
        'id' => (string) $r['id'],
        'ujian_id' => (string) $r['ujian_id'],
        'ujian_judul' => (string) $r['ujian_judul'],
        'nama' => (string) $r['nama'],
        'kelas' => (string) $r['kelas'],
        'token' => (string) $r['token'],
        'benar' => (int) $r['benar'],
        'total_soal' => (int) $r['total_soal'],
        'nilai' => (int) $r['nilai'],
        'total_pelanggaran' => (int) $r['total_pelanggaran'],
        'timestamp' => isset($r['timestamp']) && $r['timestamp'] ? (string) $r['timestamp'] : '',
    ];
}

function a_getHasil(array $d): array
{
    $rows = semua('SELECT * FROM hasil WHERE ujian_id = ? ORDER BY timestamp DESC', [bersih($d['ujian_id'] ?? '')]);
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
