class LiveStreamApp {
    constructor() {
        this.isLive = false;
        this.liveStartTime = null;
        this.viewerCount = 0;
        this.confirmedUsers = new Map(); // id -> { name, time }
        this.onlineCount = 0;
        this.currentUser = null;
        this.currentUserName = '';
        this.peakViewers = 0;
        this.liveUrl = '';
        this.adminToken = null;
        // URL relativa: funciona em qualquer porta quando servido pelo Flask
        this.backendUrl = window.location.protocol === 'file:'
            ? 'http://localhost/api'
            : '/api';
        this.lastMsgId = 0;
        this.chatPollInterval = null;
        this.backendAvailable = false;
        this.liveHour = 19;
        this.liveMinute = 0;

        this.init();
    }

    init() {
        this.loadStoredData();
        this.applySiteConfig();
        this.setupEventListeners();
        this.startCountdown();
        this.checkAdminAccess();
        this.tryLoadFromBackend();
    }

    // =====================
    // BACKEND (opcional)
    // =====================
    async apiRequest(endpoint, options = {}) {
        const url = `${this.backendUrl}${endpoint}`;
        const config = {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        };
        if (this.adminToken) {
            config.headers['Authorization'] = `Bearer ${this.adminToken}`;
        }
        const response = await fetch(url, config);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro na requisição');
        return data;
    }

    async tryLoadFromBackend() {
        try {
            const data = await this.apiRequest('/live/stats');
            this.backendAvailable = true;
            if (data.success && data.stats.is_live) {
                this.isLive = true;
                this.setLiveStatus(true);
            }
            // Carregar histórico do chat e começar polling
            await this.loadChatHistory();
            this.startChatPolling();
        } catch (_) {
            // Backend offline — chat funciona só localmente
            this.addSystemMessage('Chat em modo local (backend offline)');
        }
    }

    // =====================
    // CHAT REAL-TIME (POLLING)
    // =====================
    async loadChatHistory() {
        try {
            const data = await this.apiRequest('/chat/messages?since=0');
            if (data.success && data.messages.length > 0) {
                // Limpar mensagem de boas-vindas
                const container = document.getElementById('chatMessages');
                container.innerHTML = '';
                data.messages.forEach(msg => {
                    const isMe = msg.user_id === this.currentUser;
                    this.renderChatMessage(msg, isMe);
                });
                this.lastMsgId = data.messages[data.messages.length - 1].id;
                const container2 = document.getElementById('chatMessages');
                container2.scrollTop = container2.scrollHeight;
            }
        } catch (_) { /* silencioso */ }
    }

    startChatPolling() {
        if (this.chatPollInterval) clearInterval(this.chatPollInterval);
        this.chatPollInterval = setInterval(() => this.pollNewMessages(), 2500);
    }

    async pollNewMessages() {
        try {
            const data = await this.apiRequest(`/chat/messages?since=${this.lastMsgId}`);
            if (data.success && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    const isMe = msg.user_id === this.currentUser;
                    this.renderChatMessage(msg, isMe);
                });
                this.lastMsgId = data.messages[data.messages.length - 1].id;
                const container = document.getElementById('chatMessages');
                container.scrollTop = container.scrollHeight;
            }
        } catch (_) { /* silencioso */ }
    }

    renderChatMessage(msg, isMe) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = `chat-message ${isMe ? 'user' : 'other'}`;

        const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
        });

        div.innerHTML = `
            <div class="msg-header">
                <span class="msg-sender ${isMe ? 'me' : ''}">${this.escapeHtml(msg.name)}${isMe ? ' (você)' : ''}</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-text">${this.escapeHtml(msg.message)}</div>`;

        container.appendChild(div);
    }

    async adminLogin(password) {
        try {
            const data = await this.apiRequest('/admin/login', {
                method: 'POST',
                body: JSON.stringify({ password })
            });
            if (data.success) {
                this.adminToken = data.token;
                localStorage.setItem('adminToken', this.adminToken);
                return true;
            }
            return false;
        } catch (_) {
            // Fallback: senha local
            return password === 'admin123';
        }
    }

    // =====================
    // EVENT LISTENERS
    // =====================
    setupEventListeners() {
        // Admin
        document.getElementById('adminBtn').addEventListener('click', () => this.openAdminPanel());
        document.getElementById('closeAdmin').addEventListener('click', () => this.closeAdminPanel());
        document.getElementById('adminModal').addEventListener('click', (e) => {
            if (e.target.id === 'adminModal') this.closeAdminPanel();
        });
        document.getElementById('startLive').addEventListener('click', () => this.startLive());
        document.getElementById('stopLive').addEventListener('click', () => this.stopLive());
        document.getElementById('setLiveUrl').addEventListener('click', () => this.handleSetUrl());
        document.getElementById('liveUrlInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSetUrl();
        });

        // Editor de conteúdo
        document.getElementById('saveContent').addEventListener('click', () => this.saveContent());
        document.getElementById('uploadZone').addEventListener('click', () => document.getElementById('imageUpload').click());
        document.getElementById('imageUpload').addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('removeImage').addEventListener('click', () => this.removePreviewImage());
        const zone = document.getElementById('uploadZone');
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) this.processImageFile(e.dataTransfer.files[0]); });

        // Presença
        document.getElementById('confirmPresence').addEventListener('click', () => this.confirmPresence());
        document.getElementById('removePresence').addEventListener('click', () => this.removePresence());

        // Chat
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    // =====================
    // ADMIN ACCESS
    // =====================
    checkAdminAccess() {
        const savedToken = localStorage.getItem('adminToken');
        if (savedToken) {
            this.adminToken = savedToken;
            document.getElementById('adminBtn').style.display = 'flex';
        }

        document.addEventListener('keydown', async (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                const password = prompt('Senha de administrador:');
                if (!password) return;
                const ok = await this.adminLogin(password);
                if (ok) {
                    document.getElementById('adminBtn').style.display = 'flex';
                    this.showToast('Acesso admin concedido!', 'success');
                } else {
                    this.showToast('Senha incorreta', 'error');
                }
            }
        });
    }

    openAdminPanel() {
        const modal = document.getElementById('adminModal');
        modal.style.display = 'flex';
        modal.classList.add('active');
        this.renderViewerGrid();
        this.updateAdminStats();
        const savedUrl = localStorage.getItem('liveUrl');
        if (savedUrl) document.getElementById('liveUrlInput').value = savedUrl;
        this.fillEditorFields();
    }

    closeAdminPanel() {
        const modal = document.getElementById('adminModal');
        modal.style.display = 'none';
        modal.classList.remove('active');
    }

    // =====================
    // LINK DA LIVE
    // =====================
    handleSetUrl() {
        const input = document.getElementById('liveUrlInput');
        const url = input.value.trim();
        if (!url) {
            this.showToast('Cole um link válido', 'warning');
            return;
        }
        this.liveUrl = url;
        localStorage.setItem('liveUrl', url);
        this.showLinkPreview(url);
        this.showToast('Link definido! Inicie a live para exibir.', 'success');
    }

    showLinkPreview(url) {
        const previewEl = document.getElementById('linkPreview');
        previewEl.style.display = 'block';
        previewEl.innerHTML = '';

        const embedUrl = this.getEmbedUrl(url);
        if (embedUrl.type === 'youtube') {
            const iframe = document.createElement('iframe');
            iframe.src = embedUrl.url;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            previewEl.appendChild(iframe);
        } else if (embedUrl.type === 'image') {
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Preview';
            img.onerror = () => { previewEl.innerHTML = '<p style="color:#94a3b8;padding:1rem;font-size:0.8rem;">Não foi possível carregar a imagem</p>'; };
            previewEl.appendChild(img);
        } else {
            previewEl.innerHTML = `<p style="color:#94a3b8;padding:1rem;font-size:0.8rem;text-align:center;"><i class="fas fa-link"></i> Link salvo: ${url}</p>`;
        }
    }

    getEmbedUrl(url) {
        try {
            const u = new URL(url);

            // YouTube watch
            if (u.hostname.includes('youtube.com') && u.pathname === '/watch') {
                const v = u.searchParams.get('v');
                if (v) return { type: 'youtube', url: `https://www.youtube.com/embed/${v}?autoplay=1&mute=0` };
            }

            // YouTube live
            if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/live/')) {
                const v = u.pathname.replace('/live/', '').split('?')[0];
                if (v) return { type: 'youtube', url: `https://www.youtube.com/embed/${v}?autoplay=1` };
            }

            // YouTube shorts
            if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/shorts/')) {
                const v = u.pathname.replace('/shorts/', '').split('?')[0];
                if (v) return { type: 'youtube', url: `https://www.youtube.com/embed/${v}?autoplay=1` };
            }

            // youtu.be
            if (u.hostname === 'youtu.be') {
                const v = u.pathname.replace('/', '');
                if (v) return { type: 'youtube', url: `https://www.youtube.com/embed/${v}?autoplay=1` };
            }

            // Twitch
            if (u.hostname.includes('twitch.tv')) {
                const channel = u.pathname.replace('/', '');
                return { type: 'iframe', url: `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname || 'localhost'}&autoplay=true` };
            }

            // Imagem
            const ext = u.pathname.split('.').pop().toLowerCase();
            if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) {
                return { type: 'image', url };
            }

            return { type: 'other', url };
        } catch (_) {
            return { type: 'other', url };
        }
    }

    buildLiveMedia(url) {
        const container = document.getElementById('liveMediaContainer');
        container.innerHTML = '';

        if (!url) {
            container.innerHTML = `
                <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;color:#555;font-size:1rem;">
                    <div style="text-align:center;"><i class="fas fa-broadcast-tower" style="font-size:3rem;margin-bottom:12px;display:block;"></i>Transmissão ao vivo</div>
                </div>`;
            return;
        }

        const embed = this.getEmbedUrl(url);
        if (embed.type === 'youtube' || embed.type === 'iframe') {
            const iframe = document.createElement('iframe');
            iframe.src = embed.url;
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
            iframe.allowFullscreen = true;
            container.appendChild(iframe);
        } else if (embed.type === 'image') {
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Live';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            container.appendChild(img);
        } else {
            // Tenta como iframe genérico
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
            iframe.allow = 'autoplay; fullscreen';
            iframe.allowFullscreen = true;
            container.appendChild(iframe);
        }
    }

    // =====================
    // LIVE CONTROL
    // =====================
    startLive() {
        this.isLive = true;
        this.liveStartTime = Date.now();

        const savedUrl = localStorage.getItem('liveUrl') || this.liveUrl;
        this.buildLiveMedia(savedUrl);

        this.setLiveStatus(true);

        document.getElementById('startLive').disabled = true;
        document.getElementById('stopLive').disabled = false;

        this.viewerCount = this.confirmedUsers.size;
        this.onlineCount = this.viewerCount;
        this.updateViewerDisplays();

        document.getElementById('viewersBadge').style.display = 'flex';

        this.addSystemMessage('🔴 Live iniciada! Bem-vindos!');
        this.showToast('Live iniciada com sucesso!', 'success');
        this.closeAdminPanel();

        // Salvar estado
        localStorage.setItem('liveStatus', 'online');

        // Backend (sem bloquear UI)
        this.apiRequest('/live/start', { method: 'POST' }).catch(() => {});
    }

    stopLive() {
        this.isLive = false;
        const duration = this.liveStartTime ? Math.floor((Date.now() - this.liveStartTime) / 60000) : 0;

        this.setLiveStatus(false);

        document.getElementById('startLive').disabled = false;
        document.getElementById('stopLive').disabled = true;

        this.viewerCount = 0;
        this.onlineCount = 0;
        this.updateViewerDisplays();

        document.getElementById('viewersBadge').style.display = 'none';

        this.addSystemMessage(`📹 Live encerrada! Duração: ${duration} min`);
        this.showToast('Live encerrada!', 'info');
        this.closeAdminPanel();

        localStorage.setItem('liveStatus', 'offline');

        this.apiRequest('/live/stop', { method: 'POST' }).catch(() => {});
    }

    setLiveStatus(live) {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const preview = document.getElementById('videoPreview');
        const liveVideo = document.getElementById('liveVideo');

        if (live) {
            dot.className = 'status-dot online';
            text.textContent = 'Live Online';
            preview.style.display = 'none';
            liveVideo.style.display = 'block';
        } else {
            dot.className = 'status-dot offline';
            text.textContent = 'Live Offline';
            preview.style.display = 'flex';
            liveVideo.style.display = 'none';
        }
    }

    // =====================
    // COUNTDOWN
    // =====================
    startCountdown() {
        const tick = () => {
            const now = new Date();
            let target = new Date();
            target.setHours(this.liveHour, this.liveMinute, 0, 0);

            if (now >= target) {
                target.setDate(target.getDate() + 1);
            }

            const diff = target - now;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            document.getElementById('hours').textContent = String(h).padStart(2, '0');
            document.getElementById('minutes').textContent = String(m).padStart(2, '0');
            document.getElementById('seconds').textContent = String(s).padStart(2, '0');
        };

        tick();
        setInterval(tick, 1000);
    }

    // =====================
    // PRESENÇA
    // =====================
    confirmPresence() {
        if (!this.currentUser) {
            this.currentUser = 'user_' + Math.random().toString(36).slice(2, 11);
            localStorage.setItem('currentUser', this.currentUser);
        }

        if (this.confirmedUsers.has(this.currentUser)) return;

        const nameInput = document.getElementById('userName');
        const rawName = nameInput ? nameInput.value.trim() : '';
        this.currentUserName = rawName || `Usuário ${this.confirmedUsers.size + 1}`;

        this.confirmedUsers.set(this.currentUser, {
            name: this.currentUserName,
            time: new Date().toISOString(),
            online: true
        });

        this.savePresenceData();
        this.updatePresenceUI();

        document.getElementById('confirmPresence').style.display = 'none';
        document.getElementById('removePresence').style.display = 'inline-flex';
        if (document.getElementById('nameInputWrapper')) {
            document.getElementById('nameInputWrapper').style.display = 'none';
        }

        this.showToast('Presença confirmada! Te esperamos na live! 🎉', 'success');

        // Backend (sem bloquear)
        this.apiRequest('/viewer', {
            method: 'POST',
            body: JSON.stringify({
                id: this.currentUser,
                name: this.currentUserName,
                photo: null,
                latitude: 0,
                longitude: 0
            })
        }).catch(() => {});
    }

    removePresence() {
        this.confirmedUsers.delete(this.currentUser);
        this.savePresenceData();
        this.updatePresenceUI();

        document.getElementById('confirmPresence').style.display = 'inline-flex';
        document.getElementById('removePresence').style.display = 'none';
        if (document.getElementById('nameInputWrapper')) {
            document.getElementById('nameInputWrapper').style.display = 'block';
        }

        this.showToast('Presença cancelada', 'info');
    }

    updatePresenceUI() {
        const count = this.confirmedUsers.size;
        document.getElementById('confirmedCount').textContent = count;

        if (this.isLive) {
            this.onlineCount = count;
            this.viewerCount = count;
        } else {
            this.onlineCount = count;
        }

        document.getElementById('onlineCount').textContent = this.onlineCount;
        this.updateViewerDisplays();
    }

    updateViewerDisplays() {
        document.getElementById('viewerCountBadge').textContent = this.viewerCount;
        document.getElementById('viewerCountLive').textContent = this.viewerCount;
        document.getElementById('chatOnline').textContent = `${this.onlineCount} online`;

        if (this.viewerCount > this.peakViewers) {
            this.peakViewers = this.viewerCount;
        }
    }

    // =====================
    // ADMIN STATS & VIEWERS
    // =====================
    updateAdminStats() {
        document.getElementById('totalViews').textContent = this.confirmedUsers.size;
        document.getElementById('peakViewers').textContent = this.peakViewers;

        if (this.isLive && this.liveStartTime) {
            const mins = Math.floor((Date.now() - this.liveStartTime) / 60000);
            document.getElementById('avgDuration').textContent = mins + 'm';
        } else {
            document.getElementById('avgDuration').textContent = '0m';
        }
    }

    renderViewerGrid() {
        const grid = document.getElementById('viewerGrid');
        grid.innerHTML = '';

        if (this.confirmedUsers.size === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-clock"></i>
                    <p>Nenhum espectador confirmado ainda</p>
                </div>`;
            return;
        }

        this.confirmedUsers.forEach((data, id) => {
            const initial = data.name ? data.name.charAt(0).toUpperCase() : '?';
            const timeAgo = this.getTimeAgo(new Date(data.time));
            const isMe = id === this.currentUser;

            const card = document.createElement('div');
            card.className = 'viewer-card';
            card.innerHTML = `
                <div class="viewer-avatar">${initial}</div>
                <div class="viewer-name">${this.escapeHtml(data.name)}${isMe ? ' (você)' : ''}</div>
                <div class="viewer-time">${timeAgo}</div>
                <span class="viewer-status-badge ${data.online ? 'online' : 'offline'}">
                    ${data.online ? 'Online' : 'Offline'}
                </span>`;
            grid.appendChild(card);
        });

        this.updateAdminStats();
    }

    // =====================
    // CHAT
    // =====================
    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        if (!this.currentUser) {
            this.currentUser = 'user_' + Math.random().toString(36).slice(2, 11);
            localStorage.setItem('currentUser', this.currentUser);
        }

        const name = this.currentUserName || 'Visitante';

        // Tentar enviar ao backend (chat compartilhado)
        try {
            await this.apiRequest('/chat/message', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: this.currentUser,
                    name,
                    message: text
                })
            });
            // A mensagem aparecerá via polling (pollNewMessages)
        } catch (_) {
            // Backend offline: exibir só localmente
            this.addChatMessage(name, text, 'user');
        }
    }

    addChatMessage(sender, text, type = 'other') {
        const container = document.getElementById('chatMessages');

        const div = document.createElement('div');
        div.className = `chat-message ${type}`;

        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const senderClass = type === 'user' ? 'me' : '';

        if (type === 'system') {
            div.innerHTML = `<i class="fas fa-info-circle"></i><span>${this.escapeHtml(text)}</span>`;
        } else {
            div.innerHTML = `
                <div class="msg-header">
                    <span class="msg-sender ${senderClass}">${this.escapeHtml(sender)}</span>
                    <span class="msg-time">${time}</span>
                </div>
                <div class="msg-text">${this.escapeHtml(text)}</div>`;
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(text) {
        this.addChatMessage('', text, 'system');
    }

    // =====================
    // NOTIFICATIONS (Toast)
    // =====================
    showToast(message, type = 'info') {
        const icons = {
            success: 'fa-check',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };

        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-left">
                <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
                <span>${this.escapeHtml(message)}</span>
            </div>
            <button class="toast-close" onclick="this.closest('.toast').remove()">
                <i class="fas fa-times"></i>
            </button>`;

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 250);
            }
        }, 3500);
    }

    // =====================
    // PERSISTENCE
    // =====================
    savePresenceData() {
        const data = Array.from(this.confirmedUsers.entries());
        localStorage.setItem('confirmedUsers', JSON.stringify(data));
        localStorage.setItem('currentUser', this.currentUser || '');
        localStorage.setItem('currentUserName', this.currentUserName || '');
    }

    loadStoredData() {
        const savedUser = localStorage.getItem('currentUser');
        const savedName = localStorage.getItem('currentUserName');
        const savedUsers = localStorage.getItem('confirmedUsers');
        const savedStatus = localStorage.getItem('liveStatus');
        const savedUrl = localStorage.getItem('liveUrl');

        if (savedUser) this.currentUser = savedUser;
        if (savedName) this.currentUserName = savedName;

        if (savedUsers) {
            try {
                const data = JSON.parse(savedUsers);
                this.confirmedUsers = new Map(data);
            } catch (_) { this.confirmedUsers = new Map(); }
        }

        if (savedUrl) this.liveUrl = savedUrl;

        // Restaurar estado da live
        if (savedStatus === 'online') {
            this.isLive = true;
            this.setLiveStatus(true);
            if (savedUrl) this.buildLiveMedia(savedUrl);
            document.getElementById('startLive').disabled = true;
            document.getElementById('stopLive').disabled = false;
            document.getElementById('viewersBadge').style.display = 'flex';
        }

        // Restaurar UI de presença
        if (this.currentUser && this.confirmedUsers.has(this.currentUser)) {
            document.getElementById('confirmPresence').style.display = 'none';
            document.getElementById('removePresence').style.display = 'inline-flex';
            const nameWrapper = document.getElementById('nameInputWrapper');
            if (nameWrapper) nameWrapper.style.display = 'none';
        }

        this.updatePresenceUI();
    }

    // =====================
    // EDITOR DE CONTEÚDO
    // =====================

    // Mapeamento: chave -> ID do elemento no DOM
    get siteFields() {
        return {
            siteBrandName:        { id: 'siteBrandName',        prop: 'textContent' },
            siteBrandSub:         { id: 'siteBrandSub',         prop: 'textContent' },
            siteCountdownLabel:   { id: 'siteCountdownLabel',   prop: 'textContent' },
            sitePreviewTitle:     { id: 'sitePreviewTitle',     prop: 'textContent' },
            sitePreviewSubtitle:  { id: 'sitePreviewSubtitle',  prop: 'textContent' },
            sitePresenceTitle:    { id: 'sitePresenceTitle',    prop: 'textContent' },
            sitePresenceSubtitle: { id: 'sitePresenceSubtitle', prop: 'textContent' },
            siteChatTitle:        { id: 'siteChatTitle',        prop: 'textContent' },
            siteFooterBrand:      { id: 'siteFooterBrand',      prop: 'textContent' },
            siteFooterCopy:       { id: 'siteFooterCopy',       prop: 'textContent' },
        };
    }

    applySiteConfig() {
        const config = this.loadSiteConfig();

        // Textos
        Object.entries(this.siteFields).forEach(([key, field]) => {
            const el = document.getElementById(field.id);
            if (el && config[key]) el[field.prop] = config[key];
        });

        // Horário da live
        if (config.siteTime) {
            const [h, m] = config.siteTime.split(':').map(Number);
            this.liveHour = isNaN(h) ? 19 : h;
            this.liveMinute = isNaN(m) ? 0 : m;
        }

        // Imagem de fundo
        if (config.previewImage) {
            const img = document.querySelector('.preview-image');
            if (img) { img.src = config.previewImage; img.style.display = 'block'; }
        }
    }

    fillEditorFields() {
        const config = this.loadSiteConfig();

        // Preencher inputs de texto
        document.querySelectorAll('[data-site]').forEach(input => {
            const key = input.dataset.site;
            if (config[key] !== undefined) {
                input.value = config[key];
            } else {
                // Valor atual do DOM como placeholder value
                const field = this.siteFields[key];
                if (field) {
                    const el = document.getElementById(field.id);
                    if (el) input.value = el[field.prop] || '';
                }
            }
        });

        // Imagem
        if (config.previewImage) {
            this.showUploadPreview(config.previewImage);
        }
    }

    saveContent() {
        const config = this.loadSiteConfig();

        // Coletar valores dos inputs
        document.querySelectorAll('[data-site]').forEach(input => {
            const key = input.dataset.site;
            const val = input.value.trim();
            if (val) config[key] = val;
        });

        this.saveSiteConfig(config);
        this.applySiteConfig();
        this.showToast('Alterações salvas com sucesso!', 'success');
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (file) this.processImageFile(file);
        e.target.value = '';
    }

    processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            this.showToast('Selecione um arquivo de imagem válido', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result;
            const config = this.loadSiteConfig();
            config.previewImage = base64;
            this.saveSiteConfig(config);
            this.showUploadPreview(base64);
            // Aplicar imediatamente no preview
            const img = document.querySelector('.preview-image');
            if (img) { img.src = base64; img.style.display = 'block'; }
            this.showToast('Imagem definida!', 'success');
        };
        reader.readAsDataURL(file);
    }

    showUploadPreview(base64) {
        const zone = document.getElementById('uploadZone');
        zone.classList.add('has-image');
        // Remover preview anterior
        const old = zone.querySelector('img.upload-preview');
        if (old) old.remove();
        const img = document.createElement('img');
        img.src = base64;
        img.className = 'upload-preview';
        img.alt = 'Preview';
        zone.appendChild(img);
        document.getElementById('removeImage').style.display = 'inline-flex';
    }

    removePreviewImage() {
        const config = this.loadSiteConfig();
        delete config.previewImage;
        this.saveSiteConfig(config);
        // Resetar zona de upload
        const zone = document.getElementById('uploadZone');
        zone.classList.remove('has-image');
        const old = zone.querySelector('img.upload-preview');
        if (old) old.remove();
        document.getElementById('removeImage').style.display = 'none';
        // Resetar imagem do preview
        const img = document.querySelector('.preview-image');
        if (img) { img.src = "ChatGPT Image 23 de mar. de 2026, 15_47_58.png"; }
        this.showToast('Imagem removida', 'info');
    }

    loadSiteConfig() {
        try {
            return JSON.parse(localStorage.getItem('siteConfig') || '{}');
        } catch (_) { return {}; }
    }

    saveSiteConfig(config) {
        localStorage.setItem('siteConfig', JSON.stringify(config));
    }

    // =====================
    // UTILS
    // =====================
    getTimeAgo(date) {
        const secs = Math.floor((Date.now() - date) / 1000);
        if (secs < 60) return 'Agora mesmo';
        if (secs < 3600) return `${Math.floor(secs / 60)} min atrás`;
        if (secs < 86400) return `${Math.floor(secs / 3600)}h atrás`;
        return `${Math.floor(secs / 86400)} dias atrás`;
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LiveStreamApp();
});
