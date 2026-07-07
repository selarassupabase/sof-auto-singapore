"""
Mesin validasi SOF (spec bagian 7) — DETERMINISTIK, terpisah dari LLM.

Filosofi (spec bagian 1): AI = asisten admin, bukan pengganti. Validator TIDAK
memutuskan sendiri; ia hanya menaikkan flag agar admin review (human-in-the-loop).
Angka/jam yang tak cocok ditandai, bukan diperbaiki diam-diam.

API:
    flags = validate(data)          # kembalikan list flag baru (deterministik)
    data  = apply_validation(data)  # gabungkan flag ke data['flags'] (dedupe)
"""

from datetime import datetime

# toleransi neraca fuel (MT). Konsumsi selama olah gerak wajar kecil; selisih di
# atas ini pantas di-review (sampel AL JUBAIL: Δ2.6 MT).
FUEL_TOLERANCE_MT = 1.0


def _parse_dt(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _num(v):
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _flag(code, detail, severity):
    return {"code": code, "detail": detail, "severity": severity}


def validate(data):
    """Kembalikan daftar flag deterministik untuk `data` (schema spec bagian 6)."""
    flags = []
    data = data or {}
    header = data.get("header") or {}
    tms = data.get("timings") or {}
    ra = data.get("rob_arrival") or {}
    rd = data.get("rob_departure") or {}
    bifo = data.get("bunker_ifo") or {}
    bmgo = data.get("bunker_mgo") or {}

    # --- SOF_TYPE_UNSUPPORTED (error) ---
    # MVP = Bunker Form 2. Cargo Ops SOF (NOR/loading/COSP) belum didukung; jangan
    # paksa ke template bunker. Deteksi dari sof_type ATAU penanda kargo di teks.
    meta = data.get("meta") or {}
    sof_type = str(meta.get("sof_type") or "").upper()
    blob = " ".join(str(x) for x in (
        data.get("remarks") or "", (data.get("header") or {}).get("cargo") or "",
    )).upper()
    cargo_markers = ("NOTICE OF READINESS", "COMMENCED LOADING", "COMPLETED LOADING",
                     "COSP", " NOR ", "RON UNLEADED", "LOADING ARM", "ULLAGING",
                     "ALL FAST", "DISCHARGING")
    # penanda kargo (>=2) bersifat definitif & MENGALAHKAN sof_type dari LLM
    # (prompt lama kadang salah menandai kargo sebagai BUNKER_FORM2).
    marker_hits = sum(m in blob for m in cargo_markers)
    is_cargo = ("CARGO" in sof_type) or marker_hits >= 2
    if is_cargo:
        flags.append(_flag(
            "SOF_TYPE_UNSUPPORTED",
            "Dokumen ini terdeteksi Cargo Operations SOF, BUKAN Bunker Form 2. "
            "Template & skema saat ini hanya untuk Bunker Form 2 (MVP) — data kargo "
            "(NOR, loading, cargo grade, COSP) tak akan tercetak benar. Jangan generate "
            "dengan template bunker. Cargo Ops menyusul (butuh template & skema sendiri).",
            "error"))
        return flags  # tak perlu validasi bunker lain untuk dokumen non-bunker

    # --- MISSING_REQUIRED (error) ---
    if not header.get("vessel_name"):
        flags.append(_flag("MISSING_REQUIRED", "vessel_name kosong.", "error"))
    if not _parse_dt(((tms.get("end_of_sea_passage") or {}).get("datetime"))):
        flags.append(_flag("MISSING_REQUIRED",
                            "END OF SEA PASSAGE (EOSP) kosong / tak terbaca.", "error"))

    # --- FUEL_BALANCE_MISMATCH (warn) ---
    ifo_arr = _num(ra.get("ifo_mt"))
    ifo_dep = _num(rd.get("ifo_mt"))
    ifo_qty = _num(bifo.get("qty_mt")) or 0.0
    if ifo_arr is not None and ifo_dep is not None:
        expected = ifo_arr + ifo_qty
        delta = round(ifo_dep - expected, 3)
        if abs(delta) > FUEL_TOLERANCE_MT:
            flags.append(_flag(
                "FUEL_BALANCE_MISMATCH",
                f"{ifo_arr} + {ifo_qty} = {round(expected, 3)} MT vs "
                f"ROB departure {ifo_dep} MT (Δ{delta} MT).",
                "warn"))

    # --- YEAR_INCONSISTENT (warn) ---
    # Semua waktu di 1 SOF = voyage sama. Tahun yang beda dari mayoritas hampir
    # pasti salah-baca (mis. 2024 vs 2026). Tandai, jangan perbaiki diam-diam.
    dated = []
    for label, path in (("EOSP", ("end_of_sea_passage",)),
                        ("PILOT ON BOARD", ("pilot_on_board",)),
                        ("ANCHORED", ("anchored_location",)),
                        ("PILOT OFF", ("pilot_off",))):
        node = tms
        for k in path:
            node = (node or {}).get(k)
        d = _parse_dt((node or {}).get("datetime"))
        if d:
            dated.append((label, d))
    if len(dated) >= 2:
        years = [d.year for _, d in dated]
        majority = max(set(years), key=years.count)
        for label, d in dated:
            if d.year != majority:
                flags.append(_flag(
                    "YEAR_INCONSISTENT",
                    f"{label} tahun {d.year} beda dari mayoritas voyage "
                    f"({majority}) — kemungkinan salah-baca. Cek sumber.",
                    "warn"))

    # --- CHRONOLOGY (warn) ---
    seq = [
        ("EOSP", (tms.get("end_of_sea_passage") or {}).get("datetime")),
        ("PILOT ON BOARD", (tms.get("pilot_on_board") or {}).get("datetime")),
        ("ANCHORED", (tms.get("anchored_location") or {}).get("datetime")),
        ("PILOT OFF", (tms.get("pilot_off") or {}).get("datetime")),
    ]
    parsed = [(name, _parse_dt(v)) for name, v in seq]
    prev_name, prev_dt = None, None
    for name, dt in parsed:
        if dt is None:
            continue
        if prev_dt is not None and dt < prev_dt:
            flags.append(_flag(
                "CHRONOLOGY",
                f"{name} ({dt:%d.%m.%Y %H:%M}) lebih awal dari {prev_name} "
                f"({prev_dt:%d.%m.%Y %H:%M}).",
                "warn"))
        prev_name, prev_dt = name, dt

    # urutan pumping tiap bunker: barge alongside <= commence <= completed <= cast off
    for label, b in (("IFO", bifo), ("MGO", bmgo)):
        steps = [("barge alongside", b.get("barge_alongside")),
                 ("commence", b.get("commence")),
                 ("completed", b.get("completed")),
                 ("cast off", b.get("cast_off"))]
        pn, pd = None, None
        for sname, v in steps:
            d = _parse_dt(v)
            if d is None:
                continue
            if pd is not None and d < pd:
                flags.append(_flag(
                    "CHRONOLOGY",
                    f"Bunker {label}: {sname} lebih awal dari {pn}.", "warn"))
            pn, pd = sname, d

    # --- SIGNATURE_CHECK (warn) ---
    # Blok ttd: KIRI = MASTER (kapten kapal, sering hanya stempel -> nama kosong),
    # KANAN = AS AGENTS (orang PACMAR, mis. DARIUS CHONG). Nama perusahaan PACMAR
    # BUKAN nama orang. Kalau agent_name = perusahaan, kemungkinan master/agent
    # tertukar (mis. agen ke-input sebagai master).
    sig = data.get("signature") or {}
    company = (data.get("meta") or {}).get("agent_company") or "PACMAR SHIPPING PTE LTD"
    master_name = (sig.get("master_name") or "").strip()
    agent_name = (sig.get("agent_name") or "").strip()

    def _is_company(name):
        n = name.upper()
        return n and ("PACMAR" in n or n == company.upper())

    if _is_company(agent_name):
        flags.append(_flag(
            "SIGNATURE_CHECK",
            f"agent_name '{agent_name}' adalah nama PERUSAHAAN, bukan nama orang. "
            f"Nama agen (mis. yang tertulis di sisi 'AS AGENTS') mungkin salah "
            f"masuk ke master. Cek: master='{master_name or '(kosong)'}'.",
            "warn"))
    elif _is_company(master_name):
        flags.append(_flag(
            "SIGNATURE_CHECK",
            f"master_name '{master_name}' adalah nama perusahaan, bukan kapten. "
            f"Master biasanya hanya stempel/ttd (nama ketik kosong).",
            "warn"))

    # --- DRAFT_VS_QTY (warn) ---
    da = data.get("draft_arrival") or {}
    dd = data.get("draft_departure") or {}
    aft_a, aft_d = _num(da.get("aft_m")), _num(dd.get("aft_m"))
    total_qty = ifo_qty + (_num(bmgo.get("qty_mt")) or 0.0)
    if total_qty > 0 and aft_a is not None and aft_d is not None and aft_d < aft_a:
        flags.append(_flag(
            "DRAFT_VS_QTY",
            f"Fuel masuk {round(total_qty, 3)} MT tapi draft aft turun "
            f"({aft_a} -> {aft_d} m).", "warn"))

    return flags


def apply_validation(data):
    """Gabungkan flag deterministik ke data['flags'], dedupe by (code, detail),
    lalu lampirkan keputusan gerbang otomatis di data['_decision']."""
    data = data or {}
    existing = list(data.get("flags") or [])
    seen = {(f.get("code"), f.get("detail")) for f in existing}
    for f in validate(data):
        key = (f["code"], f["detail"])
        if key not in seen:
            existing.append(f)
            seen.add(key)
    data["flags"] = existing
    data["_decision"] = gate(data)
    return data


# Ambang confidence untuk lolos otomatis (straight-through, tanpa review).
AUTO_CONFIDENCE = 0.9


def gate(data):
    """Keputusan confidence-gated (jalan tengah 'otomatis'): dokumen BERSIH lolos
    otomatis; yang kena flag / confidence rendah antre review. Sistem tak pernah
    mencetak dokumen ber-error.

    Kembalikan: {mode: 'auto'|'review', blocking: bool, confidence, error_count,
    warn_count, reasons: [..]}."""
    data = data or {}
    flags = data.get("flags") or []
    errors = [f for f in flags if f.get("severity") == "error"]
    warns = [f for f in flags if f.get("severity") == "warn"]
    conf = (data.get("meta") or {}).get("extraction_confidence")
    low_conf = isinstance(conf, (int, float)) and conf < AUTO_CONFIDENCE

    reasons = [f["code"] for f in errors] + [f["code"] for f in warns]
    if low_conf:
        reasons.append(f"LOW_CONFIDENCE({conf})")

    mode = "auto" if not errors and not warns and not low_conf else "review"
    return {
        "mode": mode,
        "blocking": bool(errors),          # error = tak boleh generate sama sekali
        "confidence": conf,
        "error_count": len(errors),
        "warn_count": len(warns),
        "reasons": reasons,
    }


if __name__ == "__main__":
    import sys, json
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    with open(sys.argv[1], encoding="utf-8") as fh:
        d = json.load(fh)
    for fl in validate(d):
        print(f"[{fl['severity'].upper():5}] {fl['code']}: {fl['detail']}")
