#!/usr/bin/env python3
"""Verify every model name referenced in C# has a matching FBX on disk.

Missing art fails silently at runtime (ArtLibrary substitutes a magenta cube),
so this catches a rename or a forgotten export before the project is opened.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "StarfallUnity", "Assets", "Resources", "Art")
SRC = os.path.join(ROOT, "StarfallUnity", "Assets", "Scripts")

available = set()
for folder, _, files in os.walk(ART):
    for f in files:
        if f.endswith(".fbx"):
            available.add(os.path.splitext(f)[0])

referenced = set()
pattern = re.compile(r'"((?:WPN|ENM|PC|PROP)_[A-Za-z0-9_]+)"')
for folder, _, files in os.walk(SRC):
    for f in files:
        if not f.endswith(".cs"):
            continue
        with open(os.path.join(folder, f), encoding="utf-8") as fh:
            for name in pattern.findall(fh.read()):
                referenced.add(name)

missing = sorted(referenced - available)
unused = sorted(available - referenced)

print("art assets on disk : %d" % len(available))
print("referenced in code : %d" % len(referenced))
for name in unused:
    print("  note: %s is exported but never referenced" % name)
for name in missing:
    print("  MISSING: %s is referenced but has no FBX" % name)

sys.exit(1 if missing else 0)
