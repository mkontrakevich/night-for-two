from __future__ import annotations
import re
from dataclasses import dataclass

@dataclass
class SceneCandidate:
    paragraph_index: int
    score: float
    excerpt: str
    scene_id: str

_VISUAL = re.compile(r"(двер|ключ|коридор|комнат|окн|свет|ламп|зеркал|письм|рук|взгляд|лифт|архив|карта|дожд|ноч|hotel|door|key|corridor|room|light|mirror|letter|hand|look|elevator|archive|rain|night)", re.I)
_TURN = re.compile(r"(вдруг|остановил|замер|увидел|обнаруж|открыл|закрыл|понял|решил|появил|исчез|suddenly|opened|discovered|realized)", re.I)

def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n+", text.replace("\r", "")) if p.strip()]

def score_paragraph(text: str) -> float:
    score = 0.0
    score += min(3, len(_VISUAL.findall(text))) * 0.9
    score += min(2, len(_TURN.findall(text))) * 1.2
    if "—" in text or '"' in text:
        score += 0.35
    if 180 <= len(text) <= 1400:
        score += 0.4
    if re.search(r"[!?…]$", text):
        score += 0.25
    return score

def choose_scenes(paragraphs: list[str], min_gap: int = 8, max_images: int = 7) -> list[SceneCandidate]:
    ranked = sorted(
        [SceneCandidate(i, score_paragraph(p), p[:1200], f"scene_{i+1:03d}") for i, p in enumerate(paragraphs)],
        key=lambda x: (-x.score, x.paragraph_index),
    )
    selected: list[SceneCandidate] = []
    for item in ranked:
        if item.score <= 0:
            continue
        if any(abs(item.paragraph_index - x.paragraph_index) < min_gap for x in selected):
            continue
        selected.append(item)
        if len(selected) >= max_images:
            break
    return sorted(selected, key=lambda x: x.paragraph_index)
