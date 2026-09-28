from __future__ import annotations
import base64
import json
import secrets
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode
import requests

class StableDiffusionClient:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.backend = str(cfg.get("backend", "automatic1111")).lower()
        self.base_url = str(cfg.get("base_url", "http://127.0.0.1:7860")).rstrip("/")

    def generate(self, prompt: str, negative_prompt: str, output_path: str | Path) -> dict:
        if self.backend in {"automatic1111", "a1111"}:
            return self._generate_a1111(prompt, negative_prompt, output_path)
        if self.backend == "comfyui":
            return self._generate_comfyui(prompt, negative_prompt, output_path)
        raise RuntimeError(f"Unsupported SD backend: {self.backend}")

    def _seed(self) -> int:
        configured = int(self.cfg.get("seed", -1))
        return configured if configured >= 0 else secrets.randbits(63)

    def _generate_a1111(self, prompt: str, negative_prompt: str, output_path: str | Path) -> dict:
        payload = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "steps": int(self.cfg.get("steps", 30)),
            "cfg_scale": float(self.cfg.get("cfg_scale", 6.5)),
            "width": int(self.cfg.get("width", 832)),
            "height": int(self.cfg.get("height", 1216)),
            "sampler_name": self.cfg.get("sampler", "DPM++ 2M Karras"),
            "seed": self._seed(),
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
            "backend": "automatic1111",
            "seed": info.get("seed", payload["seed"]),
            "sampler": payload["sampler_name"],
            "steps": payload["steps"],
            "cfg_scale": payload["cfg_scale"],
            "width": payload["width"],
            "height": payload["height"],
            "checkpoint": checkpoint,
        }

    def _comfy_workflow(self, prompt: str, negative_prompt: str, seed: int) -> dict:
        checkpoint = str(self.cfg.get("checkpoint", "")).strip()
        if not checkpoint:
            raise RuntimeError("COMFYUI_CHECKPOINT_REQUIRED")
        sampler = str(self.cfg.get("sampler", "dpmpp_2m"))
        scheduler = str(self.cfg.get("scheduler", "karras"))
        return {
            "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": checkpoint}},
            "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_prompt, "clip": ["1", 1]}},
            "4": {"class_type": "EmptyLatentImage", "inputs": {
                "width": int(self.cfg.get("width", 832)),
                "height": int(self.cfg.get("height", 1216)),
                "batch_size": 1
            }},
            "5": {"class_type": "KSampler", "inputs": {
                "seed": seed,
                "steps": int(self.cfg.get("steps", 30)),
                "cfg": float(self.cfg.get("cfg_scale", 6.5)),
                "sampler_name": sampler,
                "scheduler": scheduler,
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }},
            "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
            "7": {"class_type": "SaveImage", "inputs": {
                "filename_prefix": str(self.cfg.get("filename_prefix", "night_story")),
                "images": ["6", 0]
            }}
        }

    def _generate_comfyui(self, prompt: str, negative_prompt: str, output_path: str | Path) -> dict:
        seed = self._seed()
        client_id = str(uuid.uuid4())
        workflow = self._comfy_workflow(prompt, negative_prompt, seed)
        queued = requests.post(
            f"{self.base_url}/prompt",
            json={"prompt": workflow, "client_id": client_id},
            timeout=30,
        )
        queued.raise_for_status()
        prompt_id = str(queued.json().get("prompt_id") or "")
        if not prompt_id:
            raise RuntimeError("COMFYUI_PROMPT_ID_MISSING")

        timeout = float(self.cfg.get("timeout_seconds", 240))
        poll = max(0.1, float(self.cfg.get("poll_interval_seconds", 1.0)))
        deadline = time.monotonic() + timeout
        image_ref = None
        while time.monotonic() < deadline:
            history_response = requests.get(f"{self.base_url}/history/{prompt_id}", timeout=30)
            history_response.raise_for_status()
            history = history_response.json() or {}
            record = history.get(prompt_id) or {}
            outputs = record.get("outputs") or {}
            for output in outputs.values():
                images = output.get("images") or []
                if images:
                    image_ref = images[0]
                    break
            if image_ref:
                break
            time.sleep(poll)
        if not image_ref:
            raise RuntimeError("COMFYUI_TIMEOUT_OR_EMPTY_IMAGE")

        query = urlencode({
            "filename": image_ref.get("filename", ""),
            "subfolder": image_ref.get("subfolder", ""),
            "type": image_ref.get("type", "output"),
        })
        image_response = requests.get(f"{self.base_url}/view?{query}", timeout=60)
        image_response.raise_for_status()
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(image_response.content)
        return {
            "path": str(path),
            "backend": "comfyui",
            "prompt_id": prompt_id,
            "seed": seed,
            "sampler": str(self.cfg.get("sampler", "dpmpp_2m")),
            "scheduler": str(self.cfg.get("scheduler", "karras")),
            "steps": int(self.cfg.get("steps", 30)),
            "cfg_scale": float(self.cfg.get("cfg_scale", 6.5)),
            "width": int(self.cfg.get("width", 832)),
            "height": int(self.cfg.get("height", 1216)),
            "checkpoint": str(self.cfg.get("checkpoint", "")).strip(),
        }
