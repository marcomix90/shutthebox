# Shut the Box

Browser-Begleiter (PWA) für das Würfelspiel [Shut the Box](https://de.wikipedia.org/wiki/Shut_the_Box) – für 1–4 Spieler.

Standardmäßig wird mit **echten Würfeln** gespielt: die App zeigt nur an, welche Klappen schon umgelegt sind,
und rechnet die Minuspunkte aus. Optional gibt es **digitale Würfel**.

## Funktionen

- 1–4 Spieler (Rot, Blau, Grün, Gelb), optional mit Namen
- Jeder Spieler hat ein eigenes Klappenbrett (in Spielerfarbe), alle Bretter sind sichtbar
- Nach jedem Wurf wird an den nächsten Spieler weitergegeben
- Startspieler frei per Farbe wählbar (oder zufällig auslosen)
- Echte Würfel (Standard) oder digitale Würfel inkl. „Ein Würfel“-Regel
- Klappen 1–10 (Standard), 1–9 oder 1–12, 1/3/5 Runden
- Hinweis, sobald nur noch mit einem Würfel gewürfelt wird (alle Klappen ab 7 zu)
- Button „Runde vorbei“ → Minuspunkte (Summe der offenen Klappen) werden notiert
- Siegeranimation am Spielende, eigene „SHUT THE BOX“-Animation, wenn alle Klappen zu sind
- Spielstand bleibt beim Neuladen erhalten, offline-fähig, installierbar, Bildschirm bleibt während des Spiels an

## Lokal starten

```sh
cd public && python3 -m http.server 8000
# http://localhost:8000
```

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` veröffentlicht den Ordner `public/` bei jedem Push auf `main`
unter https://marcomix90.github.io/shutthebox/ .
Einmalig nötig: *Settings → Pages → Source: GitHub Actions*.

Nach Änderungen an Dateien in `public/` die `VERSION` in `public/sw.js` erhöhen,
damit installierte Apps die neue Version laden.
