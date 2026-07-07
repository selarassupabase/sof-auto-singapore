# SOF Automation — PACMAR Shipping

Otomasi Statement of Facts: foto form tulis tangan / email acak → JSON → validasi →
PDF yang persis template resmi PACMAR. Konteks penuh: [`PROJECT_SOF_Automation_FINAL.md`](PROJECT_SOF_Automation_FINAL.md).

## Arsitektur (sekarang)

```
Upload (foto/PDF/email)
  → extract  (Gemini vision*)            server.py :: call_extraction()
  → validate (deterministik, spec §7)    validate.py
  → review admin (edit + lihat flags)    sof-web-app  (React/Vite)
  → isi TEMPLATE ASLI in-place           fill_docx.py  (BUNKER SOF - EUCALYPTUS.docx)
  → export PDF (LibreOffice)             server.py :: /api/generate-pdf
```

\* **Gemini dipakai sementara** (keputusan klien). Spec menetapkan Claude API
(`claude-sonnet-5`). Pindah provider = cukup ganti `call_extraction()` di `server.py`;
schema & pipeline lain tidak berubah.

## Komponen

| File | Peran |
|---|---|
| `extract.py` | Fase A standalone: 1 file → JSON + validasi. `python extract.py <pdf>` |
| `validate.py` | Mesin validasi deterministik (fuel balance, kronologi, missing, draft-vs-qty) |
| `fill_docx.py` | Isi template asli **in-place** (body + grid bunker di text box DrawingML+VML) |
| `validate.py` | + deteksi: YEAR_INCONSISTENT, SIGNATURE_CHECK, SOF_TYPE_UNSUPPORTED (Cargo Ops ditolak) |
| `merge.py` | Cross-source (spec §7): gabung ≥2 sumber voyage sama, isi kosong, tandai CROSS_SOURCE_CONFLICT |
| `server.py` | API FastAPI: `/api/extract`, `/api/extract-merge` (multi-file), `/api/generate-pdf`, `/api/health` |
| `_render.py` | Dev tool: render docx→PNG via Word COM untuk QA layout (butuh MS Word) |
| `sof-web-app/` | UI upload + review (React) |

## Menjalankan

```bash
# 1. Backend
pip install fastapi uvicorn python-dotenv pillow pymupdf lxml google-genai
cp .env.example .env   # isi GEMINI_API_KEY (tanpa key → server pakai data mock)
python server.py       # http://localhost:8000

# 2. Web app
cd sof-web-app && npm install && npm run dev
```

## Skema data

Satu kontrak: **spec bagian 6 (Bunker Form 2)** — waktu sebagai `datetime` penuh.
Kolom supply kanan digeneralisasi jadi `supply` = `{type, barge_alongside, commence,
stop, cast_off, qty_recvd_mt}` dengan `type` = `FRESH_WATER` | `LUB_OIL` (legacy
`lub_oil` masih diterima). Dipakai konsisten oleh extract/validate/fill/web.

## Varian template (FORM 2)

`fill_docx.TEMPLATES` memetakan varian → file `.docx`:
- `LUB_OIL` → `BUNKER SOF - EUCALYPTUS.docx` (ada).
- `FRESH_WATER` → `BUNKER SOF - FRESH WATER.docx` (**belum ada** — minta ke klien).

Varian dipilih otomatis dari `supply.type`. Selama template FRESH WATER belum ada,
sistem pakai **bridge**: EUCALYPTUS di-relabel ("LUB OIL SUPPLY"→"FRESH WATER SUPPLY",
"LUB BARGE"→"FW BARGE"). Override path via env `SOF_TEMPLATE_FRESH_WATER`.

⚠️ Bridge belum 100% setia: kop EUCALYPTUS lama (9 Raffles Place) ≠ kop form baru
(8 Shenton Way), dan form FRESH WATER punya QTY REPLENISHED terpisah per fuel + tanpa
PILOT OFF. Fidelity penuh butuh `.docx` FRESH WATER asli dari klien.

## Alur otomatis + arsip (human-on-the-loop)

Klien memilih alur **otomatis**. `/api/process` menjalankan: ekstrak → validasi →
gate → **auto-generate** (bila tak blocking) → **arsip** dengan status review:

| Status | Arti | Digenerate? |
|---|---|---|
| `ok` (hijau) | nol flag & confidence tinggi | ya |
| `needs_check` (kuning) | ada flag / confidence rendah — perlu diaudit | ya |
| `blocked` (merah) | error (mis. Cargo Ops SOF) / ekstraksi gagal | tidak |

Halaman **Arsip** (`/documents`) menampilkan semua dokumen + status, sumber,
jumlah flag, dan tombol unduh/review. Ini "jejak audit": auto-generate semua,
manusia tinggal cek yang bertanda.

### Penyimpanan: lokal (default) atau Supabase
`storage.py` memilih otomatis:
- **Lokal** (default) — file di `generated/archive/`, index `index.json`.
- **Supabase** — aktif kalau `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` diisi (lihat `.env.example`).

**Setup Supabase (sekali):**
1. Buat bucket **`sof-files`** (Storage). Set public kalau mau `file_url` bisa diakses langsung.
2. Buat tabel `sof_documents`:
```sql
create table sof_documents (
  id            text primary key,
  vessel_name   text,
  sof_type      text,
  review_status text,               -- ok | needs_check | blocked
  created_at    timestamptz default now(),
  sources       jsonb,
  file          text,               -- nama objek di bucket
  file_url      text,               -- URL publik (kalau bucket public)
  flags         jsonb,
  decision      jsonb,
  extracted     jsonb
);
```
3. Isi env, restart server. Data baru otomatis ke Supabase; `/api/documents` membacanya.

## Catatan penting (belum selesai / butuh perhatian)

1. **LibreOffice belum terpasang** di mesin dev → langkah PDF fallback ke DOCX terisi.
   Pasang LibreOffice atau set `SOFFICE_PATH` untuk dapat PDF. **Jangan** taruh langkah
   isi-docx di serverless (spec §4).
2. **Fidelity grid bunker (text box) belum diverifikasi visual** karena PDF belum bisa
   dirender di sini. Body (header/timings/draft/ROB/ETA) sudah terverifikasi via
   re-ekstraksi teks. Setelah LibreOffice ada, QA visual satu kali dengan sampel AL JUBAIL.
3. **Supabase** (Fase C) belum diintegrasikan — `sof-web-app/src/lib/supabase.js` masih
   placeholder; state review sementara di `localStorage`.
4. **Tanda tangan**: hanya nama ketik yang diisi; grafik ttd TIDAK pernah dibubuhkan
   otomatis (spec §5).
