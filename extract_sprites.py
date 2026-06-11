#!/usr/bin/env python3
"""
Schorlemeister JnR - Asset-Extraktion
Entfernt weissen Hintergrund und schneidet Einzelsprites aus den Kollagebildern heraus.
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")

from PIL import Image
import numpy as np
from pathlib import Path

SRC = Path("Bildmaterial")
OUT = Path("assets/images")

# Farbtoleranz für Weißerkennung (0-255)
WHITE_THRESHOLD = 25
# Minimale Spritegröße in Pixeln (Breite * Höhe) – ignoriert Rauschen
MIN_SPRITE_AREA = 2000
# Padding um jeden Sprite (Pixel)
PADDING = 8


def remove_white_bg(img: Image.Image, threshold: int = WHITE_THRESHOLD) -> Image.Image:
    """Macht weiße/hellgraue Pixel transparent (Flood-Fill von den Ecken)."""
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)

    # Maske: alle Pixel, die "nah an Weiß" sind
    is_white = (
        (arr[:, :, 0].astype(int) >= 255 - threshold)
        & (arr[:, :, 1].astype(int) >= 255 - threshold)
        & (arr[:, :, 2].astype(int) >= 255 - threshold)
    )

    # Flood-Fill von allen 4 Ecken, um nur den Hintergrund zu markieren
    h, w = is_white.shape
    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)

    # BFS von den 4 Ecken
    from collections import deque
    seeds = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    queue = deque()
    for r, c in seeds:
        if is_white[r, c] and not visited[r, c]:
            queue.append((r, c))
            visited[r, c] = True
            bg_mask[r, c] = True

    while queue:
        r, c = queue.popleft()
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < h and 0 <= nc < w and not visited[nr, nc] and is_white[nr, nc]:
                visited[nr, nc] = True
                bg_mask[nr, nc] = True
                queue.append((nr, nc))

    arr[bg_mask, 3] = 0  # Hintergrund transparent
    return Image.fromarray(arr)


def find_sprite_boxes(arr: np.ndarray, min_area: int = MIN_SPRITE_AREA, padding: int = PADDING):
    """
    Findet Bounding-Boxes von Sprites über ein einfaches Connected-Components-Verfahren.
    Gibt sortierte Liste von (x1, y1, x2, y2) zurück (links→rechts, oben→unten).
    """
    alpha = arr[:, :, 3]
    mask = (alpha > 10).astype(np.int32)
    h, w = mask.shape

    # Union-Find für Connected Components
    labels = np.zeros((h, w), dtype=np.int32)
    label_id = 0
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent.get(x, x), parent.get(x, x))
            x = parent.get(x, x)
        return x

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[b] = a

    for r in range(h):
        for c in range(w):
            if mask[r, c] == 0:
                continue
            label_id += 1
            labels[r, c] = label_id
            parent[label_id] = label_id
            if r > 0 and labels[r - 1, c]:
                union(labels[r, c], labels[r - 1, c])
                labels[r, c] = find(labels[r, c])
            if c > 0 and labels[r, c - 1]:
                union(labels[r, c], labels[r, c - 1])
                labels[r, c] = find(labels[r, c])

    # Normalisiere Labels
    for r in range(h):
        for c in range(w):
            if labels[r, c]:
                labels[r, c] = find(labels[r, c])

    # Bounding-Boxes sammeln
    boxes = {}
    for r in range(h):
        for c in range(w):
            lbl = labels[r, c]
            if lbl == 0:
                continue
            if lbl not in boxes:
                boxes[lbl] = [c, r, c, r]
            else:
                boxes[lbl][0] = min(boxes[lbl][0], c)
                boxes[lbl][1] = min(boxes[lbl][1], r)
                boxes[lbl][2] = max(boxes[lbl][2], c)
                boxes[lbl][3] = max(boxes[lbl][3], r)

    result = []
    for lbl, (x1, y1, x2, y2) in boxes.items():
        area = (x2 - x1) * (y2 - y1)
        if area < min_area:
            continue
        x1 = max(0, x1 - padding)
        y1 = max(0, y1 - padding)
        x2 = min(w - 1, x2 + padding)
        y2 = min(h - 1, y2 + padding)
        result.append((x1, y1, x2 + 1, y2 + 1))

    # Sortieren: erst nach Zeile (y-Gruppierung), dann nach Spalte (x)
    # Zeilen-Gruppen: Sprites mit ähnlichem y-Zentrum gehören zur selben Zeile
    if not result:
        return []

    result.sort(key=lambda b: (b[1], b[0]))

    # Zeilen-Gruppen zusammenfassen (Sprites mit y-Abstand < 50% Sprite-Höhe)
    row_height_factor = 0.5
    rows = []
    current_row = [result[0]]
    for box in result[1:]:
        cy_current = (current_row[-1][1] + current_row[-1][3]) / 2
        cy_box = (box[1] + box[3]) / 2
        row_h = current_row[-1][3] - current_row[-1][1]
        if abs(cy_box - cy_current) < row_h * row_height_factor:
            current_row.append(box)
        else:
            rows.append(sorted(current_row, key=lambda b: b[0]))
            current_row = [box]
    rows.append(sorted(current_row, key=lambda b: b[0]))

    return [box for row in rows for box in row]


def save_sprites(img_rgba: Image.Image, boxes, out_dir: Path, prefix: str):
    """Speichert jeden erkannten Sprite als eigene PNG-Datei."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, (x1, y1, x2, y2) in enumerate(boxes, start=1):
        crop = img_rgba.crop((x1, y1, x2, y2))
        path = out_dir / f"{prefix}_{i:02d}.png"
        crop.save(path, "PNG")
        print(f"  → {path} ({x2-x1}×{y2-y1}px)")


# ─────────────────────────────────────────────────────────────────────────────
# Verarbeitungsregeln pro Bild
# ─────────────────────────────────────────────────────────────────────────────

def process_animation_sheet(src_path: Path, out_dir: Path, prefix: str):
    """
    Verarbeitet eine Animations-Kollagenbild:
    Hintergrund entfernen → Sprites erkennen → Einzeldateien speichern.
    Zusätzlich wird das Gesamt-Sheet (ohne BG) als spritesheet_<prefix>.png gespeichert.
    """
    print(f"\n[Animation-Sheet] {src_path.name}")
    img = Image.open(src_path)
    img_no_bg = remove_white_bg(img)

    # Gesamt-Sheet speichern (für Flame SpriteSheet falls nötig)
    sheet_out = out_dir / f"sheet_{prefix}.png"
    out_dir.mkdir(parents=True, exist_ok=True)
    img_no_bg.save(sheet_out, "PNG")
    print(f"  Sheet → {sheet_out}")

    # Einzelsprites
    arr = np.array(img_no_bg)
    boxes = find_sprite_boxes(arr, min_area=3000, padding=6)
    print(f"  {len(boxes)} Sprites erkannt")
    save_sprites(img_no_bg, boxes, out_dir, prefix)


def process_overview_sheet(src_path: Path):
    """
    Verarbeitet das große Übersichtsbild (18_26_07).
    Extrahiert die verschiedenen Sprite-Gruppen in passende Unterordner.
    Hintergrund wird entfernt, dann werden Sprites nach Gruppen sortiert.
    """
    print(f"\n[Übersichts-Sheet] {src_path.name}")
    img = Image.open(src_path)
    img_no_bg = remove_white_bg(img)
    arr = np.array(img_no_bg)

    h, w = arr.shape[:2]
    print(f"  Bildgröße: {w}×{h}px")

    # Alle Sprites finden
    boxes = find_sprite_boxes(arr, min_area=1500, padding=6)
    print(f"  {len(boxes)} Sprites erkannt")

    # Gesamtes Sheet ohne Background speichern
    sheet_out = OUT / "sprites" / "sheet_overview.png"
    sheet_out.parent.mkdir(parents=True, exist_ok=True)
    img_no_bg.save(sheet_out, "PNG")
    print(f"  Sheet → {sheet_out}")

    # Alle Einzelsprites in overview/ speichern (manuelles Nachsortieren später)
    out_dir = OUT / "sprites" / "overview"
    save_sprites(img_no_bg, boxes, out_dir, "sprite")

    # Vereinfachte Gruppen-Zuweisung nach Position im Bild
    # Das Bild ist ~1000x800px mit folgender grober Aufteilung (% der Bildhöhe):
    #   0-35%:  Oben (Mann V1 klein, Mann V2 Einzel, Dubbeglas)
    #   35-65%: Mitte (Elwetrische, Münzen, Bäume)
    #   65-100%: Unten (Kisten, Objekte, Zielfane, Plattformen)

    groups = {
        "apfel_small": [],       # Oben links: kleine Figur
        "elwetrische": [],       # Mitte links: Elwetrische
        "coins": [],             # Mitte: Münzen
        "trees": [],             # Mitte rechts: Bäume
        "tiles": [],             # Unten: Plattformen und Blöcke
        "ui": [],                # Zielfane, Pilz etc.
        "other": [],
    }

    for box in boxes:
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        rel_x = cx / w
        rel_y = cy / h

        if rel_y < 0.40:
            if rel_x < 0.45:
                groups["apfel_small"].append(box)
            else:
                groups["ui"].append(box)
        elif rel_y < 0.65:
            if rel_x < 0.25:
                groups["elwetrische"].append(box)
            elif rel_x < 0.50:
                groups["coins"].append(box)
            else:
                groups["trees"].append(box)
        else:
            if rel_x > 0.60:
                groups["tiles"].append(box)
            else:
                groups["ui"].append(box)

    group_dirs = {
        "apfel_small": OUT / "sprites" / "apfel",
        "elwetrische": OUT / "sprites" / "enemies",
        "coins": OUT / "sprites" / "items",
        "trees": OUT / "sprites" / "tiles",
        "tiles": OUT / "sprites" / "tiles",
        "ui": OUT / "sprites" / "ui",
        "other": OUT / "sprites" / "other",
    }
    group_prefixes = {
        "apfel_small": "apfel_small_run",
        "elwetrische": "elwetrische",
        "coins": "coin",
        "trees": "tree",
        "tiles": "tile",
        "ui": "ui",
        "other": "other",
    }

    for group, grp_boxes in groups.items():
        if grp_boxes:
            save_sprites(img_no_bg, grp_boxes, group_dirs[group], group_prefixes[group])


def process_dubbeglas(src_path: Path):
    """Verarbeitet das Dubbeglas-Foto: Hintergrund entfernen → schorle_pickup.png"""
    print(f"\n[Dubbeglas-Pickup] {src_path.name}")
    img = Image.open(src_path).convert("RGBA")
    img_no_bg = remove_white_bg(img, threshold=40)
    out_path = OUT / "sprites" / "items" / "schorle_pickup.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img_no_bg.save(out_path, "PNG")
    print(f"  → {out_path}")


def process_logo(src_path: Path):
    """Speichert das Logo: heller Hintergrund entfernen"""
    print(f"\n[Logo] {src_path.name}")
    img = Image.open(src_path)
    # Logo hat schwarzen Hintergrund – nur die schwarze Version als UI-Element speichern
    out_path = OUT / "ui" / "logo.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGBA").save(out_path, "PNG")
    print(f"  → {out_path}")


def process_title_image(src_path: Path):
    """Speichert das Titelbild (Jäger der Verlorenen Schorle)"""
    print(f"\n[Titelbild] {src_path.name}")
    img = Image.open(src_path)
    out_path = OUT / "ui" / "title_screen.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGBA").save(out_path, "PNG")
    print(f"  → {out_path}")


# ─────────────────────────────────────────────────────────────────────────────
# Hauptprogramm
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("Schorlemeister JnR – Asset-Extraktion")
    print("=" * 60)

    # 1) Übersichtsbild (Mann V1, Elwetrische, Münzen, Bäume, Kisten, Zielfane)
    overview = SRC / "ChatGPT Image 11. Juni 2026, 18_26_07.png"
    if overview.exists():
        process_overview_sheet(overview)

    # 2) Animationssheets für große Figur (Mann V2)
    anim_sheets = [
        (SRC / "ChatGPT Image 11. Juni 2026, 18_27_37.png",
         OUT / "sprites" / "apfel", "apfel_large_full_run"),
        (SRC / "ChatGPT Image 11. Juni 2026, 18_32_53.png",
         OUT / "sprites" / "apfel", "apfel_large_empty_run"),
        (SRC / "ChatGPT Image 11. Juni 2026, 18_40_10.png",
         OUT / "sprites" / "apfel", "apfel_large_half_run"),
    ]
    for path, out_dir, prefix in anim_sheets:
        if path.exists():
            process_animation_sheet(path, out_dir, prefix)

    # 3) Dubbeglas-Foto als Pickup-Item
    dubbeglas = SRC / "05_dubbeglas_mit_rieslingschorle.webp"
    if dubbeglas.exists():
        process_dubbeglas(dubbeglas)

    # 4) Logo
    logo = SRC / "Logo_schmales_Glas.png"
    if logo.exists():
        process_logo(logo)

    # 5) Titelbild
    title = SRC / "Jäger_der_Verlorenen_Schorle.png"
    if title.exists():
        process_title_image(title)

    print("\n" + "=" * 60)
    print("Fertig! Assets in: assets/images/")
    print("Tipp: overview/ Sprites manuell prüfen und ggf. umbenennen.")
    print("=" * 60)
