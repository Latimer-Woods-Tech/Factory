#!/usr/bin/env python3
"""
Update FUNCTIONS_MATRIX.md files to add the sentry_project column.
The new column is inserted after the Endpoint/Component column.
"""
from __future__ import annotations

import re
from pathlib import Path

REPO_PROJECTS = {
    "HumanDesign": "selfprime",
    "capricast": "capricast",
    "Factory": "factory-admin-studio",
    "coh": "coh",
    "xico-city": "xico-city",
}

MATRICES = [
    ("Latimer-Woods-Tech/HumanDesign", "docs/FUNCTIONS_MATRIX.md", "selfprime"),
    ("Latimer-Woods-Tech/capricast", "docs/FUNCTIONS_MATRIX.md", "capricast"),
    ("Latimer-Woods-Tech/Factory", "apps/admin-studio/docs/FUNCTIONS_MATRIX.md", "factory-admin-studio"),
    ("Latimer-Woods-Tech/coh", "docs/FUNCTIONS_MATRIX.md", "coh"),
    ("Latimer-Woods-Tech/xico-city", "docs/FUNCTIONS_MATRIX.md", "xico-city"),
]

def update_matrix_file(file_path: Path, sentry_project: str) -> bool:
    """Update a FUNCTIONS_MATRIX.md file to add sentry_project column."""
    if not file_path.exists():
        print(f"[warning] {file_path} not found")
        return False

    content = file_path.read_text(encoding="utf-8")
    lines = content.split("\n")
    updated_lines = []
    in_table = False
    header_row_idx = None

    for i, line in enumerate(lines):
        # Check if this is a table header row
        if line.startswith("|") and "ID" in line and "Feature" in line and "Endpoint" in line:
            # This is a header row — insert the Sentry Project column after Endpoint/Component
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) == 11:  # Old format with 11 columns
                # Insert sentry_project after Endpoint (index 2)
                parts.insert(3, "Sentry Project")
                updated_line = "|" + "|".join(parts) + "|"
                updated_lines.append(updated_line)
                in_table = True
                header_row_idx = i
                continue
            elif len(parts) == 12:  # Already updated
                updated_lines.append(line)
                in_table = True
                continue

        # Check if this is a separator row
        if line.startswith("|---") or line.startswith("| ---"):
            if in_table and header_row_idx is not None:
                # Count dashes to match new column count
                parts = [p.strip() for p in line.split("|")[1:-1]]
                if len(parts) == 11:
                    # Insert separator for sentry_project column
                    parts.insert(3, "---")
                    updated_line = "|" + "|".join(parts) + "|"
                    updated_lines.append(updated_line)
                    continue
                elif len(parts) == 12:
                    updated_lines.append(line)
                    continue

        # Check if this is a data row (starts with | and contains ID pattern)
        if line.startswith("|") and in_table:
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) == 11 and parts[0] and re.match(r"^[A-Z]+-[A-Z]+-\d+", parts[0]):
                # This is a data row — insert sentry_project after Endpoint (index 2)
                parts.insert(3, sentry_project)
                updated_line = "|" + "|".join(parts) + "|"
                updated_lines.append(updated_line)
                continue
            elif len(parts) == 12:
                # Already updated
                updated_lines.append(line)
                continue

        # Not a special row
        if not line.startswith("|"):
            in_table = False
        updated_lines.append(line)

    updated_content = "\n".join(updated_lines)
    file_path.write_text(updated_content, encoding="utf-8")
    return True


def main():
    """Update all FUNCTIONS_MATRIX.md files."""
    github_root = Path("c:/Users/Ultimate Warrior/Documents/GitHub")
    updated = 0
    skipped = 0

    for repo_org, matrix_path, project in MATRICES:
        repo_name = repo_org.split("/")[1]
        file_path = github_root / repo_name / matrix_path
        print(f"Updating {repo_name}... ", end="", flush=True)

        if update_matrix_file(file_path, project):
            print("done")
            updated += 1
        else:
            print("skipped")
            skipped += 1

    print(f"Done: {updated} updated, {skipped} skipped")


if __name__ == "__main__":
    main()
