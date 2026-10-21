#!/usr/bin/env python3
"""Exit 0 only for a GO ORB/IDL GUI report. Exit 75 withholds closeout.

Does not read or write the VDG coverage file. An untested supervisor repair
packet also withholds closeout.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPORT = Path("swissknife/test-results/virtual-desktop-ipfs-mcp-orb/vog/orb-idl-gui-coverage.json")
REPAIR_DIR = Path("data/agent_supervisor/virtual_desktop_orb_idl_gui/unstall-repair")
WATCHDOG_TEST = Path(
    "external/ipfs_accelerate/test/api/test_agent_supervisor_supervisor_watchdog.py"
)
TARGETS = (
    ("pilot", "pilot/image-viewer.json", "pilot"),
    ("storage", "storage.json", "family"),
    ("datasets", "datasets.json", "family"),
    ("accelerate", "accelerate.json", "family"),
    ("network", "network.json", "family"),
    ("control", "control.json", "family"),
    ("local", "local.json", "local"),
)
OBSERVATION_GATE = Path(__file__).with_name("vog_live_click_requires_observation.py").resolve()


def validate_evidence(payload: dict) -> str | None:
    """Join every aggregate target to current, independently validated evidence."""

    summaries = payload.get("targets")
    if not isinstance(summaries, list) or len(summaries) != len(TARGETS):
        return "aggregate must contain exactly seven targets"
    by_target = {}
    for summary in summaries:
        if not isinstance(summary, dict) or not isinstance(summary.get("target"), str):
            return "aggregate target malformed"
        name = summary["target"]
        if name in by_target:
            return f"duplicate aggregate target={name}"
        by_target[name] = summary
    if set(by_target) != {name for name, _, _ in TARGETS}:
        return "aggregate target identities differ from required inputs"
    evidence = REPORT.parent.parent / "live-clicks"
    for name, relative, kind in TARGETS:
        report_path = evidence / relative
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            return f"target={name} report unreadable: {exc}"
        if not isinstance(report, dict) or report.get("target") != name:
            return f"target={name} report identity invalid"
        rows = report.get("rows")
        count = report.get("row_count")
        if (
            not isinstance(rows, list)
            or not all(isinstance(row, dict) for row in rows)
            or type(count) is not int
            or count != len(rows)
        ):
            return f"target={name} report row count invalid"
        summary = by_target[name]
        if type(summary.get("row_count")) is not int or summary["row_count"] != count:
            return f"target={name} aggregate row count differs from input"
        for key, expected in (("decision", "GO"), ("clicked", True), ("passed", True)):
            if report.get(key) != expected or type(report.get(key)) is not type(expected):
                return f"target={name} input {key} invalid"
            if summary.get(key) != expected or type(summary.get(key)) is not type(expected):
                return f"target={name} aggregate {key} differs from input"
        try:
            result = subprocess.run(
                [sys.executable, str(OBSERVATION_GATE), str(report_path.resolve()), kind],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return f"target={name} observation validation unavailable: {exc}"
        if result.returncode:
            reason = result.stdout.strip() or result.stderr.strip()
            return f"target={name} observation validation failed: {reason}"
    return None


def withhold(message: str) -> int:
    print(message)
    return 75


def main() -> int:
    if not REPORT.is_file():
        return withhold("closeout withheld report=missing")
    try:
        payload = json.loads(REPORT.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"coverage report unreadable: {exc}")
        return 1
    if not isinstance(payload, dict):
        return withhold("closeout withheld aggregate malformed")
    if (
        payload.get("decision") != "GO"
        or payload.get("passed") is not True
        or payload.get("clicked") is not True
    ):
        return withhold(
            "closeout withheld "
            f"decision={payload.get('decision')} "
            f"passed={payload.get('passed')} clicked={payload.get('clicked')}"
        )
    reason = validate_evidence(payload)
    if reason:
        return withhold(f"closeout withheld {reason}")
    test_text = WATCHDOG_TEST.read_text(encoding="utf-8") if WATCHDOG_TEST.is_file() else ""
    if REPAIR_DIR.is_dir():
        for packet_path in sorted(REPAIR_DIR.glob("*.json")):
            try:
                packet = json.loads(packet_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                print(f"repair packet unreadable: {exc}")
                return 1
            handler = str(packet.get("missing_handler") or "")
            if packet.get("body_free") is True and handler and handler not in test_text:
                return withhold(f"closeout withheld untested_handler={handler}")
    print("closeout allowed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
