# Menyiapkan login admin

Aplikasi memakai satu akun admin; belum ada pendaftaran akun publik. API aplikasi juga meminta sesi login yang berlaku. Sesi disimpan dalam cookie `HttpOnly` dan berakhir setelah 8 jam.

## Menjalankan secara lokal

Salin `.env.example` menjadi `.env`, isi tiga variabel login, lalu mulai ulang server:

```env
ADMIN_USERNAME=nama-admin-anda
ADMIN_PASSWORD=ganti-dengan-kata-sandi-kuat
AUTH_SECRET=ganti-dengan-rahasia-acak
```

`ADMIN_PASSWORD` harus minimal 12 karakter. `AUTH_SECRET` harus minimal 32 karakter; buat nilai acak, misalnya dengan Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Jangan gunakan contoh nilai di atas sebagai kredensial sungguhan dan jangan commit file `.env`.

## Menyiapkan di Vercel

Buka **Project Settings → Environment Variables**, tambahkan `ADMIN_USERNAME`, `ADMIN_PASSWORD`, dan `AUTH_SECRET` untuk environment yang dipakai (umumnya **Production**), kemudian buat deployment baru. `.env` lokal tidak dikirim otomatis ke Vercel. Jika login mengembalikan 503, respons menyebut variabel yang kosong atau terlalu pendek tanpa membocorkan nilainya; pastikan variabel tersebut diaktifkan untuk environment deployment dan deploy ulang setelah perubahan.

Gunakan username dan password yang sama pada form login. Jika variabel belum diatur atau tidak memenuhi panjang minimum, halaman akan menampilkan pesan konfigurasi yang lebih spesifik.
