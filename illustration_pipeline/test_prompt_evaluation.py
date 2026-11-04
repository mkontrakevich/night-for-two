import unittest
from prompt_evaluation import EvaluationError, prepare, run_once

class PromptEvaluationTest(unittest.TestCase):
    def test_file_and_models_checked(self):
        p=prepare('scene.txt','Проверка'.encode(),['one/model'],['one/model'])
        self.assertEqual(p['prompt'],'Проверка')
        for filename,raw,models in [('a.pdf',b'abc',['one/model']),('a.txt',b'\xff',['one/model']),('a.txt',b'abc',['other/model']),('a.txt',b'abc',['one/model','one/model'])]:
            with self.assertRaises(EvaluationError): prepare(filename,raw,models,['one/model'])
    def test_request_persisted_and_no_replay_after_unknown(self):
        p=prepare('a.txt',b'hello',['one/model','two/model'],['one/model','two/model'])
        calls=[];states=[]
        def invoke(model,prompt): calls.append(model);raise TimeoutError()
        run_once(p,invoke,lambda j:states.append([x['status'] for x in j['results']]),confirm=True)
        self.assertEqual(calls,['one/model']);self.assertEqual(states,[['running'],['uncertain']])
        with self.assertRaises(EvaluationError):run_once(p,invoke,lambda x:None,confirm=True)
    def test_refusal_stays_refusal(self):
        p=prepare('a.txt',b'hello',['one/model'],['one/model'])
        run_once(p,lambda m,t:{'refused':True},lambda j:None,confirm=True)
        self.assertEqual(p['results'][0]['status'],'refused')

if __name__=='__main__':unittest.main()
