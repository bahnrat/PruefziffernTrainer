/* Datenmodell der Netzversion – unabhängig davon, ob ein gemeinsamer Ordner (backend-fs.js)
   oder ein kleiner Server (backend-http.js) die Dateien speichert. Das Speicher-Modul stellt
   readText(dir, name), writeText(dir, name, text) und removeFile(dir, name) bereit. */
const db = { root: null, data: null, usersDir: null, config: null, users: [], exams: [], me: null, meId: null, error: '', raw: {} };

async function readJsonFile(dir, name, fallback) {
  const t = await readText(dir, name);
  if (t === null) return fallback;
  try { return JSON.parse(t); } catch (e) { return fallback; }
}

const writeJsonFile = (dir, name, v) => writeText(dir, name, JSON.stringify(v, null, 1));

// ------------------------------------------------------------------ Daten

function newSecret(pin) {
  const salt = Array.from({ length: 16 }, () => randomInt(256).toString(16).padStart(2, '0')).join('');
  return { salt, hash: sha256(salt + ':' + pin) };
}
function secretOk(sec, pin) { return !!(sec && sec.hash && sha256(sec.salt + ':' + pin) === sec.hash); }

async function setupFolder(examinerPin) {
  db.config = { version: 1, examiner: newSecret(examinerPin), practice: true };
  await writeJsonFile(db.data, 'config.json', db.config);
  if (await readText(db.data, 'users.json') === null) await writeJsonFile(db.data, 'users.json', []);
  if (await readText(db.data, 'exams.json') === null) await writeJsonFile(db.data, 'exams.json', []);
  await refreshShared();
}

/** Gemeinsame Dateien neu einlesen. Liefert true, wenn sich etwas geändert hat. */
async function refreshShared() {
  let changed = false;
  for (const [name, key, fallback] of [['config.json', 'config', null], ['users.json', 'users', []], ['exams.json', 'exams', []]]) {
    const t = await readText(db.data, name);
    if (t !== db.raw[name]) {
      db.raw[name] = t;
      let v = fallback;
      try { if (t !== null) v = JSON.parse(t); } catch (e) { }
      if (key === 'exams') v = (Array.isArray(v) ? v : []).map(sanitize);
      if (key === 'users') v = Array.isArray(v) ? v.filter(u => u && /^[0-9a-f]{16}$/.test(u.id) && u.name) : [];
      db[key] = v;
      changed = true;
    }
  }
  return changed;
}

function practiceOn() { return !db.config || db.config.practice !== false; }

async function saveConfig() { await writeJsonFile(db.data, 'config.json', db.config); db.raw['config.json'] = null; }
async function saveUsers() { await writeJsonFile(db.data, 'users.json', db.users); db.raw['users.json'] = null; }
async function saveExams() { await writeJsonFile(db.data, 'exams.json', db.exams); db.raw['exams.json'] = null; }

function emptyUserFile() { return { pin: null, exams: [], lock: null, release: null, last: null }; }

async function readUser(id) {
  const u = await readJsonFile(db.usersDir, id + '.json', null);
  if (!u) return null;
  return Object.assign(emptyUserFile(), u, { exams: (Array.isArray(u.exams) ? u.exams : []).map(sanitize) });
}

/** Nutzerdatei ändern: frisch einlesen, Änderung anwenden, schreiben – Felder des anderen bleiben erhalten. */
async function updateUser(id, change) {
  const u = (await readUser(id)) || emptyUserFile();
  change(u);
  await writeJsonFile(db.usersDir, id + '.json', u);
  return u;
}

async function createUser(name, pin) {
  const id = Array.from({ length: 8 }, () => randomInt(256).toString(16).padStart(2, '0')).join('');
  await writeJsonFile(db.usersDir, id + '.json', Object.assign(emptyUserFile(), { pin: newSecret(pin) }));
  db.users.push({ id, name });
  await saveUsers();
  return id;
}

async function deleteUser(id) {
  db.users = db.users.filter(u => u.id !== id);
  await saveUsers();
  try { await removeFile(db.usersDir, id + '.json'); } catch (e) { }
}

/** Eigene Datei des angemeldeten Nutzers speichern (eigene Prüfungen, laufende Prüfung, PIN). */
async function saveMe(fields) {
  const me = db.me;
  const u = await updateUser(db.meId, f => {
    for (const k of fields) f[k] = me[k];
  });
  db.me.release = u.release;
}
