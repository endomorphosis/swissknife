"""Network regression checks for the real datasets IPFS retrieval entrypoint."""
import asyncio
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch


WORKSPACE = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WORKSPACE / "external/ipfs_datasets"))
SOURCE = WORKSPACE / "external/ipfs_datasets/ipfs_datasets_py/mcp_server/tools/ipfs_tools/get_from_ipfs.py"
spec = importlib.util.spec_from_file_location("datasets_ipfs_read_under_test", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

CONTENT = b'{"rows":[{"text":"real HTTP bytes"}]}\n'
CID = "bafy-local-http-regression"


class Handler(BaseHTTPRequestHandler):
    calls = []

    def do_GET(self):
        self.calls.append(self.path)
        if self.path == "/ipfs/" + CID:
            self.send_response(200)
            self.send_header("Content-Length", str(len(CONTENT)))
            self.end_headers()
            self.wfile.write(CONTENT)
        else:
            self.send_error(404)

    def log_message(self, *_args):
        pass


class ActualGatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.gateway = "http://127.0.0.1:" + str(cls.server.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def setUp(self):
        Handler.calls.clear()

    def test_explicit_gateway_reads_actual_bytes_without_native_dispatch(self):
        def forbidden_native(*_args, **_kwargs):
            raise AssertionError("explicit HTTP choice must not dispatch native")

        with patch.dict(sys.modules, {"ipfs_kit_py": types.SimpleNamespace(cat=forbidden_native)}):
            result = asyncio.run(module.get_from_ipfs(CID, gateway=self.gateway))
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["content"].encode(), CONTENT)
        self.assertEqual(result["binary_size"], len(CONTENT))
        self.assertEqual(Handler.calls, ["/ipfs/" + CID])

    def test_failed_native_dispatch_fetches_real_gateway_bytes(self):
        def failed_native(*_args, **_kwargs):
            raise RuntimeError("native read failed")

        with patch.dict(sys.modules, {"ipfs_kit_py": types.SimpleNamespace(cat=failed_native)}), patch.dict(os.environ, {"IPFS_HTTP_GATEWAY": self.gateway, "IPFS_KIT_INTEGRATION": "direct"}):
            result = asyncio.run(module.get_from_ipfs(CID))
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["content"].encode(), CONTENT)
        self.assertNotIn("Mock content", result["content"])
        self.assertEqual(Handler.calls, ["/ipfs/" + CID])

    def test_explicit_gateway_404_stays_error_without_hidden_public_fallback(self):
        result = asyncio.run(module.get_from_ipfs("missing", gateway=self.gateway))
        self.assertEqual(result["status"], "error")
        self.assertIn("HTTP 404", result["message"])
        self.assertNotIn("content", result)
        self.assertEqual(result["gateways_tried"], [self.gateway])

    def test_requested_output_contains_only_actual_downloaded_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "download.json"
            result = asyncio.run(module.get_from_ipfs(CID, str(output), gateway=self.gateway))
            self.assertEqual(result["status"], "success")
            self.assertEqual(output.read_bytes(), CONTENT)


if __name__ == "__main__":
    unittest.main()
