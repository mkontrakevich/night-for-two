from __future__ import annotations

def build_prompt(scene_text: str, cfg: dict, index: int) -> tuple[str, str]:
    style = cfg.get("style") or {}
    continuity = cfg.get("continuity") or {}
    characters = continuity.get("characters") or {}
    objects = continuity.get("recurring_objects") or []
    locations = continuity.get("locations") or {}

    identity = "; ".join(f"{name}: {desc}" for name, desc in characters.items())
    location_lock = "; ".join(f"{name}: {desc}" for name, desc in locations.items())
    object_lock = ", ".join(map(str, objects))

    prompt = "\n".join(filter(None, [
        "Cinematic editorial story illustration.",
        f"Story beat: {scene_text[:1400]}",
        "Body language and subject scale must match the prose; do not invent extra characters.",
        f"Visual direction: {style.get('base','premium cinematic editorial still, realistic materials')}",
        f"Palette: {style.get('palette','controlled cinematic palette')}",
        f"Camera: {style.get('camera','cinematic full-frame photography')}",
        f"Character identity lock: {identity}" if identity else "",
        f"Recurring object lock: {object_lock}" if object_lock else "",
        f"Location continuity lock: {location_lock}" if location_lock else "",
        "Natural anatomy, realistic hands, coherent contact shadows, believable optics, no accidental text.",
        f"Continuity frame number: {index+1}.",
    ]))
    negative = style.get("negative","extra fingers, malformed hands, duplicate people, extra limbs, distorted face, text, logo, watermark")
    return prompt, negative
