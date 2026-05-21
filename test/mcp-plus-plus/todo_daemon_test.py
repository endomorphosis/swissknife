import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/mcp-plus-plus/todo_daemon.py"
SPEC = importlib.util.spec_from_file_location("todo_daemon", SCRIPT)
todo_daemon = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(todo_daemon)


def task(task_id, status="pending", priority="P0", dependencies=None):
    return {
        "id": task_id,
        "title": f"Task {task_id}",
        "phase": "Test",
        "priority": priority,
        "status": status,
        "dependencies": dependencies or [],
        "target_files": [f"src/{task_id}.ts"],
        "validation": [f"echo validate {task_id}"],
        "done_criteria": [f"{task_id} is done"],
        "prompt": f"Implement {task_id}.",
    }


def todo_markdown(tasks):
    return "\n".join(
        [
            "# Test Todo",
            "",
            todo_daemon.START_MARKER,
            "```json",
            json.dumps(tasks, indent=2),
            "```",
            todo_daemon.END_MARKER,
            "",
        ]
    )


class TodoDaemonTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.todo_file = self.root / "TODO.md"
        self.state_file = self.root / "state.json"
        self.tasks = [
            task("MCPUI-A", status="done"),
            task("MCPUI-B", dependencies=["MCPUI-A"]),
            task("MCPUI-C", priority="P1"),
            task("MCPUI-D", dependencies=["MCPUI-B"]),
        ]
        self.todo_file.write_text(todo_markdown(self.tasks), encoding="utf-8")

    def tearDown(self):
        self.tempdir.cleanup()

    def test_select_next_task_respects_dependencies_and_priority(self):
        tasks = todo_daemon.load_tasks(self.todo_file)
        next_task = todo_daemon.select_next_task(tasks)
        self.assertEqual(next_task["id"], "MCPUI-B")

    def test_claim_and_complete_update_markdown_and_state(self):
        claimed = todo_daemon.claim_task(None, "worker-1", self.todo_file, self.state_file)
        self.assertEqual(claimed["id"], "MCPUI-B")
        self.assertEqual(claimed["status"], "in_progress")

        tasks_after_claim = todo_daemon.load_tasks(self.todo_file)
        self.assertEqual(todo_daemon.find_task(tasks_after_claim, "MCPUI-B")["status"], "in_progress")

        state_after_claim = todo_daemon.read_state(self.state_file)
        self.assertEqual(state_after_claim["claims"]["MCPUI-B"]["worker"], "worker-1")

        completed = todo_daemon.complete_task("MCPUI-B", "worker-1", "done", self.todo_file, self.state_file)
        self.assertEqual(completed["status"], "done")

        state_after_complete = todo_daemon.read_state(self.state_file)
        self.assertNotIn("MCPUI-B", state_after_complete["claims"])
        self.assertEqual([event["action"] for event in state_after_complete["history"]], ["claim", "complete"])

    def test_render_prompt_includes_operational_fields(self):
        tasks = todo_daemon.load_tasks(self.todo_file)
        prompt = todo_daemon.render_task_prompt(todo_daemon.find_task(tasks, "MCPUI-B"), self.root)
        self.assertIn("Task: MCPUI-B - Task MCPUI-B", prompt)
        self.assertIn("src/MCPUI-B.ts", prompt)
        self.assertIn("`echo validate MCPUI-B`", prompt)
        self.assertIn("MCPUI-A", prompt)

    def test_run_once_dry_run_does_not_mutate_queue(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            rc = todo_daemon.main(
                [
                    "--todo-file",
                    str(self.todo_file),
                    "--state-file",
                    str(self.state_file),
                    "--repo-root",
                    str(self.root),
                    "run-once",
                ]
            )

        self.assertEqual(rc, 0)
        self.assertIn("Dry run: next task is MCPUI-B", output.getvalue())
        tasks = todo_daemon.load_tasks(self.todo_file)
        self.assertEqual(todo_daemon.find_task(tasks, "MCPUI-B")["status"], "pending")
        self.assertFalse(self.state_file.exists())


if __name__ == "__main__":
    unittest.main()
