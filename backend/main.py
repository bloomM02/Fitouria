import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .anomaly import diagnose
from .comparison import ComparisonRequest, compare
from .simulation import Scenario
from .storage import Store
from .telemetry import MqttReceiver, demo_measurement

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store()
    mqtt = MqttReceiver(app.state.store)
    app.state.mqtt = mqtt
    try:
        mqtt.start()
    except (OSError, ValueError):
        mqtt.status = "offline"
        log.exception("Configuration MQTT invalide.")
    try:
        yield
    finally:
        mqtt.stop()


app = FastAPI(title="Fitouria", version="1.0.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    detail = [dict(loc=item["loc"], msg=item["msg"], type=item["type"]) for item in error.errors()]
    return JSONResponse(status_code=422, content={"detail": detail})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/scenarios/latest")
def latest(request: Request):
    return request.app.state.store.latest()


@app.post("/api/scenarios", status_code=201)
def create_scenario(scenario: Scenario, request: Request):
    return request.app.state.store.save_scenario(scenario)


@app.get("/api/telemetry")
def telemetry(request: Request, source: Literal["simulation", "mqtt"] = "simulation"):
    return dict(readings=request.app.state.store.history(source), mqtt=request.app.state.mqtt.status)


@app.post("/api/telemetry/simulate", status_code=201)
def record_sample(request: Request):
    request.app.state.store.record("simulation", demo_measurement().model_dump())
    return telemetry(request)


@app.post("/api/comparison")
def compare_pathways(request: ComparisonRequest):
    return {"options": compare(request)}


@app.get("/api/diagnostics")
def diagnostics(request: Request, source: Literal["simulation", "mqtt"] = "simulation", device: str | None = None):
    readings = request.app.state.store.history(source, limit=200)
    if device is not None:
        readings = [reading for reading in readings if reading["device_id"] == device]
    return {"source": source, **diagnose(readings)}


if frontend_dir := os.getenv("FITOURIA_FRONTEND_DIR"):
    dist = Path(frontend_dir)

    def frontend():
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})

    for path in ("/", "/simulation", "/capteurs", "/intelligence-artificielle"):
        app.add_api_route(path, frontend, methods=["GET"], include_in_schema=False)
    app.mount("/", StaticFiles(directory=dist), name="frontend-assets")
