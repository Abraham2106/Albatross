import { useEffect, useState } from 'react';
import Clientes from './screens/Clientes.jsx';
import Ficha from './screens/Ficha.jsx';
import Captura from './screens/Captura.jsx';
import ResumenPantalla from './screens/Resumen.jsx';
import Mapa from './screens/Mapa.jsx';
import { Lista, Micro, Grafico, Globo, Sol, Luna } from './components/Iconos.jsx';

const SECCIONES = [
  { id: 'clientes', testid: 'cib-nav-hospitales', etq: 'Hospitales', Icono: Lista },
  { id: 'captura', testid: 'cib-nav-captura', etq: 'Capturar', Icono: Micro },
  { id: 'mapa', testid: undefined, etq: 'Cobertura', Icono: Globo },
  { id: 'resumen', testid: undefined, etq: 'Panorama', Icono: Grafico },
];

const TEMA_KEY = 'philips-tema';

function temaInicial() {
  try {
    const saved = localStorage.getItem(TEMA_KEY);
    if (saved === 'claro' || saved === 'oscuro') return saved;
  } catch { /* private mode */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  document.documentElement.style.colorScheme = tema === 'claro' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'claro' ? '#e8eef1' : '#0c1114');
}

aplicarTema(temaInicial());

export default function App() {
  const [tab, setTab] = useState('clientes');
  const [clienteId, setClienteId] = useState(null);
  const [volverA, setVolverA] = useState('clientes');
  const [estado, setEstado] = useState('Sin conexión · en el dispositivo');
  const [tema, setTema] = useState(temaInicial);
  const [version, setVersion] = useState(0);
  const [guardado, setGuardado] = useState(null);
  const [visita, setVisita] = useState(null);

  useEffect(() => {
    aplicarTema(tema);
    try { localStorage.setItem(TEMA_KEY, tema); } catch { /* ignore */ }
  }, [tema]);

  function abrirCliente(id, desde) {
    setVolverA(desde || tab);
    setGuardado(null);
    setClienteId(id);
  }

  function ir(destino) {
    setClienteId(null);
    setGuardado(null);
    setVisita(null);
    setTab(destino);
  }

  function registrarVisita(ficha) {
    ir('captura');
    setVisita(ficha);
  }

  function alGuardar({ clienteId: id, antes }) {
    setVersion((v) => v + 1);
    setGuardado({ clienteId: id, antes });
    setVisita(null);
    setTab('clientes');
    setClienteId(id);
  }

  const antes = guardado?.clienteId === clienteId ? guardado.antes : undefined;

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || !clienteId) return;
      if (e.target.closest('input, textarea, select')) return;
      setClienteId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clienteId]);

  const fichaAparte = (tab === 'mapa' || tab === 'resumen') && clienteId;

  return (
    <div className="app">
      <nav className="rail" aria-label="Secciones">
        <div className="marca">
          <span className="marca-sigla" aria-hidden="true">IB</span>
          <div className="marca-texto">
            <strong>Base instalada</strong>
            <span>En el dispositivo</span>
          </div>
        </div>
        {SECCIONES.map(({ id, testid, etq, Icono }) => {
          const activo = id === 'clientes' ? tab === 'clientes' : tab === id && !clienteId;
          return (
            <button
              key={id}
              type="button"
              data-testid={testid}
              data-activo={activo}
              aria-current={activo ? 'page' : undefined}
              onClick={() => ir(id)}
            >
              <Icono />
              <span className="nav-etq">{etq}</span>
            </button>
          );
        })}
        <div className="rail-pie">
          <button
            type="button"
            data-testid="cib-tema"
            title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-pressed={tema === 'oscuro'}
            aria-label={tema === 'oscuro' ? 'Activar modo claro' : 'Activar modo oscuro'}
            onClick={() => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'))}
          >
            {tema === 'oscuro' ? <Sol /> : <Luna />}
            <span className="nav-etq">{tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
        </div>
      </nav>

      <div className="columna">
        <main className="workspace" id="principal">
          <div className={'vista' + (tab === 'clientes' ? ' vista-on' : '')}>
            <div className={'reparto' + (clienteId ? ' reparto-abierto' : '')}>
              <div className="reparto-lista">
                <Clientes
                  key={version}
                  seleccionado={clienteId}
                  onAbrir={(id) => abrirCliente(id, 'clientes')}
                  onCapturar={() => ir('captura')}
                  onCargado={() => setVersion((v) => v + 1)}
                />
              </div>
              <div className="reparto-ficha">
                {clienteId && tab === 'clientes' ? (
                  <Ficha key={version} id={clienteId} antes={antes} onVisita={registrarVisita} onVolver={() => setClienteId(null)} />
                ) : (
                  <div className="vacio vacio-ficha">
                    <p>Elegí un hospital</p>
                    <span>La ficha y lo que falta averiguar aparecen aquí.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={'vista' + (tab === 'captura' ? ' vista-on' : '')}>
            <Captura
              visita={visita}
              onEstado={setEstado}
              onListo={alGuardar}
            />
          </div>

          <div className={'vista' + (tab === 'mapa' && !clienteId ? ' vista-on' : '')}>
            <Mapa key={version} onAbrirCliente={(id) => abrirCliente(id, 'mapa')} />
          </div>

          <div className={'vista' + (tab === 'resumen' && !clienteId ? ' vista-on' : '')}>
            <ResumenPantalla key={version} onAbrirCliente={(id) => abrirCliente(id, 'resumen')} />
          </div>

          {fichaAparte && (
            <div className="vista vista-on">
              <Ficha key={version} id={clienteId} onVisita={registrarVisita} onVolver={() => { setClienteId(null); setTab(volverA); }} />
            </div>
          )}
        </main>
        <footer className="estado-barra">
          <span role="status">{estado}</span>
        </footer>
      </div>
    </div>
  );
}
