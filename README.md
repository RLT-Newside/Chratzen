# Chratzen

Webapp für das Schweizer Kartenspiel **Chratzen** — mobile-first, dunkel, offline-fähig.

Zwei Modi:

| Modus | Status | Was er macht |
|---|---|---|
| **Companion** (Pott-Manager) | ✅ | Ihr spielt mit echten Karten. Die App führt Pott, Ansagen, Stiche, Bete/Sack und die Kasse. |
| **Digital** (Online Multiplayer) | ✅ | Raumcode, virtueller Tisch, Austeilen/Tauschen/Stechen automatisch, Reconnect per Token. |

## Entwickeln

```bash
npm install
npm start        # Web (:5173) + Socket-Server (:3001) parallel
npm run dev      # nur Frontend  — /socket.io wird auf :3001 geproxyt
npm run server   # nur Backend
npm test         # Regel- und Engine-Tests
npm run smoke    # End-to-End über echte Sockets (Server muss laufen)
npm run build    # tsc -b + vite build
```

Nach `npm run build` liefert der Socket-Server das Frontend gleich mit aus —
`npm run server` und alles läuft auf `http://localhost:3001`.

## Struktur

```
src/
  lib/money.ts        Rappen-Arithmetik, Largest-Remainder-Split
  lib/rules.ts        Chratzen-Regelwerk, rein funktional (gilt für beide Modi)
  lib/cards.ts        36er-Deck, Stichvergleich, Farbzwang
  lib/game.ts         Server-autoritative Engine + Redaction pro Spieler
  lib/*.test.ts       20 Tests — Ausschüttung, Strafen, Banner, volle Runden
  hooks/useCompanion  State des Companion-Modus (localStorage, Undo)
  hooks/useOnline     Socket-Client, Session-Token, Auto-Reconnect
  components/         Button/Card/Segmented/Stepper, Spielkarte, Jass-Farben
  screens/            MainMenu, companion/*, digital/*
server/
  index.ts            Express + Socket.io, Räume im RAM, TTL 30 min
  smoke.ts            E2E-Check inkl. Verbindungsabbruch
```

## Socket-Protokoll

| Client → Server | Payload |
|---|---|
| `room:create` | `{ name, ante }` → ack `{ code, token }` |
| `room:join` | `{ code, name }` → ack `{ code, token }` |
| `room:rejoin` | `{ code, token }` |
| `game:start` | — (nur Host) |
| `game:call` | `{ call: 'kratzen' \| 'mitgehen' \| 'weiter' \| 'letzter' }` |
| `game:exchange` | `{ cards: CardId[] }` (0–4) |
| `game:sleeper` | `{ card: CardId }` |
| `game:play` | `{ card: CardId }` |
| `game:next` | — (nur Host) |

Server → Client: `state` (pro Spieler redigiert — fremde Hände und Reststapel
bleiben geheim) und `error:msg`.

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

Der Host ist ein Spieler mit Sonderrechten auf dem zentralen Server — kein Gerät,
das den Server selbst betreibt.

- **Rauswerfen**: in der Lobby sofort, in laufender Partie erst zur nächsten Runde
  (mitten im Stich würden Pott und Stichzählung nicht mehr aufgehen). Die Sitzung
  des Betroffenen wird entwertet, der Token funktioniert nicht mehr.
- **Zug übernehmen**: erst freigeschaltet, wenn der Spieler am Zug offline ist oder
  länger als 30 s nicht reagiert. Erzwungen wird immer die harmlose Variante —
  passen, nicht tauschen, erste legale Karte.
- Die Host-Rolle wandert automatisch weiter, wenn der Host offline geht.
- Gegen Raum-Spam von aussen: max. 5 neue Räume pro IP und Minute.

## Betrieb

```bash
npm run build && npm run server
```

Ein Node-Prozess liefert Frontend und WebSockets. Braucht einen Host mit
WebSocket-Support (Fly.io, Railway, Render — **nicht** Vercel/Netlify).

| Variable | Default | Zweck |
|---|---|---|
| `PORT` | `3001` | Port |
| `CORS_ORIGIN` | `*` | im Betrieb auf die eigene Domain setzen |

## Lizenz

GPL-3.0-or-later — siehe [LICENSE](LICENSE).
