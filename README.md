# Der Schorlemeister – Das letzte Abenteuer

JGA-Browsergame für Andis Junggesellenabschied. Apfel flieht vor Julia durch die Pfalz und muss als Schorlemeister 4 Prüfungen bestehen.

**Phaser 3 · Vanilla JS · kein Install · läuft auf jedem Smartphone**

---

## Spielen

**https://ralshut.github.io/SchroleRun/**

Einfach Link per WhatsApp teilen — kein Download, kein Freischalten nötig.

---

## Steuerung

| Gerät | Springen | Laufen |
|-------|----------|--------|
| Handy | Tippen / Halten | automatisch |
| Desktop | Mausklick / Halten | automatisch |

Kurz tippen = kleiner Sprung · Lang halten = hoher Sprung

---

## Die 4 Prüfungen

| # | Titel | Besonderheit |
|---|-------|-------------|
| 1 | Prüfung der Stärke – *Der Überfall im Pfälzer Wald* | Jump'n'Run, Elwetrische ausweichen |
| 2 | Prüfung des Geistes – *Die Brücke der Ritter der Kokosnuss* | Quiz-Brücke: falsche Antwort = Tod |
| 3 | Der Schorle-Showdown – *Schleudere die Kette!* | Jugger-Kampf: tippen zum Angriff |
| 4 | Prüfung des Willens – *Die Nacht der Weingöttin* | Pokahontas-Boss-Fight: 5 Runden Elwetrische |

---

## Test-URLs (Direkteinstieg)

### Einzelne Level

```
?level=1    Prüfung der Stärke
?level=2    Prüfung des Geistes
?level=3    Der Schorle-Showdown (Jugger)
?level=4    Prüfung des Willens
```

Beispiel: `https://ralshut.github.io/SchroleRun/?level=4`

### Level 4: Direkt zum Pokahontas-Fight

```
?level=4&fight
```

### Kinderversion (entschärfter Pokahontas-Fight)

```
?kinder=1
```

Startet Level 4 mit großem Elwetrische-Boss statt Pokahontas.

### Kinderversion direkt zum Fight

```
?kinder=1&level=4&fight
```

---

## Technik

```
index.html          Phaser 3 CDN + Cache-Buster-Loader
js/
  levels.js         Level-Definitionen (Schorle, Plattformen, Feinde, Quiz, …)
  IntroScene.js     Logo-Eröffnung
  MenuScene.js      Titelscreen + Asset-Preload
  GameScene.js      Hauptspiel (Physik, Julia, Quiz, Jugger, Pokahontas-Fight)
  HudScene.js       Schorle-Balken + Münzzähler
  GameOverScene.js  "Apfel ist gefallen!"
  WinScene.js       Level-Sieg + Abschluss-Cutscene
assets/
  images/           Sprites, Hintergründe, UI
  sounds/           Musik + SFX
```

**Schorle-Mechanik:** Apfel hat Schorle-Vorrat (= Vorsprung vor Julia). Sinkt er auf null, holt Julia ihn ein. Schorle einsammeln füllt den Vorrat auf und lässt Apfel wachsen.
