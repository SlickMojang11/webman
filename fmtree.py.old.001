"""
fmtree.py  —  WebMan file tree generator
Scans the repo and writes files.json consumed by index.html.

Excluded at root level:  system files that should never appear in the UI.
Excluded everywhere:     hidden dirs/files (starting with .), __pycache__, node_modules, .github.
The waiting-list/ folder IS included so admins can see pending files in the UI.
"""

import os
import json

# Files excluded when they appear at the repository root level
EXCLUDED_ROOT_FILES = {
    "files.json",
    "fmtree.py",
    "index.html",
    "favicon.png",
    "manifest.json",
    "service-worker.js",
    "offline.html",
    "offline.png",
    "admins.json",
}

# Folder names excluded at every depth level
EXCLUDED_DIRS = {
    ".github",
    "__pycache__",
    "node_modules",
    ".git",
}


def build_tree(path: str, rel_path: str = "") -> list:
    entries = []
    try:
        names = sorted(os.listdir(path))
    except PermissionError:
        return entries

    for name in names:
        if name.startswith("."):
            continue                        # skip all hidden items
        if name in EXCLUDED_DIRS:
            continue

        full_path = os.path.join(path, name)
        rel_file_path = os.path.join(rel_path, name).replace("\\", "/")

        if os.path.isdir(full_path):
            children = build_tree(full_path, rel_file_path)
            entries.append({
                "type": "folder",
                "name": name,
                "path": rel_file_path,
                "children": children,
            })
        else:
            # Skip root-level system files
            if rel_path == "" and name in EXCLUDED_ROOT_FILES:
                continue
            entries.append({
                "type": "file",
                "name": name,
                "path": rel_file_path,
            })

    return entries


def count_files(node: dict) -> int:
    if node.get("type") == "file":
        return 1
    return sum(count_files(child) for child in node.get("children", []))


if __name__ == "__main__":
    root_dir = "."
    tree = {
        "type": "folder",
        "name": os.path.basename(os.path.abspath(root_dir)),
        "path": "",
        "children": build_tree(root_dir),
    }
    output_path = os.path.join(root_dir, "files.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(tree, f, indent=2)
    total = count_files(tree)
    print(f"✓ files.json generated — {total} file(s) indexed.")
