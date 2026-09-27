#!/usr/bin/env bash
# Caravaneer 2 HTML5 — 一键启动（macOS/Linux）
cd "$(dirname "$0")/web"
echo "打开 http://localhost:5174/"
npx vite preview --port 5174 --strictPort
