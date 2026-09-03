#!/usr/bin/env bash
# Compile and run the Starfall.Core test suite under Mono.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${TMPDIR:-/tmp}/starfall-core-tests"
mkdir -p "$OUT"
CORE=$(find "$ROOT/StarfallUnity/Assets/Scripts/Core" -name '*.cs' | sort)
mcs -nowarn:0169,0414,0649 -out:"$OUT/tests.exe" $CORE "$ROOT/tools/core-tests/Tests.cs"
exec mono "$OUT/tests.exe"
