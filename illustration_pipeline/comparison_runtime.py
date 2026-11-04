"""Opt-in service wiring; credentials are separate from the bot's calendar."""
import json
import re
import secrets
from pathlib import Path
from comparison_jobs import ComparisonJobs
from drive_prompt_source import read_drive_prompt
from drive_comparison_export import export_comparison

def create_comparison_runtime(env, edge, http):
    if env.get('MODEL_TESTS_ENABLED')!='1': return None
    keys=('MODEL_TESTS_GOOGLE_CLIENT_ID','MODEL_TESTS_GOOGLE_CLIENT_SECRET','MODEL_TESTS_GOOGLE_REFRESH_TOKEN','MODEL_TESTS_DRIVE_FOLDER_ID','MODEL_TESTS_ALLOWED_MODELS')
    if any(not env.get(key) for key in keys): raise ValueError('MODEL_TESTS_CONFIGURATION_REQUIRED')
    try: models=json.loads(env['MODEL_TESTS_ALLOWED_MODELS'])
    except ValueError: raise ValueError('MODEL_TESTS_CONFIGURATION_INVALID') from None
    if not isinstance(models,list) or not models or len(models)>10 or any(not isinstance(x,str) for x in models): raise ValueError('MODEL_TESTS_CONFIGURATION_INVALID')
    folder=env['MODEL_TESTS_DRIVE_FOLDER_ID']
    def token():
        try:
            response=http.post('https://oauth2.googleapis.com/token',data={'grant_type':'refresh_token','client_id':env['MODEL_TESTS_GOOGLE_CLIENT_ID'],'client_secret':env['MODEL_TESTS_GOOGLE_CLIENT_SECRET'],'refresh_token':env['MODEL_TESTS_GOOGLE_REFRESH_TOKEN']},timeout=15)
            if not response.ok: raise ValueError('DRIVE_AUTH_FAILED')
            value=response.json().get('access_token')
            if not isinstance(value,str) or not value: raise ValueError('DRIVE_AUTH_FAILED')
            return value
        except Exception: raise ValueError('DRIVE_AUTH_FAILED') from None
    def read(file_id): return read_drive_prompt(file_id,token(),http.get,allowed_folder=folder)
    def export(job): return export_comparison(job,folder,token(),http.post)
    def upload(filename,raw):
        if '/' in filename or '\\' in filename or len(filename)>160: raise ValueError('DRIVE_FILENAME_INVALID')
        boundary='novel2_'+secrets.token_hex(16)
        metadata=json.dumps({'name':filename,'parents':[folder],'mimeType':'text/plain'},ensure_ascii=False).encode()
        wire=(b'--'+boundary.encode()+b'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+metadata+
              b'\r\n--'+boundary.encode()+b'\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n'+raw+b'\r\n--'+boundary.encode()+b'--\r\n')
        try:
            response=http.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',headers={'Authorization':'Bearer '+token(),'Content-Type':'multipart/related; boundary='+boundary},data=wire,timeout=30)
            if not response.ok: raise ValueError('DRIVE_UPLOAD_FAILED')
            file_id=response.json().get('id','')
            if not re.fullmatch(r'[A-Za-z0-9_-]{10,200}',file_id): raise ValueError('DRIVE_UPLOAD_UNCERTAIN')
            return file_id
        except Exception: raise ValueError('DRIVE_UPLOAD_UNCERTAIN') from None
    root=Path(env.get('WORKBENCH_DATA','/data'))/'model-tests'
    return ComparisonJobs(root,read,edge.compare,models,export=export,upload=upload)
