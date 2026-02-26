// Authentication Manager
const AUTH_KEY = 'gis_app_token';
const USER_KEY = 'gis_app_user';

// ── Dev bypass ────────────────────────────────────────────────────────────
// Set to false when real auth is wired up.
const DEV_BYPASS = true;
const DEV_USER   = { username: 'dev', role: 'admin', id: 0 };
const DEV_TOKEN  = 'dev-bypass-token';
// ─────────────────────────────────────────────────────────────────────────

class AuthManager {
    constructor() {
        this.token = localStorage.getItem(AUTH_KEY);
        this.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    }

    initializeUI() {
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.loginModal = document.getElementById('login-modal');
        this.loginForm = document.getElementById('login-form');
        this.authButtons = document.getElementById('auth-buttons');
        this.userInfo = document.getElementById('user-info');
        this.usernameDisplay = document.getElementById('username-display');
        this.loginError = document.getElementById('login-error');
        this.closeModal = this.loginModal.querySelector('.close');

        this.loginBtn.addEventListener('click', () => this.showLoginModal());
        this.logoutBtn.addEventListener('click', () => this.logout());
        this.closeModal.addEventListener('click', () => this.hideLoginModal());
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        window.addEventListener('click', (e) => {
            if (e.target === this.loginModal) this.hideLoginModal();
        });

        this.updateUI();
    }

    showLoginModal() {
        this.loginModal.classList.add('active');
        this.loginModal.style.display = 'flex';
        this.loginError.classList.remove('active');
    }

    hideLoginModal() {
        this.loginModal.classList.remove('active');
        this.loginModal.style.display = 'none';
        this.loginForm.reset();
        this.loginError.classList.remove('active');
    }

    async handleLogin(event) {
        event.preventDefault();

        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Login failed');
            }

            const data = await response.json();
            this.token = data.access_token;
            localStorage.setItem(AUTH_KEY, this.token);

            await this.fetchUserInfo();
            this.updateUI();
            this.hideLoginModal();

            window.dispatchEvent(new CustomEvent('auth-changed', {
                detail: { authenticated: true, user: this.user },
            }));
        } catch (error) {
            console.error('Login error:', error);
            this.loginError.textContent = error.message;
            this.loginError.classList.add('active');
        }
    }

    async fetchUserInfo() {
        try {
            const response = await fetch('/api/auth/me', {
                headers: { Authorization: `Bearer ${this.token}` },
            });

            if (!response.ok) throw new Error('Failed to fetch user info');

            this.user = await response.json();
            localStorage.setItem(USER_KEY, JSON.stringify(this.user));
        } catch (error) {
            console.error('Failed to fetch user info:', error);
            this.logout();
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(USER_KEY);
        this.updateUI();

        window.dispatchEvent(new CustomEvent('auth-changed', {
            detail: { authenticated: false },
        }));
    }

    updateUI() {
        if (this.isAuthenticated()) {
            this.authButtons.style.display = 'none';
            this.userInfo.style.display = 'flex';
            const u = DEV_BYPASS ? DEV_USER : this.user;
            this.usernameDisplay.textContent = u?.username ?? '';
        } else {
            this.authButtons.style.display = 'flex';
            this.userInfo.style.display = 'none';
        }
    }

    isAuthenticated() {
        if (DEV_BYPASS) return true;
        return !!this.token && !!this.user;
    }

    getToken() {
        if (DEV_BYPASS) return DEV_TOKEN;
        return this.token;
    }

    getUser() {
        if (DEV_BYPASS) return DEV_USER;
        return this.user;
    }

    async fetchWithAuth(url, options = {}) {
        if (!this.isAuthenticated()) throw new Error('Not authenticated');
        if (DEV_BYPASS) {
            return fetch(url, {
                ...options,
                headers: { ...options.headers, Authorization: `Bearer ${DEV_TOKEN}` },
            });
        }

        const authOptions = {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${this.token}`,
            },
        };

        const response = await fetch(url, authOptions);

        if (response.status === 401) {
            this.logout();
            throw new Error('Session expired. Please login again.');
        }

        return response;
    }
}

// Singleton instance — shared across the whole app
export const authManager = new AuthManager();

// Keep window reference for any legacy inline scripts
window.authManager = authManager;
