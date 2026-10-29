/* Speicher über einen kleinen Server im Heimnetz: das Programm „Pruefziffer-Server“ auf einem PC
   oder das Skript api.php auf einem NAS mit PHP. Beide bieten dieselbe Schnittstelle:
     GET  api.php?p=<datei>            Datei lesen (404 = gibt es nicht)
     POST api.php?p=<datei>            Datei schreiben (Inhalt im Rumpf)
     POST api.php?p=<datei>&delete=1   Datei löschen
     GET  api.php?p=ping               Lebenszeichen mit Servername
   So läuft die Oberfläche auf jedem Gerät mit Browser – auch auf Handy und Tablet. */
const BACKEND = 'http';
const DATA_DIR = 'Pruefziffer-Daten';
const FS_SUPPORTED = false;
const API = 'api.php';

function apiPath(dir, name) { return (dir.path ? dir.path + '/' : '') + name; }

async function api(p, opts) {
  const url = API + '?p=' + encodeURIComponent(p) + (opts && opts.del ? '&delete=1' : '');
  const r = await fetch(url, {
    method: opts && (opts.body !== undefined || opts.del) ? 'POST' : 'GET',
    body: opts && opts.body !== undefined ? opts.body : undefined,
    headers: opts && opts.body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : undefined,
    cache: 'no-store'
  });
  if (r.status === 404 && !(opts && (opts.body !== undefined || opts.del))) return null;
  if (!r.ok) throw new Error('Server antwortet mit ' + r.status);
  return await r.text();
}

async function readText(dir, name) { return await api(apiPath(dir, name)); }
async function writeText(dir, name, text) { await api(apiPath(dir, name), { body: text }); }
async function removeFile(dir, name) { await api(apiPath(dir, name), { del: true }); }

/** Mit dem Server verbinden; liefert false, wenn er nicht antwortet. */
async function connectServer() {
  const t = await api('ping');
  let info = {};
  try { info = JSON.parse(t || '{}'); } catch (e) { }
  db.root = { name: info.name || 'Server' };
  db.data = { path: '' };
  db.usersDir = { path: 'users' };
  db.qr = !!info.qr;
  db.urls = Array.isArray(info.urls) ? info.urls : [];
  db.config = await readJsonFile(db.data, 'config.json', null);
  db.raw = {};
  await refreshShared();
  return true;
}
