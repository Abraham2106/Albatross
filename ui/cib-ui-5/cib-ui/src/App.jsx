import { useState } from 'react';
import Clientes from './screens/Clientes.jsx';
import Ficha from './screens/Ficha.jsx';
import Captura from './screens/Captura.jsx';
import ResumenPantalla from './screens/Resumen.jsx';
import Mapa from './screens/Mapa.jsx';
import { Lista, Micro, Grafico, Globo } from './components/Iconos.jsx';

/**
 * Navegacion a mano con useState.
 *
 * Sin react-router a proposito: son cinco pantallas, no vale la dependencia
 * ni el tiempo de configurarla en un hackathon.
 */

export default function App() {
  const [tab, setTab] = useState('clientes');
  const [clienteId, setClienteId] = useState(null);
  const [volverA, setVolverA] = useState('clientes');

  function abrirCliente(id, desde) {
    setVolverA(desde || tab);
    setClienteId(id);
  }

  const pantalla = clienteId ? (
    <Ficha id={clienteId} onVolver={() => { setClienteId(null); setTab(volverA); }} />
  ) : tab === 'clientes' ? (
    <Clientes onAbrir={(id) => abrirCliente(id, 'clientes')} />
  ) : tab === 'captura' ? (
    <Captura onListo={() => setTab('clientes')} />
  ) : tab === 'mapa' ? (
    <Mapa onAbrirCliente={(id) => abrirCliente(id, 'mapa')} />
  ) : (
    <ResumenPantalla />
  );

  function ir(destino) {
    setClienteId(null);
    setTab(destino);
  }

  return (
    <div className="marco">
      {pantalla}
      <nav className="nav">
        <button data-activo={tab === 'clientes' && !clienteId} onClick={() => ir('clientes')}>
          <Lista /> Hospitales
        </button>
        <button data-activo={tab === 'captura'} onClick={() => ir('captura')}>
          <Micro /> Capturar
        </button>
        <button data-activo={tab === 'mapa' && !clienteId} onClick={() => ir('mapa')}>
          <Globo /> Cobertura
        </button>
        <button data-activo={tab === 'resumen'} onClick={() => ir('resumen')}>
          <Grafico /> Panorama
        </button>
      </nav>
    </div>
  );
}
