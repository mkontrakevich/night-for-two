# Night4two v3 — User Journey and Consolidation Contract

Status: implementation branch; production is unchanged until green CI, origin-service proof and user-journey E2E.
Owner: PERSONAL OS / Night4two. Scope: fictional adult private story.

## Canonical end-user journey

1. **Enter via Telegram** — validate `initData`; identify role A or B, never reveal role B's private identity to role A.
2. **Private invitation** — fictional Host introduction, adult consent (stop/decline supported), choose mood and location without revealing a partner.
3. **Create actor** — upload 1–3 reference photos, verify Visual DNA, approve generated neutral actor card. No AI-created unapproved face is canon.
4. **Choose story** — select existing story or generate a story blueprint; review the proposed role *functions* and confirm casting. Story-first / cast-second.
5. **Read and act** — reveal text before an illustration; a natural-language decision advances a stateful scene. Partner or synthetic AI stand-in gets the next eligible turn.
6. **Illustrations** — visuals from already-established prose only, unchanged canonical actors and geometry; explicit approval before export. Player never uploads system instruction JSON.
7. **Return** — recover open book, pending generation, assets and previous approvals; archive or delete via explicit owner action.

On the home screen, the primary CTA is **Continue story** if a book is active, **Start story** otherwise. The user's actor card and private library remain visible. The owner-only manuscript tool is called **Illustration workshop**. Developer-only TEXT TEST and IMAGE TEST remain under a separately authorized **Model lab** staging service and do NOT appear in the partner's normal story navigation.

## Canonical illustration workshop journey (one file)
Upload **one TXT description** -> server loads pinned policy/direction -> server attaches one `[[IMAGE:scene_001]]` anchor if the description has none -> scene is staged -> explicit user confirmation of paid generation -> result preview -> approve/reject -> export DOCX only after every frame has been approved. Technical JSON, provider secrets, system prompts and model identifiers are never requested from the user. Existing marked DOCX/MD jobs remain readable for compatibility, but creation UI is scene-first.

## Source-of-truth / boundaries

| Domain | Authority | Not for |
|---|---|---|
| Story turns, books, pair permissions | existing Novel2 PostgreSQL until a verified migration | noncanonical test jobs |
| Cloud actor thumbnails and staged image media | Novel2 private R2; D1 metadata | storing raw Telegram chats |
| TEXT TEST state and generated artifacts | separate Durable Object + Google Drive OAuth | producing canon content without approval |
| Image-test originals | isolated staging R2 | user-visible canon before QA |
| System directives | pinned, versioned server-side instructions | frontend editable JSON |
| Authentication | Telegram signed initData / server authorization | query-string tokens |
| Provider cost | provider-enforced budget + per-job approval | unbounded automatic retries |

## Duplicate/legacy disposition

- Old Night42 linear reader, novel2 Reader, and standalone Actions: **inventory and freeze** until a parity test; do not delete their stored books.
- Old Python Marked Workbench and Cloudflare Model Lab: different outputs (DOCX and model comparison). Keep as isolated backends but use one UI contract and shared scene/asset schemas.
- Remove UI prompts for `instructions.json`, `sampleRules`, and public technical settings as users migrate.
- Remove DOM MutationObserver-based menu injection; declare the owner tool explicitly inside main menu render.
- No destructive delete until migration verification: count users/books/jobs, export snapshots, restore test, staged feature toggle, explicit approval.

## Release gate for v3

- Unit: default instructions, UTF-8 and size checks, source marker behavior, no client-instruction override, retry protection and authorizations.
- Browser: mobile and desktop upload one file, no JSON field, confirm generation, approve/reject, resume from history and export.
- Integration: protected Novel2 origin + workbench health and API reachability, Telegram signed login, persistent storage, image import and document download.
- Prod: record current deployment version and rollback steps; deploy only from canonical release workflows; verify URL and release marker after deploy.
- No claim of 100% before a user-authorized end-to-end run.
