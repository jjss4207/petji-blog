@echo off
cd /d "%~dp0"
echo 티스토리 예약 발행 대시보드를 시작합니다...
echo 브라우저에서 http://localhost:4321 을 열어주세요.
node scripts\dashboard-server.js
pause
