import logging
import math
import os
import time

import paho.mqtt.client as mqtt
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .storage import Store

log = logging.getLogger(__name__)


class Measurement(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)

    device_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    temperature_c: float = Field(ge=-40, le=125)
    humidity_pct: float = Field(ge=0, le=100)
    power_w: float = Field(ge=0, le=100_000)


class PyrolysisTelemetry(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, strict=True)

    bio: str = Field(min_length=1, max_length=80)
    temp: float = Field(ge=-40, le=1200)
    moist: float = Field(ge=0, le=100)
    ph: float | None = Field(None, ge=0, le=14)

    def reading(self):
        return dict(device_id="wokwi-pyrolyse", temperature_c=None, power_w=None,
                    humidity_pct=None, pyrolysis_temp_c=self.temp, substrate_moisture_pct=self.moist,
                    biochar_ph=self.ph, pyrolysis_stage=self.bio)


def parse_mqtt_measurement(payload: bytes) -> dict:
    try:
        return Measurement.model_validate_json(payload).model_dump()
    except ValidationError:
        return PyrolysisTelemetry.model_validate_json(payload).reading()


def demo_measurement() -> Measurement:
    phase = time.monotonic() / 8
    return Measurement(
        device_id="moulin-demo",
        temperature_c=round(25 + 2.5 * math.sin(phase), 1),
        humidity_pct=round(57 + 7 * math.cos(phase * 0.8), 1),
        power_w=round(1350 + 260 * math.sin(phase * 1.2), 1),
    )


class MqttReceiver:
    def __init__(self, store: Store):
        self.store = store
        self.host = os.getenv("MQTT_HOST")
        self.topic = os.getenv("MQTT_TOPIC", "fitouria/demo/telemetry")
        self.status = "connecting" if self.host else "disabled"
        self.client = None

    def start(self):
        if not self.host:
            return
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        user = os.getenv("MQTT_USER")
        if user:
            client.username_pw_set(user, os.getenv("MQTT_PASSWORD"))
        tls = os.getenv("MQTT_TLS", "0") == "1"
        if tls:
            client.tls_set(ca_certs=os.getenv("MQTT_CA_CERT"))
        client.on_connect = self.on_connect
        client.on_disconnect = self.on_disconnect
        client.on_subscribe = self.on_subscribe
        client.on_message = self.on_message
        client.connect_async(self.host, int(os.getenv("MQTT_PORT", "8883" if tls else "1883")))
        client.loop_start()
        self.client = client

    def stop(self):
        if self.client:
            self.client.disconnect()
            self.client.loop_stop()

    def on_connect(self, client, userdata, flags, reason, properties):
        self.status = "offline"
        if not reason.is_failure:
            result, _ = client.subscribe(self.topic, qos=1)
            if result == mqtt.MQTT_ERR_SUCCESS:
                self.status = "connecting"

    def on_subscribe(self, client, userdata, mid, reason_codes, properties):
        self.status = "online" if reason_codes and not any(code.is_failure for code in reason_codes) else "offline"

    def on_disconnect(self, client, userdata, flags, reason, properties):
        self.status = "offline"

    def on_message(self, client, userdata, message):
        if message.retain or len(message.payload) > 2048:
            return
        try:
            self.store.record("mqtt", parse_mqtt_measurement(message.payload))
        except ValidationError:
            log.warning("MQTT: mesure invalide ignorée")
        except Exception:
            log.exception("MQTT: échec de l'enregistrement de la mesure")
