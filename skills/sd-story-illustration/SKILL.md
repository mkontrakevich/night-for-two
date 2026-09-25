# SD Story Illustration Skill

Purpose: turn prose into a visually coherent illustrated edition using a Stable Diffusion backend.

## Operating contract

1. Read the whole story before selecting images.
2. Detect chapters, scene changes, locations, characters, objects, emotional peaks and reveals.
3. Select only visually meaningful beats. Default density: one image per 2–4 reader pages.
4. Never insert an image before the text that establishes the depicted information.
5. Maintain continuity across the whole story:
   - character identity;
   - age;
   - hair and body proportions;
   - wardrobe state;
   - location architecture;
   - recurring objects;
   - time of day;
   - color palette;
   - lens family and grading.
6. Build prompts in this order:

   SHOT TYPE → STORY/ACTION → BODY LANGUAGE / SUBJECT SCALE → EMOTION / ATMOSPHERE → WARDROBE / PROPS / TEXTURES → ENVIRONMENT → LIGHT / TIME → CAMERA / LENS → COLOR / FILM CHARACTER → IDENTITY LOCK → CONTINUITY LOCK.

7. Negative prompt must remove common diffusion failures: extra fingers, fused hands, duplicate people, malformed anatomy, text, logos, watermarks, plastic skin and inconsistent faces.
8. Prefer 35–50 mm for environment, 65–85 mm for portrait, 85–110 mm for close detail.
9. Use seed/model/sampler metadata in the manifest for reproducibility.
10. Provider/model safety policies remain authoritative. Do not attempt moderation bypass. If a requested visual is rejected, preserve story meaning with a less explicit composition.

## Story-image manifest

Every generated image must record:

- story_id
- scene_id
- paragraph_after
- prompt
- negative_prompt
- model/checkpoint
- sampler
- steps
- cfg_scale
- seed
- width/height
- output path
- status

## Quality gate

Reject or regenerate when:
- character count is wrong;
- key prop is missing;
- identity/wardrobe continuity breaks;
- anatomy is visibly malformed;
- accidental text/watermark appears;
- composition contradicts the story;
- image reveals information before the corresponding paragraph.

## Insertion

The final document must keep the prose primary. Images should be inserted after the paragraph that completes the selected beat, centered, with no decorative caption unless the project explicitly requests one.
