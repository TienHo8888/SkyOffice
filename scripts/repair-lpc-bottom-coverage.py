#!/usr/bin/env python3
"""Fill the small skin gaps left by a few LPC trouser sheets.

Universal LPC separates the body, legs and feet into independent sheets.  Some
of the leg sheets intentionally stop just above the boot, which makes the
base-body skin show through when the sheet is composited with the boot layer.
This repair keeps the original pixels and only fills transparent pixels in
the lower-leg gap with the silhouette from the full-length pantaloons layer.

The generated files are written as ordinary RGBA PNGs.  This is deliberately
kept as a build/import step instead of putting clothing rules in Phaser or
React, so the preview and the in-world renderer consume the same corrected
assets.
"""

from __future__ import annotations

import argparse
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path


FRAME_SIZE = 64
ACTIONS = ("idle", "walk", "run", "slash", "hurt", "shoot", "thrust", "sit")
# Every full-length bottom must meet the shoe/ankle silhouette.  Shorts are
# intentionally excluded because their exposed lower leg is part of the
# garment design, not a missing-pixel repair.  Keeping this list explicit
# also makes the import step fail loudly if a new long-bottom asset is added
# without being reviewed.
REPAIRED_BOTTOMS = (
    "pants",
    "formal",
    "cuffed",
    "pants2",
    "formal-striped",
    "leggings",
    "pantaloons",
    "leggings2",
)


@dataclass
class PngImage:
    width: int
    height: int
    rows: list[list[int]]


def _unfilter_rows(raw: bytes, width: int, height: int, bytes_per_pixel: int, stride: int) -> list[list[int]]:
    rows: list[list[int]] = []
    previous = [0] * stride
    offset = 0

    for _ in range(height):
        filter_type = raw[offset]
        offset += 1
        encoded = list(raw[offset:offset + stride])
        offset += stride
        row = [0] * stride

        for index, value in enumerate(encoded):
            left = row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            above = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0

            if filter_type == 0:
                decoded = value
            elif filter_type == 1:
                decoded = (value + left) & 0xFF
            elif filter_type == 2:
                decoded = (value + above) & 0xFF
            elif filter_type == 3:
                decoded = (value + ((left + above) // 2)) & 0xFF
            elif filter_type == 4:
                estimate = left + above - upper_left
                distance_left = abs(estimate - left)
                distance_above = abs(estimate - above)
                distance_upper_left = abs(estimate - upper_left)
                predictor = left
                if distance_above < distance_left and distance_above <= distance_upper_left:
                    predictor = above
                elif distance_upper_left < distance_left and distance_upper_left < distance_above:
                    predictor = upper_left
                decoded = (value + predictor) & 0xFF
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type}")

            row[index] = decoded

        rows.append(row)
        previous = row

    return rows


def read_png(path: Path) -> PngImage:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")

    position = 8
    idat = b""
    palette: list[tuple[int, int, int]] | None = None
    transparency: list[int] | None = None
    width = height = bit_depth = color_type = interlace = 0

    while position < len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        chunk_type = data[position + 4:position + 8]
        chunk = data[position + 8:position + 8 + length]
        position += length + 12

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
        elif chunk_type == b"PLTE":
            palette = [tuple(chunk[index:index + 3]) for index in range(0, len(chunk), 3)]
        elif chunk_type == b"tRNS":
            transparency = list(chunk)
        elif chunk_type == b"IDAT":
            idat += chunk
        elif chunk_type == b"IEND":
            break

    if interlace != 0:
        raise ValueError(f"Interlaced PNGs are not supported: {path}")
    if bit_depth not in (4, 8):
        raise ValueError(f"Unsupported PNG bit depth {bit_depth}: {path}")
    if color_type not in (3, 6):
        raise ValueError(f"Unsupported PNG color type {color_type}: {path}")

    channels = 1 if color_type == 3 else 4
    stride = (width * channels * bit_depth + 7) // 8
    bytes_per_pixel = max(1, (channels * bit_depth + 7) // 8)
    packed_rows = _unfilter_rows(zlib.decompress(idat), width, height, bytes_per_pixel, stride)
    rgba_rows: list[list[int]] = []

    for packed in packed_rows:
        if color_type == 6:
            if bit_depth != 8:
                raise ValueError(f"Unexpected RGBA bit depth {bit_depth}: {path}")
            rgba = packed
        else:
            if palette is None:
                raise ValueError(f"Indexed PNG has no palette: {path}")
            if bit_depth == 8:
                indices = packed[:width]
            else:
                indices = [value for byte in packed for value in ((byte >> 4) & 0x0F, byte & 0x0F)][:width]

            rgba = []
            for palette_index in indices:
                red, green, blue = palette[palette_index]
                alpha = transparency[palette_index] if transparency and palette_index < len(transparency) else 255
                rgba.extend((red, green, blue, alpha))

        rgba_rows.append(rgba)

    return PngImage(width, height, rgba_rows)


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def write_png(path: Path, image: PngImage) -> None:
    scanlines = b"".join(b"\x00" + bytes(row) for row in image.rows)
    header = struct.pack(">IIBBBBB", image.width, image.height, 8, 6, 0, 0, 0)
    encoded = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(scanlines, 9))
        + png_chunk(b"IEND", b"")
    )
    path.write_bytes(encoded)


def alpha_at(image: PngImage, x: int, y: int) -> int:
    return image.rows[y][x * 4 + 3]


def rgb_at(image: PngImage, x: int, y: int) -> tuple[int, int, int]:
    pixel = image.rows[y][x * 4:x * 4 + 3]
    return pixel[0], pixel[1], pixel[2]


def set_pixel(image: PngImage, x: int, y: int, color: tuple[int, int, int], alpha: int) -> None:
    pixel = image.rows[y]
    offset = x * 4
    pixel[offset:offset + 4] = [color[0], color[1], color[2], alpha]


def luminance(color: tuple[int, int, int]) -> float:
    return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722


def palette_for(image: PngImage) -> list[tuple[int, int, int]]:
    colors = {
        rgb_at(image, x, y)
        for y in range(image.height)
        for x in range(image.width)
        if alpha_at(image, x, y) > 0
    }
    return sorted(colors, key=luminance)


def nearest_palette_color(source_color: tuple[int, int, int], palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    if not palette:
        raise ValueError("Cannot recolor coverage without a target palette")
    source_luminance = luminance(source_color)
    return min(palette, key=lambda color: abs(luminance(color) - source_luminance))


def frame(image: PngImage, column: int, row: int) -> tuple[int, int, int, int]:
    left = column * FRAME_SIZE
    top = row * FRAME_SIZE
    return left, top, min(left + FRAME_SIZE, image.width), min(top + FRAME_SIZE, image.height)


def repair_sheet(target: PngImage, body: PngImage, shoes: PngImage, coverage: PngImage) -> int:
    if not (target.width <= body.width and target.width <= shoes.width and target.width <= coverage.width):
        raise ValueError("A source LPC sheet is narrower than the target sheet")
    if not (target.height == body.height == shoes.height == coverage.height):
        raise ValueError("LPC sheets have different heights")
    if target.width % FRAME_SIZE != 0 or target.height % FRAME_SIZE != 0:
        raise ValueError("LPC sheets must be made of 64x64 frames")

    target_palette = palette_for(target)
    columns = target.width // FRAME_SIZE
    rows = target.height // FRAME_SIZE
    patched = 0

    for row in range(rows):
        for column in range(columns):
            left, top, right, bottom = frame(target, column, row)
            opaque_y = [
                y
                for y in range(top, bottom)
                for x in range(left, right)
                if alpha_at(target, x, y) > 0
            ]
            if not opaque_y:
                continue

            coverage_pixels = [
                (x, y)
                for y in range(top, bottom)
                for x in range(left, right)
                if alpha_at(coverage, x, y) > 0
            ]
            if not coverage_pixels:
                continue
            coverage_left = min(x for x, _ in coverage_pixels)
            coverage_right = max(x for x, _ in coverage_pixels)

            # Only touch the final few pixels below the original trouser hem.
            # This preserves deliberate shape details around the waist and
            # keeps the repair limited to the body/boot transition.
            hem = max(opaque_y)
            lower_gap_start = max(top + 44, hem - 2)

            for y in range(lower_gap_start, bottom):
                for x in range(left, right):
                    if alpha_at(target, x, y) > 0:
                        continue
                    if alpha_at(body, x, y) == 0 or alpha_at(shoes, x, y) > 0 or alpha_at(coverage, x, y) == 0:
                        continue

                    source_color = rgb_at(coverage, x, y)
                    set_pixel(target, x, y, nearest_palette_color(source_color, target_palette), alpha_at(coverage, x, y))
                    patched += 1

            # A few body-profile variants have a transparent slit in the
            # coverage sheet while the base body still contributes skin at
            # the centre of the legs. Fill only the inner leg corridor from
            # one pixel below the normal ankle line; hands and upper-body
            # pixels remain outside this fallback region.
            corridor_left = coverage_left + 2
            corridor_right = coverage_right - 2
            nearest_coverage_pixel = min(
                coverage_pixels,
                key=lambda point: abs(point[0] - (corridor_left + corridor_right) // 2) + abs(point[1] - (top + 51)),
            )
            fallback_color = rgb_at(coverage, nearest_coverage_pixel[0], nearest_coverage_pixel[1])
            for y in range(top + 51, bottom):
                for x in range(corridor_left, corridor_right + 1):
                    if alpha_at(target, x, y) > 0:
                        continue
                    if alpha_at(body, x, y) == 0 or alpha_at(shoes, x, y) > 0:
                        continue

                    set_pixel(target, x, y, nearest_palette_color(fallback_color, target_palette), 255)
                    patched += 1

    return patched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True, help="Path to external/universal-lpc")
    parser.add_argument("--destination-root", type=Path, required=True, help="Path to client/public/assets/avatar/lpc")
    args = parser.parse_args()

    profiles = {
        "male": {
            "body": args.source_root / "spritesheets/body/bodies/male",
            "shoes": args.source_root / "spritesheets/feet/boots/basic/male",
            "coverage": args.source_root / "spritesheets/legs/pantaloons/male",
        },
        "female": {
            "body": args.source_root / "spritesheets/body/bodies/female",
            "shoes": args.source_root / "spritesheets/feet/boots/basic/thin",
            "coverage": args.source_root / "spritesheets/legs/pantaloons/thin",
        },
        "teen": {
            "body": args.source_root / "spritesheets/body/bodies/teen",
            "shoes": args.source_root / "spritesheets/feet/boots/basic/thin",
            "coverage": args.source_root / "spritesheets/legs/pantaloons/thin",
        },
        "pregnant": {
            "body": args.source_root / "spritesheets/body/bodies/pregnant",
            "shoes": args.source_root / "spritesheets/feet/boots/basic/thin",
            "coverage": args.source_root / "spritesheets/legs/pantaloons/thin",
        },
    }

    total = 0
    for bottom_name in REPAIRED_BOTTOMS:
        for profile, sources in profiles.items():
            target_directory = args.destination_root / "bottom" / bottom_name / profile
            if not target_directory.is_dir():
                raise FileNotFoundError(f"Missing runtime bottom directory: {target_directory}")

            for action in ACTIONS:
                target_path = target_directory / f"{action}.png"
                target = read_png(target_path)
                body = read_png(sources["body"] / f"{action}.png")
                shoes = read_png(sources["shoes"] / f"{action}.png")
                coverage = read_png(sources["coverage"] / f"{action}.png")
                patched = repair_sheet(target, body, shoes, coverage)
                write_png(target_path, target)
                total += patched

    print(f"Repaired {total} uncovered lower-leg pixels across {len(REPAIRED_BOTTOMS)} LPC bottom layers")


if __name__ == "__main__":
    main()
