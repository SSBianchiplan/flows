# GPlanSiS|Flows 2.0 — app + API num contêiner (uvicorn, 1 worker: presença em memória e escrita serializada no SQLite)
FROM python:3.12-slim
LABEL org.opencontainers.image.title="GPlanSiS|Flows" \
      org.opencontainers.image.version="2.1.0" \
      org.opencontainers.image.vendor="GPlanSiS|Group"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLOWS_DATA=/data FLOWS_STATIC=/srv/app
RUN useradd -u 10001 -M -s /usr/sbin/nologin flows && mkdir -p /data && chown flows /data
WORKDIR /srv
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/app.py server/app.py
COPY app/ app/
USER flows
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/api/health')"
CMD ["uvicorn", "app:app", "--app-dir", "server", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "1"]
