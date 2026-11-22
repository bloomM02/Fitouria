export type Inputs = {
  context: 'custom' | 'sfax' | 'kairouan' | 'siliana'
  olives_kg: number
  extraction_pct: number
  recovery_pct: number
  oil_price: number
  pellets_price: number
  olives_cost: number
  processing_cost: number
  recovery_cost: number
  pathway: 'pellets' | 'pyrolysis' | 'codigestion'
  biochar_price: number
  biogas_price: number
  cosubstrate_pct: number
  cosubstrate_cost: number
}

export const lotContexts = {
  custom: 'Lot personnalisé',
  sfax: 'Sfax · Chemlali',
  kairouan: 'Kairouan · Chemlali',
  siliana: 'Siliana · Chemcheli',
} as const

export type Results = {
  oil_kg: number
  oil_l: number
  pomace_kg: number
  treated_kg: number
  pellets_kg: number
  moisture_kg: number
  untreated_kg: number
  oil_revenue: number
  recovery_revenue: number
  revenue: number
  costs: number
  margin: number
  recovery_gain: number
  biochar_kg: number
  biogas_m3: number
  digestate_kg: number
  pyrolysis_coproducts_kg: number
  cosubstrate_kg: number
}

export type Scenario = { id: number | null; created_at: string | null; inputs: Inputs; results: Results }
export type Source = 'simulation' | 'mqtt'
export type Reading = {
  id: number; timestamp: string; scenario_id: number | null; device_id: string
  temperature_c: number | null; humidity_pct: number | null; power_w: number | null; source: Source
  pyrolysis_temp_c?: number; substrate_moisture_pct?: number; biochar_ph?: number | null; pyrolysis_stage?: string
  filtration_stage?: string | null
  salt_index?: number | null; germination_pct?: number | null
  filter_inlet_pollution?: number | null; filter_outlet_pollution?: number | null
  removal_pct?: number | null; filtered_volume?: number | null
  heater_on?: number | null; fan_on?: number | null; pump_on?: number | null; alarm_on?: number | null
}
export type Telemetry = { readings: Reading[]; mqtt: string }

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api' + path, {
      signal,
      ...(body === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Connexion à FastAPI impossible. Vérifiez que le backend est démarré.')
  }
  const content = await response.json().catch(() => null)
  if (!response.ok || content === null) {
    const detail = content?.detail
    throw new Error(typeof detail === 'string' ? detail :
      Array.isArray(detail) ? 'Vérifiez les valeurs saisies et leurs limites.' :
        'Le service a renvoyé une réponse indisponible.')
  }
  return content as T
}

export function number(value: number, digits = 1) {
  return new Intl.NumberFormat('fr-TN', { maximumFractionDigits: digits }).format(value)
}

export function money(value: number) {
  return number(value, 2) + ' DT'
}
