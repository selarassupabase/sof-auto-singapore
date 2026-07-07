"""
Backend SOF PACMAR (Fase D — integrasi).

Alur: upload -> ekstraksi (Gemini*, vision) -> validasi deterministik (validate.py)
      -> review admin di web app -> isi template asli (fill_docx.py) -> PDF (LibreOffice).

*Catatan: spec menetapkan Claude API (claude-sonnet-5). Gemini dipakai SEMENTARA
 (keputusan klien). Ganti provider = ubah fungsi call_extraction() saja; schema &
 sisa pipeline tak berubah.
"""

import os
import io
import re
import json
import uuid
import shutil
import subprocess

from datetime import datetime
from typing import List
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from PIL import Image

import fill_docx
import validate
import merge as merge_mod
import storage

load_dotenv()

app = FastAPI(title="SOF PACMAR API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Pdf-Skipped"],
)

MOCK_JSON_PATH = "SOF BUNKER.pdf.json"
SCRATCH_DIR = "generated"
os.makedirs(SCRATCH_DIR, exist_ok=True)

# --- Schema of record: spec bagian 6 (Bunker Form 2) ---
EXTRACTION_PROMPT = """
You are an expert maritime administrator assistant for PACMAR Shipping. Extract the
Statement of Facts (SOF) "Bunker Form 2" into the EXACT JSON schema below.

RULES (accuracy is legal/financial-critical — never guess):
0. SOF TYPE DETECTION FIRST. If this is a BUNKER form (fuel/IFO/MGO/HFO barge
   alongside, ROB, bunkering) -> meta.sof_type="BUNKER_FORM2". If it is a CARGO
   OPERATIONS SOF (Notice of Readiness/NOR, loading/discharging, cargo description
   e.g. "GASOLINE ... RON", berthing/all-fast/tugs, ullaging/sampling, COSP) ->
   meta.sof_type="CARGO_OPS", DO NOT force cargo events into bunker fields (leave
   them null), and add an ERROR flag {"code":"SOF_TYPE_UNSUPPORTED", ...} saying
   cargo ops SOF is not supported yet (MVP = Bunker Form 2).
1. Timestamps as full ISO 8601 datetime "YYYY-MM-DDTHH:mm". If year omitted, infer
   from context (voyage year). Resolve cross-day ranges by chronological sequence.
   YEAR CONSISTENCY: all events in one SOF belong to the SAME voyage — the year MUST
   be identical across every timing unless the voyage clearly crosses New Year.
   Re-read any year that would make an event years apart from the others.
2. Empty markers (N/A, NIL, NYL, N/L, -) -> null. Do NOT read them as numbers.
3. Decimals by field context: "1190" -> 11.90, "6·20" -> 6.20.
4. Fuel synonyms: HFO -> IFO, LSMGO -> MDO. If a non-LNG vessel says "LNG", it is
   almost certainly a typo for IFO — map it to IFO AND add a FUEL_SYNONYM_RESOLVED
   info flag documenting the assumption.
5. SUPPLY COLUMN: the right-hand column header tells the supply type. If it reads
   "FRESH WATER SUPPLY" set supply.type="FRESH_WATER"; if "LUB OIL SUPPLY" set
   "LUB_OIL". Put that column's timings into the `supply` object. (This picks the
   output template.)
6. The image may be split into LEFT/RIGHT halves to keep columns from bleeding.
7. Signatures (READ CAREFULLY — two columns at the bottom):
   - LEFT column is the MASTER (ship's captain). It is often ONLY a signature/stamp
     with NO printed name -> then signature.master_name = "" (empty).
   - RIGHT column is "AS AGENTS": the agent PERSON's printed name (e.g. DARIUS CHONG,
     DAMIEN LOO) -> signature.agent_name. Below it sits the company "PACMAR SHIPPING
     PTE LTD".
   - "PACMAR SHIPPING PTE LTD" is the COMPANY, never a person -> do NOT put it in
     master_name or agent_name.
   - Do not swap the two columns. Set signature_present=true only if a real signature
     graphic/stamp is visible. NEVER invent a signature.
8. Anything crossed out or uncertain: DO NOT GUESS. Add a flag describing the doubt.

JSON SCHEMA (return ONLY this object):
{
  "meta": {"sof_type": "BUNKER_FORM2", "agent_company": "PACMAR SHIPPING PTE LTD",
           "source_modality": "handwritten_photo | email_text", "extraction_confidence": 0.0},
  "header": {"vessel_name": "string", "eta_next_port": "string"},
  "timings": {
    "end_of_sea_passage": {"datetime": "YYYY-MM-DDTHH:mm"},
    "pilot_on_board": {"datetime": "YYYY-MM-DDTHH:mm"},
    "anchored_location": {"place": "string", "datetime": "YYYY-MM-DDTHH:mm"},
    "pilot_off": {"datetime": "YYYY-MM-DDTHH:mm"}
  },
  "draft_arrival": {"fwd_m": 0.0, "aft_m": 0.0},
  "rob_arrival": {"ifo_mt": 0.0, "mdo_mt": 0.0, "fw_mt": 0.0},
  "bunker_mgo": {"barge_alongside": null, "commence": null, "completed": null, "cast_off": null, "qty_mt": null},
  "bunker_ifo": {"barge_alongside": null, "commence": null, "completed": null, "cast_off": null, "qty_mt": null},
  "supply": {"type": "FRESH_WATER | LUB_OIL", "barge_alongside": null, "commence": null, "stop": null, "cast_off": null, "qty_recvd_mt": null},
  "rob_departure": {"ifo_mt": 0.0, "mgo_mt": 0.0, "fw_mt": 0.0},
  "draft_departure": {"fwd_m": 0.0, "aft_m": 0.0},
  "pilot_ob_departure": "HH:mm",
  "pilot_op_departure": "HH:mm",
  "signature": {"master_name": "string", "agent_name": "string", "signature_present": false},
  "remarks": "string",
  "flags": [{"code": "string", "detail": "string", "severity": "info|warn|error"}]
}
"""


def _split_halves(file_bytes, mime_type):
    """Kembalikan (left_png, right_png) untuk isolasi kolom; None jika gagal."""
    try:
        if mime_type == "application/pdf":
            import fitz
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc[0]
            rect = page.rect
            lr = fitz.Rect(0, 0, rect.width / 2, rect.height)
            rr = fitz.Rect(rect.width / 2, 0, rect.width, rect.height)
            pl = page.get_pixmap(clip=lr, dpi=150)
            pr = page.get_pixmap(clip=rr, dpi=150)
            img_left = Image.frombytes("RGB", [pl.width, pl.height], pl.samples)
            img_right = Image.frombytes("RGB", [pr.width, pr.height], pr.samples)
        else:
            img = Image.open(io.BytesIO(file_bytes))
            w, h = img.size
            img_left = img.crop((0, 0, w // 2, h))
            img_right = img.crop((w // 2, 0, w, h))
        lb, rb = io.BytesIO(), io.BytesIO()
        img_left.save(lb, format="PNG")
        img_right.save(rb, format="PNG")
        return lb.getvalue(), rb.getvalue()
    except Exception as e:
        print(f"[warn] split failed: {e}")
        return None, None


def _pdf_text(file_bytes):
    """Ambil teks embedded PDF (untuk deteksi input DIGITAL/email vs scan foto)."""
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        return "".join(pg.get_text() for pg in doc).strip()
    except Exception:
        return ""


def call_extraction(file_bytes, mime_type):
    """Panggil provider vision/teks. Ganti isi fungsi ini untuk pindah ke Claude API.

    Dua modality (spec bagian 2): PDF/gambar dengan teks embedded banyak = input
    DIGITAL (email log) -> kirim sebagai TEKS. Sisanya = foto form tulis tangan ->
    kirim sebagai GAMBAR (dengan split kolom)."""
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=api_key)

    text = _pdf_text(file_bytes) if mime_type == "application/pdf" else ""
    if len(text) > 150:
        # --- Input DIGITAL (email) -> proses sebagai teks ---
        parts = [
            "This is a DIGITAL SOF / bunker email log (source_modality=email_text). "
            "There is NO signature graphic -> signature_present=false; put only typed "
            "names if present. Text follows:\n\n" + text,
            EXTRACTION_PROMPT,
        ]
    else:
        # --- Foto form tulis tangan -> gambar + split kolom ---
        parts = ["Here is the scanned handwritten SOF (Bunker Form 2), source_modality="
                 "handwritten_photo."]
        left, right = _split_halves(file_bytes, mime_type)
        parts += ["--- FULL PAGE ---", types.Part.from_bytes(data=file_bytes, mime_type=mime_type)]
        if left and right:
            parts += ["--- LEFT HALF ---", types.Part.from_bytes(data=left, mime_type="image/png"),
                      "--- RIGHT HALF ---", types.Part.from_bytes(data=right, mime_type="image/png")]
        parts.append(EXTRACTION_PROMPT)

    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=parts,
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.0),
    )
    return json.loads(resp.text)


@app.post("/api/extract")
async def extract_sof(file: UploadFile = File(...)):
    """Ekstraksi + validasi deterministik. Jika API key tak ada -> data mock."""
    if not os.getenv("GEMINI_API_KEY"):
        print("[info] No GEMINI_API_KEY -> mock data.")
        if os.path.exists(MOCK_JSON_PATH):
            with open(MOCK_JSON_PATH, encoding="utf-8") as f:
                return validate.apply_validation(json.load(f))
        return JSONResponse({"error": "API key missing and mock data not found."}, status_code=500)

    file_bytes = await file.read()
    try:
        result = call_extraction(file_bytes, file.content_type or "application/pdf")
    except Exception as e:
        print(f"[error] extraction failed: {e}")
        if os.path.exists(MOCK_JSON_PATH):
            with open(MOCK_JSON_PATH, encoding="utf-8") as f:
                return validate.apply_validation(json.load(f))
        return JSONResponse({"error": str(e)}, status_code=500)

    # Validasi deterministik (spec bagian 7) — bukan mengandalkan LLM.
    return validate.apply_validation(result)


@app.post("/api/extract-merge")
async def extract_merge(files: List[UploadFile] = File(...)):
    """Cross-source (spec bagian 7): >=2 file voyage sama (foto + email) ->
    ekstrak masing-masing -> gabung (isi kosong, tandai CROSS_SOURCE_CONFLICT) ->
    validasi. File pertama = primer (otoritatif). Foto tulis tangan sebaiknya
    ditaruh pertama."""
    if not os.getenv("GEMINI_API_KEY"):
        return JSONResponse({"error": "API key missing."}, status_code=500)

    sources, labels = [], []
    for f in files:
        data = await f.read()
        try:
            sources.append(call_extraction(data, f.content_type or "application/pdf"))
            labels.append(f.filename or f"src{len(sources)}")
        except Exception as e:
            print(f"[warn] extraction failed for {f.filename}: {e}")
    if not sources:
        return JSONResponse({"error": "All extractions failed."}, status_code=500)
    if len(sources) == 1:
        return validate.apply_validation(sources[0])

    merged, _ = merge_mod.merge_sources(sources, labels)
    return validate.apply_validation(merged)


def _generate_docx_bytes(data):
    """Isi template dari `data`, kembalikan bytes .docx (atau raise)."""
    rid = uuid.uuid4().hex[:8]
    jp = os.path.join(SCRATCH_DIR, f"p_{rid}.json")
    dp = os.path.join(SCRATCH_DIR, f"p_{rid}.docx")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    fill_docx.process_docx(jp, dp)
    with open(dp, "rb") as f:
        return f.read()


@app.post("/api/process")
async def process(files: List[UploadFile] = File(...)):
    """Alur OTOMATIS (human-on-the-loop): ekstrak -> validasi -> gate ->
    auto-generate (bila tak blocking) -> ARSIP dengan status review. Dokumen
    bersih = 'ok', ada flag = 'needs_check', error (mis. bukan bunker) = 'blocked'
    (tak digenerate). Semua tersimpan agar bisa diaudit."""
    sources, labels, errors = [], [], []
    for f in files:
        b = await f.read()
        try:
            sources.append(call_extraction(b, f.content_type or "application/pdf"))
            labels.append(f.filename or f"src{len(sources)}")
        except Exception as e:
            print(f"[error] extraction failed {f.filename}: {e}")
            errors.append(f"{f.filename}: {e}")
    if not sources:
        # JANGAN palsukan dgn mock -> arsipkan sebagai gagal agar terlihat & bisa ditangani manual.
        rec = {"vessel_name": "(extraction failed)", "sof_type": "UNKNOWN",
               "review_status": "blocked", "sources": [f.filename for f in files],
               "flags": [{"code": "EXTRACTION_FAILED", "detail": "; ".join(errors) or "no sources",
                          "severity": "error"}],
               "decision": {"mode": "review", "blocking": True}}
        return storage.save_document(rec, ext="docx")

    data = sources[0] if len(sources) == 1 else merge_mod.merge_sources(sources, labels)[0]
    data = validate.apply_validation(data)
    decision = data.get("_decision") or validate.gate(data)

    status = ("blocked" if decision["blocking"]
              else "ok" if decision["mode"] == "auto" else "needs_check")

    file_bytes = None
    gen_error = None
    if status != "blocked":
        try:
            file_bytes = _generate_docx_bytes(data)
        except Exception as e:
            gen_error = str(e)
            status = "needs_check"

    record = {
        "vessel_name": (data.get("header") or {}).get("vessel_name") or "(tanpa nama)",
        "sof_type": (data.get("meta") or {}).get("sof_type") or "BUNKER_FORM2",
        "review_status": status,
        "sources": labels,
        "flags": data.get("flags") or [],
        "decision": decision,
        "gen_error": gen_error,
        "extracted": data,
    }
    return storage.save_document(record, file_bytes=file_bytes, ext="docx")


@app.get("/api/documents")
async def list_documents():
    """Daftar dokumen tergenerate (arsip) untuk halaman audit."""
    docs = storage.list_documents()
    # ringkas: buang 'extracted' yang besar dari list
    return [{k: v for k, v in d.items() if k != "extracted"} for d in docs]


@app.get("/api/documents/{doc_id}")
async def document_detail(doc_id: str):
    """Detail lengkap 1 dokumen (termasuk `extracted`) untuk edit/regenerate."""
    for d in storage.list_documents():
        if d.get("id") == doc_id:
            return d
    return JSONResponse({"error": "Not found."}, status_code=404)


@app.get("/api/documents/{doc_id}/file")
async def document_file(doc_id: str):
    """Unduh file tergenerate (backend lokal). Untuk Supabase gunakan file_url."""
    path = storage.local_file_path(doc_id)
    if not path:
        return JSONResponse({"error": "File not found (it may be in Supabase — use file_url)."},
                            status_code=404)
    # Nama unduhan '<vessel> <tanggal>' — konsisten dgn tombol Export di Review.
    rec = next((d for d in storage.list_documents() if d.get("id") == doc_id), {})
    vessel = _clean_vessel(rec.get("vessel_name"))
    date = (rec.get("created_at") or "")[:10] or datetime.now().strftime("%Y-%m-%d")
    return FileResponse(path, media_type=storage.DOCX_MIME, filename=f"{vessel} {date}.docx")


def _find_soffice():
    """Cari LibreOffice: env SOFFICE_PATH -> PATH -> lokasi umum Windows."""
    env = os.getenv("SOFFICE_PATH")
    if env and os.path.exists(env):
        return env
    on_path = shutil.which("soffice") or shutil.which("soffice.exe")
    if on_path:
        return on_path
    for p in (r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
              "/usr/bin/soffice", "/opt/libreoffice/program/soffice"):
        if os.path.exists(p):
            return p
    return None


def _clean_vessel(name):
    """Bersihkan nama vessel dari karakter yang tak sah untuk nama file."""
    v = re.sub(r'[\\/:*?"<>|]+', "", (name or "SOF").strip()).strip()
    return v or "SOF"


def _export_filename_base(data, date=None):
    """Nama file unduhan: '<vessel> <tanggal-ekspor>' (tanpa ekstensi)."""
    vessel = _clean_vessel((data.get("header") or {}).get("vessel_name"))
    date = date or datetime.now().strftime("%Y-%m-%d")
    return f"{vessel} {date}"


@app.post("/api/generate-pdf")
async def generate_pdf(data: dict, format: str = "pdf"):
    fmt = (format or "pdf").lower()
    if fmt not in ("pdf", "docx"):
        return JSONResponse({"error": f"Unknown format: {format}"}, status_code=400)

    # Guard: jangan cetak dokumen non-bunker ke template bunker.
    blocking = [f for f in validate.validate(data) if f["code"] == "SOF_TYPE_UNSUPPORTED"]
    if blocking:
        return JSONResponse({"error": blocking[0]["detail"], "code": "SOF_TYPE_UNSUPPORTED"},
                            status_code=422)

    req_id = uuid.uuid4().hex[:8]
    json_path = os.path.join(SCRATCH_DIR, f"sof_{req_id}.json")
    docx_path = os.path.join(SCRATCH_DIR, f"SOF_{req_id}.docx")
    pdf_path = os.path.join(SCRATCH_DIR, f"SOF_{req_id}.pdf")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f)

    try:
        fill_docx.process_docx(json_path, docx_path)
    except Exception as e:
        print(f"[error] fill_docx failed: {e}")
        return JSONResponse({"error": f"Failed to fill template: {e}"}, status_code=500)

    base = _export_filename_base(data)

    # --- Export DOCX ---
    if fmt == "docx":
        return FileResponse(
            docx_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{base}.docx",
        )

    # --- Export PDF (butuh LibreOffice) ---
    soffice = _find_soffice()
    if not soffice:
        return JSONResponse(
            {"error": "LibreOffice is not installed — cannot export PDF. Install LibreOffice "
                      "or set SOFFICE_PATH, or use Export DOCX.",
             "code": "PDF_UNAVAILABLE"},
            status_code=503,
        )
    try:
        subprocess.run([soffice, "--headless", "--convert-to", "pdf",
                        "--outdir", SCRATCH_DIR, docx_path], check=True, timeout=120)
    except Exception as e:
        print(f"[warn] LibreOffice convert failed: {e}")
        return JSONResponse({"error": f"PDF conversion failed: {e}", "code": "PDF_CONVERT_FAILED"},
                            status_code=500)

    if not os.path.exists(pdf_path):
        return JSONResponse({"error": "PDF was not produced.", "code": "PDF_CONVERT_FAILED"},
                            status_code=500)

    return FileResponse(pdf_path, media_type="application/pdf", filename=f"{base}.pdf")


@app.get("/api/health")
async def health():
    return {"ok": True, "gemini": bool(os.getenv("GEMINI_API_KEY")),
            "libreoffice": bool(_find_soffice()),
            "archive": "supabase" if storage._supabase_enabled() else "local"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
