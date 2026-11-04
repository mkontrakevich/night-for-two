"""Read a user-selected Drive text file through host-provided authorization."""
import re
from prompt_evaluation import MAX_FILE_BYTES, EvaluationError

def read_drive_prompt(file_id, access_token, get):
    if not re.fullmatch(r'[A-Za-z0-9_-]{10,200}',str(file_id or '')): raise EvaluationError('DRIVE_FILE_INVALID')
    if not isinstance(access_token,str) or not access_token: raise EvaluationError('DRIVE_AUTH_REQUIRED')
    headers={'Authorization':'Bearer '+access_token}
    base='https://www.googleapis.com/drive/v3/files/'+file_id
    try:
        meta=get(base,headers=headers,params={'fields':'id,name,mimeType,size,modifiedTime'},timeout=15)
        if not meta.ok: raise EvaluationError('DRIVE_METADATA_HTTP_'+str(meta.status_code))
        info=meta.json()
        if info.get('id')!=file_id or info.get('mimeType')!='text/plain' or not str(info.get('name','')).lower().endswith('.txt'):
            raise EvaluationError('DRIVE_TEXT_FILE_REQUIRED')
        if not str(info.get('size','')).isdigit() or not 0<int(info['size'])<=MAX_FILE_BYTES:
            raise EvaluationError('FILE_SIZE_INVALID')
        response=get(base,headers=headers,params={'alt':'media'},stream=True,timeout=30)
        if not response.ok: raise EvaluationError('DRIVE_DOWNLOAD_HTTP_'+str(response.status_code))
        chunks=[];size=0
        for part in response.iter_content(8192):
            size+=len(part)
            if size>MAX_FILE_BYTES: raise EvaluationError('FILE_SIZE_INVALID')
            chunks.append(part)
        raw=b''.join(chunks)
        if len(raw)!=int(info['size']): raise EvaluationError('DRIVE_FILE_CHANGED')
        return {'filename':info['name'],'modified_time':info.get('modifiedTime'),'data':raw}
    except EvaluationError: raise
    except Exception: raise EvaluationError('DRIVE_READ_FAILED') from None
