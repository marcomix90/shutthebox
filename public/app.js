'use strict';

/* ============================================================
   Shut the Box – PWA-Begleiter
   Standard: echte Würfel, die App zeigt nur die Klappen an.
   Optional: digitale Würfel.
   ============================================================ */

const COLORS = [
  { name: 'Rot',  hex: '#e5484d' },
  { name: 'Blau', hex: '#3e7bfa' },
  { name: 'Grün', hex: '#2f9e66' },
  { name: 'Gelb', hex: '#e0a800' },
];
const STORE_KEY = 'shutthebox-state-v4';
const DEFAULT_SETTINGS = {
  playerCount: 2,
  digitalDice: false,
  maxTile: 10,
  rounds: 1,
  shutWins: true,
  sound: true,
  names: ['', '', '', ''],
};

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $fx = document.getElementById('fx');

let S = loadState() || freshState();

/* ---------------- Zustand ---------------- */

function freshState(settings) {
  return { phase: 'setup', settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.phase || !s.settings) return null;
    return s;
  } catch { return null; }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { /* egal */ }
}

const playerName = (p) => p.name.trim() || COLORS[p.color].name;
const playerHex = (p) => COLORS[p.color].hex;
const total = (p) => p.scores.reduce((a, b) => a + b, 0);
const currentIdx = () => S.current;
const isOut = (i) => S.players[i].scores.length >= S.round; // Runde für Spieler i beendet

/** Nächster Spieler (nach dem aktiven), der in dieser Runde noch im Spiel ist – sonst null. */
function nextActiveIdx() {
  const n = S.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (S.current + k) % n;
    if (!isOut(i)) return i;
  }
  return null;
}
const currentPlayer = () => S.players[currentIdx()];
/** Klappen eines Spielers (Standard: aktiver Spieler). true = offen. */
const board = (i = currentIdx()) => S.boards[i];
const openTiles = (tiles = board()) => tiles.map((open, i) => (open ? i + 1 : 0)).filter(Boolean);
const openSum = (tiles = board()) => openTiles(tiles).reduce((a, b) => a + b, 0);

/** Ist irgendeine Kombination offener Klappen = target? */
function canMake(target, tiles) {
  const n = tiles.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += tiles[i];
    if (sum === target) return true;
  }
  return false;
}

/** Ein Würfel erlaubt, wenn alle Klappen ab 7 aufwärts geschlossen sind. */
const oneDieAllowed = (tiles = board()) => tiles.slice(6).every((open) => !open);

/** Nach jeder Änderung an den Klappen: Shut the Box oder Ein-Würfel-Hinweis. */
function afterTilesChanged(wasOneDie) {
  if (openTiles().length === 0) { setTimeout(shutTheBox, 450); return; }
  if (!wasOneDie && oneDieAllowed()) {
    toast('🎲 Jetzt nur 1 Würfel!', 3500);
    Sound.play('ding');
  }
}

/* ---------------- Ablauf ---------------- */

function goToStarter() {
  const st = S.settings;
  S.players = Array.from({ length: st.playerCount }, (_, i) => ({
    color: i, name: st.names[i] || '', scores: [],
  }));
  S.phase = 'starter';
  save(); render();
}

function startGame(startSeat) {
  S.phase = 'play';
  S.startSeat = startSeat;
  S.round = 1;
  S.players.forEach((p) => { p.scores = []; });
  startRound();
}

/** Neue Runde: alle Spieler bekommen ein frisches Klappenbrett. */
function startRound() {
  S.boards = S.players.map(() => Array(S.settings.maxTile).fill(true));
  S.current = S.startSeat;
  startTurn();
}

function startTurn() {
  S.thrown = false; // digitale Würfel: in diesem Zug schon gewürfelt + umgelegt
  S.history = [];
  S.dice = null;
  S.selected = [];
  save(); render();
}

function pushHistory() {
  S.history.push(board().slice());
  if (S.history.length > 50) S.history.shift();
}

function undo() {
  if (!S.history.length) return;
  S.boards[currentIdx()] = S.history.pop();
  S.selected = [];
  save(); render();
}

/** Echte Würfel: Klappe direkt umlegen (oder wieder öffnen bei Vertippen). */
function toggleTile(n) {
  const wasOneDie = oneDieAllowed();
  pushHistory();
  board()[n - 1] = !board()[n - 1];
  buzz();
  save(); render();
  afterTilesChanged(wasOneDie);
}

/** Digitale Würfel */
function roll(count) {
  const dice = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
  S.dice = dice;
  S.selected = [];
  S.justRolled = true;
  buzz(30);
  save(); render();
  S.justRolled = false;
}

function toggleSelect(n) {
  if (!S.dice || !board()[n - 1]) return;
  const i = S.selected.indexOf(n);
  if (i >= 0) S.selected.splice(i, 1); else S.selected.push(n);
  buzz();
  save(); render();
}

function confirmSelection() {
  const target = S.dice.reduce((a, b) => a + b, 0);
  const sum = S.selected.reduce((a, b) => a + b, 0);
  if (sum !== target) return;
  const wasOneDie = oneDieAllowed();
  pushHistory();
  S.selected.forEach((n) => { board()[n - 1] = false; });
  S.selected = [];
  S.dice = null;
  S.thrown = nextActiveIdx() !== S.current; // Mitspieler vorhanden → erst weitergeben
  save(); render();
  afterTilesChanged(wasOneDie);
}

function askEndTurn() {
  const p = currentPlayer();
  const minus = openSum();
  showModal(`
    <h3>Ende für <span style="color:${playerHex(p)}">${esc(playerName(p))}</span>?</h3>
    <p>Offene Klappen: ${openTiles().join(', ') || '–'}</p>
    <div class="big-minus">−${minus}</div>
    <p style="text-align:center">Minuspunkte werden notiert.</p>
  `, [
    { label: '✗ Nein', cls: 'btn-ghost' },
    { label: '✓ Ja', cls: 'btn-primary', onClick: () => finishTurn(minus) },
  ]);
}

function finishTurn(minus) {
  Sound.play('end');
  currentPlayer().scores.push(minus);
  passTurn();
}

function shutTheBox() {
  if (S.phase !== 'play' || openTiles().length !== 0) return;
  const p = currentPlayer();
  p.scores.push(0);
  S.phase = 'shut';
  save(); render();
  showShutTheBox(p, () => {
    if (S.settings.shutWins) endGame([p], true);
    else passTurn();
  });
}

/** Nach jedem Wurf: an den nächsten Spieler weitergeben, der noch im Spiel ist. */
function passTurn() {
  S.phase = 'play';
  const next = nextActiveIdx();
  if (next === null) return endRound();
  if (next !== S.current) buzz(25);
  S.current = next;
  startTurn();
}

function endRound() {
  if (S.round >= S.settings.rounds) return endGame();
  S.round++;
  S.startSeat = (S.startSeat + 1) % S.players.length; // Startspieler rotiert je Runde
  toast(`Runde ${S.round} beginnt`);
  startRound();
}

function endGame(forcedWinners, byShut) {
  let winners = forcedWinners;
  if (!winners) {
    const best = Math.min(...S.players.map(total));
    winners = S.players.filter((p) => total(p) === best);
  }
  S.phase = 'over';
  S.winners = winners.map((p) => S.players.indexOf(p));
  S.byShut = !!byShut;
  save(); render();
  showWinner(winners, byShut);
}

function newGame(keepSettings = true) {
  hideModal(); hideFx();
  S = freshState(keepSettings ? S.settings : undefined);
  save(); render();
}

function rematch() {
  hideModal(); hideFx();
  S.phase = 'starter';
  save(); render();
}

/* ---------------- Rendering ---------------- */

function render() {
  releaseWakeLock();
  switch (S.phase) {
    case 'setup': return renderSetup();
    case 'starter': return renderStarter();
    case 'play': case 'shut': requestWakeLock(); return renderPlay();
    case 'over': return renderOver();
  }
}

function seg(name, options, current) {
  return `<div class="seg" role="group">${options.map(([v, label]) =>
    `<button type="button" data-set="${name}" data-val="${v}" aria-pressed="${String(v) === String(current)}">${label}</button>`
  ).join('')}</div>`;
}

function renderSetup() {
  const st = S.settings;
  $app.innerHTML = `
    <h1 class="logo">SHUT THE BOX</h1>
    <p class="subtitle">Würfelspiel-Begleiter für 1–4 Spieler</p>

    <div class="setup-grid">
      <section class="card">
        <h2>Spieleranzahl</h2>
        ${seg('playerCount', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], st.playerCount)}
        <div class="player-rows" style="margin-top:14px">
          ${Array.from({ length: st.playerCount }, (_, i) => `
            <label class="player-row">
              <span class="dot" style="background:${COLORS[i].hex}"></span>
              <input type="text" maxlength="16" data-name="${i}" value="${esc(st.names[i] || '')}"
                     placeholder="${COLORS[i].name}" aria-label="Name Spieler ${COLORS[i].name}" autocomplete="off">
            </label>`).join('')}
        </div>
      </section>

      <section class="card">
        <h2>Würfel</h2>
        ${seg('digitalDice', [[false, '🎲 Echt'], [true, '📱 App']], st.digitalDice)}
        <h2 style="margin-top:18px">Klappen</h2>
        ${seg('maxTile', [[9, '1 – 9'], [10, '1 – 10'], [12, '1 – 12']], st.maxTile)}
        <h2 style="margin-top:18px">Runden</h2>
        ${seg('rounds', [[1, '1'], [3, '3'], [5, '5']], st.rounds)}
        <h2 style="margin-top:18px">Ton</h2>
        ${seg('sound', [[true, '🔊 An'], [false, '🔇 Aus']], st.sound !== false)}
        <label class="check">
          <input type="checkbox" data-check="shutWins" ${st.shutWins ? 'checked' : ''}>
          <span>„Shut the Box“ gewinnt das Spiel sofort</span>
        </label>
      </section>
    </div>

    <button class="btn btn-primary btn-block" data-action="next">Los ➜</button>

    <details class="rules card">
      <summary>Spielregeln</summary>
      <p>Alle Klappen (1–${st.maxTile}) sind zu Beginn offen. Der aktive Spieler würfelt mit zwei Würfeln
      und legt eine beliebige Kombination offener Klappen um, deren Summe der Augenzahl entspricht
      (z.&nbsp;B. bei 8: „8“, „7+1“, „5+3“ oder „4+3+1“).</p>
      <p>Sind alle Klappen ab 7 aufwärts geschlossen, wird nur noch mit einem Würfel weitergespielt – die App weist darauf hin.</p>
      <p>Kann keine passende Kombination mehr umgelegt werden, ist die Runde für den Spieler vorbei.
      Die Summe der noch offenen Klappen zählt als Minuspunkte. Wer am Ende die wenigsten Minuspunkte hat, gewinnt.</p>
      <p>Wer alle Klappen schließt, hat <strong>„Shut the Box“</strong> geschafft – 0 Minuspunkte
      (und je nach Einstellung den sofortigen Sieg).</p>
      <p><strong>Mehrere Spieler:</strong> Jeder hat ein eigenes Klappenbrett. Nach jedem Wurf wird mit
      „➜ Name“ an den nächsten Spieler weitergegeben. Wer nicht mehr kann, tippt „✋ Ende“ und
      scheidet für diese Runde aus – die anderen spielen weiter.</p>
      <p><strong>Echte Würfel:</strong> Einfach würfeln und die Klappen in der App antippen. Ein erneutes Tippen öffnet eine Klappe wieder.</p>
    </details>
  `;
}

function renderStarter() {
  $app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Zurück">←</button>
      <span class="round">Spielvorbereitung</span>
      <span style="width:44px"></span>
    </div>
    <h1 class="logo" style="font-size:clamp(1.6rem,6vw,2.4rem)">Wer fängt an?</h1>
    <p class="subtitle">Tippe auf die Farbe des Startspielers.</p>
    <div class="starter-grid">
      ${S.players.map((p, i) => `
        <button class="starter" style="--c:${playerHex(p)}" data-start="${i}">
          ${esc(playerName(p))}
          ${p.name.trim() ? `<small>${COLORS[p.color].name}</small>` : ''}
        </button>`).join('')}
    </div>
    ${S.players.length > 1 ? `<button class="btn btn-ghost btn-block" data-action="random-start">🎲 Zufall</button>` : ''}
  `;
}

function renderPlay() {
  const p = currentPlayer();
  const hex = playerHex(p);
  document.documentElement.style.setProperty('--player', hex);
  const st = S.settings;
  const digital = st.digitalDice;
  const tiles = board();
  const minus = openSum();
  const nextIdx = nextActiveIdx();
  const nextP = nextIdx !== null && nextIdx !== S.current ? S.players[nextIdx] : null;

  let diceHtml = '';
  let noMove = false;
  if (digital) {
    if (S.dice) {
      const target = S.dice.reduce((a, b) => a + b, 0);
      const selSum = S.selected.reduce((a, b) => a + b, 0);
      noMove = !canMake(target, openTiles());
      diceHtml = `
        <section class="dice-area card">
          <div class="dice-row">${S.dice.map((d) => dieHtml(d, S.justRolled)).join('')}</div>
          <div class="dice-sum">Augensumme <strong>${target}</strong>
            ${noMove ? '' : ` · Auswahl <strong style="color:${selSum === target ? '#7ee2a8' : selSum > target ? '#ff8a8d' : 'var(--text)'}">${selSum}</strong>`}</div>
          ${noMove
            ? `<div class="notice">Geht nicht. Tippe ✋ Ende.</div>`
            : `<button class="btn btn-player" data-action="confirm" ${selSum === target ? '' : 'disabled'}>✓ OK</button>`}
        </section>`;
    } else if (S.thrown) {
      diceHtml = `
        <section class="dice-area card">
          <div class="dice-row" style="color:var(--muted)">Gib weiter ➜</div>
        </section>`;
    } else {
      diceHtml = `
        <section class="dice-area card">
          <div class="dice-row" style="color:var(--muted)">Würfle!</div>
          <div class="dice-buttons">
            ${oneDieAllowed()
              ? `<button class="btn btn-player" data-roll="1">🎲 Würfeln</button>
                 <button class="btn btn-ghost" data-roll="2" aria-label="Mit zwei Würfeln würfeln">🎲🎲</button>`
              : `<button class="btn btn-player" data-roll="2">🎲🎲 Würfeln</button>`}
          </div>
        </section>`;
    }
  }

  $app.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" data-action="menu" aria-label="Menü">☰</button>
      <span class="round">${st.rounds > 1 ? `Runde ${S.round} / ${st.rounds}` : 'Shut the Box'}</span>
      <span class="topbar-right">
        <button class="icon-btn" data-action="sound" aria-label="Ton an oder aus">${st.sound !== false ? '🔊' : '🔇'}</button>
        <button class="icon-btn" data-action="scores" aria-label="Punktestand">📋</button>
      </span>
    </div>

    <div class="players">
      ${S.players.map((pl) => {
        const played = isOut(S.players.indexOf(pl));
        return `
        <div class="chip ${pl === p ? 'active' : ''}" style="--c:${playerHex(pl)}">
          <span class="dot" style="background:${playerHex(pl)}"></span>
          <span class="name">${esc(playerName(pl))}</span>
          ${played && pl !== p ? '<span class="done">✓</span>' : ''}
          <span class="score">${total(pl) ? '−' + total(pl) : '0'}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="turn-banner">${esc(playerName(p))} ist dran</div>

    <div class="box" data-max="${st.maxTile}" style="--c:${hex}">
      <div class="box-inner">
        ${tiles.map((open, i) => {
          const n = i + 1;
          const sel = S.selected.includes(n);
          const disabled = digital && (!S.dice || !open || noMove);
          return `<button class="tile ${open ? '' : 'shut'} ${sel ? 'selected' : ''}" data-tile="${n}"
                    aria-pressed="${!open}" aria-label="Klappe ${n} ${open ? 'offen' : 'geschlossen'}"
                    ${disabled ? 'tabindex="-1" data-locked="1"' : ''}><span>${n}</span></button>`;
        }).join('')}
      </div>
    </div>

    <div class="status">
      <span>Offen: <strong>${openTiles().length}</strong> Klappen</span>
      <span>Minuspunkte aktuell: <strong class="minus">−${minus}</strong></span>
    </div>
    ${oneDieAllowed() && minus > 0 ? `<div class="one-die">🎲 Nur <strong>1 Würfel</strong>!</div>` : ''}

    ${diceHtml}

    ${S.players.length > 1 ? `
      <section class="others">
        <h2>Mitspieler</h2>
        <div class="others-grid">${S.players.map((pl, i) => (pl === p ? '' : miniBoardHtml(pl, i))).join('')}</div>
      </section>` : ''}

    <div class="actions">
      <button class="btn btn-ghost" data-action="undo" ${S.history.length ? '' : 'disabled'} aria-label="Rückgängig">↶</button>
      ${nextP
        ? `<button class="btn btn-pass" style="--c:${playerHex(nextP)}" data-action="pass"
             ${digital && (S.dice || !S.thrown) ? 'disabled' : ''}>
             ➜ ${esc(playerName(nextP))}
           </button>`
        : ''}
      <button class="btn ${noMove ? 'btn-primary' : 'btn-ghost'} btn-end ${nextP ? 'full' : ''}" data-action="end-turn">
        ✋ Ende
      </button>
    </div>
  `;
}

/** Kleines, nicht anklickbares Klappenbrett eines Mitspielers. */
function miniBoardHtml(pl, i) {
  const tiles = board(i);
  const played = isOut(i);
  const minus = openSum(tiles);
  return `
    <div class="mini ${played ? 'finished' : ''}" style="--c:${playerHex(pl)}" aria-label="Klappen von ${esc(playerName(pl))}">
      <div class="mini-head">
        <span class="dot" style="background:${playerHex(pl)}"></span>
        <span class="name">${esc(playerName(pl))}</span>
        <span class="mini-state">${played ? '✓ fertig' : ''}</span>
        <span class="minus">−${minus}</span>
      </div>
      <div class="mini-box" data-max="${S.settings.maxTile}">
        ${tiles.map((open, k) => `<span class="mini-tile ${open ? '' : 'shut'}">${k + 1}</span>`).join('')}
      </div>
    </div>`;
}

function dieHtml(v, animate) {
  const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[v];
  return `<div class="die ${animate ? 'rolling' : ''}" aria-label="Würfel ${v}">${
    Array.from({ length: 9 }, (_, i) => `<i class="${pips.includes(i) ? 'on' : ''}"></i>`).join('')
  }</div>`;
}

function scoreTableHtml() {
  const rounds = S.settings.rounds;
  const ranked = S.players.slice().sort((a, b) => total(a) - total(b));
  const winnerSet = new Set((S.winners || []).map((i) => S.players[i]));
  return `
    <table class="score-table">
      <thead><tr><th>Spieler</th>${rounds > 1 ? Array.from({ length: rounds }, (_, i) => `<th>R${i + 1}</th>`).join('') : ''}<th>Gesamt</th></tr></thead>
      <tbody>
        ${ranked.map((p) => `
          <tr class="${winnerSet.has(p) ? 'winner' : ''}">
            <td><span class="who"><span class="dot" style="background:${playerHex(p)}"></span>${esc(playerName(p))}</span></td>
            ${rounds > 1 ? Array.from({ length: rounds }, (_, i) => `<td>${p.scores[i] === undefined ? '·' : p.scores[i] === 0 ? '0' : '−' + p.scores[i]}</td>`).join('') : ''}
            <td class="total">${total(p) ? '−' + total(p) : '0'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderOver() {
  const winners = (S.winners || []).map((i) => S.players[i]);
  $app.innerHTML = `
    <h1 class="logo">SPIELENDE</h1>
    <p class="subtitle">${S.byShut ? 'Gewonnen durch „Shut the Box“!' : winners.length > 1 ? 'Unentschieden!' : `${esc(playerName(winners[0]))} gewinnt!`}</p>
    <section class="card">${scoreTableHtml()}</section>
    <button class="btn btn-primary btn-block" data-action="rematch">🔁 Nochmal</button>
    <button class="btn btn-ghost btn-block" data-action="new">✨ Neu</button>
    <button class="btn btn-ghost btn-block" data-action="replay-fx">🏆 Feiern</button>
  `;
}

/* ---------------- Events ---------------- */

$app.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.dataset.set) {
    const key = t.dataset.set;
    let v = t.dataset.val;
    v = v === 'true' ? true : v === 'false' ? false : Number(v);
    S.settings[key] = v;
    save(); render();
    return;
  }
  if (t.dataset.start !== undefined) return startGame(Number(t.dataset.start));
  if (t.dataset.tile !== undefined) {
    const n = Number(t.dataset.tile);
    if (S.phase !== 'play') return;
    if (S.settings.digitalDice) { if (!t.dataset.locked) { Sound.play('select'); toggleSelect(n); } }
    else { Sound.play(board()[n - 1] ? 'tileDown' : 'tileUp'); toggleTile(n); }
    return;
  }
  if (t.dataset.roll) { Sound.play('dice'); return roll(Number(t.dataset.roll)); }
  if (t.dataset.action === 'confirm') Sound.play('tileDown');
  else if (t.dataset.action === 'pass') Sound.play('pass');
  else if (t.dataset.action !== 'sound') Sound.play('click');

  switch (t.dataset.action) {
    case 'next': return goToStarter();
    case 'back': S.phase = 'setup'; save(); return render();
    case 'random-start': return randomStart();
    case 'undo': return undo();
    case 'confirm': return confirmSelection();
    case 'end-turn': return askEndTurn();
    case 'pass': return passTurn();
    case 'sound':
      S.settings.sound = S.settings.sound === false;
      save(); render();
      return Sound.play('click');
    case 'menu': return showMenu();
    case 'scores': return showModal(`<h3>Punktestand</h3>${scoreTableHtml()}`, [{ label: '✓ OK', cls: 'btn-primary' }]);
    case 'rematch': return rematch();
    case 'new': return newGame();
    case 'replay-fx': return showWinner((S.winners || []).map((i) => S.players[i]), S.byShut);
  }
});

$app.addEventListener('input', (e) => {
  const i = e.target.dataset.name;
  if (i !== undefined) { S.settings.names[Number(i)] = e.target.value; save(); }
});
$app.addEventListener('change', (e) => {
  const k = e.target.dataset.check;
  if (k) { S.settings[k] = e.target.checked; save(); }
});

function randomStart() {
  const btns = [...$app.querySelectorAll('.starter')];
  const pick = Math.floor(Math.random() * btns.length);
  let i = 0;
  const steps = btns.length * 4 + pick; // endet auf dem ausgelosten Spieler
  const tick = () => {
    btns.forEach((b, j) => { b.style.transform = j === i % btns.length ? 'scale(1.08)' : 'scale(.92)'; b.style.opacity = j === i % btns.length ? '1' : '.5'; });
    if (i >= steps) { setTimeout(() => startGame(i % btns.length), 500); return; }
    i++;
    setTimeout(tick, 60 + i * 8);
  };
  tick();
}

function showMenu() {
  showModal(`<h3>Menü</h3><p>Das laufende Spiel wird automatisch gespeichert.</p>`, [
    { label: '✨ Neu', cls: 'btn-ghost', onClick: () => confirmNew() },
    { label: '▶ Weiter', cls: 'btn-primary' },
  ]);
}

function confirmNew() {
  setTimeout(() => showModal(`<h3>Spiel abbrechen?</h3><p>Der aktuelle Spielstand geht verloren.</p>`, [
    { label: '✗ Nein', cls: 'btn-ghost' },
    { label: '✓ Ja', cls: 'btn-primary', onClick: () => newGame() },
  ]), 0);
}

/* ---------------- Modal ---------------- */

function showModal(html, buttons) {
  const card = $modal.querySelector('.modal-card');
  card.innerHTML = `${html}<div class="modal-actions">${buttons.map((b, i) =>
    `<button class="btn ${b.cls || ''}" data-mi="${i}">${b.label}</button>`).join('')}</div>`;
  card.querySelectorAll('[data-mi]').forEach((el) => {
    el.addEventListener('click', () => {
      Sound.play('click');
      hideModal();
      const b = buttons[Number(el.dataset.mi)];
      if (b.onClick) b.onClick();
    });
  });
  $modal.hidden = false;
  card.querySelector('.btn-primary')?.focus();
}
function hideModal() { $modal.hidden = true; }
$modal.addEventListener('click', (e) => { if (e.target === $modal) hideModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$modal.hidden) hideModal(); });

function toast(text, ms = 1600) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 60,
    background: 'rgba(0,0,0,.8)', color: '#fff', padding: '10px 18px', borderRadius: '999px',
    fontWeight: '700', boxShadow: '0 6px 20px rgba(0,0,0,.4)', transition: 'opacity .4s',
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, ms);
  setTimeout(() => el.remove(), ms + 500);
}

/* ---------------- Effekte ---------------- */

const fxCanvas = document.getElementById('fx-canvas');
const fxCtx = fxCanvas.getContext('2d');
let particles = [];
let fxRaf = 0;
let fxSpawner = 0;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = innerWidth * dpr;
  fxCanvas.height = innerHeight * dpr;
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resizeCanvas);

function fxLoop() {
  fxCtx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
    fxCtx.save();
    fxCtx.globalAlpha = Math.min(1, p.life / 30);
    fxCtx.translate(p.x, p.y);
    fxCtx.rotate(p.rot);
    fxCtx.fillStyle = p.color;
    if (p.kind === 'confetti') fxCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    else { fxCtx.beginPath(); fxCtx.arc(0, 0, p.size, 0, Math.PI * 2); fxCtx.fill(); }
    fxCtx.restore();
  }
  fxRaf = requestAnimationFrame(fxLoop);
}

function confettiBurst(colors, n = 140) {
  for (let i = 0; i < n; i++) {
    particles.push({
      kind: 'confetti', x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, g: 0.05, drag: 0.995,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, size: 8 + Math.random() * 8,
      color: colors[i % colors.length], life: 260 + Math.random() * 120,
    });
  }
}

function firework(x, y, colors) {
  Sound.play('pop');
  const n = 70;
  const speed = 3 + Math.random() * 3;
  const color = colors[Math.floor(Math.random() * colors.length)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = speed * (0.6 + Math.random() * 0.5);
    particles.push({
      kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.04, drag: 0.98,
      rot: 0, vr: 0, size: 2 + Math.random() * 1.5, color, life: 70 + Math.random() * 40,
    });
  }
}

function startFx(html, onDone, setup) {
  hideModal();
  resizeCanvas();
  particles = [];
  $fx.querySelector('.fx-content').innerHTML = html;
  $fx.hidden = false;
  cancelAnimationFrame(fxRaf);
  fxLoop();
  clearInterval(fxSpawner);
  setup();
  const btn = $fx.querySelector('[data-fx-close]');
  btn.addEventListener('click', () => { Sound.play('click'); hideFx(); onDone && onDone(); }, { once: true });
  setTimeout(() => btn.focus(), 2700);
}

function hideFx() {
  $fx.hidden = true;
  clearInterval(fxSpawner);
  cancelAnimationFrame(fxRaf);
  particles = [];
}

function showWinner(winners, byShut) {
  if (!winners || !winners.length) return;
  const names = winners.map((p) => `<span style="--c:${playerHex(p)};color:${playerHex(p)}">${esc(playerName(p))}</span>`).join(' &amp; ');
  const solo = S.players.length === 1;
  const w = winners[0];
  const html = `
    <div class="trophy">🏆</div>
    <div class="winner-title">${solo ? 'Dein Ergebnis' : winners.length > 1 ? 'Gleichstand – Sieger' : 'Sieger'}</div>
    <div class="winner-name" style="--c:${playerHex(w)}">${names}</div>
    <div class="winner-score">${byShut ? 'durch „Shut the Box“!' : `mit ${total(w) ? '−' + total(w) : '0'} Minuspunkten`}</div>
    <button class="btn btn-primary" data-fx-close>Weiter</button>`;
  const colors = winners.map(playerHex).concat(['#f5c542', '#ffffff']);
  startFx(html, null, () => {
    confettiBurst(colors, 180);
    fxSpawner = setInterval(() => {
      confettiBurst(colors, 40);
      firework(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.1 + Math.random() * 0.35), colors);
    }, 900);
  });
  buzz([60, 40, 60, 40, 120]);
  setTimeout(() => Sound.play('win'), 700); // nach dem "Ende"-Ton, wenn der Pokal landet
}

function showShutTheBox(p, onDone) {
  const words = ['SHUT', 'THE', 'BOX'];
  let k = 0;
  const text = words.map((w) => `<span class="word">${[...w].map((c) =>
    `<span class="ch" style="animation-delay:${1.4 + (k++) * 0.08}s, ${2.4 + k * 0.08}s">${c}</span>`).join('')}</span>`).join('');
  const html = `
    <div class="stb-box">
      <div class="stb-base">${Array.from({ length: 9 }, (_, i) => `<span style="animation-delay:${i * 0.05}s"></span>`).join('')}</div>
      <div class="stb-lid">★</div>
    </div>
    <div class="stb-text">${text}</div>
    <div class="stb-sub"><strong style="color:${playerHex(p)}">${esc(playerName(p))}</strong> hat alle Klappen geschlossen – 0 Minuspunkte!</div>
    <button class="btn btn-primary" data-fx-close>Weiter</button>`;
  const colors = ['#f5c542', '#fff3b0', '#ffffff', playerHex(p), '#ff9f43'];
  startFx(html, onDone, () => {
    setTimeout(() => {
      for (let i = 0; i < 5; i++) setTimeout(() => firework(innerWidth * (0.1 + Math.random() * 0.8), innerHeight * (0.1 + Math.random() * 0.5), colors), i * 120);
      confettiBurst(colors, 200);
    }, 1150);
    fxSpawner = setInterval(() => {
      firework(innerWidth * (0.1 + Math.random() * 0.8), innerHeight * (0.1 + Math.random() * 0.4), colors);
    }, 450);
  });
  buzz([200, 80, 200, 80, 400]);
  Sound.play('shut');
}

/* ---------------- Sound (Web Audio, synthetisch – keine Dateien, keine Stimmen) ---------------- */

const Sound = (() => {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  const on = () => S.settings.sound !== false;

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.6;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  /** Einzelner Ton mit kurzer Hüllkurve. */
  function tone(freq, start, dur, { type = 'sine', vol = 0.3, slideTo = 0, attack = 0.006 } = {}) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Gefiltertes Rauschen (Holz-Klack, Würfelklappern, Knall). */
  function noise(start, dur, { vol = 0.3, freq = 2000, q = 1, type = 'bandpass' } = {}) {
    const c = ctx(); if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.8), c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + start;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  const fx = {
    // kurzer, weicher Tick für normale Knöpfe
    click() { tone(720, 0, 0.07, { type: 'triangle', vol: 0.14 }); },
    // Holzklappe fällt um
    tileDown() {
      noise(0, 0.07, { vol: 0.55, freq: 1400, q: 2.5 });
      tone(190, 0, 0.14, { vol: 0.4, slideTo: 85 });
    },
    // Klappe wieder hochgestellt
    tileUp() {
      noise(0, 0.04, { vol: 0.3, freq: 2600, q: 3 });
      tone(320, 0, 0.09, { type: 'triangle', vol: 0.15, slideTo: 460 });
    },
    // Auswahl einer Klappe (digitale Würfel)
    select() { tone(540, 0, 0.06, { type: 'triangle', vol: 0.15, slideTo: 640 }); },
    // Würfelklappern
    dice() {
      for (let i = 0; i < 8; i++) {
        const st = i * 0.045 + Math.random() * 0.025;
        noise(st, 0.035, { vol: 0.45 - i * 0.04, freq: 2500 + Math.random() * 2500, q: 4 });
        tone(900 + Math.random() * 600, st, 0.03, { type: 'square', vol: 0.03 });
      }
    },
    // an den nächsten Spieler weitergeben
    pass() {
      tone(523, 0, 0.12, { type: 'triangle', vol: 0.2 });
      tone(784, 0.09, 0.2, { type: 'triangle', vol: 0.2 });
    },
    // Hinweis "Nur 1 Würfel"
    ding() {
      tone(1046, 0, 0.5, { vol: 0.18 });
      tone(1568, 0.1, 0.6, { vol: 0.12 });
    },
    // Ende für einen Spieler (absteigend, freundlich)
    end() {
      tone(392, 0, 0.22, { type: 'triangle', vol: 0.22 });
      tone(330, 0.2, 0.22, { type: 'triangle', vol: 0.22 });
      tone(262, 0.4, 0.55, { type: 'triangle', vol: 0.22, slideTo: 240 });
    },
    // Sieger-Fanfare
    win() {
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.13, 0.22, { type: 'square', vol: 0.08 }));
      tone(1046, 0.39, 0.25, { type: 'square', vol: 0.08 });
      tone(784, 0.62, 0.14, { type: 'square', vol: 0.08 });
      [523, 659, 784, 1046].forEach((f) => tone(f, 0.78, 1.4, { type: 'triangle', vol: 0.1 }));
      [0.9, 1.25, 1.6].forEach((st) => noise(st, 0.5, { vol: 0.12, freq: 5000, q: 0.6, type: 'highpass' }));
    },
    // Shut the Box: Klappen fallen, Deckel knallt zu, große Fanfare
    shut() {
      for (let i = 0; i < 9; i++) noise(i * 0.05, 0.05, { vol: 0.35, freq: 1400, q: 2.5 });
      tone(110, 1.12, 0.45, { vol: 0.7, slideTo: 45 });
      noise(1.12, 0.2, { vol: 0.7, freq: 500, q: 0.8, type: 'lowpass' });
      const f = [392, 523, 659, 784, 659, 784, 1046];
      const tm = [1.45, 1.6, 1.75, 1.9, 2.1, 2.2, 2.35];
      f.forEach((fr, i) => tone(fr, tm[i], i === f.length - 1 ? 1.6 : 0.18, { type: 'square', vol: 0.08 }));
      [523, 659, 784, 1046].forEach((fr) => tone(fr, 2.35, 1.8, { type: 'triangle', vol: 0.11 }));
      for (let i = 0; i < 6; i++) tone(2000 + i * 220, 2.5 + i * 0.07, 0.25, { vol: 0.05 });
    },
    // leiser Feuerwerks-Knall
    pop() { noise(0, 0.3, { vol: 0.12, freq: 700, q: 0.7, type: 'lowpass' }); },
  };

  return {
    play(name) { if (!on()) return; try { fx[name](); } catch { /* Audio nicht verfügbar */ } },
    unlock() { if (on()) { try { ctx(); } catch { /* egal */ } } },
  };
})();

// Browser erlauben Audio erst nach einer Berührung → beim ersten Tippen freischalten
document.addEventListener('pointerdown', () => Sound.unlock(), { passive: true });

/* ---------------- Helfer ---------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buzz(pattern = 12) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* egal */ }
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { wakeLock = null; }
}
function releaseWakeLock() {
  if (wakeLock && !['play', 'shut'].includes(S.phase)) { wakeLock.release(); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ['play', 'shut'].includes(S.phase)) requestWakeLock();
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ---------------- Start ---------------- */
render();
// Nach Reload während der Shut-the-Box-Animation: Animation fortsetzen
if (S.phase === 'shut') showShutTheBox(currentPlayer(), () => {
  if (S.settings.shutWins) endGame([currentPlayer()], true); else passTurn();
});
