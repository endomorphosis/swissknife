#!/usr/bin/env python3
"""Exit 0 only when a live-click report proves GUI-originated MCP++ calls."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROUTE = "/mcp/tools/call"
ZERO_CALL = {"local-only", "external-provider", "unsupported"}
OWNER_OUTCOMES = {"executed", "unsupported", "failed", "denied", "unreachable"}
FAIL_OUTCOMES = {"unsupported", "failed", "unreachable"}


def fail(message: str) -> int:
    print(message)
    return 1


def observation_complete(observation: object) -> bool:
    if not isinstance(observation, dict):
        return False
    required = (
        "tool_id",
        "transport",
        "correlation_id",
        "policy_outcome",
        "receipt_id",
        "event_dag_cid",
    )
    return observation.get("route") == ROUTE and all(str(observation.get(key) or "") for key in required)


def owner_execution_ok(row: object) -> bool:
    """An invoke or unlisted row passes only when the owner outcome is executed.

    A receipt id with outcome unreachable, unsupported, or failed is not execution.
    dry_run stays required outside mcp-control.
    """

    if not isinstance(row, dict):
        return False
    disposition = row.get("disposition")
    observation = row.get("observation")
    if not isinstance(observation, dict):
        return disposition not in {"invoke", "unlisted"}
    outcome = str(observation.get("outcome") or "")
    if outcome and outcome not in OWNER_OUTCOMES:
        return False
    if disposition in {"invoke", "unlisted"}:
        if outcome != "executed":
            return False
        if row.get("app_id") != "mcp-control" and observation.get("dry_run") is not True:
            return False
        return True
    if outcome in FAIL_OUTCOMES:
        return False
    return True


def main() -> int:
    if len(sys.argv) != 3:
        return fail("usage: vog_live_click_requires_observation.py <report.json> <pilot|family|local>")
    report_path = Path(sys.argv[1])
    kind = sys.argv[2]
    if kind not in {"pilot", "family", "local"}:
        return fail(f"unknown kind {kind}")
    if not report_path.is_file():
        return fail(f"report missing {report_path}")
    try:
        payload = json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return fail(f"report unreadable {exc}")
    rows = payload.get("rows") or []
    if payload.get("clicked") is not True or payload.get("decision") != "GO":
        return fail(
            f"click report withheld clicked={payload.get('clicked')} decision={payload.get('decision')}"
        )
    if payload.get("owner_health") != "up":
        return fail(f"owner health down {payload.get('owner_health')}")
    if not rows:
        return fail("click report has no rows")
    invoke_like = 0
    for row in rows:
        selector = row.get("selector")
        if row.get("clicked") is not True:
            return fail(f"row not clicked {selector}")
        before = Path(str(row.get("screenshot_before") or ""))
        after = Path(str(row.get("screenshot_after") or ""))
        if not before.is_file() or before.stat().st_size < 128:
            return fail(f"screenshot missing {selector}")
        if row.get("screenshot_after_check") != "window-dismissed":
            if not after.is_file() or after.stat().st_size < 128:
                return fail(f"screenshot missing {selector}")
        disposition = row.get("disposition")
        calls = int(row.get("mcp_call_count") or 0)
        if disposition in ZERO_CALL:
            if calls != 0:
                return fail(f"non-invoke row called MCP++ {selector}")
        elif disposition in {"invoke", "deny"}:
            invoke_like += 1
            if calls < 1 or not observation_complete(row.get("observation")):
                return fail(f"invoke row missing observation {selector}")
        elif disposition == "unlisted":
            # A gateway button the census did not list still has to show a
            # complete POST /mcp/tools/call. A click with no observation fails.
            invoke_like += 1
            if calls < 1 or not observation_complete(row.get("observation")):
                return fail(f"unlisted row missing observation {selector}")
        elif disposition == "confirm-then-invoke":
            invoke_like += 1
            if calls:
                if not observation_complete(row.get("observation")):
                    return fail(f"confirm row missing observation {selector}")
            elif row.get("confirm_surface") is not True:
                return fail(f"confirm row missing surface {selector}")
        else:
            return fail(f"unknown disposition {disposition}")
        if not owner_execution_ok(row):
            outcome = ""
            observation = row.get("observation")
            if isinstance(observation, dict):
                outcome = str(observation.get("outcome") or "")
            return fail(f"owner outcome not executed {selector} {outcome}".rstrip())
    if kind == "pilot" and invoke_like < 1:
        return fail("pilot report has no invoke row")
    if kind == "local" and invoke_like:
        return fail("local report contains an invoke row")
    print(f"live-click observation ok kind={kind} rows={len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
