/**
 * TriggerEngine - Enhanced with Audio Playback Integration
 * 
 * Features:
 * - Register and evaluate triggers in real-time
 * - Play sound effects when triggers fire
 * - Support for multiple soundpacks with dynamic switching
 * - Per-trigger enable/disable states
 * - Cooldown management to prevent spam
 */

class TriggerEngine {
    constructor() {
        this.triggers = new Map();
        this.triggerStates = new Map(); // Track: { lastFired, fireCount, cooldownActive }
        this.soundpacks = new Map(); // Store loaded soundpacks { soundpackId -> { triggerId -> audioUrl } }
        this.activeSoundpackId = null;
        
        this.defaultCooldown = 1000; // 1 second default cooldown between same trigger fires
        this.audioContext = null;
        this.audioCache = new Map(); // Cache audio buffers for faster playback
        
        // Initialize Web Audio API
        this.initializeAudio();
    }

    /**
     * AUDIO INITIALIZATION
     */

    initializeAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            console.log('✅ Web Audio API initialized');
        } catch (err) {
            console.warn('⚠️ Web Audio API not available:', err);
            this.audioContext = null;
        }
    }

    /**
     * TRIGGER REGISTRATION & MANAGEMENT
     */

    registerTrigger(triggerDef) {
        const {
            id,
            name,
            description,
            enabled = true,
            cooldown = this.defaultCooldown,
            conditions = [],
            actions = []
        } = triggerDef;

        if (!id) throw new Error('Trigger must have an id');

        this.triggers.set(id, {
            id,
            name: name || `Trigger ${id}`,
            description: description || '',
            enabled,
            cooldown,
            conditions: Array.isArray(conditions) ? conditions : [conditions],
            actions: Array.isArray(actions) ? actions : [actions],
            createdAt: Date.now(),
            custom: true
        });

        this.triggerStates.set(id, {
            lastFired: null,
            fireCount: 0,
            cooldownActive: false,
            enabled: enabled
        });

        console.log(`✅ Trigger registered: ${name} (ID: ${id})`);
    }

    /**
     * Evaluate all active triggers against an event
     * Returns array of fired trigger IDs
     */
    evaluateTriggers(eventData) {
        const firedTriggers = [];

        for (const [triggerId, trigger] of this.triggers) {
            const state = this.triggerStates.get(triggerId);

            // Skip if trigger is disabled
            if (!state.enabled) continue;

            // Skip if on cooldown
            if (state.cooldownActive) continue;

            // Evaluate conditions
            let conditionsMet = true;
            for (const condition of trigger.conditions) {
                try {
                    if (!condition(eventData)) {
                        conditionsMet = false;
                        break;
                    }
                } catch (err) {
                    console.error(`Error evaluating condition for trigger ${triggerId}:`, err);
                    conditionsMet = false;
                    break;
                }
            }

            // Fire trigger if all conditions met
            if (conditionsMet) {
                this.fireTrigger(triggerId, eventData);
                firedTriggers.push(triggerId);
            }
        }

        return firedTriggers;
    }

    /**
     * Fire a trigger - execute actions and play audio
     */
    fireTrigger(triggerId, eventData) {
        const trigger = this.triggers.get(triggerId);
        const state = this.triggerStates.get(triggerId);

        if (!trigger) {
            console.warn(`Trigger ${triggerId} not found`);
            return;
        }

        console.log(`🎯 TRIGGER FIRED: ${trigger.name} (ID: ${triggerId})`);

        // Update state
        state.lastFired = Date.now();
        state.fireCount++;
        state.cooldownActive = true;

        // Execute trigger actions
        for (const action of trigger.actions) {
            try {
                action(eventData);
            } catch (err) {
                console.error(`Error executing action for trigger ${triggerId}:`, err);
            }
        }

        // Play audio cue if soundpack has audio for this trigger
        this.playAudioForTrigger(triggerId);

        // Schedule cooldown reset
        setTimeout(() => {
            state.cooldownActive = false;
        }, trigger.cooldown);

        // Emit event for UI updates
        window.dispatchEvent(new CustomEvent('triggerFired', {
            detail: {
                triggerId,
                triggerName: trigger.name,
                timestamp: Date.now()
            }
        }));
    }

    /**
     * AUDIO PLAYBACK
     */

    /**
     * Play audio file associated with a trigger in the active soundpack
     */
    async playAudioForTrigger(triggerId) {
        if (!this.activeSoundpackId) {
            console.log(`No active soundpack for trigger ${triggerId}`);
            return;
        }

        const soundpack = this.soundpacks.get(this.activeSoundpackId);
        if (!soundpack || !soundpack[triggerId]) {
            console.log(`No audio configured for trigger ${triggerId}`);
            return;
        }

        const audioUrl = soundpack[triggerId].url;
        await this.playAudio(audioUrl, triggerId);
    }

    /**
     * Play audio file from URL
     * Uses Web Audio API for better control, falls back to HTML5 Audio
     */
    async playAudio(audioUrl, triggerId) {
        try {
            // Try Web Audio API first (better for game overlays)
            if (this.audioContext) {
                await this.playAudioViaWebAudio(audioUrl, triggerId);
            } else {
                // Fallback to HTML5 Audio element
                this.playAudioViaHTML5(audioUrl, triggerId);
            }
        } catch (err) {
            console.error(`Error playing audio for trigger ${triggerId}:`, err);
        }
    }

    /**
     * Play audio using Web Audio API
     */
    async playAudioViaWebAudio(audioUrl, triggerId) {
        try {
            // Check cache first
            if (!this.audioCache.has(audioUrl)) {
                console.log(`📥 Loading audio: ${audioUrl}`);
                
                // Fetch and decode audio
                const response = await fetch(audioUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.audioCache.set(audioUrl, audioBuffer);
                console.log(`✅ Audio cached: ${audioUrl}`);
            }

            const audioBuffer = this.audioCache.get(audioUrl);
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();

            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // Apply master volume
            const masterVolume = document.getElementById('master-volume')?.value || 80;
            gainNode.gain.value = (masterVolume / 100) * 0.8; // 0.8 = 80% to prevent clipping

            source.start(0);

            console.log(`🔊 Playing audio for trigger ${triggerId}`);
        } catch (err) {
            console.error(`Web Audio API error:`, err);
            // Fall back to HTML5
            this.playAudioViaHTML5(audioUrl, triggerId);
        }
    }

    /**
     * Play audio using HTML5 Audio element (fallback)
     */
    playAudioViaHTML5(audioUrl, triggerId) {
        try {
            const audio = new Audio();
            
            // Get master volume
            const masterVolume = document.getElementById('master-volume')?.value || 80;
            audio.volume = Math.min(1, (masterVolume / 100) * 0.8);

            audio.src = audioUrl;
            audio.play().catch(err => {
                console.error(`Audio playback error:`, err);
            });

            console.log(`🔊 Playing audio for trigger ${triggerId}`);
        } catch (err) {
            console.error(`Error creating audio element:`, err);
        }
    }

    /**
     * SOUNDPACK MANAGEMENT
     */

    /**
     * Load a soundpack - fetch trigger->audio mappings from server
     */
    async loadSoundpack(soundpackId) {
        try {
            console.log(`📦 Loading soundpack ${soundpackId}...`);

            const response = await fetch(
                `/soundapi?action=load&soundpack_id=${soundpackId}`,
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message);
            }

            // Store soundpack mapping
            const triggerMap = {};
            for (const [triggerId, audio] of Object.entries(result.data.triggers)) {
                triggerMap[triggerId] = audio;
            }

            this.soundpacks.set(soundpackId, triggerMap);
            this.activeSoundpackId = soundpackId;

            console.log(`✅ Soundpack loaded: ${result.data.title}`);
            console.log(`   Configured triggers:`, Object.keys(triggerMap).length);

            return result.data;
        } catch (err) {
            console.error(`Error loading soundpack:`, err);
            throw err;
        }
    }

    /**
     * Switch to a different soundpack
     */
    async switchSoundpack(soundpackId) {
        try {
            if (this.soundpacks.has(soundpackId)) {
                // Already loaded, just switch
                this.activeSoundpackId = soundpackId;
                console.log(`🔄 Switched to soundpack ${soundpackId}`);
            } else {
                // Need to load
                await this.loadSoundpack(soundpackId);
            }

            // Emit event for UI updates
            window.dispatchEvent(new CustomEvent('soundpackChanged', {
                detail: { soundpackId, soundpackTitle: this.soundpacks.get(soundpackId)?.title }
            }));
        } catch (err) {
            console.error(`Error switching soundpack:`, err);
        }
    }

    /**
     * Get mapping for current soundpack
     */
    getActiveSoundpackMapping() {
        if (!this.activeSoundpackId) return null;
        return this.soundpacks.get(this.activeSoundpackId);
    }

    /**
     * TRIGGER STATE MANAGEMENT
     */

    /**
     * Enable or disable a specific trigger
     */
    setTriggerEnabled(triggerId, enabled) {
        const state = this.triggerStates.get(triggerId);
        if (state) {
            state.enabled = enabled;
            console.log(`Trigger ${triggerId} ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Toggle trigger enable state
     */
    toggleTrigger(triggerId) {
        const state = this.triggerStates.get(triggerId);
        if (state) {
            this.setTriggerEnabled(triggerId, !state.enabled);
            return !state.enabled;
        }
        return null;
    }

    /**
     * Check if trigger is enabled
     */
    isTriggerEnabled(triggerId) {
        const state = this.triggerStates.get(triggerId);
        return state ? state.enabled : false;
    }

    /**
     * Get all triggers with their states
     */
    getAllTriggers() {
        const result = [];
        for (const [id, trigger] of this.triggers) {
            const state = this.triggerStates.get(id);
            result.push({
                ...trigger,
                ...state
            });
        }
        return result;
    }

    /**
     * STATISTICS & DEBUGGING
     */

    /**
     * Get statistics for a specific trigger
     */
    getTriggerStats(triggerId) {
        const trigger = this.triggers.get(triggerId);
        const state = this.triggerStates.get(triggerId);

        if (!trigger || !state) return null;

        return {
            id: triggerId,
            name: trigger.name,
            enabled: state.enabled,
            fireCount: state.fireCount,
            lastFired: state.lastFired ? new Date(state.lastFired) : null,
            cooldownActive: state.cooldownActive
        };
    }

    /**
     * Get all trigger statistics
     */
    getAllTriggerStats() {
        const stats = [];
        for (const triggerId of this.triggers.keys()) {
            stats.push(this.getTriggerStats(triggerId));
        }
        return stats;
    }

    /**
     * Clear all cached audio buffers
     */
    clearAudioCache() {
        this.audioCache.clear();
        console.log('🗑️ Audio cache cleared');
    }

    /**
     * TESTING UTILITIES
     */

    /**
     * Test trigger by manually evaluating it
     */
    testTrigger(triggerId, testEventData = {}) {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) {
            console.error(`Trigger ${triggerId} not found`);
            return false;
        }

        console.log(`🧪 Testing trigger: ${trigger.name}`);

        // Evaluate conditions with test data
        let conditionsMet = true;
        for (const condition of trigger.conditions) {
            try {
                if (!condition(testEventData)) {
                    conditionsMet = false;
                    break;
                }
            } catch (err) {
                console.error(`Condition evaluation error:`, err);
                conditionsMet = false;
            }
        }

        if (conditionsMet) {
            console.log(`✅ Test passed - conditions met`);
            this.fireTrigger(triggerId, testEventData);
            return true;
        } else {
            console.log(`❌ Test failed - conditions not met`);
            return false;
        }
    }
}

// Singleton instance
const triggerEngine = new TriggerEngine();
triggerEngine.loadSoundpack(1);

// Expose for console debugging
window.triggerEngine = triggerEngine;