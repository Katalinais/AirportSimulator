/* =====================================================================
   render.js — Pinta el mundo: zonas, señalética, mobiliario, 3 puertas
   con sus aviones, la pista única y las personas (orden por profundidad).
   Expone window.APrender.draw(ctx, world, opts).
   ===================================================================== */
(function () {
  const { WORLD_W, FLOOR_TOP, FLOOR_BOT, RUNWAY } = window.AP;
  const spr = window.APspr;
  const px = spr.px;
  const BANNER = 26;

  const THEMES = {
    dia: {
      sky: '#cdd7df', text: '#f7f9fb', ambient: null,
      zones: {
        checkin: { a: '#dcebe8', b: '#d2e4e0', accent: '#1f9e8c', banner: '#177568' },
        security: { a: '#dde4ef', b: '#d2dceb', accent: '#3a74c4', banner: '#27548f' },
        gate: { a: '#e6e1f3', b: '#dcd5ee', accent: '#7a54c8', banner: '#553a93', apron: '#c9c2dc' },
        runway: { a: '#3f4654', b: '#373d4a', accent: '#f0b429', banner: '#232833' },
        entry: { a: '#ece5d4', b: '#e3dbc6' }
      }
    },
    atardecer: {
      sky: '#e8c7a0', text: '#fff6ec', ambient: 'rgba(255,150,60,0.10)',
      zones: {
        checkin: { a: '#f0ddc6', b: '#ecd3b8', accent: '#e07a3f', banner: '#b3552a' },
        security: { a: '#ecd0c2', b: '#e6c4b2', accent: '#d05a6e', banner: '#9c3a55' },
        gate: { a: '#e8cdcf', b: '#e0c0c6', accent: '#a44d86', banner: '#7a3463', apron: '#cdb6bb' },
        runway: { a: '#4a3f48', b: '#41363f', accent: '#ffcf5c', banner: '#2c242b' },
        entry: { a: '#f3e3cb', b: '#ecd9bb' }
      }
    },
    noche: {
      sky: '#1c2230', text: '#e7edf6', ambient: 'rgba(20,30,70,0.34)',
      zones: {
        checkin: { a: '#27313f', b: '#222b38', accent: '#2fd6bd', banner: '#13413a' },
        security: { a: '#222c3e', b: '#1d2636', accent: '#5b9bff', banner: '#1b2f52' },
        gate: { a: '#2a2740', b: '#241f37', accent: '#b07cff', banner: '#33245a', apron: '#211d33' },
        runway: { a: '#15191f', b: '#11151b', accent: '#ffd34d', banner: '#0c0f14' },
        entry: { a: '#2a2c34', b: '#24262e' }
      }
    }
  };

  function tile(ctx, x0, x1, y0, y1, a, b, size) {
    for (let x = x0; x < x1; x += size) {
      for (let y = y0; y < y1; y += size) {
        const on = ((x / size | 0) + (y / size | 0)) % 2 === 0;
        px(ctx, x, y, Math.min(size, x1 - x), Math.min(size, y1 - y), on ? a : b);
      }
    }
  }

  function icon(ctx, kind, x, y, c) {
    if (kind === 'checkin') { px(ctx, x, y - 4, 10, 9, c); px(ctx, x + 3, y - 7, 4, 3, c); px(ctx, x + 4, y - 4, 2, 9, 'rgba(255,255,255,.35)'); }
    else if (kind === 'security') { px(ctx, x + 1, y - 6, 8, 7, c); px(ctx, x + 2, y + 1, 6, 2, c); px(ctx, x + 3, y + 3, 4, 2, c); px(ctx, x + 4, y + 5, 2, 1, c); }
    else if (kind === 'gate') { px(ctx, x, y - 5, 11, 9, c); px(ctx, x + 5, y - 5, 1, 9, 'rgba(0,0,0,.25)'); }
    else if (kind === 'runway') { px(ctx, x, y - 1, 11, 2, c); px(ctx, x + 4, y - 5, 2, 9, c); px(ctx, x + 8, y - 3, 2, 6, c); }
    else if (kind === 'entry') { px(ctx, x + 1, y - 6, 8, 11, c); px(ctx, x + 6, y, 2, 2, 'rgba(0,0,0,.3)'); }
  }

  function banner(ctx, x0, x1, color, accent, name, ic, theme, small) {
    px(ctx, x0, 0, x1 - x0, BANNER, color);
    px(ctx, x0, BANNER - 2, x1 - x0, 2, 'rgba(0,0,0,0.25)');
    const cx = (x0 + x1) / 2;
    ctx.fillStyle = theme.text;
    ctx.font = (small ? "7px" : "8px") + " 'Press Start 2P', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!small) icon(ctx, ic, x0 + 8, BANNER / 2 + 1, accent);
    ctx.fillText(name, cx + (small ? 0 : 8), BANNER / 2);
    ctx.textAlign = 'left';
  }

  function txt(ctx, s, x, y, color, size) {
    const sz = size || 6;
    ctx.font = sz + "px 'Press Start 2P', monospace";
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(s).width;
    // chip de fondo para legibilidad en cualquier tema
    px(ctx, x - 2, y - sz - 1, w + 4, sz + 4, 'rgba(10,12,20,0.55)');
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function draw(ctx, world, opts) {
    opts = opts || {};
    const th = THEMES[opts.theme] || THEMES.dia;
    const st = world.stations;
    const Z = th.zones;

    px(ctx, 0, 0, WORLD_W, window.AP.WORLD_H, th.sky);

    // ENTRADA
    tile(ctx, 0, 84, FLOOR_TOP, FLOOR_BOT, Z.entry.a, Z.entry.b, 14);
    px(ctx, 4, FLOOR_TOP + 8, 6, FLOOR_BOT - FLOOR_TOP - 16, 'rgba(150,200,230,0.5)');
    px(ctx, 6, FLOOR_TOP + 8, 1, FLOOR_BOT - FLOOR_TOP - 16, 'rgba(255,255,255,0.6)');

    // Pisos
    tile(ctx, 84, 216, FLOOR_TOP, FLOOR_BOT, Z.checkin.a, Z.checkin.b, 16);
    tile(ctx, 216, 342, FLOOR_TOP, FLOOR_BOT, Z.security.a, Z.security.b, 16);
    tile(ctx, 342, 558, FLOOR_TOP, FLOOR_BOT, Z.gate.a, Z.gate.b, 16);
    // plataforma (apron) donde estacionan los aviones
    px(ctx, 448, FLOOR_TOP, 110, FLOOR_BOT - FLOOR_TOP, Z.gate.apron);
    // pista
    px(ctx, 558, FLOOR_TOP, WORLD_W - 558, FLOOR_BOT - FLOOR_TOP, Z.runway.a);

    // costuras
    for (const bx of [84, 216, 342, 558]) px(ctx, bx - 1, FLOOR_TOP, 2, FLOOR_BOT - FLOOR_TOP, 'rgba(0,0,0,0.10)');

    // Pista: bordes, cabecera y línea central -------------------------
    const rwAcc = Z.runway.accent;
    px(ctx, 560, FLOOR_TOP + 2, WORLD_W - 562, 2, rwAcc);
    px(ctx, 560, FLOOR_BOT - 4, WORLD_W - 562, 2, rwAcc);
    for (let x = 568; x < WORLD_W - 6; x += 18) px(ctx, x, RUNWAY.y - 1, 10, 2, rwAcc);
    // cabecera (barras de umbral)
    for (let i = 0; i < 5; i++) px(ctx, 562, RUNWAY.y - 22 + i * 10, 4, 5, 'rgba(255,255,255,0.75)');
    // calle de rodaje desde las puertas hacia la cabecera
    px(ctx, 448, RUNWAY.y - 7, 116, 14, 'rgba(255,255,255,0.10)');

    // Señalética
    banner(ctx, 0, 84, '#5b5346', '#d9c27a', 'ENTRADA', 'entry', th);
    banner(ctx, 84, 216, Z.checkin.banner, Z.checkin.accent, 'CHECK-IN', 'checkin', th);
    banner(ctx, 216, 342, Z.security.banner, Z.security.accent, 'SEGURIDAD', 'security', th);
    banner(ctx, 342, 558, Z.gate.banner, Z.gate.accent, 'EMBARQUE', 'gate', th);
    banner(ctx, 558, WORLD_W, Z.runway.banner, Z.runway.accent, 'PISTA', 'runway', th, true);

    // Guías de fila
    if (opts.showPaths) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      const lines = [st.checkin, st.security, ...st.gate.gates];
      for (const s of lines) {
        ctx.beginPath();
        for (let i = 0; i < s.slots.length; i++) {
          const p = s.slots[i];
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Mobiliario
    for (const s of st.checkin.servers) spr.desk(ctx, s.x, s.y, Z.checkin.accent, '#b7c3c0');
    for (const s of st.security.servers) spr.scanner(ctx, s.x, s.y, Z.security.accent);
    for (const key of ['checkin', 'security']) {
      const s = st[key];
      spr.post(ctx, s.qx1 + 4, s.qy0 - 4); spr.post(ctx, s.qx0 - 4, s.qy1 + 4);
    }

    // Puertas + aviones ----------------------------------------------
    st.gate.gates.forEach((u, i) => {
      // mostrador/puesto de la puerta
      px(ctx, u.qx1 + 2, u.bandY - 6, 10, 12, Z.gate.accent);
      px(ctx, u.qx1 + 3, u.bandY - 5, 8, 4, '#dfe7ef');
      // etiqueta de puerta
      txt(ctx, 'PUERTA ' + (i + 1), u.qx0 + 2, u.bandY - 30, th.text, 6);
    });
    // aviones (orden por y)
    st.gate.gates.slice().sort((a, b) => a.plane.y - b.plane.y).forEach(u => {
      spr.plane(ctx, u.plane, Z.runway.accent);
      // estado del avión
      const pl = u.plane;
      let label = '', col = Z.runway.accent;
      if (pl.state === 'boarding') { label = pl.boarded + '/' + pl.capacity; col = '#9be8c0'; }
      else if (pl.state === 'wait') { label = 'LLENO'; col = '#ff7d6b'; }
      else if (pl.state === 'taxi' || pl.state === 'takeoff') { label = 'DESPEGA'; col = Z.runway.accent; }
      if (label) txt(ctx, label, Math.round(pl.x) + 14, Math.round(pl.y) - 30, col, 6);
    });

    // Personas
    const ppl = world.passengers.slice().sort((a, b) => a.y - b.y);
    const size = opts.size || 1;
    for (const p of ppl) spr.person(ctx, p, size);

    if (th.ambient) px(ctx, 0, 0, WORLD_W, window.AP.WORLD_H, th.ambient);
  }

  window.APrender = { draw, THEMES };
})();
