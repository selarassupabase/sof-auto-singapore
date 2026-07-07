import sys, os, time, win32com.client, fitz, pythoncom
def render(docx, png):
    docx=os.path.abspath(docx); pdf=os.path.splitext(docx)[0]+"_r.pdf"
    if os.path.exists(pdf): os.remove(pdf)
    pythoncom.CoInitialize()
    word=win32com.client.DispatchEx("Word.Application"); word.Visible=False
    word.DisplayAlerts=0
    try:
        d=word.Documents.Open(docx, ReadOnly=True)
        d.SaveAs(pdf, FileFormat=17); d.Close(False)
    finally:
        try: word.Quit()
        except Exception: pass
    time.sleep(0.5)
    doc=fitz.open(pdf); pg=doc.load_page(0)
    pix=pg.get_pixmap(dpi=120); pix.save(png); doc.close()
    try: os.remove(pdf)
    except OSError: pass
    print("OK", png)
render(sys.argv[1], sys.argv[2])
