# ThreeJS-Tests

## Roboterzelle

Interaktive Three.js-Ansicht der Blender-Szene `fliessband_roboter_realistisch`. Die App lädt das exportierte `scene.glb` unverändert: Hierarchie, PBR-Materialien, Gefahrenband-Textur und die eine Animation `PickPlaceLoop`.

Die Kamera ist frei (drehen, schwenken, zoomen, auch per Touch). Der Zyklus läuft automatisch und endlos. Pause, Tempo, Ansicht und Vollbild liegen in der Leiste oben.

## Start

```bash
npm install
npm run dev
```

Die Entwicklungsumgebung ist unter `http://127.0.0.1:47331/` erreichbar.

Produktionsbau:

```bash
npm run build
npm run preview
```

`dist/` ist eine statische Seite und braucht keinen Server außer einem beliebigen Static-Host. Lokal bleiben die Pfade relativ (`base: ./`). Der GitHub-Pages-Bau setzt `GITHUB_PAGES=true` und verwendet die Basis `/ThreeJS-Tests/`.

## Veröffentlichung

GitHub Actions baut `dist/` und veröffentlicht die Seite:

https://ms-3d.github.io/ThreeJS-Tests/

Dieselbe Basis lokal:

```bash
GITHUB_PAGES=true npm run build
GITHUB_PAGES=true npm run preview
```

Die Vorschau liegt dann unter `http://127.0.0.1:47331/ThreeJS-Tests/`.

```bash
npm test
npm run browser-check
```

`browser-check` erwartet, dass die App bereits auf Port 47331 läuft, und nutzt das lokale Chrome.

## Ablauf

`PickPlaceLoop` dauert 9 Sekunden (24 fps, Keys von 1/24 s bis 9 s): 7,5 s Greifen und Ablegen, danach 1,5 s Rückweg in die Grundstellung. Gelenke und Greiferfinger sind am Loop-Übergang deckungsgleich und laufen mit `LoopRepeat`.

Der blaue Block ist der Root-Knoten `Workpiece_Target`. Seine Transformation wird nicht überschrieben. In den Keys springt er nicht bei 9 s, sondern am ersten Sample des Rückwegs (t = 7,5417 s) von der Palette auf die Ruhepose am Band. Die App blendet ihn vorher auf der Palette aus und vor dem nächsten Griff auf dem Band wieder ein. Während Greifen, Transport und Ablegen bleibt er vollständig sichtbar.

## Darstellung

Geometrie, Animation und die eingebettete Streifentextur stammen aus dem GLB. Die Cycles-Materialien der Blender-Datei (Rauschen, Riffelung, Holzmaser) sind im Export flache PBR-Werte. Three.js setzt ACES-Tonemapping, eine RoomEnvironment für Metallreflexionen, Hemisphärenlicht und ein gerichtetes Schattenlicht. Das Bild ist deshalb nüchterner als das Cycles-Rendering, die Konstruktion bleibt dieselbe.

Es sind keine Kameras und keine Lichter im GLB. Die Startansicht ist `(4.1, 2.35, 3.25)` mit Ziel `(0.8, 0.75, 0.6)`. „Rundblick“ ist eine optionale, langsame Drehung und standardmäßig aus.

## Lizenz

three.js 0.180.0 ist unter der MIT-Lizenz gebündelt. Der Text liegt in `public/LICENSES/three.MIT.txt` und damit auch im gebauten `dist/`.

## English

Static Three.js viewer for the exported robot cell. Free orbit controls, endless `PickPlaceLoop`, and a visibility fade that hides the workpiece snap at 7.54 s without rewriting its transform. `npm install`, `npm run dev`, then open port 47331. `npm run build` writes a static `dist/` with relative paths. `GITHUB_PAGES=true npm run build` uses base `/ThreeJS-Tests/` for https://ms-3d.github.io/ThreeJS-Tests/.
