"""
Cross-source merge (spec bagian 7 — CROSS_SOURCE_CONFLICT).

Gabung >=2 hasil ekstraksi SOF untuk voyage yang SAMA (mis. form tulis tangan +
email log AL JUBAIL). Aturan:
- Sumber PERTAMA = primer (biasanya form tulis tangan bertanda tangan = otoritatif).
- Field kosong di satu sumber -> diisi dari sumber lain yang punya.
- Field BEDA antar sumber -> flag CROSS_SOURCE_CONFLICT (nilai primer dipakai,
  TAPI ditandai; sistem tak memutuskan diam-diam — admin yang review).

API:
    merged, flags = merge_sources([form_json, email_json], ["form", "email"])
"""

import copy


def _norm(v):
    """Normalisasi untuk perbandingan: angka -> float, string -> UPPER/trim."""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().upper()
    # "530" == 530.0
    try:
        return float(s)
    except ValueError:
        return s


def _resolve(pairs, flags, path):
    """pairs = [(label, value), ...] untuk satu node di semua sumber (value bisa None).
    Kembalikan nilai tergabung; isi flag konflik bila beda."""
    present = [(l, v) for l, v in pairs if v is not None]
    if not present:
        return None

    # semua dict -> merge rekursif per key
    if all(isinstance(v, dict) for _, v in present):
        keys = []
        for _, v in present:
            for k in v:
                if k not in keys:
                    keys.append(k)
        out = {}
        for k in keys:
            sub = [(l, v.get(k) if isinstance(v, dict) else None) for l, v in pairs]
            out[k] = _resolve(sub, flags, f"{path}.{k}" if path else k)
        return out

    # list (mis. flags/remarks tak masuk sini) -> ambil primer
    if any(isinstance(v, list) for _, v in present):
        return present[0][1]

    # leaf skalar -> bandingkan
    groups = {}  # norm -> {"raw": original, "labels": [..]}
    for l, v in present:
        g = groups.setdefault(_norm(v), {"raw": v, "labels": []})
        g["labels"].append(l)
    if len(groups) > 1:
        detail = " vs ".join(
            f"{g['raw']!r} ({'/'.join(g['labels'])})" for g in groups.values())
        flags.append({
            "code": "CROSS_SOURCE_CONFLICT",
            "detail": f"{path}: {detail}",
            "severity": "warn",
        })
    return present[0][1]   # nilai sumber primer


def merge_sources(sources, labels=None):
    """Gabung daftar hasil ekstraksi. sources[0] = primer. Field 'flags' tiap
    sumber di-union, ditambah flag CROSS_SOURCE_CONFLICT."""
    sources = [s or {} for s in sources]
    labels = labels or [f"source{i + 1}" for i in range(len(sources))]

    flags = []
    keys = []
    for s in sources:
        for k in s:
            if k not in keys and k != "flags":
                keys.append(k)

    merged = {}
    for k in keys:
        pairs = [(labels[i], s.get(k)) for i, s in enumerate(sources)]
        # 'meta' = metadata (modality/confidence) — wajar beda antar sumber,
        # jangan di-flag konflik (buang flag-nya ke list terpisah).
        merged[k] = _resolve(pairs, [] if k == "meta" else flags, k)

    # union flag dari tiap sumber (tandai asalnya) + flag konflik
    combined = []
    seen = set()
    for i, s in enumerate(sources):
        for f in (s.get("flags") or []):
            key = (f.get("code"), f.get("detail"))
            if key not in seen:
                seen.add(key)
                combined.append({**f, "detail": f"[{labels[i]}] {f.get('detail', '')}"})
    combined.extend(flags)
    merged["flags"] = combined
    return merged, flags


if __name__ == "__main__":
    import sys, json
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    srcs = [json.load(open(p, encoding="utf-8")) for p in sys.argv[1:]]
    labels = [p.split("/")[-1].split("\\")[-1][:20] for p in sys.argv[1:]]
    merged, conflicts = merge_sources(srcs, labels)
    print("MERGED vessel:", (merged.get("header") or {}).get("vessel_name"))
    print("MERGED anchored:", (merged.get("timings") or {}).get("anchored_location"))
    print("\nCONFLICTS:")
    for f in conflicts:
        print(f"  [{f['severity']}] {f['code']}: {f['detail']}")
