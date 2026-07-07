import os
import sys
import json
import base64
import fitz  # PyMuPDF
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

def get_image_from_pdf(pdf_path):
    # Convert first page of PDF to image and encode to base64
    doc = fitz.open(pdf_path)
    page = doc.load_page(0)
    pix = page.get_pixmap(dpi=150)
    img_data = pix.tobytes("jpeg")
    return img_data

def extract_sof(file_path):
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)
    
    # Check if file has text or is an image
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
        
    contents = []
    
    prompt = """
You are an expert maritime administrator assistant. Your task is to extract Statement of Facts (SOF) data into a strictly typed JSON schema based on the 'Bunker Form 2'.

CRITICAL INSTRUCTIONS:
1. Extract ALL timestamps as full ISO 8601 datetimes (e.g. "2026-06-24T05:30"). If the year is omitted, assume 2026 based on context. Resolve cross-day ranges accurately based on chronological sequence.
2. Normalize empty fields ('N/A', 'NIL', 'NYL', 'N/L', '-') to null.
3. Normalize decimals (e.g. '1190' to 11.90, '6·20' to 6.20).
4. Resolve fuel synonyms: HFO maps to IFO, LSMGO maps to MDO. Note: "LNG" on a non-LNG vessel is likely a typo for IFO.
   SUPPLY COLUMN: right-column header "FRESH WATER SUPPLY" -> supply.type="FRESH_WATER"; "LUB OIL SUPPLY" -> "LUB_OIL". Put that column's timings into `supply`.
5. Calculate the fuel balance. If rob_departure.ifo != rob_arrival.ifo + bunker_ifo.qty_mt (allowing minor tolerance for consumption), add a FUEL_BALANCE_MISMATCH flag.
6. If any field is crossed out or highly uncertain, DO NOT GUESS. Add a flag describing the uncertainty in the flags array.
7. For signatures (two bottom columns): LEFT = MASTER (captain; often only a stamp/signature with NO printed name -> master_name=""). RIGHT = "AS AGENTS": the agent PERSON's printed name (e.g. DARIUS CHONG) -> agent_name; the company "PACMAR SHIPPING PTE LTD" below it is NOT a person, never put it in master_name/agent_name. Do not swap columns. signature_present=true only if a real signature/stamp is visible. NEVER generate a signature graphic.

JSON SCHEMA:
{
  "meta": {
    "sof_type": "BUNKER_FORM2",
    "agent_company": "PACMAR SHIPPING PTE LTD",
    "source_modality": "handwritten_photo | email_text",
    "extraction_confidence": 0.0
  },
  "header": {
    "vessel_name": "string",
    "eta_next_port": "string"
  },
  "timings": {
    "end_of_sea_passage": { "datetime": "YYYY-MM-DDTHH:mm" },
    "pilot_on_board": { "datetime": "YYYY-MM-DDTHH:mm" },
    "anchored_location": { "place": "string", "datetime": "YYYY-MM-DDTHH:mm" },
    "pilot_off": { "datetime": "YYYY-MM-DDTHH:mm" }
  },
  "draft_arrival": { "fwd_m": 0.0, "aft_m": 0.0 },
  "rob_arrival": { "ifo_mt": 0.0, "mdo_mt": 0.0, "fw_mt": 0.0 },
  "bunker_mgo": { "barge_alongside": "datetime|null", "commence": "datetime|null", "completed": "datetime|null", "cast_off": "datetime|null", "qty_mt": 0.0 },
  "bunker_ifo": { "barge_alongside": "datetime|null", "commence": "datetime|null", "completed": "datetime|null", "cast_off": "datetime|null", "qty_mt": 0.0 },
  "supply": { "type": "FRESH_WATER | LUB_OIL", "barge_alongside": "datetime|null", "commence": "datetime|null", "stop": "datetime|null", "cast_off": "datetime|null", "qty_recvd_mt": 0.0 },
  "rob_departure": { "ifo_mt": 0.0, "mgo_mt": 0.0, "fw_mt": 0.0 },
  "draft_departure": { "fwd_m": 0.0, "aft_m": 0.0 },
  "pilot_ob_departure": "HH:mm",
  "pilot_op_departure": "HH:mm",
  "signature": { "master_name": "string", "agent_name": "string", "signature_present": false },
  "remarks": "string",
  "flags": [
    { "code": "string", "detail": "string", "severity": "info|warn|error" }
  ]
}

Return ONLY a valid JSON object matching the exact schema above.
"""

    if len(text.strip()) > 100:
        print(f"Processing {file_path} as text (email log)...")
        contents = [
            f"Here is the text from the SOF email log:\n\n{text}",
            prompt
        ]
    else:
        print(f"Processing {file_path} as image (scanned form)...")
        img_data = get_image_from_pdf(file_path)
        contents = [
            types.Part.from_bytes(
                data=img_data,
                mime_type='image/jpeg',
            ),
            "Here is the scanned handwritten SOF form.",
            prompt
        ]
        
    print("Calling Gemini API...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0
        )
    )
    
    result = response.text

    # Validasi deterministik (spec bagian 7) — gabungkan flag, bukan andalkan LLM.
    try:
        import validate
        parsed = validate.apply_validation(json.loads(result))
        result = json.dumps(parsed, indent=2, ensure_ascii=False)
    except Exception as e:
        parsed = None
        print(f"Warning: validation skipped ({e})")

    output_file = file_path + ".json"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"Extraction complete! Saved to {output_file}")

    if parsed is not None:
        print("\nExtracted Header:")
        print(json.dumps(parsed.get("header", {}), indent=2, ensure_ascii=False))
        print("\nFlags (extraction + validation):")
        print(json.dumps(parsed.get("flags", []), indent=2, ensure_ascii=False))
    else:
        print("Warning: Output is not valid JSON.")
        print(result[:500])

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if len(sys.argv) < 2:
        print("Usage: python extract.py <pdf_file_path>")
        sys.exit(1)

    extract_sof(sys.argv[1])
