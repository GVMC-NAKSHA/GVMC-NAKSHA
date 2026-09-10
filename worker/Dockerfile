FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr gdal-bin libgdal-dev poppler-utils libgl1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
CMD ["python", "src/main.py"]
