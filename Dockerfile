FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 FITOURIA_FRONTEND_DIR=/app/frontend/dist
COPY backend/requirements.txt backend/requirements.txt
RUN python -m pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=frontend /build/dist frontend/dist
RUN useradd --system --create-home fitouria && mkdir /app/data && chown fitouria /app/data
ENV FITOURIA_DB=/app/data/fitouria.sqlite3
ENV MQTT_HOST=broker.hivemq.com MQTT_PORT=1883 MQTT_TOPIC=Zitori/Zitori/data
USER fitouria
EXPOSE 10000
CMD ["sh", "-c", "exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
