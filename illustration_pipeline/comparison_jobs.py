"""Persist comparison jobs; the host supplies authentication and providers."""
import json
import os
import re
import secrets
import threading
from pathlib import Path
from prompt_evaluation import EvaluationError, prepare, run_once

class ComparisonJobs:
    def __init__(self, root, read_source, invoke, allowed_models):
        self.root=Path(root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.read_source, self.invoke, self.allowed_models=read_source, invoke, tuple(allowed_models)
        self.lock=threading.RLock()

    def _path(self, owner, job_id):
        if not re.fullmatch(r'[a-f0-9]{64}',str(owner)) or not re.fullmatch(r'[a-f0-9]{32}',str(job_id)):
            raise EvaluationError('JOB_NOT_FOUND')
        return self.root / (owner+'-'+job_id+'.json')

    def _save(self, owner, job_id, job):
        path=self._path(owner,job_id)
        temp=self.root / ('.'+secrets.token_hex(16)+'.tmp')
        try:
            fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w',encoding='utf-8') as f:
                json.dump(job,f,ensure_ascii=False); f.flush(); os.fsync(f.fileno())
            os.replace(temp,path)
        finally:
            if temp.exists(): temp.unlink()

    def _load(self, owner, job_id):
        try:
            with self._path(owner,job_id).open(encoding='utf-8') as f: return json.load(f)
        except FileNotFoundError: raise EvaluationError('JOB_NOT_FOUND') from None

    def create(self, owner, file_id, models):
        # The host's read_source must enforce project/file authorization.
        source=self.read_source(file_id)
        job=prepare(source['filename'],source['data'],models,self.allowed_models)
        job.update(id=secrets.token_hex(16), state='ready', source_id=file_id)
        with self.lock: self._save(owner,job['id'],job)
        return self.view(owner,job['id'])

    def view(self, owner, job_id):
        with self.lock: job=self._load(owner,job_id)
        return {k:v for k,v in job.items() if k!='prompt'}

    def run(self, owner, job_id, confirm=False):
        with self.lock:
            job=self._load(owner,job_id)
            if job['state']!='ready': raise EvaluationError('JOB_ALREADY_STARTED')
            if confirm is not True: raise EvaluationError('CONFIRMATION_REQUIRED')
            job['state']='running'; self._save(owner,job_id,job)
            try:
                run_once(job,self.invoke,lambda value:self._save(owner,job_id,value),confirm=True)
                job['state']='uncertain' if any(x['status']=='uncertain' for x in job['results']) else 'complete'
            except Exception:
                job['state']='uncertain'
            self._save(owner,job_id,job)
            return self.view(owner,job_id)

    def recover(self, owner, job_id):
        # Only when the host knows no worker for the job is active.
        with self.lock:
            job=self._load(owner,job_id)
            if job['state']=='running':
                job['state']='uncertain'
                for entry in job.get('results',[]):
                    if entry['status']=='running': entry.update(status='uncertain',error='INTERRUPTED')
                self._save(owner,job_id,job)
            return self.view(owner,job_id)
