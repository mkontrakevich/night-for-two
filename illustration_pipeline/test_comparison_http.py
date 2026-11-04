import json
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from comparison_jobs import ComparisonJobs
from workbench import make_server

TOKEN='t'*40
OWNER='a'*64

class ComparisonHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.jobs=ComparisonJobs(self.directory.name,lambda _: {'filename':'x.txt','data':b'test'},lambda *_: {'content':'A quiet scene'},['provider/model'])
        self.server=make_server(None,TOKEN,host='127.0.0.1',port=0,comparison=self.jobs)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.directory.cleanup()

    def post(self, action, data, token=TOKEN, owner=OWNER):
        address='http://127.0.0.1:%s/%s'%(self.server.server_port,action)
        request=urllib.request.Request(address,data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'X-Workbench-Owner':owner,'Content-Type':'application/json'},method='POST')
        try:
            with urllib.request.urlopen(request,timeout=2) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as error: return error.code,json.load(error)

    def test_owner_and_confirm_enforced(self):
        self.assertEqual(self.post('model-tests-create',{},token='wrong')[0],403)
        status,body=self.post('model-tests-create',{'file_id':'test-file','models':['provider/model']})
        self.assertEqual(status,200); job_id=body['job']['id']
        self.assertNotIn('prompt',body['job'])
        self.assertEqual(self.post('model-tests-status',{'job_id':job_id},owner='b'*64)[0],422)
        self.assertEqual(self.post('model-tests-start',{'job_id':job_id})[0],422)
        self.assertEqual(self.post('model-tests-start',{'job_id':job_id,'confirm':True})[0],202)
        for _ in range(100):
            status,body=self.post('model-tests-status',{'job_id':job_id})
            if body['job']['state']=='complete': break
            time.sleep(.01)
        self.assertEqual(body['job']['state'],'complete')
        self.assertEqual(body['job']['results'][0]['content'],'A quiet scene')

if __name__=='__main__': unittest.main()
