# Interactive Novel 2.0 — clean rebuild

This directory is the canonical rebuild of Night for Two.

## Product rule

One product, one runtime, one reader, one database model.

The old linear novel, catalog challenges, reader mirror and legacy route logic are not imported here.

Core loop:

```
scene -> character prompt -> free player reply -> consequence -> next scene
```

Buttons are secondary. Free text is the primary interaction.

## Runtime blocks

- `app.js` — HTTP API + Mini App static delivery.
- `auth.js` — Telegram initData verification and fixed-pair role mapping.
- `db.js` — isolated `novel2_*` schema.
- `ai.js` — OpenRouter text + image adapter.
- `prose-engine.js` — Story Bible and scene generation.
- `identity-engine.js` — player visual profile -> immutable identity lock.
- `visual-engine.js` — scene prompt + identity locks + reference images.
- `public/index.html` — one mobile reader UI.

## Literary direction

Original commercial dark erotic romance:
- close psychological camera;
- strong subtext;
- power and attraction through behavior;
- tactile material details;
- concise dialogue;
- indirect but unmistakably adult sensuality;
- no imitation of a named author or book.

## Visual direction

The same PLAYER_A and PLAYER_B identities are reused in every frame.

Prompt order:
SHOT -> STORY -> BODY LANGUAGE -> EMOTION -> WARDROBE -> ENVIRONMENT -> LIGHT -> CAMERA -> COLOR -> IDENTITY LOCK -> CONTINUITY LOCK.

Every generated frame can receive approved player reference images through OpenRouter `input_references`.

## Local run

```bash
cd novel2
npm install
npm start
```

Required production env:
- DATABASE_URL
- TELEGRAM_BOT_TOKEN
- PRIMARY_OWNER_ID
- PARTNER_TELEGRAM_ID
- OPENROUTER_API_KEY

Optional:
- NOVEL2_TEXT_MODEL
- NOVEL2_VISION_MODEL
- NOVEL2_IMAGE_MODEL
- NOVEL2_PORT
- NOVEL2_LOCAL_TEST_MODE=1


## Character constructor

Novel 2 starts from two approved character cards, not generic protagonists.

Flow:

```
1–6 arbitrary user photos
→ Visual Identity Profile
→ fictional Character Card
→ Visual DNA / immutable Identity Lock
→ calibration sheet
→ explicit approval
→ Story Bible for A + B
→ free-reply novel
```

One photo is sufficient to build a draft. Missing angles are recorded as unknown rather than invented. Additional photos improve visual certainty. The user may optionally provide a preferred fictional name or a short creative note.

The character card is saved with the visual identity and becomes a hard input to the prose engine. Story generation must preserve the character's fiction name, role, speech style, internal contradiction, visual DNA and approved appearance.


## Missing-player stand-in

A novel does not have to wait for the second player.

If one approved human character exists and the other role is still empty, the connected player can create a fully fictional AI stand-in:

```
missing role
→ randomized Character Card
→ randomized concrete Visual Identity Profile
→ immutable Identity Lock
→ generated canonical reference plate
→ approved synthetic character
→ Story Bible
→ AI-controlled free-reply turns
```

The synthetic appearance is generated once and persisted. All later illustrations use its canonical reference image plus Identity Lock, so the stand-in does not change face/body between scenes.

If the real player later opens the Mini App, control of that role switches from AI to the authenticated human automatically. Inside an active novel the visual identity is preserved to avoid an identity swap. Before a novel starts, the player may replace the temporary synthetic character with a photo-based Character Card.
