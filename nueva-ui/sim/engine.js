/* =====================================================================
   engine.js — Motor de simulación del aeropuerto (JS plano, sin React)
   Flujo: Entrada → Check-in → Seguridad → Embarque (3 PUERTAS, cada una
   con su avión) → 1 PISTA compartida.
   Cuando un avión se llena espera turno; solo UNO usa la pista a la vez:
   taxea hasta la cabecera y despega; luego vuelve un avión vacío.
   ===================================================================== */
(function () {
  const WORLD_W = 640;
  const WORLD_H = 360;
  const FLOOR_TOP = 30;
  const FLOOR_BOT = 352;

  const SHIRTS = [
    '#e84d4d', '#e8804d', '#e8c84d', '#7ec84d', '#4dc88a',
    '#4dc8c8', '#4d8ae8', '#6a4de8', '#b14de8', '#e84db1',
    '#d96a8a', '#5a8f6a', '#caa14d', '#4d6ae8', '#9b59b6'
  ];
  const SKINS = ['#f1c9a5', '#e0a878', '#c98b5e', '#9c6b43', '#6e4a2f', '#f5d6b8'];
  const HAIR = ['#2b2218', '#4a3526', '#6b4a2f', '#9a9a9a', '#1c1c22', '#a8651f', '#d9c27a'];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function snake(rx0, rx1, ry0, ry1, cs, rs) {
    const slots = [];
    const cols = Math.max(1, Math.floor((rx1 - rx0) / cs) + 1);
    const rows = Math.max(1, Math.floor((ry1 - ry0) / rs) + 1);
    for (let c = 0; c < cols; c++) {
      const x = rx1 - c * cs;
      for (let r = 0; r < rows; r++) {
        const rr = (c % 2 === 0) ? r : (rows - 1 - r);
        slots.push({ x, y: ry0 + rr * rs });
      }
    }
    return slots;
  }

  function makeStation(cfg) {
    return {
      id: cfg.id, name: cfg.name, x0: cfg.x0, x1: cfg.x1,
      qx0: cfg.qx0, qx1: cfg.qx1, qy0: cfg.qy0, qy1: cfg.qy1,
      slots: snake(cfg.qx0, cfg.qx1, cfg.qy0, cfg.qy1, cfg.cs || 13, cfg.rs || 17),
      line: [],
      servers: cfg.servers.map(s => ({ x: s.x, y: s.y, busy: false, occ: null, timer: 0 })),
      sMin: cfg.sMin, sMax: cfg.sMax
    };
  }

  // 3 puertas de embarque, cada una con su avión ----------------------
  const GATE_BANDS = [84, 191, 298];
  const PARK_X = 458;          // borde de la puerta (morro a la derecha)
  const PLANE_CAP = 8;
  const RUNWAY = { x: 560, y: 191 }; // cabecera de la única pista

  function buildGate(i) {
    const cy = GATE_BANDS[i];
    return {
      id: i, bandY: cy,
      qx0: 352, qx1: 444, qy0: cy - 40, qy1: cy + 40,
      slots: snake(352, 444, cy - 40, cy + 40, 12, 15),
      line: [],
      doorX: PARK_X + 4, doorY: cy,
      parkX: PARK_X, parkY: cy,
      boardingNow: 0,
      plane: { x: PARK_X, y: cy, state: 'boarding', boarded: 0, capacity: PLANE_CAP, timer: 0 }
    };
  }

  const ORDER = ['checkin', 'security', 'gate'];

  function createWorld() {
    return {
      passengers: [],
      stations: {
        checkin: makeStation({
          id: 'checkin', name: 'CHECK-IN', x0: 84, x1: 216,
          qx0: 96, qx1: 178, qy0: 52, qy1: 322, cs: 13, rs: 17,
          servers: [{ x: 202, y: 78 }, { x: 202, y: 170 }, { x: 202, y: 262 }],
          sMin: 1.4, sMax: 2.6
        }),
        security: makeStation({
          id: 'security', name: 'SEGURIDAD', x0: 216, x1: 342,
          qx0: 226, qx1: 300, qy0: 60, qy1: 312, cs: 13, rs: 17,
          servers: [{ x: 322, y: 120 }, { x: 322, y: 232 }],
          sMin: 1.3, sMax: 2.4
        }),
        gate: {
          id: 'gate', name: 'EMBARQUE', x0: 342, x1: 558,
          gates: [buildGate(0), buildGate(1), buildGate(2)]
        }
      },
      order: ORDER,
      runwayBusy: null, // id de la puerta cuyo avión usa la pista
      time: 0, nextId: 1, spawnCooldown: 0,
      stats: { volados: 0, vuelos: 0, waitSamples: [] }
    };
  }

  function newPassenger(world) {
    return {
      id: world.nextId++,
      x: rand(14, 60), y: rand(FLOOR_TOP + 20, FLOOR_BOT - 20),
      shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIR),
      bag: Math.random() < 0.7,
      state: 'queue', station: 'checkin', gateIdx: -1,
      tx: 0, ty: 0, wait: 0, walk: Math.random() * 6, moving: false
    };
  }

  function addPassenger(world) {
    if (world.passengers.length >= 220) return;
    world.passengers.push(newPassenger(world));
  }

  function moveToward(p, tx, ty, step) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d <= step) { p.x = tx; p.y = ty; p.moving = false; return true; }
    p.x += (dx / d) * step; p.y += (dy / d) * step; p.moving = true;
    return false;
  }

  const WALK = 30;

  function step(world, dt, opts) {
    opts = opts || {};
    const speed = opts.speed == null ? 1 : opts.speed;
    const target = opts.target == null ? 40 : opts.target;
    const D = dt * speed;
    world.time += D;

    // Spawn ----------------------------------------------------------
    world.spawnCooldown -= D;
    if (world.passengers.length < target && world.spawnCooldown <= 0) {
      addPassenger(world);
      world.spawnCooldown = 0.28;
    }

    const st = world.stations;

    // Servidores de check-in y seguridad -----------------------------
    for (const key of ['checkin', 'security']) {
      const s = st[key];
      for (const srv of s.servers) {
        if (srv.busy) {
          srv.timer -= D;
          if (srv.timer <= 0) {
            const p = world.passengers.find(q => q.id === srv.occ);
            srv.busy = false; srv.occ = null;
            if (p) advance(world, p);
          }
        }
      }
      if (s.line.length > 0) {
        const fp = world.passengers.find(q => q.id === s.line[0]);
        if (fp && fp.state === 'queue') {
          const slot0 = s.slots[0];
          if (Math.hypot(fp.x - slot0.x, fp.y - slot0.y) < 6) {
            const free = s.servers.find(v => !v.busy);
            if (free) {
              s.line.shift();
              free.busy = true; free.occ = fp.id; free.timer = rand(s.sMin, s.sMax);
              fp.state = 'toserver'; fp.tx = free.x; fp.ty = free.y;
            }
          }
        }
      }
    }

    // Puertas + aviones + pista --------------------------------------
    for (const u of st.gate.gates) {
      const pl = u.plane;

      // máquina de estados del avión
      if (pl.state === 'boarding') {
        pl.x = u.parkX; pl.y = u.parkY; pl.timer += D;
        const full = pl.boarded >= pl.capacity;
        const idle = pl.boarded > 0 && pl.timer > 12 && u.line.length === 0;
        if ((full || idle) && u.boardingNow === 0) pl.state = 'wait';
      } else if (pl.state === 'wait') {
        if (world.runwayBusy === null) { world.runwayBusy = u.id; pl.state = 'taxi'; }
      } else if (pl.state === 'taxi') {
        const arrived = moveToward(pl, RUNWAY.x, RUNWAY.y, 46 * D);
        if (arrived) pl.state = 'takeoff';
      } else if (pl.state === 'takeoff') {
        pl.x += 120 * D;
        if (pl.x > WORLD_W + 50) {
          world.stats.volados += pl.boarded;
          world.stats.vuelos += 1;
          pl.boarded = 0;
          world.runwayBusy = null;
          pl.state = 'return';
          pl.x = WORLD_W + 70; pl.y = u.parkY;
        }
      } else if (pl.state === 'return') {
        if (moveToward(pl, u.parkX, u.parkY, 80 * D)) { pl.state = 'boarding'; pl.timer = 0; }
      }

      // abordaje: jalar al frente de la fila si el avión recibe
      if (pl.state === 'boarding' && u.line.length > 0 &&
          pl.boarded + u.boardingNow < pl.capacity) {
        const fp = world.passengers.find(q => q.id === u.line[0]);
        if (fp && fp.state === 'queue') {
          const slot0 = u.slots[0];
          if (Math.hypot(fp.x - slot0.x, fp.y - slot0.y) < 6) {
            u.line.shift();
            u.boardingNow += 1;
            fp.state = 'boarding'; fp.tx = u.doorX; fp.ty = u.doorY; fp._gate = u;
          }
        }
      }
    }

    // Pasajeros ------------------------------------------------------
    const remove = [];
    for (const p of world.passengers) {
      if (p.state === 'queue') {
        if (p.station === 'gate') {
          const u = st.gate.gates[p.gateIdx];
          let idx = u.line.indexOf(p.id);
          if (idx === -1) { u.line.push(p.id); idx = u.line.length - 1; }
          const slot = u.slots[Math.min(idx, u.slots.length - 1)];
          moveToward(p, slot.x, slot.y, WALK * D);
        } else {
          const s = st[p.station];
          let idx = s.line.indexOf(p.id);
          if (idx === -1) { s.line.push(p.id); idx = s.line.length - 1; }
          const slot = s.slots[Math.min(idx, s.slots.length - 1)];
          moveToward(p, slot.x, slot.y, WALK * D);
        }
        p.wait += D;
      } else if (p.state === 'toserver') {
        if (moveToward(p, p.tx, p.ty, WALK * D)) p.state = 'service';
      } else if (p.state === 'service') {
        // espera en el servidor
      } else if (p.state === 'boarding') {
        if (moveToward(p, p.tx, p.ty, WALK * 1.15 * D)) {
          const u = p._gate;
          if (u) {
            u.boardingNow = Math.max(0, u.boardingNow - 1);
            u.plane.boarded += 1;
          }
          world.stats.waitSamples.push(p.wait);
          if (world.stats.waitSamples.length > 60) world.stats.waitSamples.shift();
          remove.push(p.id);
        }
      }
      if (p.moving || p.state === 'queue') p.walk += D * 9;
    }
    if (remove.length) {
      const set = new Set(remove);
      world.passengers = world.passengers.filter(p => !set.has(p.id));
    }
  }

  function advance(world, p) {
    const i = ORDER.indexOf(p.station);
    if (i < ORDER.length - 1) {
      p.station = ORDER[i + 1];
      p.state = 'queue';
      if (p.station === 'gate') {
        p.gateIdx = chooseGate(world);
        const u = world.stations.gate.gates[p.gateIdx];
        const back = u.slots[Math.min(u.line.length, u.slots.length - 1)];
        p.tx = back.x; p.ty = back.y;
      } else {
        const s = world.stations[p.station];
        const back = s.slots[Math.min(s.line.length, s.slots.length - 1)];
        p.tx = back.x; p.ty = back.y;
      }
    }
  }

  // elige puerta: prioriza aviones que reciben; desempata por fila corta
  function chooseGate(world) {
    const gs = world.stations.gate.gates;
    const boarding = gs.filter(u => u.plane.state === 'boarding');
    const pool = boarding.length ? boarding : gs;
    let best = pool[0];
    for (const u of pool) if (u.line.length < best.line.length) best = u;
    return best.id;
  }

  function counts(world) {
    const c = { checkin: 0, security: 0, gate: 0 };
    for (const p of world.passengers) if (c[p.station] != null) c[p.station]++;
    return c;
  }

  function planeStatus(world) {
    let waiting = 0, onRunway = 0, boarding = 0;
    for (const u of world.stations.gate.gates) {
      const s = u.plane.state;
      if (s === 'wait') waiting++;
      else if (s === 'taxi' || s === 'takeoff') onRunway++;
      else if (s === 'boarding') boarding++;
    }
    return { waiting, onRunway, boarding };
  }

  function avgWait(world) {
    const s = world.stats.waitSamples;
    if (!s.length) return 0;
    return s.reduce((a, b) => a + b, 0) / s.length;
  }

  window.AP = {
    WORLD_W, WORLD_H, FLOOR_TOP, FLOOR_BOT, RUNWAY, GATE_BANDS,
    createWorld, step, addPassenger, counts, planeStatus, avgWait
  };
})();
