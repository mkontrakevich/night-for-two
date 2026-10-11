"""Production smoke for native Stranger. No photographs or paid world renders."""
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

token=os.environ["NOVEL2_SERVICE_SECRET"].strip()
owner=os.environ["NOVEL2_ALLOWED_USER_IDS"].split(",",1)[0].strip()
if not (token and owner.isdecimal()):
    raise SystemExit("NOVEL2_STRANGER_TEST_CREDENTIALS_MISSING")

params={
    "auth_date":str(int(time.time())),
    "user":json.dumps({"id":int(owner)},separators=(",",":"))
}
check="\n".join(f"{key}={val}" for key,val in sorted(params.items()))
secret=hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest()
params["hash"]=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
init_data=urllib.parse.urlencode(params)
base="https://novel2-preview.kontrakevich.workers.dev"

def post(route,payload,signed=True):
    headers={"content-type":"application/json","accept":"application/json","user-agent":"curl/8.5.0"}
    if signed:headers["x-telegram-init-data"]=init_data
    request=urllib.request.Request(base+route,
        data=json.dumps(payload,ensure_ascii=False).encode("utf-8"),
        headers=headers,method="POST")
    try:
        with urllib.request.urlopen(request,timeout=50) as resp:
            return resp.status,dict(resp.headers),json.load(resp)
    except urllib.error.HTTPError as error:
        raw=error.read().decode("utf-8",errors="replace")
        try: content=json.loads(raw)
        except ValueError: content={"error":"NON_JSON_RESPONSE","content_type":error.headers.get("Content-Type","")}
        return error.code,dict(error.headers),content

path="/novel2/api/host/turn"
status,headers,body=post(path,{"stage":"invitation"},False)
assert status in (401,403),(status,body.get("error"),body.get("content_type"))
status,headers,body=post(path,{"stage":"invitation","mood":"тайна"})
assert status==200,(status,body.get("error"),body.get("content_type"))
assert {k.lower():v for k,v in headers.items()}.get("x-secret-stranger")=="2.0.0",{k.lower():v for k,v in headers.items()}.get("x-secret-stranger")
turn=body.get("turn",{})
assert turn.get("stage")=="invitation",turn.get("stage")
assert turn.get("next_action")=="accept_invitation",turn.get("next_action")
assert isinstance(turn.get("line"),str) and turn["line"],"no AI/safe fallback line"
print("STRANGER_NATIVE_AUTH=PASS")
print("STRANGER_NATIVE_PROVIDER="+str(turn.get("provider","unknown")))
status,headers,body=post("/novel2/api/lobby/world/status",{})
assert status==200,(status,body.get("error"))
assert {k.lower():v for k,v in headers.items()}.get("x-secret-stranger")=="2.0.0",{k.lower():v for k,v in headers.items()}.get("x-secret-stranger")
assert body.get("ok") is True
print("STRANGER_R2_PRIVATE_READ=PASS")
