from __future__ import annotations
import argparse
import json
from pathlib import Path
import yaml

from scene_analyzer import split_paragraphs, choose_scenes
from prompt_builder import build_prompt
from sd_client import StableDiffusionClient
from docx_writer import read_docx_paragraphs, build_docx, insert_into_existing_docx

def load_story(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    if suffix == ".docx":
        return read_docx_paragraphs(path)
    if suffix in {".md", ".txt"}:
        return split_paragraphs(path.read_text(encoding="utf-8"))
    raise RuntimeError(f"Unsupported input format: {suffix}")

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8")) or {}
    source = Path(cfg["input"])
    output = Path(cfg["output"])
    manifest_path = Path(cfg.get("manifest", output.with_suffix(".json")))
    paragraphs = load_story(source)

    density = cfg.get("density") or {}
    scenes = choose_scenes(
        paragraphs,
        min_gap=int(density.get("min_paragraph_gap", 8)),
        max_images=int(density.get("max_images", 7)),
    )

    client = StableDiffusionClient(cfg.get("sd") or {})
    image_dir = manifest_path.parent / "images"
    records = []
    insertions: dict[int, str] = {}

    for i, scene in enumerate(scenes):
        prompt, negative = build_prompt(scene.excerpt, cfg, i)
        image_path = image_dir / f"{scene.scene_id}.png"
        meta = client.generate(prompt, negative, image_path)
        insertions[scene.paragraph_index] = str(image_path)
        records.append({
            "story_id": cfg.get("story_id", source.stem),
            "scene_id": scene.scene_id,
            "paragraph_after": scene.paragraph_index,
            "score": scene.score,
            "prompt": prompt,
            "negative_prompt": negative,
            "backend": (cfg.get("sd") or {}).get("backend", "automatic1111"),
            **meta,
            "status": "ready",
        })

    if source.suffix.lower() == ".docx":
        insert_into_existing_docx(source, insertions, output)
    else:
        build_docx(paragraphs, insertions, output)

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({
        "story_id": cfg.get("story_id", source.stem),
        "source": str(source),
        "output": str(output),
        "images": records,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "images": len(records), "output": str(output), "manifest": str(manifest_path)}, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
