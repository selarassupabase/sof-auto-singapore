Baca CLAUDE.md dan PROJECT_SOF_Automation_FINAL.md sampai paham konteks penuh — ini
proyek otomasi Statement of Facts untuk PACMAR Shipping. Jangan tulis kode dulu sebelum
kamu ringkas balik ke saya: (1) tujuan sistem, (2) kenapa akurasi krusial, (3) skema JSON
Bunker Form 2, dan (4) rencana Fase A→D. Konfirmasi dulu.

Setelah itu kita mulai FASE A — ekstraksi murni, belum ada web app, belum ada PDF.

Tugas Fase A:
- Buat script Python yang menerima SATU input (foto SOF tulis tangan ATAU teks email acak),
  memanggil Claude API (claude-sonnet-5, vision), dan mengeluarkan JSON persis sesuai skema
  Bunker Form 2 di bagian 6 spec.
- Uji pertama pakai sampel AL JUBAIL. Sampel ini muncul di 2 sumber (form tulis tangan +
  email log, voyage sama), jadi itu "kunci jawaban" kita untuk ukur akurasi.
- Tangani chaos format yang nyata di sampel (bagian 8): tanggal/jam beda-beda gaya,
  desimal aneh (1190=11.90, 6·20), "kosong" 4 gaya (N/A/NIL/NYL/N/L), sinonim fuel
  (HFO↔IFO, LSMGO↔MDO, typo LNG), rentang lintas hari, timestamp kembar.
- Simpan waktu sebagai datetime penuh (tanggal+jam), bukan "0230" telanjang.

Aturan main:
- Fase A adalah GERBANG. Jangan lanjut ke Fase B sebelum akurasi ekstraksi terbukti
  memuaskan di semua sampel. Kalau ada yang ragu/coret, keluarkan sebagai flag, jangan
  ditebak diam-diam.
- Jangan pakai regex sebagai mesin utama parsing — pakai LLM, regex hanya untuk normalisasi.

Mulai dengan: tampilkan struktur folder, konfirmasi sampel apa saja yang tersedia, lalu
tulis script ekstraksi versi pertama dan jalankan ke AL JUBAIL.