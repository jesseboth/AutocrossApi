#!/bin/bash

PORT="${TEST_PORT:-6969}"

echo "Running test live event on http://localhost:$PORT/debug/live.html"
echo "Press Ctrl+C to stop the server"

TEST_PORT=$PORT node "$(dirname "$0")/index.js"
