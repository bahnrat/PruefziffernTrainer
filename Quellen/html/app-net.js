/* Netzwerkversion: mehrere Nutzer über einen gemeinsamen Ordner. Übernimmt Rechenkern, Raster und Erklärung
   der Einzelplatzversion. */
const NET = true;
const state = { view: 'connect', who: null, ref: null, edit: null, exam: null, result: null, solution: false, answers: [], evaluated: false, msg: '' };
const app = document.getElementById('app');

// ------------------------------------------------------------------ Baukasten

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
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

function select(values, current, onchange, label) {
  return h('select', { 'aria-label': label, onchange: e => onchange(Number(e.target.value)) },
    values.map(v => h('option', { value: v, selected: v === current }, v)));
}

function field(label, control) { return h('label', { class: 'field' }, h('span', {}, label), control); }

function pinInputEl(label) {
  return h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 12, 'aria-label': label, class: 'pin' });
}

function summary(e) {
  const blocks = e.lines.reduce((n, l) => n + l.blocks.length, 0);
  return e.lines.length + ' Zeilen × ' + e.lineLength + ' Zeichen · ' + blocks + ' Blöcke · Gewichte ' + e.weights.join('-')
    + (e.timeLimit ? ' · ⏱ ' + e.timeLimit + ' min' : '');
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function time(ms) { return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }

const isExaminer = () => !!(state.who && state.who.role === 'examiner');
const isUser = () => !!(state.who && state.who.role === 'user');
/** Üben, eigene Prüfungen anlegen: Prüfer immer, Nutzer nur bei eingeschaltetem Übungsmodus. */
const canPractice = () => isExaminer() || (isUser() && practiceOn());

function go(view, extra) {
  Object.assign(state, { view, msg: '' }, extra || {});
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (!db.data && state.view !== 'connect') state.view = 'connect';
  if (db.data && !db.config && state.view !== 'connect') state.view = 'setup';
  if (db.config && !state.who && !['connect', 'setup', 'login', 'explain'].includes(state.view)) state.view = 'login';
  if (['edit'].includes(state.view) && !(isExaminer() || canPractice())) state.view = 'list';
  if (state.view === 'exam' && !state.locked && !state.released && !canPractice()) state.view = 'list';
  if (['users', 'settings'].includes(state.view) && !isExaminer()) state.view = 'list';
  const views = { connect: connectView, setup: setupView, login: loginView, list: listView, edit: editView, exam: examView,
    users: usersView, settings: settingsView, account: accountView, explain: explainView, invite: inviteView };
  app.replaceChildren(...[errorBanner(), (views[state.view] || listView)()].filter(Boolean));
  document.getElementById('who').textContent = state.who ? (isExaminer() ? '🔑 Prüfer' : '👤 ' + state.who.name) : '';
}

function errorBanner() {
  return db.error ? h('p', { class: 'warn' }, '⚠ ' + db.error) : null;
}

/** Schreibzugriff mit Fehlermeldung statt stillem Scheitern (z. B. Netzlaufwerk nicht erreichbar). */
async function guarded(fn) {
  try {
    await fn();
    db.error = '';
    return true;
  } catch (e) {
    db.error = (BACKEND === 'http' ? 'Server nicht erreichbar' : 'Gemeinsamer Ordner nicht erreichbar oder schreibgeschützt') + ' (' + (e.message || e.name) + ').';
    render();
    return false;
  }
}

// ------------------------------------------------------------------ Ordner verbinden und einrichten

const placeLabel = () => (BACKEND === 'http' ? 'Server: ' : 'Gemeinsamer Ordner: ') + db.root.name;

function connectView() {
  if (BACKEND === 'http') {
    return h('section', {},
      h('h2', {}, 'Verbindung zum Server'),
      state.msg ? h('p', { class: 'warn' }, state.msg) : h('p', {}, 'Verbinde …'),
      h('p', { class: 'muted' }, 'Läuft das Programm „Pruefziffer-Server“ auf dem PC bzw. ist das NAS eingeschaltet? Ist dieses Gerät im selben WLAN?'),
      h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: startHttp }, 'Erneut versuchen')));
  }
  if (!FS_SUPPORTED && location.hash !== '#opfs') {
    return h('section', {},
      h('h2', {}, 'Bitte Edge oder Chrome verwenden'),
      h('p', {}, 'Die Netzwerkversion speichert in einem gemeinsamen Ordner. Das erlauben derzeit nur Microsoft Edge und Google Chrome am PC. '
        + 'Firefox, Safari und Handys können das nicht – dort bitte die Einzelplatzversion nutzen.'));
  }
  const saved = state.savedRoot;
  return h('section', {},
    h('h2', {}, 'Gemeinsamen Ordner verbinden'),
    h('p', {}, 'Alle Mitspieler verbinden sich mit demselben Ordner, z. B. auf der Netzwerk-Festplatte. '
      + 'Darin legt der Trainer einen Unterordner „' + DATA_DIR + '“ mit allen Daten an.'),
    h('p', { class: 'muted' }, 'Der Browser fragt einmal nach, ob die Seite in diesen Ordner schreiben darf – bitte erlauben.'),
    state.msg ? h('p', { class: 'warn' }, state.msg) : null,
    h('div', { class: 'bar' },
      saved ? h('button', { class: 'primary', onclick: async () => {
        try { if (await reconnect(saved, true)) afterConnect(); else go('connect', { msg: 'Zugriff nicht erlaubt.' }); }
        catch (e) { go('connect', { msg: 'Ordner nicht erreichbar: ' + (e.message || e.name) }); }
      } }, 'Mit „' + saved.name + '“ verbinden') : null,
      h('button', { class: saved ? null : 'primary', onclick: async () => {
        try { await pickFolder(); afterConnect(); }
        catch (e) { if (e.name !== 'AbortError') go('connect', { msg: 'Ordner nicht nutzbar: ' + (e.message || e.name) }); }
      } }, saved ? 'Anderen Ordner wählen' : 'Ordner wählen')));
}

function afterConnect() {
  db.error = '';
  go(db.config ? 'login' : 'setup');
}

function setupView() {
  const a = pinInputEl('Prüfer-PIN'), b = pinInputEl('Wiederholung');
  return h('section', {},
    h('h2', {}, BACKEND === 'http' ? 'Trainer einrichten' : 'Ordner einrichten'),
    h('p', {}, (BACKEND === 'http' ? 'Auf dem Server' : 'In „' + db.root.name + '“') + ' gibt es noch keine Trainer-Daten. Wer hier einrichtet, wird Prüfer: '
      + 'Er legt die Nutzer mit ihren PINs an, erstellt die Prüfungen – für alle oder für einzelne – und gibt Ergebnisse frei.'),
    h('fieldset', {}, field('Prüfer-PIN (4–12 Ziffern)', a), field('Wiederholung', b)),
    state.msg ? h('p', { class: 'warn' }, state.msg) : null,
    h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: async () => {
      if (!validPin(a.value)) return go('setup', { msg: 'Der PIN muss aus 4 bis 12 Ziffern bestehen.' });
      if (a.value !== b.value) return go('setup', { msg: 'Die beiden PINs stimmen nicht überein.' });
      if (await guarded(() => setupFolder(a.value))) go('list', { who: { role: 'examiner' } });
    } }, 'Einrichten')));
}

// ------------------------------------------------------------------ Anmeldung

const LOGIN_KEY = 'pruefziffer-netz.login';
function loginGuard() { try { return JSON.parse(localStorage.getItem(LOGIN_KEY)) || { tries: 0, until: 0 }; } catch (e) { return { tries: 0, until: 0 }; } }
function setLoginGuard(g) { try { localStorage.setItem(LOGIN_KEY, JSON.stringify(g)); } catch (e) { } }

function loginView() {
  const guard = loginGuard();
  const blocked = Date.now() < guard.until;
  if (blocked) setTimeout(() => { if (state.view === 'login') render(); }, guard.until - Date.now() + 50);
  const who = h('select', { 'aria-label': 'Name' },
    h('option', { value: '' }, '– Name wählen –'),
    db.users.slice().sort((x, y) => x.name.localeCompare(y.name, 'de')).map(u => h('option', { value: u.id, selected: u.id === state.lastUser }, u.name)),
    h('option', { value: '#examiner' }, '🔑 Prüfer'));
  const pin = pinInputEl('PIN');
  const login = async () => {
    const g = loginGuard();
    if (Date.now() < g.until) return;
    const id = who.value;
    if (!id) return go('login', { msg: 'Bitte einen Namen wählen.' });
    state.lastUser = id;            // Auswahl bleibt nach einem Fehlversuch stehen
    let ok = false, whoObj = null;
    if (id === '#examiner') {
      await guarded(refreshShared);
      ok = secretOk(db.config.examiner, pin.value);
      whoObj = { role: 'examiner' };
    } else {
      const u = await readUser(id);
      ok = !!u && secretOk(u.pin, pin.value);
      const entry = db.users.find(x => x.id === id);
      whoObj = { role: 'user', id, name: entry ? entry.name : '?' };
      if (ok) { db.me = u; db.meId = id; }
    }
    if (ok) {
      setLoginGuard({ tries: 0, until: 0 });
      state.who = whoObj;
      state.lastUser = id;
      if (isUser() && db.me.lock && db.me.lock.exam) return enterLocked(db.me.lock);
      return go('list');
    }
    g.tries++;
    let text = 'Name oder PIN falsch.';
    if (g.tries >= 3) { g.tries = 0; g.until = Date.now() + 30000; text = 'Dreimal falsch – 30 Sekunden Pause.'; }
    setLoginGuard(g);
    go('login', { msg: text });
  };
  pin.addEventListener('keydown', ev => { if (ev.key === 'Enter') login(); });
  return h('section', {},
    h('h2', {}, 'Anmelden'),
    h('p', { class: 'muted' }, placeLabel() + (db.users.length ? '' : ' · Noch keine Nutzer – der Prüfer legt sie an.')),
    h('fieldset', {}, field('Name', who), field('PIN', pin)),
    blocked && !state.msg ? h('p', { class: 'warn' }, 'Dreimal falsch – kurze Pause.') : state.msg ? h('p', { class: 'warn' }, state.msg) : null,
    h('div', { class: 'bar' },
      h('button', { class: 'primary', disabled: blocked, onclick: login }, 'Anmelden'),
      h('button', { onclick: () => go('explain') }, '📖 Erklärung')));
}

function logout() {
  Object.assign(state, { who: null, locked: false, lock: null, exam: null });
  db.me = null; db.meId = null;
  go('login');
}

// ------------------------------------------------------------------ Übersicht

function listView() {
  const ex = isExaminer(), practice = canPractice();
  const mine = isUser() && db.me ? db.me.exams : [];
  // Prüfungen mit ursprünglicher Nummer; Nutzer sehen nur die für alle und die für sie bestimmten
  const shared = db.exams.map((e, i) => ({ e, i })).filter(x => ex || isFor(x.e, state.who.id));
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importFile });

  const card = (e, src, i) => h('article', { class: 'card' },
    h('div', { class: 'cardtext' }, h('strong', {}, e.name), h('span', { class: 'muted' }, summary(e)),
      ex && src === 'shared' ? h('span', { class: 'forwhom' }, '👥 ' + forText(e)) : null),
    h('div', { class: 'bar small' },
      practice ? h('button', { class: 'primary', onclick: () => openExam(src, i) }, 'Üben') : null,
      isUser() && src === 'shared' ? h('button', { class: practice ? null : 'primary', onclick: () => startLocked(clone(e)) }, '🔒 Prüfung') : null,
      (ex && src === 'shared') || (isUser() && src === 'mine' && practice)
        ? [h('button', { onclick: () => go('edit', { ref: { src, idx: i }, edit: clone(e) }) }, 'Bearbeiten'),
           h('button', { onclick: () => saveExam({ src, idx: -1 }, Object.assign(clone(e), { name: e.name + ' (Kopie)' })) }, 'Kopieren'),
           ex && src === 'shared' && db.users.length ? h('button', { title: 'Gleicher Aufbau, für jeden Nutzer eigene Zeichen', onclick: () => rollForEach(e) }, '🎲 Für jeden einzeln') : null,
           h('button', { class: 'danger', onclick: () => { if (confirm('„' + e.name + '“ löschen?')) removeExam({ src, idx: i }); } }, 'Löschen')]
        : null));

  return h('section', {},
    ex ? h('p', { class: 'adminbanner' }, '🔑 Als Prüfer angemeldet' + (practiceOn() ? '' : ' – Übungsmodus für Nutzer ist abgeschaltet') + '.') : null,
    isUser() && !practiceOn() ? h('p', { class: 'lockbanner' }, 'Der Übungsmodus ist vom Prüfer abgeschaltet. Prüfungen schreiben geht weiterhin.') : null,
    h('div', { class: 'bar' },
      ex ? h('button', { class: 'primary', onclick: () => go('edit', { ref: { src: 'shared', idx: -1 }, edit: example() }) }, 'Neue Prüfung') : null,
      isUser() && practice ? h('button', { class: 'primary', onclick: () => go('edit', { ref: { src: 'mine', idx: -1 }, edit: example() }) }, 'Neue eigene Übung') : null,
      ex ? h('button', { onclick: () => go('users') }, '👥 Nutzer und Abgaben') : null,
      ex ? h('button', { onclick: () => go('settings') }, '⚙ Einstellungen') : null,
      ex && BACKEND === 'http' ? h('button', { onclick: () => go('invite') }, '📱 Mitspieler einladen') : null,
      ex ? h('button', { onclick: exportShared, disabled: !shared.length }, 'Exportieren') : null,
      ex ? h('button', { onclick: () => fileInput.click() }, 'Importieren') : null,
      isUser() ? h('button', { onclick: () => go('account') }, 'Mein PIN') : null,
      h('button', { onclick: () => go('explain') }, '📖 Erklärung'),
      h('button', { onclick: logout }, 'Abmelden'),
      fileInput),
    h('h2', {}, ex ? 'Prüfungen' : 'Prüfungen vom Prüfer'),
    shared.length ? shared.map(x => card(x.e, 'shared', x.i)) : h('p', { class: 'muted' }, ex ? 'Noch keine – „Neue Prüfung“ oder Import aus der Einzelplatzversion.' : 'Der Prüfer hat für dich noch keine Prüfungen angelegt.'),
    isUser() && practice ? [h('h2', {}, 'Meine Übungen'),
      mine.length ? mine.map((e, i) => card(e, 'mine', i)) : h('p', { class: 'muted' }, 'Eigene Übungen sieht nur der, der sie angelegt hat.')] : null,
    isUser() ? h('p', { class: 'muted note' }, '🔒 Prüfung: Ergebnis und Lösung gibt der Prüfer frei – an seinem Gerät oder mit seinem PIN an deinem.') : null);
}

/** Ist die Prüfung für diesen Nutzer bestimmt? Ohne Auswahl gilt sie für alle. */
function isFor(e, id) { return !(Array.isArray(e.for) && e.for.length) || e.for.includes(id); }

function forText(e) {
  if (!(Array.isArray(e.for) && e.for.length)) return 'für alle';
  const names = e.for.map(id => (db.users.find(u => u.id === id) || {}).name).filter(Boolean);
  return names.length ? 'nur für ' + names.join(', ') : 'für niemand (Nutzer gelöscht)';
}

/** Für jeden Nutzer eine eigene Prüfung mit gleichem Aufbau und eigenen Zeichen. */
async function rollForEach(e) {
  const letters = e.lines.some(l => l.blocks.some(b => /[A-Z]/.test(b.content)));
  if (!confirm('„' + e.name + '“ für jeden der ' + db.users.length + ' Nutzer einzeln auswürfeln?\n\n'
    + 'Jeder bekommt eine eigene Prüfung mit gleichem Aufbau und anderen Zeichen (' + (letters ? 'Ziffern und Buchstaben' : 'nur Ziffern') + ').')) return;
  await guarded(async () => {
    await refreshShared();
    for (const u of db.users) {
      const c = clone(e);
      delete c.for;
      randomFill(c, letters);
      c.name = e.name + ' – ' + u.name;
      c.for = [u.id];
      db.exams.push(c);
    }
    await saveExams();
  });
  render();
}

async function saveExam(ref, e) {
  await guarded(async () => {
    if (ref.src === 'shared') {
      await refreshShared();
      if (ref.idx >= 0 && ref.idx < db.exams.length) db.exams[ref.idx] = e; else db.exams.push(e);
      await saveExams();
    } else {
      if (ref.idx >= 0 && ref.idx < db.me.exams.length) db.me.exams[ref.idx] = e; else db.me.exams.push(e);
      await saveMe(['exams']);
    }
  });
  render();
}

async function removeExam(ref) {
  await guarded(async () => {
    if (ref.src === 'shared') { await refreshShared(); db.exams.splice(ref.idx, 1); await saveExams(); }
    else { db.me.exams.splice(ref.idx, 1); await saveMe(['exams']); }
  });
  render();
}

function exportShared() {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(db.exams, null, 1)], { type: 'application/json' })),
    download: 'pruefungen-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  f.text().then(async text => {
    let data = JSON.parse(text);
    if (!Array.isArray(data)) data = [data];
    const ok = data.map(sanitize).filter(e => !validate(e).length);
    await guarded(async () => { await refreshShared(); db.exams.push(...ok); await saveExams(); });
    alert(ok.length + ' Prüfung(en) importiert' + (ok.length < data.length ? ', ' + (data.length - ok.length) + ' fehlerhaft übersprungen.' : '.'));
    render();
  }).catch(() => alert('Datei konnte nicht gelesen werden.'));
}

// ------------------------------------------------------------------ Raster

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
        if (s && opts.solution) { content = [String(s.digit)]; cls += ' solved'; }
        else content = ['?', h('small', {}, c.slot)];
        if (s && opts.evaluated) cls += state.answers[c.slot - 1] === String(s.digit) ? ' right' : ' wrong';
      }
      return h('td', { class: cls, title: c.type === 'cd' ? 'Aufgabe ' + c.slot : null }, content);
    })));
  return h('div', { class: 'gridwrap' + (opts && opts.watermark ? ' muster' : '') },
    h('table', { class: 'grid', 'aria-label': 'Beispiel-MRZ' }, h('thead', {}, head), h('tbody', {}, body)));
}

// ------------------------------------------------------------------ Bearbeiten

function editView() {
  const e = state.edit;
  const last = e.lines.length - 1;
  const preview = h('div', {});
  const status = h('p', { class: 'status' });
  const lineStatus = [];
  const rerender = () => render();

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
            const c = t.value.toUpperCase().replace(/[^0-9A-Z<]/g, '').slice(0, b.length);
            if (c !== t.value) t.value = c;
            b.content = c;
            update();
          } }))),
      lineStatus[li]);
  });

  const shared = state.ref.src === 'shared';
  const view = h('section', {},
    h('h2', {}, (state.ref.idx >= 0 ? 'Bearbeiten: ' : 'Neu: ') + (shared ? 'Prüfung' : 'eigene Übung')),
    field('Name', h('input', { value: e.name, maxlength: 80, oninput: ev => { e.name = ev.target.value; } })),
    shared ? forWhomBox(e) : null,
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
        h('button', { class: 'primary', onclick: async () => {
          if (!e.name.trim()) e.name = 'Prüfung';
          if (shared && e.forMode === 'some' && !(e.for && e.for.length)) { alert('Bitte mindestens einen Nutzer auswählen – oder „Alle Nutzer“.'); return; }
          if (e.forMode !== 'some') delete e.for;
          delete e.forMode;
          const err = validate(e);
          if (err.length) { alert('Noch nicht vollständig:\n\n• ' + err.join('\n• ')); return; }
          await saveExam(state.ref, e);
          go('list');
        } }, 'Speichern'),
        h('button', { onclick: () => go('list') }, 'Abbrechen'))));
  update();
  return view;
}

/** Auswahl, für wen eine Prüfung gilt. */
function forWhomBox(e) {
  if (!e.forMode) e.forMode = Array.isArray(e.for) && e.for.length ? 'some' : 'all';
  const known = (e.for || []).filter(id => db.users.some(u => u.id === id));
  e.for = known;
  const radio = (mode, label) => h('label', { class: 'checkline' }, h('input', { type: 'radio', name: 'forMode', checked: e.forMode === mode,
    onchange: () => { e.forMode = mode; render(); } }), ' ' + label);
  return h('fieldset', {}, h('legend', {}, 'Für wen?'),
    h('div', { class: 'row2' }, radio('all', 'Alle Nutzer'), h('span', {}, '\u00a0\u00a0'), radio('some', 'Nur ausgewählte')),
    e.forMode === 'some'
      ? (db.users.length
          ? h('div', { class: 'weights' }, db.users.map(u => h('label', { class: 'checkline' }, h('input', { type: 'checkbox', checked: e.for.includes(u.id),
              onchange: ev => { e.for = ev.target.checked ? [...e.for, u.id] : e.for.filter(x => x !== u.id); } }), ' ' + u.name)))
          : h('p', { class: 'muted' }, 'Noch keine Nutzer angelegt.'))
      : h('p', { class: 'muted' }, 'Alle angemeldeten Nutzer sehen diese Prüfung.'));
}

// ------------------------------------------------------------------ Üben

function openExam(src, i) {
  const e = clone(src === 'shared' ? db.exams[i] : db.me.exams[i]);
  if (!e || validate(e).length) { alert('Diese Prüfung ist unvollständig.'); return; }
  const result = compute(e);
  go('exam', Object.assign({ locked: false, released: false, ref: { src, idx: i }, exam: e, result, solution: false, evaluated: false,
    answers: result.slots.map(() => ''), useTimer: !!e.timeLimit }, freshTimer(e, !!e.timeLimit)));
}

function reroll(letters) {
  const e = clone(state.exam);
  randomFill(e, letters);
  e.rolled = true;
  const result = compute(e);
  Object.assign(state, { exam: e, result, solution: false, evaluated: false, answers: result.slots.map(() => '') }, freshTimer(e, state.useTimer));
  render();
}

async function saveRolled() {
  const e = clone(state.exam);
  delete e.rolled;
  e.name = e.name.replace(/ \(gewürfelt\)$/, '') + ' (gewürfelt)';
  await saveExam({ src: isExaminer() ? 'shared' : 'mine', idx: -1 }, e);
  state.exam.rolled = false;
  state.exam.name = e.name;
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
      h('td', { class: 'num' }, i + 1), h('td', {}, slotTitle(s)),
      h('td', { class: 'mono' }, place(s.line, s.pos)), h('td', { class: 'mono' }, s.range), h('td', {}, inp),
      h('td', { class: 'mark ' + (state.evaluated ? (right ? 'right' : 'wrong') : '') }, state.evaluated ? (right ? '✓' : a ? '✗' : '–') : ''),
      state.solution ? h('td', { class: 'mono solvedcell' }, s.digit) : null);
  });

  return h('section', {},
    state.released ? h('p', { class: 'adminbanner' }, '✔ Vom Prüfer freigegeben – hier sind Ergebnis und Lösung.') : null,
    h('h2', {}, e.name),
    e.rolled ? h('p', { class: 'muted' }, '🎲 Ausgewürfelte Zeichen – nur für diese Runde. ',
      h('button', { class: 'linkish', onclick: saveRolled }, isExaminer() ? 'Als Prüfung speichern (für alle)' : 'Als eigene Übung speichern')) : null,
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
      canPractice() ? h('button', { onclick: () => { Object.assign(state, { answers: r.slots.map(() => ''), evaluated: false, solution: false }, freshTimer(e, state.useTimer)); render(); } }, 'Leeren') : null,
      e.timeLimit && canPractice() ? h('button', { onclick: () => {
        state.useTimer = !state.useTimer;
        if (state.useTimer) Object.assign(state, freshTimer(e, true));
        else Object.assign(state, { deadline: 0, stoppedAt: 0, timeUp: false, evaluated: false });
        render();
      } }, state.useTimer ? '⏱ Zeitvorgabe aus' : '⏱ Zeitvorgabe an') : null,
      canPractice() ? h('button', { onclick: () => reroll(false) }, '🎲 0–9') : null,
      canPractice() ? h('button', { onclick: () => reroll(true) }, '🎲 0–Z') : null,
      h('button', { onclick: () => window.print() }, 'Drucken'),
      h('button', { onclick: () => go('list') }, 'Zur Übersicht')),
    state.solution ? h('div', { class: 'working' }, h('h3', {}, 'Rechenweg'),
      r.slots.map((s, i) => h('div', { class: 'step' },
        h('strong', {}, (i + 1) + '. ' + slotTitle(s) + ' (' + place(s.line, s.pos) + ', über ' + s.range + ')'),
        h('code', {}, working(s, e.weights))))) : null);
}

// ------------------------------------------------------------------ Zeit

let timerEl = null;

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

function tick() {
  if (!timerEl || !timerEl.isConnected || state.view !== 'exam') return;
  const now = Date.now();
  let started, deadline, stopped;
  if (state.locked) {
    const lock = state.lock;
    started = lock.startedAt; deadline = lock.deadline; stopped = lock.submitted ? lock.submittedAt : 0;
    if (deadline && !lock.submitted && now >= deadline) {
      Object.assign(lock, { submitted: true, submittedAt: deadline, timeUp: true });
      persistLock();
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

// ------------------------------------------------------------------ Prüfung (je Nutzer, in seiner Datei)

async function startLocked(e) {
  if (validate(e).length) { alert('Diese Prüfung ist unvollständig.'); return; }
  if (!confirm('Prüfung „' + e.name + '“ starten?\n\nErgebnis und Lösung gibt der Prüfer frei. Die Prüfung läuft auch nach Neuladen oder erneuter Anmeldung weiter.')) return;
  delete e.rolled;
  const now = Date.now();
  db.me.lock = { exam: e, answers: compute(e).slots.map(() => ''), submitted: false, startedAt: now,
    deadline: e.timeLimit ? now + e.timeLimit * 60000 : 0 };
  if (await guarded(() => saveMe(['lock']))) enterLocked(db.me.lock);
}

function enterLocked(lock) {
  Object.assign(state, { view: 'exam', locked: true, lock, exam: lock.exam, result: compute(lock.exam), answers: lock.answers,
    solution: false, evaluated: false, msg: '' });
  render();
  window.scrollTo(0, 0);
}

let lockWrite = null;
/** Antworten gesammelt speichern (nicht bei jedem Tastendruck übers Netz). */
function persistLock(delay) {
  clearTimeout(lockWrite);
  lockWrite = setTimeout(() => guarded(() => saveMe(['lock'])), delay || 0);
}

/** Freigabe (vom Prüfer am eigenen Gerät oder per PIN hier): Ergebnis zeigen, Abgabe als „letztes Ergebnis“ ablegen. */
async function releaseLocked() {
  const lock = state.lock, r = state.result;
  if (!lock.submitted) Object.assign(lock, { submitted: true, submittedAt: Date.now() });
  const ok = r.slots.filter((s, i) => lock.answers[i] === String(s.digit)).length;
  db.me.last = { name: lock.exam.name, ok, total: r.slots.length, time: lock.submittedAt - lock.startedAt, at: lock.submittedAt, timeUp: !!lock.timeUp };
  db.me.lock = null;
  await guarded(() => saveMe(['lock', 'last']));
  Object.assign(state, { locked: false, lock: null, evaluated: true, solution: false, useTimer: !!lock.deadline,
    started: lock.startedAt, deadline: lock.deadline, stoppedAt: lock.submittedAt, timeUp: !!lock.timeUp, released: true });
  render();
}

function lockedView() {
  const e = state.exam, r = state.result, lock = state.lock;
  const inputs = [];
  const rows = r.slots.map((s, i) => {
    const inp = h('input', { class: 'answer', value: state.answers[i], inputmode: 'numeric', maxlength: 1, autocomplete: 'off',
      disabled: lock.submitted, 'aria-label': 'Antwort Aufgabe ' + (i + 1),
      oninput: ev => {
        ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 1);
        state.answers[i] = ev.target.value;
        persistLock(400);
        if (ev.target.value && inputs[i + 1]) inputs[i + 1].focus();
      },
      onkeydown: ev => { if (ev.key === 'Enter' && inputs[i + 1]) inputs[i + 1].focus(); } });
    inputs.push(inp);
    return h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, slotTitle(s)),
      h('td', { class: 'mono' }, place(s.line, s.pos)), h('td', { class: 'mono' }, s.range), h('td', {}, inp));
  });
  const pin = pinInputEl('Prüfer-PIN');
  const guard = loginGuard();
  const blocked = Date.now() < guard.until;
  const release = async () => {
    const g = loginGuard();
    if (Date.now() < g.until) return;
    await guarded(refreshShared);
    if (secretOk(db.config.examiner, pin.value)) { setLoginGuard({ tries: 0, until: 0 }); return releaseLocked(); }
    g.tries++;
    let text = 'PIN falsch.';
    if (g.tries >= 3) { g.tries = 0; g.until = Date.now() + 30000; text = 'Dreimal falsch – 30 Sekunden Pause.'; setTimeout(render, 30050); }
    setLoginGuard(g);
    state.msg = text;
    render();
  };
  pin.addEventListener('keydown', ev => { if (ev.key === 'Enter') release(); });
  const answered = state.answers.filter(a => a !== '').length;
  return h('section', {},
    h('p', { class: 'lockbanner' }, '🔒 Prüfung von ' + state.who.name + ' – Ergebnis und Lösung gibt der Prüfer frei.'),
    h('h2', {}, e.name),
    h('p', { class: 'muted' }, 'Gewichte ' + e.weights.join('-') + ' (wiederholt) · modulo 10 · Zeichenwerte: 0–9 wie gelesen, A = 10 … Z = 35, < = 0 · begonnen ' + time(lock.startedAt)),
    lock.submitted ? null : timerBox(),
    grid(e, { result: r, solution: false, evaluated: false, watermark: true }),
    h('h3', {}, 'Aufgaben'),
    h('details', {}, h('summary', {}, 'Wertetabelle'), valueTable()),
    h('div', { class: 'tablewrap' }, h('table', { class: 'tasks' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', {}, 'Prüfziffer'), h('th', {}, 'Stelle'), h('th', {}, 'über'), h('th', {}, 'Antwort'))),
      h('tbody', {}, rows))),
    lock.submitted
      ? h('p', { class: 'score' }, (lock.timeUp ? '⏱ Zeit abgelaufen um ' : '✔ Abgegeben um ') + time(lock.submittedAt)
          + ' nach ' + fmt(lock.submittedAt - lock.startedAt) + ' – ' + answered + ' von ' + r.slots.length + ' Antworten eingetragen. Warten auf Freigabe …')
      : h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: () => {
          const open = r.slots.length - answered;
          if (!confirm(open ? open + ' Aufgabe(n) ohne Antwort. Trotzdem abgeben?' : 'Abgeben? Danach lassen sich die Antworten nicht mehr ändern.')) return;
          Object.assign(lock, { submitted: true, submittedAt: Date.now() });
          persistLock();
          render();
        } }, 'Abgeben')),
    h('fieldset', { class: 'pinbox' }, h('legend', {}, 'Prüfer'),
      h('p', { class: 'muted' }, 'Freigabe am Prüfer-Gerät unter „👥 Nutzer und Abgaben“ – oder hier mit dem Prüfer-PIN.'),
      h('div', { class: 'bar' }, pin, h('button', { onclick: release, disabled: blocked }, 'Freigeben')),
      state.msg ? h('p', { class: 'warn' }, state.msg) : blocked ? h('p', { class: 'warn' }, 'Dreimal falsch – kurze Pause.') : null),
    h('div', { class: 'bar' }, h('button', { onclick: () => { clearTimeout(lockWrite); saveMe(['lock']).finally(logout); } }, 'Abmelden (Prüfung läuft weiter)')));
}

// ------------------------------------------------------------------ Prüfer: Nutzer und Abgaben

let userFiles = {};

async function loadUserFiles() {
  const out = {};
  for (const u of db.users) { try { out[u.id] = await readUser(u.id); } catch (e) { out[u.id] = null; } }
  userFiles = out;
}

function userStatus(u, f) {
  if (!f) return h('span', { class: 'muted' }, 'Datei fehlt');
  const l = f.lock;
  if (l && l.exam && !validate(sanitize(l.exam)).length) {
    const r = compute(sanitize(l.exam));
    const answered = l.answers.filter(a => a !== '').length;
    if (!l.submitted) {
      const rest = l.deadline ? ' · Restzeit ' + fmt(l.deadline - Date.now()) : '';
      return h('span', {}, '✍ „' + l.exam.name + '“ läuft seit ' + time(l.startedAt) + ' · ' + answered + '/' + r.slots.length + ' beantwortet' + rest);
    }
    const ok = r.slots.filter((s, i) => l.answers[i] === String(s.digit)).length;
    return h('span', { class: 'strong' }, '✔ „' + l.exam.name + '“ ' + (l.timeUp ? 'Zeit abgelaufen' : 'abgegeben') + ' ' + time(l.submittedAt)
      + ' · ' + ok + ' von ' + r.slots.length + ' richtig · Zeit ' + fmt(l.submittedAt - l.startedAt)
      + (f.release === l.startedAt ? ' · freigegeben, wird angezeigt …' : ''));
  }
  if (f.last) return h('span', { class: 'muted' }, 'Zuletzt: „' + f.last.name + '“ ' + f.last.ok + ' von ' + f.last.total + ' richtig · '
    + fmt(f.last.time) + (f.last.timeUp ? ' (Zeit abgelaufen)' : '') + ' · ' + new Date(f.last.at).toLocaleDateString('de-DE') + ' ' + time(f.last.at));
  return h('span', { class: 'muted' }, 'keine Prüfung');
}

/** Nur die Tabelle – sie erneuert sich alle paar Sekunden, ohne das Formular darunter anzutasten. */
function usersTable() {
  return db.users.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'tasks' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Stand'), h('th', {}, ''))),
      h('tbody', {}, db.users.map(u => {
        const f = userFiles[u.id];
        const l = f && f.lock;
        return h('tr', {},
          h('td', {}, h('strong', {}, u.name)),
          h('td', { class: 'wrap' }, userStatus(u, f)),
          h('td', {}, h('div', { class: 'bar small' },
            l && l.exam && f.release !== l.startedAt ? h('button', { class: 'primary', onclick: async () => {
              if (!l.submitted && !confirm(u.name + ' hat noch nicht abgegeben. Prüfung trotzdem beenden und freigeben?')) return;
              await guarded(() => updateUser(u.id, x => { x.release = l.startedAt; }));
              await refreshUsersTable();
            } }, 'Freigeben') : null,
            h('button', { onclick: async () => {
              const np = prompt('Neuer PIN für ' + u.name + ' (4–12 Ziffern):');
              if (np === null) return;
              if (!validPin(np)) { alert('Der PIN muss aus 4 bis 12 Ziffern bestehen.'); return; }
              await guarded(() => updateUser(u.id, x => { x.pin = newSecret(np); }));
              alert('PIN für ' + u.name + ' geändert.');
            } }, 'PIN neu'),
            h('button', { class: 'danger', onclick: async () => {
              if (!confirm(u.name + ' mit allen eigenen Übungen löschen?')) return;
              await guarded(() => deleteUser(u.id));
              await refreshUsersTable();
            } }, 'Löschen'))));
      })))) : h('p', { class: 'muted' }, 'Noch keine Nutzer.');
}

async function refreshUsersTable() {
  await loadUserFiles();
  const el = document.getElementById('usersTable');
  if (el) el.replaceChildren(usersTable());
}

function usersView() {
  const name = h('input', { maxlength: 40, 'aria-label': 'Name', value: state.draftName || '', oninput: ev => { state.draftName = ev.target.value; } });
  const p1 = pinInputEl('PIN'), p2 = pinInputEl('Wiederholung');
  return h('section', {},
    h('div', { class: 'bar' }, h('button', { onclick: () => go('list') }, '← Zur Übersicht')),
    h('h2', {}, 'Nutzer und Abgaben'),
    h('p', { class: 'muted' }, 'Aktualisiert sich alle paar Sekunden. Die Ergebnisse siehst nur du; der Nutzer sieht seines nach deiner Freigabe.'),
    h('div', { id: 'usersTable' }, usersTable()),
    h('fieldset', {}, h('legend', {}, 'Nutzer anlegen'),
      field('Name', name), field('PIN (4–12 Ziffern)', p1), field('Wiederholung', p2),
      h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: async () => {
        const n = name.value.trim();
        if (!n) return go('users', { msg: 'Bitte einen Namen eingeben.' });
        await guarded(refreshShared);
        if (db.users.some(u => u.name.toLowerCase() === n.toLowerCase())) return go('users', { msg: '„' + n + '“ gibt es schon.' });
        if (!validPin(p1.value)) return go('users', { msg: 'Der PIN muss aus 4 bis 12 Ziffern bestehen.' });
        if (p1.value !== p2.value) return go('users', { msg: 'Die beiden PINs stimmen nicht überein.' });
        await guarded(() => createUser(n, p1.value));
        await loadUserFiles();
        go('users', { draftName: '', msg: '✓ ' + n + ' angelegt. PIN bitte persönlich mitteilen.' });
      } }, 'Anlegen'))),
    state.msg ? h('p', { class: state.msg.startsWith('✓') ? 'status ready' : 'warn' }, state.msg) : null);
}

// ------------------------------------------------------------------ Prüfer: Einstellungen / Nutzer: eigener PIN

/** Adresse und QR-Code für die Mitspieler (nur mit Server). */
function inviteView() {
  const urls = (db.urls && db.urls.length) ? db.urls : [location.origin + location.pathname.replace(/index\.html$/, '')];
  return h('section', {},
    h('div', { class: 'bar' }, h('button', { onclick: () => go('list') }, '← Zur Übersicht')),
    h('h2', {}, 'Mitspieler einladen'),
    h('p', {}, 'Mit dem Handy oder Tablet im selben WLAN diesen Code scannen – oder die Adresse im Browser eingeben:'),
    db.qr ? h('img', { src: 'qr.svg?u=' + encodeURIComponent(urls[0]), alt: 'QR-Code', class: 'qr' }) : null,
    urls.map(u => h('p', { class: 'mono bigurl' }, u)),
    h('p', { class: 'muted' }, 'Danach mit Name und PIN anmelden. Tipp: Im Browser „Zum Startbildschirm hinzufügen“ – dann ist der Trainer wie eine App erreichbar.'));
}

function settingsView() {
  const a = pinInputEl('Neuer PIN'), b = pinInputEl('Wiederholung');
  return h('section', {},
    h('div', { class: 'bar' }, h('button', { onclick: () => go('list') }, '← Zur Übersicht')),
    h('h2', {}, 'Einstellungen'),
    h('fieldset', {}, h('legend', {}, 'Übungsmodus'),
      h('label', { class: 'checkline' }, h('input', { type: 'checkbox', checked: practiceOn(), onchange: async ev => {
        await guarded(async () => { await refreshShared(); db.config.practice = ev.target.checked; await saveConfig(); });
        render();
      } }), ' Übungsmodus für Nutzer erlauben'),
      h('p', { class: 'muted' }, practiceOn()
        ? 'Nutzer können ihre Prüfungen üben (mit Lösung) und eigene Übungen anlegen.'
        : 'Abgeschaltet: Nutzer können nur 🔒 Prüfungen schreiben. Eigene Übungen bleiben gespeichert, sind aber ausgeblendet.')),
    h('fieldset', {}, h('legend', {}, 'Prüfer-PIN ändern'),
      field('Neuer PIN', a), field('Wiederholung', b),
      h('div', { class: 'bar' }, h('button', { onclick: async () => {
        if (!validPin(a.value)) return go('settings', { msg: 'Der PIN muss aus 4 bis 12 Ziffern bestehen.' });
        if (a.value !== b.value) return go('settings', { msg: 'Die beiden PINs stimmen nicht überein.' });
        await guarded(async () => { await refreshShared(); db.config.examiner = newSecret(a.value); await saveConfig(); });
        go('settings', { msg: '✓ Neuer Prüfer-PIN gespeichert.' });
      } }, 'PIN speichern'))),
    state.msg ? h('p', { class: state.msg.startsWith('✓') ? 'status ready' : 'warn' }, state.msg) : null,
    h('p', { class: 'muted' }, placeLabel() + '. Prüfer-PIN vergessen? Dann im Datenordner „' + DATA_DIR + '“'
      + (BACKEND === 'http' ? ' (neben dem Server-Programm bzw. dem PHP-Skript)' : '') + ' die Datei config.json löschen und neu einrichten – Nutzer und Prüfungen bleiben erhalten.'));
}

function accountView() {
  const a = pinInputEl('Neuer PIN'), b = pinInputEl('Wiederholung');
  return h('section', {},
    h('div', { class: 'bar' }, h('button', { onclick: () => go('list') }, '← Zur Übersicht')),
    h('h2', {}, 'Mein PIN'),
    h('fieldset', {}, field('Neuer PIN', a), field('Wiederholung', b),
      h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: async () => {
        if (!validPin(a.value)) return go('account', { msg: 'Der PIN muss aus 4 bis 12 Ziffern bestehen.' });
        if (a.value !== b.value) return go('account', { msg: 'Die beiden PINs stimmen nicht überein.' });
        db.me.pin = newSecret(a.value);
        await guarded(() => saveMe(['pin']));
        go('account', { msg: '✓ Neuer PIN gespeichert.' });
      } }, 'Speichern'))),
    state.msg ? h('p', { class: state.msg.startsWith('✓') ? 'status ready' : 'warn' }, state.msg) : null);
}

// ------------------------------------------------------------------ Abgleich mit dem gemeinsamen Ordner

let polling = false;
async function poll() {
  if (polling || !db.data || !state.who) return;
  polling = true;
  try {
    const changed = await refreshShared();
    if (isUser()) {
      const fresh = await readUser(state.who.id);
      if (!fresh) { logout(); return; }                                   // Nutzer wurde gelöscht
      db.me.release = fresh.release;
      if (!state.locked) db.me.exams = fresh.exams;
      if (state.locked && state.lock && fresh.release === state.lock.startedAt) { await releaseLocked(); return; }
    }
    if (state.view === 'users') await refreshUsersTable();
    else if (changed && state.view === 'list') render();
    else if (changed && state.view === 'exam' && !state.locked && !state.released && !canPractice()) render();   // Übungsmodus wurde abgeschaltet
    db.error = '';
  } catch (e) {
    db.error = (BACKEND === 'http' ? 'Server' : 'Gemeinsamer Ordner') + ' gerade nicht erreichbar – neuer Versuch in wenigen Sekunden.';
    if (state.view === 'list') render();
  } finally {
    polling = false;
  }
}
setInterval(poll, 3000);

// ------------------------------------------------------------------ Start

async function startHttp() {
  try { await connectServer(); afterConnect(); }
  catch (e) { state.view = 'connect'; state.msg = 'Server nicht erreichbar (' + (e.message || e.name) + ').'; render(); }
}

(async () => {
  if (BACKEND === 'http') return startHttp();
  if (location.hash === '#opfs') {
    try { await useTestStorage(); } catch (e) { }
    return afterConnect();
  }
  if (FS_SUPPORTED) {
    state.savedRoot = await savedFolder();
    if (state.savedRoot) {
      try { if (await reconnect(state.savedRoot, false)) return afterConnect(); } catch (e) { }
    }
  }
  render();
})();

// Prüfer-Ansicht „Nutzer“ beim Öffnen sofort laden
const _go = go;
go = function (view, extra) {
  if (view === 'users') loadUserFiles().then(() => _go(view, extra)).catch(() => _go(view, extra));
  else _go(view, extra);
};
