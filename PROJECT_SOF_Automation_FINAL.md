# Proyek Otomasi Statement of Facts (SOF) — PACMAR Shipping
### Spesifikasi Final + Rencana Build

Dokumen acuan utama & siap dibawa ke Claude Code. Menggabungkan konteks masalah, arsitektur, temuan sampel asli, kontrak data, dan rencana implementasi.

---

## 1. Masalah & Tujuan

**Masalah:** Pilot/Master mengisi SOF manual (tulis tangan **atau** ketik digital format acak). Admin lalu mengetik ulang ke template digital → **double entry**, rawan salah.

**Tujuan (inti):** Apapun bentuk masukannya (foto form tulis tangan / teks email acak) → **satu PDF rapi yang persis template resmi PACMAR**.

**Kenapa akurasi krusial:** SOF = dasar hitung *laytime/demurrage* & *neraca bunker*. Salah satu jam/angka bisa jadi sengketa uang. Maka AI = **asisten admin, bukan pengganti**. Human-in-the-loop wajib.

---

## 2. Scope MVP (TERKUNCI)

| Aspek | Keputusan |
|---|---|
| Jenis SOF | **Bunker Form 2** dulu (sampel terbanyak). Cargo Ops SOF menyusul. |
| Template output | **EUCALYPTUS.docx** (file Word asli dari klien) — satu-satunya yang ada. |
| Channel input | **Foto form tulis tangan** + **teks email**. |
| Model ekstraksi | **Claude API** (`claude-sonnet-5`, punya vision). |
| UI review | **Web app** (browser). |
| Storage & DB | **Supabase** (Postgres + storage bucket). |

---

## 3. Arsitektur

**Pipeline (sudah terbukti ujung-ke-ujung):**

```
Input (foto tulis tangan ATAU teks email acak)
  → LLM ekstrak ke skema JSON baku (Claude API, vision)
  → Mesin validasi (neraca fuel, normalisasi, cross-source)
  → UI review admin  ← JANTUNG SISTEM (approve/koreksi)
  → Isi EUCALYPTUS.docx asli → export PDF (LibreOffice)
  → Simpan ke Supabase + arsip
```

**Keputusan kunci & alasannya:**
- **Sistem sendiri, bukan n8n** — tim maintain sendiri; validasi kompleks + PDF generation payah di n8n.
- **Isi docx asli → export PDF**, BUKAN overlay koordinat, BUKAN replika manual. Hasil **identik by definition** karena pakai file Word klien. Slot kosong di template = tab bergaris-bawah; nilai disisipkan di dalamnya (garis tetap nyambung, "HRS" tak bergeser).

---

## 4. ⚠️ Jebakan Infra — WAJIB DIBACA

Langkah **isi docx → export PDF butuh LibreOffice (`soffice`) terpasang di server**. Ini gampang di mesin lokal/VPS, tapi **mentok di serverless** (Vercel/Netlify functions tak punya LibreOffice).

→ **Keputusan hosting:** frontend web boleh di mana saja, tapi **proses isi-docx harus di server yang bisa jalanin LibreOffice** (VPS kecil / container / mesin lokal untuk MVP). Jangan arahkan langkah ini ke serverless.

---

## 5. Aturan Tanda Tangan (FINAL — sensitif, tulis ke klien)

- Scan **ada** ttd → **pertahankan** ttd dari gambar.
- Scan/email **tanpa** ttd → isi **nama ketik** saja, ttd **kosong**.
- Input **email digital** → isi **nama ketik**, ttd **kosong**.

**JANGAN pernah menempelkan grafik tanda tangan seseorang secara otomatis** untuk input digital. Memproduksi ttd tanpa orangnya benar-benar menandatangani dokumen spesifik = risiko hukum, apalagi di dokumen bernilai uang. Nama ketik aman; grafik ttd tidak. Kalau klien tetap minta tempel ttd tersimpan, harus keputusan tertulis mereka.

---

## 6. Skema JSON Baku — Bunker Form 2

Kontrak data antara modul ekstraksi & modul cetak.

```json
{
  "meta": {
    "sof_type": "BUNKER_FORM2",
    "agent_company": "PACMAR SHIPPING PTE LTD",
    "source_modality": "handwritten_photo | email_text",
    "extraction_confidence": 0.0
  },
  "header": {
    "vessel_name": "AL JUBAIL",
    "eta_next_port": "YANTAI, CHINA"
  },
  "timings": {
    "end_of_sea_passage":  { "datetime": "2026-06-23T23:30" },
    "pilot_on_board":      { "datetime": "2026-06-24T00:42" },
    "anchored_location":   { "place": "PEBGB", "datetime": "2026-06-24T02:00" },
    "pilot_off":           { "datetime": "2026-06-24T02:10" }
  },
  "draft_arrival":   { "fwd_m": 6.20, "aft_m": 7.90 },
  "rob_arrival":     { "ifo_mt": 398.3, "mdo_mt": 187.54, "fw_mt": 530 },
  "bunker_mgo":  { "barge_alongside": null, "commence": null, "completed": null, "cast_off": null, "qty_mt": null },
  "bunker_ifo":  { "barge_alongside": "2026-06-24T02:30", "commence": "2026-06-24T05:30", "completed": "2026-06-24T11:18", "cast_off": "2026-06-24T12:54", "qty_mt": 948.502 },
  "lub_oil":     { "barge_alongside": null, "commence": null, "stop": null, "cast_off": null, "qty_recvd_mt": null },
  "rob_departure":   { "ifo_mt": 1344.2, "mgo_mt": 187.54, "fw_mt": 525 },
  "draft_departure": { "fwd_m": 6.30, "aft_m": 7.95 },
  "pilot_ob_departure": "14:30",
  "pilot_op_departure": "15:10",
  "signature": { "master_name": "", "agent_name": "DAMIEN LOO", "signature_present": false },
  "remarks": "",
  "flags": [
    { "code": "FUEL_BALANCE_MISMATCH", "detail": "398.3 + 948.502 = 1346.8 vs departure 1344.2 (Δ2.6 MT)", "severity": "warn" },
    { "code": "FUEL_SYNONYM_RESOLVED", "detail": "Email 'LNG' → mapped to IFO", "severity": "info" }
  ]
}
```

**Prinsip:** waktu disimpan sebagai `datetime` penuh (tanggal+jam), bukan "0230" telanjang — menuntaskan lintas-hari, timestamp kembar, & hitungan durasi.

---

## 7. Aturan Validasi

| Kode | Aturan | Severity |
|---|---|---|
| `FUEL_BALANCE_MISMATCH` | `rob_departure.ifo ≈ rob_arrival.ifo + bunker_ifo.qty` (toleransi kecil untuk konsumsi) | warn |
| `FUEL_SYNONYM_RESOLVED` | Petakan HFO→IFO, LSMGO→MDO; deteksi typo (LNG di kapal non-LNG) | info |
| `DRAFT_VS_QTY` | Draft naik harus konsisten dengan qty fuel masuk | warn |
| `CHRONOLOGY` | Urutan waktu logis (pilot on board sebelum anchored, dst) | warn |
| `MISSING_REQUIRED` | Field wajib tak boleh kosong (EOSP, vessel, dst) | error |
| `CROSS_SOURCE_CONFLICT` | Bila ada 2 sumber (form+email), tandai nilai yang beda | warn |
| `NORMALIZE_EMPTY` | N/A, NIL, NYL, N/L → kosong seragam (jangan dibaca angka) | auto |
| `NORMALIZE_DECIMAL` | `1190`→11.90, `6·20`→6.20 sesuai konteks field | auto |
| `NORMALIZE_TIME` | `0500HRS`, `24/02:30` → format jam seragam | auto |
| `CARGO_MATCH` (cargo SOF) | Kargo di header vs event loading harus sama | warn |

---

## 8. Temuan dari Sampel Asli (bukti kenapa validasi wajib)

Semua nyata di file klien, bukan teori.

**Cross-validation AL JUBAIL** (muncul di form tulis tangan + email log, voyage sama):
- **Neraca fuel meleset:** 398.3 + 948.502 = 1346.8 vs departure 1344.2 → **Δ 2.6 MT**. Sistem flag, tak putuskan sendiri.
- **Typo sinonim:** email tulis "LNG – 1344.2 MT" (kapal tak bawa LNG; harusnya IFO). Form benar.
- **Beda anchorage:** form "PEBGB" vs email "Eastern Bunkering Charlie".

**Cargo SOF (ECO PRIDE):** header GASOLINE **90** RON vs event GASOLINE **92** RON.

**Chaos format (LLM wajib, regex mati):**
- Tanggal/jam beda tiap master: `27.03.2026 1330`, `20 MAY 2026 / 2000`, `24/02:30`.
- Desimal: `1190`(=11.90), `6·20`, `12·07`.
- "Kosong" 4 gaya: `N/A` `NIL` `NYL` `N/L`.
- Sinonim fuel: HFO↔IFO, LSMGO↔MDO, typo LNG.
- Rentang lintas hari: `1654-1000 HRS ON 27.06.2026`.
- Timestamp kembar → jaga urutan (`seq`), jangan dedupe by time.
- Jam nempel: `0500HRS`, `1700HRS`.
- Coretan tulisan tangan → flag yang ragu.

---

## 9. Persiapan Sebelum Build

**Akun & kunci:**
- Anthropic API key (console.anthropic.com, isi kredit) — terpisah dari langganan Claude Code.
- Supabase project → catat `Project URL`, `anon key`, `service_role key`; bikin bucket `sof-files`.
- Node.js LTS.
- Server yang bisa jalankan LibreOffice (lihat bagian 4).

**File yang dikumpulkan ke folder proyek:**
- `EUCALYPTUS.docx` (template asli — jantung langkah cetak).
- Semua sampel SOF (AL JUBAIL, MORNING, ROYAL TOPAZ, ECO PRIDE, email BUNKER_REPORT) — data uji akurasi.
- File ini (`PROJECT_SOF_Automation_FINAL.md`).

---

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
4. **File .docx** untuk jenis template lain (cargo ops) saat mau ekspansi.
