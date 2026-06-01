@echo off
REM Clique duas vezes neste arquivo para ligar o Licita na sua maquina.
REM Abre o navegador e mantem o servidor rodando. Feche esta janela para desligar.
cd /d D:\Licita
echo.
echo  ====================================================
echo   LICITA - rodando em http://localhost:3000
echo   (deixe esta janela aberta enquanto testa)
echo   Feche a janela para desligar o servidor.
echo  ====================================================
echo.
start "" http://localhost:3000
"D:\node.js\node.exe" web\server.mjs
pause
