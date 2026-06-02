/* =====================================================================
   sprites.js — Dibujo pixel-art (personas, avión, mobiliario).
   Todo en enteros para conservar el look "pixel". Expone window.APspr.
   ===================================================================== */
(function () {
  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }

  // ---- Persona (vista ligeramente frontal sobre el plano) -----------
  // Anclada por su "centro": cabeza arriba, pies en y+7.
  function person(ctx, p, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    if (s !== 1) ctx.scale(s, s);
    const sh = p.shirt, sk = p.skin, hr = p.hair;
    const moving = p.moving;
    const ph = moving ? (Math.floor(p.walk) % 2) : 2; // 0/1 pasos, 2 quieto

    // sombra
    px(ctx, -4, 6, 9, 2, 'rgba(0,0,0,0.20)');
    // piernas
    if (ph === 0) { px(ctx, -3, 2, 2, 5, '#3a3a44'); px(ctx, 1, 2, 2, 4, '#3a3a44'); }
    else if (ph === 1) { px(ctx, -3, 2, 2, 4, '#3a3a44'); px(ctx, 1, 2, 2, 5, '#3a3a44'); }
    else { px(ctx, -3, 2, 2, 5, '#3a3a44'); px(ctx, 1, 2, 2, 5, '#3a3a44'); }
    // cuerpo (camiseta)
    px(ctx, -3, -3, 7, 6, sh);
    // brazos
    px(ctx, -4, -2, 1, 4, sh); px(ctx, 4, -2, 1, 4, sh);
    // cabeza
    px(ctx, -2, -8, 5, 5, sk);
    // pelo
    px(ctx, -2, -9, 5, 2, hr); px(ctx, -3, -8, 1, 2, hr); px(ctx, 3, -8, 1, 2, hr);
    // maleta de mano
    if (p.bag) { px(ctx, 5, -1, 3, 6, '#2a2a30'); px(ctx, 6, -2, 1, 1, '#777'); }
    ctx.restore();
  }

  // ---- Mostrador / escritorio (check-in, embarque) -------------------
  function desk(ctx, x, y, c1, c2) {
    px(ctx, x - 9, y - 8, 26, 17, c2);          // base
    px(ctx, x - 9, y - 8, 26, 4, c1);           // tablero
    px(ctx, x - 7, y - 3, 6, 4, '#dfe7ef');     // monitor
    px(ctx, x + 4, y - 3, 9, 5, '#cfd8e2');     // cinta/bandeja
  }

  // ---- Escáner de seguridad (arco) -----------------------------------
  function scanner(ctx, x, y, accent) {
    px(ctx, x - 10, y - 12, 24, 24, '#cfd6de');     // marco claro
    px(ctx, x - 6, y - 8, 16, 16, '#2b3440');       // hueco oscuro
    px(ctx, x - 6, y - 8, 16, 2, accent);           // luz superior
    px(ctx, x - 6, y + 6, 16, 2, accent);
  }

  // ---- Avión (vista cenital, morro a la derecha) ---------------------
  function plane(ctx, pl, accent) {
    const left = Math.round(pl.x);
    const cy = Math.round(pl.y);
    const bodyL = left, bodyR = left + 66;
    // alas (triángulos)
    ctx.fillStyle = '#c9ced6';
    ctx.beginPath();
    ctx.moveTo(left + 26, cy - 7); ctx.lineTo(left + 50, cy - 36); ctx.lineTo(left + 40, cy - 7); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(left + 26, cy + 7); ctx.lineTo(left + 50, cy + 36); ctx.lineTo(left + 40, cy + 7); ctx.closePath(); ctx.fill();
    // motores
    px(ctx, left + 40, cy - 26, 5, 9, '#9aa0aa');
    px(ctx, left + 40, cy + 17, 5, 9, '#9aa0aa');
    // estabilizadores de cola (izquierda)
    ctx.fillStyle = '#dfe3e9';
    ctx.beginPath();
    ctx.moveTo(left + 2, cy - 5); ctx.lineTo(left - 12, cy - 18); ctx.lineTo(left + 6, cy - 5); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(left + 2, cy + 5); ctx.lineTo(left - 12, cy + 18); ctx.lineTo(left + 6, cy + 5); ctx.closePath(); ctx.fill();
    // fuselaje
    px(ctx, bodyL, cy - 9, bodyR - bodyL, 18, '#eef1f5');
    px(ctx, bodyL, cy - 9, bodyR - bodyL, 3, '#ffffff');
    px(ctx, bodyL, cy + 6, bodyR - bodyL, 3, '#cdd3db');
    // franja de color
    px(ctx, bodyL, cy - 1, bodyR - bodyL, 3, accent);
    // morro
    ctx.fillStyle = '#eef1f5';
    ctx.beginPath();
    ctx.moveTo(bodyR, cy - 9); ctx.lineTo(bodyR + 12, cy); ctx.lineTo(bodyR, cy + 9); ctx.closePath(); ctx.fill();
    px(ctx, bodyR + 6, cy - 2, 4, 4, '#9fd0ff'); // cabina
    // ventanillas
    for (let i = 0; i < 9; i++) px(ctx, bodyL + 12 + i * 5, cy - 6, 2, 2, '#9fd0ff');
    // puerta (donde embarcan)
    px(ctx, bodyL + 3, cy - 6, 4, 12, '#2b3440');
    px(ctx, bodyL + 3, cy - 1, 4, 2, accent);
  }

  // ---- Poste de valla (para insinuar las filas) ----------------------
  function post(ctx, x, y) {
    px(ctx, x - 1, y - 5, 2, 8, '#6b7280');
    px(ctx, x - 2, y - 6, 4, 2, '#9aa3af');
  }

  window.APspr = { person, desk, scanner, plane, post, px };
})();
