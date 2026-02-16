/**
 * UUID Copy Button Handler
 * Add the HTML button next to connection-status in your navbar
 * Then initialize this handler in your main initialization code
 */

class UUIDCopyButton {
    constructor() {
        this.button = document.getElementById('copy-uuid-btn');
        this.originalText = '📋 Copy UUID';
        this.successText = '✅ Copied!';
        this.init();
    }

    init() {
        if (!this.button) {
            console.warn('⚠️ UUID copy button not found');
            return;
        }

        this.button.addEventListener('click', () => this.copyUUID());
    }

    copyUUID() {
        // Check if UUID is available
        if (typeof window.uuid === 'undefined' || !window.uuid) {
            console.error('❌ UUID not available');
            this.showFeedback('UUID not available', 'error');
            return;
        }

        // Copy to clipboard
        navigator.clipboard.writeText(window.uuid)
            .then(() => {
                console.log('✅ UUID copied to clipboard:', window.uuid);
                this.showFeedback('success');
            })
            .catch(err => {
                console.error('❌ Failed to copy UUID:', err);
                this.showFeedback('error');
            });
    }

    showFeedback(type = 'success') {
        // Save original state
        const original = this.button.textContent;
        const originalClass = this.button.className;

        // Update button appearance
        if (type === 'success') {
            this.button.textContent = this.successText;
            this.button.style.background = '#10b981';
        } else {
            this.button.textContent = '❌ Error';
            this.button.style.background = '#ef4444';
        }

        // Revert after 2 seconds
        setTimeout(() => {
            this.button.textContent = original;
            this.button.style.background = '';
        }, 2000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const uuidCopyButton = new UUIDCopyButton();
    });
} else {
    const uuidCopyButton = new UUIDCopyButton();
}