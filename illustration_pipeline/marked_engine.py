"""Persisted, resumable marked-document jobs. A single server owns this store."""
from __future__ import annotations
import base64
import hashlib
import json
import re
import threading
import time
import uuid
from pathlib import Path
from PIL import Image, ImageOps
from content_profile import validate_profile, prompt_for, FORMATS
from marked_manuscript import read_manuscript, assemble_marked, digest
from edge_client import EdgeClient

class JobError(RuntimeError): pass

class MarkedEngine:
    def __init__(self, root, edge=None, sd=None):
        self.root = Path(root); self.root.mkdir(parents=True,exist_ok=True)
        self.edge, self.sd, self.locks = edge, sd, {}
        self.guard = threading.Lock()
        # An interrupted inference may have been billed. Do not automatically replay it.
        for path in self.root.glob('*/job.json'):
            job = json.loads(path.read_text())
            changed = False
            for item in job['images']:
                if item['status'] in {'planning','generating'}:
                    item.update(status='uncertain',error='INTERRUPTED_REQUEST'); changed=True
            if changed: self._save(job)

    def _save(self, job):
        job['updated_at'] = time.time()
        path = self.root/job['id']/'job.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding='utf-8')
        temporary.replace(path)

    def get(self, job_id, owner):
        if not re.fullmatch('[a-f0-9]{32}',str(job_id)): raise JobError('JOB_NOT_FOUND')
        path = self.root/job_id/'job.json'
        if not path.is_file(): raise JobError('JOB_NOT_FOUND')
        job = json.loads(path.read_text())
        if job['owner'] != owner: raise JobError('JOB_NOT_FOUND')
        return job

    def view(self, job):
        images = [{k:v for k,v in x.items() if k not in {'context','prompt','negative_prompt','path'}} for x in job['images']]
        return {'id':job['id'],'created_at':job['created_at'],'updated_at':job['updated_at'],
                'images':images,'complete':bool(job.get('output')),
                'running':job['id'] in getattr(self,'active',set()),'error':job.get('error',''),
                'can_export':bool(images) and all(x['status']=='approved' for x in images),
                'approved':sum(x['status']=='approved' for x in images),'total':len(images)}

    def list(self, owner):
        result = []
        for path in self.root.glob('*/job.json'):
            job = json.loads(path.read_text())
            if job['owner']==owner: result.append(self.view(job))
        return sorted(result,key=lambda x:x['created_at'],reverse=True)

    def create(self, owner, filename, raw, instructions):
        suffix = Path(filename).suffix.lower()
        if suffix not in {'.md','.txt','.docx'}: raise JobError('MANUSCRIPT_FORMAT_INVALID')
        profile = validate_profile(instructions)
        job_id = uuid.uuid4().hex
        directory = self.root/job_id; directory.mkdir(mode=0o700)
        try:
            source = directory/('source'+suffix); source.write_bytes(raw)
            blocks, anchors = read_manuscript(source)
            if set(profile['scenes'])-{a['scene_id'] for a in anchors}:
                raise JobError('INSTRUCTIONS_UNKNOWN_SCENE')
            job = {'id':job_id,'owner':owner,'created_at':time.time(),'source':source.name,
                'source_sha256':digest(source),'instructions':profile,
                'instructions_sha256':hashlib.sha256(json.dumps(profile,sort_keys=True,ensure_ascii=False).encode()).hexdigest(),
                'images':[{**a,'status':'planned','attempts':0} for a in anchors]}
            self._save(job); return self.view(job)
        except Exception:
            import shutil
            shutil.rmtree(directory)
            raise

    def _lock(self, job_id):
        with self.guard: return self.locks.setdefault(job_id,threading.Lock())

    def generate(self, job_id, owner, retry=False, scene_id=None):
        lock = self._lock(job_id)
        if not lock.acquire(blocking=False): raise JobError('JOB_BUSY')
        try:
            job = self.get(job_id,owner); directory = self.root/job_id
            if scene_id and scene_id not in {x['scene_id'] for x in job['images']}: raise JobError('SCENE_NOT_FOUND')
            job.pop('error',None)
            if digest(directory/job['source'])!=job['source_sha256']: raise JobError('SOURCE_CHANGED')
            if not self.edge and not self.sd: raise JobError('GENERATOR_NOT_CONFIGURED')
            for item in job['images']:
                if scene_id and item['scene_id']!=scene_id: continue
                if item['status']=='rejected' and not (retry and scene_id): continue
                if item['status'] in {'review_required','approved','blocked'}: continue
                if item['status'] in {'failed','uncertain'} and not retry: continue
                if item.get('prompt') is None:
                    if not self.edge: raise JobError('TEXT_PLANNER_NOT_CONFIGURED')
                    item.update(status='planning',error=''); self._save(job)
                    try:
                        description, metadata = self.edge.describe(item,job['instructions'])
                        item['planner'] = metadata
                        item['prompt'] = prompt_for(item,job['instructions'],description)
                        item['negative_prompt'] = 'nudity, explicit sexual acts, extra fingers, malformed hands, duplicate people, distorted anatomy, plastic skin, text, logos, watermarks'
                        item['status'] = 'planned'; self._save(job)
                    except Exception as error:
                        self._fail(job,item,error); break
                item.update(status='generating',error='',attempts=item['attempts']+1); self._save(job)
                path = directory/(item['scene_id']+'.png')
                try:
                    width,height = FORMATS[job['instructions']['format']]
                    if self.sd:
                        from sd_client import StableDiffusionClient
                        generator=StableDiffusionClient({**self.sd.cfg,'width':width,'height':height})
                        metadata = generator.generate(item['prompt'],item['negative_prompt'],path)
                    else:
                        metadata = self.edge.generate(item['prompt'],item['negative_prompt'],path,width,height)
                    with Image.open(path) as original:
                        normalized=ImageOps.exif_transpose(original).convert('RGB')
                        normalized.save(path,format='PNG')
                    image_meta = self._image(path,width,height)
                    item.update({**metadata,**image_meta,'path':path.name,'status':'review_required','error':''})
                    self._save(job)
                except Exception as error:
                    self._fail(job,item,error); break
            return self.view(job)
        finally: lock.release()

    def _fail(self, job, item, error):
        code = str(error)
        if not re.fullmatch('[A-Z][A-Z0-9_]{1,100}',code): code='PROVIDER_REQUEST_UNCERTAIN'
        # A request error may occur after provider acceptance; retain it for explicit review/retry.
        status='blocked' if code=='CONTENT_NOT_SUPPORTED' or code in {'PROVIDER_HTTP_401','PROVIDER_HTTP_403','PROVIDER_HTTP_422'} or re.match('NOVEL2_AI_TEXT_(?:PROVIDER_40[123]|REFUSED)',code) else 'uncertain'
        item.update(status=status,error=code); self._save(job)
        print(json.dumps({'job_id':job['id'],'scene_id':item['scene_id'],'status':status,'code':code}),flush=True)

    @staticmethod
    def _image(path, expected_width=None, expected_height=None):
        if not path.is_file() or not 0<path.stat().st_size<=16_000_000: raise JobError('IMAGE_BYTES_INVALID')
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            width,height=image.size
            if min(width,height)<256 or width*height>16_000_000: raise JobError('IMAGE_DIMENSIONS_INVALID')
        if expected_width and abs(width/height-expected_width/expected_height)>.08:
            raise JobError('IMAGE_ASPECT_MISMATCH')
        return {'sha256':digest(path),'width':width,'height':height}

    def approve(self, job_id, owner, scene_id):
        lock = self._lock(job_id)
        if not lock.acquire(blocking=False): raise JobError('JOB_BUSY')
        try:
            job=self.get(job_id,owner); item=next((x for x in job['images'] if x['scene_id']==scene_id),None)
            if not item or item['status']!='review_required': raise JobError('IMAGE_NOT_READY_FOR_APPROVAL')
            path=self.root/job_id/item['path']
            if self._image(path)['sha256']!=item['sha256']: raise JobError('IMAGE_CHANGED')
            item.update(status='approved',approved_at=time.time(),approved_by=owner)
            self._save(job); return self.view(job)
        finally: lock.release()

    def reject(self, job_id, owner, scene_id):
        lock=self._lock(job_id)
        if not lock.acquire(blocking=False): raise JobError('JOB_BUSY')
        try:
            job=self.get(job_id,owner); item=next((x for x in job['images'] if x['scene_id']==scene_id),None)
            if not item or item['status'] not in {'review_required','approved'}: raise JobError('IMAGE_NOT_READY_FOR_APPROVAL')
            path=self.root/job_id/item['path']
            archived=path.with_name(item['scene_id']+'-attempt-'+str(item['attempts'])+'.png')
            path.replace(archived)
            item.setdefault('history',[]).append({'path':archived.name,'sha256':item['sha256'],'model':item.get('model'),'rejected_at':time.time()})
            item.update(status='rejected',path=archived.name)
            for key in ['output','output_sha256']: job.pop(key,None)
            self._save(job); return self.view(job)
        finally: lock.release()

    def assemble(self, job_id, owner):
        lock=self._lock(job_id)
        if not lock.acquire(blocking=False): raise JobError('JOB_BUSY')
        try:
            job=self.get(job_id,owner); directory=self.root/job_id
            if not all(x['status']=='approved' for x in job['images']): raise JobError('IMAGE_APPROVAL_REQUIRED')
            if digest(directory/job['source'])!=job['source_sha256']: raise JobError('SOURCE_CHANGED')
            for item in job['images']:
                if self._image(directory/item['path'])['sha256']!=item['sha256']: raise JobError('IMAGE_CHANGED')
            output=directory/'illustrated.docx'
            assemble_marked(directory/job['source'],{x['scene_id']:directory/x['path'] for x in job['images']},output)
            job['output']=output.name; job['output_sha256']=digest(output); self._save(job)
            return self.view(job)
        finally: lock.release()

    def asset(self, job_id, owner, scene_id=None, document=False):
        job=self.get(job_id,owner)
        if document:
            if not job.get('output'): raise JobError('DOCUMENT_NOT_READY')
            name, mime, expected=job['output'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document',job['output_sha256']
        else:
            item=next((x for x in job['images'] if x['scene_id']==scene_id),None)
            if not item or item['status'] not in {'review_required','approved'}: raise JobError('IMAGE_NOT_READY')
            name,mime,expected=item['path'],'image/png',item['sha256']
        path=self.root/job_id/name
        if digest(path)!=expected: raise JobError('ASSET_CHANGED')
        return {'filename':name,'content_type':mime,'data':base64.b64encode(path.read_bytes()).decode()}
