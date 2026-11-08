"""Immutable, versioned Night4two visual direction loaded by the private backend.

For fictional illustration tasks only. Couple Space personal answers are never
loaded; its shared-story mutuality gate belongs to a separate private service.
"""
from __future__ import annotations
from functools import lru_cache
import hashlib
from pathlib import Path

VERSION='n4t-visual-v3.0'
CONTRACT_PATH=Path(__file__).resolve().with_name('visual_instruction_contract.md')

@lru_cache(maxsize=1)
def load_visual_contract():
    data=CONTRACT_PATH.read_bytes()
    if not 1000<=len(data)<=16000:
        raise RuntimeError('N4T_VISUAL_INSTRUCTIONS_MISSING')
    text=data.decode('utf-8')
    for heading in ('Sensual Director','Couple Space','SD Story Illustration'):
        if heading not in text:
            raise RuntimeError('N4T_VISUAL_INSTRUCTIONS_INVALID')
    return text, {'version':VERSION,'sha256':hashlib.sha256(data).hexdigest(),'sources':['sensual_director@1.0','couple_space@1.1','sd_story@1.0']}
