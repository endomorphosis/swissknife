import json
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CLI = REPO_ROOT / "scripts" / "mcp-plus-plus" / "descriptor_cli.mjs"


class DescriptorCLITest(unittest.TestCase):
    def run_cli(self, *args, check=True):
        result = subprocess.run(
            ["node", str(CLI), *args],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if check and result.returncode != 0:
            raise AssertionError(f"CLI failed: {result.stderr}\n{result.stdout}")
        return result

    def test_scaffold_and_validate_dataset_inference_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            descriptor_path = Path(tmp) / "workflow.json"
            self.run_cli(
                "scaffold",
                "dataset-inference-workflow",
                str(descriptor_path),
                "--app-id",
                "test-workflow",
                "--title",
                "Test Workflow",
            )

            validate = self.run_cli("validate", str(descriptor_path))
            report = json.loads(validate.stdout)

            self.assertTrue(report["valid"])
            descriptor = json.loads(descriptor_path.read_text())
            self.assertEqual(descriptor["meta"]["app_id"], "test-workflow")
            self.assertEqual(
                [step["id"] for step in descriptor["workflow_graph"]["steps"]],
                ["select_dataset", "pin_dataset", "run_inference_job", "collect_artifact", "publish_artifact"],
            )

    def test_lint_rejects_missing_profile_sections(self):
        with tempfile.TemporaryDirectory() as tmp:
            descriptor_path = Path(tmp) / "bad.json"
            descriptor_path.write_text(json.dumps({"name": "bad"}))

            lint = self.run_cli("lint", str(descriptor_path), check=False)
            report = json.loads(lint.stdout)

            self.assertNotEqual(lint.returncode, 0)
            self.assertIn("meta.profile", lint.stdout)
            self.assertIn("MCPUI_META_PROFILE", [issue["code"] for issue in report["issues"]])

    def test_lint_accepts_directory_targets(self):
        with tempfile.TemporaryDirectory() as tmp:
            descriptor_path = Path(tmp) / "workflow.json"
            self.run_cli("scaffold", "job-console", str(descriptor_path), "--app-id", "job-app")

            lint = self.run_cli("lint", tmp)
            report = json.loads(lint.stdout)

            self.assertTrue(report["valid"])
            self.assertEqual(report["checked"], 1)

    def test_starter_packs_include_explorer_and_scaffold_validate(self):
        packs = self.run_cli("starter-packs").stdout.splitlines()
        self.assertIn("explorer", packs)

        with tempfile.TemporaryDirectory() as tmp:
            descriptor_path = Path(tmp) / "explorer.json"
            self.run_cli("scaffold", "explorer", str(descriptor_path), "--app-id", "explorer-app")
            validate = self.run_cli("validate", str(descriptor_path))
            report = json.loads(validate.stdout)

            self.assertTrue(report["valid"])

    def test_verify_trust_enforces_signature_and_allowlists(self):
        with tempfile.TemporaryDirectory() as tmp:
            descriptor_path = Path(tmp) / "workflow.json"
            self.run_cli("scaffold", "crud", str(descriptor_path), "--app-id", "crud-app")

            missing_signature = self.run_cli(
                "verify-trust",
                str(descriptor_path),
                "--require-signature",
                check=False,
            )
            publisher_rejected = self.run_cli(
                "verify-trust",
                str(descriptor_path),
                "--allowed-publishers",
                "remote",
                check=False,
            )

            self.assertNotEqual(missing_signature.returncode, 0)
            self.assertIn("Descriptor signature is required", missing_signature.stdout)
            self.assertNotEqual(publisher_rejected.returncode, 0)
            self.assertIn("not allowlisted", publisher_rejected.stdout)

    def test_compat_rejects_removed_methods(self):
        with tempfile.TemporaryDirectory() as tmp:
            base_path = Path(tmp) / "base.json"
            candidate_path = Path(tmp) / "candidate.json"
            self.run_cli("scaffold", "crud", str(base_path), "--app-id", "crud-app")
            candidate = json.loads(base_path.read_text())
            candidate["methods"] = candidate["methods"][:-1]
            candidate_path.write_text(json.dumps(candidate))

            compat = self.run_cli("compat", str(base_path), str(candidate_path), check=False)

            self.assertNotEqual(compat.returncode, 0)
            self.assertIn("Candidate removed method", compat.stdout)


if __name__ == "__main__":
    unittest.main()
