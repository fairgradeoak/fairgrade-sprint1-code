@echo off
cd /d "%~dp0"
echo Open http://localhost:4173 in your browser after the server starts.
echo Select Synthetic demonstration for the no-download local demo.
node server/server.mjs
pause
