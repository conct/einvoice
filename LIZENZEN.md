# Lizenzen

Der Quelltext steht unter der **Apache License 2.0** (Datei `LICENSE`). Die
Dateien unter `files/` stammen nicht von hier und haben eigene Bedingungen —
diese Datei sagt, welche.

## Schriften — Inter

Urheber: The Inter Project Authors. Lizenz: **SIL Open Font License 1.1**, der
Text liegt als [`files/Inter-OFL.txt`](files/Inter-OFL.txt) bei den
Schriftdateien. Ausgangsmaterial ist das Paket `@expo-google-fonts/inter`.

Mitgeliefert werden nicht die vollständigen Schnitte, sondern zwei daraus
erzeugte Teilmengen — `Inter-Rechnung-Regular.ttf` und
`Inter-Rechnung-Bold.ttf`, je rund 30 kB statt 342 kB. Erzeugt mit
`npm run schrift`; welche Zeichen sie abdecken, steht in
`tools/schrift-erzeugen.mjs`.

Die OFL erlaubt das ausdrücklich: Verändern und Weitergeben sind zulässig,
solange die Lizenz beiliegt (Abschnitt 2) und kein *Reserved Font Name*
verletzt wird. Inter gibt keinen an — der Lizenzkopf nennt lediglich
„Copyright 2020 The Inter Project Authors", ohne Zusatz —, deshalb darf der
Name „Inter" im Dateinamen und in der Schrift stehen bleiben. Kommt später eine
Schrift mit reserviertem Namen ins Spiel, muss die Teilmenge umbenannt werden.

## Farbprofil — sRGB2014.icc

Datei: [`files/sRGB2014.icc`](files/sRGB2014.icc), 3.024 Bytes,
SHA-256 `384b832de3412066743b52a75ee906b6fb9fb8d9e09e936fc2c43223815c6e0a`.

Es ist das **v2-sRGB-Profil des International Color Consortium** (Ausgabe
2014, im Februar 2015 um den Schwarzpunkt korrigiert), geladen am 08.10.2026
von <https://registry.color.org/rgb-registry/profiles/sRGB2014.icc>. Die
Bedingungen der ICC-Profilbibliothek
(<https://registry.color.org/profile-library/>) lauten:

> „This profile is made available by the International Color Consortium, and
> may be copied, distributed, embedded, made, used, and sold without
> restriction."

Verlangt ist nur, dass eine *veränderte* Fassung die ursprüngliche Kennung und
den Urheberrechtsvermerk nicht behält und nicht als das Originalprofil
ausgegeben wird. Hier wird es unverändert weitergegeben; `tools/icc-erzeugen.mjs`
schreibt Prüfsumme und Länge in `src/assets/icc.ts`, damit das nachweisbar
bleibt.

**Warum nicht die Fassung von vorher.** Bis zum 08.10.2026 lag hier das
Systemprofil von Windows (`sRGB Color Space Profile.icm`, 3.144 Bytes,
Hewlett-Packard 1998). Dasselbe Farbraum, aber eine Kopie, deren
Weitergabebedingungen sich nicht sauber belegen ließen. Für ein öffentliches
Repository ist das der falsche Nachweis, und das Profil des ICC ist der
richtige: dieselbe Norm, eine zitierbare Erlaubnis.

## Abhängigkeiten

| Paket | Lizenz | Wofür |
|---|---|---|
| `pdf-lib` | MIT | PDF schreiben |
| `@pdf-lib/fontkit` | MIT | Schriften einbetten, Kerning |
| `fast-xml-parser` | MIT | eingehende Rechnungen lesen |
| `fflate` | MIT | Ströme im PDF und in Word-Dateien |
| `zod` | MIT | Prüfung der Eingaben |

Keine davon ist Copyleft; die Apache-Lizenz dieses Pakets bleibt dadurch
unberührt.
