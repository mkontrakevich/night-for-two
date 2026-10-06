# SD Story Illustration Skill

Purpose: turn prose into a visually coherent illustrated edition using a Stable Diffusion backend.


## Character identity dependency

When the story uses characters based on the real player pair, the canonical appearance source is `skills/real-couple-character-identity/SKILL.md`.

The illustration system must receive PLAYER_A / PLAYER_B identity locks from that skill and must not independently reinvent facial geometry, hair, body proportions, relative height or pair identity assignment.

For real-pair-derived characters:
- keep real-player appearance separate from fictional role;
- keep real names and direct identifiers out of visual prompts by default;
- preserve immutable IDENTITY LOCK across all scenes;
- inherit scene-specific wardrobe/prop/hair state through CONTINUITY LOCK;
- reject identity swaps, face drift, body-scale drift and relative-height drift during QA.

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

## Supported SD runtimes

- AUTOMATIC1111 Web API via `/sdapi/v1/txt2img`.
- ComfyUI via a standard API workflow: CheckpointLoader → CLIP encoders → EmptyLatent → KSampler → VAE Decode → SaveImage.

The pipeline must preserve the same story-image manifest contract across back ends.

## Story-image manifest

Every generated image must record:

- story_id
- scene_id
- paragraph_after
- prompt
- negative_prompt
- backend
- model/checkpoint
- sampler
- scheduler when applicable
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


## Novel 2 runtime identity bridge

For `novel2`, this skill is not documentation-only. The runtime must enforce the following sequence before any story illustration is treated as production:

```
PLAYER REFERENCES
→ multimodal Visual Identity Profile
→ immutable PLAYER_A / PLAYER_B identity locks
→ calibration sheet
→ explicit player approval
→ reference-backed scene generation
→ continuity QA
```

Production rules:
- `novel2/src/identity-engine.js` owns the multimodal identity profile and prompt-ready lock.
- `novel2/src/visual-engine.js` must refuse scene generation until both identities are approved.
- Approved source images must be passed as image references to the generator when the provider supports reference inputs.
- A scene prompt must contain both immutable identity locks plus PAIR LOCK and scene continuity.
- Generic wording such as "same broad couple archetype" is forbidden as a substitute for an identity lock.
- Recreating a character from prose alone is forbidden once canonical references exist.
- If a calibration image fails identity consistency, regenerate calibration or revise the profile; do not promote the failed image into story canon.


## Character Card bridge

For Novel 2, character creation precedes story generation.

```
arbitrary player photos
→ Visual Identity Profile
→ fictional Character Card
→ Visual DNA
→ immutable Identity Lock
→ calibration + approval
→ Story Bible
→ SD scene illustrations
```

The character card is not a claim about the real person's psychology. Personality, biography, role and romantic dynamics are fictional properties created for the novel. Only observable visual geometry is grounded in the uploaded reference images.

One image may be used. Missing views must be marked unknown and resolved only through calibration/approval, never silently invented as a factual visual trait.


## Synthetic stand-in identity

When a second player has not yet created a Character Card, Novel 2 may create a fully fictional stand-in. This follows the same identity discipline as a photo-based character:

```
random fictional appearance
→ Visual Identity Profile
→ Identity Lock
→ canonical generated reference plate
→ persisted reference image
→ scene generation
```

The generator must not randomize the stand-in on every scene. Randomization occurs once, before the Story Bible is created. The resulting reference plate and immutable lock become canonical for that novel.

When the real player later takes control, the active novel keeps the same visual identity. Replacing the stand-in with the player's own photo-based identity is allowed only before the novel begins.
