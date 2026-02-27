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
 * 
 * FIXES APPLIED:
 * ✅ Complete drag-and-drop event handlers with visual feedback
 * ✅ File input click handler for "click to upload"
 * ✅ Proper event delegation for dynamically rendered elements
 * ✅ Console debugging for troubleshooting
 */

async function apiFetch(url, options = {}) {
    const headers = options.headers || {};
    
    if (window.csrfToken) {
        headers['X-CSRF-Token'] = window.csrfToken;
    }

    return fetch(url, {
        ...options,
        headers
    });
}

class TriggersManager {
    constructor() {
        this.soundpacks = [];
        this.activeSoundpackId = null;
        this.initializeElements();
        this.attachEventListeners();

        // Only bootstrap if the engine is ready and we aren't already rendering
        if (window.triggerEngine && triggerEngine.activeSoundpackId) {
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

                <!-- Giphy Sticker Picker Modal -->
                <div id="giphy-picker-modal" class="modal hidden">
                    <div class="modal-content bar-panel" style="width: 520px; max-width: 95vw;">
                        <h4>🎞️ CHOOSE A GIPHY STICKER</h4>
                        <div class="form-group" style="display:flex;gap:8px;">
                            <input type="text" id="giphy-search-input" placeholder="Search stickers..." maxlength="100"
                                style="flex:1;" />
                            <button id="giphy-search-btn" class="bar-btn-primary">Search</button>
                        </div>
                        <div id="giphy-results" class="giphy-results">
                            <p class="empty-state">Type something to search Giphy stickers.</p>
                        </div>
                        <div class="modal-actions" style="margin-top:10px;">
                            <button id="giphy-cancel-btn" class="bar-btn-small">Cancel</button>
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
        // GUARD: Ensure window listeners are only added ONCE per page session
        if (window.triggersManagerListenersAttached) return;

        window.addEventListener('triggerFired', (e) => {
            this.highlightFiredTrigger(e.detail.triggerId);
        });

        // CONSOLIDATED: Single listener for soundpack changes
        window.addEventListener('soundpackChanged', (e) => {
            this.activeSoundpackId = e.detail.soundpackId;
            this.renderSoundpacks();
            this.renderTriggers(); 
        });

        // Giphy modal search button
        document.addEventListener('click', async (e) => {
            if (e.target.id === 'giphy-search-btn' || e.target.closest('#giphy-search-btn')) {
                const q = document.getElementById('giphy-search-input')?.value?.trim();
                if (q) await this.searchGiphy(q);
            }
            if (e.target.id === 'giphy-cancel-btn') {
                this.closeGiphyModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.getElementById('giphy-picker-modal')?.classList.contains('hidden') === false) {
                const q = document.getElementById('giphy-search-input')?.value?.trim();
                if (q) this.searchGiphy(q);
            }
            if (e.key === 'Escape') this.closeGiphyModal();
        });

        window.triggersManagerListenersAttached = true;
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
     * Render soundpack list
     */
    renderSoundpacks() {
        const container = document.getElementById('soundpack-list');
        if (!container) return;

        if (this.soundpacks.length === 0) {
            container.innerHTML = '<p class="empty-state">No soundpacks created yet. Create one to get started!</p>';
            return;
        }

        const html = this.soundpacks.map(sp => {
            const isActive = sp.id === this.activeSoundpackId;
            return `
                <div class="soundpack-item ${isActive ? 'active' : ''}">
                    <div class="soundpack-info">
                        <h4>${this.escapeHtml(sp.title)}</h4>
                        <p class="meta">Created ${this.formatDate(sp.created)}</p>
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

        // Attach modal listeners
        const createBtn = document.getElementById('create-soundpack-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openModal());
        }

        const modalCreateBtn = document.getElementById('modal-create-btn');
        const modalCancelBtn = document.getElementById('modal-cancel-btn');

        if (modalCreateBtn) {
            modalCreateBtn.addEventListener('click', () => {
                this.createSoundpack();
            });
        }

        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }
    }

    /**
     * Open create soundpack modal
     */
    openModal() {
        const modal = document.getElementById('create-soundpack-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('soundpack-title').focus();
        }
    }

    /**
     * Close create soundpack modal
     */
    closeModal() {
        const modal = document.getElementById('create-soundpack-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.getElementById('soundpack-title').value = '';
        }
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

                    <div class="image-section" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
                        <div class="image-status">
                            ${trigger.image_src
                                ? `<div class="image-assigned" style="display:flex;align-items:center;gap:8px;">
                                        <img src="${this.escapeHtml(trigger.image_src)}" alt="sticker preview"
                                            style="height:48px;width:48px;object-fit:contain;border-radius:4px;background:#111;">
                                        <span style="font-size:0.75em;color:#aaa;word-break:break-all;">${this.escapeHtml(trigger.image_src)}</span>
                                </div>`
                                : `<div class="image-empty" style="color:#666;font-size:0.8em;">🖼️ No sticker assigned</div>`
                            }
                        </div>
                        <div class="image-actions" style="margin-top:6px;display:flex;gap:6px;">
                            <button class="pick-giphy bar-btn-small" data-trigger-id="${trigger.id}">🎞️ Giphy Sticker</button>
                            ${trigger.image_src ? `<button class="clear-image bar-btn-small" data-trigger-id="${trigger.id}">✕ Clear</button>` : ''}
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

        // --- GUARD: Prevent multiple listener attachments ---
        if (container.dataset.listenerAttached === 'true') {
            console.log('🛡️ Listener already attached to #trigger-list, skipping...');
            return;
        }

        console.log('✅ Attaching unified event listener to #trigger-list');

        // --- CLICK HANDLER: Test, Toggle, Remove ---
        container.addEventListener('click', async (e) => {
            const target = e.target;
            
            const testBtn = target.closest('.test-audio');
            const toggleBtn = target.closest('.toggle-trigger');
            const removeBtn = target.closest('.remove-audio');
            
            const triggerItem = target.closest('.trigger-item');
            if (!triggerItem) return;
            
            const triggerId = parseInt(triggerItem.dataset.triggerId);

            if (testBtn || toggleBtn || removeBtn) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }

            if (testBtn) {
                console.log(`🔊 Testing audio for trigger ${triggerId}`);
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

            const pickGiphyBtn = target.closest('.pick-giphy');
            const clearImageBtn = target.closest('.clear-image');

            if (pickGiphyBtn || clearImageBtn) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }

            if (pickGiphyBtn) {
                this.openGiphyModal(triggerId);
                return;
            }

            if (clearImageBtn) {
                await this.clearImage(triggerId);
                return;
            }

        }, true);

        // --- DRAG & DROP HANDLERS: Visual Feedback + Upload ---

        container.addEventListener('dragenter', (e) => {
            e.preventDefault(); // MUST be before any early return
            if (!e.target.closest('.upload-area')) return;
            e.stopImmediatePropagation();
            
            const uploadArea = e.target.closest('.upload-area');
            if (uploadArea) {
                uploadArea.classList.add('dragover');
                console.log(`🎯 Dragenter on upload area (trigger ${uploadArea.dataset.triggerId})`);
            }
        }, true);

        container.addEventListener('dragover', (e) => {
            e.preventDefault(); // MUST be before any early return
            if (!e.target.closest('.upload-area')) return;
            e.stopImmediatePropagation();
            e.dataTransfer.dropEffect = 'copy';
        }, true);

        container.addEventListener('dragleave', (e) => {
            const uploadArea = e.target.closest('.upload-area');
            if (uploadArea && !uploadArea.contains(e.relatedTarget)) {
                uploadArea.classList.remove('dragover');
                console.log(`🎯 Dragleave from upload area (trigger ${uploadArea.dataset.triggerId})`);
            }
        }, true);

        container.addEventListener('drop', async (e) => {
            const uploadArea = e.target.closest('.upload-area');
            if (!uploadArea) return;
            
            e.preventDefault();
            e.stopImmediatePropagation();
            uploadArea.classList.remove('dragover');
            
            const triggerId = parseInt(uploadArea.dataset.triggerId);
            const files = e.dataTransfer.files;
            
            console.log(`📥 Drop detected on trigger ${triggerId}, ${files.length} file(s)`);
            
            if (files.length > 0) {
                const file = files[0];
                console.log(`📁 File: ${file.name} (${file.type}, ${file.size} bytes)`);
                await this.uploadAudio(triggerId, file);
            }
        }, true);

        // --- FILE INPUT CHANGE HANDLER ---
        container.addEventListener('change', async (e) => {
            const fileInput = e.target;
            if (!fileInput.classList.contains('audio-upload-input')) return;
            
            e.preventDefault();
            e.stopImmediatePropagation();
            
            if (fileInput.files.length > 0) {
                const uploadLabel = fileInput.closest('.upload-label');
                const uploadArea = uploadLabel.closest('.upload-area');
                const triggerId = parseInt(uploadArea.dataset.triggerId);
                const file = fileInput.files[0];
                
                console.log(`📁 File selected via dialog: ${file.name} (trigger ${triggerId})`);
                await this.uploadAudio(triggerId, file);
                
                // Reset input for reuse
                fileInput.value = '';
            }
        }, true);

        // Mark as attached
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

        const uploadArea = document.querySelector(`.upload-area[data-trigger-id="${triggerId}"]`);
        const progressDiv = uploadArea?.querySelector('.upload-progress');

        try {
            // Show progress
            if (progressDiv) {
                progressDiv.style.display = 'block';
                progressDiv.innerHTML = '⏳ Uploading...';
            }

            const formData = new FormData();
            formData.append('soundpack_id', this.activeSoundpackId);
            formData.append('trigger_id', triggerId);
            formData.append('audio_file', file);

            console.log(`📤 Uploading to /soundapi/soundpack/upload (soundpack: ${this.activeSoundpackId}, trigger: ${triggerId})`);

            const response = await apiFetch('/soundapi/soundpack/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.success) {
                this.showNotification(`✅ Audio uploaded for trigger ${triggerId}`, 'success');
                console.log('✅ Upload successful:', result.data);
                
                // Update trigger item dynamically instead of full re-render
                this.updateTriggerAudioUI(triggerId, result.data.filename, true);
            } else {
                this.showNotification(result.message || 'Upload failed', 'error');
                console.error('❌ Upload failed:', result.message);
            }
        } catch (err) {
            console.error('Upload error:', err);
            this.showNotification('Upload failed: ' + err.message, 'error');
        } finally {
            if (progressDiv) {
                progressDiv.style.display = 'none';
            }
        }
    }

    /**
     * Update trigger item UI when audio is uploaded
     * Dynamic DOM update instead of full re-render
     */
    updateTriggerAudioUI(triggerId, filename, hasAudio = true) {
        const triggerItem = document.querySelector(`[data-trigger-id="${triggerId}"]`);
        if (!triggerItem) return;

        const audioStatusDiv = triggerItem.querySelector('.audio-status');
        const audioActionsDiv = triggerItem.querySelector('.audio-actions');

        if (audioStatusDiv) {
            if (hasAudio) {
                audioStatusDiv.innerHTML = `
                    <div class="audio-assigned">
                        🎵 Audio: <strong>${this.escapeHtml(filename)}</strong>
                    </div>
                `;
            } else {
                audioStatusDiv.innerHTML = `
                    <div class="audio-empty">📭 No audio assigned</div>
                `;
            }
        }

        // Update action buttons dynamically
        if (audioActionsDiv) {
            if (hasAudio) {
                // Add test and remove buttons if they don't exist
                if (!audioActionsDiv.querySelector('.test-audio')) {
                    const testBtn = document.createElement('button');
                    testBtn.className = 'test-audio bar-btn-small';
                    testBtn.dataset.triggerId = triggerId;
                    testBtn.textContent = '🔊 Test';
                    testBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        await this.testAudio(triggerId);
                    });
                    audioActionsDiv.appendChild(testBtn);
                }

                if (!audioActionsDiv.querySelector('.remove-audio')) {
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-audio bar-btn-small';
                    removeBtn.dataset.triggerId = triggerId;
                    removeBtn.textContent = 'Remove';
                    removeBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        await this.removeAudio(triggerId);
                    });
                    audioActionsDiv.appendChild(removeBtn);
                }
            } else {
                // Remove test and remove buttons if they exist
                const testBtn = audioActionsDiv.querySelector('.test-audio');
                const removeBtn = audioActionsDiv.querySelector('.remove-audio');
                if (testBtn) testBtn.remove();
                if (removeBtn) removeBtn.remove();
            }
        }

        // Visual feedback
        triggerItem.classList.add('audio-updated');
        setTimeout(() => triggerItem.classList.remove('audio-updated'), 600);
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
            
            const response = await apiFetch('/soundapi/soundpack/test-audio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.success) {
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

            const response = await apiFetch('/soundapi/soundpack/removeaudio', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.success) {
                this.showNotification('✅ Audio removed', 'success');
                
                // Update trigger item dynamically
                this.updateTriggerAudioUI(triggerId, null, false);
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (err) {
            console.error('Remove audio error:', err);
            this.showNotification('Failed to remove audio', 'error');
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

            const response = await apiFetch('/soundapi/soundpack/create', {
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

            const response = await apiFetch('/soundapi/soundpack/remove', {
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
            console.log(`🔄 Switching to soundpack ${soundpackId}...`);
            
            // Use triggerEngine's built-in switchSoundpack method
            // This handles loading and event dispatch automatically
            await triggerEngine.switchSoundpack(soundpackId);
            
            // Update local state
            this.activeSoundpackId = soundpackId;
            
            console.log(`✅ Switched to soundpack ${soundpackId}`);
        } catch (err) {
            console.error('Error switching soundpack:', err);
            this.showNotification('Failed to switch soundpack', 'error');
        }
    }

    /**
     * UI FEEDBACK
     */

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
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

        notification.textContent = message;
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

    /**
     * GIPHY STICKER PICKER
     */

    openGiphyModal(triggerId) {
        const modal = document.getElementById('giphy-picker-modal');
        if (!modal) return;
        modal.dataset.triggerId = triggerId;
        modal.classList.remove('hidden');
        document.getElementById('giphy-search-input')?.focus();
        // Show current image info in results if set
        const trigger = triggerEngine.triggers.get(triggerId);
        const resultsEl = document.getElementById('giphy-results');
        if (trigger?.image_src) {
            resultsEl.innerHTML = `<p class="empty-state" style="font-size:0.8em;">Current: <img src="${this.escapeHtml(trigger.image_src)}" style="height:32px;vertical-align:middle;"> — search below to replace.</p>`;
        } else {
            resultsEl.innerHTML = `<p class="empty-state">Type something to search Giphy stickers.</p>`;
        }
    }

    closeGiphyModal() {
        const modal = document.getElementById('giphy-picker-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.dataset.triggerId   = '';
        modal.dataset.giphyQuery  = '';
        modal.dataset.giphyOffset = '0';
        const input = document.getElementById('giphy-search-input');
        if (input) input.value = '';
        document.getElementById('giphy-results').innerHTML = '';
    }

    async searchGiphy(query) {
        const resultsEl = document.getElementById('giphy-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '<p class="empty-state">⏳ Searching...</p>';

        // Store on the modal element so loadMoreGiphy can access it
        const modal = document.getElementById('giphy-picker-modal');
        modal.dataset.giphyQuery  = query;
        modal.dataset.giphyOffset = '0';

        await this._fetchGiphyPage(query, 0, false);
    }

    async loadMoreGiphy() {
        const modal = document.getElementById('giphy-picker-modal');
        const query  = modal.dataset.giphyQuery  || '';
        const offset = parseInt(modal.dataset.giphyOffset || '0');
        if (!query) return;
        await this._fetchGiphyPage(query, offset, true);
    }

    async _fetchGiphyPage(query, offset, append) {
        const resultsEl = document.getElementById('giphy-results');
        const modal     = document.getElementById('giphy-picker-modal');
        const LIMIT     = 18;

        // Show spinner — either replace content or show at bottom
        if (!append) {
            resultsEl.innerHTML = '<p class="empty-state">⏳ Searching...</p>';
        } else {
            // Disable the more button while loading
            const moreBtn = resultsEl.querySelector('.giphy-more-btn');
            if (moreBtn) {
                moreBtn.disabled = true;
                moreBtn.textContent = '⏳ Loading...';
            }
        }

        try {
            const response = await apiFetch(
                `/soundapi/soundpack/giphysearch?q=${encodeURIComponent(query)}&limit=${LIMIT}&offset=${offset}`,
                { method: 'GET' }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();

            if (!result.success) {
                if (!append) {
                    resultsEl.innerHTML = `<p class="empty-state" style="color:#f44;">${this.escapeHtml(result.message)}</p>`;
                }
                return;
            }

            const items    = result.data.items     || [];
            const hasMore  = result.data.has_more;
            const newOffset = result.data.next_offset;

            // Update stored offset for the next "more" click
            modal.dataset.giphyOffset = String(newOffset);

            if (!append) {
                if (items.length === 0) {
                    resultsEl.innerHTML = '<p class="empty-state">No stickers found. Try a different search.</p>';
                    return;
                }
                // Fresh render
                resultsEl.innerHTML = `
                    <div class="giphy-grid"></div>
                    <p class="giphy-attribution">Powered by Giphy</p>
                `;
            } else {
                // Remove old more-button before appending
                resultsEl.querySelector('.giphy-more-btn')?.remove();
            }

            const grid = resultsEl.querySelector('.giphy-grid');
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'giphy-item';
                el.dataset.url = item.url;
                el.title = item.title;
                el.innerHTML = `<img src="${this.escapeHtml(item.preview)}" loading="lazy" />`;
                el.addEventListener('click', async () => {
                    resultsEl.querySelectorAll('.giphy-item').forEach(i => i.classList.remove('selected'));
                    el.classList.add('selected');
                    const triggerId = parseInt(modal?.dataset.triggerId || '0');
                    if (triggerId && item.url) {
                        await this.saveImage(triggerId, item.url);
                    }
                });
                grid.appendChild(el);
            });

            // Add / re-add more button if there are more results
            if (hasMore) {
                const moreBtn = document.createElement('button');
                moreBtn.className = 'giphy-more-btn bar-btn-small';
                moreBtn.textContent = '↓ Load More';
                moreBtn.addEventListener('click', () => this.loadMoreGiphy());
                // Insert before the attribution line
                const attr = resultsEl.querySelector('.giphy-attribution');
                resultsEl.insertBefore(moreBtn, attr);
            }

        } catch (err) {
            console.error('Giphy search error:', err);
            if (!append) {
                resultsEl.innerHTML = `<p class="empty-state" style="color:#f44;">Search failed: ${this.escapeHtml(err.message)}</p>`;
            }
        }
    }

    async saveImage(triggerId, imageUrl) {
        try {
            const formData = new FormData();
            formData.append('trigger_id', triggerId);
            formData.append('image_url', imageUrl);

            const response = await apiFetch('/soundapi/soundpack/setimage', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();

            if (result.success) {
                // Update the live triggerEngine so it takes effect immediately without page reload
                const trigger = triggerEngine.triggers.get(triggerId);
                if (trigger) trigger.image_src = imageUrl;

                this.updateTriggerImageUI(triggerId, imageUrl);
                this.showNotification('✅ Sticker saved!', 'success');
                this.closeGiphyModal();
            } else {
                this.showNotification(result.message || 'Failed to save image', 'error');
            }
        } catch (err) {
            console.error('Save image error:', err);
            this.showNotification('Failed to save sticker: ' + err.message, 'error');
        }
    }

    async clearImage(triggerId) {
        try {
            const formData = new FormData();
            formData.append('trigger_id', triggerId);

            const response = await apiFetch('/soundapi/soundpack/clearimage', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();

            if (result.success) {
                // Update live engine
                const trigger = triggerEngine.triggers.get(triggerId);
                if (trigger) trigger.image_src = null;

                this.updateTriggerImageUI(triggerId, null);
                this.showNotification('✅ Sticker cleared', 'success');
            } else {
                this.showNotification(result.message || 'Failed to clear image', 'error');
            }
        } catch (err) {
            console.error('Clear image error:', err);
            this.showNotification('Failed to clear sticker: ' + err.message, 'error');
        }
    }

    /**
     * Update the image section for a trigger without full re-render
     */
    updateTriggerImageUI(triggerId, imageUrl) {
        const triggerItem = document.querySelector(`.trigger-item[data-trigger-id="${triggerId}"]`);
        if (!triggerItem) return;

        const imageStatusDiv = triggerItem.querySelector('.image-status');
        const imageActionsDiv = triggerItem.querySelector('.image-actions');

        if (imageStatusDiv) {
            if (imageUrl) {
                imageStatusDiv.innerHTML = `
                    <div class="image-assigned" style="display:flex;align-items:center;gap:8px;">
                        <img src="${this.escapeHtml(imageUrl)}" alt="sticker preview"
                            style="height:48px;width:48px;object-fit:contain;border-radius:4px;background:#111;">
                        <span style="font-size:0.75em;color:#aaa;word-break:break-all;">${this.escapeHtml(imageUrl)}</span>
                    </div>`;
            } else {
                imageStatusDiv.innerHTML = `<div class="image-empty" style="color:#666;font-size:0.8em;">🖼️ No sticker assigned</div>`;
            }
        }

        if (imageActionsDiv) {
            // Rebuild action buttons
            imageActionsDiv.innerHTML = `
                <button class="pick-giphy bar-btn-small" data-trigger-id="${triggerId}">🎞️ Giphy Sticker</button>
                ${imageUrl ? `<button class="clear-image bar-btn-small" data-trigger-id="${triggerId}">✕ Clear</button>` : ''}
            `;
            // The existing delegated click listener on #trigger-list covers these new buttons automatically
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('triggers-view')) {
        window.triggersManager = new TriggersManager();
    }
});