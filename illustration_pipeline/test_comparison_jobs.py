import tempfile, unittest
from comparison_jobs import ComparisonJobs
from prompt_evaluation import EvaluationError

class ComparisonJobTests(unittest.TestCase):
    def test_owner_isolation_and_no_retry(self):
        with tempfile.TemporaryDirectory() as root:
            calls=[]
            def invoke(model,prompt): calls.append(model); raise TimeoutError()
            jobs=ComparisonJobs(root,lambda _: {'filename':'x.txt','data':b'test'},invoke,['p/m'])
            owner='a'*64; view=jobs.create(owner,'file-id',['p/m'])
            self.assertNotIn('prompt',view)
            with self.assertRaises(EvaluationError): jobs.view('b'*64,view['id'])
            result=jobs.run(owner,view['id'],confirm=True)
            self.assertEqual(result['state'],'uncertain')
            with self.assertRaises(EvaluationError): jobs.run(owner,view['id'],confirm=True)
            self.assertEqual(calls,['p/m'])
    def test_recovery_does_not_repeat_call(self):
        with tempfile.TemporaryDirectory() as root:
            jobs=ComparisonJobs(root,lambda _: {'filename':'x.txt','data':b'test'},lambda *a:self.fail('unexpected'),['p/m'])
            owner='a'*64; item=jobs.create(owner,'file-id',['p/m'])
            job=jobs._load(owner,item['id']); job.update(state='running',results=[{'model':'p/m','status':'running'}]); jobs._save(owner,item['id'],job)
            self.assertEqual(jobs.recover(owner,item['id'])['results'][0]['status'],'uncertain')
            with self.assertRaises(EvaluationError): jobs.run(owner,item['id'],confirm=True)

if __name__=='__main__': unittest.main()
