# UjianAman — Backend PHP + MySQL

Backend baru (pengganti Google Apps Script). Semua aksi aplikasi lewat **satu file**:
`api/index.php`.

## Pasang di cPanel (sekali saja)

1. **Buat database**
   cPanel → *MySQL® Databases* → buat database (cth. `ujianaman_db`),
   buat user database, lalu **ADD USER** ke database dengan *All Privileges*.

2. **Isi `api/config.php`**
   Ganti `DB_NAME`, `DB_USER`, `DB_PASS` sesuai langkah 1.

3. **Upload folder `api/`** ke hosting, satu tingkat dengan folder hasil build
   (mis. `public_html/eujian-mandupa/api/`).

4. **Tes** — buka di browser:
   `https://man2plg.sch.id/eujian-mandupa/api/index.php?action=ping`
   - Muncul `{"success":true,"siap":false}` → server & database SIAP
     (`siap:false` = belum ada akun → buat admin pertama lewat halaman login).
   - Muncul pesan error → baca pesannya (biasanya config belum diisi).

   Tabel (`pengguna`, `siswa`, `guru`, `ujian`, `soal`, `hasil`, `unduhan`,
   `buka_kunci`, `pengaturan`) **dibuat otomatis** — tidak perlu import SQL.

## Migrasi data lama (Google Sheets) — opsional

- **Data siswa**: ekspor sheet *Siswa* ke Excel → pakai **Impor massal** di menu
  Data Siswa (format: NISN, Nama, Tgl Lahir, Kelas).
- **Data guru**: pakai menu Data Guru → Impor Excel (format: NIP, Nama, Mapel).
- **Akun**: menu Data Siswa → *Buat akun siswa* (username = NISN,
  password = tgl lahir DDMMYYYY); Data Guru → *Buat akun guru*.
- **Ujian & soal**: dibuat ulang di menu Kelola Ujian (jumlah sedikit, cepat).
- **Hasil lama**: ekspor sheet *Hasil* bila perlu diarsipkan (CSV).

## Catatan keamanan

- Token sesi HMAC berumur 12 jam; peran divalidasi dari tabel `pengguna`.
- Password disimpan plaintext agar admin bisa mengunduh daftar akun (CSV) —
  sesuai perilaku versi sebelumnya.
- Ganti password admin setelah pertama kali login.
