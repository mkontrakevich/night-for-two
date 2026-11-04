# Night4two — P0 TEXT TEST release gate (2026-11-04)

## Target
Telegram mini app: scene TXT + Sensual Director MD/TXT + Couple Space MD/TXT -> selected text models -> normalized frame descriptions -> comparison and aroma CSV/JSON -> Google Drive.

## Implemented in draft PR #112
- Git commit `db63972bfe11c25bf6bb9228e1e5e3439f80ce06`: 11 changed source/test/UI files. Draft, no merge.
- Input validation: separate slots, UTF-8, 64 KiB, SHA-256, immutable after write.
- Job isolation via verified Telegram authentication and a per-user Durable Object.
- No paid model calls before explicit confirmation and budget ceiling.
- Structured frame schema, versioned rule-based aroma classification, five result artifacts.
- OAuth Worker `night4two-drive-oauth`: extended whitelist for document and CSV/JSON artifacts; deployed version `ce733bfe-1195-4598-add4-72343b245698`.
- OAuth refresh token remains encrypted in project-specific Cloudflare KV.
- No changes to active novel Worker deployment.

## Verification
- Local Node 22 mock test: `NIGHT4TWO_P0_LOCAL_OK`; two simulated models; three inputs; twelve simulated Drive artifact operations across success and negative cases.
- Published GitHub blob SHAs matched the archive originals.
- Cloudflare deployment at 100%; secrets and KV token/folder metadata confirmed present.
- GitHub CI for the CURRENT head not yet reported. Previous CI green on a prior commit does not validate this commit.
- Live Telegram -> OpenRouter -> Drive and external endpoint response not verified. No paid OpenRouter requests were sent.

## Required release gates
1. Run current-head CI, including P0 mock test, Drive bridge unit tests, and Novel2 regression.
2. Fix the previous Novel2 Clean CI launch-recovery test failure; investigate whether pre-existing.
3. Run controlled staging with real Durable Objects, Telegram authentication and state recovery.
4. Configure model allowlist and per-attempt ceilings plus provider-enforced spending limit.
5. Confirm one user-authorized paid model request, compare response fields, and verify CSV/JSON Google Drive file IDs.
6. Preserve production `novel2-preview` VPC/D1 bindings; do not deploy placeholder `wrangler.jsonc`.
7. Obtain approval before enabling `MODEL_TESTS_CLOUD_ENABLED`.

## Next phase
P1 IMAGE TEST: first real pencil sketch and manual approval, then image-generation provider that genuinely accepts sketch bytes as reference. P1 is not deployed.
