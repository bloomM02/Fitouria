from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from .simulation import Scenario, simulate

PRODUCTS = {
    "pellets": ("Granulés", "kg", "pellets_kg", "pellets_price"),
    "pyrolysis": ("Biochar", "kg", "biochar_kg", "biochar_price"),
    "codigestion": ("Biogaz", "m³", "biogas_m3", "biogas_price"),
}


UnitCost = Annotated[float, Field(ge=0, le=100)]


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    scenario: Scenario
    pellets_cost: UnitCost
    pyrolysis_cost: UnitCost
    codigestion_cost: UnitCost


def compare(request: ComparisonRequest) -> list[dict]:
    scenario = request.scenario
    options = []
    for pathway, (product, unit, quantity_key, price_key) in PRODUCTS.items():
        unit_cost = getattr(request, pathway + "_cost")
        result = simulate(scenario.model_copy(update={"pathway": pathway, "recovery_cost": unit_cost}))
        quantity = result[quantity_key]
        cost = result["valuation_cost"]
        options.append(dict(pathway=pathway, product=product, unit=unit,
                            quantity=quantity, price=getattr(scenario, price_key),
                            revenue=result["recovery_revenue"], cost=cost,
                            gain=result["recovery_gain"], margin=result["margin"],
                            break_even=cost / quantity if quantity else None))
    return sorted(options, key=lambda option: option["margin"], reverse=True)
