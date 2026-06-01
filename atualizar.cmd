@echo off
REM Wrapper chamado pelo Agendador de Tarefas do Windows.
REM Roda o job de atualizacao completo e guarda a saida em data\atualizar.log.
cd /d D:\Licita
"D:\node.js\node.exe" scripts\atualizar.mjs >> data\atualizar.log 2>&1
