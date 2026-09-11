import { useEffect, useState } from 'react';
import { estadoFit, estadoModelos, fijarResidencia, fijarLlm, hayEscritorio, precargarModelos, descargarModelos, onProgreso } from '../api/client.js';
import FitModelos, { pieFit } from '../components/FitModelos.jsx';
import { DEMO_LAPTOP, evaluateFit } from '../../../../../src/application/qvac-fit.ts';
import { Sol, Luna } from '../components/Iconos.jsx';

const PREVIEW = evaluateFit(DEMO_LAPTOP);

function percentFrom(message) {
  const match = String(message ?? '').match(/(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

function packItem(pack, name) {
  return pack?.items?.find((item) => item.name === name);
}

export default function Configuracion({ activa = false, tema, onTema, onEstado }) {
  const [fit, setFit] = useState(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState(null);
  const [bajando, setBajando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    estadoFit()
      .then((value) => {
        if (!alive) return;
        if (value) { setFit(value); setPreview(false); }
        else { setFit({ ...PREVIEW, residence: 'sequential' }); setPreview(true); }
      })
      .catch(() => {
        if (!alive) return;
        setFit({ ...PREVIEW, residence: 'sequential' });
        setPreview(true);
      });
    estadoModelos()
      .then((value) => { if (alive) setPack(value); })
      .catch(() => { if (alive) setPack(null); });
    const off = onProgreso(({ message }) => {
      setProgreso(message);
      const next = percentFrom(message);
      if (next !== null) setPct(next);
    });
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    if (!activa) return;
    onEstado?.(pieFit(fit) || 'Configuración');
  }, [activa, fit, onEstado]);

  async function refrescarFit() {
    const next = await estadoFit().catch(() => null);
    if (next) { setFit(next); setPreview(false); }
  }

  async function cambiarResidencia(caliente) {
    if (preview || !hayEscritorio()) {
      setError('El modo en caliente se cambia en la aplicación de escritorio.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await fijarResidencia(caliente ? 'hot' : 'sequential');
      setFit(next);
      if (caliente) await precargarModelos(['stt', 'llm']);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function bajarModelos(llm) {
    setError('');
    setBajando(true);
    setProgreso('Preparando descarga…');
    setPct(0);
    try {
      setPack(await descargarModelos(llm));
      setProgreso('Modelos listos');
      setPct(100);
      await refrescarFit();
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'La descarga de modelos solo está en Electron.' : e.message);
    } finally {
      setBajando(false);
    }
  }

  async function activarLlm(llm) {
    setError('');
    setBusy(true);
    try {
      setPack(await fijarLlm(llm));
      await refrescarFit();
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'Elegí el modelo en la aplicación de escritorio.' : e.message);
    } finally {
      setBusy(false);
    }
  }

  const mostrado = fit;
  const whisper = packItem(pack, 'WHISPER_LARGE_V3_TURBO');
  const qwen4 = packItem(pack, 'QWEN3_4B_INST_Q4_K_M');
  const qwen17 = packItem(pack, 'QWEN3_1_7B_INST_Q4');
  const activo = pack?.llm || mostrado?.llm || '4b';
  const recomienda17 = mostrado?.recommendedLlm === '1.7b';

  return (
    <div className="pantalla">
      <div className="top">
        <h1 className="titulo">Configuración</h1>
        <p className="offline">Modelos, hardware y apariencia en este equipo</p>
      </div>
      <div className="cuerpo">
        <section className="seccion config-seccion">
          <h2>Esta máquina</h2>
          {preview && (
            <p className="fila-s">Vista previa con el perfil de la laptop de demo. Abrí la app Electron para medir este equipo.</p>
          )}
          {mostrado ? (
            <div className="config-card">
              <FitModelos fit={mostrado} busy={busy} onHot={(caliente) => { void cambiarResidencia(caliente); }} />
            </div>
          ) : (
            <p className="fila-s">Midiendo CPU, RAM y GPU…</p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>

        <section className="seccion config-seccion">
          <h2>Qwen para extracción</h2>
          <p className="fila-s">
            {recomienda17
              ? 'En esta GPU el 4B queda justo o no cabe. Usá Qwen 1.7B.'
              : 'El 4B cabe en cola. El 1.7B es opcional si querés ahorrar VRAM.'}
          </p>
          <div className="llm-opciones">
            <LlmOpcion
              titulo="Qwen3 4B"
              detalle="Q4_K_M · ~2,5 GB · ~3 GiB VRAM"
              activo={activo === '4b'}
              listo={Boolean(qwen4?.ready)}
              recomendado={!recomienda17}
              disabled={bajando || busy || !hayEscritorio()}
              onUsar={() => { void activarLlm('4b'); }}
              onBajar={() => { void bajarModelos('4b'); }}
            />
            <LlmOpcion
              titulo="Qwen3 1.7B"
              detalle="Q4_0 · ~1,0 GB · ~1,2 GiB VRAM"
              activo={activo === '1.7b'}
              listo={Boolean(qwen17?.ready)}
              recomendado={recomienda17}
              disabled={bajando || busy || !hayEscritorio()}
              onUsar={() => { void activarLlm('1.7b'); }}
              onBajar={() => { void bajarModelos('1.7b'); }}
            />
          </div>
          {!whisper?.ready && hayEscritorio() && (
            <p className="fila-s">La descarga incluye Whisper Turbo si todavía no está.</p>
          )}
          {bajando && (
            <>
              <p className="fila-s">{progreso || 'Descargando…'}</p>
              <div className="barra-modelos" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <span style={{ width: pct + '%' }} />
              </div>
            </>
          )}
          {!hayEscritorio() && <p className="fila-s">La descarga y el cambio de modelo corren en Electron.</p>}
        </section>

        <section className="seccion config-seccion">
          <h2>Apariencia</h2>
          <button
            type="button"
            className="btn btn-sec"
            data-testid="cib-config-tema"
            aria-pressed={tema === 'oscuro'}
            onClick={() => onTema?.(tema === 'oscuro' ? 'claro' : 'oscuro')}
          >
            {tema === 'oscuro' ? <Sol /> : <Luna />}
            {tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          </button>
        </section>
      </div>
    </div>
  );
}

function LlmOpcion({ titulo, detalle, activo, listo, recomendado, disabled, onUsar, onBajar }) {
  const compacto = titulo.includes('1.7');
  return (
    <div className={'llm-card' + (activo ? ' llm-card-activa' : '')} data-testid={'cib-llm-' + (compacto ? '17' : '4')}>
      <p className="llm-card-titulo">
        {titulo}
        {activo && <span>En uso</span>}
        {recomendado && !activo && <span className="llm-rec">Cabe mejor</span>}
      </p>
      <p className="fila-s">{detalle}</p>
      {listo && !activo && (
        <button type="button" className="btn btn-sec" disabled={disabled} onClick={onUsar}>Usar este modelo</button>
      )}
      {!listo && (
        <button type="button" className="btn btn-sec" disabled={disabled} onClick={onBajar}>
          {compacto ? 'Descargar 1.7B' : 'Descargar 4B'}
        </button>
      )}
      {listo && activo && <p className="fila-s">Listo en disco.</p>}
    </div>
  );
}
