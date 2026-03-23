#!/usr/bin/env python3
"""
Script para iniciar o backend da Live Stream
"""

import subprocess
import sys
import os

def install_requirements():
    """Instalar dependências"""
    print("📦 Instalando dependências...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Dependências instaladas com sucesso!")
    except subprocess.CalledProcessError as e:
        print(f"❌ Erro ao instalar dependências: {e}")
        return False
    return True

def start_backend():
    """Iniciar o servidor backend"""
    print("🚀 Iniciando servidor backend...")
    try:
        subprocess.run([sys.executable, "backend.py"])
    except KeyboardInterrupt:
        print("\n👋 Servidor encerrado")
    except Exception as e:
        print(f"❌ Erro ao iniciar servidor: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("🎥 Live Stream Backend Setup")
    print("=" * 50)
    
    # Verificar se requirements.txt existe
    if not os.path.exists("requirements.txt"):
        print("❌ Arquivo requirements.txt não encontrado!")
        sys.exit(1)
    
    # Verificar se backend.py existe
    if not os.path.exists("backend.py"):
        print("❌ Arquivo backend.py não encontrado!")
        sys.exit(1)
    
    # Instalar dependências
    if install_requirements():
        # Iniciar backend
        start_backend()
    else:
        print("❌ Falha na instalação das dependências")
        sys.exit(1)
