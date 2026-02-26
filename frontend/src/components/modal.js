import { authManager } from '@/auth/auth-manager.js';

/**
 * Initialize the login modal UI (delegates to AuthManager which owns the DOM logic).
 * Call once on app startup after DOM is ready.
 */
export function initModal() {
    authManager.initializeUI();
}
