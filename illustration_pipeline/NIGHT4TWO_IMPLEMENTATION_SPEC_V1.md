# NIGHT4TWO — IMPLEMENTATION SPEC v1.0

**Проект / контур:** Night4two · PERSONAL OS · isolated model testing  
**Целевое действие:** единый Telegram test run: TXT сцены + Sensual Director + Couple Space → сравнение текстовых моделей → таблицы → выбор промпта → карандашный эскиз → изображение на основе промпта и эскиза → результаты в Google Drive.  
**Статус документа:** ready for implementation, не означает готовность к production.  
**Источник исполнения:** `mkontrakevich/night-for-two`, draft PR #112 (`feat/prompt-evaluation-core`).  
**Дата:** 2026-11-04. **Версия схем:** `n4t-test-v1`.

## 0. Границы и актуальная база

### Существующее, подтвержденное в коде
- `cloudflare/novel2-preview/src/model-test-api.js`: Telegram auth, `config`, `list`, `upload`, `status`, `start`; раздел выключен без `MODEL_TESTS_CLOUD_ENABLED=1`.
- `src/model-test-jobs.js`: изолированный по Telegram owner Durable Object, один TXT, 1–10 моделей, исходник и JSON-результат, переходы без автоматического повтора платных запросов.
- `src/model-test-drive.js`: защищенная передача файлов в `night4two-drive-oauth` через `MODEL_TESTS_DRIVE_INGEST_KEY`.
- `cloudflare/night4two-drive-oauth/src/index.js`: OAuth-token + ограниченный Drive scope `drive.file`; запись `source.txt`/`result.json`; отдельное секретное хранилище.
- Тестовая запись в Google Drive подтверждена. Приложение, генерирующее изображения по эскизу, **еще не внедрено**. Telegram → OpenRouter → Drive E2E также не подтвержден.

### Три основания инструкции
1. **Sensual Director** — `Sensual_Director_Novel2_v1.md`: сцена, action, shot, light, palette, continuity, `[[IMAGE:scene_id]]`; не подменять действующий текст самостоятельной инструкцией ассистента.
2. **Couple Space v1.1** — `skills/couple-space/intimate-narrative/SKILL.md`: canonical prompt order; `MASTER SCENE STATE`, `IDENTITY LOCK`, ограничения согласия и приватности. Для теста на **вымышленной взрослой сцене** включать только режиссерские/визуальные части. Полный mutuality gate обязателен только в режиме настоящей пары.
3. **SD Story Illustration Skill** — `SD_Story_Illustration_SKILL.md`: последовательность визуального промпта, continuity/identity/QA, backend SD (`AUTOMATIC1111`, `ComfyUI`). Обязательное отдельное создание карандашного эскиза — **новая функциональность v1**, а не уже реализованный факт skill.

### Принципиальная техническая граница
`night4two-drive-oauth /api/drive/ingest` сейчас поддерживает только текстовые пары `source.txt`, `result.json`; **нельзя** отправлять через этот API PNG/скетчи или выдавать текстовый ответ за сохраненную картинку. Для IMAGE TEST нужен отдельный бинарный путь через приватный R2, а потом перенос в Drive с подтверждением `file_id` и контрольной суммы. Не изменять работающие `night42` и production `novel2-preview` без staging и регрессии. В репозитории есть placeholder-конфигурация VPC/D1: ее не разворачивать поверх работающего сервиса.

## 1. Интерфейс Telegram Mini App

**Одна точка входа:** `/novel2/model-tests.html`, две вкладки `TEXT TEST` и `IMAGE TEST`, доступ только авторизованному владельцу Telegram через проверенный `initData` (не sessionStorage как доверенная авторизация).

### TEXT TEST
- Экран 1: `Исходное задание` — обязательный UTF‑8 `.txt`, до **64 KiB**; `Sensual Director` — обязательный `.md/.txt`; `Couple Space` — обязательный `.md/.txt`. По умолчанию отображать найденные канонические версии с `source_ref`, `sha256` и возможностью заменить вручную только **для текущего теста**.
- Экран 2: таблица выбранных text models (1–10), версия инструкций, сравнимые параметры (`temperature`, `max_tokens`, `language`), предполагаемый верхний расход. Кнопка `Проверить пакет`, затем отдельная `Запустить платный тест`.
- Экран 3: результаты построчно, одинаковые поля модели; фильтры и таблица описаний; отдельная вкладка `Ароматы`; экспорт `CSV/JSON` + отчет. Нельзя автоматически выбирать «победителя» по одному общему баллу; пользователь выбирает лучший промпт вручную.

### IMAGE TEST
- Экран 4: выбранный `frame_prompt` → кнопка `Создать карандашный эскиз`. Показывать крупный preview, схему pose/blocking, чеклист, кнопки `Утвердить` / `Отклонить`.
- Экран 5: активен **только после утверждения эскиза**; выбор image backend из проверенного allowlist с поддержкой `image reference`, `draft` (1–3 кадра), оценка стоимости и разрешение на оплачиваемый запуск.
- Экран 6: сравнение эскиза и генераций, QA по персонажам, геометрии, свету, continuity, ручное approval, экспорт из R2 в Drive. Прогресс-бар обязан показывать реальное состояние job, без фиктивных процентов.

## 2. Файлы и модули реализации

```text
cloudflare/novel2-preview/src/
  model-test-api.js              # extend /assets, /comparison, /sketch, /image
  model-test-jobs.js             # orchestration + Durable Objects
  model-test-state.js            # pure FSM + transition guards
  model-test-drive.js            # existing text ingestion; no OAuth secrets
  model-test-instructions.js     # 3 inputs, immutable snapshots, hashing
  model-test-schemas.js          # validation / versioned schemas
  model-test-prompt-builder.js   # canonical instruction order and constraints
  model-test-normalizer.js       # per-model structured frame description
  model-test-comparison.js       # comparison rows + CSV
  model-test-aromas.js           # same evaluator / frozen rubric
  model-test-sketch.js           # pencil reference adapter and QA
  model-test-image.js            # image reference adapter + draft comparison
  model-test-costs.js            # spending cap + provider usage
  model-test-diagnostics.js      # diagnostic envelope; secrets redacted
  model-test-assets.js          # private R2 provenance and hashes
cloudflare/night4two-drive-oauth/src/
  index.js                       # existing OAuth + text ingestion
  media-ingest.js                # NEW: authorized binary export R2 -> Drive
novel2/public/
  model-tests.html               # existing page, split TEXT/IMAGE steps
  model-tests-ui.js              # stage-aware state, preview, polling
illustration_pipeline/
  NIGHT4TWO_IMPLEMENTATION_SPEC_V1.md
  NIGHT4TWO_SCHEMAS_V1.json
  NIGHT4TWO_TEST_RUBRIC_V1.json
cloudflare/novel2-preview/scripts/
  model-test-instructions.test.mjs
  model-test-comparison.test.mjs
  model-test-sketch.test.mjs
  model-test-image.test.mjs
  model-test-e2e.mock.test.mjs
```

**Важно:** модули со словом NEW — проектируемые; наличие пути в этом документе не доказывает наличия файла. На первом PR не менять game, role, host и production narrative state.

## 3. API: текущие и новые контракты

Базовый URL mini app: `POST /novel2/api/model-tests/{action}`. Общие заголовки: `x-telegram-init-data`; для mutation — `Idempotency-Key`; все ответы `application/json`, `Cache-Control: no-store`. Только сервер проверяет Telegram signature и права owner; клиент не выбирает ID другого владельца.

| Endpoint | Статус | Запрос → ответ |
|---|---|---|
| `config` | существующий, расширить | `{}` → models, allowed image providers, effective quotas, instruction references |
| `create` | новый | `{scope, scene_id, models, params, budget_max_usd}` → `job_id` |
| `assets/upload` | новый | `{job_id, role: scene\|sensual_director\|couple_space, filename, data_base64, sha256}` → artifact ref |
| `validate` | новый | `{job_id}` → missing inputs, resolved `instruction_hashes`, ready flag |
| `start` | существующий, расширить | `{job_id, phase:"text", confirm:true}` → queued + cost ceiling |
| `status` | существующий, расширить | `{job_id}` → stage, state, model attempts, costs, artifacts, errors |
| `list` | существующий | `{}` → job list without raw texts or secrets |
| `comparison` | новый | `{job_id}` → text rows + aroma rows + Drive artifact IDs |
| `select-prompt` | новый | `{job_id, model_result_id, prompt_version}` → immutable selection |
| `sketch/start` | новый | `{job_id, confirm:true, provider_id, format}` → sketch attempt |
| `sketch/approve` | новый | `{job_id, sketch_id, approved:boolean, notes}` → approval state |
| `image/start` | новый | `{job_id, sketch_id, provider_id, drafts:1..3, confirm:true}` → image attempt |
| `image/approve` | новый | `{job_id, image_id, approved:boolean, notes}` → finalized image state |
| `export` | новый | `{job_id, artifact_ids}` → saved/uncertain receipts (without token) |
| `/api/drive/ingest` | действующий bridge | `source|result` TXT/JSON by jobId; preserve compatibility |
| `/api/drive/media/ingest` | новый private bridge | R2 object reference + SHA256 + MIME + approved owner → Drive file ID |

**Backward compatibility:** не удалять `upload` и старый `start(job_id, confirm)` до миграции существующих заданий. Для новых заданий API v1 использует явный `phase`. Размер текущего JSON-запроса ~100 KB; `assets/upload` реализовать как отдельные ограниченные запросы с фактической byte-size validation, не пытаться передать три 64 KB файла в один body.

## 4. Схемы данных: каноническая версия 1

### 4.1 `test_package.json` (manifest; immutable after start)

```json
{
  "schema_version": "n4t-test-v1",
  "job_id": "UUID",
  "scope": "fiction_test",
  "owner_key_hash": "sha256:...",
  "scene_id": "scene-001",
  "inputs": {
    "scene": {"artifact_id":"...","sha256":"...","mime":"text/plain"},
    "sensual_director": {"artifact_id":"...","sha256":"...","source_version":"1.0"},
    "couple_space": {"artifact_id":"...","sha256":"...","source_version":"1.1"},
    "sd_skill": {"artifact_id":"...","sha256":"...","source_version":"recorded"}
  },
  "text_models": ["provider/model-a", "provider/model-b"],
  "generation_params": {"temperature":0.5,"max_tokens":1800,"language":"ru"},
  "budget": {"max_usd": 0.0, "estimated_usd": null, "actual_usd": null},
  "created_at": "ISO-8601",
  "provenance": {"pr":"112","schema_hash":"sha256:..."}
}
```

`max_usd` above is schema example only, **not a set project budget**. Before any paid operation the owner must supply an approved nonzero ceiling, displayed explicitly in the UI. Use actual provider usage when available; cost can be `unknown` until reconciled.

### 4.2 `frame_result.json` (one per text model)

```json
{
  "schema_version":"n4t-frame-v1",
  "job_id":"UUID","scene_id":"scene-001",
  "model_id":"provider/model-a","attempt_id":"UUID",
  "status":"complete",
  "frame_title":"",
  "scene_summary":"",
  "shot_type":"","camera_angle":"","lens_mm":50,
  "blocking":{"person_a":"","person_b":"","hands":"","gaze":"","scale":""},
  "wardrobe_props":"","environment":"","lighting":"","palette":"",
  "emotion":"","sensory_details":"",
  "identity_lock_refs":[],"continuity_lock_ref":null,
  "prompt_order":["SHOT_TYPE","ACTION","BODY_LANGUAGE_SCALE","EMOTION","WARDROBE_PROPS","ENVIRONMENT","LIGHT_TIME","CAMERA_LENS","COLOR","IDENTITY_LOCK","CONTINUITY_LOCK"],
  "final_image_prompt":"","negative_prompt":"",
  "grounding":{"established_details":[],"unknown_details":[],"unsupported_assertions":[]},
  "provider":{"model_version":null,"usage":null,"cost_usd":null,"latency_ms":null},
  "raw_output_artifact_id":"...","normalized_at":"ISO-8601"
}
```

Raw provider output сохраняется отдельно, неизменно. Нормализатор либо заполняет только явно подтверждаемые поля, либо ставит `null` + `validation_error`; отсутствие данных **не** заполнять догадками. Все модели получают одни и те же byte-identical инструкции и исходное задание, фиксируются SHA-256.

### 4.3 Таблицы `prompt_comparison.csv` и `aroma_comparison.csv`

```text
prompt_comparison.csv:
job_id,scene_id,model_id,status,shot_type,camera_angle,lens_mm,blocking,emotion,wardrobe_props,environment,lighting,palette,final_image_prompt,negative_prompt,compliance_score,continuity_score,visual_specificity_score,estimated_cost_usd,actual_cost_usd,elapsed_ms

aroma_comparison.csv:
job_id,scene_id,model_id,aroma_label,tone_density,sensuality_level,intimacy_level,cinematicity,visual_specificity,softness,tension,elegance,aroma_notes,rubric_version,evaluator_model,confidence
```

Ароматы здесь — **интерпретация качества образного языка**, не запах в помещении и не фактическая оценка людей. Таксономия `velvet|smoky|crystal|silk|nocturne|intimate|editorial|dramatic|restrained|luxurious` — проектная рубрика v1, а не термин существующего Couple Space skill. Все оценки по одной зафиксированной рубрике и одинаковому evaluator; шкала 0–10, `null` при недостаточных данных; результаты оформлять как субъективную оценку качества описания, не медицинскую/психологическую диагностику. Рубрика хранится версионированно.

### 4.4 `sketch_manifest.json`

```json
{
  "schema_version":"n4t-sketch-v1","job_id":"UUID","scene_id":"scene-001",
  "from_model_result_id":"...","prompt_sha256":"...",
  "sketch_prompt":"graphite pencil storyboard; single coherent frozen frame; clear silhouettes, pose and contact geometry; no text labels, no new story events",
  "pose_map":{"person_a":"","person_b":"","hands":"","gaze":"","camera_height":""},
  "camera":{"shot_type":"","angle":"","lens_mm":50},
  "lighting_direction":"","environment_geometry":"",
  "provider":"provider/image-model","supports_reference_input":true,
  "image":{"r2_key":"...","mime":"image/png","sha256":"...","width":1024,"height":1024},
  "identity_lock_refs":[],"continuity_lock_ref":null,
  "qa":{"person_count_ok":null,"pose_ok":null,"hands_ok":null,"anatomy_ok":null,"composition_ok":null},
  "approval":{"state":"review_required","by":null,"at":null},
  "cost_usd":null
}
```

Скетч — изображение карандашного наброска (не просто текст `sketch_prompt`). Он закрепляет кадр, перспективу, blocking, положение рук и персонажей. Не подменять IDENTITY LOCK реальных персонажей эскизом: approved face/body references остаются каноническими.

### 4.5 `image_manifest.json`

```json
{
  "schema_version":"n4t-image-v1","job_id":"UUID","sketch_id":"...",
  "text_prompt_sha256":"...","sketch_sha256":"...",
  "provider_id":"provider/image-model","method":"image+prompt",
  "reference_map":{"sketch":"r2://...","identity_a":null,"identity_b":null},
  "generation":{"seed":null,"sampler":null,"steps":null,"cfg_scale":null,"width":1024,"height":1024},
  "drafts":[{"image_id":"...","r2_key":"...","sha256":"...","status":"review_required","cost_usd":null}],
  "qa":{"scene_match":null,"pose_match":null,"camera_match":null,"light_match":null,"identity_match":null,"continuity_match":null,"no_artifacts":null},
  "approved_image_id":null
}
```

Провайдер без реальной поддержки image-reference или pose-reference не подходит для этапа финальной генерации; блокировать запуск, а не имитировать влияние эскиза. Сохранять original bytes, не создавать финалы из скриншотов/previews.

## 5. Состояния и переходы

`job.stage` принимает `input | text | comparison | sketch | image | export`. `job.state` принимает `created | uploading | ready | queued | running | review_required | approved | complete | failed | blocked | uncertain | cancelled`.

| Переход | Условие | Side effect |
|---|---|---|
| input.created → uploading → ready | три файла с hash и валидным scope | immutable input snapshot в Drive, receipt |
| ready → text.queued | отдельное `confirm:true`, доступный budget | резерв бюджета; exact model set |
| text.queued → running → complete | per-model attempt, durable checkpoint before provider call | provider result; не повторять unknown paid call |
| text.complete → comparison.running → complete | ответы доступны / refusal обработан | normalize + comparison + aroma CSV/JSON |
| comparison.complete → sketch.queued | пользователь выбрал `model_result_id` | frozen prompt hash |
| sketch.queued → running → review_required | pencil PNG записан и проверен hash | render preview, QA, ручной approval |
| sketch.review_required → approved | пользователь проверил кадр | approved sketch ref immutable |
| sketch.approved → image.queued → running → review_required | provider supports image refs, бюджет подтвержден | image(s) generated with actual sketch bytes |
| image.review_required → approved → export.complete | ручной QA | metadata + original assets in R2 + Drive receipts |
| любое оплачиваемое действие → uncertain | timeout/no provider receipt | freeze; manual inspection; never auto-repeat |
| любое → blocked / cancelled | quota, policy refusal or owner stop | preserve diagnostics, no auto-paid retry |

Задание с несколькими моделями может содержать смешанные `complete/refused/failed/uncertain`, не терять успешные ответы. Статус `complete` на всем job — только после подтвержденного export; UI всегда отдельно показывает progress и Drive receipt.

## 6. Поток данных и хранение

```text
Telegram Mini App (authenticated owner)
  -> novel2-preview model-test API / Durable Object (per-user isolation)
  -> immutable input snapshot and SHA-256
  -> OpenRouter text allowlist (one request / model attempt)
  -> text results / normalized rows / aroma rubric
  -> manual prompt selection
  -> pencil sketch generator (approved model, own attempt)
  -> manual sketch approval
  -> image generation with REAL sketch image input (+ identity refs if relevant)
  -> manual image approval
  -> private R2 originals + Drive archive via existing OAuth Worker
```

Физическая структура внутри текущей закрытой папки Drive `Night4two — AI Model Test Files`:

```text
job_{ISOdate}_{uuid}/
  01_input/scene.txt
  01_input/sensual_director.md
  01_input/couple_space.md
  01_input/sd_story_illustration_skill.md
  01_input/test_package.json
  02_text_models/{model_slug}/raw.json
  02_text_models/{model_slug}/frame_result.json
  03_comparison/prompt_comparison.csv
  03_comparison/prompt_comparison.json
  03_comparison/aroma_comparison.csv
  03_comparison/aroma_comparison.json
  03_comparison/rubric.json
  04_sketch/sketch_prompt.txt
  04_sketch/sketch_reference.png
  04_sketch/sketch_manifest.json
  05_image/image_manifest.json
  05_image/draft_01.png
  05_image/draft_02.png
  05_image/draft_03.png
  06_export/QA_report.json
  06_export/final_review.md
  06_export/job_diagnostics.json
```

`Cloudflare R2` держит приватные полноразмерные исходные PNG и промежуточные бинарные файлы. Google Drive — индексируемый архив, тестовые сводки, утвержденные изображения и метаданные. На каждую выгрузку записывать `artifact_id`, `drive_file_id`, `r2_key`, `sha256`, `bytes`, `mime`, `job_id`, `created_at`, `state`. Если загрузка в Drive не подтверждена, отображать `uncertain` и **не** утверждать `saved`.

## 7. Принятие решения о тестовом качестве (QA)

| Тест ID | Что должно быть подтверждено |
|---|---|
| TT-01 | Ввод трех файлов, неизменные хеши; отсутствие одного файла блокирует запуск |
| TT-02 | Одинаковый input/systems/params для всех моделей, except model ID; честная сопоставимость |
| TT-03 | `frame_result` валиден; unsupported details не домысливаются; refusals фиксируются |
| TT-04 | Comparison CSV/JSON, Aroma CSV/JSON содержат ровно 1 строку на каждую model attempt, указывют единицы и рубрику |
| TT-05 | Токены и private raw data не возвращаются в list/status и не попадают в GitHub/logs |
| TT-06 | Один оплачиваемый запрос/attempt; uncertain не повторяется после рестарта/alarm |
| TT-07 | Исходники/выходы присутствуют в Drive с SHA/hash и корректным parent, источники не смешаны с MARINS |
| IT-01 | Обязательное создание реального карандашного PNG, а не только textual sketch prompt |
| IT-02 | Эскиз QA и ручное одобрение перед final-image API |
| IT-03 | Final image использует реальный файл эскиза, provider input capability test passed |
| IT-04 | Графические результаты без сломанных рук/лишних персонажей/сдвигов identity/несоответствия света и композиции; ручное утверждение |
| IT-05 | В R2 сохранены оригиналы с SHA и seed/model; Drive export receipt подтвержден |
| SEC-01 | Чужой Telegram аккаунт не читает job/артефакты; Google secret существует только в OAuth Worker |
| SEC-02 | В Couple Space используются только данные взаимно доступного состояния; `fiction_test` не получает приватные ответы пары |
| COST-01 | Лимит до каждого платного этапа; сравнение estimate vs actual, при unknown cost пробрасывается `unknown` |
| REG-01 | Проверена регрессия романа и развёртывание staging, production feature flag OFF до sign-off |

## 8. Порядок разработки для PR #112

1. **P0 / TEXT:** `inputs` + schema/hash + frozen skill snapshots; migration legacy `upload`; profile `fiction_test` vs `couple_default`; UI 3 slots; model normalization and comparison; `aroma` evaluator.
2. **P0 / SAFETY:** budget approval + no paid retry + state checkpoints + diagnostics; tests TT-01..07, SEC-01..02, COST-01.
3. **P1 / SKETCH:** state `sketch` + generator adapter + pencil PNG/R2 + manual approval, IT-01..02.
4. **P1 / IMAGE:** reference-capability routing + original sketch+text generation, continuity QA, R2/Drive binary export; IT-03..05.
5. **RELEASE:** staging E2E → CI green → smoke Telegram → Drive receipts → safety regression → controlled feature flag. No automatic merge or deployment of draft PR before gates.

### Источники и точность

- Код: `https://github.com/mkontrakevich/night-for-two/pull/112`.
- Couple Space: `https://github.com/mkontrakevich/night-for-two/blob/main/skills/couple-space/intimate-narrative/SKILL.md`.
- Sensual Director: `https://drive.google.com/file/d/1fXYMvtgF3xqD6tnvWc7pXkapicTBFV2O/view`.
- SD Story Illustration: `https://drive.google.com/file/d/1hpdkwUKiukxuv_dj3VOmn9i3EOrs8HXq/view`.
- Test scene reference: `https://drive.google.com/file/d/1udkRZxPDsAbKnHu5VIYVyjKfYBF16A8-/view`.
- Existing Drive folder: `https://drive.google.com/drive/folders/1bIPieVNexv8VeFRUffhsYOG0KPJ305vs`.

**Разграничение:** Все названия новых модулей, версии `n4t-*-v1`, таблица «ароматов», шкалы и staged pencil-generation — **техническая спецификация к внедрению**, а не уже действующая функциональность. Содержимое исходных skills использовать как обязательный input с версией и хешем, не переписывать его неявно.
