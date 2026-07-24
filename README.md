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

## Fitur Produk Terlaris

Halaman `/produk-terlaris` menampilkan ranking produk terlaris (nama & qty terjual), dengan filter kategori (Semua / Online Underwear / Online Sport — kategori otomatis dari nama brand, sama seperti di dashboard penjualan) dan filter per toko. Menarik 2 sumber data yang dikelola terpisah di admin:

1. **Master barang** (tab "Master Barang" di `/admin`) — katalog kode → nama produk. **Bukan data per periode**: satu file yang selalu menimpa versi sebelumnya, dipakai sebagai kamus untuk semua periode produk terlaris. Format: file Excel 2 kolom tanpa header (kolom A kode barang, kolom B nama produk).
2. **Produk terlaris** (tab "Produk Terlaris" di `/admin`) — data qty terjual per kode barang per toko, punya sistem periode sendiri yang **terpisah dari periode data penjualan** (rentang tanggalnya bisa berbeda). Formatnya mengikuti ekspor "Histori Pengiriman Pesanan": beberapa baris info di atas (termasuk rentang tanggal, dideteksi otomatis), lalu baris header `No. Barang` + kolom per toko + `Grand Total`, lalu baris data, ditutup baris `Grand Total`.

Kode barang di file produk terlaris punya akhiran varian setelah titik pertama (mis. `1002189.1.02`) yang tidak ada di master barang (mis. `1002189`) — akhiran ini otomatis dibuang saat memetakan ke master barang, dan qty dari varian-varian yang sama digabung. Kode yang tidak ditemukan di master barang tetap tampil (pakai kode saja) disertai peringatan di halaman & di preview upload admin.

Urutan upload yang disarankan: upload master barang dulu (sekali di awal, atau setiap kali katalog produk berubah), baru upload produk terlaris — supaya nama produk langsung ter-resolve saat preview.

## Struktur proyek

- `app/page.jsx` — dashboard publik (fetch data dari `/api/data`)
- `app/produk-terlaris/page.jsx` — halaman publik ranking produk terlaris (fetch dari `/api/produk-terlaris/data`)
- `app/admin/page.jsx` — halaman admin: login + tab (Data Penjualan / Master Barang / Produk Terlaris)
- `app/api/login`, `app/api/viewer-login`, `app/api/session` — autentikasi admin & viewer
- `app/api/upload`, `app/api/publish`, `app/api/data`, `app/api/periods` — alur data penjualan (periode)
- `app/api/master-barang` (GET status), `app/api/master-barang/upload`, `app/api/master-barang/publish` — alur master barang (satu file, selalu ditimpa)
- `app/api/produk-terlaris/upload`, `app/api/produk-terlaris/publish`, `app/api/produk-terlaris/periods`, `app/api/produk-terlaris/data` — alur produk terlaris (periode terpisah dari data penjualan)
- `lib/parseData.js` — parsing & agregasi Excel data penjualan
- `lib/parseMasterBarang.js` — parsing file master barang (kode → nama)
- `lib/parseProdukTerlaris.js` — parsing file produk terlaris (pivot kode × toko → qty), termasuk pemetaan ke master barang
- `lib/blob.js` — helper baca/tulis Vercel Blob (periode penjualan, master barang, periode produk terlaris)
- `lib/auth.js` — pengecekan password admin & viewer
- `lib/defaultCategories.js` — mapping kategori default berdasarkan nama brand (dipakai juga oleh produk terlaris)
- `components/` — komponen tampilan dashboard penjualan & produk terlaris
- `components/admin/` — panel-panel tab halaman admin

## Keamanan & keterbatasan yang perlu diketahui

- Ini autentikasi password tunggal yang sederhana (cocok untuk "cuma saya yang upload"), bukan sistem akun multi-user. Siapa pun yang tahu password bisa login sebagai admin.
- Hanya menyimpan satu versi terbaru — upload baru menimpa yang lama secara permanen (sesuai keputusan awal). Tidak ada riwayat/versi sebelumnya yang bisa dikembalikan.
- Halaman utama sekarang dikunci password tim (`VIEWER_PASSWORD`) dan diberi tag `noindex` supaya tidak muncul di hasil pencarian Google. Sesi login tersimpan di cookie selama 30 hari, jadi anggota tim tidak perlu login berulang kali.
