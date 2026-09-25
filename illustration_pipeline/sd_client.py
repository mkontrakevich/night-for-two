from __future__ import annotations
import base64
import json
from pathlib import Path
import requests

class StableDiffusionClient:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.backend = str(cfg.get("backend", "automatic1111")).lower()
        self.base_url = str(cfg.get("base_url", "http://127.0.0.1:7860")).rstrip("/")

    def generate(self, prompt: str, negative_prompt: str, output_path: str | Path) -> dict:
        if self.backend != "automatic1111":
            raise RuntimeError(f"Unsupported SD backend: {self.backend}. Current production adapter: automatic1111")
        payload = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "steps": int(self.cfg.get("steps", 30)),
            "cfg_scale": float(self.cfg.get("cfg_scale", 6.5)),
            "width": int(self.cfg.get("width", 832)),
            "height": int(self.cfg.get("height", 1216)),
            "sampler_name": self.cfg.get("sampler", "DPM++ 2M Karras"),
            "seed": int(self.cfg.get("seed", -1)),
        }
        checkpoint = str(self.cfg.get("checkpoint", "")).strip()
        if checkpoint:
            payload["override_settings"] = {"sd_model_checkpoint": checkpoint}
        response = requests.post(f"{self.base_url}/sdapi/v1/txt2img", json=payload, timeout=180)
        response.raise_for_status()
        data = response.json()
        images = data.get("images") or []
        if not images:
            raise RuntimeError("SD_EMPTY_IMAGE")
        raw = images[0].split(",", 1)[-1]
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(base64.b64decode(raw))
        info = data.get("info")
        try:
            info = json.loads(info) if isinstance(info, str) else (info or {})
        except Exception:
            info = {}
        return {
            "path": str(path),
            "seed": info.get("seed", payload["seed"]),
            "sampler": payload["sampler_name"],
            "steps": payload["steps"],
            "cfg_scale": payload["cfg_scale"],
            "width": payload["width"],
            "height": payload["height"],
            "checkpoint": checkpoint,
        }
