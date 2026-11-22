import { useEffect, useState } from 'react'
import { BrainCircuit, ChevronDown, Droplets, FlaskConical, History, Play, Pause, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, number, type Reading, type Scenario, type Source, type Telemetry } from './api'

const metrics = [
  { key: 'biochar_ph', name: 'pH du biochar', unit: '', icon: FlaskConical },
  { key: 'salt_index', name: 'Sel (indice simulé)', unit: '/ 100', icon: FlaskConical },
  { key: 'germination_pct', name: 'Germination', unit: '%', icon: FlaskConical },
  { key: 'filter_inlet_pollution', name: 'Pollution à l’entrée du filtre', unit: '/ 100', icon: Droplets },
  { key: 'filter_outlet_pollution', name: 'Pollution à la sortie du filtre', unit: '/ 100', icon: Droplets },
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
const wokwiProject = 'https://wokwi.com/projects/481333689027006465'
const stageNames: Record<string, string> = {
  SETTLING: 'Décantation', DILUTING: 'Dilution', FILTERING: 'Filtration',
}
const stageLabel = (stage?: string | null) => stage && stage !== '-' ? stageNames[stage] ?? stage : '—'
const equipmentState = (state?: number | null) => state == null ? '—' : state === 1 ? 'Actif' : 'Inactif'
const display = (value: number | null | undefined, unit: string) =>
  value == null ? '—' : number(value, 2) + (unit ? ' ' + unit : '')

type Metric = (typeof metrics)[number]

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
  const [source, setSource] = useState<Source>('mqtt')
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
  const isWokwiView = source === 'mqtt' && (!latest || legacy)
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
          <button aria-pressed={source === 'mqtt'} onClick={() => select('mqtt')}>Wokwi / ESP32</button>
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
      </div>
    </section>
    <div className="sensor-metrics">
      {metrics.map(metric => <MetricCard key={metric.key} metric={metric} readings={readings} />)}
    </div>
    {isWokwiView && <section className="card panel mt-4">
      <div className="panel-heading">
        <h2>Simulateur Zitori</h2>
        <a className="quiet" href={wokwiProject} target="_blank" rel="noreferrer">Ouvrir dans Wokwi</a>
      </div>
      {!latest && <p className="muted">Démarrez la simulation dans Wokwi pour recevoir les relevés de l’ESP32.</p>}
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><dt>Pyrolyse</dt><dd>{latest?.pyrolysis_stage ? phaseName(latest.pyrolysis_stage) : '—'}</dd></div>
        <div><dt>Traitement des margines</dt><dd>{stageLabel(latest?.filtration_stage)}</dd></div>
        <div><dt>Taux d’élimination</dt><dd>{display(latest?.removal_pct, '%')}</dd></div>
        <div><dt>Volume filtré</dt><dd>{display(latest?.filtered_volume, '')}</dd></div>
        <div><dt>Chauffage</dt><dd>{equipmentState(latest?.heater_on)}</dd></div>
        <div><dt>Ventilateur</dt><dd>{equipmentState(latest?.fan_on)}</dd></div>
        <div><dt>Pompe</dt><dd>{equipmentState(latest?.pump_on)}</dd></div>
        <div><dt>Alarme</dt><dd>{equipmentState(latest?.alarm_on)}</dd></div>
      </dl>
    </section>}
    <div className="sensor-actions">
      <details className="card panel sensor-history">
        <summary><History size={17} /> Historique des mesures <ChevronDown size={16} /></summary>
        {readings.length ? <div className="table-wrap mt-3"><table>
          <thead><tr><th>Reçu à (Tunis)</th><th>Lot à la réception</th>{legacy && <th>Phase</th>}{metrics.map(({ key, name }) => <th key={key}>{name}</th>)}</tr></thead>
          <tbody>{readings.slice().reverse().map(reading => <tr key={reading.id}>
            <td>{dateTime.format(new Date(reading.timestamp))}</td><td>{reading.scenario_id ? '#' + reading.scenario_id : 'Démo'}</td>
            {legacy && <td>{reading.pyrolysis_stage ? phaseName(reading.pyrolysis_stage) : '—'}</td>}
            {metrics.map(({ key, unit }) => <td key={key}>{display(reading[key], unit)}</td>)}
          </tr>)}</tbody>
        </table></div> : <p className="muted">Aucun relevé pour cette source.</p>}
      </details>
      <Link className="quiet" to={{ pathname: '/intelligence-artificielle', search: new URLSearchParams({ source, ...(device ? { device } : {}) }).toString(), hash: '#diagnostic' }}><BrainCircuit size={17} /> Diagnostic IA</Link>
    </div>
  </div>
}
