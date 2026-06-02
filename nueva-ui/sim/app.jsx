/* app.jsx — Shell React: canvas + bucle de animación + controles + stats + tweaks */
const { useState, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dia",
  "perspective": "plano",
  "personSize": "normal",
  "showPaths": false
}/*EDITMODE-END*/;

const SIZE_MAP = { pequeño: 0.85, normal: 1, grande: 1.2 };

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [target, setTarget] = useState(32);
  const [stats, setStats] = useState({ total: 0, checkin: 0, security: 0, gate: 0, espera: 0, wait: 0, volados: 0, vuelos: 0 });

  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const cfg = useRef({ paused, speed, target, t });

  // mantener cfg sincronizado para que el bucle lea valores actuales
  cfg.current = { paused, speed, target, t };

  const seed = useCallback((w, n) => {
    for (let i = 0; i < n; i++) window.AP.addPassenger(w);
  }, []);

  const reset = useCallback(() => {
    const w = window.AP.createWorld();
    seed(w, Math.min(target, 22));
    worldRef.current = w;
  }, [target, seed]);

  // bucle principal — usamos setInterval (con delta-time) para que la
  // simulación corra de forma fiable en cualquier contexto de render.
  useEffect(() => {
    worldRef.current = window.AP.createWorld();
    seed(worldRef.current, 22);
    const ctx = canvasRef.current.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let last = performance.now();
    let statAcc = 0;

    const tick = () => {
      const now = performance.now();
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;
      const c = cfg.current;
      const w = worldRef.current;
      if (!c.paused) window.AP.step(w, dt, { speed: c.speed, target: c.target });
      window.APrender.draw(ctx, w, {
        theme: c.t.theme,
        showPaths: c.t.showPaths,
        size: SIZE_MAP[c.t.personSize] || 1
      });
      statAcc += dt;
      if (statAcc >= 0.22) {
        statAcc = 0;
        const cc = window.AP.counts(w);
        const ps = window.AP.planeStatus(w);
        setStats({
          total: w.passengers.length,
          checkin: cc.checkin, security: cc.security, gate: cc.gate, espera: ps.waiting,
          wait: window.AP.avgWait(w), volados: w.stats.volados, vuelos: w.stats.vuelos
        });
      }
    };
    const id = setInterval(tick, 1000 / 60);
    return () => clearInterval(id);
  }, [seed]);

  // perspectiva (CSS)
  const tilt = t.perspective === 'inclinada'
    ? 'perspective(760px) rotateX(32deg) scale(1.02)'
    : 'none';

  const speeds = [0.5, 1, 2, 4];

  const STAT_CARDS = [
    { k: 'total', label: 'EN EL AEROPUERTO', accent: '#cbd2dc' },
    { k: 'checkin', label: 'CHECK-IN', accent: '#2fd0b8' },
    { k: 'security', label: 'SEGURIDAD', accent: '#5b9bff' },
    { k: 'gate', label: 'EMBARQUE', accent: '#b07cff' },
    { k: 'espera', label: 'ESPERAN PISTA', accent: '#ff9f6b' }
  ];

  return (
    <div className="cab">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">✈</span>
          <span className="logo-text">SIMULADOR&nbsp;DE&nbsp;AEROPUERTO</span>
        </div>
        <div className="legend">Flujo&nbsp;de&nbsp;pasajeros&nbsp;·&nbsp;colas&nbsp;en&nbsp;tiempo&nbsp;real</div>
      </header>

      <div className="board-wrap">
        <div className="board-shadow" style={{ transform: tilt }}>
          <div className="board">
            <canvas ref={canvasRef} width="640" height="360" className="screen"></canvas>
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="controls">
        <button className={'btn primary' + (paused ? ' on' : '')} onClick={() => setPaused(p => !p)}>
          {paused ? '▶ REANUDAR' : '❚❚ PAUSA'}
        </button>

        <div className="seg">
          <span className="seg-label">VELOCIDAD</span>
          {speeds.map(s => (
            <button key={s} className={'segbtn' + (speed === s ? ' active' : '')} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>

        <button className="btn" onClick={() => worldRef.current && window.AP.addPassenger(worldRef.current)}>
          + PASAJERO
        </button>

        <div className="slider-group">
          <span className="seg-label">POBLACIÓN&nbsp;OBJETIVO</span>
          <input type="range" min="10" max="120" step="5" value={target}
            onChange={e => setTarget(+e.target.value)} />
          <span className="slider-val">{target}</span>
        </div>

        <button className="btn ghost" onClick={reset}>↻ REINICIAR</button>
      </div>

      {/* Estadísticas */}
      <div className="stats">
        {STAT_CARDS.map(c => (
          <div className="stat" key={c.k}>
            <div className="stat-num" style={{ color: c.accent }}>{stats[c.k]}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
        <div className="stat wide">
          <div className="stat-num" style={{ color: '#ff9f6b' }}>{stats.wait.toFixed(1)}s</div>
          <div className="stat-label">ESPERA&nbsp;PROM.</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: '#7ee08a' }}>{stats.volados}</div>
          <div className="stat-label">EMBARCADOS</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: '#7ee08a' }}>{stats.vuelos}</div>
          <div className="stat-label">VUELOS</div>
        </div>
      </div>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Apariencia" />
        <TweakRadio label="Ambiente" value={t.theme}
          options={['dia', 'atardecer', 'noche']}
          onChange={v => setTweak('theme', v)} />
        <TweakRadio label="Vista" value={t.perspective}
          options={['plano', 'inclinada']}
          onChange={v => setTweak('perspective', v)} />
        <TweakRadio label="Tamaño personas" value={t.personSize}
          options={['pequeño', 'normal', 'grande']}
          onChange={v => setTweak('personSize', v)} />
        <TweakToggle label="Mostrar guías de fila" value={t.showPaths}
          onChange={v => setTweak('showPaths', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
