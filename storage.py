"""
Arsip dokumen SOF tergenerate (Fase C).

Setiap file yang digenerate disimpan + metadata (status review, flags, sumber),
sehingga bisa diaudit belakangan (model human-on-the-loop: auto-generate, tandai
mana yang perlu dicek).

Dua backend, dipilih otomatis:
- SUPABASE — kalau env SUPABASE_URL + SUPABASE_SERVICE_KEY diisi (bucket + tabel).
- LOKAL    — default: file di `generated/archive/`, index di `index.json`.

API:
    rec = save_document(record, file_bytes=None, ext="docx")
    rows = list_documents()
    path = local_file_path(doc_id)     # hanya untuk backend lokal
"""

import os
import json
import uuid
from datetime import datetime, timezone

ARCHIVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated", "archive")
INDEX_PATH = os.path.join(ARCHIVE_DIR, "index.json")

BUCKET = os.getenv("SUPABASE_BUCKET", "sof-files")
TABLE = os.getenv("SUPABASE_TABLE", "sof_documents")

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# field yang disimpan ke baris DB (extracted/flags/decision = JSONB)
ROW_FIELDS = ("id", "vessel_name", "sof_type", "review_status", "created_at",
              "sources", "file", "file_url", "flags", "decision", "extracted")


def _supabase_enabled():
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"))


def _now():
    return datetime.now(timezone.utc).isoformat()


# ------------------------------ public API --------------------------------

def save_document(record, file_bytes=None, ext="docx"):
    """Simpan record + (opsional) file tergenerate. Kembalikan record final."""
    record = dict(record or {})
    record.setdefault("id", uuid.uuid4().hex[:12])
    record.setdefault("created_at", _now())
    filename = f"{record['id']}.{ext}" if file_bytes else None

    if _supabase_enabled():
        try:
            _supabase_save(record, file_bytes, filename)
            record["storage"] = "supabase"
            return record
        except Exception as e:
            print(f"[warn] Supabase save gagal, fallback lokal: {e}")

    _local_save(record, file_bytes, filename)
    record["storage"] = "local"
    return record


def list_documents():
    if _supabase_enabled():
        try:
            return _supabase_list()
        except Exception as e:
            print(f"[warn] Supabase list gagal, fallback lokal: {e}")
    return _local_index()


def local_file_path(doc_id):
    for r in _local_index():
        if r.get("id") == doc_id and r.get("file"):
            p = os.path.join(ARCHIVE_DIR, r["file"])
            return p if os.path.exists(p) else None
    return None


# ------------------------------ local backend -----------------------------

def _local_index():
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _local_save(record, file_bytes, filename):
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    if file_bytes and filename:
        with open(os.path.join(ARCHIVE_DIR, filename), "wb") as f:
            f.write(file_bytes)
        record["file"] = filename
    idx = [r for r in _local_index() if r.get("id") != record["id"]]
    idx.insert(0, record)  # terbaru di atas
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)


# ---------------------------- supabase backend ----------------------------

def _sb_headers(json_ct=True):
    key = os.getenv("SUPABASE_SERVICE_KEY")
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    if json_ct:
        h["Content-Type"] = "application/json"
    return h


def _supabase_save(record, file_bytes, filename):
    import requests
    base = os.getenv("SUPABASE_URL").rstrip("/")

    if file_bytes and filename:
        up = f"{base}/storage/v1/object/{BUCKET}/{filename}"
        r = requests.post(up, headers={**_sb_headers(json_ct=False),
                                       "Content-Type": DOCX_MIME, "x-upsert": "true"},
                          data=file_bytes, timeout=30)
        r.raise_for_status()
        record["file"] = filename
        record["file_url"] = f"{base}/storage/v1/object/public/{BUCKET}/{filename}"

    row = {k: record.get(k) for k in ROW_FIELDS}
    ins = f"{base}/rest/v1/{TABLE}"
    r = requests.post(ins, headers={**_sb_headers(),
                                    "Prefer": "resolution=merge-duplicates,return=minimal"},
                      json=row, timeout=30)
    r.raise_for_status()


def _supabase_list():
    import requests
    base = os.getenv("SUPABASE_URL").rstrip("/")
    r = requests.get(f"{base}/rest/v1/{TABLE}?select=*&order=created_at.desc",
                     headers=_sb_headers(), timeout=30)
    r.raise_for_status()
    return r.json()
