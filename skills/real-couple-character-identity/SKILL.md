# Real Couple Character Identity Skill

Purpose: convert a consenting adult player pair into two stable fictional character identities for Night42 / Interactive Novel while preserving visual resemblance, privacy boundaries, and cross-scene continuity.

This skill is the canonical source of CHARACTER IDENTITY. Story and illustration systems must not independently reinvent a player's appearance.

## Core architecture

REAL PLAYER REFERENCES
→ VISUAL IDENTITY PROFILE
→ FICTION ROLE OVERLAY
→ IMMUTABLE IDENTITY LOCK
→ SCENE-SPECIFIC APPEARANCE STATE
→ SD STORY ILLUSTRATION

Identity and story role are separate layers.

- Identity lock = who the character looks like.
- Fiction role overlay = who the character is inside this book.
- Scene state = clothing, grooming, pose, location, lighting and temporary changes in the current scene.

A change in fiction role must never silently change face, body proportions, hair identity or other locked visual traits.

## Input contract

For each player, prefer:
- 1 clear frontal reference;
- 1 three-quarter reference;
- 1 profile reference;
- 1 full-body reference;
- optional additional references for hair, body proportions, distinctive non-sensitive visual details and wardrobe.

Use the highest-quality original references available. Do not use screenshots or low-resolution previews when originals exist.

Optional user-provided facts may be used when explicitly supplied:
- height / relative height;
- hair color and haircut;
- eye color;
- body-build description;
- stable facial details;
- usual wardrobe preferences;
- explicitly requested distinctive marks.

Do not infer or encode sensitive personal attributes such as ethnicity, religion, health condition, sexual orientation, political identity or other protected traits from appearance. Do not guess exact age from an image. The application must treat both players as consenting adults before using this skill.

## Privacy contract

1. Never place real names, usernames, phone numbers, chat IDs, raw messages or other direct identifiers into image prompts unless the user explicitly requests a real name as visible content.
2. Default identifiers are PLAYER_A and PLAYER_B.
3. Narrative relationship context may influence emotional tone but must not be copied into the visual identity profile.
4. Character appearance data and fiction-role data remain separate.
5. raw_messages=false remains mandatory for relationship-context integration.

## Phase 1 — Reference assessment

For every supplied reference:
- score face visibility;
- score body visibility;
- score lens/perspective distortion;
- score occlusion;
- score lighting neutrality;
- identify whether the image is useful for FACE, PROFILE, BODY, HAIR, WARDROBE or DETAIL.

Reject a reference as canonical when:
- face is heavily distorted by wide-angle perspective;
- strong beauty filters alter anatomy;
- face is significantly occluded;
- image resolution is insufficient;
- pose prevents reliable proportion reading.

Keep rejected references only as secondary context when useful.

## Phase 2 — Visual Identity Profile

Create one profile per player.

Recommended schema:

```json
{
  "character_id": "PLAYER_A",
  "adult_confirmed": true,
  "identity_version": 1,
  "face": {
    "overall_shape": "",
    "jaw": "",
    "cheekbones": "",
    "brow": "",
    "eyes_visual": "",
    "nose_geometry": "",
    "mouth_geometry": "",
    "distinctive_geometry": []
  },
  "hair": {
    "color": "",
    "length": "",
    "texture": "",
    "hairline": "",
    "default_style": ""
  },
  "body": {
    "height": "",
    "relative_height": "",
    "build": "",
    "shoulder_waist_ratio": "",
    "limb_proportions": "",
    "posture": ""
  },
  "appearance_notes": [],
  "reference_roles": {
    "face": [],
    "profile": [],
    "body": [],
    "hair": []
  },
  "do_not_drift": [],
  "allowed_variation": []
}
```

Describe geometry, not celebrity resemblance.

Do not over-specify micro-details that the references do not reliably support.

## Phase 3 — Fiction Role Overlay

The story may assign a fictional name, profession, social role, era or narrative function.

Example:

```json
{
  "fiction_name": "Mara",
  "world_role": "architect restoring a closed coastal hotel",
  "story_age": "adult",
  "wardrobe_direction": "structured evening tailoring",
  "role_props": ["brass room key", "rolled plans"]
}
```

The fiction-role layer may change between books.

The identity layer must remain stable unless the user explicitly updates the canonical references.

## Phase 4 — Identity Lock

Generate a compact prompt-ready lock for each player.

Order inside the lock:

FACE GEOMETRY
→ HAIR
→ BODY PROPORTIONS
→ RELATIVE HEIGHT
→ STABLE DISTINCTIVE FEATURES
→ DO-NOT-DRIFT RULES.

Example structure:

```
CHARACTER IDENTITY LOCK — PLAYER_A:
same adult fictionalized character based on the approved PLAYER_A references;
[face geometry];
[hair];
[body proportions];
[relative height];
preserve the same face shape, nose geometry, eye spacing, jaw, hairline and body proportions across every image;
do not beautify into a different person;
do not change apparent identity with camera angle, makeup, hairstyle or lighting.
```

Do not insert story action, mood, camera or lighting into the identity lock.

## Phase 5 — Pair Lock

When both players appear:

- preserve correct A/B identity assignment;
- preserve relative height;
- preserve relative body scale;
- never merge facial traits;
- never swap hair, wardrobe or props;
- keep physical interaction anatomically plausible;
- maintain correct left/right ownership of hands and limbs;
- do not duplicate either person.

Pair lock example:

```
PAIR LOCK:
exactly two adult characters: PLAYER_A and PLAYER_B;
PLAYER_A remains visually distinct from PLAYER_B;
preserve their established relative height and body scale;
never blend faces, swap identities, duplicate bodies, exchange hair or clothing;
hands and limbs must remain connected to the correct person.
```

## Phase 6 — Calibration before production

Before treating a profile as production-ready, generate a neutral calibration sheet or equivalent controlled test:

1. frontal portrait;
2. three-quarter portrait;
3. profile;
4. standing full body;
5. seated or natural-body-language frame;
6. both players together.

Keep:
- neutral lighting;
- simple background;
- restrained wardrobe;
- no dramatic lens;
- no extreme expression.

Evaluate:
- face consistency;
- profile consistency;
- hairline and haircut;
- relative height;
- body proportions;
- pair separation;
- hand/anatomy integrity.

Do not promote the identity profile to production until the core identity survives these views.

## Phase 7 — Scene State

Every production scene derives a temporary state from the immutable identity:

```json
{
  "scene_id": "",
  "character_id": "PLAYER_A",
  "wardrobe_state": "",
  "hair_state": "",
  "props": [],
  "body_state": "",
  "position": "",
  "interaction": "",
  "continuity_from": ""
}
```

Scene state may change only when supported by story text.

If the prose does not establish a wardrobe, hair or prop change, inherit the previous scene state.

## Integration with SD Story Illustration Skill

The SD prompt order remains mandatory:

SHOT TYPE
→ STORY / ACTION
→ BODY LANGUAGE / SUBJECT SCALE
→ EMOTION / ATMOSPHERE
→ WARDROBE / PROPS / TEXTURES
→ ENVIRONMENT
→ LIGHT / TIME
→ CAMERA / LENS
→ COLOR / FILM CHARACTER
→ IDENTITY LOCK
→ CONTINUITY LOCK.

This skill supplies IDENTITY LOCK and identity-related portions of CONTINUITY LOCK.

The SD skill must never replace these locks with a shorter generic description.

## Negative identity controls

Add when relevant:

- different face;
- face drift;
- identity swap;
- merged faces;
- duplicate person;
- extra person;
- wrong relative height;
- wrong body proportions;
- inconsistent hairline;
- changed nose shape;
- changed jaw;
- changed eye spacing;
- age drift;
- beauty-filter face;
- plastic skin;
- deformed hands;
- fused fingers;
- disconnected limbs;
- wardrobe swap;
- prop ownership swap.

## Continuity hierarchy

When instructions conflict, use this priority:

1. safety/provider constraints;
2. canonical player identity;
3. story-established facts;
4. immediately previous visual state;
5. scene-specific art direction;
6. generic aesthetic preference.

Never sacrifice identity consistency merely to make a prettier frame.

## Update rules

Create a new identity version only when:
- the user supplies better canonical references;
- appearance has intentionally changed;
- the user explicitly approves a new lock.

Do not silently mutate the canonical identity because one generated image looked different.

## Quality gate

Reject or regenerate when any of the following occurs:
- character A resembles character B;
- face identity changes materially;
- profile nose/jaw geometry drifts;
- relative height changes without story reason;
- body proportions change materially;
- hairstyle changes without scene justification;
- wrong number of characters;
- clothing/props are swapped;
- anatomy breaks;
- scene contradicts the prose;
- continuity contradicts the preceding scene.

For every rejection, record the failure class and use it to improve either:
- the identity lock;
- the continuity lock;
- the negative prompt;
- reference selection;
- camera/lens constraint.

Do not fix identity drift by adding random descriptive adjectives.

## Continuous improvement loop

For every production batch:

GENERATE
→ QA
→ CLASSIFY FAILURE
→ UPDATE LOCK/PROMPT RULE
→ REGRESSION TEST
→ VERSION SKILL.

Track recurring failure categories separately:
- FACE_DRIFT
- PROFILE_DRIFT
- BODY_SCALE_DRIFT
- HEIGHT_DRIFT
- IDENTITY_SWAP
- WARDROBE_SWAP
- HAND_ANATOMY
- DUPLICATION
- CONTINUITY_BREAK
- CAMERA_DISTORTION.

Only promote a skill revision when it improves consistency without creating a regression in another category.
