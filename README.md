# Prüfziffer-Trainer

Übungsprogramm für Prüfziffern nach dem Verfahren der maschinenlesbaren Zone (MRZ, ICAO 9303) – mit frei einstellbarem Aufbau.
Der Prüfer gibt Zeichen vor oder lässt sie auswürfeln, der Prüfling rechnet **im Kopf und auf Papier** und trägt nur die Prüfziffern ein.
Der Trainer rechnet nach, zeigt die Lösung und den vollständigen Rechenweg.

Läuft im Browser – als einzelne HTML-Datei oder im Heimnetz für mehrere Mitspieler gleichzeitig, auch auf Handy und Tablet.
**Kein Internet, kein Konto, keine Werbung, keine Statistik.**

```
VGYQU3N?<<HHLPE6K?<<<<<<<<<<<<<?
26LNT4P?<<E0R1FYM?<<<<<<<<<<<<<<
```

---

## Funktionen

- **Aufbau frei einstellbar**
  - 2 bis 4 Zeilen, 10 bis 60 Zeichen je Zeile
  - je Zeile 1 bis 6 Blöcke mit eigener Länge und Füllzeichen (`<`) dazwischen
  - Blockprüfziffer hinter jedem Block, Zeilenprüfziffer wählbar, Gesamtprüfziffer am Ende
  - 2 bis 6 Gewichte, nur 1, 3, 7 oder 9 (zu 10 teilerfremd – sonst blieben Fehler unentdeckt)
- **Zeichen vorgeben oder würfeln** (Ziffern oder Ziffern und Buchstaben, ohne O und I)
- **Raster in Zeilen/Spalten-Schreibweise** (`Z1S8` = Zeile 1, Spalte 8), Aufgaben mit Angabe, über welche Stellen gerechnet wird
- **Üben** mit Auswertung, Lösung und Rechenweg Zeichen für Zeichen
- **🔒 Prüfungsmodus** – Ergebnis und Lösung gibt nur der Prüfer mit seinem PIN frei
- **Zeitvorgabe** (abschaltbar) mit Countdown bzw. Stoppuhr
- **Übungsmodus** für alle oder nur für den Prüfer
- **Erklärseite** mit Wertetabelle, Beispiel und Einmaleins der Gewichte
- **Drucken** als Aufgaben- oder Lösungsblatt
- **Export/Import** der Prüfungen als JSON

### Zusätzlich in den Netzfassungen

- Nutzer mit Name und eigenem PIN, vom Prüfer angelegt
- Prüfungen **für alle**, **für ausgewählte Nutzer** oder **🎲 für jeden einzeln gewürfelt** (gleicher Aufbau, andere Zeichen)
- Laufende Prüfung übersteht Neuladen und erneutes Anmelden
- Prüfer-Ansicht **„Nutzer und Abgaben“** mit Live-Stand und Freigabe aus der Ferne
- Eigene Übungen je Nutzer
- QR-Code zum Einladen der Mitspieler (Server-Programm)

---

## Fassungen

| Fassung | Für | Geräte der Mitspieler | Speicher |
|---|---|---|---|
| **Einzelplatz** – `Pruefziffer-Trainer.html` | eine Person / ein Tisch | jeder Browser, auch Handy und Tablet | Browser des Geräts |
| **Server-Programm** – `Pruefziffer-Server(.exe)` | mehrere Personen im Heimnetz | jeder Browser, auch Handy und Tablet | Ordner neben dem Programm |
| **NAS mit PHP** – `index.html` + `api.php` | mehrere Personen im Heimnetz | jeder Browser, auch Handy und Tablet | Ordner auf dem NAS |
| **Gemeinsamer Ordner** – `Pruefziffer-Trainer-Netz.html` | mehrere PCs ohne Server | nur Edge oder Chrome am PC | Netzlaufwerk |

Die fertigen Dateien gibt es unter **[Releases](../../releases)**.

---

## Schnellstart

### Einzelplatz
`Pruefziffer-Trainer.html` herunterladen und per Doppelklick öffnen.

### Server-Programm (Windows)
1. `Pruefziffer-Server.exe` in einen eigenen Ordner legen und starten.
2. Beim ersten Start:
   - SmartScreen: **„Weitere Informationen“ → „Trotzdem ausführen“** (oder vorher Rechtsklick → Eigenschaften → „Zulassen“).
   - Firewall: Zugriff für **private Netzwerke** erlauben.
3. Das Fenster zeigt Adresse und QR-Code, der Browser öffnet sich. Prüfer-PIN festlegen, Nutzer anlegen, Prüfungen anlegen.
4. Mitspieler scannen den QR-Code oder geben die Adresse ein, z. B. `http://192.168.178.20:8080`.

Optionen:

```
Pruefziffer-Server.exe -port 8090 -daten "Z:\Pruefziffer-Daten" -ohne-browser
```

### Server-Programm (Linux / Raspberry Pi)

```bash
chmod +x pruefziffer-server-raspi-64bit
./pruefziffer-server-raspi-64bit -ohne-browser
```

### NAS mit PHP (ab PHP 7.0)
`index.html` und `api.php` in einen Web-Ordner kopieren (z. B. Synology Web Station). Der Webserver braucht Schreibrecht in diesem Ordner; `api.php` legt dort `Pruefziffer-Daten/` an und schützt ihn per `.htaccess`.

### Gemeinsamer Ordner
`Pruefziffer-Trainer-Netz.html` auf ein Netzlaufwerk legen, an jedem PC in Edge oder Chrome öffnen und den Ordner freigeben.

---

## Rechenregeln

- Zeichenwerte: `0`–`9` wie gelesen, `A` = 10 … `Z` = 35, `<` = 0
- Prüfziffer = Summe (Zeichenwert × Gewicht) modulo 10, Gewichte zyklisch wiederholt
- **Blockprüfziffer:** über die Zeichen des Blocks
- **Zeilenprüfziffer:** über alle Zeichen der Zeile davor (Blöcke, Blockprüfziffern, Füllzeichen)
- **Gesamtprüfziffer:** über alle Zeichen aller Zeilen davor, einschließlich der Zeilenprüfziffern
- Füllzeichen zählen 0, belegen aber eine Stelle und verschieben damit die Gewichte

Beispiel (ICAO-Musterpass, Gewichte 7-3-1): `L898902C3` → Prüfziffer **6**.

---

## Aufbau des Projekts

```
html/                    Oberfläche (reines HTML/CSS/JavaScript, keine Bibliotheken)
  core.js                Rechenkern: Prüfziffern, Aufbau, Prüfung, Würfeln
  explain.js             Erklärseite und Wertetabellen
  pin.js                 SHA-256, PIN, Einzelplatz-Sperre
  app.js                 Oberfläche Einzelplatz
  app-net.js             Oberfläche Netzfassungen
  data.js                Datenmodell der Netzfassungen
  backend-fs.js          Speicher: gemeinsamer Ordner (File System Access API)
  backend-http.js        Speicher: Server bzw. api.php
  shell*.html            Seitenrahmen mit Stilen
  build.py               baut daraus die einzelnen HTML-Dateien
server/                  Server-Programm in Go (nur Standardbibliothek)
  main.go                HTTP-Server, Speicher-Schnittstelle, Startfenster
  qr.go                  eigener QR-Code-Erzeuger (Byte-Modus, Stufe M, Version 1–10)
  console_*.go           UTF-8 in der Windows-Konsole
php/
  api.php                Speicher-Schnittstelle für NAS/Webserver
```

### Bauen

HTML-Dateien (Python 3):

```bash
python3 html/build.py
# erzeugt Pruefziffer-Trainer.html, Pruefziffer-Trainer-Netz.html und index.html
```

Server-Programm (Go ≥ 1.22, keine fremden Module):

```bash
cp html/index.html server/
cd server
go test ./...
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o Pruefziffer-Server.exe .
CGO_ENABLED=0 GOOS=linux   GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o pruefziffer-server-raspi-64bit .
CGO_ENABLED=0 GOOS=linux   GOARCH=arm GOARM=7 go build -trimpath -ldflags "-s -w" -o pruefziffer-server-raspi-32bit .
```

Die `index.html` wird ins Programm eingebettet – nach Änderungen an der Oberfläche also neu bauen.

### Speicher-Schnittstelle

Server-Programm und `api.php` bieten dieselbe Schnittstelle; die Oberfläche läuft mit beiden.

| Anfrage | Wirkung |
|---|---|
| `GET api.php?p=ping` | Lebenszeichen (Name, QR-Code verfügbar, Adressen) |
| `GET api.php?p=<datei>` | Datei lesen, `404` wenn nicht vorhanden |
| `POST api.php?p=<datei>` | Datei schreiben (JSON im Rumpf, max. 2 MB) |
| `POST api.php?p=<datei>&delete=1` | Datei löschen |

Erlaubt sind nur `config.json`, `users.json`, `exams.json` und `users/<16 Hex-Zeichen>.json`.
Geschrieben wird über eine Hilfsdatei mit anschließendem Umbenennen.

---

## Datenschutz und Sicherheit

- Keine Verbindung ins Internet – die Seiten laden keine externen Dateien (Content-Security-Policy), Server und `api.php` antworten nur Anfragen aus privaten Netzen.
- Keine echten Daten: Alle Zeichen sind ausgedacht oder gewürfelt; die Beispiel-MRZ trägt den Aufdruck **MUSTER**.
- PINs werden nur gesalzen als SHA-256-Wert gespeichert, nie im Klartext.
- Die Prüfungssperre ist ein **Sichtschutz** für eine faire Runde, kein Schutz gegen jemanden mit Zugriff auf die Entwicklerwerkzeuge oder den Datenordner. Für amtliche Prüfungen ist der Trainer nicht gedacht.
- Den Port des Server-Programms **nicht** im Router freigeben.

---

## Lizenz

Dieses Programm ist freie Software: Sie können es unter den Bedingungen der
**GNU General Public License, Version 3** (oder nach Ihrer Wahl jeder späteren Version),
wie von der Free Software Foundation veröffentlicht, weitergeben und/oder ändern.
Es wird ohne jede Gewährleistung bereitgestellt. Details in der Datei [`LICENSE`](LICENSE).

SPDX-License-Identifier: `GPL-3.0-or-later`

Die Schriften in den PDF-Anleitungen (Liberation Sans/Mono) stehen unter der SIL Open Font License.
