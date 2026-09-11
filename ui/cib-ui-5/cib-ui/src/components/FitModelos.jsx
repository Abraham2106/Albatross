const NIVEL = {
  perfect: 'Holgado',
  good: 'Cabe bien',
  marginal: 'Justo',
  tooTight: 'No cabe',
};

function gib(bytes) {
  if (bytes == null) return null;
  const value = bytes / (1024 ** 3);
  return value >= 10 ? `${Math.round(value)} GiB` : `${value.toFixed(1).replace(/\.0$/, '')} GiB`;
}

function gpuCorta(name) {
  return String(name || 'CPU').replace(/^NVIDIA GeForce /, '');
}

function vramTexto(gpu) {
  if (!gpu?.vramBytes) {
    if (gpu?.vramStatus === 'unverified') return 'VRAM sin verificar';
    if (gpu?.vramStatus === 'unavailable') return 'sin GPU medida';
    return 'VRAM sin medir';
  }
  const extra = gpu.vramStatus === 'estimated' ? ' · estimado' : gpu.vramStatus === 'supported' ? '' : ` · ${gpu.vramStatus}`;
  return `${gib(gpu.vramBytes)}${extra}`;
}

export default function FitModelos({ fit, busy = false, onHot }) {
  if (!fit) return null;
  const hot = fit.policies.find((item) => item.id === 'hot_stt_llm');
  const caliente = fit.residence === 'hot';
  return (
    <div className="fit-modelos" data-testid="cib-fit">
      <p className="fit-gpu">
        {gpuCorta(fit.system.gpu.name)} · {vramTexto(fit.system.gpu)}
      </p>
      <ul className="fit-roles">
        {fit.roles.map((role) => (
          <li key={role.role}>
            <span>{role.label}</span>
            <span className="fit-quant">{role.quant}</span>
            <span className="fit-nivel">{NIVEL[role.fit] ?? role.fit}</span>
          </li>
        ))}
      </ul>
      <label className="fit-toggle">
        <input
          type="checkbox"
          data-testid="cib-fit-hot"
          checked={caliente}
          disabled={!hot?.allowed || busy}
          onChange={(event) => onHot?.(event.target.checked)}
        />
        Mantener modelos en caliente
      </label>
      {!hot?.allowed && hot?.reason && <p className="fila-s">{hot.reason}</p>}
      {fit.recommendation === 'vision_delegated' && (
        <p className="fila-s">La placa corre en el otro proceso.</p>
      )}
      {fit.recommendedLlm === '1.7b' && fit.llm !== '1.7b' && (
        <p className="fila-s">Qwen 4B no cabe bien aquí. Hay Qwen 1.7B más abajo.</p>
      )}
    </div>
  );
}

export function pieFit(fit) {
  if (!fit) return null;
  const gpu = gpuCorta(fit.system.gpu.name);
  return `${fit.residence === 'hot' ? 'En caliente' : 'Uno a la vez'} · ${gpu}`;
}
