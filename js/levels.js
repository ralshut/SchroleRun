// Die Prüfungen des Schorlemeisters.
// Apfel startet klein und flieht vor Julia. Julia holt auf – nur wer
// rechtzeitig Schorle erwischt, wächst und bleibt ihr voraus. Wer alle
// Prüfungen besteht, wird Schorlemeister und bekommt Julia.
//
// Schorle sind [x, y]-Paare. Bodennah y≈658, erhöht y≈540-600 (springen!).
const LEVELS = [
  {
    title: 'Prüfung der Stärke',
    subtitle: 'Der Überfall im Pfälzer Wald',
    scrollSpeed: 150,
    levelWidth: 5200,
    flagX: 4900,
    bgKey: 'wald_bg',
    fgKey: 'wald_fg',
    tileTheme: 'grass',
    ground: [
      [0, 14], [960, 8], [1620, 6], [2160, 9],
      [2820, 7], [3400, 10], [4140, 5], [4520, 12],
    ],
    platforms: [
      [1500, 580, 3], [2050, 600, 3], [2760, 560, 3],
      [3320, 600, 4], [4060, 560, 3],
    ],
    enemyX: [1100, 1750, 2350, 2950, 3550, 4250, 4700],
    coins: [
      [520, 650], [600, 650], [680, 650],
      [1540, 535], [1604, 535],
      [2300, 650], [2364, 650],
      [3380, 555], [3444, 555],
      [4080, 515], [4144, 515],
      [4600, 650], [4680, 650],
    ],
    // erste bodennah (Tutorial-Wachstum), Rest hoch oben – alle über festem Boden
    schorle: [
      [420, 658], [1100, 545], [1750, 548], [2300, 552], [2600, 548],
      [2950, 548], [3600, 548], [3900, 548], [4600, 555],
    ],
  },
  {
    title: 'Prüfung des Geistes',
    subtitle: 'Die Brücke der Ritter der Kokosnuss',
    scrollSpeed: 165,
    levelWidth: 5600,
    flagX: 5300,
    bgKey: 'wein_bg',
    fgKey: 'wein_fg',
    tileTheme: 'purple',
    ground: [
      [0, 9], [680, 6], [1280, 5], [1850, 6], [2440, 8],
      [3120, 6], [3700, 5], [4200, 6], [4750, 14],
    ],
    platforms: [
      [600, 600, 2], [1180, 560, 2], [1750, 600, 2],
      [3300, 560, 2], [3950, 600, 2], [4400, 560, 2],
    ],
    enemyX: [900, 1500, 2050, 3400, 3900, 4400, 4950],
    coins: [
      [300, 650], [380, 650],
      [1200, 515], [1264, 515],
      [1770, 555], [1834, 555],
      [3320, 515], [3384, 515],
      [3970, 555], [4034, 555],
      [4900, 650], [4980, 650],
    ],
    schorle: [
      [480, 658], [820, 548], [1400, 545], [1980, 550], [2700, 548],
      [3300, 545], [3850, 548], [4300, 552], [5050, 555],
    ],
    // Brücken-Quiz: pausiert, Frage fällt von oben, falsch = verloren
    quiz: {
      x: 2300,
      question: 'Brückenwächter: Wie mischt man\neine echte Pälzer Weinschorle?',
      options: [
        'Wein + Sprudelwasser',
        'Wein + Cola',
        'Wein + Bier',
        'Nur Wein, kein Wasser',
      ],
      correct: 0,
    },
  },
  {
    title: 'Jugger-Turnier',
    subtitle: 'Schleudere die Kette – triff im richtigen Moment!',
    scrollSpeed: 165,
    levelWidth: 5200,
    flagX: 4950,
    bgKey: 'party_bg',
    fgKey: 'party_fg',
    tileTheme: 'sand',
    mode: 'jugger',
    // flacher Boden, keine Löcher
    ground: [[0, 82]],
    platforms: [],
    enemyX: [
      700, 980, 1240, 1520, 1800, 2080, 2360, 2660,
      2960, 3260, 3560, 3860, 4160, 4460, 4760,
    ],
    coins: [
      [520, 650], [600, 650], [1100, 650], [1700, 650],
      [2300, 650], [2900, 650], [3500, 650], [4100, 650], [4700, 650],
    ],
    // direkt auf dem Boden (kein Springen) – Einsammeln durch Drüberlaufen
    schorle: [
      [420, 700], [1100, 700], [1800, 700], [2500, 700],
      [3200, 700], [3900, 700], [4600, 700],
    ],
  },
  {
    title: 'Prüfung des Willens',
    subtitle: 'Die Nacht der Weingöttin',
    scrollSpeed: 195,
    levelWidth: 6200,
    flagX: 5900,
    bgKey: 'party_bg',
    fgKey: 'party_fg',
    tileTheme: 'sand',
    drain: 0.18,
    ground: [
      [0, 10], [720, 6], [1300, 5], [1840, 7], [2520, 9],
      [3260, 6], [3820, 7], [4460, 6], [5020, 6], [5560, 12],
    ],
    platforms: [
      [820, 580, 2], [1400, 560, 2], [1980, 600, 2],
      [3900, 600, 2], [4500, 560, 2], [5100, 560, 2],
    ],
    enemyX: [650, 1000, 1400, 1900, 2350, 3400, 3900, 4500, 5100, 5600],
    coins: [
      [260, 650], [340, 650],
      [1420, 535], [1484, 535],
      [2000, 575], [2064, 575],
      [3920, 575], [3984, 575],
      [4520, 535], [4584, 535],
      [5650, 650], [5730, 650],
    ],
    schorle: [
      [460, 658], [900, 548], [1380, 542], [2000, 548], [2650, 545],
      [3400, 548], [3950, 548], [4500, 548], [5100, 548], [5650, 555],
    ],
    // Pokahontas-Versuchung: Julia verschwindet, Apfel wird gefesselt
    temptation: { x: 2780 },
  },
];
