"""Private image workbench service; public access is via authenticated Novel2 proxy."""
from __future__ import annotations
import argparse
import base64
import hmac
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from marked_engine import MarkedEngine, JobError
from edge_client import EdgeClient

def make_server(engine, token, host='127.0.0.1', port=5691):
    if len(token)<32: raise ValueError('WORKBENCH_TOKEN_REQUIRED')
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def answer(self, code, value):
            raw=json.dumps(value,ensure_ascii=False).encode()
            self.send_response(code); self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(raw)))
            self.end_headers(); self.wfile.write(raw)
        def do_GET(self):
            if self.path=='/health': return self.answer(200,{'ok':True,'service':'marked-illustrations','version':1})
            self.answer(404,{'ok':False,'error':'NOT_FOUND'})
        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):
                return self.answer(403,{'ok':False,'error':'ACCESS_DENIED'})
            owner=self.headers.get('X-Workbench-Owner','')
            if not re.fullmatch('[a-f0-9]{64}',owner): return self.answer(403,{'ok':False,'error':'OWNER_REQUIRED'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4_000_000: raise JobError('UPLOAD_TOO_LARGE')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict): raise JobError('JSON_OBJECT_REQUIRED')
                action=self.path.strip('/')
                if action=='prepare':
                    raw=base64.b64decode(data.get('data',''),validate=True)
                    return self.answer(200,{'ok':True,'job':engine.create(owner,data.get('filename',''),raw,data.get('instructions'))})
                if action=='list': return self.answer(200,{'ok':True,'jobs':engine.list(owner)})
                if action=='configuration': return self.answer(200,engine.edge.call('provider-status',{}))
                job_id=str(data.get('job_id',''))
                job=engine.get(job_id,owner)
                if action=='status': return self.answer(200,{'ok':True,'job':engine.view(job)})
                if action in {'generate','retry'}:
                    retry=action=='retry'
                    if retry and data.get('confirm_repeat') is not True: raise JobError('RETRY_CONFIRMATION_REQUIRED')
                    # Reserve the job before acknowledging to prevent duplicate threads.
                    lock=engine._lock(job_id)
                    if not lock.acquire(blocking=False): raise JobError('JOB_BUSY')
                    reserved=threading.Event()
                    def work():
                        reserved.wait()
                        try: engine.generate(job_id,owner,retry=retry,scene_id=data.get('scene_id'))
                        except Exception as error:
                            code=str(error) if isinstance(error,JobError) else 'GENERATION_FAILED'
                            failed=engine.get(job_id,owner); failed['error']=code; engine._save(failed)
                            print(json.dumps({'job_id':job_id,'phase':'generation','code':code}),flush=True)
                    # A separate reservation set is needed until generate takes its lock.
                    lock.release()
                    with engine.guard:
                        active=getattr(engine,'active',set())
                        if job_id in active: raise JobError('JOB_BUSY')
                        active.add(job_id); engine.active=active
                    def guarded():
                        try: work()
                        finally:
                            with engine.guard: engine.active.discard(job_id)
                    threading.Thread(target=guarded,daemon=True).start(); reserved.set()
                    return self.answer(202,{'ok':True,'job':engine.view(job)})
                if action=='approve':
                    return self.answer(200,{'ok':True,'job':engine.approve(job_id,owner,str(data.get('scene_id','')))})
                if action=='reject':
                    return self.answer(200,{'ok':True,'job':engine.reject(job_id,owner,str(data.get('scene_id','')))})
                if action=='assemble': return self.answer(200,{'ok':True,'job':engine.assemble(job_id,owner)})
                if action=='asset': return self.answer(200,{'ok':True,**engine.asset(job_id,owner,data.get('scene_id'),data.get('document') is True)})
                raise JobError('ACTION_NOT_FOUND')
            except (ValueError,JobError) as error:
                code=str(error)
                if not re.fullmatch('[A-Z][A-Z0-9_]+',code): code='INVALID_REQUEST'
                self.answer(409 if code in {'JOB_BUSY','IMAGE_APPROVAL_REQUIRED'} else 422,{'ok':False,'error':code})
            except Exception:
                self.answer(500,{'ok':False,'error':'WORKBENCH_FAILED'})
    return ThreadingHTTPServer((host,port),Handler)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--host',default='127.0.0.1'); parser.add_argument('--port',type=int,default=5691)
    args=parser.parse_args()
    edge=EdgeClient(os.environ.get('NOVEL2_EDGE_AI_URL',''),os.environ.get('WORKBENCH_TOKEN',''))
    sd=None
    if os.environ.get('SD_BACKEND'):
        from sd_client import StableDiffusionClient
        sd=StableDiffusionClient({'backend':os.environ['SD_BACKEND'],'base_url':os.environ.get('SD_BASE_URL','http://127.0.0.1:7860'),
            'checkpoint':os.environ.get('SD_CHECKPOINT',''),'width':768,'height':1024})
    engine=MarkedEngine(os.environ.get('WORKBENCH_DATA','/data'),edge=edge,sd=sd)
    make_server(engine,os.environ.get('WORKBENCH_TOKEN',''),args.host,args.port).serve_forever()

if __name__=='__main__': main()
