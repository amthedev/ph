# 🐍 Instalação do Python - Windows

## 📥 Passo 1: Baixar Python

1. **Acesse o site oficial:** https://www.python.org/downloads/
2. **Clique em "Download Python 3.x.x"** (versão mais recente)
3. **Aguarde o download** do instalador

## 🛠️ Passo 2: Instalar Python

1. **Execute o instalador** baixado
2. **⚠️ IMPORTANTE:** Marque a opção **"Add Python to PATH"**
3. **Clique em "Install Now"**
4. **Aguarde a instalação** completar
5. **Clique em "Close"**

## ✅ Passo 3: Verificar Instalação

1. **Abra o Prompt de Comando** (Win + R, digite `cmd`)
2. **Digite o comando:**
```bash
python --version
```

3. **Deverá aparecer algo como:**
```
Python 3.11.4
```

## 🚀 Passo 4: Iniciar o Backend

1. **Abra o terminal** na pasta do projeto
2. **Execute o script:**
```bash
iniciar_backend.bat
```

3. **Aguarde as mensagens:**
```
📦 Instalando dependências...
✅ Dependências instaladas!
🚀 Backend iniciado em http://localhost:5000
```

## 🔧 Solução de Problemas

### **"Python não encontrado"**
- Reinstale o Python marcando "Add Python to PATH"
- Ou adicione manualmente ao PATH do Windows

### **"pip não reconhecido"**
- Reinstale o Python com a opção marcada
- Ou use `python -m pip` em vez de `pip`

### **Problemas de permissão**
- Execute o Prompt de Comando como Administrador
- Ou instale Python apenas para seu usuário

### **Firewall bloqueando**
- Permita Python nas regras do Firewall
- Ou desative temporariamente para testar

## 📱 Alternativas

### **Microsoft Store**
- Abra a Microsoft Store
- Procure por "Python 3.x"
- Instale diretamente da loja

### **Anaconda**
- Baixe Anaconda (inclui Python e muitas bibliotecas)
- Ideal para desenvolvimento científico

## 🎯 Próximos Passos

Após instalar Python:
1. Execute `iniciar_backend.bat`
2. Abra `index.html` no navegador
3. Use Ctrl+Shift+A (senha: admin123) para acessar painel admin

---

**Pronto! Seu backend Python estará funcionando! 🐍✨**
