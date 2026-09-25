from __future__ import annotations
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image
from docx import Document
from scene_analyzer import split_paragraphs, choose_scenes
from prompt_builder import build_prompt
from docx_writer import build_docx

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

if __name__ == "__main__":
    unittest.main()
