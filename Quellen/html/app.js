/* Oberfläche: Übersicht, Bearbeiten, Prüfung. Keine externen Dateien, kein Netz. */
const KEY = 'pruefziffer-trainer.v1';
let memory = [];
let storageOk = true;

function loadAll() {
  try {
    const s = localStorage.getItem(KEY);
    memory = s ? JSON.parse(s).map(sanitize) : memory;
  } catch (e) { storageOk = false; }
  return clone(memory);
}

function saveAll(list) {
  memory = clone(list);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { storageOk = false; }
}

const state = { view: 'list', index: -1, edit: null, exam: null, result: null, solution: false, answers: [], evaluated: false };
const app = document.getElementById('app');

/** Kleiner DOM-Baukasten – Texte werden nie als HTML eingefügt. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

function select(values, current, onchange, label) {
  return h('select', { 'aria-label': label, onchange: e => onchange(Number(e.target.value)) },
    values.map(v => h('option', { value: v, selected: v === current }, v)));
}

function field(label, control) {
  return h('label', { class: 'field' }, h('span', {}, label), control);
}

function summary(e) {
  const blocks = e.lines.reduce((n, l) => n + l.blocks.length, 0);
  return e.lines.length + ' Zeilen × ' + e.lineLength + ' Zeichen · ' + blocks + ' Blöcke · Gewichte ' + e.weights.join('-')
    + (e.timeLimit ? ' · ⏱ ' + e.timeLimit + ' min' : '');
}

function go(view, extra) {
  Object.assign(state, { view }, extra || {});
  render();
  window.scrollTo(0, 0);
}

/** Darf hier geübt, angelegt und bearbeitet werden? Bei abgeschaltetem Übungsmodus nur der angemeldete Prüfer. */
function canManage() { return practiceAllowed() || !!state.admin; }

function render() {
  if (state.view === 'edit' && !canManage()) state.view = 'list';
  if (state.view === 'exam' && !state.locked && !canManage()) state.view = 'list';
  const v = state.view;
  app.replaceChildren(v === 'edit' ? editView() : v === 'exam' ? examView() : v === 'pin' ? pinView() : v === 'explain' ? explainView() : listView());
}

// ------------------------------------------------------------------ Raster

/** Zellen je Zeile mit Art (Daten, Füllzeichen, Prüfziffer) und Aufgabennummer. */
function buildCells(e) {
  const rows = [];
  let slot = 0;
  const last = e.lines.length - 1;
  e.lines.forEach((l, li) => {
    const cells = [];
    l.blocks.forEach((b, bi) => {
      for (let i = 0; i < b.length; i++) cells.push({ ch: b.content[i] || '·', type: b.content[i] ? 'data' : 'empty' });
      cells.push({ ch: '?', type: 'cd', slot: ++slot });
      if (bi < l.blocks.length - 1) for (let i = 0; i < b.fillAfter; i++) cells.push({ ch: '<', type: 'fill' });
    });
    const tail = (l.lineCheck ? 1 : 0) + (li === last ? 1 : 0);
    while (cells.length + tail < e.lineLength) cells.push({ ch: '<', type: 'fill' });
    if (l.lineCheck) cells.push({ ch: '?', type: 'cd', slot: ++slot });
    if (li === last) cells.push({ ch: '?', type: 'cd', slot: ++slot });
    cells.forEach((c, i) => { if (i >= e.lineLength) c.over = true; });
    rows.push(cells);
  });
  return rows;
}

function grid(e, opts) {
  const rows = buildCells(e);
  const width = Math.max(e.lineLength, ...rows.map(r => r.length));
  const head = h('tr', {}, h('th', { class: 'corner' }, ''),
    range(1, width).map(i => h('th', { class: 'col' + (i > e.lineLength ? ' over' : '') }, 'S' + i)));
  const body = rows.map((cells, li) => h('tr', {}, h('th', { class: 'row' }, 'Z' + (li + 1)),
    range(0, width - 1).map(i => {
      const c = cells[i];
      if (!c) return h('td', { class: 'blank' }, '');
      let cls = c.type + (c.over ? ' over' : '');
      let content = [c.ch];
      if (c.type === 'cd') {
        const s = opts && opts.result ? opts.result.slots[c.slot - 1] : null;
        if (s && opts.solution) {
          content = [String(s.digit)];
          cls += ' solved';
        } else {
          content = ['?', h('small', {}, c.slot)];
        }
        if (s && opts.evaluated) {
          const a = state.answers[c.slot - 1];
          cls += a === String(s.digit) ? ' right' : ' wrong';
        }
      }
      return h('td', { class: cls, title: c.type === 'cd' ? 'Aufgabe ' + c.slot : null }, content);
    })));
  return h('div', { class: 'gridwrap' + (opts && opts.watermark ? ' muster' : '') },
    h('table', { class: 'grid', 'aria-label': 'Beispiel-MRZ' }, h('thead', {}, head), h('tbody', {}, body)));
}

// ------------------------------------------------------------------ Übersicht

function listView() {
  const list = loadAll();
  const manage = canManage();
  const practiceOn = practiceAllowed();
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importFile });
  const box = h('section', {},
    h('p', { class: 'lead' }, 'Prüfziffern im Kopf und auf Papier berechnen – der Trainer rechnet nach.'),
    state.admin ? h('p', { class: 'adminbanner' }, '🔑 Als Prüfer angemeldet' + (practiceOn ? '' : ' – Übungsmodus für alle ist abgeschaltet') + '. ',
      h('button', { class: 'linkish', onclick: logout }, 'Abmelden')) : null,
    !practiceOn && !state.admin ? h('p', { class: 'lockbanner' },
      'Der Übungsmodus ist vom Prüfer abgeschaltet. Prüfungen anlegen und üben kann nur der Prüfer.') : null,
    h('div', { class: 'bar' },
      manage ? h('button', { class: 'primary', onclick: () => go('edit', { index: -1, edit: example() }) }, 'Neue Prüfung') : null,
      manage ? h('button', { onclick: exportAll, disabled: !list.length }, 'Exportieren') : null,
      manage ? h('button', { onclick: () => fileInput.click() }, 'Importieren') : null,
      h('button', { onclick: () => go('explain') }, '📖 Erklärung'),
      h('button', { onclick: () => go('pin', { pinMsg: '' }) },
        state.admin ? '🔑 Prüfer-Einstellungen' : hasPin() ? '🔑 Prüfer' : '🔑 Prüfer-PIN festlegen'),
      fileInput),
    storageOk ? null : h('p', { class: 'warn' },
      'Dieser Browser erlaubt hier kein dauerhaftes Speichern. Prüfungen gehen beim Schließen verloren – vorher exportieren.'),
    h('h2', {}, 'Gespeicherte Prüfungen'),
    list.length ? null : h('p', { class: 'muted' }, 'Noch keine Prüfung gespeichert.'),
    list.map((e, i) => h('article', { class: 'card' },
      h('div', { class: 'cardtext' }, h('strong', {}, e.name), h('span', { class: 'muted' }, summary(e))),
      h('div', { class: 'bar small' },
        manage ? h('button', { class: 'primary', onclick: () => openExam(i) }, 'Üben') : null,
        h('button', { class: manage ? null : 'primary', onclick: () => startLocked(clone(list[i]), i) }, '🔒 Prüfung'),
        manage ? h('button', { onclick: () => go('edit', { index: i, edit: clone(list[i]) }) }, 'Bearbeiten') : null,
        manage ? h('button', { onclick: () => { const c = clone(e); c.name += ' (Kopie)'; list.push(c); saveAll(list); render(); } }, 'Kopieren') : null,
        manage ? h('button', { class: 'danger', onclick: () => {
          if (confirm('„' + e.name + '“ löschen?')) { list.splice(i, 1); saveAll(list); render(); }
        } }, 'Löschen') : null))),
    h('p', { class: 'muted note' }, manage
      ? 'Üben: Auswerten und Lösung jederzeit selbst. 🔒 Prüfung: Ergebnis und Lösung gibt nur der Prüfer mit seinem PIN frei.'
      : '🔒 Prüfung: Ergebnis und Lösung gibt der Prüfer mit seinem PIN frei.'),
    manage ? h('p', { class: 'muted note' },
      'Gespeichert wird nur in diesem Browser auf diesem Gerät. Zum Mitnehmen (USB-Stick, anderer PC, Handy) exportieren und dort importieren.') : null);
  return box;
}

function logout() {
  state.admin = false;
  go('list', { pinMsg: '' });
}

function exportAll() {
  const data = JSON.stringify(loadAll(), null, 1);
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })),
    download: 'pruefungen-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  f.text().then(text => {
    let data = JSON.parse(text);
    if (!Array.isArray(data)) data = [data];
    const list = loadAll();
    let ok = 0;
    data.forEach(o => { const e = sanitize(o); if (!validate(e).length) { list.push(e); ok++; } });
    saveAll(list);
    alert(ok + ' Prüfung(en) importiert' + (ok < data.length ? ', ' + (data.length - ok) + ' fehlerhaft übersprungen.' : '.'));
    render();
  }).catch(() => alert('Datei konnte nicht gelesen werden.'));
}

// ------------------------------------------------------------------ Bearbeiten

function editView() {
  const e = state.edit;
  const last = e.lines.length - 1;
  const preview = h('div', {});
  const status = h('p', { class: 'status' });
  const lineStatus = [];
  const rerender = () => { render(); };

  function update() {
    e.lines.forEach((l, li) => {
      const u = used(e, li), free = e.lineLength - u;
      lineStatus[li].textContent = free >= 0
        ? u + ' von ' + e.lineLength + ' Stellen belegt · ' + free + ' Füllzeichen vor dem Zeilenende'
        : 'Zeile ist ' + (-free) + ' Zeichen zu lang';
      lineStatus[li].className = 'linestatus' + (free < 0 ? ' bad' : '');
    });
    const err = validate(e);
    status.textContent = err.length ? err[0] + (err.length > 1 ? ' (+' + (err.length - 1) + ' weitere)' : '') : '✓ Bereit';
    status.className = 'status ' + (err.length ? 'pending' : 'ready');
    preview.replaceChildren(grid(e));
  }

  const lines = e.lines.map((l, li) => {
    lineStatus[li] = h('p', { class: 'linestatus' });
    return h('fieldset', {},
      h('legend', {}, 'Zeile ' + (li + 1)),
      h('div', { class: 'row2' },
        field('Blöcke', select(range(LIM.minBlocks, LIM.maxBlocks), l.blocks.length, n => {
          while (l.blocks.length < n) l.blocks.push({ length: 7, fillAfter: 2, content: '' });
          l.blocks.length = n;
          rerender();
        }, 'Blöcke Zeile ' + (li + 1))),
        h('label', { class: 'checkline' }, h('input', { type: 'checkbox', checked: l.lineCheck,
          onchange: ev => { l.lineCheck = ev.target.checked; update(); } }), ' Zeilenprüfziffer am Zeilenende')),
      li === last ? h('p', { class: 'muted' }, 'Die Gesamtprüfziffer steht an der letzten Stelle dieser Zeile.') : null,
      l.blocks.map((b, bi) => h('div', { class: 'block' },
        h('div', { class: 'blockhead' }, 'Block ' + (bi + 1)),
        h('div', { class: 'row2' },
          field('Zeichen (ohne Prüfziffer)', select(range(LIM.minBlockLen, LIM.maxBlockLen), b.length, n => {
            b.length = n;
            b.content = b.content.slice(0, n);
            rerender();
          }, 'Zeichen Block')),
          bi < l.blocks.length - 1
            ? field('Füllzeichen danach', select(range(0, LIM.maxFill), b.fillAfter, n => { b.fillAfter = n; update(); }, 'Füllzeichen'))
            : null),
        h('input', { class: 'content', value: b.content, maxlength: b.length, spellcheck: 'false', autocomplete: 'off',
          autocapitalize: 'characters', placeholder: b.length + ' Zeichen: 0–9, A–Z, <', 'aria-label': 'Zeichen Block ' + (bi + 1),
          oninput: ev => {
            const t = ev.target;
            const clean = t.value.toUpperCase().replace(/[^0-9A-Z<]/g, '').slice(0, b.length);
            if (clean !== t.value) t.value = clean;
            b.content = clean;
            update();
          } }))),
      lineStatus[li]);
  });

  const view = h('section', {},
    h('h2', {}, state.index >= 0 ? 'Prüfung bearbeiten' : 'Neue Prüfung'),
    field('Name', h('input', { value: e.name, maxlength: 80, oninput: ev => { e.name = ev.target.value; } })),
    h('fieldset', {}, h('legend', {}, 'Aufbau'),
      h('div', { class: 'row2' },
        field('Zeilen', select(range(LIM.minLines, LIM.maxLines), e.lines.length, n => {
          while (e.lines.length < n) e.lines.push(defaultLine());
          e.lines.length = n;
          rerender();
        }, 'Zeilen')),
        field('Zeichen je Zeile', select(range(LIM.minLineLen, LIM.maxLineLen), e.lineLength, n => { e.lineLength = n; update(); }, 'Zeichen je Zeile')),
        field('Zeitvorgabe', h('select', { 'aria-label': 'Zeitvorgabe', onchange: ev => { e.timeLimit = Number(ev.target.value); } },
          TIME_OPTIONS.map(m => h('option', { value: m, selected: m === (e.timeLimit || 0) }, m ? m + ' min' : 'aus')))))),
    h('fieldset', {}, h('legend', {}, 'Gewichte'),
      h('div', { class: 'row2' },
        field('Anzahl', select(range(LIM.minWeights, LIM.maxWeights), e.weights.length, n => {
          while (e.weights.length < n) e.weights.push(1);
          e.weights.length = n;
          rerender();
        }, 'Anzahl Gewichte')),
        h('div', { class: 'weights' }, e.weights.map((w, wi) =>
          select(ALLOWED_WEIGHTS, w, n => { e.weights[wi] = n; update(); }, 'Gewicht ' + (wi + 1))))),
      h('p', { class: 'muted' }, 'Nur 1, 3, 7 und 9 – die übrigen Zahlen erkennen nicht jeden Fehler. Die Gewichte wiederholen sich der Reihe nach.')),
    lines,
    h('h3', {}, 'Vorschau'),
    preview,
    h('div', { class: 'sticky' },
      status,
      h('div', { class: 'bar' },
        h('button', { onclick: () => { randomFill(e, false); rerender(); } }, '🎲 Würfeln 0–9'),
        h('button', { onclick: () => { randomFill(e, true); rerender(); } }, '🎲 Würfeln 0–Z'),
        h('button', { class: 'primary', onclick: save }, 'Speichern'),
        h('button', { onclick: () => go('list') }, 'Abbrechen'))));

  function save() {
    if (!e.name.trim()) e.name = 'Prüfung';
    const err = validate(e);
    if (err.length) { alert('Noch nicht vollständig:\n\n• ' + err.join('\n• ')); return; }
    const list = loadAll();
    if (state.index >= 0 && state.index < list.length) list[state.index] = e; else list.push(e);
    saveAll(list);
    go('list');
  }

  update();
  return view;
}

// ------------------------------------------------------------------ Prüfung

function openExam(i) {
  const e = loadAll()[i];
  if (!e || validate(e).length) { alert('Diese Prüfung ist unvollständig. Bitte erst bearbeiten.'); return; }
  const result = compute(e);
  go('exam', Object.assign({ index: i, exam: e, result, solution: false, evaluated: false, answers: result.slots.map(() => ''),
    useTimer: !!e.timeLimit }, freshTimer(e, !!e.timeLimit)));
}

/** Neue Aufgabe mit gleichem Aufbau auswürfeln; nur für diese Runde, nichts wird überschrieben. */
function reroll(letters) {
  const e = clone(state.exam);
  randomFill(e, letters);
  e.rolled = true;
  const result = compute(e);
  Object.assign(state, { exam: e, result, solution: false, evaluated: false, answers: result.slots.map(() => '') },
    freshTimer(e, state.useTimer));
  render();
}

function saveRolled() {
  const e = clone(state.exam);
  delete e.rolled;
  e.name = e.name.replace(/ \(gewürfelt\)$/, '') + ' (gewürfelt)';
  const list = loadAll();
  list.push(e);
  saveAll(list);
  state.exam.rolled = false;
  state.exam.name = e.name;
  state.index = list.length - 1;
  render();
}

function examView() {
  if (state.locked) return lockedView();
  const e = state.exam, r = state.result;
  const ok = r.slots.filter((s, i) => state.answers[i] === String(s.digit)).length;
  const inputs = [];

  const rows = r.slots.map((s, i) => {
    const a = state.answers[i];
    const right = a === String(s.digit);
    const inp = h('input', { class: 'answer', value: a, inputmode: 'numeric', maxlength: 1, autocomplete: 'off',
      disabled: state.timeUp, 'aria-label': 'Antwort Aufgabe ' + (i + 1),
      oninput: ev => {
        ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 1);
        state.answers[i] = ev.target.value;
        if (ev.target.value && inputs[i + 1]) inputs[i + 1].focus();
      },
      onkeydown: ev => { if (ev.key === 'Enter' && inputs[i + 1]) inputs[i + 1].focus(); } });
    inputs.push(inp);
    return h('tr', {},
      h('td', { class: 'num' }, i + 1),
      h('td', {}, slotTitle(s)),
      h('td', { class: 'mono' }, place(s.line, s.pos)),
      h('td', { class: 'mono' }, s.range),
      h('td', {}, inp),
      h('td', { class: 'mark ' + (state.evaluated ? (right ? 'right' : 'wrong') : '') },
        state.evaluated ? (right ? '✓' : a ? '✗' : '–') : ''),
      state.solution ? h('td', { class: 'mono solvedcell' }, s.digit) : null);
  });

  return h('section', {},
    h('h2', {}, e.name),
    state.admin && !practiceAllowed() ? h('p', { class: 'adminbanner noprint' }, '🔑 Als Prüfer angemeldet – nach der Besprechung bitte abmelden. ',
      h('button', { class: 'linkish', onclick: logout }, 'Abmelden')) : null,
    e.rolled ? h('p', { class: 'muted' }, '🎲 Ausgewürfelte Zeichen – nur für diese Runde, die gespeicherte Prüfung bleibt unverändert.',
      ' ', h('button', { class: 'linkish', onclick: saveRolled }, 'Als neue Prüfung speichern')) : null,
    h('p', { class: 'muted' }, 'Gewichte ' + e.weights.join('-') + ' (wiederholt) · modulo 10 · Zeichenwerte: 0–9 wie gelesen, A = 10 … Z = 35, < = 0'),
    timerBox(),
    grid(e, { result: r, solution: state.solution, evaluated: state.evaluated, watermark: true }),
    h('h3', {}, 'Aufgaben'),
    h('p', { class: 'muted noprint' }, 'Prüfziffern mit Stift und Papier berechnen, dann eintragen. Die Nummern stehen unter den Fragezeichen.'),
    h('details', { class: 'noprint' }, h('summary', {}, 'Wertetabelle'), valueTable()),
    h('div', { class: 'tablewrap' }, h('table', { class: 'tasks' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', {}, 'Prüfziffer'), h('th', {}, 'Stelle'), h('th', {}, 'über'),
        h('th', {}, 'Antwort'), h('th', {}, ''), state.solution ? h('th', {}, 'Lösung') : null)),
      h('tbody', {}, rows))),
    state.evaluated ? h('p', { class: 'score' }, ok + ' von ' + r.slots.length + ' richtig (' + Math.round(100 * ok / r.slots.length) + ' %)'
      + (state.stoppedAt ? ' · Zeit ' + fmt(state.stoppedAt - state.started) + (state.timeUp ? ' (Zeit abgelaufen)' : '') : '')) : null,
    h('div', { class: 'bar noprint' },
      h('button', { class: 'primary', onclick: () => { state.evaluated = true; stopTimer(); render(); } }, 'Auswerten'),
      h('button', { onclick: () => { state.solution = !state.solution; if (state.solution) { state.evaluated = true; stopTimer(); } render(); } },
        state.solution ? 'Lösung verbergen' : 'Lösung zeigen'),
      h('button', { onclick: () => {
        Object.assign(state, { answers: r.slots.map(() => ''), evaluated: false, solution: false }, freshTimer(e, state.useTimer));
        render();
      } }, 'Leeren'),
      e.timeLimit ? h('button', { onclick: () => {
        state.useTimer = !state.useTimer;
        if (state.useTimer) Object.assign(state, freshTimer(e, true));
        else Object.assign(state, { deadline: 0, stoppedAt: 0, timeUp: false, evaluated: false });   // ohne Zeitdruck weiterrechnen
        render();
      } }, state.useTimer ? '⏱ Zeitvorgabe aus' : '⏱ Zeitvorgabe an') : null,
      h('button', { title: 'Neue Zeichen bei gleichem Aufbau – die gespeicherte Prüfung bleibt unverändert',
        onclick: () => reroll(false) }, '🎲 0–9'),
      h('button', { title: 'Neue Zeichen bei gleichem Aufbau – die gespeicherte Prüfung bleibt unverändert',
        onclick: () => reroll(true) }, '🎲 0–Z'),
      h('button', { onclick: () => window.print() }, 'Drucken'),
      h('button', { onclick: () => go('explain') }, '📖 Erklärung'),
      h('button', { title: 'Diese Aufgabe (auch gewürfelt) als Prüfung sperren',
        onclick: () => startLocked(clone(state.exam), state.index) }, '🔒 Als Prüfung sperren'),
      h('button', { onclick: () => go('list') }, 'Zur Übersicht')),
    h('p', { class: 'muted noprint' }, 'Drucken gibt aus, was gerade zu sehen ist: ohne Lösung als Aufgabenblatt, mit Lösung als Lösungsblatt.'),
    state.solution ? h('div', { class: 'working' },
      h('h3', {}, 'Rechenweg'),
      r.slots.map((s, i) => h('div', { class: 'step' },
        h('strong', {}, (i + 1) + '. ' + slotTitle(s) + ' (' + place(s.line, s.pos) + ', über ' + s.range + ')'),
        h('code', {}, working(s, e.weights))))) : null);
}

// ------------------------------------------------------------------ Zeitvorgabe

let timerEl = null;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Neuer Zeitlauf für Übungsrunden: mit Zeitvorgabe Countdown, sonst Stoppuhr. */
function freshTimer(e, use) {
  const now = Date.now();
  return { started: now, deadline: use && e.timeLimit ? now + e.timeLimit * 60000 : 0, stoppedAt: 0, timeUp: false };
}

function stopTimer() { if (!state.stoppedAt) state.stoppedAt = Date.now(); }

function timerBox() {
  timerEl = h('div', { class: 'timer noprint', role: 'timer', 'aria-live': 'off' });
  tick();
  return timerEl;
}

/** Läuft viermal pro Sekunde; aktualisiert nur die Anzeige, damit Eingaben den Fokus behalten. */
function tick() {
  if (!timerEl || !timerEl.isConnected || state.view !== 'exam') return;
  const now = Date.now();
  let started, deadline, stopped;
  if (state.locked) {
    const lock = state.lock;
    started = lock.startedAt; deadline = lock.deadline; stopped = lock.submitted ? lock.submittedAt : 0;
    if (deadline && !lock.submitted && now >= deadline) {
      lock.submitted = true; lock.submittedAt = deadline; lock.timeUp = true;
      saveLock(lock);
      render();
      return;
    }
  } else {
    started = state.started; deadline = state.deadline; stopped = state.stoppedAt;
    if (deadline && !stopped && now >= deadline) {
      Object.assign(state, { stoppedAt: deadline, timeUp: true, evaluated: true });
      render();
      return;
    }
  }
  const end = stopped || now;
  if (deadline) {
    const rest = deadline - end;
    timerEl.textContent = '⏱ Restzeit ' + fmt(rest) + ' von ' + fmt(deadline - started);
    timerEl.className = 'timer noprint' + (rest <= 0 ? ' over' : rest <= 60000 ? ' soon' : '');
  } else {
    timerEl.textContent = '⏱ ' + fmt(end - started) + (stopped ? ' (angehalten)' : '');
    timerEl.className = 'timer noprint plain';
  }
}

setInterval(tick, 250);

// ------------------------------------------------------------------ Prüfer-PIN und Prüfungsmodus

function startLocked(e, index) {
  if (!hasPin()) {
    alert('Bitte zuerst einen Prüfer-PIN festlegen.');
    go('pin', { pinMsg: '' });
    return;
  }
  if (validate(e).length) { alert('Diese Prüfung ist unvollständig. Bitte erst bearbeiten.'); return; }
  if (!confirm('Prüfung „' + e.name + '“ starten?\n\nDie Seite bleibt gesperrt, bis der Prüfer mit seinem PIN freigibt – auch nach Neuladen.')) return;
  delete e.rolled;
  const now = Date.now();
  const lock = { exam: e, index, answers: compute(e).slots.map(() => ''), submitted: false, startedAt: now,
    deadline: e.timeLimit ? now + e.timeLimit * 60000 : 0 };
  saveLock(lock);
  state.admin = false;          // Prüfer-Anmeldung endet mit dem Start der Prüfung
  enterLocked(lock);
}

function enterLocked(lock) {
  const result = compute(lock.exam);
  Object.assign(state, { view: 'exam', locked: true, lock, exam: lock.exam, index: lock.index, result,
    answers: lock.answers, solution: false, evaluated: false, pinMsg: '', tries: lock.tries || 0, blockedUntil: lock.blockedUntil || 0 });
  render();
  window.scrollTo(0, 0);
}

function time(ms) { return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }

function lockedView() {
  const e = state.exam, r = state.result, lock = state.lock;
  const inputs = [];
  const rows = r.slots.map((s, i) => {
    const inp = h('input', { class: 'answer', value: state.answers[i], inputmode: 'numeric', maxlength: 1, autocomplete: 'off',
      disabled: lock.submitted, 'aria-label': 'Antwort Aufgabe ' + (i + 1),
      oninput: ev => {
        ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 1);
        state.answers[i] = ev.target.value;
        saveLock(lock);
        if (ev.target.value && inputs[i + 1]) inputs[i + 1].focus();
      },
      onkeydown: ev => { if (ev.key === 'Enter' && inputs[i + 1]) inputs[i + 1].focus(); } });
    inputs.push(inp);
    return h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, slotTitle(s)),
      h('td', { class: 'mono' }, place(s.line, s.pos)), h('td', { class: 'mono' }, s.range), h('td', {}, inp));
  });

  const pinInput = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 12,
    'aria-label': 'Prüfer-PIN', placeholder: 'PIN', class: 'pin',
    onkeydown: ev => { if (ev.key === 'Enter') release(); } });
  const blocked = Date.now() < state.blockedUntil;
  if (blocked && !state.pinMsg) {
    state.pinMsg = 'Dreimal falsch – kurze Pause.';
    setTimeout(render, state.blockedUntil - Date.now() + 50);
  }

  function release() {
    if (Date.now() < state.blockedUntil) return;
    if (checkPin(pinInput.value)) {
      clearLock();
      Object.assign(state, { locked: false, lock: null, admin: true, evaluated: true, solution: false, pinMsg: '', useTimer: !!lock.deadline,
        started: lock.startedAt, deadline: lock.deadline, stoppedAt: lock.submittedAt || Date.now(), timeUp: !!lock.timeUp });
      render();
      return;
    }
    state.tries++;
    state.pinMsg = 'PIN falsch.';
    if (state.tries >= 3) {
      state.blockedUntil = Date.now() + 30000;
      state.tries = 0;
      state.pinMsg = 'Dreimal falsch – 30 Sekunden Pause.';
      setTimeout(render, 30000);
    }
    // Fehlversuche und Pause überstehen auch Neuladen
    lock.tries = state.tries;
    lock.blockedUntil = state.blockedUntil;
    saveLock(lock);
    render();
  }

  const answered = state.answers.filter(a => a !== '').length;
  return h('section', {},
    h('p', { class: 'lockbanner' }, '🔒 Prüfungsmodus – Ergebnis und Lösung gibt nur der Prüfer frei.'),
    h('h2', {}, e.name),
    h('p', { class: 'muted' }, 'Gewichte ' + e.weights.join('-') + ' (wiederholt) · modulo 10 · Zeichenwerte: 0–9 wie gelesen, A = 10 … Z = 35, < = 0'
      + ' · begonnen ' + time(lock.startedAt)),
    lock.submitted ? null : timerBox(),
    grid(e, { result: r, solution: false, evaluated: false, watermark: true }),
    h('h3', {}, 'Aufgaben'),
    h('p', { class: 'muted' }, 'Prüfziffern mit Stift und Papier berechnen, dann eintragen.'),
    h('details', {}, h('summary', {}, 'Wertetabelle'), valueTable()),
    h('div', { class: 'tablewrap' }, h('table', { class: 'tasks' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', {}, 'Prüfziffer'), h('th', {}, 'Stelle'), h('th', {}, 'über'), h('th', {}, 'Antwort'))),
      h('tbody', {}, rows))),
    lock.submitted
      ? h('p', { class: 'score' }, (lock.timeUp ? '⏱ Zeit abgelaufen um ' : '✔ Abgegeben um ') + time(lock.submittedAt)
          + ' nach ' + fmt(lock.submittedAt - lock.startedAt) + ' – ' + answered + ' von ' + r.slots.length + ' Antworten eingetragen.')
      : h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: () => {
          const open = r.slots.length - answered;
          if (!confirm(open ? open + ' Aufgabe(n) ohne Antwort. Trotzdem abgeben?' : 'Abgeben? Danach lassen sich die Antworten nicht mehr ändern.')) return;
          lock.submitted = true;
          lock.submittedAt = Date.now();
          saveLock(lock);
          render();
        } }, 'Abgeben')),
    h('fieldset', { class: 'pinbox' }, h('legend', {}, 'Prüfer'),
      h('p', { class: 'muted' }, lock.submitted ? 'Mit PIN auswerten und Lösung freigeben.' : 'Mit PIN die Prüfung vorzeitig beenden und auswerten.'),
      h('div', { class: 'bar' }, pinInput, h('button', { onclick: release, disabled: blocked }, 'Freigeben')),
      state.pinMsg ? h('p', { class: 'warn' }, state.pinMsg) : null));
}

function pinInputEl(label) {
  return h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 12, 'aria-label': label });
}

/** Prüfer: PIN festlegen, anmelden, Einstellungen. */
function pinView() {
  const msg = text => { state.pinMsg = text; render(); };
  const back = h('button', { onclick: () => go('list', { pinMsg: '' }) }, 'Zur Übersicht');
  const warn = state.pinMsg ? h('p', { class: 'warn' }, state.pinMsg) : null;

  // 1. Noch kein PIN: festlegen
  if (!hasPin()) {
    const a = pinInputEl('Neuer PIN'), b = pinInputEl('Wiederholung');
    return h('section', {},
      h('h2', {}, 'Prüfer-PIN festlegen'),
      h('p', { class: 'muted' }, '4 bis 12 Ziffern. Mit dem PIN meldet sich der Prüfer an, gibt Prüfungsergebnisse frei und kann den Übungsmodus abschalten. '
        + 'Er wird nicht im Klartext gespeichert – wer ihn vergisst, kann ihn nur über das Löschen der Website-Daten im Browser zurücksetzen. Vorher die Prüfungen exportieren.'),
      h('fieldset', {}, field('Neuer PIN', a), field('Neuer PIN (Wiederholung)', b)),
      warn,
      h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: () => {
        if (!validPin(a.value)) return msg('Der PIN muss aus 4 bis 12 Ziffern bestehen.');
        if (a.value !== b.value) return msg('Die beiden PINs stimmen nicht überein.');
        setPin(a.value);
        state.admin = true;
        msg('');
      } }, 'Speichern'), back));
  }

  // 2. PIN vorhanden, nicht angemeldet: anmelden (3 Fehlversuche → 30 s Pause, übersteht Neuladen)
  if (!state.admin) {
    const set = loadSettings();
    const blocked = Date.now() < set.loginBlockedUntil;
    if (blocked) setTimeout(() => { if (state.view === 'pin') render(); }, set.loginBlockedUntil - Date.now() + 50);
    const p = pinInputEl('Prüfer-PIN');
    const login = () => {
      const st = loadSettings();
      if (Date.now() < st.loginBlockedUntil) return;
      if (checkPin(p.value)) {
        st.loginTries = 0; saveSettings(st);
        state.admin = true;
        return msg('');
      }
      st.loginTries++;
      let text = 'PIN falsch.';
      if (st.loginTries >= 3) { st.loginTries = 0; st.loginBlockedUntil = Date.now() + 30000; text = 'Dreimal falsch – 30 Sekunden Pause.'; }
      saveSettings(st);
      msg(text);
    };
    p.addEventListener('keydown', ev => { if (ev.key === 'Enter') login(); });
    return h('section', {},
      h('h2', {}, 'Prüfer-Anmeldung'),
      h('fieldset', {}, field('PIN', p)),
      blocked && !state.pinMsg ? h('p', { class: 'warn' }, 'Dreimal falsch – kurze Pause.') : warn,
      h('div', { class: 'bar' }, h('button', { class: 'primary', disabled: blocked, onclick: login }, 'Anmelden'), back));
  }

  // 3. Angemeldet: Einstellungen
  const set = loadSettings();
  const a = pinInputEl('Neuer PIN'), b = pinInputEl('Wiederholung');
  return h('section', {},
    h('h2', {}, 'Prüfer-Einstellungen'),
    h('fieldset', {}, h('legend', {}, 'Übungsmodus'),
      h('label', { class: 'checkline' }, h('input', { type: 'checkbox', checked: set.practice !== false, onchange: ev => {
        const st = loadSettings(); st.practice = ev.target.checked; saveSettings(st); render();
      } }), ' Übungsmodus für alle erlauben'),
      h('p', { class: 'muted' }, set.practice !== false
        ? 'Jeder kann üben, Lösungen ansehen und Prüfungen anlegen, bearbeiten, importieren und exportieren.'
        : 'Abgeschaltet: Ohne Prüfer-Anmeldung lassen sich nur 🔒 Prüfungen starten und die Erklärung lesen. '
          + 'Üben, Anlegen, Bearbeiten, Löschen, Import und Export gibt es nur für den angemeldeten Prüfer.')),
    h('fieldset', {}, h('legend', {}, 'PIN ändern'),
      field('Neuer PIN', a), field('Neuer PIN (Wiederholung)', b),
      h('div', { class: 'bar' },
        h('button', { onclick: () => {
          if (!validPin(a.value)) return msg('Der neue PIN muss aus 4 bis 12 Ziffern bestehen.');
          if (a.value !== b.value) return msg('Die beiden neuen PINs stimmen nicht überein.');
          setPin(a.value);
          msg('✓ Neuer PIN gespeichert.');
        } }, 'PIN speichern'),
        h('button', { class: 'danger', onclick: () => {
          if (!confirm('PIN entfernen? Der Übungsmodus ist dann wieder für alle frei, und 🔒 Prüfungen lassen sich erst nach einem neuen PIN starten.')) return;
          removePin();
          const st = loadSettings(); st.practice = true; saveSettings(st);
          state.admin = false;
          go('list', { pinMsg: '' });
        } }, 'PIN entfernen'))),
    warn,
    h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: () => go('list', { pinMsg: '' }) }, 'Zur Übersicht'),
      h('button', { onclick: logout }, 'Abmelden')));
}

const pending = loadLock();
if (pending && pending.exam && !validate(pending.exam).length) enterLocked(pending);
else render();
