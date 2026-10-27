# Novel 2.0: text pipeline before visual design

## Goal
Every user action must lead to a validated, persisted result or an actionable terminal error. An HTTP 200 from an AI provider alone is not completion. Visual design and new illustration features follow functional reliability.

## Ordered stages and acceptance

| Stage | Required result | Acceptance gate |
| --- | --- | --- |
| Player identity | Approved identity and saved actor card | Owner-only access, persisted source references and actual result |
| Story draft | Saved draft with title, blueprint and cast slots | Valid structure; draft ID returned after storage |
| First chapter | Saved book, scene, cast and consumed draft | Typed AI output, 4200+ prose characters, target role and actionable prompt; atomic publication |
| Player reply | Immutable saved reply | Repeating the same reply is idempotent; a different reply cannot overwrite it |
| Next scene | Consistent book state and turn history | Per-book inference lock, stale-turn guard and one PostgreSQL transaction |
| AI participant | Saved AI reply and following scene | Same lock/publication gates; an already saved reply is reused after failure |
| Illustrations | Optional media linked to a committed scene | Separate later work; images do not substitute for a usable text result |

## Failure and recovery rules

- Launch jobs retain IDs, checkpoints, status and safe error codes. Status reads never restart inference.
- Successful stages are saved before the UI reports completion.
- Player and AI turn processing uses a per-book lock; a concurrent request cannot run a second inference.
- A saved reply remains available after generation failure. The reader restores it and offers explicit continuation.
- Book state and scene history commit together. An error during either write rolls both back.
- A stale or archived book cannot receive an outdated generated scene.
- Logs contain process identifiers, phase, duration, provider/model and safe error category; no prompts, photos or credentials.
- Provider errors, refusals and truncated output are failures, not usable results. There is no automatic paid failover after an uncertain response.

## Validation and evidence

1. Pure schema and publication-contract tests.
2. PostgreSQL tests in an isolated schema: draft → first chapter → saved reply → next scene; concurrent inference exclusion, duplicate reply, stale turn, injected write failure and rollback, pair privacy.
3. Browser tests at mobile and desktop sizes: reconnect, reload without resubmission, explicit failed state and saved-reply recovery.
4. Deployment gate: real neutral AI output of chapter-sized length → typed result → temporary PostgreSQL write/readback → rollback. Test data is not retained and user stories are not replayed by diagnostics.

The latest verified live neutral result before this change contained 5266 prose characters and passed database readback. This does not establish that a user's complete novel has passed end-to-end acceptance.

## Remaining work before declaring the whole pipeline complete

Unify the remaining long operations behind durable operation IDs (draft creation and turn generation still originate as HTTP calls); add explicit durable interruption/reconciliation for all operation types. Then validate a full authenticated user journey and collect actual completion/error/timing measurements. Only after these gates should visual polish and additional illustration generation be scheduled.

The current runtime still uses its existing private Windows/Docker origin and PostgreSQL behind Cloudflare. A full cloud migration is a separate change.
