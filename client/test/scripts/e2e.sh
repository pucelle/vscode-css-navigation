#!/usr/bin/env bash

# Resolve paths relative to this script so it works regardless of the current working directory.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

node "$SCRIPT_DIR/../out/runTest.js"
