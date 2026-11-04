#!/usr/bin/env python3
"""Network smoke of isolated Cloudflare staging; no real provider calls."""
import base64, json, os, time, uuid, urllib.request, urllib.error
BASE=os.environ.get('N4T_STAGING_URL','https://night4two-model-tests-staging.kontrakevich.workers.dev').rstrip('/')
KEY=os.environ['N4T_STAGING_TOKEN']
def request(path, body=None, auth=True):
    headers={'Accept':'application/json','content-type':'application/json'}
    if auth: headers['x-n4t-staging-key']=KEY
    data=None if body is None else json.dumps(body,ensure_ascii=False).encode('utf-8')
    req=urllib.request.Request(BASE+path,method='GET' if body is None else 'POST',headers=headers,data=data)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            result=json.load(r)
            return r.status,result
    except urllib.error.HTTPError as e:
        try: body=json.load(e)
        except Exception: body={}
        return e.code,body
code,health=request('/health')
assert code==200 and health.get('fixture_mode') is True and health.get('real_model_generation') is False,(code,health)
code,_=request('/api/model-tests/config',{},auth=False)
assert code==401,'Public API must be closed'
code,config=request('/api/model-tests/config',{})
assert code==200 and config.get('ok') and len(config.get('models',[]))==2,(code,config)
models=config['models']
code,created=request('/api/model-tests/create',{'scene_id':'staging-'+str(uuid.uuid4())[:8],'models':models,'budget_max_usd':0.02})
assert code==201 and created.get('ok') is True,(code,created)
job_id=created['job']['id'];assert len(job_id)==36
inputs=[
 ('scene','scene.txt','Двое взрослых в старом отеле у окна, мягкий свет, художественный кадр.'),
 ('sensual_director','sensual.md','# Sensual Director staging fixture: визуальная режиссура и свет.'),
 ('couple_space','couple.md','# Couple Space staging fixture: взаимность, эмоциональная дистанция.')
]
for role,filename,text in inputs:
    payload={'job_id':job_id,'role':role,'filename':filename,'data_base64':base64.b64encode(text.encode()).decode()}
    code,result=request('/api/model-tests/assets/upload',payload)
    assert code==200 and result['job']['input_files'][role]['state']=='saved',(role,code,result)
code,v=request('/api/model-tests/validate',{'job_id':job_id})
assert code==200 and v.get('ready') is True,(code,v)
code,started=request('/api/model-tests/start',{'job_id':job_id,'confirm':True,'phase':'text'})
assert code==202 and started.get('job',{}).get('state')=='queued',(code,started)
state='queued'
for n in range(85):
    time.sleep(2)
    code,status=request('/api/model-tests/status',{'job_id':job_id})
    assert code==200,(code,status)
    state=status['job']['state']
    if state in {'complete','uncertain','export_uncertain','failed','blocked','input_uncertain'}:break
assert state=='complete',f'Staging did not complete. Final state: {state}'
code,table=request('/api/model-tests/comparison',{'job_id':job_id})
assert code==200 and table.get('ok'),(code,table)
assert len(table.get('prompt',[]))==2 and len(table.get('aromas',[]))==2
assert all(row.get('status')=='complete' for row in table['prompt'])
assert all('STAGING FIXTURE ONLY' in row.get('final_image_prompt','') for row in table['prompt'])
expected=['result','prompt_comparison_json','prompt_comparison_csv','aroma_comparison_json','aroma_comparison_csv']
exports=table.get('exports',{})
for name in expected:
    receipt=exports.get(name,{})
    assert receipt.get('state')=='saved' and receipt.get('id'),(name,receipt)
code,double=request('/api/model-tests/start',{'job_id':job_id,'confirm':True,'phase':'text'})
assert code!=202,'A completed job must not restart'
result={'result':'PASS','mode':'FIXTURE_ONLY','job_id':job_id,'model_count':2,'saved_exports':{k:exports[k]['id'] for k in expected},'cost_usd':0,'paid_requests':0}
with open('/tmp/night4two-staging-smoke.json','w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print('NIGHT4TWO_STAGING_E2E_OK',{'job_id':job_id,'models':2,'drive_export_receipts':5,'paid_requests':0})
