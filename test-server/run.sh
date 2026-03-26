#!/bin/bash

PORT=6969

echo "Running test server on http://localhost:$PORT"
echo "Press Ctrl+C to stop the server"

python3 -m http.server $PORT
