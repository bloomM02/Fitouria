import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, CircleDollarSign, Droplet, Factory, Leaf, Package, Pause, Play, RotateCcw } from 'lucide-react'
import { api, lotContexts, money, number, type Inputs, type Scenario } from './api'

const presets = {
  sfax: { olives_kg: 1000, extraction_pct: 18, recovery_pct: 70, pathway: 'pellets' },
  kairouan: { olives_kg: 750, extraction_pct: 16, recovery_pct: 80, pathway: 'pyrolysis' },
  siliana: { olives_kg: 500, extraction_pct: 20, recovery_pct: 65, pathway: 'codigestion' },
} as const

const fields = [
  ['olives_kg', 'Masse d’olives', 'kg', 0.01, 100000, 0.01],
  ['extraction_pct', 'Rendement d’extraction', '%', 5, 35, 0.1],
  ['recovery_pct', 'Grignon envoyé à la valorisation', '%', 0, 100, 1],
  ['oil_price', 'Prix de vente de l’huile', 'DT/L', 0, 1000, 0.01],
  ['pellets_price', 'Prix de vente des granulés', 'DT/kg', 0, 100, 0.01],
  ['olives_cost', 'Achat des olives', 'DT/kg d’olives', 0, 100, 0.01],
  ['processing_cost', 'Extraction', 'DT/kg d’olives', 0, 100, 0.01],
  ['recovery_cost', 'Valorisation', 'DT/kg traité', 0, 100, 0.01],
  ['biochar_price', 'Prix de vente du biochar', 'DT/kg', 0, 100, 0.01],
  ['biogas_price', 'Valeur du biogaz', 'DT/m³', 0, 100, 0.01],
  ['cosubstrate_pct', 'Cosubstrat par rapport au grignon traité', '%', 0.01, 100, 0.01],
  ['cosubstrate_cost', 'Coût du cosubstrat', 'DT/kg', 0, 100, 0.01],
] as const

const pathways = {
  pellets: { label: 'Granulation', product: 'Granulés', unit: 'kg', result: 'pellets_kg', price: 'pellets_price',
    process: 'Le séchage retire l’eau du grignon. La matière sèche est compactée en granulés.' },
  pyrolysis: { label: 'Pyrolyse', product: 'Biochar', unit: 'kg', result: 'biochar_kg', price: 'biochar_price',
    process: 'La pyrolyse du grignon séché produit du biochar, des gaz et des condensats.' },
  codigestion: { label: 'Co-digestion', product: 'Biogaz', unit: 'm³', result: 'biogas_m3', price: 'biogas_price',
    process: 'La digestion du grignon humide et du cosubstrat produit du biogaz et du digestat.' },
} as const

const stages = [
  { title: 'Réception', text: 'Les olives pesées alimentent le moulin. Cette masse constitue l’entrée du bilan matière.', icon: Leaf },
  { title: 'Extraction', text: 'Le rendement massique détermine la quantité d’huile extraite. Le reste constitue le grignon humide.', icon: Factory },
  { title: 'Valorisation', text: '', icon: Package },
  { title: 'Économie', text: 'Les ventes d’huile et la valorisation du grignon génèrent les recettes. La marge déduit les coûts d’achat, d’extraction et de traitement.', icon: CircleDollarSign },
]

function Batch({ initial, onSave }: { initial: Scenario; onSave: (scenario: Scenario) => void }) {
  const [draft, setDraft] = useState<Inputs>(initial.inputs)
  const [result, setResult] = useState(initial)
  const [stage, setStage] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = result.results
  const pathway = pathways[result.inputs.pathway]
  const product = number(data[pathway.result]) + ' ' + pathway.unit
  const stageValues = [number(result.inputs.olives_kg) + ' kg', number(data.oil_l) + ' L', product, money(data.margin)]
  const dirty = draft.context !== result.inputs.context || draft.pathway !== result.inputs.pathway ||
    fields.some(([key]) => draft[key] !== result.inputs[key])
  const Icon = stages[stage].icon
  const costFields = fields.filter(([key]) => key === pathways[draft.pathway].price ||
    ['oil_price', 'olives_cost', 'processing_cost', 'recovery_cost'].includes(key) ||
    (draft.pathway === 'codigestion' && key === 'cosubstrate_cost'))
  const batchFields = fields.filter(([key], index) => index < 3 ||
    (draft.pathway === 'codigestion' && key === 'cosubstrate_pct'))

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (stage === stages.length - 1) setPlaying(false)
      else setStage(stage + 1)
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [playing, stage])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const inputs = { ...draft }
      for (const [key] of fields) inputs[key] = result.inputs[key]
      for (const [key] of [...batchFields, ...costFields]) inputs[key] = draft[key]
      const next = await api<Scenario>('/scenarios', inputs)
      setDraft(next.inputs)
      setResult(next)
      onSave(next)
      setStage(0)
      setPlaying(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function field([key, label, unit, min, max, step]: typeof fields[number]) {
    return <label className="field" key={key}>
      <span>{label}</span>
      <span className="input-wrap"><input type="number" min={min} max={max} step={step} required
        value={Number.isFinite(draft[key]) ? draft[key] : ''}
        onChange={e => setDraft({ ...draft, [key]: e.currentTarget.valueAsNumber })} /><small>{unit}</small></span>
    </label>
  }

  return <div className="simulation-grid">
    <form className="card panel" onSubmit={submit}>
      <h2>Paramètres du lot</h2>
      <label className="field mb-3"><span>Scénario tunisien</span><span className="select-wrap">
        <select value={draft.context} onChange={e => {
          const context = e.target.value as Inputs['context']
          setDraft(current => context === 'custom' ? { ...current, context } :
            { ...current, ...presets[context], context })
        }}>
          {Object.entries(lotContexts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select><ChevronDown size={16} />
      </span></label>
      <p className="muted mb-3 text-sm">Les valeurs préremplies sont des hypothèses de démonstration.</p>
      <div className="grid gap-3">{batchFields.slice(0, 3).map(field)}
        <label className="field"><span>Filière de valorisation</span><span className="select-wrap">
          <select value={draft.pathway} onChange={e => setDraft({ ...draft, pathway: e.target.value as Inputs['pathway'] })}>
            {Object.entries(pathways).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select><ChevronDown size={16} />
        </span></label>
        {batchFields.slice(3).map(field)}
      </div>
      <details className="settings"><summary>Prix et coûts</summary><div className="mt-3 grid gap-3">
        {costFields.map(field)}
      </div></details>
      <button className="button w-full" disabled={busy}><Play size={17} />{busy ? 'Calcul en cours…' : 'Calculer et animer'}</button>
      <button type="button" className="quiet w-full mt-2" disabled={!dirty || busy} onClick={() => setDraft(result.inputs)}><RotateCcw size={15} /> Rétablir le dernier calcul</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <div className="grid gap-4 min-w-0">
      <section className="card panel">
        <div className="panel-heading"><div><h2>Chaîne de transformation</h2><p>{result.id ? 'Lot #' + result.id : 'Lot de démonstration'}{result.inputs.context !== 'custom' && ' · ' + lotContexts[result.inputs.context]}</p></div>
          <button className="quiet" onClick={() => { if (!playing && stage === 3) setStage(0); setPlaying(!playing) }}>
            {playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pause' : stage === 3 ? 'Rejouer' : 'Animer'}
          </button>
        </div>
        <div className="flow">
          {stages.map(({ title, icon: StepIcon }, i) => <button key={title} type="button" aria-pressed={i === stage}
            onClick={() => { setPlaying(false); setStage(i) }}>
            <StepIcon size={22} /><span>{title}</span>
          </button>)}
        </div>
        <div className="stage" key={stage} aria-live={playing ? 'off' : 'polite'}>
          <span className="stage-icon"><Icon size={30} /></span>
          <div><h3>{stage === 2 ? pathway.label : stages[stage].title}</h3><p>{stage === 2 ? pathway.process : stages[stage].text}</p></div><strong>{stageValues[stage]}</strong>
        </div>
      </section>
      <section className="card panel">
        <div className="panel-heading"><h2>Bilan du lot</h2>{dirty && <span className="tag">Modifications à calculer</span>}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="stat"><Droplet size={18} /><span>Huile d’olive</span><strong>{number(data.oil_l)} L</strong></div>
          <div className="stat"><Package size={18} /><span>{pathway.product}</span><strong>{product}</strong></div>
          <div className="stat emphasis"><CircleDollarSign size={18} /><span>Marge estimée</span><strong>{money(data.margin)}</strong></div>
        </div>
        <dl className="ledger">
          <div><dt>Recettes de l’huile</dt><dd>{money(data.oil_revenue)}</dd></div>
          <div><dt>Recettes de valorisation</dt><dd>{money(data.recovery_revenue)}</dd></div>
          <div><dt>Coûts totaux</dt><dd>{money(data.costs)}</dd></div>
          <div><dt>Gain net de valorisation</dt><dd>{money(data.recovery_gain)}</dd></div>
        </dl>
        <details className="settings"><summary>Bilan matière et hypothèses</summary>
          <p className="mt-3 muted">Huile {number(data.oil_kg, 2)} kg · Grignon humide {number(data.pomace_kg, 2)} kg, dont {number(data.treated_kg, 2)} kg traités. Après séchage, {number(data.moisture_kg, 2)} kg d’eau retirée et {number(data.untreated_kg, 2)} kg de grignon non traité.</p>
          {result.inputs.pathway === 'pyrolysis' && <p className="muted">{number(data.pyrolysis_coproducts_kg)} kg de gaz et condensats.</p>}
          {result.inputs.pathway === 'codigestion' && <p className="muted">{number(data.cosubstrate_kg)} kg de cosubstrat ajouté et {number(data.digestate_kg)} kg de digestat.</p>}
          <p className="muted">Hypothèses pédagogiques. Densité de l’huile de 0,915 kg/L. Le grignon séché conserve 40 % de sa masse et la pyrolyse transforme 30 % de cette masse sèche en biochar. La co-digestion fournit 0,08 m³ de biogaz par kg de mélange.</p>
        </details>
      </section>
    </div>
  </div>
}

export function Simulation({ scenario, onSave }: { scenario: Scenario | null; onSave: (scenario: Scenario) => void }) {
  return <>
    <div className="page-head"><h1>Simulation</h1><p>Transformez un lot d’olives et calculez la valeur de ses produits.</p></div>
    <section className="card panel mb-5">
      <h2>Prix observé de l’huile d’olive</h2>
      <p><strong>12,600 DT/L</strong> pour l’huile d’olive en vrac. Prix moyen de détail à Tunis en juillet 2026.</p>
      <p className="muted mt-2">La marge réelle nécessite le prix de vente de l’huilerie, ses coûts et ses quantités mesurées.
        <a className="text-link" href="https://www.ins.tn/sites/default/files-ftp3/files/publication/pdf/bms%20Juillet%202026_3.pdf"
          target="_blank" rel="noreferrer">INS, tableau 9.1</a>
      </p>
    </section>
    <details className="card panel mb-5">
      <summary>Calculateur pédagogique · hypothèses modifiables</summary>
      <div className="mt-4">{scenario ? <Batch initial={scenario} onSave={onSave} /> : <p>Chargement du scénario…</p>}</div>
    </details>
  </>
}
