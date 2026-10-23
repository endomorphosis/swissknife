#!/usr/bin/env python3
"""Exit 0 only when the live-click coverage report says GO. A NO_GO report stays pending."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    report = Path("swissknife/test-results/virtual-desktop-ipfs-mcp-orb/live-click-coverage.json")
    if not report.is_file():
        print("live-click coverage report missing")
        return 1
    try:
        payload = json.loads(report.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"live-click coverage report unreadable: {exc}")
        return 1
    decision = payload.get("decision")
    passed = payload.get("passed")
    clicked = payload.get("clicked")
    if decision != "GO" or passed is not True or clicked is not True:
        print(f"closeout withheld decision={decision} passed={passed} clicked={clicked}")
        return 75
    print("closeout allowed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
