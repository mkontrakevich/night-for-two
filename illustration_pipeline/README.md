# Story Illustration Pipeline

Pipeline:

`story → scene selection → SD prompt → Stable Diffusion → manifest → DOCX insertion`

The prompt contract is defined in `../skills/sd-story-illustration/SKILL.md`.

## Back ends

Two Stable Diffusion adapters are supported:

- **AUTOMATIC1111 Web API** — `/sdapi/v1/txt2img`;
- **ComfyUI** — standard API workflow through `/prompt`, `/history/{prompt_id}` and `/view`.

No cloud dependency is required for the SD path.

### AUTOMATIC1111

Start WebUI with API enabled:

```text
webui-user.bat --api
```

Default endpoint:

```text
http://127.0.0.1:7860
```

Set:

```yaml
sd:
  backend: automatic1111
  base_url: http://127.0.0.1:7860
```

### ComfyUI

Start ComfyUI with its normal HTTP API available and set an installed checkpoint name:

```yaml
sd:
  backend: comfyui
  base_url: http://127.0.0.1:8188
  checkpoint: your_sdxl_checkpoint.safetensors
  sampler: dpmpp_2m
  scheduler: karras
```

The adapter builds a standard CheckpointLoader → CLIP positive/negative → EmptyLatent → KSampler → VAE Decode → SaveImage graph. The actual seed, checkpoint, sampler, scheduler, size and prompt ID are stored in the manifest.

## Install

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r illustration_pipeline/requirements.txt
```

Copy `config.example.yaml`, set the input/output paths, character continuity and Stable Diffusion settings.

## Run

```bash
python illustration_pipeline/story_pipeline.py --config illustration_pipeline/config.yaml
```

Outputs:

- illustrated DOCX;
- generated images;
- JSON manifest containing insertion points and SD generation parameters.

## Quality and continuity

The pipeline reads the complete text before selecting beats, keeps character/location/object continuity in the prompt contract, inserts each image only after its establishing paragraph, and records generation metadata for reproducibility.

The pipeline does not bypass generator safety systems. Provider/backend rules remain authoritative.
