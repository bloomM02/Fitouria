import { useEffect, useState } from 'react'
import { BrainCircuit, ChevronDown, Droplets, FlaskConical, History, Play, Pause, Radio, Thermometer, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, number, type Reading, type Scenario, type Source, type Telemetry } from './api'

const metrics = [
  { key: 'temperature_c', name: 'Température de l’air', unit: '°C', icon: Thermometer },
  { key: 'humidity_pct', name: 'Humidité de l’air', unit: '%', icon: Droplets },
  { key: 'power_w', name: 'Puissance électrique', unit: 'W', icon: Zap },
] as const
const pyrolysisMetrics = [
  { key: 'pyrolysis_temp_c', name: 'Température du réacteur', unit: '°C', icon: Thermometer },
  { key: 'substrate_moisture_pct', name: 'Humidité du grignon', unit: '%', icon: Droplets },
  { key: 'biochar_ph', name: 'pH du biochar', unit: '', icon: FlaskConical },
] as const

const statuses: Record<string, string> = {
  online: 'MQTT connecté', offline: 'MQTT hors ligne', connecting: 'Connexion MQTT…', disabled: 'MQTT non configuré',
}
const time = new Intl.DateTimeFormat('fr-TN', { timeStyle: 'medium', hourCycle: 'h23', timeZone: 'Africa/Tunis' })
const dateTime = new Intl.DateTimeFormat('fr-TN', { dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23', timeZone: 'Africa/Tunis' })
const phases: Record<string, string> = {
  DRYING: 'Séchage', PYROLYSIS: 'Pyrolyse', COOLING: 'Refroidissement', SIEVING: 'Tamisage',
  QUALITY_CHECK: 'Contrôle qualité', READY: 'Lot prêt', REJECTED: 'Lot rejeté',
}
const phaseName = (phase: string) => phases[phase] ?? phase
const display = (value: number | null | undefined, unit: string) =>
  value == null ? '—' : number(value, 2) + (unit ? ' ' + unit : '')

type Metric = (typeof metrics | typeof pyrolysisMetrics)[number]

function MetricCard({ metric, readings }: { metric: Metric; readings: Reading[] }) {
  const { key, name, unit, icon: Icon } = metric
  const points = readings.flatMap(reading => {
    const value = reading[key]
    return typeof value === 'number' ? [{ value, timestamp: Date.parse(reading.timestamp) }] : []
  })
  const min = Math.min(...points.map(point => point.value))
  const range = Math.max(...points.map(point => point.value)) - min
  const start = points[0]?.timestamp ?? 0
  const duration = (points.at(-1)?.timestamp ?? start) - start
  const trend = duration > 0 ? points.map(point => [
    (point.timestamp - start) / duration * 320,
    range === 0 ? 30 : 48 - (point.value - min) / range * 36,
  ].join(',')).join(' ') : '0,30 320,30'

  return <section className="card panel metric-card">
    <div className="panel-heading"><span className="icon-tile"><Icon size={20} /></span><h2>{name}</h2></div>
    <strong className="metric-current">{display(readings.at(-1)?.[key], unit)}</strong>
    {points.length === 0 ? <p className="muted text-sm">En attente de mesure</p> :
      <svg className="metric-track" viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={trend + ' 320,60 0,60'} />
        <polyline points={trend} vectorEffect="non-scaling-stroke" />
      </svg>}
  </section>
}

export function Sensors({ scenario }: { scenario: Scenario | null }) {
  const [source, setSource] = useState<Source>('simulation')
  const [running, setRunning] = useState(true)
  const [data, setData] = useState<(Telemetry & { source: Source }) | null>(null)
  const [error, setError] = useState('')
  const [selectedDevice, setSelectedDevice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let timer: number
    const sampling = source === 'simulation' && running
    async function poll() {
      try {
        const next = sampling
          ? await api<Telemetry>('/telemetry/simulate', {}, controller.signal)
          : await api<Telemetry>('/telemetry?source=' + source, undefined, controller.signal)
        setData({ ...next, source })
        setError('')
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message)
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [source, running])

  const allReadings = data?.source === source ? data.readings : []
  const devices = Array.from(new Set(allReadings.map(reading => reading.device_id)))
  const device = devices.includes(selectedDevice) ? selectedDevice : allReadings.at(-1)?.device_id
  const readings = allReadings.filter(reading => reading.device_id === device).slice(-24)
  const latest = readings.at(-1)
  const legacy = latest?.pyrolysis_stage !== undefined
  const activeMetrics = legacy ? pyrolysisMetrics : metrics
  function select(mode: Source) {
    setError('')
    if (mode !== source) setSelectedDevice('')
    setSource(mode)
  }

  return <div className="sensor-dashboard">
    <section className="sensor-header">
      <div className="sensor-header-main">
        <h1>Capteurs IoT</h1>
        <span className="sensor-source"><Radio size={16} />{source === 'simulation' ? 'Moulin simulé' : statuses[data?.mqtt ?? 'connecting']}</span>
      </div>
      <div className="sensor-toolbar">
        <div className="segment" role="group" aria-label="Source des mesures">
          <button aria-pressed={source === 'simulation'} onClick={() => select('simulation')}>Simulation</button>
          <button aria-pressed={source === 'mqtt'} onClick={() => select('mqtt')}>MQTT / ESP32</button>
        </div>
        {source === 'simulation' && <button className="quiet sensor-pause" onClick={() => setRunning(!running)}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? 'Pause' : 'Reprendre'}</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="sensor-context">
        {source === 'mqtt' && devices.length > 0 && <label className="field"><span>Appareil affiché</span><span className="select-wrap">
          <select value={device} onChange={e => setSelectedDevice(e.target.value)}>
            {devices.map(item => <option key={item} value={item}>{item}</option>)}
          </select><ChevronDown size={16} />
        </span></label>}
        <span>{scenario?.id ? 'Lot #' + scenario.id : 'Lot de démonstration'}</span>
        <span>{latest ? 'Relevé à ' + time.format(new Date(latest.timestamp)) + ' (Tunis)' : 'En attente de relevés'}</span>
        {latest?.pyrolysis_stage && <span>{phaseName(latest.pyrolysis_stage)}</span>}
      </div>
    </section>
    <div className="sensor-metrics">
      {activeMetrics.map(metric => <MetricCard key={metric.key} metric={metric} readings={readings} />)}
    </div>
    <div className="sensor-actions">
      <details className="card panel sensor-history">
        <summary><History size={17} /> Historique des mesures <ChevronDown size={16} /></summary>
        {readings.length ? <div className="table-wrap mt-3"><table>
          <thead><tr><th>Reçu à (Tunis)</th><th>Lot à la réception</th>{legacy && <th>Phase</th>}{activeMetrics.map(({ key, name }) => <th key={key}>{name}</th>)}</tr></thead>
          <tbody>{readings.slice().reverse().map(reading => <tr key={reading.id}>
            <td>{dateTime.format(new Date(reading.timestamp))}</td><td>{reading.scenario_id ? '#' + reading.scenario_id : 'Démo'}</td>
            {legacy && <td>{reading.pyrolysis_stage ? phaseName(reading.pyrolysis_stage) : '—'}</td>}
            {activeMetrics.map(({ key, unit }) => <td key={key}>{display(reading[key], unit)}</td>)}
          </tr>)}</tbody>
        </table></div> : <p className="muted">Aucun relevé pour cette source.</p>}
      </details>
      <Link className="quiet" to={{ pathname: '/intelligence-artificielle', search: new URLSearchParams({ source, ...(device ? { device } : {}) }).toString(), hash: '#diagnostic' }}><BrainCircuit size={17} /> Diagnostic IA</Link>
    </div>
  </div>
}
