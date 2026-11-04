import unittest
from drive_comparison_export import export_comparison, DriveExportError

class DriveComparisonTest(unittest.TestCase):
    def setUp(self): self.job={'source_sha256':'a'*64,'prompt':'example','models':['a/b'],'results':[{'model':'a/b','status':'complete','content':'response'}]}
    def test_upload_includes_source_and_results(self):
        seen=[]
        class Response:
            ok=True
            def json(self): return {'id':'1234567890abcdef','name':'result.json'}
        def post(url,**kw): seen.append((url,kw));return Response()
        result=export_comparison(self.job,'folder_123456789','token',post)
        self.assertEqual(result['id'],'1234567890abcdef')
        self.assertIn(b'example',seen[0][1]['data']);self.assertIn(b'response',seen[0][1]['data'])
        self.assertIn(b'folder_123456789',seen[0][1]['data'])
    def test_unknown_write_is_not_retried(self):
        calls=[]
        def post(*a,**kw): calls.append(1);raise TimeoutError()
        with self.assertRaisesRegex(DriveExportError,'UNCERTAIN'):export_comparison(self.job,'folder_123456789','token',post)
        self.assertEqual(len(calls),1)
    def test_running_job_cannot_export(self):
        self.job['results'][0]['status']='running'
        with self.assertRaisesRegex(DriveExportError,'RUNNING'):export_comparison(self.job,'folder_123456789','token',lambda *a,**k:None)

if __name__=='__main__':unittest.main()
