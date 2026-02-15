/**
 * TriggersManager - UI for Soundpack and Trigger Configuration
 * 
 * Features:
 * - Create new soundpacks
 * - Upload MP3 files to triggers via drag-drop or button
 * - Test audio playback
 * - Enable/disable individual triggers
 * - Switch between soundpacks
 * - Visual feedback for upload status
 */

class TriggersManager {
    constructor() {
        this.soundpacks = [];
        this.activeSoundpackId = null;
        this.uploadProgress = new Map(); // Track upload progress per trigger
        
        this.initializeElements();
        this.attachEventListeners();

        if (window.triggerEngine && triggerEngine.activeSoundpackId) {
            console.log('🏗️ Bootstrapping TriggersManager with existing engine state');
            this.activeSoundpackId = triggerEngine.activeSoundpackId;
            this.renderTriggers();
        }

        this.loadSoundpacks();
    }

    

    /**
     * INITIALIZATION
     */

    initializeElements() {
        this.triggersPanel = document.getElementById('triggers-view');
        this.soundpackList = document.getElementById('soundpack-list');
        this.triggersList = document.getElementById('trigger-list');
        
        // Create soundpack manager if doesn't exist
        if (!document.getElementById('soundpack-manager')) {
            this.createSoundpackManagerPanel();
        }
    }

    /**
     * Create the soundpack management UI section
     */
    createSoundpackManagerPanel() {
        const html = `
            <div id="soundpack-manager" class="bar-panel soundpack-panel" style="margin-bottom: 20px;">
                <div class="panel-header">
                    <h3>📦 SOUND PACKS</h3>
                    <button id="create-soundpack-btn" class="bar-btn-small">+ NEW PACK</button>
                </div>
                
                <div id="soundpack-list" class="soundpack-list">
                    <p class="empty-state">No soundpacks created yet. Create one to get started!</p>
                </div>

                <!-- Create Soundpack Modal -->
                <div id="create-soundpack-modal" class="modal hidden">
                    <div class="modal-content bar-panel">
                        <h4>CREATE NEW SOUND PACK</h4>
                        <div class="form-group">
                            <label>Pack Name</label>
                            <input type="text" id="soundpack-title" placeholder="My Custom Sounds" maxlength="255">
                        </div>
                        <div class="modal-actions">
                            <button id="modal-create-btn" class="bar-btn-primary">Create</button>
                            <button id="modal-cancel-btn" class="bar-btn-small">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const triggersPanel = document.getElementById('triggers-view');
        if (triggersPanel) {
            const insertAfter = triggersPanel.querySelector('.bar-panel');
            if (insertAfter) {
                insertAfter.insertAdjacentHTML('afterend', html);
            } else {
                triggersPanel.insertAdjacentHTML('afterbegin', html);
            }
        }
    }

    /**
     * EVENT LISTENERS
     */

    attachEventListeners() {

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.attachEventListeners();
            });
            return;
        }

        // Only proceed if triggers view exists
        if (!this.triggersPanel) {
            console.warn('Triggers panel not found - deferring initialization');
            setTimeout(() => this.attachEventListeners(), 1000);
            return;
        }
        
        // Create soundpack
        document.getElementById('create-soundpack-btn')?.addEventListener('click', () => {
            this.showCreateSoundpackModal();
        });

        document.getElementById('modal-create-btn')?.addEventListener('click', () => {
            this.createSoundpack();
        });

        document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('soundpack-title')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createSoundpack();
            }
        });

        // Listen for trigger fired events
        window.addEventListener('triggerFired', (e) => {
            this.highlightFiredTrigger(e.detail.triggerId);
        });

        // Listen for soundpack changes
        window.addEventListener('soundpackChanged', (e) => {
            this.activeSoundpackId = e.detail.soundpackId;
            this.renderSoundpacks();
        });

        // ensure trigger list updates when soundpack changes (e.g. after upload or switch)
        window.addEventListener('soundpackChanged', (e) => {
            this.activeSoundpackId = e.detail.soundpackId;
            this.renderSoundpacks();
            this.renderTriggers(); // This will now correctly populate the panel
        });
    }

    /**
     * SOUNDPACK MANAGEMENT
     */

    /**
     * Load all soundpacks from server
     */
    async loadSoundpacks() {
        try {
            const response = await fetch('/soundapi/soundpack/list', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (result.success) {
                this.soundpacks = result.data.soundpacks || [];
                this.renderSoundpacks();
            }
        } catch (err) {
            console.error('Error loading soundpacks:', err);
            this.showNotification('Failed to load soundpacks', 'error');
        }
    }

    /**
     * Create new soundpack
     */
    async createSoundpack() {
        const titleInput = document.getElementById('soundpack-title');
        const title = (titleInput?.value || '').trim();

        if (!title) {
            this.showNotification('Please enter a soundpack name', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('title', title);

            const response = await fetch('/soundapi/soundpack/create', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (result.success) {
                this.soundpacks.push(result.data);
                this.renderSoundpacks();
                this.closeModal();
                this.showNotification(`Soundpack "${title}" created!`, 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (err) {
            console.error('Error creating soundpack:', err);
            this.showNotification('Failed to create soundpack', 'error');
        }
    }

    /**
     * Delete soundpack
     */
    async deleteSoundpack(soundpackId) {
        if (!confirm('Are you sure? All audio files will be deleted.')) return;

        try {
            const formData = new FormData();
            formData.append('soundpack_id', soundpackId);

            // would like to use DELETE method, but PHP is a lil' bitch
            const response = await fetch('/soundapi/soundpack/remove', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();
            if (result.success) {
                this.soundpacks = this.soundpacks.filter(sp => sp.id !== soundpackId);
                this.renderSoundpacks();
                this.showNotification('Soundpack deleted', 'success');
            }
        } catch (err) {
            console.error('Error deleting soundpack:', err);
            this.showNotification('Failed to delete soundpack', 'error');
        }
    }

    /**
     * Switch to soundpack
     */
    async switchSoundpack(soundpackId) {
        try {
            await triggerEngine.switchSoundpack(soundpackId);
            this.activeSoundpackId = soundpackId;
            this.renderTriggers();
            this.renderSoundpacks();
        } catch (err) {
            console.error('Error switching soundpack:', err);
            this.showNotification('Failed to switch soundpack', 'error');
        }
    }

    /**
     * RENDERING
     */

    /**
     * Render soundpack list
     */
    renderSoundpacks() {
        const container = document.getElementById('soundpack-list');
        if (!container) return;

        if (this.soundpacks.length === 0) {
            container.innerHTML = '<p class="empty-state">No soundpacks created yet.</p>';
            return;
        }

        const html = this.soundpacks.map(sp => {
            const isActive = sp.id === this.activeSoundpackId;
            return `
                <div class="soundpack-item ${isActive ? 'active' : ''}">
                    <div class="soundpack-info">
                        <h4>${this.escapeHtml(sp.title)}</h4>
                        <p class="meta">Created ${this.formatDate(sp.created_at)}</p>
                    </div>
                    <div class="soundpack-actions">
                        <button class="bar-btn-small activate-soundpack" data-id="${sp.id}">
                            ${isActive ? '✓ Active' : 'Activate'}
                        </button>
                        <button class="bar-btn-small delete-soundpack" data-id="${sp.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        // Attach event listeners
        container.querySelectorAll('.activate-soundpack').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchSoundpack(parseInt(btn.dataset.id));
            });
        });

        container.querySelectorAll('.delete-soundpack').forEach(btn => {
            btn.addEventListener('click', () => {
                this.deleteSoundpack(parseInt(btn.dataset.id));
            });
        });
    }

    /**
     * Render trigger list with audio upload UI
     */
    renderTriggers() {
        const container = document.getElementById('trigger-list');
        if (!container) return;

        if (!this.activeSoundpackId) {
            container.innerHTML = '<p class="empty-state">Select a soundpack first</p>';
            return;
        }

        const triggers = triggerEngine.getAllTriggers();
        const soundpackMapping = triggerEngine.getActiveSoundpackMapping() || {};
        const isOwner = triggerEngine.activeSoundpackIsOwner; // Use engine state

        container.innerHTML = triggers.map(trigger => {
            const hasAudio = soundpackMapping[trigger.id];
            const isEnabled = trigger.enabled;

            return `
                <div class="trigger-item" data-trigger-id="${trigger.id}">
                    <div class="trigger-header">
                        <div class="trigger-info">
                            <h5>${this.escapeHtml(trigger.name)}</h5>
                            <p class="description">${this.escapeHtml(trigger.description || '')}</p>
                            <div class="trigger-stats">
                                <span class="stat">🔥 Fired: ${trigger.fireCount}</span>
                                <span class="stat">⏱️ Last: ${trigger.lastFired ? this.formatTime(trigger.lastFired) : 'Never'}</span>
                            </div>
                        </div>
                        <div class="trigger-controls">
                            <button class="toggle-trigger bar-btn-small ${isEnabled ? 'enabled' : 'disabled'}" 
                                    data-trigger-id="${trigger.id}">
                                ${isEnabled ? '✓ Enabled' : '✗ Disabled'}
                            </button>
                        </div>
                    </div>

                    <div class="audio-section">
                        <div class="audio-status">
                            ${hasAudio ? `
                                <div class="audio-assigned">
                                    🎵 Audio: <strong>${this.escapeHtml(hasAudio.filename)}</strong>
                                </div>
                            ` : `
                                <div class="audio-empty">📭 No audio assigned</div>
                            `}
                        </div>

                        <div class="audio-controls">
                            ${isOwner ? `
                                <div class="upload-area" data-trigger-id="${trigger.id}">
                                    <label class="upload-label">
                                        <span>Drag MP3 or click to upload</span>
                                        <input type="file" class="audio-upload-input" 
                                            accept=".mp3,audio/mpeg" 
                                            style="display: none;">
                                    </label>
                                    <div class="upload-progress" style="display: none;"></div>
                                </div>
                            ` : ''}

                            <div class="audio-actions">
                                ${hasAudio ? `<button class="test-audio bar-btn-small" data-trigger-id="${trigger.id}">🔊 Test</button>` : ''}
                                ${(isOwner && hasAudio) ? `<button class="remove-audio bar-btn-small" data-trigger-id="${trigger.id}">Remove</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.attachTriggerEventListeners();
    }

    /**
     * Attach event listeners to trigger elements
     */
    attachTriggerEventListeners() {
        const container = document.getElementById('trigger-list');
        if (!container) return;

        // --- FIX 1: THE MASTER GUARD ---
        // If the listener is already there, don't add another one.
        if (container.dataset.listenerAttached === 'true') {
            console.log('🛡️ Listener already attached to #trigger-list, skipping...');
            return;
        }

        console.log('✅ Attaching unified event listener to #trigger-list');

        // --- FIX 2: TARGETED CLICK HANDLER ---
        container.addEventListener('click', async (e) => {
            const target = e.target;
            
            // Find the specific button or the closest button class
            const testBtn = target.closest('.test-audio');
            const toggleBtn = target.closest('.toggle-trigger');
            const removeBtn = target.closest('.remove-audio');
            
            const triggerItem = target.closest('.trigger-item');
            if (!triggerItem) return;
            
            const triggerId = parseInt(triggerItem.dataset.triggerId);

            // --- FIX 3: STOP PROPAGATION ---
            // Once we find a match, stop the event from reaching other potential listeners
            if (testBtn || toggleBtn || removeBtn) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }

            if (testBtn) {
                console.log(`🎯 SHOULD ONLY SEE THIS ONCE PER CLICK - testing audio for trigger ID: ${triggerId}`);
                await this.testAudio(triggerId);
                return;
            }

            if (toggleBtn) {
                const wasEnabled = triggerEngine.isTriggerEnabled(triggerId);
                triggerEngine.setTriggerEnabled(triggerId, !wasEnabled);
                this.renderTriggers();
                return;
            }

            if (removeBtn) {
                await this.removeAudio(triggerId);
                return;
            }
        }, true); // Use Capture Phase (true) to intercept before bubbling happens

        // Mark as attached so subsequent calls to this function do nothing
        container.dataset.listenerAttached = 'true';
    }

    /**
     * AUDIO UPLOAD & MANAGEMENT
     */

    /**
     * Upload audio file for a trigger
     */
    async uploadAudio(triggerId, file) {
        if (!this.activeSoundpackId) {
            this.showNotification('No soundpack selected', 'error');
            return;
        }

        // Validate file
        if (file.size > 5242880) { // 5MB
            this.showNotification('File exceeds 5MB limit', 'error');
            return;
        }

        if (file.type !== 'audio/mpeg' && !file.name.endsWith('.mp3')) {
            this.showNotification('Only MP3 files allowed', 'error');
            return;
        }

        const uploadArea = document.querySelector(`[data-trigger-id="${triggerId}"]`);
        const progressDiv = uploadArea?.querySelector('.upload-progress');

        try {
            // Show progress
            if (progressDiv) {
                progressDiv.style.display = 'block';
                progressDiv.innerHTML = 'Uploading...';
            }

            const formData = new FormData();
            formData.append('soundpack_id', this.activeSoundpackId);
            formData.append('trigger_id', triggerId);
            formData.append('audio_file', file);

            const response = await fetch('/soundapi/soundpack/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.success) {
                this.showNotification(`Audio uploaded for trigger ${triggerId}`, 'success');
                this.renderTriggers();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (err) {
            console.error('Upload error:', err);
            this.showNotification('Upload failed: ' + err.message, 'error');
        } finally {
            if (progressDiv) {
                progressDiv.style.display = 'none';
            }
            // TODO update gui to reflect new audio assignment without full re-render (currently causes flash and resets scroll position)
        }
    }

    /**
     * Test audio playback for a trigger
     */
    async testAudio(triggerId) {
        if (!this.activeSoundpackId) return;

        try {
            const formData = new FormData();
            formData.append('soundpack_id', this.activeSoundpackId);
            formData.append('trigger_id', triggerId);
            const response = await fetch('/soundapi/soundpack/test-audio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.success) {
                // Play the audio
                const audio = new Audio(result.data.url);
                const masterVolume = document.getElementById('master-volume')?.value || 80;
                audio.volume = Math.min(1, (masterVolume / 100) * 0.8);
                await audio.play();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (err) {
            console.error('Test audio error:', err);
            this.showNotification('Failed to test audio', 'error');
        }
    }

    /**
     * Remove audio from a trigger
     */
    async removeAudio(triggerId) {
        if (!this.activeSoundpackId) return;

        if (!confirm('Remove audio from this trigger?')) return;

        try {
            const formData = new FormData();
            formData.append('soundpack_id', this.activeSoundpackId);
            formData.append('trigger_id', triggerId);

            const response = await fetch('/soundapi/soundpack/removeaudio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.success) {
                this.showNotification('Audio removed', 'success');
                this.renderTriggers();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (err) {
            console.error('Remove audio error:', err);
            this.showNotification('Failed to remove audio', 'error');
        }
    }

    /**
     * MODALS & NOTIFICATIONS
     */

    showCreateSoundpackModal() {
        const modal = document.getElementById('create-soundpack-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('soundpack-title')?.focus();
        }
    }

    closeModal() {
        const modal = document.getElementById('create-soundpack-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.getElementById('soundpack-title').value = '';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#2d5016' : type === 'error' ? '#5a1f1a' : '#1a3a5a'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            font-size: 0.9em;
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    /**
     * Visual feedback for fired triggers
     */
    highlightFiredTrigger(triggerId) {
        const item = document.querySelector(`[data-trigger-id="${triggerId}"]`);
        if (item) {
            item.classList.add('fired');
            setTimeout(() => item.classList.remove('fired'), 500);
        }
    }

    /**
     * UTILITIES
     */

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString();
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);

        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('triggers-view')) {
        window.triggersManager = new TriggersManager();
    }
});