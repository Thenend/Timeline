@echo off
title Timeline
cd /d "%~dp0"
where py >nul 2>nul && (py servidor.py) || (python servidor.py)
if errorlevel 1 pause
