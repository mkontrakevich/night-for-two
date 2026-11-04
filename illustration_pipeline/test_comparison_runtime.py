import json
import tempfile
import unittest
from comparison_runtime import create_comparison_runtime
from prompt_evaluation import EvaluationError

class Response:
    ok=True
    def __init__(self,payload=None,raw=b''): self.payload,self.raw=payload,raw
    def json(self): return self.payload
    def iter_content(self,n): yield self.raw

class Http:
    def __init__(self): self.calls=[];self.content=b'hello';self.outside=False
    def post(self,url,**kw):
        self.calls.append(url)
        if 'oauth2.googleapis.com' in url:return Response({'access_token':'token'})
        if 'upload/drive' in url:return Response({'id':'upload_file_123456789','name':'result.json','webViewLink':'https://drive.google.com/file/d/example/view'})
        raise AssertionError(url)
    def get(self,url,**kw):
        if kw.get('params',{}).get('alt')=='media':return Response(raw=self.content)
        return Response({'id':url.split('/')[-1],'name':'x.txt','mimeType':'text/plain','size':str(len(self.content)),'parents':['other' if self.outside else 'folder_123456789']})

class Edge:
    def compare(self,model,prompt):return {'content':'Scene description and prompt','usage':{'tokens':5}}

class RuntimeTests(unittest.TestCase):
    def test_disabled_by_default_and_configuration_checked(self):
        self.assertIsNone(create_comparison_runtime({},Edge(),Http()))
        with self.assertRaisesRegex(ValueError,'CONFIGURATION_REQUIRED'):create_comparison_runtime({'MODEL_TESTS_ENABLED':'1'},Edge(),Http())
    def test_upload_compare_and_export_with_fake_external_services(self):
        with tempfile.TemporaryDirectory() as directory:
            env={'MODEL_TESTS_ENABLED':'1','MODEL_TESTS_GOOGLE_CLIENT_ID':'id','MODEL_TESTS_GOOGLE_CLIENT_SECRET':'secret','MODEL_TESTS_GOOGLE_REFRESH_TOKEN':'refresh','MODEL_TESTS_DRIVE_FOLDER_ID':'folder_123456789','MODEL_TESTS_ALLOWED_MODELS':json.dumps(['p/m']),'WORKBENCH_DATA':directory}
            http=Http();service=create_comparison_runtime(env,Edge(),http);owner='a'*64
            item=service.create_upload(owner,'x.txt',b'hello',['p/m']);self.assertEqual(item['state'],'ready')
            result=service.run(owner,item['id'],confirm=True)
            self.assertEqual(result['state'],'complete');self.assertEqual(result['export']['state'],'complete')
            self.assertEqual(result['results'][0]['content'],'Scene description and prompt')
            self.assertEqual(len(service.list(owner)),1)
            http.outside=True
            with self.assertRaisesRegex(EvaluationError,'OUTSIDE_PROJECT'):service.create(owner,'upload_file_123456789',['p/m'])

if __name__=='__main__':unittest.main()
