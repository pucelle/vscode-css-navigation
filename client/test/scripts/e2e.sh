#!/usr/bin/env bash

export CODE_TESTS_PATH="$(pwd)/out"
export CODE_TESTS_WORKSPACE="$(pwd)/fixture"

node "$(pwd)/../../client/node_modules/vscode/bin/test"