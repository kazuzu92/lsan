/* FSRS-4.5 : planification des révisions espacées.
   Chaque carte garde une stabilité S (jours avant de tomber à 90 % de rappel),
   une difficulté D (1 à 10) et sa date de dernière révision.
   Notes : 1 = À revoir, 2 = Difficile, 3 = Bien, 4 = Facile. */
(function () {
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367,
             1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5, FACTOR = 19 / 81, RETENTION = 0.9, MAX_IVL = 3650;
  const DAY = 86400000, MIN = 60000;

  const clampD = d => Math.min(10, Math.max(1, d));
  const initS = g => W[g - 1];
  const initD = g => clampD(W[4] - (g - 3) * W[5]);
  const retrievability = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
  const interval = s => Math.min(MAX_IVL, Math.max(1, Math.round(s / FACTOR * (Math.pow(RETENTION, 1 / DECAY) - 1))));
  const nextD = (d, g) => clampD(W[7] * initD(3) + (1 - W[7]) * (d - W[6] * (g - 3)));
  const recallS = (d, s, r, g) => s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
  const forgetS = (d, s, r) => Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));

  function newCard(now) { return { state: 'new', s: 0, d: 0, last: 0, due: now, reps: 0, lapses: 0 }; }

  /* Renvoie la carte mise à jour pour la note g, à l'instant now (ms). */
  function review(card, g, now) {
    const c = Object.assign({}, card);
    const elapsed = c.last ? Math.max(0, (now - c.last) / DAY) : 0;
    if (c.state === 'new') {
      c.s = initS(g); c.d = initD(g);
      c.state = g === 1 ? 'learning' : g === 2 ? 'learning' : 'review';
    } else {
      const r = retrievability(elapsed, c.s);
      if (g === 1) { if (c.state === 'review') { c.s = forgetS(c.d, c.s, r); c.lapses++; c.state = 'relearning'; } }
      else if (c.state === 'review') { c.s = recallS(c.d, c.s, r, g); }
      else if (g >= 3) { c.state = 'review'; if (g === 4) c.s *= 1.5; } /* fin de l'apprentissage : la stabilité est gardée */
      c.d = nextD(c.d, g);
    }
    c.reps++; c.last = now;
    if (c.state === 'learning' || c.state === 'relearning') c.due = now + (g === 1 ? 1 : 6) * MIN;
    else c.due = now + interval(c.s) * DAY;
    return c;
  }

  /* Libellé de l'intervalle obtenu pour chaque note (pour les boutons). */
  function preview(card, now) {
    const out = {};
    for (const g of [1, 2, 3, 4]) out[g] = label(review(card, g, now).due - now);
    return out;
  }
  function label(ms) {
    const m = Math.round(ms / MIN);
    if (m < 60) return m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h';
    const d = Math.round(ms / DAY);
    if (d < 31) return d + ' j';
    const mo = Math.round(d / 30);
    if (mo < 12) return mo + ' mois';
    return (Math.round(d / 36.5) / 10).toString().replace('.', ',') + ' an' + (d >= 730 ? 's' : '');
  }

  window.FSRS = { newCard, review, preview, retrievability, DAY, MIN };
})();
