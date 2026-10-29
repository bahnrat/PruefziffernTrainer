/* Gemeinsamer Ordner (z. B. auf einer Netzwerk-Festplatte) als Datenspeicher.
   Nutzt die File-System-Access-Schnittstelle von Edge und Chrome. Kein Server, kein Internet.

   Ordner „Pruefziffer-Daten“:
     config.json        Prüfer-PIN (gesalzen + gehasht), Übungsmodus an/aus      – schreibt nur der Prüfer
     users.json         Liste der Nutzer (id, Name)                             – schreibt nur der Prüfer
     exams.json         gemeinsame Prüfungen                                    – schreibt nur der Prüfer
     users/<id>.json    je Nutzer: PIN, eigene Prüfungen, laufende Prüfung      – schreibt der Nutzer,
                        der Prüfer nur Freigabe und PIN-Rücksetzung (vorher frisch eingelesen)
   Jeder schreibt also im Wesentlichen nur „seine“ Dateien – so kommen sich mehrere Geräte nicht in die Quere. */
const DATA_DIR = 'Pruefziffer-Daten';
const FS_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const BACKEND = 'fs';

// ------------------------------------------------------------------ Ordner merken (IndexedDB)

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('pruefziffer-netz', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('handles');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  try {
    const d = await idb();
    return await new Promise(res => { const q = d.transaction('handles').objectStore('handles').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  } catch (e) { return null; }
}
async function idbSet(key, v) {
  try {
    const d = await idb();
    await new Promise(res => { const t = d.transaction('handles', 'readwrite'); t.objectStore('handles').put(v, key); t.oncomplete = res; t.onerror = res; });
  } catch (e) { }
}

// ------------------------------------------------------------------ Dateien

async function readText(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

async function removeFile(dir, name) {
  try { await dir.removeEntry(name); } catch (e) { if (e.name !== 'NotFoundError') throw e; }
}

async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();      // schreibt in eine Hilfsdatei und tauscht beim Schließen aus
  await w.write(text);
  await w.close();
}

// ------------------------------------------------------------------ Verbinden

/** Ordner übernehmen: Ist es nicht schon „Pruefziffer-Daten“, wird der Unterordner benutzt bzw. angelegt. */
async function useRoot(root) {
  db.root = root;
  db.data = root.name === DATA_DIR ? root : await root.getDirectoryHandle(DATA_DIR, { create: true });
  db.usersDir = await db.data.getDirectoryHandle('users', { create: true });
  db.config = await readJsonFile(db.data, 'config.json', null);
  await refreshShared();
}

async function pickFolder() {
  const root = await window.showDirectoryPicker({ id: 'pruefziffer', mode: 'readwrite' });
  await idbSet('root', root);
  await useRoot(root);
}

/** Beim Start: gemerkten Ordner wieder verbinden (Rückfrage des Browsers braucht einen Klick). */
async function savedFolder() { return await idbGet('root'); }

async function reconnect(handle, ask) {
  const opts = { mode: 'readwrite' };
  let p = await handle.queryPermission(opts);
  if (p !== 'granted' && ask) p = await handle.requestPermission(opts);
  if (p !== 'granted') return false;
  await useRoot(handle);
  return true;
}

/** Nur für automatische Tests: browsereigener Speicher statt Netzlaufwerk (Adresse mit #opfs). */
async function useTestStorage() { await useRoot(await navigator.storage.getDirectory()); }

