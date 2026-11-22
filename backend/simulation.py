from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OIL_DENSITY = 0.915


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    olives_kg: float = Field(1000, gt=0, le=100_000)
    extraction_pct: float = Field(18, ge=5, le=35)
    recovery_pct: float = Field(70, ge=0, le=100)
    oil_price: float = Field(16, ge=0, le=1000)
    pellets_price: float = Field(0.55, ge=0, le=100)
    olives_cost: float = Field(1.8, ge=0, le=100)
    processing_cost: float = Field(0.25, ge=0, le=100)
    recovery_cost: float = Field(0.20, ge=0, le=100)
    context: Literal["custom", "sfax", "kairouan", "siliana"] = "custom"
    pathway: Literal["pellets", "pyrolysis", "codigestion"] = "pellets"
    biochar_price: float = Field(1.35, ge=0, le=100)
    biogas_price: float = Field(0.75, ge=0, le=100)
    cosubstrate_pct: float = Field(25, gt=0, le=100)
    cosubstrate_cost: float = Field(0.05, ge=0, le=100)


def simulate(s: Scenario) -> dict:
    oil_kg = s.olives_kg * s.extraction_pct / 100
    oil_l = oil_kg / OIL_DENSITY
    pomace = s.olives_kg - oil_kg
    treated = pomace * s.recovery_pct / 100
    pellets = treated * 0.40 if s.pathway == "pellets" else 0
    biochar = treated * 0.40 * 0.30 if s.pathway == "pyrolysis" else 0
    cosubstrate = treated * s.cosubstrate_pct / 100 if s.pathway == "codigestion" else 0
    biogas = (treated + cosubstrate) * 0.08 if s.pathway == "codigestion" else 0
    gas_kg = biogas * 1.2
    digestate = treated + cosubstrate - gas_kg if s.pathway == "codigestion" else 0
    moisture = treated * 0.60 if s.pathway != "codigestion" else 0
    pyrolysis_coproducts = treated * 0.40 - biochar if s.pathway == "pyrolysis" else 0
    untreated = pomace - treated
    oil_revenue = oil_l * s.oil_price
    recovery_revenue = pellets * s.pellets_price + biochar * s.biochar_price + biogas * s.biogas_price
    recovery_cost = treated * s.recovery_cost + cosubstrate * s.cosubstrate_cost
    revenue = oil_revenue + recovery_revenue
    costs = s.olives_kg * (s.olives_cost + s.processing_cost) + recovery_cost
    return dict(oil_kg=oil_kg, oil_l=oil_l, pomace_kg=pomace, treated_kg=treated,
                pellets_kg=pellets, moisture_kg=moisture, untreated_kg=untreated,
                biochar_kg=biochar, biogas_m3=biogas, biogas_kg=gas_kg,
                digestate_kg=digestate, pyrolysis_coproducts_kg=pyrolysis_coproducts, cosubstrate_kg=cosubstrate,
                oil_revenue=oil_revenue, recovery_revenue=recovery_revenue,
                valuation_cost=recovery_cost, revenue=revenue, costs=costs, margin=revenue-costs,
                recovery_gain=recovery_revenue-recovery_cost)
