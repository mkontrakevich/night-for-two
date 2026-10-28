"""Offline test server. Never used by the production entrypoint."""
import os
if os.environ.get('ILLUSTRATION_BROWSER_QA')!='1': raise RuntimeError('QA_ONLY')
import json
import tempfile
from pathlib import Path
from marked_engine import MarkedEngine
from workbench import make_server
from test_marked_system import FakeEdge, OWNER

with tempfile.TemporaryDirectory() as directory:
    engine=MarkedEngine(directory,edge=FakeEdge())
    server=make_server(engine,'t'*64,port=0)
    handler=server.RequestHandlerClass; original_get=handler.do_GET; original_post=handler.do_POST
    def get(self):
        if self.path.split('?')[0]=='/novel2/illustrations.html':
            raw=(Path(__file__).resolve().parents[1]/'novel2/public/illustrations.html').read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        else: original_get(self)
    def post(self):
        self.path=self.path.removeprefix('/novel2/api/illustrations')
        self.headers['Authorization']='Bearer '+'t'*64;self.headers['X-Workbench-Owner']=OWNER
        original_post(self)
    handler.do_GET=get;handler.do_POST=post
    print(json.dumps({'port':server.server_port}),flush=True)
    server.serve_forever()
