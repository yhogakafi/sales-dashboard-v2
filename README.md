# Dashboard penjualan toko online (versi tersimpan di server)

Admin login di `/admin`, upload file Excel, atur kategori, lalu publikasikan. Hasilnya tersimpan di Vercel Blob dan bisa dilihat siapa saja yang punya link ke halaman utama (`/`) — tanpa perlu upload sendiri.

## Alur kerja

1. Admin buka `/admin`, masukkan password
2. Upload file `.xlsx` — sistem langsung parse dan tampilkan preview (belum tersimpan permanen)
3. Admin atur kategori per pelanggan penagihan lewat tombol pill (default sudah ditebak otomatis dari nama brand)
4. Klik Simpan & Publikasikan — data + kategori final tersimpan ke Vercel Blob, menimpa data sebelumnya
5. Siapa saja yang membuka `/` langsung melihat dashboard dengan data terbaru, read-only, dan bisa mengunduhnya sebagai file Excel (termasuk sheet ringkasan kategori dan detail tanggal x kategori jika kategori sudah diatur)

## Setup di Vercel

### 1. Buat Blob store

Di dashboard Vercel project ini: Storage -> Create Database -> pilih Blob. Setelah dibuat dan dihubungkan ke project, variabel `BLOB_READ_WRITE_TOKEN` otomatis tersedia -- tidak perlu diisi manual untuk Production/Preview.

### 2. Set password admin

Settings -> Environment Variables -> tambahkan:
- `ADMIN_PASSWORD` = password rahasia pilihan kamu
- `VIEWER_PASSWORD` = password yang dibagikan ke anggota tim untuk membuka halaman utama (`/`)

Halaman utama sekarang juga dikunci password (beda dari password admin), karena data penjualan ini bersifat sensitif. Tanpa `VIEWER_PASSWORD` diset, siapa pun yang membuka `/` akan selalu ditolak masuk -- jadi pastikan dua-duanya diisi sebelum dibagikan ke tim.

Tanpa variabel ini, halaman `/admin` akan menolak semua percobaan login (disengaja, sebagai pengaman default).

### 3. Deploy

Push ke GitHub, import repo di vercel.com/new. Next.js terdeteksi otomatis, tidak perlu ubah build settings.

## Menjalankan di komputer sendiri

```bash
cp .env.local.example .env.local
# isi ADMIN_PASSWORD, VIEWER_PASSWORD, dan BLOB_READ_WRITE_TOKEN di .env.local
npm install
npm run dev
```

Buka `http://localhost:3000` untuk dashboard publik, `http://localhost:3000/admin` untuk admin.

Catatan: `BLOB_READ_WRITE_TOKEN` untuk lokal perlu diambil manual dari Storage -> pilih Blob store -> tab .env.local di dashboard Vercel, karena fitur auto-inject env var hanya berlaku saat deploy di Vercel.

## Format file yang didukung

Sama seperti versi sebelumnya — file `.xlsx` dengan kolom `Tanggal`, `Pelanggan Penagihan` (format `PLATFORM / NAMA TOKO`), dan `Total Faktur`. Baris total di akhir file otomatis diabaikan.

## Struktur proyek

- `app/page.jsx` — dashboard publik (fetch data dari `/api/data`)
- `app/admin/page.jsx` — halaman admin: login, upload, kategorisasi, publikasi
- `app/api/login` — cek password, set cookie session
- `app/api/upload` — terima file, parse, kembalikan preview (belum disimpan)
- `app/api/publish` — simpan hasil final (analysis + kategori) ke Vercel Blob
- `app/api/data` — endpoint publik untuk ambil data tersimpan terbaru
- `lib/parseData.js` — logika parsing & agregasi Excel (sama seperti versi sebelumnya)
- `lib/blob.js` — helper baca/tulis Vercel Blob
- `lib/auth.js` — pengecekan password admin
- `lib/defaultCategories.js` — mapping kategori default berdasarkan nama brand
- `components/` — semua komponen tampilan (chart, tabel, kategorisasi)

## Keamanan & keterbatasan yang perlu diketahui

- Ini autentikasi password tunggal yang sederhana (cocok untuk "cuma saya yang upload"), bukan sistem akun multi-user. Siapa pun yang tahu password bisa login sebagai admin.
- Hanya menyimpan satu versi terbaru — upload baru menimpa yang lama secara permanen (sesuai keputusan awal). Tidak ada riwayat/versi sebelumnya yang bisa dikembalikan.
- Halaman utama sekarang dikunci password tim (`VIEWER_PASSWORD`) dan diberi tag `noindex` supaya tidak muncul di hasil pencarian Google. Sesi login tersimpan di cookie selama 30 hari, jadi anggota tim tidak perlu login berulang kali.
