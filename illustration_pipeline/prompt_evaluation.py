"""Core for private, explicitly-started text-model comparisons.

Networking, authentication and durable storage must be provided by the host.
No API key, uploaded text or result should be written to application logs.
"""
from __future__ import annotations
import hashlib
import re

MAX_FILE_BYTES = 64000
MAX_MODELS = 10

class EvaluationError(ValueError): pass

def prepare(filename, raw, requested_models, permitted_models):
    if not isinstance(filename, str) or not filename.lower().endswith('.txt'):
        raise EvaluationError('TXT_REQUIRED')
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_FILE_BYTES:
        raise EvaluationError('FILE_SIZE_INVALID')
    try: prompt = raw.decode('utf-8-sig')
    except UnicodeDecodeError: raise EvaluationError('UTF8_REQUIRED') from None
    if not prompt.strip() or '\x00' in prompt: raise EvaluationError('FILE_TEXT_INVALID')
    if not isinstance(requested_models, list) or not 1 <= len(requested_models) <= MAX_MODELS:
        raise EvaluationError('MODEL_COUNT_INVALID')
    if any(not isinstance(x,str) or not re.fullmatch(r'[A-Za-z0-9._-]+/[A-Za-z0-9._:-]+',x) for x in requested_models):
        raise EvaluationError('MODEL_INVALID')
    if len(set(requested_models)) != len(requested_models): raise EvaluationError('MODEL_DUPLICATED')
    if not set(requested_models).issubset(set(permitted_models)): raise EvaluationError('MODEL_NOT_PERMITTED')
    return {'prompt':prompt,'source_sha256':hashlib.sha256(raw).hexdigest(),
            'models':list(requested_models)}

def run_once(job, invoke, record, *, confirm=False):
    """Persist before each call; stop on uncertain outcome; never auto-repeat."""
    if confirm is not True: raise EvaluationError('CONFIRMATION_REQUIRED')
    if job.get('results'): raise EvaluationError('JOB_ALREADY_STARTED')
    job['results']=[]
    for model in job['models']:
        entry={'model':model,'status':'running'}
        job['results'].append(entry); record(job)
        try: result=invoke(model,job['prompt'])
        except Exception:
            entry.update(status='uncertain',error='PROVIDER_RESPONSE_UNCERTAIN');record(job);break
        if not isinstance(result,dict):
            entry.update(status='uncertain',error='RESPONSE_INVALID');record(job);break
        if result.get('refused') is True:
            entry.update(status='refused');record(job);continue
        text=result.get('content')
        if not isinstance(text,str) or not text.strip():
            entry.update(status='failed',error='EMPTY_RESPONSE');record(job);continue
        entry.update(status='complete',content=text,usage=result.get('usage'))
        record(job)
    return job
