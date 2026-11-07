"""Night4two v3 private illustration sidecar deployment contract."""
import unittest
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[1]
class WorkbenchComposeContract(unittest.TestCase):
    def test_private_sidecar_and_persistence(self):
        compose=yaml.safe_load((ROOT/'novel2/docker-compose.yml').read_text())
        services=compose['services']
        self.assertIn('app',services)
        self.assertIn('novel2-illustration-workbench',services)
        worker=services['novel2-illustration-workbench']
        self.assertEqual(worker['build']['dockerfile'],'illustration_pipeline/Dockerfile.workbench')
        self.assertEqual(worker['build']['context'],'..')
        self.assertNotIn('ports',worker,'Private worker must not publish an external port')
        self.assertIn('default',worker['networks'])
        self.assertIn('novel2_workbench_data:/data',worker['volumes'])
        self.assertIn('novel2_workbench_data',compose['volumes'])
        self.assertIn('NOVEL2_EDGE_AI_URL',worker['environment'])
        self.assertNotIn('env_file',worker,'Do not mount the entire production .env into workbench')
        command='\n'.join(str(x) for x in worker['command'])
        self.assertIn('WORKBENCH_TOKEN',command)
        self.assertIn('NOVEL2_TELEGRAM_AUTH_TOKEN',command)
        self.assertIn('novel2-ai-v1:',command)
        self.assertIn('hashlib.sha256',command)
        self.assertNotIn('TELEGRAM_BOT_TOKEN: ""',command)
        self.assertTrue(worker['healthcheck'])
    def test_edge_proxy_destination(self):
        proxy=(ROOT/'novel2/src/illustration-workbench-proxy.js').read_text()
        self.assertIn('http://novel2-illustration-workbench:5691/',proxy)
        self.assertIn('sha256',proxy)
if __name__=='__main__':unittest.main()
