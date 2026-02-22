/**
 * TriggerEngine - Enhanced with Audio Playback Integration
 * 
 * Features:
 * - Register and evaluate triggers in real-time
 * - Play sound effects when triggers fire
 * - Support for multiple soundpacks with dynamic switching
 * - Per-trigger enable/disable states
 * - Cooldown management to prevent spam
 * 
 * Fix #3: Non-repeatable triggers now use a permanent `firedOnce` flag that
 *         is only cleared on resetForNewGame(). The cooldown timeout no longer
 *         re-opens them.
 */

class TriggerEngine {
    constructor() {
        this.triggers = new Map();
        this.triggerStates = new Map(); // Track: { lastFired, fireCount, cooldownActive, firedOnce }
        this.soundpacks = new Map(); // Store loaded soundpacks { soundpackId -> { triggerId -> audioUrl } }
        this.activeSoundpackId = null;
        
        this.defaultCooldown = 1000; // 1 second default cooldown between same trigger fires
        this.audioContext = null;
        this.audioCache = new Map(); // Cache audio buffers for faster playback
        
        // Initialize Web Audio API
        this.initializeAudio();

        this.activeSoundpackIsOwner = false;
    }

    async loadSoundpack(soundpackId) {
        try {
            console.log(`📦 Loading soundpack ${soundpackId}...`);
            const response = await fetch(`/soundapi/soundpack/load?soundpack_id=${soundpackId}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message);

            this.soundpacks.set(soundpackId, result.data.triggers);
            this.activeSoundpackId = soundpackId;
            this.activeSoundpackIsOwner = result.data.is_owner;

            localStorage.setItem('BAR-active-soundpack-id', soundpackId);

            console.log(`✅ Soundpack loaded: ${result.data.title} (Owner: ${this.activeSoundpackIsOwner})`);
            return result.data;
        } catch (err) {
            console.error(`Error loading soundpack:`, err);
            throw err;
        }
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
            repeatable = true,
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
            repeatable,
            conditions: Array.isArray(conditions) ? conditions : [conditions],
            actions: Array.isArray(actions) ? actions : [actions],
            createdAt: Date.now(),
            custom: true
        });

        this.triggerStates.set(id, {
            lastFired: null,
            fireCount: 0,
            cooldownActive: false,
            firedOnce: false,   // Fix #3: permanent gate for non-repeatable triggers
            enabled: enabled,
            vars:{} // Placeholder for any future per-trigger variables or state needed by actions
        });

        console.log(`✅ Trigger registered: ${name} (ID: ${id}, repeatable: ${repeatable})`);
    }

    /**
     * Evaluate all active triggers against an event.
     * Returns array of fired trigger IDs.
     */
    evaluateAllTriggers(eventData) {
        const firedTriggers = [];

        for (const [triggerId, trigger] of this.triggers) {
            const state = this.triggerStates.get(triggerId);

            // Skip if trigger is disabled
            if (!state.enabled) continue;

            // Fix #3: non-repeatable triggers that have already fired are permanently blocked
            // until resetForNewGame() is called.
            if (!trigger.repeatable && state.firedOnce) continue;

            // Skip if on cooldown (only meaningful for repeatable triggers)
            if (state.cooldownActive) continue;

            // Evaluate conditions
            let conditionsMet = true;
            for (const condition of trigger.conditions) {
                try {
                    if (!condition(eventData, state.vars)) {
                        conditionsMet = false;
                        break;
                    }
                } catch (err) {
                    console.error(`Error evaluating condition for trigger ${triggerId}:`, err);
                    conditionsMet = false;
                    break;
                }
            }

            if (conditionsMet) {
                this.fireTrigger(triggerId, eventData);
                firedTriggers.push(triggerId);
                uiManager.logTrigger(trigger);
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

        // Fix #3: mark non-repeatable triggers as permanently spent
        if (!trigger.repeatable) {
            state.firedOnce = true;
            // No cooldown timeout needed — firedOnce gates it permanently.
            // Still set cooldownActive so the timeout below clears it cleanly
            // (guards against any edge-case double-evaluation in the same tick).
        }

        // Execute trigger actions
        // save context for better trigger information in actions, if needed in the future
        let context = null;
        for (const action of trigger.actions) {
            try {
                const result = action(eventData, state.vars);
                if (result != null) context = result;
            } catch (err) {
                console.error(`Error executing action for trigger ${triggerId}:`, err);
            }
        }

        state.lastContext = context; // Store last action result for potential use in UI or debugging

        // Play audio cue if soundpack has audio for this trigger
        this.playAudioForTrigger(triggerId);

        // Schedule cooldown reset.
        // For non-repeatable triggers this just clears the cooldownActive flag;
        // firedOnce remains true and keeps the trigger blocked for the rest of the game.
        setTimeout(() => {
            state.cooldownActive = false;
        }, trigger.cooldown);

        // Emit event for UI updates
        // context now on DOM event for potential use in widgets or other UI components
        window.dispatchEvent(new CustomEvent('triggerFired', {
            detail: {
                triggerId,
                triggerName: trigger.name,
                timestamp: Date.now(),
                context
            }
        }));
    }

    /**
     * Reset all per-game trigger state (fireCount, lastFired, cooldowns, firedOnce).
     * Call this on GAME_START or when the user hits Reset.
     * Does NOT affect enabled/disabled state or soundpack assignments.
     */
    resetForNewGame() {
        for (const [triggerId, state] of this.triggerStates) {
            state.lastFired = null;
            state.fireCount = 0;
            state.cooldownActive = false;
            state.firedOnce = false;    // Fix #3: re-arm non-repeatable triggers for the new game
        }
        console.log('🔄 TriggerEngine: per-game state reset');
    }

    /**
     * AUDIO PLAYBACK
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

    async playAudio(audioUrl, triggerId) {
        try {
            if (this.audioContext) {
                await this.playAudioViaWebAudio(audioUrl, triggerId);
            } else {
                this.playAudioViaHTML5(audioUrl, triggerId);
            }
        } catch (err) {
            console.error(`Error playing audio for trigger ${triggerId}:`, err);
        }
    }

    async playAudioViaWebAudio(audioUrl, triggerId) {
        try {
            if (!this.audioCache.has(audioUrl)) {
                console.log(`📥 Loading audio: ${audioUrl}`);
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

            const masterVolume = document.getElementById('master-volume')?.value || 80;
            gainNode.gain.value = (masterVolume / 100) * 0.8;

            source.start(0);
            console.log(`🔊 Playing audio for trigger ${triggerId}`);
        } catch (err) {
            console.error(`Web Audio API error:`, err);
            this.playAudioViaHTML5(audioUrl, triggerId);
        }
    }

    playAudioViaHTML5(audioUrl, triggerId) {
        try {
            const audio = new Audio();
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

    async switchSoundpack(soundpackId) {
        try {
            if (!this.soundpacks.has(soundpackId)) {
                await this.loadSoundpack(soundpackId);
            } else {
                this.activeSoundpackId = soundpackId;
            }

            localStorage.setItem('BAR-active-soundpack-id', soundpackId);

            window.dispatchEvent(new CustomEvent('soundpackChanged', {
                detail: { 
                    soundpackId: this.activeSoundpackId, 
                    isOwner: this.activeSoundpackIsOwner 
                }
            }));
        } catch (err) {
            console.error('Error switching soundpack:', err);
        }
    }

    getActiveSoundpackMapping() {
        if (!this.activeSoundpackId) return null;
        return this.soundpacks.get(this.activeSoundpackId);
    }

    /**
     * TRIGGER STATE MANAGEMENT
     */

    setTriggerEnabled(triggerId, enabled) {
        const state = this.triggerStates.get(triggerId);
        if (state) {
            state.enabled = enabled;
            console.log(`Trigger ${triggerId} ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    toggleTrigger(triggerId) {
        const state = this.triggerStates.get(triggerId);
        if (state) {
            this.setTriggerEnabled(triggerId, !state.enabled);
            return !state.enabled;
        }
        return null;
    }

    isTriggerEnabled(triggerId) {
        const state = this.triggerStates.get(triggerId);
        return state ? state.enabled : false;
    }

    getAllTriggers() {
        const result = [];
        for (const [id, trigger] of this.triggers) {
            const state = this.triggerStates.get(id);
            result.push({
                ...trigger,
                ...state
            });
        }
        console.log(`Retrieved all triggers with states:`, result);
        return result;
    }

    /**
     * STATISTICS & DEBUGGING
     */

    getTriggerStats(triggerId) {
        const trigger = this.triggers.get(triggerId);
        const state = this.triggerStates.get(triggerId);

        if (!trigger || !state) return null;

        return {
            id: triggerId,
            name: trigger.name,
            enabled: state.enabled,
            repeatable: trigger.repeatable,
            firedOnce: state.firedOnce,
            fireCount: state.fireCount,
            lastFired: state.lastFired ? new Date(state.lastFired) : null,
            cooldownActive: state.cooldownActive
        };
    }

    getAllTriggerStats() {
        const stats = [];
        for (const triggerId of this.triggers.keys()) {
            stats.push(this.getTriggerStats(triggerId));
        }
        return stats;
    }

    clearAudioCache() {
        this.audioCache.clear();
        console.log('🗑️ Audio cache cleared');
    }

    /**
     * TESTING UTILITIES
     */

    testTrigger(triggerId, testEventData = {}) {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) {
            console.error(`Trigger ${triggerId} not found`);
            return false;
        }

        console.log(`🧪 Testing trigger: ${trigger.name}`);

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

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const savedPackId = localStorage.getItem('BAR-active-soundpack-id') || 1;
        triggerEngine.switchSoundpack(parseInt(savedPackId));
    }, 50); 
});

// Expose for console debugging
window.triggerEngine = triggerEngine;