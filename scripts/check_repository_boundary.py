#!/usr/bin/env python3
"""Fail CI when unrelated project assets enter the Night42 repository."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / ".github" / "project-boundary.json"


def tracked_files() -> list[str]:
    raw = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    )
    return [p.decode("utf-8") for p in raw.split(b"\0") if p]


def main() -> int:
    policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    files = tracked_files()
    errors: list[str] = []

    allowed_top = set(policy["allowed_top_level"])
    actual_top = {path.split("/", 1)[0] for path in files}
    unexpected_top = sorted(actual_top - allowed_top)
    if unexpected_top:
        errors.append(
            "Unapproved top-level entries: " + ", ".join(unexpected_top)
        )

    workflow_prefix = ".github/workflows/"
    workflows = sorted(
        Path(path).name
        for path in files
        if path.startswith(workflow_prefix)
        and path.lower().endswith((".yml", ".yaml"))
    )
    allowed_workflows = set(policy["allowed_workflows"])
    unexpected_workflows = sorted(set(workflows) - allowed_workflows)
    if unexpected_workflows:
        errors.append(
            "Unapproved GitHub Actions workflows: "
            + ", ".join(unexpected_workflows)
        )

    missing_workflows = sorted(
        set(policy.get("required_workflows", [])) - set(workflows)
    )
    if missing_workflows:
        errors.append(
            "Required workflows missing: " + ", ".join(missing_workflows)
        )

    path_patterns = [
        re.compile(pattern) for pattern in policy.get("forbidden_path_regex", [])
    ]
    for path in files:
        if any(pattern.search(path) for pattern in path_patterns):
            errors.append(f"Foreign-project path detected: {path}")

    exclusions = set(policy.get("scan_exclusions", []))
    content_patterns = [
        re.compile(pattern)
        for pattern in policy.get("forbidden_content_regex", [])
    ]
    max_bytes = int(policy.get("max_scan_bytes", 1_000_000))

    for rel in files:
        if rel in exclusions:
            continue
        path = ROOT / rel
        try:
            if not path.is_file() or path.stat().st_size > max_bytes:
                continue
            data = path.read_bytes()
            if b"\0" in data:
                continue
            text = data.decode("utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        for pattern in content_patterns:
            if pattern.search(text):
                errors.append(
                    f"Foreign-project signature {pattern.pattern!r} detected in {rel}"
                )
                break

    if errors:
        print("REPOSITORY BOUNDARY VIOLATION", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print(
            "\nNight42 accepts only Interactive Novel / Night-for-Two assets. "
            "Move unrelated project material to its own repository. "
            "If a legitimate Night42 structural change is required, update "
            ".github/project-boundary.json intentionally in the same PR.",
            file=sys.stderr,
        )
        return 1

    print(
        f"Repository boundary OK: {policy['project_id']} | "
        f"{len(files)} tracked files | {len(workflows)} workflows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
