/**
 * EventHandler - Main event pipeline
 * Connects EventSource -> GameStateStore -> TriggerEngine -> UI/Audio
 */

class EventHandler {
    constructor() {
        this.eventSource = null;
        this.isConnected = false;
        this.gameInitialized = false;
        
        // Track update frequency
        this.lastStatsUpdate = 0;
        this.statsUpdateInterval = 1000; // ms

        this.eventHistory = []; // store recent events for reference (could be used for triggers or UI)

        // Unit name cache from server
        this.unitNames = {};
    }

    /**
     * INITIALIZE CONNECTION
     */

    connect(serverUrl) {
        try {
            this.eventSource = new EventSource(serverUrl);

            this.eventSource.onopen = () => {
                console.log('✅ Connected to event stream');
                this.isConnected = true;
                uiManager.setConnectionStatus(true);
            };

            this.eventSource.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.eventSource.onerror = (error) => {
                console.error('❌ EventSource error:', error);
                this.isConnected = false;
                uiManager.setConnectionStatus(false);
            };
        } catch (err) {
            console.error('Error connecting to event stream:', err);
        }
    }

    /**
     * MESSAGE HANDLING PIPELINE
     */

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            const eventType = data.event;

            // Create event record for game state
            const eventRecord = {
                timestamp: Date.now(),
                frame: data.frame || 0,
                gameTime: data.gameTime || 0,
                data: data
            };

            // STEP 1: Update game state
            this.updateGameState(data);

            // STEP 2: Process event in data store
            gameState.logEvent(eventRecord);

            // STEP 3: Evaluate triggers
            this.evaluateTriggers(eventRecord);

            // STEP 4: Update UI
            this.updateUI(data, eventType);

            // STEP 5: Handle audio/visual cues
            // (handled by trigger engine)

            // STEP 6: Store in event history
            this.eventHistory.push(eventRecord);
            if (this.eventHistory.length > 10000) {
                this.eventHistory.shift(); // keep last 10000 events
            }

        } catch (err) {
            console.error('Error handling message:', err);
        }
    }

    /**
     * GAME STATE UPDATES
     */

    updateGameState(data) {
        const eventType = data.event;

        // Initialize game context
        if (!this.gameInitialized && data.myTeamID !== undefined) {
            this.initializeGame(data);
        }

        // Update game frame/time
        if (data.gameTime !== undefined) {
            gameState.gameState.gameTime = data.gameTime;
        }
        if (data.frame !== undefined) {
            gameState.gameState.frame = data.frame;
        }

        // Route to appropriate handler
        switch (eventType) {
            case 'UnitFinished':
                this.handleUnitFinished(data);
                break;
            case 'UnitDamaged':
                this.handleUnitDamaged(data);
                break;
            case 'UnitDestroyed':
                this.handleUnitDestroyed(data);
                break;
            case 'FullStatsUpdate':
                this.handleFullStatsUpdate(data);
                break;
            case 'OverflowStatusChanged':
                this.handleOverflowStatusChanged(data);
                break;
            case 'AllyStatesUpdate':
                this.handleAllyStates(data);
                break;
        }
    }

    initializeGame(data) {
        console.log('🎮 Game initialized:', {
            player: data.playerName,
            team: data.myTeamID,
            ally: data.allyTeamID
        });

        gameState.initGame({
            myTeamID: data.myTeamID,
            myPlayerID: data.myPlayerID,
            allyTeamID: data.allyTeamID,
            playerName: data.playerName
        });

        this.gameInitialized = true;
    }

    handleOverflowStatusChanged(data) {
        // data has .resource ("metal" or "energy") and .overflow ("1" or "0")
        if (data.resource === 'metal') {
            gameState.gameState.overflow_m = data.overflow_m === "1";
        } else if (data.resource === 'energy') {
            gameState.gameState.overflow_e = data.overflow_e === "1";
        }

        console.log('⚠️ Overflow status changed:', {
            resource: data.resource,
            overflow: data.overflow
        });

        say (`${data.resource} overflow status: ${data.overflow === "1" ? 'Overflowing' : 'Normal'}`);

        // Update UI to reflect overflow status
        // uiManager.updateOverflowStatus(data.overflow_m, data.overflow_e);
    }

    handleAllyStates(data) {
        if (data.event === 'AllyStatsUpdate') {
            for (const [teamID, stats] of Object.entries(data.teams)) {
                let team = gameState.getTeam(parseInt(teamID));
                if (!team) {
                    // Create record if it doesn't exist
                    team = { teamID: parseInt(teamID), isMyAlly: true };
                    gameState.teams.set(parseInt(teamID), team);
                }
                team.playerName = stats.playerName;
                team.metalStats = stats.metal;
                team.energyStats = stats.energy;
            }
        }
    }

    handleUnitFinished(data) {
        const unit = gameState.addUnit(data.unitID, {
            unitDefID: data.unitDefID,
            unitName: data.unitName,
            unitTeam: data.unitTeam,
            unitTier: data.unitTier || 1,
            unitMetalCost: data.unitMetalCost || 0,
            relation: data.relation,
            playerName: data.playerName
        });

        console.log('✅ Unit finished:', {
            unitName: data.unitName,
            unitID: data.unitID,
            relation: data.relation
        });
    }

    handleUnitDamaged(data) {
        gameState.damageUnit(
            data.unitID,
            data.damage,
            data.attackerID,
            data.attackerTeam
        );

        // Only log significant damage
        const unit = gameState.getUnit(data.unitID);
        if (unit && data.damage > 100) {
            console.log('💥 Unit damaged:', {
                unit: unit.unitName,
                damage: data.damage,
                totalTaken: unit.damageTaken
            });
        }
    }

    handleUnitDestroyed(data) {
        gameState.destroyUnit(
            data.unitID,
            data.attackerID,
            data.attackerTeam
        );

        console.log('💀 Unit destroyed:', {
            victim: data.unitName,
            attacker: data.attackerName,
            metalLost: data.unitMetalCost
        });
    }

    handleFullStatsUpdate(data) {
        const myTeamID = gameState.gameState.myTeamID;
        
        // Update team stats
        gameState.updateTeamStats(myTeamID, {
            metal: data.metal,
            energy: data.energy,
            combat: data.combat
        });

        // Throttle UI updates to prevent spam
        const now = Date.now();
        if (now - this.lastStatsUpdate > this.statsUpdateInterval) {
            this.lastStatsUpdate = now;
            uiManager.updateGameStatus(data.gameTime, gameState.gameState);
            uiManager.updateResourceStats(data.metal, data.energy);
            uiManager.updateTeamStats(gameState.getMyTeam(), data.combat);
        }
    }

    /**
     * TRIGGER EVALUATION
     */

    evaluateTriggers(eventRecord) {
        const firedTriggers = triggerEngine.evaluateAllTriggers(eventRecord);

        firedTriggers.forEach(triggerId => {
            this.handleTriggerFired(triggerId, eventRecord);
        });
    }

    handleTriggerFired(triggerId, eventRecord) {
        const trigger = triggerEngine.triggers.get(triggerId);
        if (!trigger) return;

        console.log('🎯 Trigger fired:', trigger.name);

        // Update UI to show trigger fired
        uiManager.updateTriggerFiredState(triggerId);

        // TODO: Store in streaming widget history
        

        // Execute audio cues (via trigger actions)
        // Actions are already handled by triggerEngine.fireTrigger()
    }

    /**
     * UI UPDATES
     */

    updateUI(data, eventType) {
        console.log(`🎯 updateUI called with eventType: ${eventType}`);
        
        // Log event to UI
        uiManager.logEvent({
            timestamp: Date.now(),
            event: eventType,
            data: data
        });

        // Handle specific UI updates based on event type

        // TODO: Update streaming widgets
        
    }

    /**
     * DEBUGGING & TESTING
     */

    // TEST: Manually add a fake unit to the roster
    testAddUnit() {
        console.log('🧪 TEST: Adding fake unit to roster...');
        
        const fakeUnitData = {
            unitID: 9999,
            unitDefID: 42,
            unitName: 'armraider',
            unitTeam: gameState.gameState.myTeamID || 0,
            unitTier: 1,
            unitMetalCost: 200,
            relation: 'self',
            playerName: 'TestPlayer'
        };

        // Add to game state first
        gameState.addUnit(fakeUnitData.unitID, fakeUnitData);
        console.log('✅ Unit added to gameState');

        // Then add to UI
        uiManager.addUnitToRoster(fakeUnitData.unitID, fakeUnitData);
        console.log('✅ Unit added to roster UI');
    }

    // TEST: Check if elements exist
    testElements() {
        console.log('🧪 TEST: Checking DOM elements...');
        const roster = document.getElementById('unit-roster');
        console.log('unit-roster element:', roster ? '✅ Found' : '❌ NOT FOUND');
        if (roster) {
            console.log('  - Parent:', roster.parentElement?.className);
            console.log('  - Child count:', roster.children.length);
            console.log('  - Has .unit-empty:', roster.querySelector('.unit-empty') ? 'Yes' : 'No');
        }
    }

    // TEST: Check game state
    testGameState() {
        console.log('🧪 TEST: Checking game state...');
        console.log('Units in gameState:', gameState.units.size);
        console.log('Teams in gameState:', gameState.teams.size);
        console.log('Events logged:', gameState.events.length);
        console.log('My team ID:', gameState.gameState.myTeamID);
        console.log('All units:', Array.from(gameState.units.values()).map(u => ({
            id: u.unitID,
            name: u.unitName,
            team: u.teamID
        })));
    }

    // RUN ALL TESTS
    runAllTests() {
        console.log('═══════════════════════════════════════════');
        console.log('🧪 RUNNING DIAGNOSTIC TESTS');
        console.log('═══════════════════════════════════════════');
        this.testElements();
        console.log('');
        this.testGameState();
        console.log('');
        this.testAddUnit();
        console.log('═══════════════════════════════════════════');
    }

    start(serverUrl) {
        // Load saved settings
        const saved = localStorage.getItem('BAR-trigger-settings');
        if (saved) {
            triggerEngine.importSettings(JSON.parse(saved));
            uiManager.initializeTriggerList();
        }

        // Load streaming layout

        // TODO: streaming layout widget
        //streamingWidgets.loadLayout();

        // Connect to event stream
        this.connect(serverUrl);

        // Setup trigger engine callbacks
        triggerEngine.onTrigger = (triggerEvent) => {
            this.onTriggerFired(triggerEvent);
        };

        // Periodic UI updates
        // TODO: streaming stuff

        console.log('🚀 Event handler started');
    }

    /**
     * TRIGGER ACTION HANDLERS
     */

    onTriggerFired(triggerEvent) {
        console.log('🔊 Trigger actions:', triggerEvent);

        // Execute audio cues
        for (const action of triggerEvent.actions) {
            if (action.audio) {
                this.playAudio(action.audio);
            }
            if (action.visual) {
                this.playVisualEffect(action.visual);
            }
        }
    }

    playAudio(text) {
        if (!audioManager) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = audioManager.masterVolume;
        utterance.rate = 1;
        
        console.log('🔊 Playing audio:', text);
        window.speechSynthesis.cancel(); // Cancel any previous speech
        window.speechSynthesis.speak(utterance);
    }

    playVisualEffect(visual) {
        if (!visual) return;

        console.log('✨ Visual effect:', visual.type);

        switch (visual.type) {
            case 'unit-highlight':
                this.highlightUnit(visual.unitID, visual.color || 'gold', visual.duration);
                break;
            case 'screen-pulse':
                this.screenPulse(visual.color, visual.intensity, visual.duration);
                break;
            case 'full-screen-notification':
                this.showNotification(visual.unit, visual.duration);
                break;
        }
    }

    highlightUnit(unitID, color, duration) {
        const card = document.querySelector(`#unit-${unitID}`);
        if (card) {
            card.style.borderColor = color;
            card.style.boxShadow = `0 0 20px ${color}`;
            setTimeout(() => {
                card.style.borderColor = '';
                card.style.boxShadow = '';
            }, duration || 2000);
        }
    }

    screenPulse(color, intensity, duration) {
        // Add full screen pulse effect
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: ${color};
            opacity: ${intensity === 'high' ? 0.3 : 0.1};
            z-index: -1;
            pointer-events: none;
            animation: fadeOut ${(duration || 2000) / 1000}s ease-out;
        `;
        document.body.appendChild(overlay);
        
        setTimeout(() => overlay.remove(), duration || 2000);
    }

    showNotification(text, duration) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-secondary);
            border: 2px solid var(--accent-primary);
            color: var(--text-primary);
            padding: 2rem;
            border-radius: 12px;
            font-size: 1.5rem;
            font-weight: 700;
            z-index: 9999;
            animation: scaleIn ${(duration || 3000) / 1000}s ease-out;
        `;
        notification.textContent = text;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), duration || 3000);
    }
}

// Singleton instance
const eventHandler = new EventHandler();

// Audio Manager (simple stub)
class AudioManager {
    constructor() {
        this.masterVolume = 0.8;
    }

    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }
}

const audioManager = new AudioManager();

// Utility function for unit name display
function getName(unitName) {
    // This would pull from a localization/naming file
    // For now, just capitalize and remove underscores
    return unitName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Auto-initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Get the server URL from PHP (passed via data attribute or fetch)
    const serverUrl = new URLSearchParams(window.location.search).get('stream_url') ||
                     'https://barapi.bobmitch.com/subscribe?topic=' + encodeURIComponent(window.uuid);

    eventHandler.start(serverUrl);

    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeOut {
            from { opacity: 0.3; }
            to { opacity: 0; }
        }
        @keyframes scaleIn {
            from { 
                transform: translate(-50%, -50%) scale(0.5);
                opacity: 0;
            }
            to { 
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
});
