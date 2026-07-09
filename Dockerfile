# Backend SOF PACMAR untuk Railway.
# Nixpacks tidak memasang LibreOffice dengan andal -> pakai Dockerfile eksplisit.
# LibreOffice (soffice) wajib untuk konversi DOCX -> PDF (tombol Preview / Export PDF).
FROM python:3.12-slim

# soffice + font dasar supaya render template rapi. --no-install-recommends
# menekan ukuran; buang cache apt setelah install.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-core \
      fonts-liberation \
      fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# server.py membaca $PORT (disuntik Railway) dan bind 0.0.0.0.
CMD ["python", "server.py"]
