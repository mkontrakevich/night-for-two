import unittest
from drive_prompt_source import read_drive_prompt
from prompt_evaluation import EvaluationError

class Response:
    def __init__(self,payload=None,raw=b''):self.payload=payload;self.raw=raw;self.ok=True
    def json(self):return self.payload
    def iter_content(self,n):yield self.raw

class DrivePromptTest(unittest.TestCase):
    def test_read_text_and_verify_size(self):
        fid='file_1234567890'; responses=iter([Response({'id':fid,'name':'task.txt','mimeType':'text/plain','size':'4'}),Response(raw=b'test')]);calls=[]
        def get(*a,**kw):calls.append(kw);return next(responses)
        self.assertEqual(read_drive_prompt(fid,'token',get)['data'],b'test')
        self.assertEqual(calls[1]['params'],{'alt':'media'})
    def test_reject_nontext_and_changed_size(self):
        fid='file_1234567890'
        with self.assertRaisesRegex(EvaluationError,'TEXT_FILE_REQUIRED'):
            read_drive_prompt(fid,'token',lambda *a,**k:Response({'id':fid,'name':'task.pdf','mimeType':'application/pdf','size':'4'}))
        responses=iter([Response({'id':fid,'name':'task.txt','mimeType':'text/plain','size':'5'}),Response(raw=b'test')])
        with self.assertRaisesRegex(EvaluationError,'FILE_CHANGED'):read_drive_prompt(fid,'token',lambda *a,**k:next(responses))

if __name__=='__main__':unittest.main()
