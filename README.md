# Chratzen

Webapp für das Schweizer Kartenspiel **Chratzen** — mobile-first, dunkel, offline-fähig.

Zwei Modi:

| Modus | Status | Was er macht |
|---|---|---|
| **Companion** (Kasse) | ✅ | Ihr spielt mit echten Karten und sagt am Tisch an. Die App führt **nur die Kasse**: Grundeinsatz, Pott, Ausschüttung, Bete. **Braucht keinen Server.** |
| **Digital** (Multiplayer) | ✅ | Raumcode, virtueller Tisch, Austeilen/Tauschen/Stechen automatisch, Wiedereinstieg per Token. |

## Wer führt den Tisch?

Der digitale Modus braucht genau eine Stelle, die die Verbindungen annimmt und
den Spielstand hält. Dafür gibt es zwei Wege — **dieselbe Logik, anderer Draht**:

| | Tisch auf dem Handy | Tisch auf einem Server |
|---|---|---|
| Wo | APK, Menü → Digital → *Tisch auf diesem Gerät* | Node-Prozess (Cloud, Pi, Laptop) |
| Reichweite | gleiches WLAN oder Hotspot des Hosts | überall via Internet |
| Kosten | keine, kein Internet nötig | Hosting |
| Gäste | nur ein Browser, keine Installation | nur ein Browser |
| Technik | `ChratzenHostPlugin` (Java/NanoWSD) liefert die App per HTTP aus und nimmt am selben Port WebSockets an; `TableHost` läuft in TypeScript in der App | `server/index.ts` fährt denselben `TableHost` hinter `ws` |

Der Kern (`src/lib/host.ts`) kennt weder Node noch DOM: er bekommt Nachrichten
und gibt zurück, was an welche Verbindung geht. Deshalb gibt es die Spiellogik
nur einmal.

## Entwickeln

```bash
npm install
npm start        # Web (:5173) + Server (:3001) parallel
npm run dev      # nur Frontend — /ws wird auf :3001 geproxyt
npm run server   # nur Backend
npm test         # 35 Unit-Tests (Regeln, Engine, Tischwirt)
npm run smoke    # E2E über echte WebSockets (Server muss laufen)
npm run build    # tsc -b + vite build
npx cap sync android && cd android && ./gradlew assembleRelease   # APK
```

Nach `npm run build` liefert der Server das Frontend gleich mit aus — dann läuft
alles auf `http://localhost:3001`.

## Struktur

```
src/
  lib/money.ts        Rappen-Arithmetik, Largest-Remainder-Split
  lib/rules.ts        Chratzen-Regelwerk, rein funktional (gilt für beide Modi)
  lib/cards.ts        36er-Deck, Stichvergleich, Farbzwang
  lib/game.ts         Autoritative Engine + Redaction pro Spieler
  lib/host.ts         Tischwirt: Räume, Sitzungen, Rauswurf — ohne Transport
  lib/protocol.ts     JSON-Nachrichten zwischen Gast und Tischwirt
  lib/transport.ts    WebSocket-Gast bzw. Host-in-der-WebView
  hooks/useCompanion  Kassen-Zustand des Companion (localStorage, Undo)
  hooks/useOnline     Verbindung, Sitzungs-Token, Auto-Reconnect
  components/         Button/Card/Segmented/Stepper, Spielkarte, Jass-Farben
  screens/            MainMenu, companion/*, digital/*
server/
  index.ts            Express + ws über TableHost, Räume im RAM, TTL 30 min
  smoke.ts            E2E-Check inkl. Verbindungsabbruch
android/
  …/ChratzenHostPlugin.java   WebSocket-Server im LAN, reine Leitung
```

## Protokoll

Nacktes JSON über WebSocket — kein socket.io, damit das Handy-Plugin denselben
Draht sprechen kann.

| Gast → Tischwirt | |
|---|---|
| `{t:'create', name, ante}` | neuen Tisch eröffnen |
| `{t:'join', code, name}` | beitreten |
| `{t:'rejoin', code, token}` | nach Abbruch zurück an den Platz |
| `{t:'start'}` | Partie starten (nur Host) |
| `{t:'call', call}` | `kratzen` / `mitgehen` / `weiter` / `letzter` |
| `{t:'exchange', cards}` | 0–4 Karten tauschen |
| `{t:'sleeper', card}` | Schlafkarte abwerfen |
| `{t:'play', card}` | Karte ausspielen |
| `{t:'next'}` | nächste Runde (nur Host) |
| `{t:'kick', playerId}` | rauswerfen (nur Host) |
| `{t:'force'}` | hängenden Zug übernehmen (nur Host) |

| Tischwirt → Gast | |
|---|---|
| `{t:'joined', code, token}` | Platz und Sitzungs-Token |
| `{t:'state', code, game}` | pro Spieler redigiert — fremde Hände und Reststapel bleiben geheim |
| `{t:'error', message}` | abgelehnte Aktion |
| `{t:'kicked'}` | Sitzung entwertet |

## Geld (gilt für beide Modi)

- **Grundeinsatz** 0.50 / 1.00 / 2.00 CHF. Alle legen ein, sobald der Pott leer ist.
- **Ausschüttung**: gewichtet nach erzielten Stichen.
  `2:1 → ⅔/⅓`, `2:1:1 → ½/¼/¼`. Rappen-genau (Largest Remainder).
- **Bete**: Kratzer unter 2 Stichen bzw. Mitgeher ohne Stich zahlt den vollen Pott nach.
  Mehrere Verlierer zahlen je den vollen Betrag → das ist der neue Pott.
- Gerechnet wird durchgehend in **Rappen als Integer** — keine Float-Rundungsfehler,
  am Ende des Abends geht die Kasse exakt auf.

## Companion: nur die Kasse

Angesagt, getauscht und gestochen wird am Tisch. Die App modelliert den Ablauf
bewusst nicht — kein Geber, kein Trumpf, keine Ansagerunde, kein Letzter, keine
Bannerrunde. Pro Runde braucht sie nur zwei Angaben pro Spieler:

- **Rolle** — raus / kratzt / mit (bestimmt die Strafschwelle: 2 bzw. 1 Stich).
  Kratzen ist exklusiv: tippst du es bei jemand anderem, fällt der bisherige
  Kratzer auf *raus* zurück.
- **Stiche** — 0 bis 4, müssen zusammen 4 ergeben

Daraus fallen Ausschüttung, Bete und der neue Pott heraus. Hat niemand gespielt
und ihr habt neu gemischt: ein Knopf, alle legen nochmals ein.

Kratzen ist exklusiv — es kratzt nur einer pro Runde. Tippst du es bei jemand
anderem an, fragt die App nach, bevor sie wechselt: sonst verschöbe sich still
Geld.

### Kasse ohne Bargeld

Gespielt wird auf Pump, abgerechnet am Schluss. Der Kasse-Tab zeigt darum zwei
Dinge:

- **Plus / Minus** — der Stand jedes Spielers, sortiert.
- **Ausgleich** — wer zahlt wem wie viel, mit möglichst wenigen Zahlungen
  (`settleUp` in `src/lib/money.ts`).

Liegt noch Geld im Pott, geht die Rechnung nicht auf null auf. Der Ausgleich
rechnet ihn deshalb gleichmässig zurück und zeigt, wie es aussähe, wenn ihr
jetzt aufhört — plus einen Knopf, das auch wirklich zu buchen.

Dazu Verlauf, manuelle Korrektur in Einsatz-Schritten und Rückgängig.

## Digitaler Modus: volle Regeln

- **Kratzen** = mind. 2 Stiche, **Mitgehen** = mind. 1 Stich, **Weiter** = aussetzen.
- Es **kratzt nur einer** pro Runde. Wer danach dran ist, kann nur noch mitgehen oder passen.
- **Letzter**: muss mitgehen, wenn sonst niemand mitgeht — sonst freie Wahl.
- **Alle passen**: neuer Trumpf aufdecken, max. 3×; danach neu mischen und alle legen erneut ein.
- **Bannerrunde**: Trumpf ist eine 10 → Geber muss kratzen, alle anderen müssen mitgehen.
- Austeilen einzeln reihum, 4 Karten; die letzte Karte des Gebers wird als Trumpf aufgedeckt.
- **Tausch** 0–4 Karten. Wer alle 4 tauscht, zieht 5 und wirft vor dem Ausspielen
  eine **Schlafkarte** verdeckt ab.
- Kartenrang 6 < 7 < 8 < 9 < 10 < U < O < K < A, Trumpf schlägt Farbe.
  **Farbzwang** (bedienen wenn möglich), kein Stichzwang — anpassbar in `src/lib/cards.ts`.
- Ausspielen beginnt links vom Geber beim ersten Spieler, der noch dabei ist.

## Host-Rechte (digitaler Modus)

- **Rauswerfen**: in der Lobby sofort, in laufender Partie erst zur nächsten Runde
  (mitten im Stich würden Pott und Stichzählung nicht mehr aufgehen). Die Sitzung
  des Betroffenen wird entwertet, der Token funktioniert nicht mehr.
- **Zug übernehmen**: erst freigeschaltet, wenn der Spieler am Zug offline ist oder
  länger als 30 s nicht reagiert. Erzwungen wird immer die harmlose Variante —
  passen, nicht tauschen, erste legale Karte.
- Die Host-Rolle wandert automatisch weiter, wenn der Host offline geht.
- Beim Server-Betrieb zusätzlich gegen Raum-Spam: max. 5 neue Tische pro IP und Minute.

## Tisch auf dem Handy

**Nur der Host braucht die APK.**

1. Host: APK öffnen → **Digital** → Name → *Tisch auf diesem Gerät*.
2. Die Lobby zeigt eine Adresse wie `192.168.43.1:3001` und den Raumcode.
3. Alle anderen tippen diese Adresse in einen beliebigen Browser — Android,
   iPhone, Laptop — und treten mit dem Code bei.

### Das Netz entscheidet, nicht die Distanz

Am selben Tisch zu sitzen genügt nicht. Mit reinen **Mobildaten geht es nicht**:
jedes Gerät hängt einzeln beim Provider hinter CGNAT und kann die anderen nicht
erreichen.

- **Hotspot des Hosts** — zuverlässigste Variante, kostet kein Datenvolumen und
  braucht keine Internetverbindung.
- **Gemeinsames WLAN** — geht, aber öffentliche Netze haben oft AP-Isolation und
  blockieren Gerät-zu-Gerät.

Findet die App kein lokales Netz, warnt die Lobby. Gibt es mehrere Adressen
(WLAN und Hotspot gleichzeitig), lassen sie sich dort durchschalten — der Server
lauscht auf allen.

### Technisch

`ChratzenHostPlugin` fährt einen `NanoWSD`: **HTTP und WebSocket auf einem Port**.
Über HTTP liefert es die Web-Assets aus der APK (`assets/public`) aus, deshalb
braucht kein Gast eine Installation. Die WebSocket-Nachrichten reicht es roh an
die WebView durch, die `TableHost` fährt — denselben Code wie der Node-Server.
Ein Ping alle 20 s deckt tote Verbindungen auf.

Weil die Gästeseite vom Host selbst kommt, liegt der WebSocket am gleichen
Origin — kein Mixed Content, keine Adresse zu konfigurieren. In der App gilt
zusätzlich `androidScheme: 'http'`, sonst würde die Host-WebView ihre eigene
`ws://`-Verbindung blockieren.

Der Bildschirm des Hosts bleibt an, solange der Tisch läuft. Wird die App
geschlossen, ist der Tisch weg.

## Tisch auf einem Server

```bash
npm run build && npm run server
```

Ein Node-Prozess liefert Frontend und WebSockets. Braucht einen Anbieter mit
WebSocket-Support (Fly.io, Railway, Render, eigener Pi — **nicht** Vercel/Netlify).

| Variable | Default | Zweck |
|---|---|---|
| `PORT` | `3001` | Port |

## APK

GitHub Actions baut sie: Workflow **APK** manuell starten oder einen Tag `v*`
pushen. Ohne Keystore-Secrets kommt eine unsignierte APK als Artifact heraus —
zum Installieren braucht es `KEYSTORE_BASE64`, `KEY_ALIAS` und `KEYSTORE_PASSWORD`
als Repository-Secrets.

## Lizenz

GPL-3.0-or-later — siehe [LICENSE](LICENSE).
