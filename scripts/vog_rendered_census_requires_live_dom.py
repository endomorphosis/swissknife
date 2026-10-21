#!/usr/bin/env python3
"""Exit 0 only for a rendered-control census that did not copy source templates."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPORT = Path("swissknife/test-results/virtual-desktop-ipfs-mcp-orb/vog/rendered-control-census.json")


def fail(message: str) -> int:
    print(message)
    return 1


def main() -> int:
    if not REPORT.is_file() or REPORT.stat().st_size < 128:
        return fail("rendered census missing")
    try:
        payload = json.loads(REPORT.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return fail(f"rendered census unreadable {exc}")
    if payload.get("schema") != "swissknife.rendered-control-census.v1":
        return fail("rendered census schema")
    if payload.get("source_template") is not False or payload.get("clicked") is not False:
        return fail("rendered census must be a live DOM census and must not click")
    rows = payload.get("rows") or []
    apps = {row.get("app_id") for row in rows}
    if len(apps) < 45 or len(rows) < 45:
        return fail(f"rendered census short apps={len(apps)} rows={len(rows)}")
    for row in rows:
        selector = str(row.get("selector") or "")
        if not selector or "${" in selector or "escapeHTML" in selector:
            return fail(f"template selector {row.get('app_id')} {selector}")
        if not row.get("launch_id") or not row.get("role"):
            return fail(f"census row incomplete {row.get('app_id')}")
    print(f"rendered census ok apps={len(apps)} rows={len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
