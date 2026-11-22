import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { Activity, BrainCircuit, FlaskConical, House, Leaf, Radio, Sprout } from 'lucide-react'
import { api, lotContexts, money, number, type Scenario } from './api'
import { Simulation } from './simulation'
import { Sensors } from './sensors'
import { Intelligence } from './intelligence'
import './styles.css'

const pages = [
  { path: '/', title: 'Accueil', icon: House },
  { path: '/simulation', title: 'Simulation', icon: FlaskConical, description: 'Suivez la transformation des olives et mesurez la rentabilité de la valorisation.' },
  { path: '/capteurs', title: 'Capteurs IoT', icon: Radio, description: 'Observez les mesures du moulin en mode simulé ou via un ESP32 connecté.' },
  { path: '/intelligence-artificielle', title: 'Intelligence artificielle', icon: BrainCircuit, description: 'Comparez les débouchés du grignon et analysez les écarts dans les relevés du moulin.' },
]

function Home({ scenario }: { scenario: Scenario | null }) {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-kicker"><Sprout size={17} /> Laboratoire oléicole tunisien</div>
        <h1>De l’olive à<br /> <em>la valeur.</em></h1>
        <p>Explorez la chaîne de transformation des olives, de l’extraction de l’huile à la valorisation du grignon.</p>
        <Link className="button button-light" to="/simulation"><FlaskConical size={18} /> Lancer une simulation</Link>
      </div>
      <div className="hero-image" role="img" aria-label="Olives vertes sur leur branche" />
    </section>
    {scenario && <section className="snapshot" aria-label="Scénario actif">
      <div><span className="eyebrow">Scénario actif</span><strong>{scenario.inputs.context !== 'custom' ? lotContexts[scenario.inputs.context] : scenario.id ? 'Lot #' + scenario.id : 'Lot de démonstration'}</strong></div>
      <div><span>Olives traitées</span><strong>{number(scenario.inputs.olives_kg)} kg</strong></div>
      <div><span>Huile produite</span><strong>{number(scenario.results.oil_l)} L</strong></div>
      <div><span>Marge estimée</span><strong>{money(scenario.results.margin)}</strong></div>
    </section>}
    <section className="mt-11">
      <h2 className="section-title">Explorer le laboratoire</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {pages.slice(1).map(({ path, title, icon: Icon, description }) =>
          <Link to={path} className="module card" key={path}>
            <span className="icon-tile"><Icon size={22} /></span>
            <h3>{title}</h3><p>{description}</p>
          </Link>)}
      </div>
    </section>
  </>
}

function App() {
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [error, setError] = useState('')
  const location = useLocation()
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const latest = await api<Scenario>('/scenarios/latest', undefined, signal)
      setScenario(latest)
      setError('')
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh, location.pathname])
  useEffect(() => {
    document.title = (pages.find(page => page.path === location.pathname)?.title ?? 'Accueil') + ' · Fitouria'
    window.scrollTo(0, 0)
  }, [location.pathname])

  return <div className="flex min-h-screen flex-col">
    <header className="topbar"><div className="shell nav-shell">
      <Link to="/" className="brand" aria-label="Fitouria, accueil"><span><Leaf size={21} /></span>Fitouria</Link>
      <nav aria-label="Navigation principale">
        {pages.map(({ path, title, icon: Icon }) => <NavLink end to={path} key={path}><Icon size={16} />{title}</NavLink>)}
      </nav>
    </div></header>
    <main className="shell grow py-8 md:py-11">
      {error && <div className="error mb-5" role="alert">{error} <button className="text-link" onClick={() => void refresh()}>Réessayer</button></div>}
      <Routes>
        <Route path="/" element={<Home scenario={scenario} />} />
        <Route path="/simulation" element={<Simulation scenario={scenario} onSave={setScenario} />} />
        <Route path="/capteurs" element={<Sensors scenario={scenario} />} />
        <Route path="/intelligence-artificielle" element={<Intelligence scenario={scenario} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
    <footer><div className="shell footer-inner"><span><Leaf size={17} /> Fitouria</span><span><Activity size={16} /> Prototype universitaire · Filière oléicole</span></div></footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>)
