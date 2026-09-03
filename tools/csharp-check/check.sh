#!/usr/bin/env bash
# Compile-check the Unity C# sources against hand-written UnityEngine stubs.
#
# Unity is not installable in this environment, so this is how we catch typos,
# bad signatures and type errors before the project is ever opened in the editor.
# A member missing from the stubs is itself a finding: it means we used an API we
# have not deliberately verified.
#
# Mono's mcs implements up to C# 7.0. Unity 6 allows C# 9, but staying inside 7.0
# is what keeps this check meaningful, so avoid `in` parameters, records, target-
# typed new, and switch expressions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${TMPDIR:-/tmp}/starfall-check"
mkdir -p "$OUT"

echo "· building UnityEngine stubs"
mcs -target:library -nowarn:0067,0169,0414,0649 -out:"$OUT/UnityEngine.dll" \
  "$ROOT/tools/csharp-check/stubs/UnityEngine.cs"

CORE=$(find "$ROOT/StarfallUnity/Assets/Scripts/Core" -name '*.cs' 2>/dev/null | sort)
GAME=$(find "$ROOT/StarfallUnity/Assets/Scripts/Game" -name '*.cs' 2>/dev/null | sort)

if [ -n "$CORE" ]; then
  echo "· compiling Core (engine-agnostic, $(echo "$CORE" | wc -l) files)"
  mcs -target:library -nowarn:0169,0414,0649 -out:"$OUT/Starfall.Core.dll" $CORE
fi

if [ -n "$GAME" ]; then
  echo "· compiling Game against stubs ($(echo "$GAME" | wc -l) files)"
  mcs -target:library -nowarn:0169,0414,0649 -r:"$OUT/UnityEngine.dll" \
    ${CORE:+-r:"$OUT/Starfall.Core.dll"} -out:"$OUT/Starfall.Game.dll" $GAME
fi
echo "✓ all sources compile"

# --- known stub-accuracy traps, learned the hard way -------------------------
# A stub that puts a type in the wrong namespace lets a genuine error compile.
# These greps assert the qualified spellings the real API requires.
fail=0
if grep -rn "RenderSettings.ambientMode = AmbientMode" "$ROOT/StarfallUnity/Assets/Scripts" >/dev/null 2>&1; then
  echo "✗ AmbientMode must be qualified: UnityEngine.Rendering.AmbientMode"; fail=1
fi
if grep -rn "FindObjectOfType\|FindObjectsOfType" "$ROOT/StarfallUnity/Assets/Scripts" >/dev/null 2>&1; then
  echo "✗ FindObjectOfType is obsolete in Unity 6 — use FindFirstObjectByType"; fail=1
fi
[ "$fail" = "0" ] || exit 1
