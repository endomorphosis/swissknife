#!/usr/bin/env python3
"""SwissKnife MCP++ todo queue adapter.

This is a local adapter inspired by the ipfs_datasets_py todo manager and
queue scripts. Those upstream scripts are tied to their repository layout and
GitHub/Copilot workflows; this adapter keeps SwissKnife's MCP++ plan in a
tracked markdown queue and stores local claim/run history outside git.
"""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TODO_FILE = REPO_ROOT / "docs/mcp-plus-plus/TEMPLATE_DRIVEN_UI_UX_TODO.md"
DEFAULT_STATE_FILE = REPO_ROOT / ".codex/todo-daemon/state.json"
DEFAULT_BACKEND_STATE_FILE = REPO_ROOT / ".codex/todo-daemon/ipfs_datasets_backend.json"

START_MARKER = "<!-- codex-todo-queue:start -->"
END_MARKER = "<!-- codex-todo-queue:end -->"

VALID_STATUSES = {"pending", "in_progress", "blocked", "failed", "done"}
PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
LIST_FIELDS = {"dependencies", "target_files", "validation", "done_criteria"}
REQUIRED_FIELDS = {
    "id",
    "title",
    "phase",
    "priority",
    "status",
    "dependencies",
    "target_files",
    "validation",
    "done_criteria",
    "prompt",
}


class QueueError(RuntimeError):
    """Raised when the tracked todo queue cannot be parsed or updated."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def extract_queue_payload(markdown: str) -> str:
    start = markdown.find(START_MARKER)
    if start < 0:
        raise QueueError(f"missing start marker: {START_MARKER}")

    content_start = start + len(START_MARKER)
    end = markdown.find(END_MARKER, content_start)
    if end < 0:
        raise QueueError(f"missing end marker: {END_MARKER}")

    block = markdown[content_start:end]
    match = re.search(r"```json\s*(.*?)\s*```", block, re.DOTALL)
    if not match:
        raise QueueError("automation queue must contain a fenced json block")

    return match.group(1)


def replace_queue_payload(markdown: str, tasks: list[dict[str, Any]]) -> str:
    start = markdown.find(START_MARKER)
    if start < 0:
        raise QueueError(f"missing start marker: {START_MARKER}")

    content_start = start + len(START_MARKER)
    end = markdown.find(END_MARKER, content_start)
    if end < 0:
        raise QueueError(f"missing end marker: {END_MARKER}")

    payload = json.dumps(tasks, indent=2)
    return f"{markdown[:content_start]}\n```json\n{payload}\n```\n{markdown[end:]}"


def validate_tasks(tasks: Any) -> list[dict[str, Any]]:
    if not isinstance(tasks, list):
        raise QueueError("automation queue must be a json list")

    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for index, task in enumerate(tasks):
        if not isinstance(task, dict):
            raise QueueError(f"task at index {index} must be an object")

        missing = sorted(REQUIRED_FIELDS - set(task))
        if missing:
            raise QueueError(f"task at index {index} is missing fields: {', '.join(missing)}")

        task_id = task["id"]
        if not isinstance(task_id, str) or not task_id:
            raise QueueError(f"task at index {index} has invalid id")
        if task_id in seen:
            raise QueueError(f"duplicate task id: {task_id}")
        seen.add(task_id)

        if task["status"] not in VALID_STATUSES:
            raise QueueError(f"{task_id} has invalid status: {task['status']}")
        if task["priority"] not in PRIORITY_RANK:
            raise QueueError(f"{task_id} has invalid priority: {task['priority']}")

        for field in LIST_FIELDS:
            if not isinstance(task[field], list):
                raise QueueError(f"{task_id}.{field} must be a list")
            if not all(isinstance(item, str) for item in task[field]):
                raise QueueError(f"{task_id}.{field} must contain only strings")

        for field in ("title", "phase", "prompt"):
            if not isinstance(task[field], str) or not task[field]:
                raise QueueError(f"{task_id}.{field} must be a non-empty string")

        normalized.append(task)

    known_ids = {task["id"] for task in normalized}
    for task in normalized:
        unknown = sorted(set(task["dependencies"]) - known_ids)
        if unknown:
            raise QueueError(f"{task['id']} has unknown dependencies: {', '.join(unknown)}")

    return normalized


def load_tasks(todo_file: Path = DEFAULT_TODO_FILE) -> list[dict[str, Any]]:
    markdown = todo_file.read_text(encoding="utf-8")
    payload = extract_queue_payload(markdown)
    try:
        tasks = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise QueueError(f"automation queue json is invalid: {exc}") from exc
    return validate_tasks(tasks)


def save_tasks(tasks: list[dict[str, Any]], todo_file: Path = DEFAULT_TODO_FILE) -> None:
    validate_tasks(tasks)
    markdown = todo_file.read_text(encoding="utf-8")
    todo_file.write_text(replace_queue_payload(markdown, tasks), encoding="utf-8")


def task_map(tasks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {task["id"]: task for task in tasks}


def select_next_task(tasks: list[dict[str, Any]], include_failed: bool = False) -> dict[str, Any] | None:
    by_id = task_map(tasks)
    ready: list[tuple[int, int, dict[str, Any]]] = []

    for order, task in enumerate(tasks):
        retry_failed = include_failed and task["status"] == "failed"
        if task["status"] != "pending" and not retry_failed:
            continue

        if all(by_id[dep]["status"] == "done" for dep in task["dependencies"]):
            ready.append((PRIORITY_RANK[task["priority"]], order, task))

    if not ready:
        return None

    ready.sort(key=lambda item: (item[0], item[1]))
    return ready[0][2]


def blocked_dependencies(task: dict[str, Any], tasks: list[dict[str, Any]]) -> list[str]:
    by_id = task_map(tasks)
    return [dep for dep in task["dependencies"] if by_id[dep]["status"] != "done"]


def find_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any]:
    for task in tasks:
        if task["id"] == task_id:
            return task
    raise QueueError(f"unknown task id: {task_id}")


def set_task_status(tasks: list[dict[str, Any]], task_id: str, status: str) -> dict[str, Any]:
    if status not in VALID_STATUSES:
        raise QueueError(f"invalid status: {status}")

    task = find_task(tasks, task_id)
    task["status"] = status
    task["updated"] = utc_now()
    return task


def read_state(state_file: Path = DEFAULT_STATE_FILE) -> dict[str, Any]:
    if not state_file.exists():
        return {"version": 1, "claims": {}, "history": []}

    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise QueueError(f"state file json is invalid: {exc}") from exc

    if not isinstance(state, dict):
        raise QueueError("state file must contain a json object")

    state.setdefault("version", 1)
    state.setdefault("claims", {})
    state.setdefault("history", [])
    return state


def save_state(state: dict[str, Any], state_file: Path = DEFAULT_STATE_FILE) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def stable_backend_task_id(task_id: str) -> str:
    return f"swissknife:mcp-ui:{task_id}"


def detect_ipfs_datasets_backend(repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    sibling = repo_root.parent / "ipfs_datasets_py"
    if sibling.exists() and str(sibling) not in sys.path:
        sys.path.insert(0, str(sibling))

    try:
        from ipfs_datasets_py.mcp_server.mcplusplus.task_queue import create_task_queue

        queue = create_task_queue()
        return {
            "available": bool(getattr(queue, "available", False)),
            "mode": "ipfs_datasets_py.mcp_server.mcplusplus.task_queue",
            "reason": "backend wrapper detected" if getattr(queue, "available", False) else "backend wrapper detected but task queue provider is unavailable",
        }
    except Exception as exc:
        return {
            "available": False,
            "mode": "local-mirror",
            "reason": str(exc),
        }


def task_backend_record(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "backend_task_id": stable_backend_task_id(task["id"]),
        "source_task_id": task["id"],
        "title": task["title"],
        "status": task["status"],
        "priority": task["priority"],
        "dependencies": [stable_backend_task_id(dep) for dep in task["dependencies"]],
        "source_dependencies": task["dependencies"],
        "target_files": task["target_files"],
        "validation": task["validation"],
        "done_criteria": task["done_criteria"],
        "prompt": task["prompt"],
        "updated": task.get("updated"),
    }


def sync_backend_mirror(
    tasks: list[dict[str, Any]],
    backend_state_file: Path = DEFAULT_BACKEND_STATE_FILE,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    backend_state_file.parent.mkdir(parents=True, exist_ok=True)
    state = {
        "version": 1,
        "updated": utc_now(),
        "backend": detect_ipfs_datasets_backend(repo_root),
        "tasks": {
            task["id"]: task_backend_record(task)
            for task in tasks
        },
    }
    backend_state_file.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return state


def record_history(
    state: dict[str, Any],
    action: str,
    task_id: str,
    worker: str,
    note: str | None = None,
) -> None:
    event: dict[str, Any] = {
        "time": utc_now(),
        "action": action,
        "task_id": task_id,
        "worker": worker,
    }
    if note:
        event["note"] = note
    state.setdefault("history", []).append(event)
    state["history"] = state["history"][-200:]


def claim_task(
    task_id: str | None,
    worker: str,
    todo_file: Path = DEFAULT_TODO_FILE,
    state_file: Path = DEFAULT_STATE_FILE,
    backend_state_file: Path | None = None,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    tasks = load_tasks(todo_file)
    task = select_next_task(tasks) if task_id is None else find_task(tasks, task_id)
    if task is None:
        raise QueueError("no dependency-ready pending tasks")

    if task["status"] != "pending":
        raise QueueError(f"{task['id']} is {task['status']}; only pending tasks can be claimed")

    blockers = blocked_dependencies(task, tasks)
    if blockers:
        raise QueueError(f"{task['id']} is blocked by dependencies: {', '.join(blockers)}")

    set_task_status(tasks, task["id"], "in_progress")
    save_tasks(tasks, todo_file)

    state = read_state(state_file)
    state.setdefault("claims", {})[task["id"]] = {
        "worker": worker,
        "claimed_at": utc_now(),
    }
    record_history(state, "claim", task["id"], worker)
    save_state(state, state_file)
    if backend_state_file is not None:
        sync_backend_mirror(load_tasks(todo_file), backend_state_file, repo_root)
    return find_task(tasks, task["id"])


def complete_task(
    task_id: str,
    worker: str,
    note: str | None = None,
    todo_file: Path = DEFAULT_TODO_FILE,
    state_file: Path = DEFAULT_STATE_FILE,
    backend_state_file: Path | None = None,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    tasks = load_tasks(todo_file)
    task = set_task_status(tasks, task_id, "done")
    save_tasks(tasks, todo_file)

    state = read_state(state_file)
    state.setdefault("claims", {}).pop(task_id, None)
    record_history(state, "complete", task_id, worker, note)
    save_state(state, state_file)
    if backend_state_file is not None:
        sync_backend_mirror(load_tasks(todo_file), backend_state_file, repo_root)
    return task


def fail_task(
    task_id: str,
    worker: str,
    note: str | None = None,
    blocked: bool = False,
    todo_file: Path = DEFAULT_TODO_FILE,
    state_file: Path = DEFAULT_STATE_FILE,
    backend_state_file: Path | None = None,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    tasks = load_tasks(todo_file)
    task = set_task_status(tasks, task_id, "blocked" if blocked else "failed")
    save_tasks(tasks, todo_file)

    state = read_state(state_file)
    state.setdefault("claims", {}).pop(task_id, None)
    record_history(state, "block" if blocked else "fail", task_id, worker, note)
    save_state(state, state_file)
    if backend_state_file is not None:
        sync_backend_mirror(load_tasks(todo_file), backend_state_file, repo_root)
    return task


def render_task_prompt(task: dict[str, Any], repo_root: Path = REPO_ROOT) -> str:
    deps = ", ".join(task["dependencies"]) if task["dependencies"] else "none"
    target_files = "\n".join(f"- {path}" for path in task["target_files"]) or "- n/a"
    validation = "\n".join(f"- `{command}`" for command in task["validation"]) or "- n/a"
    done_criteria = "\n".join(f"- {criterion}" for criterion in task["done_criteria"])

    return "\n".join(
        [
            "You are working on the SwissKnife MCP++ UI/UX automation queue.",
            f"Repository: {repo_root}",
            "",
            f"Task: {task['id']} - {task['title']}",
            f"Phase: {task['phase']}",
            f"Priority: {task['priority']}",
            f"Dependencies: {deps}",
            "",
            "Task brief:",
            task["prompt"],
            "",
            "Target files or areas:",
            target_files,
            "",
            "Done criteria:",
            done_criteria,
            "",
            "Validation commands to run when relevant:",
            validation,
            "",
            "Keep changes scoped to this task, do not revert unrelated user changes, and update the queue only for this task when complete.",
        ]
    )


def status_summary(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {status: 0 for status in sorted(VALID_STATUSES)}
    for task in tasks:
        counts[task["status"]] += 1

    next_task = select_next_task(tasks)
    blocked = {
        task["id"]: blocked_dependencies(task, tasks)
        for task in tasks
        if task["status"] == "pending" and blocked_dependencies(task, tasks)
    }

    return {
        "total": len(tasks),
        "counts": counts,
        "next": next_task["id"] if next_task else None,
        "blocked_pending": blocked,
    }


def describe_task(task: dict[str, Any]) -> str:
    return f"{task['id']} [{task['priority']}/{task['status']}] {task['title']}"


def print_status(tasks: list[dict[str, Any]], todo_file: Path) -> None:
    summary = status_summary(tasks)
    counts = summary["counts"]
    print(f"Queue: {todo_file}")
    print(
        "Tasks: "
        f"{summary['total']} total, "
        f"{counts['done']} done, "
        f"{counts['pending']} pending, "
        f"{counts['in_progress']} in_progress, "
        f"{counts['blocked']} blocked, "
        f"{counts['failed']} failed"
    )

    next_task = select_next_task(tasks)
    if next_task:
        print(f"Next: {describe_task(next_task)}")
    else:
        print("Next: none")


def build_codex_command(args: argparse.Namespace) -> list[str]:
    cmd = [args.codex_bin, "exec", "--cd", str(args.repo_root)]
    if args.model:
        cmd.extend(["--model", args.model])
    if args.profile:
        cmd.extend(["--profile", args.profile])
    if args.dangerous_bypass:
        cmd.append("--dangerously-bypass-approvals-and-sandbox")
    elif args.full_auto:
        cmd.append("--full-auto")
    for extra in args.codex_arg:
        cmd.append(extra)
    cmd.append("-")
    return cmd


def cmd_status(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.todo_file)
    if args.json:
        print(json.dumps(status_summary(tasks), indent=2))
    else:
        print_status(tasks, args.todo_file)
    return 0


def cmd_next(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.todo_file)
    task = select_next_task(tasks, include_failed=args.include_failed)
    if args.json:
        print(json.dumps(task, indent=2))
    elif task:
        print(describe_task(task))
        blockers = blocked_dependencies(task, tasks)
        if blockers:
            print(f"Blocked by: {', '.join(blockers)}")
    else:
        print("No dependency-ready pending tasks.")
    return 0


def cmd_prompt(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.todo_file)
    if args.next:
        task = select_next_task(tasks)
        if task is None:
            print("No dependency-ready pending tasks.", file=sys.stderr)
            return 1
    elif args.task_id:
        task = find_task(tasks, args.task_id)
    else:
        print("Provide a task id or --next.", file=sys.stderr)
        return 1

    print(render_task_prompt(task, args.repo_root))
    return 0


def cmd_claim(args: argparse.Namespace) -> int:
    task = claim_task(
        args.task_id,
        args.worker,
        args.todo_file,
        args.state_file,
        None if args.disable_backend_sync else args.backend_state_file,
        args.repo_root,
    )
    print(f"Claimed {describe_task(task)} for {args.worker}")
    return 0


def cmd_complete(args: argparse.Namespace) -> int:
    task = complete_task(
        args.task_id,
        args.worker,
        args.note,
        args.todo_file,
        args.state_file,
        None if args.disable_backend_sync else args.backend_state_file,
        args.repo_root,
    )
    print(f"Completed {describe_task(task)}")
    return 0


def cmd_fail(args: argparse.Namespace) -> int:
    task = fail_task(
        args.task_id,
        args.worker,
        args.note,
        args.blocked,
        args.todo_file,
        args.state_file,
        None if args.disable_backend_sync else args.backend_state_file,
        args.repo_root,
    )
    print(f"Updated {describe_task(task)}")
    return 0


def cmd_set_status(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.todo_file)
    task = set_task_status(tasks, args.task_id, args.status)
    save_tasks(tasks, args.todo_file)

    state = read_state(args.state_file)
    record_history(state, f"set-{args.status}", args.task_id, args.worker, args.note)
    if args.status in {"done", "failed", "blocked"}:
        state.setdefault("claims", {}).pop(args.task_id, None)
    save_state(state, args.state_file)
    if not args.disable_backend_sync:
        sync_backend_mirror(load_tasks(args.todo_file), args.backend_state_file, args.repo_root)

    print(f"Updated {describe_task(task)}")
    return 0


def cmd_backend_status(args: argparse.Namespace) -> int:
    backend = detect_ipfs_datasets_backend(args.repo_root)
    if args.json:
        print(json.dumps(backend, indent=2))
    else:
        status = "available" if backend["available"] else "unavailable"
        print(f"ipfs_datasets_py backend: {status} ({backend['mode']})")
        print(f"Reason: {backend['reason']}")
    return 0


def cmd_backend_sync(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.todo_file)
    state = sync_backend_mirror(tasks, args.backend_state_file, args.repo_root)
    if args.json:
        print(json.dumps(state, indent=2))
    else:
        print(f"Mirrored {len(state['tasks'])} tasks to {args.backend_state_file}")
        print(f"Backend: {state['backend']['mode']} available={state['backend']['available']}")
    return 0


def cmd_run_once(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.todo_file)
    task = select_next_task(tasks, include_failed=args.include_failed)
    if task is None:
        print("No dependency-ready pending tasks.")
        return 0

    prompt = render_task_prompt(task, args.repo_root)
    cmd = build_codex_command(args)

    if not args.execute:
        print(f"Dry run: next task is {describe_task(task)}")
        print("Codex command:")
        print(" ".join(shlex.quote(part) for part in cmd))
        print("")
        print(prompt)
        return 0

    backend_state_file = None if args.disable_backend_sync else args.backend_state_file
    claimed = claim_task(task["id"], args.worker, args.todo_file, args.state_file, backend_state_file, args.repo_root)
    print(f"Running {describe_task(claimed)} with codex exec")
    result = subprocess.run(cmd, input=prompt, text=True, cwd=args.repo_root)

    if result.returncode == 0:
        complete_task(
            claimed["id"],
            args.worker,
            "codex exec returned 0",
            args.todo_file,
            args.state_file,
            backend_state_file,
            args.repo_root,
        )
    else:
        fail_task(
            claimed["id"],
            args.worker,
            f"codex exec returned {result.returncode}",
            False,
            args.todo_file,
            args.state_file,
            backend_state_file,
            args.repo_root,
        )

    return result.returncode


def cmd_daemon(args: argparse.Namespace) -> int:
    max_iterations = args.max_iterations
    if not args.execute and max_iterations == 0:
        max_iterations = 1

    iteration = 0
    while True:
        tasks = load_tasks(args.todo_file)
        if select_next_task(tasks, include_failed=args.include_failed) is None:
            print("No dependency-ready pending tasks.")
            return 0

        rc = cmd_run_once(args)
        iteration += 1
        if rc != 0 and not args.continue_on_error:
            return rc
        if max_iterations and iteration >= max_iterations:
            return rc
        time.sleep(args.interval)


def add_codex_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--execute", action="store_true", help="invoke codex exec; default is dry-run")
    parser.add_argument("--include-failed", action="store_true", help="allow failed tasks to be retried")
    parser.add_argument("--worker", default="codex", help="worker name recorded in local state")
    parser.add_argument("--codex-bin", default="codex", help="codex executable")
    parser.add_argument("--model", help="optional codex model override")
    parser.add_argument("--profile", help="optional codex config profile")
    parser.add_argument("--full-auto", dest="full_auto", action="store_true", default=True)
    parser.add_argument("--no-full-auto", dest="full_auto", action="store_false")
    parser.add_argument(
        "--dangerous-bypass",
        action="store_true",
        help="pass --dangerously-bypass-approvals-and-sandbox to codex exec",
    )
    parser.add_argument(
        "--codex-arg",
        action="append",
        default=[],
        help="extra single argument passed to codex exec before the prompt marker",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage the SwissKnife MCP++ automation queue.")
    parser.add_argument("--todo-file", type=Path, default=DEFAULT_TODO_FILE)
    parser.add_argument("--state-file", type=Path, default=DEFAULT_STATE_FILE)
    parser.add_argument("--backend-state-file", type=Path, default=DEFAULT_BACKEND_STATE_FILE)
    parser.add_argument("--disable-backend-sync", action="store_true")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)

    subcommands = parser.add_subparsers(dest="command", required=True)

    status = subcommands.add_parser("status", help="show queue status")
    status.add_argument("--json", action="store_true")
    status.set_defaults(func=cmd_status)

    next_task = subcommands.add_parser("next", help="show the next dependency-ready task")
    next_task.add_argument("--json", action="store_true")
    next_task.add_argument("--include-failed", action="store_true")
    next_task.set_defaults(func=cmd_next)

    prompt = subcommands.add_parser("prompt", help="render a Codex prompt for a task")
    prompt.add_argument("task_id", nargs="?")
    prompt.add_argument("--next", action="store_true")
    prompt.set_defaults(func=cmd_prompt)

    claim = subcommands.add_parser("claim", help="claim a task")
    claim.add_argument("task_id", nargs="?")
    claim.add_argument("--worker", default="codex")
    claim.set_defaults(func=cmd_claim)

    complete = subcommands.add_parser("complete", help="mark a task complete")
    complete.add_argument("task_id")
    complete.add_argument("--worker", default="codex")
    complete.add_argument("--note")
    complete.set_defaults(func=cmd_complete)

    fail = subcommands.add_parser("fail", help="mark a task failed or blocked")
    fail.add_argument("task_id")
    fail.add_argument("--worker", default="codex")
    fail.add_argument("--note")
    fail.add_argument("--blocked", action="store_true")
    fail.set_defaults(func=cmd_fail)

    set_status = subcommands.add_parser("set-status", help="set a task status directly")
    set_status.add_argument("task_id")
    set_status.add_argument("status", choices=sorted(VALID_STATUSES))
    set_status.add_argument("--worker", default="codex")
    set_status.add_argument("--note")
    set_status.set_defaults(func=cmd_set_status)

    backend_status = subcommands.add_parser("backend-status", help="show optional ipfs_datasets_py task queue backend status")
    backend_status.add_argument("--json", action="store_true")
    backend_status.set_defaults(func=cmd_backend_status)

    backend_sync = subcommands.add_parser("backend-sync", help="mirror markdown queue into the optional backend state file")
    backend_sync.add_argument("--json", action="store_true")
    backend_sync.set_defaults(func=cmd_backend_sync)

    run_once = subcommands.add_parser("run-once", help="run one queue item or print the planned run")
    add_codex_options(run_once)
    run_once.set_defaults(func=cmd_run_once)

    daemon = subcommands.add_parser("daemon", help="loop over dependency-ready queue items")
    add_codex_options(daemon)
    daemon.add_argument("--interval", type=float, default=60.0, help="seconds between iterations")
    daemon.add_argument("--max-iterations", type=int, default=0, help="0 means unlimited when --execute is set")
    daemon.add_argument("--continue-on-error", action="store_true")
    daemon.set_defaults(func=cmd_daemon)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.todo_file = args.todo_file.resolve()
    args.state_file = args.state_file.resolve()
    args.backend_state_file = args.backend_state_file.resolve()
    args.repo_root = args.repo_root.resolve()

    try:
        return int(args.func(args))
    except QueueError as exc:
        print(f"todo_daemon: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
