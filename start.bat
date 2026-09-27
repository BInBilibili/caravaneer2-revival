@echo off
REM Caravaneer 2 HTML5 — 一键启动
cd /d "%~dp0web"
echo 正在启动 Caravaneer 2 HTML5 服务器...
echo 浏览器打开: http://localhost:5174/
start http://localhost:5174/
npx vite preview --port 5174 --strictPort
