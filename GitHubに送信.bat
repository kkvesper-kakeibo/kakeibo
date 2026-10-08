@echo off
chcp 65001 >nul
title 家計簿 を GitHub に送信
cd /d "%~dp0"
echo 家計簿のプログラムを GitHub に送信します(家計簿のデータは送信しません)。
echo GitHub のログイン画面が出たら、ご自身でログインしてください。
echo.
set GCM_INTERACTIVE=auto
set GIT_TERMINAL_PROMPT=1
git push -u origin main
if errorlevel 1 (
  echo.
  echo 送信できませんでした。上に表示された英語のメッセージを Claude に伝えてください。
) else (
  echo.
  echo 送信が完了しました。この画面を閉じて、Claude に「送信できた」と伝えてください。
)
pause