from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import base64
import json
from datetime import datetime, timedelta
import os
import hashlib
import secrets
import logging

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuração de ambiente
DATABASE = os.environ.get('DATABASE_URL', 'live_stream.db').replace('sqlite:///', '')
ADMIN_PASSWORD_HASH = hashlib.sha256(os.environ.get('ADMIN_PASSWORD', 'admin123').encode()).hexdigest()
SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
FLASK_ENV = os.environ.get('FLASK_ENV', 'development')

# Configurações de produção
app.config['DEBUG'] = FLASK_ENV == 'development'
app.config['SECRET_KEY'] = SECRET_KEY

# Inicialização do banco de dados
def init_db():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    # Tabela de espectadores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS viewers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            photo TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            accuracy REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            online BOOLEAN DEFAULT 1
        )
    ''')
    
    # Tabela de lives
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS lives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time DATETIME,
            end_time DATETIME,
            peak_viewers INTEGER DEFAULT 0,
            total_views INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 0
        )
    ''')
    
    # Tabela de estatísticas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS live_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            live_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            viewer_count INTEGER DEFAULT 0,
            FOREIGN KEY (live_id) REFERENCES lives (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Conexão com banco de dados
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# Salvar espectador verificado
@app.route('/api/viewer', methods=['POST'])
def save_viewer():
    try:
        data = request.json
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Verificar se espectador já existe
        cursor.execute('SELECT id FROM viewers WHERE id = ?', (data['id'],))
        existing = cursor.fetchone()
        
        if existing:
            # Atualizar dados existentes
            cursor.execute('''
                UPDATE viewers 
                SET name = ?, photo = ?, latitude = ?, longitude = ?, 
                    accuracy = ?, last_seen = CURRENT_TIMESTAMP, online = 1
                WHERE id = ?
            ''', (
                data['name'], data['photo'], 
                data.get('latitude'), data.get('longitude'), data.get('accuracy'),
                data['id']
            ))
        else:
            # Inserir novo espectador
            cursor.execute('''
                INSERT INTO viewers (id, name, photo, latitude, longitude, accuracy)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                data['id'], data['name'], data['photo'],
                data.get('latitude'), data.get('longitude'), data.get('accuracy')
            ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Espectador salvo com sucesso'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Obter espectadores verificados
@app.route('/api/viewers', methods=['GET'])
def get_viewers():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Atualizar status online (considerar online se visto nos últimos 5 minutos)
        cursor.execute('''
            UPDATE viewers 
            SET online = 0 
            WHERE datetime(last_seen) < datetime('now', '-5 minutes')
        ''')
        
        cursor.execute('''
            SELECT id, name, photo, latitude, longitude, accuracy, 
                   timestamp, last_seen, online
            FROM viewers 
            ORDER BY timestamp DESC
        ''')
        
        viewers = []
        for row in cursor.fetchall():
            viewers.append({
                'id': row['id'],
                'name': row['name'],
                'photo': row['photo'],
                'location': {
                    'latitude': row['latitude'],
                    'longitude': row['longitude'],
                    'accuracy': row['accuracy']
                } if row['latitude'] else None,
                'timestamp': row['timestamp'],
                'last_seen': row['last_seen'],
                'online': bool(row['online'])
            })
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'viewers': viewers})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Atualizar status de espectador
@app.route('/api/viewer/<viewer_id>/status', methods=['PUT'])
def update_viewer_status(viewer_id):
    try:
        data = request.json
        online = data.get('online', True)
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE viewers 
            SET online = ?, last_seen = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (online, viewer_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Iniciar live
@app.route('/api/live/start', methods=['POST'])
def start_live():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Encerrar live anterior se estiver ativa
        cursor.execute('UPDATE lives SET is_active = 0, end_time = CURRENT_TIMESTAMP WHERE is_active = 1')
        
        # Iniciar nova live
        cursor.execute('''
            INSERT INTO lives (start_time, is_active)
            VALUES (CURRENT_TIMESTAMP, 1)
        ''')
        
        live_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'live_id': live_id})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Encerrar live
@app.route('/api/live/stop', methods=['POST'])
def stop_live():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Encerrar live ativa
        cursor.execute('''
            UPDATE lives 
            SET end_time = CURRENT_TIMESTAMP, is_active = 0 
            WHERE is_active = 1
        ''')
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Obter estatísticas da live
@app.route('/api/live/stats', methods=['GET'])
def get_live_stats():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Verificar se há live ativa
        cursor.execute('SELECT * FROM lives WHERE is_active = 1')
        active_live = cursor.fetchone()
        
        if not active_live:
            return jsonify({
                'success': True,
                'is_live': False,
                'stats': {
                    'total_views': 0,
                    'peak_viewers': 0,
                    'current_viewers': 0,
                    'duration': 0
                }
            })
        
        # Contar espectadores online
        cursor.execute('SELECT COUNT(*) as count FROM viewers WHERE online = 1')
        current_viewers = cursor.fetchone()['count']
        
        # Estatísticas da live
        stats = {
            'is_live': True,
            'live_id': active_live['id'],
            'start_time': active_live['start_time'],
            'total_views': active_live['total_views'],
            'peak_viewers': max(active_live['peak_viewers'], current_viewers),
            'current_viewers': current_viewers,
            'duration': 0
        }
        
        # Calcular duração
        if active_live['start_time']:
            start = datetime.fromisoformat(active_live['start_time'])
            duration = datetime.now() - start
            stats['duration'] = int(duration.total_seconds() / 60)  # minutos
        
        # Atualizar pico de espectadores
        if current_viewers > active_live['peak_viewers']:
            cursor.execute('''
                UPDATE lives 
                SET peak_viewers = ? 
                WHERE id = ?
            ''', (current_viewers, active_live['id']))
            conn.commit()
        
        conn.close()
        
        return jsonify({'success': True, 'stats': stats})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Autenticação admin
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    try:
        data = request.json
        password = data.get('password', '')
        
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        if password_hash == ADMIN_PASSWORD_HASH:
            return jsonify({
                'success': True,
                'token': SECRET_KEY,
                'message': 'Login realizado com sucesso'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Senha incorreta'
            }), 401
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Limpar espectadores antigos
@app.route('/api/admin/cleanup', methods=['POST'])
def cleanup_old_viewers():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Remover espectadores não vistos há mais de 24 horas
        cursor.execute('''
            DELETE FROM viewers 
            WHERE datetime(last_seen) < datetime('now', '-24 hours')
        ''')
        
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'deleted': deleted,
            'message': f'{deleted} espectadores antigos removidos'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Servir arquivos estáticos
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

# Health check endpoint
@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    logger.info("🚀 Iniciando backend...")
    logger.info(f"📊 Ambiente: {FLASK_ENV}")
    logger.info(f"�️ Banco de dados: {DATABASE}")
    
    init_db()
    
    port = 80
    host = '0.0.0.0'
    
    logger.info(f"🌐 Servidor iniciado em http://{host}:{port}")
    logger.info("🔐 Senha admin: admin123")
    
    # Em produção, não usar debug=True
    app.run(host=host, port=port, debug=app.config['DEBUG'])
