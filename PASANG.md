# Pasang UjianAman di Hosting — Langkah Instalasi

Ringkasan alur (± 15 menit):

1. Buat **database + user** di cPanel
2. Isi **`api/config.php`** (4 nilai)
3. **Upload `dist.zip`** lalu extract ke folder aplikasi
4. Tes koneksi lewat `?action=ping`
5. Buka halaman login → **buat admin pertama**

> Tabel database **tidak perlu dibuat/di-import manual** — 9 tabel
> (`pengguna`, `siswa`, `guru`, `ujian`, `soal`, `hasil`, `unduhan`,
> `buka_kunci`, `pengaturan`) dibuat otomatis saat pertama kali
> `api/index.php` dipanggil.

---

## 0. Prasyarat

- Hosting **cPanel** (atau panel sejenis) dengan **PHP 7.4+** (disarankan
  PHP 8.1/8.2 lewat *MultiPHP Manager*) dan **MySQL/MariaDB** (PDO mysql).
- Domain aktif dengan **HTTPS** — wajib untuk PWA (service worker &
  mode offline hanya jalan di HTTPS).
- File **`dist.zip`** siap upload (ada di root proyek; lihat §8 bila
  kode berubah dan perlu di-build ulang).

---

## 1. Buat database & user (cPanel)

1. Login cPanel → **MySQL® Databases**.
2. **Create New Database** — misal `ujianaman_db`.
   Catat nama lengkapnya (biasanya otomatis dapat prefix akun hosting,
   contoh: `u123456_ujianaman_db`).
3. **Add New User** — buat username & password. Catat keduanya.
   (Prefix juga bisa menempel pada username, contoh: `u123456_uam`.)
4. **Add User To Database** → pilih user + database →
   centang **ALL PRIVILEGES** → **Make Changes**.
5. **Host database**: hampir selalu `localhost` (bila hosting menulis
   host khusus, pakai nilai itu).

Tidak ada file SQL untuk di-import. Cukup database kosong saja.

---

## 2. Isi `api/config.php`

Buka file **`api/config.php`** (di dalam paket `dist.zip`; setelah upload
posisinya `public_html/eujian-mandupa/api/config.php`) lalu ganti 4 nilai:

```php
define('DB_HOST', 'localhost');              // host MySQL (biasanya localhost)
define('DB_NAME', 'u123456_ujianaman_db');   // nama database LENGKAP (dgn prefix)
define('DB_USER', 'u123456_uam');            // username database (dgn prefix)
define('DB_PASS', 'password-yang-dibuat');   // password database
```

- **APP_ZONE** (`Asia/Jakarta`) boleh disesuaikan; jadwal ujian ikut zona ini.
- Simpan sebagai **UTF-8**.
- Bisa diedit sebelum zip, atau (lebih praktis) lewat **File Manager**
  cPanel setelah extract — langkah 3.

`api/.htaccess` otomatis menolak akses browser langsung ke `config.php`,
jadi nilai database tidak bisa dibaca publik.

---

## 3. Upload & extract ke hosting

1. cPanel → **File Manager** → `public_html/` → buat folder baru
   **`eujian-mandupa`** (nama folder bebas; aplikasi otomatis membaca
   path-nya dari URL, jadi boleh juga langsung di root domain).
2. Upload `dist.zip` ke folder itu → klik kanan → **Extract**.
3. Pastikan strukturnya persis seperti ini:

```
public_html/eujian-mandupa/
├── index.html
├── .htaccess            ← routing SPA + no-cache sw.js (jangan dihapus)
├── assets/              ← js & css hasil build
├── sw.js                ← service worker (offline)
├── manifest.webmanifest
├── icon.svg / logo.svg
└── api/
    ├── index.php        ← SATU-SATUNYA endpoint backend
    ├── config.php       ← yang diisi di langkah 2
    └── .htaccess        ← blokir akses langsung ke config.php
```

4. Belum mengisi config tadi? Sekarang waktunya: File Manager →
   klik kanan `api/config.php` → **Edit** → isi 4 nilai → **Save Changes**.

---

## 4. Tes koneksi (server + database)

Buka di browser (ganti domain & folder):

```
https://domainmu/eujian-mandupa/api/index.php?action=ping
```

| Hasil | Artinya |
|---|---|
| `{"success":true,"siap":false}` | ✅ Server & database SIAP, belum ada akun (normal untuk instalasi baru) |
| `{"success":true,"siap":true}` | ✅ SIAP, akun sudah ada di database |
| Pesan "Database belum dikonfigurasi…" | `config.php` belum diisi / belum ke-save |
| Pesan "Tidak bisa terhubung ke database…" | nama/user/password/host salah — cek prefix cPanel di langkah 1 |
| Halaman error / kosong | cek versi PHP & `api/error_log` (lihat §7) |

---

## 5. Buat admin pertama

Buka halaman login:

```
https://domainmu/eujian-mandupa/auth
```

Karena database masih kosong, halaman otomatis menampilkan form
**“Buat admin & mulai”** (bukan form login):

1. Isi **username admin** (mis. `admin`) dan **password** (min. 4 karakter).
2. Klik **Buat admin & mulai** — Anda langsung masuk ke dashboard, dan
   sistem menyiapkan **1 ujian contoh (5 soal)** untuk dilihat.

Setelah ini, halaman login kembali ke bentuk login biasa. Catat password
admin; ganti segera setelah bisa login.

---

## 6. Checklist setelah instalasi

1. **Data Siswa** → Impor massal (NISN, Nama, Tgl Lahir, Kelas) →
   *Buat akun siswa* (username = NISN, password = tanggal lahir DDMMYYYY).
2. **Data Guru** → Impor/tambah guru → *Buat akun guru*.
3. **Kelola Ujian** → buat ujian → isi soal (teks, gambar, opsi A–E,
   atau impor dari Word) → atur jadwal & durasi.
4. Klik **Bagikan** — semua siswa login akan melihat **lampu kuning**;
   setelah mereka unduh, lampu jadi **hijau**.
5. Waktu ujian tiba: siswa **matikan internet**, lalu **masukkan token
   pengawas saat menekan Mulai Ujian** (token dibagikan pengawas ruang,
   bukan saat unduh).
6. **Pengaturan** → atur PIN pengawas/kartu bila dipakai; ganti password
   admin bila belum.

---

## 7. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Login: “Server belum terhubung” | Folder `api` tidak ada di lokasi yang sama dengan `index.html`, atau `config.php` error | Cocokkan struktur langkah 3; buka `?action=ping` untuk pesan error pasti |
| “Database belum dikonfigurasi” | `config.php` masih placeholder | Isi 4 nilai, pastikan benar-benar tersimpan (UTF-8) |
| Koneksi gagal walau config benar | Prefix cPanel salah / host bukan localhost | Salin ulang nama database & user **lengkap** dari MySQL® Databases |
| Refresh di halaman dalam (mis. `/auth`) → 404 | `.htaccess` hilang atau `mod_rewrite` mati | Pastikan `.htaccess` ikut ter-extract; aktifkan mod_rewrite di MultiPHP/Error Pages |
| Layar kosong setelah upload | File `assets` tidak ikut / folder salah | Extract ulang `dist.zip`; pastikan `index.html` se-folder dengan `assets/` |
| PWA tidak bisa offline / tidak ter-install | Bukan HTTPS atau `sw.js` diblokir | Pakai HTTPS (Let’s Encrypt gratis di cPanel); cek DevTools → Application → Service Workers |
| Error 500 | PHP error di `api/index.php` | Cek `api/error_log` atau `error_log` hosting; naikkan versi PHP ke 8.1+ |
| Update aplikasi menimpa config | Upload ulang menimpa `api/config.php` | Setelah extract ulang, **isi ulang `config.php`** (atau backup dulu isinya) |

---

## 8. Build ulang `dist.zip` (untuk developer, bila kode berubah)

Jalankan dari root proyek:

```bash
bun tsc -b --noEmit                       # typecheck
bun run build > /tmp/build.log 2>&1; echo "BUILD_EXIT=$?"
rm -rf dist/api && cp -r api dist/api     # selipkan backend ke dalam dist
rm -f dist.zip && (cd dist && zip -rq ../dist.zip .)
unzip -t dist.zip                         # pastikan arsip utuh
```

Catatan:

- Jangan ubah `vite.config.ts` (HMR harus tetap nonaktif) dan
  `public/sw.js` / `public/manifest.webmanifest` kecuali memang perlu.
- `api/` (folder sumber) di-upload apa adanya ke hosting — tidak ikut
  di-build; PHP cukup PHP 7.4+ tanpa composer.
- Database aman saat update: struktur pakai `CREATE TABLE IF NOT EXISTS`
  plus upgrade kolom otomatis — tidak ada data yang dihapus.
