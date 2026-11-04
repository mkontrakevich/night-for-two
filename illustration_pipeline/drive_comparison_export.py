"""Upload a private model-comparison record with externally supplied Drive auth.

Call only after explicit user action, with a server-configured project folder.
The caller owns token renewal, owner authorization and uncertain-write handling.
"""
import json
import re
import secrets

class DriveExportError(RuntimeError): pass

def export_comparison(job, folder_id, access_token, post):
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,200}',str(folder_id or '')): raise DriveExportError('DRIVE_FOLDER_INVALID')
    if not isinstance(access_token,str) or not access_token: raise DriveExportError('DRIVE_AUTH_REQUIRED')
    if not isinstance(job,dict) or not isinstance(job.get('results'),list) or not job['results']: raise DriveExportError('COMPARISON_NOT_READY')
    if any(x.get('status')=='running' for x in job['results']): raise DriveExportError('COMPARISON_RUNNING')
    if not re.fullmatch(r'[a-f0-9]{64}',str(job.get('source_sha256',''))): raise DriveExportError('COMPARISON_HASH_INVALID')
    payload={'version':1,'source_sha256':job['source_sha256'],'prompt':job.get('prompt',''),
        'models':job.get('models',[]),'results':[{k:x[k] for k in ('model','status','content','usage','error') if k in x} for x in job['results']]}
    body=json.dumps(payload,ensure_ascii=False,indent=2).encode('utf-8')
    if len(body)>4_000_000: raise DriveExportError('COMPARISON_TOO_LARGE')
    boundary='comparison_'+secrets.token_hex(16)
    metadata=json.dumps({'name':'model-comparison-'+job['source_sha256'][:12]+'.json','parents':[folder_id],'mimeType':'application/json'}).encode()
    wire=(b'--'+boundary.encode()+b'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+metadata+
          b'\r\n--'+boundary.encode()+b'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+body+
          b'\r\n--'+boundary.encode()+b'--\r\n')
    try:
        response=post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            headers={'Authorization':'Bearer '+access_token,'Content-Type':'multipart/related; boundary='+boundary},data=wire,timeout=30)
    except Exception: raise DriveExportError('DRIVE_WRITE_UNCERTAIN') from None
    if not response.ok: raise DriveExportError('DRIVE_HTTP_'+str(response.status_code))
    try: data=response.json()
    except Exception: raise DriveExportError('DRIVE_WRITE_UNCERTAIN') from None
    if not isinstance(data,dict) or not re.fullmatch(r'[A-Za-z0-9_-]{10,200}',str(data.get('id',''))):
        raise DriveExportError('DRIVE_WRITE_UNCERTAIN')
    return {'id':data['id'],'name':data.get('name'),'url':data.get('webViewLink')}
