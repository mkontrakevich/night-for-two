import tempfile, threading, unittest
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
    def test_status_available_while_provider_is_running(self):
        with tempfile.TemporaryDirectory() as root:
            entered=threading.Event(); release=threading.Event()
            def invoke(*_):
                entered.set(); release.wait(2)
                return {'content':'A scene description'}
            jobs=ComparisonJobs(root,lambda _: {'filename':'x.txt','data':b'test'},invoke,['p/m'])
            owner='a'*64; job_id=jobs.create(owner,'file-id',['p/m'])['id']
            worker=threading.Thread(target=jobs.run,args=(owner,job_id),kwargs={'confirm':True})
            worker.start()
            try:
                self.assertTrue(entered.wait(1))
                self.assertEqual(jobs.view(owner,job_id)['results'][0]['status'],'running')
                with self.assertRaisesRegex(EvaluationError,'JOB_BUSY'): jobs.recover(owner,job_id)
            finally:
                release.set(); worker.join(2)
            self.assertEqual(jobs.view(owner,job_id)['state'],'complete')

if __name__=='__main__': unittest.main()
