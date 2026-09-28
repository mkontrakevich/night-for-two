from __future__ import annotations
import base64
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image
from docx import Document
from scene_analyzer import split_paragraphs, choose_scenes
from prompt_builder import build_prompt
from docx_writer import build_docx
from sd_client import StableDiffusionClient

class FakeResponse:
    def __init__(self, payload=None, content=b""):
        self._payload = payload or {}
        self.content = content
    def raise_for_status(self):
        return None
    def json(self):
        return self._payload

class PipelineTest(unittest.TestCase):
    def test_scene_selection_and_prompt(self):
        paragraphs = split_paragraphs(
            "Обычный абзац без события.\n\n"
            "После полуночи дверь в коридоре вдруг открылась. На ладони лежал серебряный ключ, рядом горела лампа.\n\n"
            "Они остановились у зеркала и увидели письмо."
        )
        scenes = choose_scenes(paragraphs, min_gap=1, max_images=2)
        self.assertGreaterEqual(len(scenes), 1)
        prompt, negative = build_prompt(
            scenes[0].excerpt,
            {
                "style": {"base": "premium cinematic editorial still"},
                "continuity": {
                    "characters": {"A": "adult, dark jacket"},
                    "recurring_objects": ["silver key"],
                    "locations": {"hotel": "dark wood, brass"}
                }
            },
            0,
        )
        self.assertIn("Character identity lock", prompt)
        self.assertIn("silver key", prompt)
        self.assertIn("extra fingers", negative)

    def test_docx_insertion(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            image = root / "frame.png"
            Image.new("RGB", (64, 64), "white").save(image)
            output = root / "story.docx"
            build_docx(["Первый абзац", "Второй абзац"], {0: str(image)}, output)
            self.assertTrue(output.exists())
            doc = Document(str(output))
            self.assertEqual(len(doc.inline_shapes), 1)
            self.assertIn("Первый абзац", "\n".join(p.text for p in doc.paragraphs))

    @patch("sd_client.requests.post")
    def test_automatic1111_adapter(self, post):
        png = base64.b64encode(b"fake-png").decode()
        post.return_value = FakeResponse({"images": [png], "info": '{"seed":123}'})
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "a.png"
            meta = StableDiffusionClient({
                "backend": "automatic1111", "base_url": "http://sd", "seed": 123
            }).generate("p", "n", out)
            self.assertEqual(out.read_bytes(), b"fake-png")
            self.assertEqual(meta["seed"], 123)
            self.assertEqual(meta["backend"], "automatic1111")
            self.assertTrue(post.call_args.args[0].endswith("/sdapi/v1/txt2img"))

    @patch("sd_client.requests.get")
    @patch("sd_client.requests.post")
    def test_comfyui_adapter(self, post, get):
        post.return_value = FakeResponse({"prompt_id": "job-1"})
        get.side_effect = [
            FakeResponse({"job-1": {"outputs": {"7": {"images": [
                {"filename": "frame.png", "subfolder": "", "type": "output"}
            ]}}}}),
            FakeResponse(content=b"comfy-png"),
        ]
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "c.png"
            meta = StableDiffusionClient({
                "backend": "comfyui",
                "base_url": "http://comfy",
                "checkpoint": "sdxl.safetensors",
                "seed": 77,
                "poll_interval_seconds": 0.1,
            }).generate("p", "n", out)
            self.assertEqual(out.read_bytes(), b"comfy-png")
            self.assertEqual(meta["seed"], 77)
            self.assertEqual(meta["backend"], "comfyui")
            self.assertEqual(meta["checkpoint"], "sdxl.safetensors")
            self.assertTrue(post.call_args.args[0].endswith("/prompt"))
            self.assertIn("/history/job-1", get.call_args_list[0].args[0])
            self.assertIn("/view?", get.call_args_list[1].args[0])

    def test_comfyui_requires_checkpoint(self):
        client = StableDiffusionClient({"backend": "comfyui", "checkpoint": ""})
        with self.assertRaisesRegex(RuntimeError, "COMFYUI_CHECKPOINT_REQUIRED"):
            client._comfy_workflow("p", "n", 1)

if __name__ == "__main__":
    unittest.main()
