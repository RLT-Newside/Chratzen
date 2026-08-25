# App-Icon

Motiv: **Eichel** — Schweizer Jass-Farbe, gold auf Filz-Grün. Eigene Geometrie,
nicht aus den Kartengrafiken in `public/cards` abgeleitet.

| Datei | Rolle |
|---|---|
| `foreground.svg` | Eichel, Goldverlauf `#EFC65A → #D3A231` |
| `background.svg` | Filz, Radialverlauf `#1A4029 → #0B1A10` |
| `monochrome.svg` | Silhouette für Themed Icons (Android 13+) |
| `build.mjs` | rendert die Launcher-PNGs |
| `play-store-512.png` | Play-Store-Eintrag, quadratisch, ohne Maske |
| `preview-512.png` | Ansichtsexemplar |

## Canvas

108×108 dp. Alles Sichtbare liegt innerhalb von 32 dp um die Mitte, also auch
in der engsten Maske (66 dp Kreis) noch drin. Deshalb kein Rahmenring: der
würde je nach Launcher-Maske angeschnitten.

## Neu bauen

```bash
npm i sharp && node design/icon/build.mjs
```

Ab API 26 zieht der Launcher die Vektoren
(`android/app/src/main/res/drawable/ic_launcher_{background,foreground,monochrome}.xml`),
die PNGs bedienen nur API 24/25. Wer die SVGs ändert, muss **beides** nachziehen —
die Vektor-XMLs enthalten dieselben `pathData` von Hand.

`npx cap sync android` fasst diese Dateien nicht an.
