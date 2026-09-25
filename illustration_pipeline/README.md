# Story Illustration Pipeline

Pipeline:

`story → scene selection → SD prompt → Stable Diffusion → manifest → DOCX insertion`

The prompt contract is defined in `../skills/sd-story-illustration/SKILL.md`.

## Back end

Current production adapter: AUTOMATIC1111 Web API.

Start WebUI with API enabled, for example:

```text
webui-user.bat --api
```

Default endpoint:

```text
http://127.0.0.1:7860
```

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

The pipeline does not bypass generator safety systems. Provider/backend rules remain authoritative.
