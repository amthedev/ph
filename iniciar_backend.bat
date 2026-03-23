@echo off
echo ====================================
echo 🎥 Live Stream Backend Setup
echo ====================================
echo.

echo 📦 Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python não encontrado! Por favor, instale Python 3.7+
    pause
    exit /b 1
)

echo ✅ Python encontrado!
echo.

echo 📦 Instalando dependências...
pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ Erro ao instalar dependências!
    pause
    exit /b 1
)

echo ✅ Dependências instaladas!
echo.

echo 🚀 Iniciando servidor backend...
echo 📊 Banco de dados: live_stream.db
echo 🔐 Senha admin: admin123
echo 🌐 Servidor: http://localhost:5000
echo.
echo Pressione Ctrl+C para parar o servidor
echo ====================================
echo.

python backend.py

pause
