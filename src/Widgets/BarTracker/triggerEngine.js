/**
 * TriggerEngine - Evaluation and firing of custom game triggers
 * Supports both built-in and user-defined triggers with easy configuration
 */

class TriggerEngine {
    constructor() {
        this.triggers = new Map();        // triggerID -> triggerDefinition
        this.triggerStates = new Map();   // triggerID -> { lastFired, count, cooldown }
        this.activeListeners = new Set(); // Currently subscribed event types
        
        // Callbacks
        this.onTrigger = null;            // Called when trigger fires
        this.onError = null;              // Called on evaluation error
        
        // Default cooldown between same trigger fires (prevent spam)
        this.defaultCooldown = 1000; // ms
        
        // Load built-in triggers
        // NO MORE BUILTINS
        // this.registerBuiltInTriggers();
    }

    /**
     * TRIGGER REGISTRATION & MANAGEMENT
     */

    // Helper to safely extract event data (handles eventRecord structure from eventHandler)
    getEventType(event) {
        // event can be:
        // 1. eventRecord from eventHandler: { timestamp, frame, gameTime, data: { event: "...", ...fields } }
        // 2. raw event: { event: "...", ...fields }
        return event.data?.event || event.event;
    }

    getEventData(event) {
        // event can be:
        // 1. eventRecord from eventHandler: { timestamp, frame, gameTime, data: { event: "...", ...fields } }
        //    → return event.data (which contains event, unitID, unitName, etc.)
        // 2. raw event: { event: "...", ...fields }
        //    → return event (which contains unitID, unitName, etc.)
        
        // If event.data has an 'event' property, it's the raw data we want
        if (event.data && typeof event.data.event === 'string') {
            return event.data;
        }
        // Otherwise event itself is the raw data
        return event;
    }

    registerTrigger(triggerDef) {
        console.log('Registering trigger:', triggerDef);
        const {
            id,
            name,
            description,
            enabled = true,
            repeatable,
            cooldown = this.defaultCooldown,
            conditions = [],
            actions = []
        } = triggerDef;

        if (!id) throw new Error('Trigger must have an id');
        
        this.triggers.set(id, {
            id,
            name: name || id,
            description: description || '',
            enabled,
            repeatable,
            cooldown,
            conditions, // Array of condition functions
            actions,    // Array of action functions (sound, visual, etc)
            createdAt: Date.now(),
            custom: true
        });

        this.triggerStates.set(id, {
            lastFired: null,
            fireCount: 0,
            cooldownActive: false
        });
    }


    /**
     * TRIGGER EVALUATION & FIRING
     */

    evaluateTrigger(triggerId, event) {
        const trigger = this.triggers.get(triggerId);
        if (!trigger || !trigger.enabled) return false;
        
        // Check cooldown
        const state = this.triggerStates.get(triggerId);
        if (state.cooldownActive) return false;
        // check repeatable
        if (!trigger.repeatable && state.fireCount > 0) return false;
        
        // Evaluate all conditions
        try {
            for (const condition of trigger.conditions) {
                if (typeof condition === 'function') {
                    if (!condition(event)) return false;
                }
            }
        } catch (err) {
            console.error(`Trigger ${triggerId} condition error:`, err);
            if (this.onError) this.onError(triggerId, err);
            return false;
        }
        
        return true;
    }

    fireTrigger(triggerId, event) {
        const trigger = this.triggers.get(triggerId);
        if (!trigger) return null;

        try {
            const results = [];
            
            // Execute all actions
            for (const action of trigger.actions) {
                if (typeof action === 'function') {
                    const result = action(event);
                    if (result) results.push(result);
                }
            }

            // Update trigger state
            const state = this.triggerStates.get(triggerId);
            state.lastFired = Date.now();
            state.fireCount += 1;
            
            // Set cooldown
            state.cooldownActive = true;
            setTimeout(() => {
                state.cooldownActive = false;
            }, trigger.cooldown * 1000); // Convert seconds to ms

            // Notify listeners
            if (this.onTrigger) {
                this.onTrigger({
                    triggerId,
                    triggerName: trigger.name,
                    timestamp: Date.now(),
                    actions: results,
                    event: event
                });
            }

            return results;
        } catch (err) {
            console.error(`Trigger ${triggerId} action error:`, err);
            if (this.onError) this.onError(triggerId, err);
            return null;
        }
    }

    /**
     * EVENT ROUTING - Called from main event handler
     */

    evaluateAllTriggers(event) {
        const eventType = event.data?.event;
        const firedTriggers = [];

        for (const [triggerId, trigger] of this.triggers.entries()) {
            if (this.evaluateTrigger(triggerId, event)) {
                this.fireTrigger(triggerId, event);
                firedTriggers.push(triggerId);
            }
        }

        return firedTriggers;
    }

    /**
     * CONFIGURATION & CUSTOMIZATION
     */

    // Enable/disable trigger
    setTriggerEnabled(triggerId, enabled) {
        const trigger = this.triggers.get(triggerId);
        if (trigger) {
            trigger.enabled = enabled;
            return true;
        }
        return false;
    }

    // Change cooldown
    setTriggerCooldown(triggerId, cooldownMs) {
        const trigger = this.triggers.get(triggerId);
        if (trigger) {
            trigger.cooldown = cooldownMs;
            return true;
        }
        return false;
    }

    // Get all triggers with state
    getAllTriggers() {
        const result = [];
        for (const [id, trigger] of this.triggers.entries()) {
            const state = this.triggerStates.get(id);
            result.push({
                ...trigger,
                state: state
            });
        }
        return result;
    }

    // Get trigger config (for settings panel)
    getTriggerConfig(triggerId) {
        const trigger = this.triggers.get(triggerId);
        const state = this.triggerStates.get(triggerId);
        
        return {
            id: triggerId,
            name: trigger.name,
            description: trigger.description,
            enabled: trigger.enabled,
            cooldown: trigger.cooldown,
            lastFired: state.lastFired,
            fireCount: state.fireCount
        };
    }

    // Save/load trigger settings
    exportSettings() {
        const settings = {};
        for (const [id, trigger] of this.triggers.entries()) {
            settings[id] = {
                enabled: trigger.enabled,
                cooldown: trigger.cooldown
            };
        }
        return settings;
    }

    importSettings(settings) {
        for (const [id, config] of Object.entries(settings)) {
            if (this.triggers.has(id)) {
                this.setTriggerEnabled(id, config.enabled);
                this.setTriggerCooldown(id, config.cooldown);
            }
        }
    }

    /**
     * HELPERS
     */

    getAverageMetalIncome(seconds = 120) {
        const trend = gameState.getResourceTrend(
            gameState.gameState.myTeamID,
            seconds,
            'metal'
        );
        
        if (trend.length === 0) return 0;
        return trend.reduce((sum, s) => sum + s.income, 0) / trend.length;
    }

    getPreviousTeamSnapshot() {
        // Returns a snapshot from stats history
        if (gameState.statsHistory.length < 2) return null;
        const previous = gameState.statsHistory[gameState.statsHistory.length - 2];
        return previous?.stats || null;
    }
}

// Singleton instance
const triggerEngine = new TriggerEngine();
