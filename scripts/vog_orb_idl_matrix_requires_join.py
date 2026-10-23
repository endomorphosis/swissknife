#!/usr/bin/env python3
"""Exit 0 only when every rendered control has one ORB/IDL disposition."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPORT = Path("swissknife/test-results/virtual-desktop-ipfs-mcp-orb/vog/orb-idl-control-matrix.json")
DISPOSITIONS = {
    "invoke",
    "confirm-then-invoke",
    "deny",
    "local-only",
    "external-provider",
    "unsupported",
}
IDL_METHODS = {
    "read_status",
    "read_receipts",
    "request_action",
    "request_fallback",
    "request_prompt_steering",
    "none",
}


def fail(message: str) -> int:
    print(message)
    return 1


def main() -> int:
    if not REPORT.is_file() or REPORT.stat().st_size < 128:
        return fail("orb idl matrix missing")
    try:
        payload = json.loads(REPORT.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return fail(f"orb idl matrix unreadable {exc}")
    rows = payload.get("rows") or []
    if payload.get("schema") != "swissknife.orb-idl-control-matrix.v1" or not rows:
        return fail("orb idl matrix schema")
    if int(payload.get("uncovered_app_visible_count") or 0) != 0:
        return fail("app-visible tools remain uncovered")
    seen = set()
    for row in rows:
        key = (row.get("app_id"), row.get("selector"))
        if key in seen:
            return fail(f"duplicate control {key}")
        seen.add(key)
        if row.get("disposition") not in DISPOSITIONS:
            return fail(f"bad disposition {key}")
        if row.get("idl_method") not in IDL_METHODS:
            return fail(f"bad idl method {key}")
        if row.get("disposition") in {"invoke", "confirm-then-invoke", "deny"}:
            if not str(row.get("tool_id") or "").startswith("mcp++"):
                return fail(f"invoke row missing mcp++ tool id {key}")
            if row.get("idl_method") == "none":
                return fail(f"invoke row missing idl method {key}")
        selector = str(row.get("selector") or "")
        if "data-live-gateway-binding=" in selector:
            if row.get("disposition") not in {"invoke", "confirm-then-invoke", "deny"}:
                return fail(f"binding selector is not invoke {key}")
            if not str(row.get("tool_id") or "").startswith("mcp++"):
                return fail(f"binding selector missing mcp++ tool id {key}")
            if row.get("idl_method") == "none":
                return fail(f"binding selector missing idl method {key}")
    print(f"orb idl matrix ok rows={len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
