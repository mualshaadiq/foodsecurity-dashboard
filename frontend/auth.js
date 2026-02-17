// Authentication Management
const AUTH_KEY = 'gis_app_token';
const USER_KEY = 'gis_app_user';

class AuthManager {
    constructor() {
        this.token = localStorage.getItem(AUTH_KEY);
        this.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        this.initializeUI();
    }

    initializeUI() {
        // Get UI elements
        this.loginBtn = document.getElementById('login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.loginModal = document.getElementById('login-modal');
        this.loginForm = document.getElementById('login-form');
        this.authButtons = document.getElementById('auth-buttons');
        this.userInfo = document.getElementById('user-info');
        this.usernameDisplay = document.getElementById('username-display');
        this.loginError = document.getElementById('login-error');
        this.closeModal = this.loginModal.querySelector('.close');

        // Event listeners
        this.loginBtn.addEventListener('click', () => this.showLoginModal());
        this.logoutBtn.addEventListener('click', () => this.logout());
        this.closeModal.addEventListener('click', () => this.hideLoginModal());
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        
        // Close modal on outside click
        window.addEventListener('click', (e) => {
            if (e.target === this.loginModal) {
                this.hideLoginModal();
            }
        });

        // Update UI based on auth state
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
            // Create form data for OAuth2
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Login failed');
            }

            const data = await response.json();
            
            // Store token
            this.token = data.access_token;
            localStorage.setItem(AUTH_KEY, this.token);

            // Get user info
            await this.fetchUserInfo();

            // Update UI
            this.updateUI();
            this.hideLoginModal();

            // Trigger custom event for other components
            window.dispatchEvent(new CustomEvent('auth-changed', { 
                detail: { authenticated: true, user: this.user } 
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
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch user info');
            }

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

        // Trigger custom event
        window.dispatchEvent(new CustomEvent('auth-changed', { 
            detail: { authenticated: false } 
        }));
    }

    updateUI() {
        if (this.isAuthenticated()) {
            this.authButtons.style.display = 'none';
            this.userInfo.style.display = 'flex';
            this.usernameDisplay.textContent = this.user.username;
        } else {
            this.authButtons.style.display = 'flex';
            this.userInfo.style.display = 'none';
        }
    }

    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    getToken() {
        return this.token;
    }

    getUser() {
        return this.user;
    }

    async fetchWithAuth(url, options = {}) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const authOptions = {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${this.token}`
            }
        };

        const response = await fetch(url, authOptions);

        // If unauthorized, logout
        if (response.status === 401) {
            this.logout();
            throw new Error('Session expired. Please login again.');
        }

        return response;
    }
}

// Initialize auth manager
const authManager = new AuthManager();

// Export for use in other scripts
window.authManager = authManager;
