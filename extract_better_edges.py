#!/usr/bin/env python3
"""
Verbesserte Kantenextraktion für Apfel (groß) und Pokahontas.

Algorithmus remove_white_bg_v2:
  1. BFS Flood-Fill von ALLEN Randpixeln (nicht nur 4 Ecken)
  2. Hintergrundmaske um dilate_px erweitern (frisst Anti-Aliasing-Fransen)
  3. Alpha-Kanal per Distanztransformation sanft ausblenden (feather_px)

Für Pokahontas: Zell-basierte Extraktion aus 5×5-Grid-Poster, verhindert
Artefakte aus Nachbarzellen (Haare, Körperteile aus angrenzenden Sprites).
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
from PIL import Image
from pathlib import Path
from collections import deque
from scipy.ndimage import binary_dilation, distance_transform_edt

SRC = Path("Bildmaterial")
OUT = Path("assets/images")


def remove_white_bg_v2(img: Image.Image,
                       bg_threshold: int = 30,
                       dilate_px: int = 2,
                       feather_px: float = 1.5) -> Image.Image:
    """
    Entfernt weißen Hintergrund.

    bg_threshold : Pixel mit R,G,B >= 255-threshold gelten als weiß
    dilate_px    : Hintergrundmaske um diese Pixel verbreitern (Anti-Alias-Fransen weg)
    feather_px   : Feathering-Breite in Pixeln über Distanztransformation
    """
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8).copy()
    h, w = arr.shape[:2]

    # Weißliche Pixel identifizieren
    is_white = np.all(arr[:, :, :3].astype(int) >= (255 - bg_threshold), axis=2)

    # BFS von ALLEN Randpixeln (nicht nur 4 Ecken)
    bg = np.zeros((h, w), dtype=bool)
    vis = np.zeros((h, w), dtype=bool)
    q = deque()

    def seed(r, c):
        if is_white[r, c] and not vis[r, c]:
            vis[r, c] = True
            bg[r, c] = True
            q.append((r, c))

    for r in range(h):
        seed(r, 0); seed(r, w - 1)
    for c in range(w):
        seed(0, c); seed(h - 1, c)

    while q:
        r, c = q.popleft()
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < h and 0 <= nc < w and not vis[nr, nc] and is_white[nr, nc]:
                vis[nr, nc] = True
                bg[nr, nc] = True
                q.append((nr, nc))

    # Hintergrundmaske um dilate_px vergrößern
    if dilate_px > 0:
        struct = np.ones((dilate_px * 2 + 1, dilate_px * 2 + 1), dtype=bool)
        bg = binary_dilation(bg, structure=struct)

    # Distance-Transform-Feathering
    fg = ~bg
    dist = distance_transform_edt(fg)
    alpha = np.clip(dist / max(feather_px, 0.01) * 255, 0, 255).astype(np.uint8)
    arr[:, :, 3] = alpha

    return Image.fromarray(arr)


def tight_crop(img: Image.Image, pad: int = 4) -> Image.Image:
    """Beschneidet auf den sichtbaren Inhalt (alpha > 20), mit pad Pixel Rand."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rows = np.any(alpha > 20, axis=1)
    cols = np.any(alpha > 20, axis=0)
    if not rows.any():
        return img
    r1, r2 = np.where(rows)[0][[0, -1]]
    c1, c2 = np.where(cols)[0][[0, -1]]
    h, w = arr.shape[:2]
    r1 = max(0, r1 - pad);  r2 = min(h - 1, r2 + pad)
    c1 = max(0, c1 - pad);  c2 = min(w - 1, c2 + pad)
    return img.crop((c1, r1, c2 + 1, r2 + 1))


def keep_largest_component(img: Image.Image, min_ratio: float = 0.15) -> Image.Image:
    """
    Behält nur verbundene Komponenten, die mindestens min_ratio des größten haben.
    Filtert Textreste, Grid-Linien und kleine Artefakte heraus.
    """
    from scipy.ndimage import label as scipy_label

    arr = np.array(img).copy()
    alpha = arr[:, :, 3]
    labeled, n = scipy_label(alpha > 20)
    if n == 0:
        return img

    sizes = [(np.sum(labeled == i), i) for i in range(1, n + 1)]
    max_size = max(s for s, _ in sizes)
    keep = {i for s, i in sizes if s >= max_size * min_ratio}

    mask = np.isin(labeled, list(keep))
    arr[:, :, 3] = np.where(mask, alpha, 0)
    return Image.fromarray(arr)


def find_sprite_boxes(arr: np.ndarray, min_area: int = 3000, padding: int = 4):
    """Findet Bounding-Boxes nicht-transparenter Bereiche (sortiert links→rechts, oben→unten)."""
    from scipy.ndimage import label as scipy_label

    alpha = arr[:, :, 3]
    labeled, _ = scipy_label(alpha > 10)
    h, w = alpha.shape

    boxes = {}
    ys, xs = np.where(labeled > 0)
    for y, x in zip(ys, xs):
        lbl = labeled[y, x]
        if lbl not in boxes:
            boxes[lbl] = [x, y, x, y]
        else:
            b = boxes[lbl]
            if x < b[0]: b[0] = x
            if y < b[1]: b[1] = y
            if x > b[2]: b[2] = x
            if y > b[3]: b[3] = y

    result = []
    for x1, y1, x2, y2 in boxes.values():
        if (x2 - x1) * (y2 - y1) < min_area:
            continue
        x1 = max(0, x1 - padding);   y1 = max(0, y1 - padding)
        x2 = min(w - 1, x2 + padding); y2 = min(h - 1, y2 + padding)
        result.append((x1, y1, x2 + 1, y2 + 1))

    result.sort(key=lambda b: (b[1], b[0]))
    return result


# ─── Apfel-Animations-Sheets ──────────────────────────────────────────────────

def process_apfel_sheet(src_path: Path, out_dir: Path, prefix: str):
    """Apfel-Animationssheet mit verbesserter Kantenextraktion."""
    print(f"\n[Apfel-Sheet] {src_path.name}  →  {prefix}")
    img = Image.open(src_path)
    # bg_threshold=28: frisst weiße Anti-Aliasing-Ränder, lässt helles Glas/Schaum intakt
    img_clean = remove_white_bg_v2(img, bg_threshold=28, dilate_px=2, feather_px=1.5)

    out_dir.mkdir(parents=True, exist_ok=True)
    img_clean.save(out_dir / f"sheet_{prefix}.png", "PNG")

    arr = np.array(img_clean)
    boxes = find_sprite_boxes(arr, min_area=3000, padding=4)
    print(f"  {len(boxes)} Sprites erkannt")

    for i, (x1, y1, x2, y2) in enumerate(boxes, start=1):
        crop = img_clean.crop((x1, y1, x2, y2))
        path = out_dir / f"{prefix}_{i:02d}.png"
        crop.save(path, "PNG")
        print(f"  → {path.name}  ({x2-x1}×{y2-y1}px)")


# ─── Pokahontas-Grid ──────────────────────────────────────────────────────────

# Grid-Grenzen aus Analyse der Quell-Bild-Komponenten (1408×768px):
#   Spalten (x): Linke Ränder der 5 Sprite-Spalten + rechtes Bildende
#                Col 0 startet bei 132 (überspringt Zeilen-Label-Texte "STAND", "RUN x")
#   Zeilen  (y): Poster hat 6 Zeilen: STAND + RUN 1-4 + JUMP
#                JUMP-Zeile (row_idx=5) wird nicht extrahiert (Spiel nutzt nur 4 Tanz-Frames)
#
# Spalte 0 (links, am angezogensten) → clothes=4 im Spiel
# Spalte 4 (rechts, am wenigsten angezogen) → clothes=0
# Zeile 0 = Stand-Pose → pokahontas_{clothes}.png
# Zeile 1-4 = Tanz-Frames → pokahontas_d{clothes}_{frame}.png
# Zeile 5 = JUMP → wird übersprungen
POKA_COL_X = [132, 350, 580, 870, 1140, 1408]
POKA_ROW_Y = [76, 280, 370, 450, 530, 625, 768]


def process_pokahontas(src_path: Path, out_dir: Path):
    """Pokahontas Grid-Extraktion mit verbesserter Kantenextraktion pro Zelle."""
    print(f"\n[Pokahontas-Grid] {src_path.name}")
    img = Image.open(src_path).convert("RGBA")
    W, H = img.size
    print(f"  Bildgröße: {W}×{H}px")

    out_dir.mkdir(parents=True, exist_ok=True)

    for col_idx in range(5):
        clothes = 4 - col_idx          # Spalte 0 → clothes=4, Spalte 4 → clothes=0
        x1_g = POKA_COL_X[col_idx]
        x2_g = POKA_COL_X[col_idx + 1]

        for row_idx in range(5):   # nur 0-4: STAND + RUN 1-4; JUMP (row_idx=5) überspringen
            y1_g = POKA_ROW_Y[row_idx]
            y2_g = POKA_ROW_Y[row_idx + 1]

            # Zelle aus dem Poster ausschneiden
            cell = img.crop((x1_g, y1_g, x2_g, y2_g))

            # Hintergrund entfernen (BFS vom Zellenrand – erfasst auch weiße Ecken
            # die durch Grid-Linien vom äußeren Rand abgetrennt wurden)
            cell_clean = remove_white_bg_v2(
                cell, bg_threshold=30, dilate_px=2, feather_px=1.0
            )

            arr_c = np.array(cell_clean)
            if (arr_c[:, :, 3] > 20).sum() < 50:
                print(f"  Spalte {col_idx+1} Zeile {row_idx+1}: leer, übersprungen")
                continue

            # Größte Komponente behalten (filtert Text-Labels und Grid-Linienreste)
            cell_clean = keep_largest_component(cell_clean, min_ratio=0.15)

            sprite = tight_crop(cell_clean, pad=4)

            if row_idx == 0:
                fname = f"pokahontas_{clothes}.png"
            else:
                fname = f"pokahontas_d{clothes}_{row_idx}.png"

            sprite.save(out_dir / fname, "PNG")
            sw, sh = sprite.size
            print(f"  → {fname}  ({sw}×{sh}px)  [Spalte {col_idx+1}, Zeile {row_idx+1}]")


# ─── Hauptprogramm ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("Verbesserte Kantenextraktion – Apfel & Pokahontas")
    print("=" * 60)

    # Apfel große Animations-Sheets
    for fname, prefix in [
        ("ChatGPT Image 11. Juni 2026, 18_27_37.png", "apfel_large_full_run"),
        ("ChatGPT Image 11. Juni 2026, 18_32_53.png", "apfel_large_empty_run"),
        ("ChatGPT Image 11. Juni 2026, 18_40_10.png", "apfel_large_half_run"),
    ]:
        src = SRC / fname
        if src.exists():
            process_apfel_sheet(src, OUT / "sprites" / "apfel", prefix)
        else:
            print(f"FEHLER: {src} nicht gefunden!")

    # Pokahontas
    poka_src = SRC / "pokahontas_1.png"
    if poka_src.exists():
        process_pokahontas(poka_src, OUT / "sprites" / "enemies")
    else:
        print(f"FEHLER: {poka_src} nicht gefunden!")

    print("\n" + "=" * 60)
    print("Fertig!")
    print("=" * 60)
