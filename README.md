# Chratzen

Webapp für das Schweizer Kartenspiel **Chratzen** — mobile-first, dunkel, offline-fähig.

Zwei Modi:

| Modus | Status | Was er macht |
|---|---|---|
| **Companion** (Pott-Manager) | ✅ | Ihr spielt mit echten Karten. Die App führt Pott, Ansagen, Stiche, Bete/Sack und die Kasse. **Braucht keinen Server.** |
| **Digital** (Multiplayer) | ✅ | Raumcode, virtueller Tisch, Austeilen/Tauschen/Stechen automatisch, Wiedereinstieg per Token. |

## Wer führt den Tisch?

Der digitale Modus braucht genau eine Stelle, die die Verbindungen annimmt und
den Spielstand hält. Dafür gibt es zwei Wege — **dieselbe Logik, anderer Draht**:

| | Tisch auf dem Handy | Tisch auf einem Server |
|---|---|---|
| Wo | APK, Menü → Digital → *Tisch auf diesem Gerät* | Node-Prozess (Cloud, Pi, Laptop) |
| Reichweite | gleiches WLAN oder Hotspot des Hosts | überall via Internet |
| Kosten | keine, kein Internet nötig | Hosting |
| Technik | `ChratzenHostPlugin` (Java) nimmt WebSockets an und reicht die Strings an die WebView durch; `TableHost` läuft in TypeScript in der App | `server/index.ts` fährt denselben `TableHost` hinter `ws` |

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
  hooks/useCompanion  Companion-Zustand (localStorage, Undo)
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

## Regeln (wie implementiert)

- **Grundeinsatz** 0.50 / 1.00 / 2.00 CHF. Alle legen ein, sobald der Pott leer ist.
- **Kratzen** = mind. 2 Stiche, **Mitgehen** = mind. 1 Stich, **Weiter** = aussetzen.
- **Letzter**: muss mitgehen, wenn sonst niemand mitgeht — sonst freie Wahl.
- **Ausschüttung**: gewichtet nach erzielten Stichen.
  `2:1 → ⅔/⅓`, `2:1:1 → ½/¼/¼`. Rappen-genau (Largest Remainder).
- **Strafe**: Kratzer unter 2 Stichen bzw. Mitgeher ohne Stich zahlt den vollen Pott nach.
  Mehrere Verlierer zahlen je den vollen Betrag → das ist der neue Pott.
- **Alle passen**: neuer Trumpf aufdecken, max. 3×; danach neu mischen und alle legen erneut ein.
- **Bannerrunde**: Trumpf ist eine 10 → Geber muss kratzen, alle anderen müssen mitgehen.
  (Companion-Modus: als Umschalter, da mit echten Karten gespielt wird.)

Nur digitaler Modus:

- Austeilen einzeln reihum, 4 Karten; die letzte Karte des Gebers wird als Trumpf aufgedeckt.
- **Tausch** 0–4 Karten. Wer alle 4 tauscht, zieht 5 und wirft vor dem Ausspielen
  eine **Schlafkarte** verdeckt ab.
- Kartenrang 6 < 7 < 8 < 9 < 10 < U < O < K < A, Trumpf schlägt Farbe.
  **Farbzwang** (bedienen wenn möglich), kein Stichzwang — anpassbar in `src/lib/cards.ts`.
- Ausspielen beginnt links vom Geber beim ersten Spieler, der noch dabei ist.

Geld wird intern durchgehend in **Rappen als Integer** gerechnet — keine Float-Rundungsfehler.

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

1. APK öffnen → **Digital** → Name eingeben → *Tisch auf diesem Gerät*.
2. Die Lobby zeigt Adresse (`192.168.x.y:3001`) und Raumcode.
3. Die anderen: **Digital** → *Server* → Adresse eintragen → mit dem Code beitreten.

Alle müssen im selben Netz sein — WLAN der Beiz oder der Hotspot des Hosts.
Internet braucht es dafür nicht. Der Bildschirm des Hosts bleibt an, solange der
Tisch läuft; wird die App geschlossen, ist der Tisch weg.

Technisch: `ChratzenHostPlugin` öffnet einen WebSocket-Server auf Port 3001 und
reicht die Nachrichten roh an die WebView durch. Die WebView fährt `TableHost` —
denselben Code wie der Node-Server. In der App gilt `androidScheme: 'http'`, sonst
würde die WebView eine `ws://`-Verbindung ins LAN als Mixed Content blockieren.

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
