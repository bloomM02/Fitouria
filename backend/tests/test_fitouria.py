from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.simulation import Scenario, simulate


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FITOURIA_DB", str(tmp_path / "fitouria.sqlite3"))
    monkeypatch.delenv("MQTT_HOST", raising=False)
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize("recovery", [0, 70, 100])
def test_material_and_economic_balances(recovery):
    scenario = Scenario(recovery_pct=recovery)
    result = simulate(scenario)
    total_mass = sum(result[key] for key in ("oil_kg", "pellets_kg", "moisture_kg", "untreated_kg"))
    assert total_mass == pytest.approx(scenario.olives_kg)
    assert result["oil_l"] * 0.915 == pytest.approx(result["oil_kg"])
    assert result["revenue"] - result["costs"] == pytest.approx(result["margin"])
    baseline = simulate(Scenario(recovery_pct=0))
    assert result["margin"] - baseline["margin"] == pytest.approx(result["recovery_gain"])


def test_new_scenario_is_persisted_and_associated_with_telemetry(client):
    assert client.get("/api/scenarios/latest").json()["id"] is None
    response = client.post("/api/scenarios", json={"olives_kg": 250, "recovery_pct": 100, "context": "sfax"})
    assert response.status_code == 201
    lot = response.json()
    assert lot["inputs"]["context"] == "sfax"
    assert lot["results"]["pomace_kg"] == pytest.approx(205)
    assert client.get("/api/scenarios/latest").json() == lot
    response = client.post("/api/telemetry/simulate")
    assert response.status_code == 201
    measure = response.json()["readings"][-1]
    assert measure["source"] == "simulation"
    assert measure["scenario_id"] == lot["id"]
    assert client.get("/api/telemetry?source=mqtt").json()["readings"] == []


@pytest.mark.parametrize("payload", [{"olives_kg": 0}, {"recovery_pct": 101}, {"oil_price": -1}, {"unknown": 2}])
def test_out_of_range_scenarios(client, payload):
    assert client.post("/api/scenarios", json=payload).status_code == 422


def test_mqtt_callback_validates_and_stores_measurements(client):
    receiver = app.state.mqtt
    good = b'{"device_id":"wokwi","temperature_c":25,"humidity_pct":57,"power_w":1000}'
    for payload, retained in [(good, False), (good, True), (b'{"temperature_c":900}', False)]:
        receiver.on_message(None, None, SimpleNamespace(retain=retained, payload=payload))
    items = client.get("/api/telemetry?source=mqtt").json()["readings"]
    assert len(items) == 1
    assert items[0]["device_id"] == "wokwi"
    assert items[0]["power_w"] == 1000
    assert client.get("/api/telemetry").json()["readings"] == []


def test_comparison_ranks_by_margin_and_calculates_break_even(client):
    payload = {"scenario": {"context": "sfax", "biochar_price": 10},
               "pellets_cost": 0.2, "pyrolysis_cost": 0.5, "codigestion_cost": 0.3}
    response = client.post("/api/comparison", json=payload)
    assert response.status_code == 200
    options = response.json()["options"]
    assert options[0]["pathway"] == "pyrolysis"
    assert [option["margin"] for option in options] == sorted((option["margin"] for option in options), reverse=True)
    for option in options:
        assert option["break_even"] * option["quantity"] == pytest.approx(option["cost"])
        assert option["gain"] == pytest.approx(option["revenue"] - option["cost"])
    payload["scenario"]["recovery_pct"] = 0
    assert all(option["break_even"] is None
               for option in client.post("/api/comparison", json=payload).json()["options"])


def test_diagnostic_learns_from_same_device_and_excludes_the_latest_reading(client):
    assert client.get("/api/diagnostics").json()["status"] == "insufficient"
    store = app.state.store
    baseline = {"device_id": "moulin-a", "temperature_c": 25, "humidity_pct": 58, "power_w": 1000}
    for i in range(30):
        store.record("simulation", {**baseline, "temperature_c": 25 + i % 3 / 10})
        store.record("simulation", {**baseline, "device_id": "moulin-b", "temperature_c": 50})
    store.record("simulation", baseline)
    typical = client.get("/api/diagnostics").json()
    assert typical["status"] == "typical"
    assert typical["train_count"] == 20
    assert typical["calibration_count"] == 10
    store.record("simulation", {**baseline, "power_w": 1500})
    atypical = client.get("/api/diagnostics").json()
    assert atypical["status"] == "atypical"
    assert atypical["metric"] == "Puissance"
    assert atypical["baseline_count"] == 31
    assert client.get("/api/diagnostics?device=moulin-b").json()["baseline_count"] == 29
    assert client.get("/api/diagnostics?source=mqtt").json()["status"] == "insufficient"


@pytest.mark.parametrize(("pathway", "product"), [("pyrolysis", "biochar_kg"), ("codigestion", "biogas_m3")])
def test_alternative_pathways_conserve_mass_and_account_for_recovery(pathway, product):
    scenario = Scenario(pathway=pathway)
    result = simulate(scenario)
    outputs = ("oil_kg", "moisture_kg", "untreated_kg", "biochar_kg", "biogas_kg", "digestate_kg", "pyrolysis_coproducts_kg")
    assert sum(result[key] for key in outputs) == pytest.approx(scenario.olives_kg + result["cosubstrate_kg"])
    assert result[product] > 0
    assert result["pellets_kg"] == 0
    assert result["margin"] - simulate(Scenario(recovery_pct=0))["margin"] == pytest.approx(result["recovery_gain"])


def test_legacy_wokwi_message_distinguishes_reactor_and_biochar_qc(client):
    payload = b'{"bio":"PYRO","temp":480,"moist":24,"ph":8.2,"qc":"OK","heat":1}'
    app.state.mqtt.on_message(None, None, SimpleNamespace(retain=False, payload=payload))
    item, = client.get("/api/telemetry?source=mqtt").json()["readings"]
    assert item["pyrolysis_temp_c"] == 480
    assert item["biochar_ph"] == 8.2
    assert item["power_w"] is None
    assert item["temperature_c"] is None
