/* Erklärseite mit Wertetabelle, Einmaleins der Gewichte und durchgerechnetem Beispiel. */
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<';

/** Kompakte Zeichen-Wert-Tabelle (auch aufklappbar in der Prüfung). */
function valueTable() {
  const rows = [];
  for (let i = 0; i < CHARS.length; i += 10) {
    const part = CHARS.slice(i, i + 10).split('');
    rows.push(h('tr', {}, h('th', {}, 'Zeichen'), part.map(c => h('td', { class: 'mono big' }, c))));
    rows.push(h('tr', { class: 'vals' }, h('th', {}, 'Wert'), part.map(c => h('td', { class: 'mono' }, value(c)))));
  }
  return h('div', { class: 'tablewrap' }, h('table', { class: 'values' }, h('tbody', {}, rows)));
}

/** Einmaleins: Wert × Gewicht, die Einerstelle hervorgehoben – nur sie zählt für die Prüfziffer.
    Zwei Hälften nebeneinander, damit es auf eine Druckseite passt. */
function productTable() {
  const chars = CHARS.split('').filter(c => c !== '<');
  const half = Math.ceil(chars.length / 2);
  const part = list => h('table', { class: 'products' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Zeichen'), h('th', {}, 'Wert'), ALLOWED_WEIGHTS.map(w => h('th', {}, '× ' + w)))),
    h('tbody', {}, list.map(c => h('tr', {},
      h('td', { class: 'mono big' }, c), h('td', { class: 'mono' }, value(c)),
      ALLOWED_WEIGHTS.map(w => {
        const s = String(value(c) * w);
        return h('td', { class: 'mono' }, s.length > 1 ? h('span', { class: 'tens' }, s.slice(0, -1)) : null, h('b', {}, s.slice(-1)));
      })))));
  return h('div', { class: 'tablewrap pairs' }, part(chars.slice(0, half)), part(chars.slice(half)));
}

/** Schritt-für-Schritt-Tabelle: so rechnet man auf Papier, nur mit Einerstellen. */
function stepTable(text, w) {
  let run = 0;
  const body = text.split('').map((c, i) => {
    const g = w[i % w.length], p = value(c) * g;
    run = (run + p) % 10;
    return h('tr', {}, h('td', {}, i + 1), h('td', { class: 'mono big' }, c), h('td', { class: 'mono' }, value(c)),
      h('td', { class: 'mono' }, g), h('td', { class: 'mono' }, p), h('td', { class: 'mono' }, p % 10), h('td', { class: 'mono strong' }, run));
  });
  return h('div', { class: 'tablewrap' }, h('table', { class: 'tasks steps' },
    h('thead', {}, h('tr', {}, ['Stelle', 'Zeichen', 'Wert', 'Gewicht', 'Produkt', 'Einer', 'Summe (Einer)'].map(t => h('th', {}, t)))),
    h('tbody', {}, body)));
}

function explainView() {
  const icao = [7, 3, 1];
  return h('section', { class: 'explain' },
    h('div', { class: 'bar noprint' },
      h('button', { onclick: () => go('list') }, '← Zur Übersicht'),
      h('button', { onclick: () => window.print() }, 'Drucken')),
    h('h2', {}, 'So funktioniert die Prüfziffer'),
    h('p', {}, 'Eine Prüfziffer erkennt Lese- und Tippfehler: Aus den Zeichen davor wird nach einer festen Regel eine Ziffer ',
      'berechnet und mit abgedruckt. Stimmt sie beim Nachrechnen nicht, ist irgendwo ein Zeichen falsch. ',
      'Der Trainer nutzt das Verfahren aus ICAO 9303, nach dem auch Pässe und Ausweise rechnen – nur mit frei wählbaren Gewichten.'),

    h('h3', {}, '1. Zeichen in Zahlen umwandeln'),
    h('p', {}, 'Ziffern behalten ihren Wert, Buchstaben zählen von A = 10 bis Z = 35, das Füllzeichen < zählt 0.'),
    valueTable(),

    h('h3', {}, '2. Rechnen'),
    h('ol', {},
      h('li', {}, 'Jeden Zeichenwert mit seinem Gewicht malnehmen. Die Gewichte wiederholen sich der Reihe nach: ',
        'bei 7-3-1 also 7, 3, 1, 7, 3, 1 …'),
      h('li', {}, 'Alle Produkte zusammenzählen.'),
      h('li', {}, 'Die Prüfziffer ist der Rest beim Teilen durch 10 – also einfach die letzte Stelle der Summe.')),

    h('h3', {}, '3. Beispiel'),
    h('p', {}, 'Dokumentnummer des ICAO-Musterpasses, Gewichte 7-3-1:'),
    h('p', { class: 'mono example' }, 'L898902C3'),
    stepTable('L898902C3', icao),
    h('p', {}, 'Ergebnis: ', h('code', {}, working({ input: 'L898902C3', sum: weightedSum('L898902C3', icao),
      digit: checkDigit('L898902C3', icao) }, icao))),

    h('h3', {}, '4. Rechentipps für Kopf und Papier'),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Nur Einerstellen zählen. '),
        'Von jedem Produkt reicht die letzte Ziffer, und auch die Summe darf man laufend auf die letzte Ziffer kürzen ',
        '(Spalte „Summe (Einer)“). So bleibt jede Zwischenrechnung einstellig.'),
      h('li', {}, h('strong', {}, 'Füllzeichen zählen 0 – aber sie belegen eine Stelle. '),
        'Das Gewicht läuft über sie weiter. „120“ ergibt mit 7-3-1 die Prüfziffer ' + checkDigit('120', icao)
        + ', „<120“ dagegen ' + checkDigit('<120', icao) + '. Nur Füllzeichen am Ende ändern nichts.'),
      h('li', {}, h('strong', {}, 'Gewicht 1 ist geschenkt: '), 'Der Wert bleibt, wie er ist (bei Buchstaben dessen Einerstelle).'),
      h('li', {}, h('strong', {}, 'Bei 9 rechnen: '), '× 9 ist dasselbe wie „10 minus Einerstelle“ – 4 × 9 = 36, Einer 6 = 10 − 4.'),
      h('li', {}, h('strong', {}, 'Zeilen- und Gesamtprüfziffer: '),
        'Die Blockprüfziffern stehen ja schon in der Zeile und rechnen mit. Wer Zeile für Zeile die Einer-Summen notiert, ',
        'muss für die Gesamtprüfziffer nur noch aufpassen, an welcher Stelle der Gewichtsfolge die nächste Zeile beginnt.')),

    h('h3', {}, '5. Warum nur die Gewichte 1, 3, 7 und 9?'),
    h('p', {}, 'Nur diese Zahlen haben mit 10 keinen gemeinsamen Teiler. Dann erzeugt jeder Wert eine andere Einerstelle, ',
      'und jeder einzelne falsche Ziffernwert fällt auf. Mit Gewicht 2 dagegen ergeben 3 und 8 dieselbe Einerstelle ',
      '(6 und 16), mit Gewicht 5 enden alle geraden Werte auf 0 und alle ungeraden auf 5 – solche Fehler blieben unentdeckt.'),

    h('h3', {}, '6. Aufbau und Schreibweise'),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Z1S8 '), 'bedeutet Zeile 1, Spalte 8. Das Raster zeigt die Spalten oben und die Zeilen links.'),
      h('li', {}, h('strong', {}, 'Blockprüfziffer: '), 'steht direkt hinter dem Block und rechnet nur über seine Zeichen.'),
      h('li', {}, h('strong', {}, 'Zeilenprüfziffer: '), 'an der letzten Stelle der Zeile, über alle Zeichen davor – Blöcke, Blockprüfziffern und Füllzeichen.'),
      h('li', {}, h('strong', {}, 'Gesamtprüfziffer: '), 'an der letzten Stelle der letzten Zeile, über alle Zeichen aller Zeilen davor, einschließlich der Zeilenprüfziffern.')),

    h('h3', {}, '7. Bedienung'),
    typeof NET !== 'undefined' ? h('ul', {},
      h('li', {}, h('strong', {}, 'Anmelden: '), 'Name wählen und eigenen PIN eingeben. Den PIN vergibt der Prüfer; ändern geht unter „Mein PIN“.'),
      h('li', {}, h('strong', {}, 'Üben: '), 'Prüfungen vom Prüfer oder eigene Übungen selbst auswerten, Lösung mit Rechenweg ansehen, mit 🎲 neue Zeichen würfeln – sofern der Prüfer den Übungsmodus erlaubt.'),
      h('li', {}, h('strong', {}, '🔒 Prüfung: '), 'läuft in der eigenen Datei, auch nach Neuladen oder erneuter Anmeldung. Ergebnis und Lösung gibt der Prüfer frei – an seinem Gerät oder mit seinem PIN am Gerät des Prüflings.'),
      h('li', {}, h('strong', {}, '🔑 Prüfer: '), 'legt Nutzer und Prüfungen an – für alle, für einzelne oder mit 🎲 für jeden einzeln ausgewürfelt – sieht unter „Nutzer und Abgaben“ den Stand aller Prüfungen und schaltet den Übungsmodus ein oder aus.'),
      h('li', {}, h('strong', {}, '⏱ Zeitvorgabe: '), 'beim Bearbeiten unter „Aufbau“. Beim Üben abschaltbar, in der Prüfung nicht.')) :
    h('ul', {},
      h('li', {}, h('strong', {}, 'Üben: '), 'selbst auswerten, Lösung mit Rechenweg ansehen, mit 🎲 neue Zeichen würfeln.'),
      h('li', {}, h('strong', {}, '🔒 Prüfung: '), 'Ergebnis und Lösung gibt nur der Prüfer mit seinem PIN frei. Vorher unter „🔑 Prüfer-PIN festlegen“ einrichten.'),
      h('li', {}, h('strong', {}, '🔑 Prüfer: '), 'Anmelden mit PIN. In den Prüfer-Einstellungen lässt sich der Übungsmodus für alle abschalten – '
        + 'dann können nur noch der angemeldete Prüfer üben und Prüfungen anlegen, bearbeiten, importieren oder exportieren.'),
      h('li', {}, h('strong', {}, '⏱ Zeitvorgabe: '), 'beim Bearbeiten unter „Aufbau“ einstellen. Beim Üben abschaltbar, in der Prüfung nicht.'),
      h('li', {}, h('strong', {}, 'Mitnehmen: '), 'Prüfungen werden im Browser gespeichert. Für einen anderen PC exportieren und dort importieren.')),
    h('h3', { class: 'newpage' }, 'Anhang: Einmaleins der Gewichte'),
    h('p', {}, 'Zeichenwert × Gewicht; fett ist die Einerstelle, die allein zählt.'),
    productTable(),

    h('div', { class: 'bar noprint' }, h('button', { onclick: () => go('list') }, '← Zur Übersicht')));
}
