# 🐍 Backend Python - Live Stream

Backend em Python com Flask e SQLite para gerenciar o sistema de lives.

## 🚀 Funcionalidades

### 📊 **Endpoints da API**

#### **Espectadores**
- `POST /api/viewer` - Salvar dados de espectador verificado
- `GET /api/viewers` - Listar todos os espectadores
- `PUT /api/viewer/<id>/status` - Atualizar status online/offline

#### **Lives**
- `POST /api/live/start` - Iniciar uma nova live
- `POST /api/live/stop` - Encerrar live ativa
- `GET /api/live/stats` - Obter estatísticas da live

#### **Administração**
- `POST /api/admin/login` - Autenticação de administrador
- `POST /api/admin/cleanup` - Limpar espectadores antigos

## 🛠️ Instalação

### **Pré-requisitos**
- Python 3.7+
- pip (gerenciador de pacotes Python)

### **Passos**

1. **Instalar dependências:**
```bash
pip install -r requirements.txt
```

2. **Iniciar o backend:**
```bash
python start_backend.py
```

Ou diretamente:
```bash
python backend.py
```

## 📁 Estrutura do Banco de Dados

### **Tabela `viewers`**
```sql
CREATE TABLE viewers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    photo TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    accuracy REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    online BOOLEAN DEFAULT 1
);
```

### **Tabela `lives`**
```sql
CREATE TABLE lives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time DATETIME,
    end_time DATETIME,
    peak_viewers INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 0
);
```

### **Tabela `live_stats`**
```sql
CREATE TABLE live_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    live_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    viewer_count INTEGER DEFAULT 0,
    FOREIGN KEY (live_id) REFERENCES lives (id)
);
```

## 🔐 Configurações

### **Variáveis de Ambiente**
- `DATABASE` - Caminho do banco SQLite (padrão: `live_stream.db`)
- `ADMIN_PASSWORD` - Senha do administrador (padrão: `admin123`)
- `SECRET_KEY` - Chave secreta para tokens
- `HOST` - Host do servidor (padrão: `0.0.0.0`)
- `PORT` - Porta do servidor (padrão: `5000`)

### **Segurança**
- Senha admin hasheada com SHA-256
- Tokens JWT para autenticação
- CORS configurado para desenvolvimento
- Validação de dados de entrada

## 📡 Exemplos de Uso

### **Salvar Espectador**
```javascript
const viewerData = {
    id: 'user_abc123',
    name: 'Usuário Teste',
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...',
    location: {
        latitude: -23.5505,
        longitude: -46.6333,
        accuracy: 10
    }
};

fetch('http://localhost:5000/api/viewer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(viewerData)
});
```

### **Iniciar Live**
```javascript
fetch('http://localhost:5000/api/live/start', {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    }
});
```

### **Listar Espectadores**
```javascript
fetch('http://localhost:5000/api/viewers')
    .then(response => response.json())
    .then(data => console.log(data.viewers));
```

## 🔧 Desenvolvimento

### **Logs e Debug**
O servidor Flask roda em modo debug por padrão, mostrando:
- Requisições HTTP
- Erros detalhados
- Stack traces
- Recarregamento automático

### **Testes**
```bash
# Testar endpoint
curl -X GET http://localhost:5000/api/viewers

# Testar login admin
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "admin123"}'
```

## 📊 Monitoramento

### **Estatísticas em Tempo Real**
- Contagem de espectadores online
- Pico de espectadores
- Duração das lives
- Localização dos espectadores

### **Limpeza Automática**
- Espectadores offline há mais de 5 minutos marcados como offline
- Espectadores não vistos há mais de 24 horas removidos
- Logs de limpeza registrados

## 🚀 Deploy

### **Produção**
1. Desativar modo debug
2. Configurar variáveis de ambiente
3. Usar WSGI (Gunicorn/uWSGI)
4. Configurar HTTPS
5. Setar firewall adequado

### **Exemplo com Gunicorn**
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 backend:app
```

## 🔍 Troubleshooting

### **Problemas Comuns**

**Erro de CORS:**
- Verifique se o frontend está na lista de origens permitidas
- Configure CORS adequadamente para produção

**Conexão com banco:**
- Verifique permissões do arquivo SQLite
- Confirme se o caminho do banco está correto

**Porta em uso:**
- Use `netstat -tulpn | grep :5000` para verificar
- Altere a porta na configuração

## 📝 Licença

Este projeto está licenciado sob MIT License.

---

**Desenvolvido com ❤️ em Python + Flask + SQLite**
