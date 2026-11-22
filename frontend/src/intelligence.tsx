import { useEffect, useState, type FormEvent } from 'react'
import { BrainCircuit, Calculator, Radio } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api, lotContexts, money, number, type Scenario, type Source } from './api'

type Option = {
  pathway: 'pellets' | 'pyrolysis' | 'codigestion'
  product: string; unit: string; quantity: number; price: number
  revenue: number; cost: number; gain: number; margin: number; break_even: number | null
}
type Diagnostic = {
  status: 'insufficient' | 'typical' | 'atypical'
  baseline_count: number; required: number; train_count?: number; calibration_count?: number
  device?: string; phase?: string | null; metric?: string; timestamp?: string
}

const labels = { pellets: 'Granulation', pyrolysis: 'Pyrolyse', codigestion: 'Co-digestion' }
const prices = [
  ['pellets_price', 'Granulés', 'DT/kg'],
  ['biochar_price', 'Biochar', 'DT/kg'],
  ['biogas_price', 'Biogaz', 'DT/m³'],
] as const
const costKeys = ['pellets_cost', 'pyrolysis_cost', 'codigestion_cost'] as const
const time = new Intl.DateTimeFormat('fr-TN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Tunis' })

function Comparison({ scenario }: { scenario: Scenario }) {
  const [draft, setDraft] = useState(scenario.inputs)
  const [costs, setCosts] = useState({
    pellets_cost: scenario.inputs.recovery_cost,
    pyrolysis_cost: scenario.inputs.recovery_cost,
    codigestion_cost: scenario.inputs.recovery_cost,
  })
  const [options, setOptions] = useState<Option[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setOptions((await api<{ options: Option[] }>('/comparison', { scenario: draft, ...costs })).options)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const best = options?.[0]
  const leaders = options?.filter(option => Math.round(option.margin * 100) === Math.round((best?.margin ?? 0) * 100)) ?? []
  return <section className="card panel">
    <div className="panel-heading"><div><h2>Quelle filière valorise le mieux le grignon ?</h2>
      <p>{scenario.inputs.context !== 'custom' ? lotContexts[scenario.inputs.context] : 'Lot personnalisé'} · {number(scenario.inputs.olives_kg)} kg d’olives · {number(scenario.results.treated_kg)} kg de grignon à traiter</p>
    </div><span className="icon-tile"><Calculator size={20} /></span></div>
    <form onSubmit={run}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
        {prices.map(([key, label, unit], index) => <div className="grid gap-2" key={key}><label className="field">
          <span>Prix de vente · {label}</span><span className="input-wrap">
            <input type="number" min={0} max={100} step="0.01" required value={Number.isFinite(draft[key]) ? draft[key] : ''}
              onChange={e => { setDraft({ ...draft, [key]: e.currentTarget.valueAsNumber }); setOptions(null) }} />
            <small>{unit}</small>
          </span>
        </label>
          <label className="field"><span>Traitement · {label}</span><span className="input-wrap">
            <input type="number" min={0} max={100} step="0.01" required value={Number.isFinite(costs[costKeys[index]]) ? costs[costKeys[index]] : ''}
              onChange={e => { setCosts({ ...costs, [costKeys[index]]: e.currentTarget.valueAsNumber }); setOptions(null) }} />
            <small>DT/kg de grignon</small>
          </span></label>
        </div>)}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="button" disabled={busy}><Calculator size={17} />{busy ? 'Calcul en cours…' : 'Comparer les filières'}</button>
        <Link to="/simulation" className="quiet">Modifier le lot et les coûts</Link>
      </div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {options && best && <div className="mt-5" aria-live="polite">
      <p className="stat emphasis">{best.quantity === 0 ? 'Le lot ne valorise aucun grignon avec les paramètres actuels.'
        : best.gain < 0 ? 'Les trois filières coûtent plus qu’elles ne rapportent avec ces hypothèses.'
        : leaders.length > 1 ? 'Meilleure marge à égalité · ' + leaders.map(option => labels[option.pathway]).join(', ')
        : 'Meilleure marge estimée · ' + labels[best.pathway] + ' (' + money(best.margin) + ')'}</p>
      <div className="table-wrap mt-3"><table>
        <thead><tr><th>Filière</th><th>Produit</th><th>Coût de valorisation</th><th>Gain net</th><th>Marge du lot</th><th>Prix d’équilibre</th></tr></thead>
        <tbody>{options.map(option => <tr key={option.pathway}>
          <th scope="row">{labels[option.pathway]}</th><td>{number(option.quantity)} {option.unit} · {option.product}</td>
          <td>{money(option.cost)}</td><td>{money(option.gain)}</td><td>{money(option.margin)}</td>
          <td>{option.break_even == null ? '—' : number(option.break_even, 3) + ' DT/' + option.unit}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="muted mt-3">Le prix d’équilibre couvre les seuls coûts de valorisation. Le gain net compare chaque filière au scénario sans traitement du grignon. Les prix saisis ici servent à cette comparaison.</p>
    </div>}
  </section>
}

function Diagnostics() {
  const { search } = useLocation()
  const query = new URLSearchParams(search)
  const initialSource = query.get('source') === 'mqtt' ? 'mqtt' : 'simulation'
  const [source, setSource] = useState<Source>(initialSource)
  const requestedDevice = source === initialSource ? query.get('device') : null
  const [data, setData] = useState<Diagnostic | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ source })
    if (requestedDevice) params.set('device', requestedDevice)
    api<Diagnostic>('/diagnostics?' + params, undefined, controller.signal)
      .then(result => { setData(result); setError('') })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [source, requestedDevice, refresh])

  return <section className="card panel" id="diagnostic">
    <div className="panel-heading"><div><h2>IA · Relevés inhabituels</h2>
      <p>Comparez la dernière mesure à l’historique du même appareil et, pour le réacteur, de la même phase.</p>
    </div><span className="icon-tile"><BrainCircuit size={20} /></span></div>
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <div className="segment" role="group" aria-label="Source du diagnostic">
        {(['simulation', 'mqtt'] as const).map(mode => <button key={mode} aria-pressed={source === mode} onClick={() => {
          if (source !== mode) { setData(null); setError(''); setSource(mode) }
        }}>{mode === 'simulation' ? 'Simulation' : 'MQTT / ESP32'}</button>)}
      </div>
      <button className="quiet" onClick={() => setRefresh(current => current + 1)}><Radio size={16} /> Actualiser l’analyse</button>
      <Link className="quiet" to="/capteurs">Ouvrir les capteurs</Link>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : <div aria-live="polite">
      {source === 'simulation' && <p className="muted mb-2">Démonstration sur mesures synthétiques générées dans Capteurs IoT.</p>}
      {data?.status === 'insufficient' && <p className="stat">{data.baseline_count + (data.device ? 1 : 0)} / {data.required} relevés comparables. L’analyse sera disponible quand l’historique sera suffisant.</p>}
      {data?.status === 'typical' && <p className="stat emphasis">Dernier relevé comparable à l’historique.</p>}
      {data?.status === 'atypical' && <p className="error">Dernier relevé inhabituel. Vérifier en priorité {data.metric?.toLowerCase()} et les conditions du procédé.</p>}
      {data?.timestamp && <p className="muted mt-2">{data.device} · {time.format(new Date(data.timestamp))} (Tunis){data.phase && ' · ' + data.phase}
        {data.train_count && ' · ' + data.train_count + ' mesures d’apprentissage et ' + data.calibration_count + ' de calibration'}</p>}
      {!data && <p className="muted">Analyse en cours…</p>}
    </div>}
  </section>
}

export function Intelligence({ scenario }: { scenario: Scenario | null }) {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash !== '#diagnostic') return
    const frame = window.requestAnimationFrame(() => document.getElementById('diagnostic')?.scrollIntoView())
    return () => window.cancelAnimationFrame(frame)
  }, [hash])
  return <>
    <div className="page-head"><h1>Intelligence artificielle</h1><p>Choisissez un débouché pour le grignon et surveillez les relevés de votre moulin.</p></div>
    <div className="grid gap-4">
      {scenario && <Comparison key={scenario.id ?? 'demo'} scenario={scenario} />}
      <Diagnostics />
    </div>
  </>
}
