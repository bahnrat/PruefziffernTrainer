/* Rechenkern – gleiche Regeln und gleiches Speicherformat wie die Android-App (Calc.java / Exam.java). */
const ALLOWED_WEIGHTS = [1, 3, 7, 9];
const LIM = { minLines: 2, maxLines: 4, minWeights: 2, maxWeights: 6, minBlocks: 1, maxBlocks: 6,
              minBlockLen: 1, maxBlockLen: 30, maxFill: 30, minLineLen: 10, maxLineLen: 60 };
const FILL = '<';
const TIME_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120];   // Zeitvorgabe in Minuten, 0 = aus
const RANDOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // ohne O und I (Verwechslung mit 0 und 1)

function value(c) {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  if (c === FILL) return 0;
  throw new Error('Ungültiges Zeichen: ' + c);
}

function weightedSum(s, w) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += value(s[i]) * w[i % w.length];
  return sum;
}

function checkDigit(s, w) { return weightedSum(s, w) % 10; }

function place(line, pos) { return 'Z' + line + 'S' + pos; }

function defaultLine() {
  return { lineCheck: false, blocks: [{ length: 7, fillAfter: 2, content: '' }, { length: 7, fillAfter: 2, content: '' }] };
}

function example() {
  const e = { name: 'Prüfung', lineLength: 32, weights: [7, 3, 1, 9, 3], timeLimit: 0, lines: [] };
  for (let i = 0; i < 4; i++) e.lines.push(defaultLine());
  e.lines[0].lineCheck = true;
  e.lines[3].lineCheck = true;
  return e;
}

function clone(e) { return JSON.parse(JSON.stringify(e)); }

/** Belegte Stellen einer Zeile ohne die Füllzeichen am Zeilenende. */
function used(e, li) {
  const l = e.lines[li];
  let n = 0;
  l.blocks.forEach((b, i) => { n += b.length + 1; if (i < l.blocks.length - 1) n += b.fillAfter; });
  if (l.lineCheck) n++;
  if (li === e.lines.length - 1) n++;
  return n;
}

function validate(e) {
  const err = [];
  if (e.lines.length < LIM.minLines || e.lines.length > LIM.maxLines) err.push('2 bis 4 Zeilen erforderlich');
  if (e.weights.length < LIM.minWeights || e.weights.length > LIM.maxWeights) err.push('2 bis 6 Gewichte erforderlich');
  e.weights.forEach(w => { if (!ALLOWED_WEIGHTS.includes(w)) err.push('Gewicht ' + w + ' nicht erlaubt (nur 1, 3, 7, 9)'); });
  if (e.lineLength < LIM.minLineLen || e.lineLength > LIM.maxLineLen) err.push('Zeilenlänge 10 bis 60');
  e.lines.forEach((l, li) => {
    const z = 'Zeile ' + (li + 1);
    if (!l.blocks.length) err.push(z + ': kein Block');
    const u = used(e, li);
    if (u > e.lineLength) err.push(z + ': ' + (u - e.lineLength) + ' Zeichen zu lang');
    l.blocks.forEach((b, bi) => {
      const bl = z + ', Block ' + (bi + 1);
      if (!b.content) err.push(bl + ': Zeichen fehlen');
      else if (b.content.length !== b.length) err.push(bl + ': ' + b.content.length + ' statt ' + b.length + ' Zeichen');
      if (!/^[0-9A-Z<]*$/.test(b.content)) err.push(bl + ': nur 0–9, A–Z und < erlaubt');
    });
  });
  return err;
}

/** Alle Prüfziffern berechnen (vorher validate). */
function compute(e) {
  const slots = [], out = [];
  let all = '';
  const last = e.lines.length - 1, w = e.weights;
  const slot = (kind, line, pos, block, input, range) => {
    const sum = weightedSum(input, w);
    const s = { kind, line, pos, block, input, range, sum, digit: sum % 10 };
    slots.push(s);
    return s;
  };
  e.lines.forEach((l, li) => {
    const z = li + 1;
    let sb = '';
    l.blocks.forEach((b, bi) => {
      const start = sb.length + 1;
      sb += b.content;
      const s = slot('BLOCK', z, sb.length + 1, bi + 1, b.content, place(z, start) + '–' + sb.length);
      sb += s.digit;
      if (bi < l.blocks.length - 1) sb += FILL.repeat(b.fillAfter);
    });
    const trailing = e.lineLength - sb.length - (l.lineCheck ? 1 : 0) - (li === last ? 1 : 0);
    sb += FILL.repeat(Math.max(0, trailing));
    if (l.lineCheck) {
      const s = slot('LINE', z, sb.length + 1, 0, sb, place(z, 1) + '–' + sb.length);
      sb += s.digit;
    }
    if (li === last) {
      const s = slot('TOTAL', z, sb.length + 1, 0, all + sb, place(1, 1) + ' bis ' + place(z, sb.length));
      sb += s.digit;
    }
    out.push(sb);
    all += sb;
  });
  return { lines: out, slots };
}

function slotTitle(s) {
  if (s.kind === 'BLOCK') return 'Block ' + s.block + ', Zeile ' + s.line;
  if (s.kind === 'LINE') return 'Zeilenprüfziffer Zeile ' + s.line;
  return 'Gesamtprüfziffer';
}

/** Rechenweg, z. B. „A(10)×7 + 1×3 + <(0)×1 = 73 → Prüfziffer 3“. */
function working(s, w) {
  const parts = [];
  for (let i = 0; i < s.input.length; i++) {
    const c = s.input[i];
    parts.push((c >= '0' && c <= '9' ? c : c + '(' + value(c) + ')') + '×' + w[i % w.length]);
  }
  return parts.join(' + ') + ' = ' + s.sum + ' → Prüfziffer ' + s.digit;
}

function randomInt(n) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function randomFill(e, letters) {
  const chars = letters ? '0123456789' + RANDOM_LETTERS : '0123456789';
  e.lines.forEach(l => l.blocks.forEach(b => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += chars[randomInt(chars.length)];
    b.content = s;
  }));
}

/** Eingelesene Daten (Import, Speicher) in eine saubere Prüfung umwandeln. */
function sanitize(o) {
  const num = (v, d) => (Number.isInteger(v) ? v : d);
  const e = {
    name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 80) : 'Prüfung',
    lineLength: num(o.lineLength, 32),
    timeLimit: TIME_OPTIONS.includes(o.timeLimit) ? o.timeLimit : 0,   // Minuten, 0 = aus
    weights: Array.isArray(o.weights) ? o.weights.map(x => num(x, 1)) : [7, 3, 1],
    lines: []
  };
  // Netzwerkversion: für wen die Prüfung bestimmt ist (Nutzer-IDs); fehlt das Feld, gilt sie für alle
  if (Array.isArray(o.for) && o.for.length) e.for = o.for.filter(x => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x));
  (Array.isArray(o.lines) ? o.lines : []).forEach(l => {
    const line = { lineCheck: !!l.lineCheck, blocks: [] };
    (Array.isArray(l.blocks) ? l.blocks : []).forEach(b => line.blocks.push({
      length: num(b.length, 7), fillAfter: num(b.fillAfter, 0),
      content: typeof b.content === 'string' ? b.content.toUpperCase().replace(/[^0-9A-Z<]/g, '') : ''
    }));
    e.lines.push(line);
  });
  return e;
}

if (typeof module !== 'undefined') module.exports = { value, checkDigit, weightedSum, example, compute, validate, working, randomFill, sanitize, used, RANDOM_LETTERS };
