"""
Isi template ASLI `BUNKER SOF - EUCALYPTUS.docx` secara in-place (Fase B).

Prinsip (sesuai spec bagian 3 & 10):
- JANGAN bangun dokumen baru / replika manual. Kita edit XML template klien
  supaya hasil identik dengan kop resmi PACMAR.
- Body paragraph diisi lewat run-level (ganti token placeholder / blank bergaris
  bawah). Grid "bunker operations timings" ada di dalam text box yang disimpan
  ganda (DrawingML + fallback VML); kita isi KEDUA salinan agar sinkron.
- Nilai None / kosong dibiarkan kosong (garis tetap nyambung). Waktu yang ragu
  sudah difilter di hulu (validator), di sini kita hanya menaruh nilai.

Pemakaian:
    python fill_docx.py <input.json> [output.docx]
"""

import os
import sys
import json
import shutil
import zipfile
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
V = "urn:schemas-microsoft-com:vml"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(BASE, "BUNKER SOF - EUCALYPTUS.docx")

# Registry template per varian FORM 2. `path` = file .docx asli klien.
# FRESH_WATER belum punya .docx sendiri -> pakai bridge (EUCALYPTUS + relabel)
# sampai klien mengirim template resmi (spec bagian 13 no.1).
# Override lewat env: SOF_TEMPLATE_LUB_OIL / SOF_TEMPLATE_FRESH_WATER.
TEMPLATES = {
    "LUB_OIL": {
        "path": os.getenv("SOF_TEMPLATE_LUB_OIL") or os.path.join(BASE, "BUNKER SOF - EUCALYPTUS.docx"),
        "supply_label": "LUB OIL SUPPLY",
        "barge_prefix": "LUB",
    },
    "FRESH_WATER": {
        "path": os.getenv("SOF_TEMPLATE_FRESH_WATER") or os.path.join(BASE, "BUNKER SOF - FRESH WATER.docx"),
        "supply_label": "FRESH WATER SUPPLY",
        "barge_prefix": "FW",
    },
}


def resolve_variant(data):
    """Tentukan varian (FRESH_WATER / LUB_OIL) dari data. Kembalikan
    (variant, cfg, template_path, is_bridge)."""
    supply = data.get("supply") or {}
    raw = (supply.get("type")
           or (data.get("meta") or {}).get("supply_type")
           or ("LUB_OIL" if data.get("lub_oil") else "LUB_OIL"))
    variant = str(raw).upper().replace(" ", "_").replace("-", "_")
    if variant not in TEMPLATES:
        variant = "LUB_OIL"
    cfg = TEMPLATES[variant]
    if os.path.exists(cfg["path"]):
        return variant, cfg, cfg["path"], False
    # bridge: template khusus belum ada -> pakai EUCALYPTUS, relabel bila perlu
    return variant, cfg, TEMPLATES["LUB_OIL"]["path"], (variant != "LUB_OIL")


# ----------------------------- formatting ---------------------------------

def fmt_date(iso):
    """ISO datetime/date -> 'DD.MM.YYYY' (format master di sampel)."""
    if not iso:
        return None
    s = str(iso)
    d = s.split("T")[0]
    parts = d.split("-")
    if len(parts) == 3:
        y, m, day = parts
        return f"{day}.{m}.{y}"
    return d


def fmt_time(iso):
    """ISO datetime / 'HH:mm' -> 'HH:mm'."""
    if not iso:
        return None
    s = str(iso)
    if "T" in s:
        return s.split("T")[1][:5]
    return s[:5]


def fmt_num(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


# --------------------------- run-level helpers ----------------------------

def _q(tag):
    return f"{{{W}}}{tag}"


def runs(p):
    return p.findall(_q("r"))


def run_text(r):
    return "".join(t.text or "" for t in r.findall(_q("t")))


def is_underline(r):
    rpr = r.find(_q("rPr"))
    return rpr is not None and rpr.find(_q("u")) is not None


def has_tab(r):
    return r.find(_q("tab")) is not None


def is_ul_blank(r):
    """Blank isian di BODY = run bergaris-bawah yang kosong / hanya tab / spasi.
    (Garis bawah = tempat tulisan tangan di form; tab struktural tak digaris-bawah.)"""
    if not is_underline(r):
        return False
    return run_text(r).strip() == ""


def is_tab_blank(r):
    """Blank isian di TEXT BOX = run ber-<w:tab/> tanpa teks (tak selalu digaris-bawah)."""
    return has_tab(r) and run_text(r).strip() == ""


def set_run_text(r, s):
    """Ganti isi run jadi `s`, buang <w:tab/>, pertahankan rPr (underline dsb).
    HANYA untuk run tanpa peran tab-stop (label/heading)."""
    for tab in r.findall(_q("tab")):
        r.remove(tab)
    ts = r.findall(_q("t"))
    if not ts:
        t = etree.SubElement(r, _q("t"))
        ts = [t]
    ts[0].text = s
    ts[0].set(XML_SPACE, "preserve")
    for extra in ts[1:]:
        r.remove(extra)


def _clear_content(r):
    """Hapus semua <w:t>/<w:tab> dari run, sisakan rPr & properti lain."""
    for el in list(r):
        if el.tag in (_q("t"), _q("tab")):
            r.remove(el)


def fill_underline_blank(r, value):
    """Isi blank sambil MEMPERTAHANKAN tab-stop: nilai ditaruh SEBELUM <w:tab/>,
    tab tetap ada supaya teks setelahnya (HRS/MT/label kolom) tak bergeser.
    Perataan garis-bawah form tetap terjaga."""
    had_tab = has_tab(r)
    _clear_content(r)
    t = etree.SubElement(r, _q("t"))
    # padding minim (hanya leading space biar tak nempel ':') supaya lebar
    # tambahan sekecil mungkin -> mengurangi risiko baris meluap/wrap.
    t.text = f" {value}" if had_tab else f" {value} "
    t.set(XML_SPACE, "preserve")
    if had_tab:
        etree.SubElement(r, _q("tab"))   # tab dikembalikan agar advance ke stop


def replace_token(r, old, new):
    """Ganti substring `old`->`new` di <w:t> run TANPA menyentuh <w:tab/>
    (tab struktural tetap utuh)."""
    for t in r.findall(_q("t")):
        if t.text and old in t.text:
            t.text = t.text.replace(old, new)
            t.set(XML_SPACE, "preserve")


def para_text(p):
    return "".join(t.text or "" for t in p.iter(_q("t")))


def all_paras(root):
    return list(root.iter(_q("p")))


def find_paras(root, anchor):
    """Semua paragraf yang teksnya memuat anchor (untuk match salinan ganda textbox)."""
    return [p for p in all_paras(root) if anchor in para_text(p)]


# --------------------------- body line fillers ----------------------------

def _g(d, *path):
    cur = d
    for k in path:
        if cur is None:
            return None
        cur = (cur or {}).get(k)
    return cur


def fill_targets(rs, values, blank_test=is_ul_blank, consume_trailing=False):
    """Isi 'target' berurutan pada satu baris. Target = token 'DATE' ATAU satu
    SLOT blank (deret run blank beruntun dihitung satu slot). Nilai None -> slot
    dibiarkan kosong (garis tetap). Ini menjaga alignment walau jumlah blank
    per field beda-beda."""
    vi = 0
    prev_blank = False
    for r in rs:
        if vi >= len(values):
            break
        t = run_text(r)
        if "DATE" in t:
            val = values[vi]; vi += 1
            # token 'DATE' selalu dibersihkan: None -> kosongkan (jangan cetak "DATE").
            # Pakai replace_token agar <w:tab/> di run yang sama tetap utuh.
            replace_token(r, "DATE", val if val is not None else "")
            prev_blank = False
        elif blank_test(r):
            if not prev_blank:              # awal slot baru
                val = values[vi]; vi += 1
                if val is not None:
                    fill_underline_blank(r, val)   # sisip sebelum tab (jaga perataan)
                prev_blank = True
            elif consume_trailing and values[vi - 1] is not None:
                # blank beruntun sisa slot yang SUDAH diisi -> kosongkan tab-nya
                # supaya tak menambah lebar baris (cegah wrap). Hanya kalau slot
                # tadi memang terisi (kalau None, biarkan garis kosong utuh).
                _clear_content(r)
        else:
            prev_blank = False


def fill_body(root, data):
    header = data.get("header") or {}
    tms = data.get("timings") or {}
    da = data.get("draft_arrival") or {}
    ra = data.get("rob_arrival") or {}
    rd = data.get("rob_departure") or {}
    dd = data.get("draft_departure") or {}
    sig = data.get("signature") or {}
    vessel = header.get("vessel_name") or "EUCALYPTUS"

    for p in all_paras(root):
        txt = para_text(p)
        rs = runs(p)

        if txt.startswith("VESSEL NAME"):
            for r in rs:
                if run_text(r).strip() == "EUCALYPTUS":
                    set_run_text(r, vessel)

        elif txt.startswith("END OF SEA PASSAGE"):
            fill_targets(rs, [fmt_date(_g(tms, "end_of_sea_passage", "datetime")),
                              fmt_time(_g(tms, "end_of_sea_passage", "datetime"))])

        elif txt.startswith("PILOT ON BOARD"):
            fill_targets(rs, [
                fmt_date(_g(tms, "pilot_on_board", "datetime")),
                fmt_time(_g(tms, "pilot_on_board", "datetime")),
                _g(tms, "anchored_location", "place"),
                fmt_date(_g(tms, "anchored_location", "datetime")),
                fmt_time(_g(tms, "anchored_location", "datetime")),
                fmt_date(_g(tms, "pilot_off", "datetime")),
                fmt_time(_g(tms, "pilot_off", "datetime")),
            ])

        elif txt.startswith("DRAFT ON ARRIVAL"):
            fill_targets(rs, [fmt_num(da.get("fwd_m")), fmt_num(da.get("aft_m")),
                              fmt_num(ra.get("ifo_mt")), fmt_num(ra.get("mdo_mt")),
                              fmt_num(ra.get("fw_mt"))])

        elif txt.replace("\t", "").startswith("QTY REPLENISHED:") and "MTS" not in txt:
            # body 'QTY REPLENISHED' render di blok IFO -> qty IFO (BUKAN dijumlah;
            # form pisah per fuel). QTY MGO diisi di textbox (lihat _fill_mgo_qty).
            bifo = (data.get("bunker_ifo") or {}).get("qty_mt")
            fill_targets(rs, [fmt_num(bifo) if bifo else None])

        elif txt.startswith("ROB ON DEPARTURE"):
            fill_targets(rs, [fmt_num(rd.get("ifo_mt")), fmt_num(rd.get("mgo_mt")),
                              fmt_num(rd.get("fw_mt"))])

        elif txt.startswith("DRAFT ON DEPARTURE"):
            fwd = fmt_num(dd.get("fwd_m"))
            aft = fmt_num(dd.get("aft_m"))
            done_fwd = False
            for r in rs:
                if not done_fwd and is_underline(r) and has_tab(r) and "MTRS" in run_text(r):
                    if fwd:
                        # FWD[tab]MTRS -> " fwd "[tab]"MTRS" (jaga tab & MTRS)
                        _clear_content(r)
                        t1 = etree.SubElement(r, _q("t")); t1.text = f" {fwd} "
                        t1.set(XML_SPACE, "preserve")
                        etree.SubElement(r, _q("tab"))
                        t2 = etree.SubElement(r, _q("t")); t2.text = "MTRS"
                    done_fwd = True
                elif done_fwd and is_ul_blank(r):
                    if aft:
                        fill_underline_blank(r, aft)
                    break

        elif txt.startswith("PILOT O/B"):
            # baris padat (pilot O/B + O/P + ETA) -> consume_trailing biar tak wrap
            fill_targets(rs, [fmt_time(data.get("pilot_ob_departure")),
                              fmt_time(data.get("pilot_op_departure")),
                              header.get("eta_next_port")],
                         consume_trailing=True)
            # ETA NEXT PORT bisa panjang (nama port) & paragraf ini padat.
            # Setelah nilai ETA, buang tab ekstra + kosongkan blank sisa supaya
            # nilai tak terdorong ke baris berikut (wrap).
            after_eta = False
            first_val = True
            for r in rs:
                if "ETA NEXT PORT" in run_text(r):
                    after_eta = True
                    continue
                if after_eta and is_underline(r):
                    if first_val and run_text(r).strip():
                        for tb in r.findall(_q("tab")):
                            r.remove(tb)
                        first_val = False
                    elif not run_text(r).strip():
                        _clear_content(r)

        elif txt.strip().startswith("MASTER") and "AS AGENTS" in txt:
            master = sig.get("master_name")
            agent = sig.get("agent_name")
            for r in rs:
                t = run_text(r)
                if t.strip() == "MASTER" and master:
                    set_run_text(r, f"MASTER: {master}")
                elif "AGENTS" in t and agent:
                    set_run_text(r, t.replace("AGENTS", f"AGENTS: {agent}"))

        # 'MV EUCALYPTUS' pada blok ttd -> nama kapal aktual. Template sudah punya
        # prefiks 'MV', jadi buang prefiks tipe kapal dari nama (hindari 'MV M/V ...').
        if "MV EUCALYPTUS" in txt:
            mv_name = vessel
            for pre in ("M/V ", "M.V. ", "M.V ", "MV ", "MT ", "M/T "):
                if mv_name.upper().startswith(pre):
                    mv_name = mv_name[len(pre):]
                    break
            for r in rs:
                if "EUCALYPTUS" in run_text(r):
                    set_run_text(r, run_text(r).replace("EUCALYPTUS", mv_name))


# ------------------------ textbox (bunker grid) ---------------------------

def fill_textboxes(root, data):
    """Isi grid bunker ops di dalam text box (kedua salinan DML+VML sekaligus)."""
    bifo = data.get("bunker_ifo") or {}
    bmgo = data.get("bunker_mgo") or {}
    # kolom supply kanan: 'supply' (generik) atau 'lub_oil' (legacy)
    supply = data.get("supply") or data.get("lub_oil") or {}

    # MGO/ BARGE ALONGSIDE: HRS COMMENCE PUMPING: HRS
    for p in find_paras(root, "MGO/ BARGE ALONGSIDE"):
        fill_targets(runs(p),
                     [fmt_time(bmgo.get("barge_alongside")), fmt_time(bmgo.get("commence"))],
                     blank_test=is_tab_blank, consume_trailing=False)

    # Kolom supply: "LUB BARGE A/S" (LUB OIL) atau "FW BARGE A/S" (FRESH WATER).
    # Match "BARGE A/S" agar berlaku untuk kedua varian.
    for p in find_paras(root, "BARGE A/S"):
        fill_targets(runs(p),
                     [fmt_time(supply.get("barge_alongside")), fmt_time(supply.get("commence")),
                      fmt_time(supply.get("stop")), fmt_time(supply.get("cast_off"))],
                     blank_test=is_tab_blank, consume_trailing=False)

    # Grid IFO: shape berisi 4 paragraf ': HRS' berurutan =
    #   barge alongside / commence / completed / cast off
    ifo_vals = [fmt_time(bifo.get("barge_alongside")), fmt_time(bifo.get("commence")),
                fmt_time(bifo.get("completed")), fmt_time(bifo.get("cast_off"))]
    _fill_ifo_grid(root, ifo_vals)

    # MGO baris COMPLETED PUMPING & BARGE CAST OFF: blank-nya di text box
    # terfragmentasi terpisah (tanpa huruf, tepat 2 blank -> pola unik).
    _fill_mgo_tail(root, [fmt_time(bmgo.get("completed")), fmt_time(bmgo.get("cast_off"))])

    # QTY REPLENISHED blok MGO: kotak tanpa-huruf dengan 1 blank (pola unik).
    _fill_mgo_qty(root, fmt_num(bmgo.get("qty_mt")))


def _fill_mgo_qty(root, qty):
    """Isi QTY REPLENISHED blok MGO (kotak text box tanpa huruf, tepat 1 blank).
    Kotak IFO/QTY lain punya huruf/HRS, jadi pola ini unik."""
    if not qty:
        return
    for txbx in root.iter(f"{{{W}}}txbxContent"):
        full = "".join(t.text or "" for t in txbx.iter(_q("t")))
        if any(c.isalpha() for c in full):
            continue
        blanks = [r for p in txbx.findall(_q("p")) for r in runs(p) if is_tab_blank(r)]
        if len(blanks) == 1:
            fill_underline_blank(blanks[0], qty)


def _fill_mgo_tail(root, vals):
    """Isi 2 blank MGO (completed pumping & barge cast off) yang berada di text
    box tanpa huruf (hanya ':'/tab). Pola 'letterless & tepat 2 blank' unik untuk
    baris ini (kotak IFO punya 'HRS', kotak QTY cuma 1 blank). Terapkan ke kedua
    salinan (DML+VML)."""
    if not any(vals):
        return
    for txbx in root.iter(f"{{{W}}}txbxContent"):
        full = "".join(t.text or "" for t in txbx.iter(_q("t")))
        if any(c.isalpha() for c in full):
            continue  # ada label/HRS -> bukan kotak ini
        blanks = [r for p in txbx.findall(_q("p")) for r in runs(p) if is_tab_blank(r)]
        if len(blanks) == 2:
            for r, val in zip(blanks, vals):
                if val:
                    fill_underline_blank(r, val)


def _fill_ifo_grid(root, ifo_vals):
    """Cari shape/txbx yang punya >=4 paragraf ': HRS' & isi berurutan.
    Diterapkan ke semua salinan (DML+VML)."""
    for txbx in root.iter(f"{{{W}}}txbxContent"):
        hrs_paras = [p for p in txbx.findall(_q("p"))
                     if para_text(p).strip() == ": HRS"]
        if len(hrs_paras) >= 4:
            for p, val in zip(hrs_paras, ifo_vals):
                if val:
                    for r in runs(p):
                        if is_tab_blank(r):
                            fill_underline_blank(r, val)
                            break


# ------------------------------- remarks ----------------------------------

def fill_remarks(root, data):
    remarks = (data.get("remarks") or "").strip()
    if not remarks:
        return
    for p in all_paras(root):
        if para_text(p).strip() == "REMARKS:":
            rs = runs(p)
            if rs:
                last = rs[-1]
                new = etree.SubElement(p, _q("r"))
                t = etree.SubElement(new, _q("t"))
                t.text = f" {remarks}"
                t.set(XML_SPACE, "preserve")
            break


# ------------------------ relabel (bridge varian) -------------------------

def relabel_supply(root, cfg):
    """Bridge: ubah label kolom LUB OIL pada template EUCALYPTUS menjadi label
    varian target (mis. FRESH WATER), di kedua salinan text box. Dipakai hanya
    saat template khusus varian belum tersedia."""
    # swap inline (dalam satu run), mis. "LUB BARGE A/S: ..."
    inline = [("LUB BARGE", cfg["barge_prefix"] + " BARGE")]
    # swap heading yang teksnya terpecah lintas run, mis. "LUB OIL SUPPLY"
    heading = [("LUB OIL SUPPLY", cfg["supply_label"])]

    for p in all_paras(root):
        rs = runs(p)
        for r in rs:
            t = run_text(r)
            for old, new in inline:
                if old in t:
                    set_run_text(r, t.replace(old, new))
                    t = run_text(r)
        ptext = para_text(p).strip()
        for old, new in heading:
            if ptext == old and rs:
                set_run_text(rs[0], new)     # label baru di run pertama (rPr dipertahankan)
                for extra in rs[1:]:         # kosongkan sisa run label
                    set_run_text(extra, "")


# --------------------------------- main -----------------------------------

def process_docx(json_path, output_path, template=None):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    variant, cfg, resolved, is_bridge = resolve_variant(data)
    template = template or resolved

    if not os.path.exists(template):
        raise FileNotFoundError(f"Template tidak ditemukan: {template}")

    # baca template zip, ambil document.xml
    with zipfile.ZipFile(template, "r") as z:
        names = z.namelist()
        doc_xml = z.read("word/document.xml")

    root = etree.fromstring(doc_xml)

    if is_bridge:
        relabel_supply(root, cfg)   # EUCALYPTUS -> label varian target
    fill_body(root, data)
    fill_textboxes(root, data)
    fill_remarks(root, data)

    new_xml = etree.tostring(root, xml_declaration=True,
                             encoding="UTF-8", standalone=True)

    # tulis ulang docx: copy semua part, ganti document.xml
    with zipfile.ZipFile(template, "r") as zin, \
            zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == "word/document.xml":
                zout.writestr(item, new_xml)
            else:
                zout.writestr(item, zin.read(item.filename))

    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fill_docx.py <json_file_path> [output.docx]")
        sys.exit(1)
    json_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "GENERATED.docx"
    with open(json_path, encoding="utf-8") as _f:
        _v, _c, _t, _b = resolve_variant(json.load(_f))
    process_docx(json_path, output_path)
    note = " (BRIDGE: relabel dari EUCALYPTUS)" if _b else ""
    print(f"Successfully generated {output_path} | variant={_v}{note} | template={os.path.basename(_t)}")
