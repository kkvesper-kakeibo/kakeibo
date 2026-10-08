@echo off
chcp 65001 >nul
title 家計簿 お試し(架空データ・この画面を閉じるとアプリも止まります)
cd /d "%~dp0"
echo 家計簿を「架空のデータ」で起動します(本物のデータや Google には一切触れません)。
echo ブラウザが自動で開きます。使い終わったら、この黒い画面を閉じてください。
echo.
if not exist node_modules (
  echo 必要な部品を入れています...
  call npm install
)
call npm run dev -- --open "/kakeibo/?demo"
echo.
echo 起動できませんでした。すでに別の画面で起動している場合は、そちらをお使いください。
pause
