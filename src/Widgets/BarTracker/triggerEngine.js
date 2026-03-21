/**
 * TriggerEngine - Enhanced with Audio Playback Integration
 * 
 * Features:
 * - Register and evaluate triggers in real-time
 * - Play sound effects when triggers fire
 * - Support for multiple soundpacks with dynamic switching
 * - Per-trigger enable/disable states
 * - Cooldown management to prevent spam
 * - Priority system: higher priority triggers can interrupt lower priority ones
 *   (if the active trigger is marked interruptable). Lower priority triggers
 *   are silently suppressed (audio + image) while a higher priority is active.
 * 
 * Fix #3: Non-repeatable triggers now use a permanent `firedOnce` flag that
 *         is only cleared on resetForNewGame(). The cooldown timeout no longer
 *         re-opens them.
 *
 * Priority system:
 *   - Each trigger has a `priority` integer (default 0; higher = more important).
 *   - Each trigger has an `interruptable` bool (default true).
 *   - When a trigger fires:
 *       • If something is already playing and it is NOT interruptable, and the
 *         new trigger's priority is <= the active priority → audio + image are
 *         suppressed for this fire (the trigger actions still run).
 *       • If the active sound IS interruptable and the new trigger's priority
 *         is >= the active priority → the active sound is stopped and the new
 *         one plays.
 *       • Priority state resets automatically via AudioBufferSourceNode.onended
 *         (Web Audio path) or Audio.addEventListener('ended') (HTML5 fallback).
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
        
        // ── Priority / interrupt state ────────────────────────────────────────
        // Tracks whatever is currently playing so incoming triggers can decide
        // whether to suppress or interrupt.
        this._activePriority      = -Infinity; // priority of the currently playing sound
        this._activeInterruptable = true;       // whether the current sound can be cut short
        this._activeSourceNode    = null;       // current AudioBufferSourceNode (Web Audio path)
        this._activeAudioEl       = null;       // current Audio element (HTML5 fallback path)

        // Initialize Web Audio API
        this.initializeAudio();

        this.activeSoundpackIsOwner = false;
    }

    // ── Priority helpers ──────────────────────────────────────────────────────

    /**
     * Returns true if a new trigger with `newPriority` is allowed to play
     * audio/show an image right now.
     *
     * Rules:
     *   • Nothing playing                          → always allowed
     *   • Active is interruptable AND new >= active → allowed (will interrupt)
     *   • Active is NOT interruptable              → allowed only if new > active
     *     (strictly higher priority can always break through)
     */
    _canPlay(newPriority) {
        if (this._activePriority === -Infinity) return true;
        if (this._activeInterruptable) return newPriority >= this._activePriority;
        return newPriority > this._activePriority;
    }

    /**
     * Stop whatever is currently playing (if anything) without waiting for
     * natural end.  Safe to call when nothing is active.
     */
    _stopActive() {
        if (this._activeSourceNode) {
            try { this._activeSourceNode.stop(); } catch (_) {}
            this._activeSourceNode = null;
        }
        if (this._activeAudioEl) {
            try {
                this._activeAudioEl.pause();
                this._activeAudioEl.currentTime = 0;
            } catch (_) {}
            this._activeAudioEl = null;
        }
        this._resetActivePriority();
    }

    /**
     * Reset priority state to "nothing playing".
     * Called from onended callbacks and _stopActive().
     */
    _resetActivePriority() {
        this._activePriority      = -Infinity;
        this._activeInterruptable = true;
        this._activeSourceNode    = null;
        this._activeAudioEl       = null;
    }

    /**
     * Claim the priority lock for a new sound about to start.
     */
    _claimPriority(priority, interruptable) {
        this._activePriority      = priority;
        this._activeInterruptable = interruptable;
    }

    // ─────────────────────────────────────────────────────────────────────────

    _applyImageMapping(soundpackId) {
        const imageMap = this.soundpackImages?.get(soundpackId) || {};
        // Reset all trigger image_srcs to null, then apply soundpack's mappings
        for (const trigger of this.triggers.values()) {
            trigger.image_src = imageMap[trigger.id] ?? null;
        }
    }

    getActiveSoundpackImageMapping() {
        if (!this.activeSoundpackId) return {};
        return this.soundpackImages?.get(this.activeSoundpackId) || {};
    }

    async loadSoundpack(soundpackId) {
        try {
            console.log(`📦 Loading soundpack ${soundpackId}...`);
            const response = await fetch(`/soundapi/soundpack/load?soundpack_id=${soundpackId}`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message);

            this.soundpacks.set(soundpackId, result.data.triggers);
            // Store image mapping keyed the same way as audio
            this.soundpackImages = this.soundpackImages || new Map();
            this.soundpackImages.set(soundpackId, result.data.images || {});

            this.activeSoundpackId = soundpackId;
            this.activeSoundpackIsOwner = result.data.is_owner;

            localStorage.setItem('BAR-active-soundpack-id', soundpackId);

            // Apply images from active soundpack onto trigger objects
            this._applyImageMapping(soundpackId);

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
            image_src = null,
            priority = 0,
            interruptable = true,
            conditions = [],
            actions = [],
        } = triggerDef;

        if (!id) throw new Error('Trigger must have an id');

        this.triggers.set(id, {
            id,
            name: name || `Trigger ${id}`,
            description: description || '',
            enabled,
            cooldown,
            repeatable,
            image_src,
            priority,
            interruptable,
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
        console.log(`✅ Trigger registered: ${name} (ID: ${id}, repeatable: ${repeatable}, priority: ${priority}, interruptable: ${interruptable}${image_src ? ', has image' : ''})`);
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

        console.log(`🎯 TRIGGER FIRED: ${trigger.name} (ID: ${triggerId}, priority: ${trigger.priority})`);

        // Update state
        state.lastFired = Date.now();
        state.fireCount++;
        state.cooldownActive = true;

        // Fix #3: mark non-repeatable triggers as permanently spent
        if (!trigger.repeatable) {
            state.firedOnce = true;
        }

        // Execute trigger actions
        let context = null;
        for (const action of trigger.actions) {
            try {
                const result = action(eventData, state.vars);
                if (result != null) context = result;
            } catch (err) {
                console.error(`Error executing action for trigger ${triggerId}:`, err);
            }
        }

        state.lastContext = context;

        // ── Priority gate for audio + image ──────────────────────────────────
        // Actions always run. Audio and image are suppressed or interrupted
        // based on the priority rules.
        const triggerPriority     = trigger.priority     ?? 0;
        const triggerInterruptable = trigger.interruptable ?? true;

        if (this._canPlay(triggerPriority)) {
            // Stop the current sound if we are interrupting it
            if (this._activePriority !== -Infinity) {
                console.log(`🔀 Interrupting active sound (priority ${this._activePriority}) with priority ${triggerPriority}`);
                this._stopActive();
            }

            // Claim the priority lock before async audio starts so a rapid
            // second trigger evaluated in the same tick sees the correct state.
            this._claimPriority(triggerPriority, triggerInterruptable);

            // Play audio cue (async; will reset priority via onended)
            this.playAudioForTrigger(triggerId);

            // Emit trigger event for widgets (image display checks priority internally)
            window.dispatchEvent(new CustomEvent('triggerFired', {
                detail: {
                    triggerId,
                    triggerName:   trigger.name,
                    timestamp:     Date.now(),
                    context,
                    image_src:     trigger.image_src ?? null,
                    priority:      triggerPriority,
                    interruptable: triggerInterruptable,
                    allowed:       true,
                }
            }));
        } else {
            // Suppressed: log but don't play audio or show image
            console.log(`🔇 Trigger "${trigger.name}" suppressed (priority ${triggerPriority} <= active ${this._activePriority}, active not interruptable)`);

            window.dispatchEvent(new CustomEvent('triggerFired', {
                detail: {
                    triggerId,
                    triggerName:   trigger.name,
                    timestamp:     Date.now(),
                    context,
                    image_src:     null,   // suppress image
                    priority:      triggerPriority,
                    interruptable: triggerInterruptable,
                    allowed:       false,  // widgets check this to skip display
                }
            }));
        }

        // Schedule cooldown reset.
        setTimeout(() => {
            state.cooldownActive = false;
        }, trigger.cooldown);
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
        // Also reset any active audio priority state
        this._stopActive();
        console.log('🔄 TriggerEngine: per-game state reset');
    }

    /**
     * AUDIO PLAYBACK
     */

    async playAudioForTrigger(triggerId) {
        if (!this.activeSoundpackId) {
            console.log(`No active soundpack for trigger ${triggerId}`);
            // Nothing to play; release the priority lock immediately
            this._resetActivePriority();
            return;
        }

        const soundpack = this.soundpacks.get(this.activeSoundpackId);
        if (!soundpack || !soundpack[triggerId]) {
            console.log(`No audio configured for trigger ${triggerId}`);
            // No audio file; release the priority lock immediately so it
            // doesn't block subsequent triggers unnecessarily.
            this._resetActivePriority();
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
            this._resetActivePriority();
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
            const source      = this.audioContext.createBufferSource();
            const gainNode    = this.audioContext.createGain();

            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            const masterVolume = document.getElementById('master-volume')?.value || 80;
            gainNode.gain.value = (masterVolume / 100) * 0.8;

            // ── onended: release priority lock when audio finishes naturally ──
            source.onended = () => {
                // Only reset if this source is still the active one.
                // If it was interrupted, _stopActive() already cleared the ref.
                if (this._activeSourceNode === source) {
                    console.log(`🔔 Audio ended for trigger ${triggerId} — releasing priority lock`);
                    this._resetActivePriority();
                }
            };

            // Register as the active source BEFORE starting so the onended
            // guard above can identify it correctly.
            this._activeSourceNode = source;

            source.start(0);
            console.log(`🔊 Playing audio for trigger ${triggerId} (Web Audio)`);
        } catch (err) {
            console.error(`Web Audio API error:`, err);
            this._resetActivePriority();
            this.playAudioViaHTML5(audioUrl, triggerId);
        }
    }

    playAudioViaHTML5(audioUrl, triggerId) {
        try {
            const audio = new Audio();
            const masterVolume = document.getElementById('master-volume')?.value || 80;
            audio.volume = Math.min(1, (masterVolume / 100) * 0.8);
            audio.src = audioUrl;

            // ── ended: release priority lock when audio finishes naturally ──
            audio.addEventListener('ended', () => {
                if (this._activeAudioEl === audio) {
                    console.log(`🔔 Audio ended for trigger ${triggerId} (HTML5) — releasing priority lock`);
                    this._resetActivePriority();
                }
            }, { once: true });

            // Register as active BEFORE play() call
            this._activeAudioEl = audio;

            audio.play().catch(err => {
                console.error(`Audio playback error:`, err);
                if (this._activeAudioEl === audio) this._resetActivePriority();
            });

            console.log(`🔊 Playing audio for trigger ${triggerId} (HTML5)`);
        } catch (err) {
            console.error(`Error creating audio element:`, err);
            this._resetActivePriority();
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
                // Re-apply image mapping when switching to an already-loaded pack
                this._applyImageMapping(soundpackId);
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
            cooldownActive: state.cooldownActive,
            priority: trigger.priority,
            interruptable: trigger.interruptable,
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