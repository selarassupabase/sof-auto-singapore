## 10. Rencana Build Bertahap (Claude Code)

> **Fase A adalah gerbang, bukan formalitas.** Jangan lanjut sebelum akurasi ekstraksi terbukti memuaskan di sampel asli. Godaan terbesar: bikin web app dulu, baru sadar ekstraksi salah baca belasan persen.

- **Fase A — Ekstraksi murni.** Script Python: 1 foto/email → JSON sesuai skema (bagian 6). Uji ke semua sampel. Ukur akurasi. Data emas: AL JUBAIL (ada di 2 sumber = ada "kunci jawaban").
- **Fase B — Isi docx → PDF.** Isi `EUCALYPTUS.docx` asli, export via LibreOffice. (Sudah terbukti teknis; tinggal dikodekan.)
- **Fase C — Supabase + web app.** Skema tabel + bucket; halaman upload & review.
- **Fase D — Integrasi.** Sambung jadi satu alur + jalankan mesin validasi (bagian 7).

**Isi `CLAUDE.md` di root proyek:**

> Proyek: otomasi SOF PACMAR. Baca `PROJECT_SOF_Automation_FINAL.md` untuk konteks penuh. Stack: Claude API (ekstraksi vision, `claude-sonnet-5`), web app + Supabase (DB+storage). Langkah cetak: isi `EUCALYPTUS.docx` asli lalu export PDF via LibreOffice — JANGAN overlay koordinat, JANGAN replika manual. Bangun bertahap Fase A→D; buktikan akurasi ekstraksi dulu. Tanda tangan: jangan pernah tempel grafik ttd otomatis untuk input digital.

**Kalimat pembuka sesi pertama:**

> "Baca CLAUDE.md dan PROJECT_SOF_Automation_FINAL.md. Kita mulai Fase A: script Python yang ambil satu foto SOF, panggil Claude API, keluarkan JSON sesuai skema Bunker Form 2 di spec. Pakai sampel AL JUBAIL sebagai uji pertama."

---

## 11. Bukti yang Sudah Dihasilkan

- `AL_JUBAIL_SOF_FILLED.pdf` / `.docx` — template EUCALYPTUS asli yang diisi data AL JUBAIL (tersilang-cek dari 2 sumber). Identik karena pakai file Word klien. Ttd sengaja kosong.
- Alur lengkap **terbukti ujung-ke-ujung:** foto/email acak → JSON → validasi (menangkap Δ2.6 MT & typo LNG) → PDF template resmi.

---

## 12. Referensi

- Claude API: https://docs.claude.com/en/api/overview (harga & rate limit terkini)
- Claude Code: https://docs.claude.com/en/docs/claude-code/overview
- Supabase: https://supabase.com/docs

---

## 13. Untuk Dikonfirmasi ke Klien (sisa)

1. **Template master resmi** — EUCALYPTUS (LUB OIL) sudah dipakai; konfirmasi apakah ada versi FORM 2 (FRESH WATER) yang lebih resmi.
2. **Volume** SOF per hari/minggu (untuk ROI & sizing). *Asumsi sementara: agak padat.*
3. **Aturan ttd** (bagian 5) — minta persetujuan tertulis.