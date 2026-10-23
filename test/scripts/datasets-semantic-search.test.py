"""The real semantic wrapper must preserve backend failure and model identity."""
import asyncio
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

source = Path(__file__).resolve().parents[3] / 'external/ipfs_datasets/ipfs_datasets_py/search/search_tools_api.py'
spec = importlib.util.spec_from_file_location('vdg_real_search_api', source)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
module = 'ipfs_datasets_py.mcp_server.tools.vector_tools.vector_store_management'


class SemanticSearchTests(unittest.TestCase):
    def invoke(self, result, **kwargs):
        async def actual_search(**params):
            self.assertEqual(params['index_name'], 'owned-notes')
            self.assertEqual(params['query'], 'actual desktop note')
            return result
        with patch.dict(sys.modules, {module: types.SimpleNamespace(search_vector_index=actual_search)}):
            return asyncio.run(api.semantic_search_from_parameters(vector_service=None, query='actual desktop note', collection='owned-notes', **kwargs))

    def test_owner_failure_cannot_be_reported_as_successful_empty_search(self):
        with self.assertRaisesRegex(RuntimeError, 'index missing'):
            self.invoke({'status': 'error', 'error': 'index missing'})

    def test_unverified_owner_result_is_rejected(self):
        for value in [None, {}, {'results': []}, {'status': 'success', 'error': 'partial failure'}]:
            with self.assertRaises(RuntimeError):
                self.invoke(value)

    def test_actual_results_and_actual_manager_model_are_preserved(self):
        results = [{'score': 0.8, 'document': {'text': 'actual matching note'}}]
        value = self.invoke({'status': 'success', 'results': results})
        self.assertEqual(value['results'], results)
        self.assertEqual(value['model'], 'thenlper/gte-small')
        self.assertEqual(value['total_found'], 1)

    def test_unsupported_model_cannot_be_misreported_as_executed(self):
        with self.assertRaisesRegex(ValueError, 'thenlper/gte-small'):
            self.invoke({'status': 'success', 'results': []}, model='different-model')


if __name__ == '__main__':
    unittest.main()
