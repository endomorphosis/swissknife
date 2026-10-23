#!/usr/bin/env python3
"""Exit 0 only when the coverage report says GO. A NO_GO report stays pending."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    report = Path("swissknife/test-results/virtual-desktop-ipfs-mcp-orb/gui-mcp-coverage.json")
    if not report.is_file():
        print("coverage report missing")
        return 1
    try:
        payload = json.loads(report.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"coverage report unreadable: {exc}")
        return 1
    decision = payload.get("decision")
    if decision != "GO" or payload.get("passed") is not True:
        print(f"closeout withheld decision={decision} passed={payload.get('passed')}")
        return 75
    print("closeout allowed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
