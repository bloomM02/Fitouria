from math import dist
from statistics import median

MIN_TRAIN = 20
CALIBRATION_COUNT = 10
MILL = {"temperature_c": ("Température", 0.1), "humidity_pct": ("Humidité", 0.1), "power_w": ("Puissance", 1)}
REACTOR = {"pyrolysis_temp_c": ("Température du réacteur", 1), "substrate_moisture_pct": ("Humidité du grignon", 0.1)}


def diagnose(readings: list[dict]) -> dict:
    if not readings:
        return dict(status="insufficient", baseline_count=0, required=MIN_TRAIN + CALIBRATION_COUNT + 1)

    latest = readings[-1]
    stage = latest.get("pyrolysis_stage")
    metrics = REACTOR if stage is not None else MILL
    comparable = [
        row for row in readings
        if row["device_id"] == latest["device_id"] and row.get("pyrolysis_stage") == stage
        and all(row.get(key) is not None for key in metrics)
    ]
    metadata = dict(baseline_count=max(0, len(comparable) - 1), required=MIN_TRAIN + CALIBRATION_COUNT + 1,
                    device=latest["device_id"], timestamp=latest["timestamp"], phase=stage)
    if len(comparable) < metadata["required"] or comparable[-1]["id"] != latest["id"]:
        return dict(status="insufficient", **metadata)

    training = comparable[:-CALIBRATION_COUNT - 1]
    calibration = comparable[-CALIBRATION_COUNT - 1:-1]
    centers = {key: median(row[key] for row in training) for key in metrics}
    scales = {
        key: max(floor, 1.4826 * median(abs(row[key] - centers[key]) for row in training))
        for key, (_, floor) in metrics.items()
    }

    def vector(row):
        return tuple((row[key] - centers[key]) / scales[key] for key in metrics)

    reference = [vector(row) for row in training]

    def nearest_score(point):
        return sorted(dist(point, other) for other in reference)[2]

    threshold = max(3.0, max(nearest_score(vector(row)) for row in calibration))
    point = vector(latest)
    score = nearest_score(point)
    neighbor = min(reference, key=lambda other: dist(point, other))
    deviations = sorted(zip(metrics, point, neighbor), key=lambda item: abs(item[1] - item[2]), reverse=True)
    return dict(status="atypical" if score > threshold else "typical", score=score, threshold=threshold,
                train_count=len(training), calibration_count=len(calibration),
                metric=metrics[deviations[0][0]][0], **metadata)
