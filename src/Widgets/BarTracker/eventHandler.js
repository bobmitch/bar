/**
 * Event Handler - Processes incoming JSONL events and routes them to appropriate handlers
 * COMPLETE: Includes connection setup, start method, and all original functionality
 */

class EventHandler {
    constructor() {
        this.eventSource = null;
        this.isConnected = false;
        this.gameInitialized = false;
        this.eventHistory = [];
        this.lastStatsUpdate = 0;
        this.statsUpdateInterval = 500; // ms between UI updates
    }

    /**
     * INITIALIZE CONNECTION - Called from script.js with server URL
     */

    connect(serverUrl) {

         if (this.eventSource) {
            console.log('⏹️ Closing existing EventSource...');
            this.eventSource.close();
            this.eventSource = null;
        }

        console.log('🔌 Attempting to connect to:', serverUrl);
        
        try {
            this.eventSource = new EventSource(serverUrl);

            this.eventSource.onopen = () => {
                console.log('✅ Connected to event stream');
                this.isConnected = true;
                uiManager.setConnectionStatus(true);
            };

            this.eventSource.onmessage = (event) => {
                try {
                    this.handleMessage(JSON.parse(event.data));
                } catch (err) {
                    console.error('Error parsing event:', err);
                }
            };

            this.eventSource.onerror = (error) => {
                console.error('❌ EventSource error:', error);
                this.isConnected = false;
                uiManager.setConnectionStatus(false);
                
                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }

                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect...');
                    this.connect(serverUrl);
                }, 3000);
            };
        } catch (err) {
            console.error('Error setting up EventSource:', err);
            this.isConnected = false;
            uiManager.setConnectionStatus(false);
        }
    }

    /**
     * MAIN EVENT PROCESSING PIPELINE
     */

    handleMessage(data) {
        try {
            if (!data || typeof data !== 'object') {
                console.warn('⚠️ Invalid event data received');
                return;
            }

            const eventType = data.event;
            if (!eventType) {
                console.warn('⚠️ Event type missing from data');
                return;
            }

            console.log(`📨 Event received: ${eventType}`, {
                gameTime: data.gameTime,
                frame: data.frame
            });

            // Create event record for logging
            const eventRecord = {
                timestamp: Date.now(),
                gameTime: data.gameTime || 0,
                frame: data.frame || 0,
                data: data
            };

            // STEP 1: Update game state
            this.updateGameState(data);

            // STEP 2: Process event in data store
            if (typeof gameState !== 'undefined') {
                gameState.logEvent(eventRecord);
            }

            // STEP 3: Evaluate triggers
            this.evaluateTriggers(eventRecord);

            // STEP 4: Update UI
            this.updateUI(data, eventType);

            // STEP 5: Store in event history
            this.eventHistory.push(eventRecord);
            if (this.eventHistory.length > 10000) {
                this.eventHistory.shift(); // keep last 10000 events
            }

        } catch (err) {
            console.error('❌ Error handling message:', err, data);
        }
    }

    /**
     * GAME STATE UPDATES
     */

    updateGameState(data) {
        const eventType = data.event;

        // Initialize game context on first event with myTeamID
        if (!this.gameInitialized && data.myTeamID !== undefined) {
            this.initializeGame(data);
        }

        // Update global game frame/time
        if (data.gameTime !== undefined && typeof gameState !== 'undefined') {
            gameState.gameState.gameTime = data.gameTime;
        }
        if (data.frame !== undefined && typeof gameState !== 'undefined') {
            gameState.gameState.frame = data.frame;
        }

        // Route to appropriate handler based on event type
        switch (eventType) {
            case 'GameStart':
                this.initializeGame(data);
                break;
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
            case 'AllUnits':
                this.handleUpdateAllUnits(data);
                break;
        }
    }

    /**
     * EVENT HANDLERS
     */

    initializeGame(data) {
        console.log('🎮 Game initialized:', {
            player: data.playerName,
            team: data.myTeamID,
            ally: data.allyTeamID
        });

        if (typeof gameState !== 'undefined') {
            gameState.initGame({
                myTeamID: data.myTeamID,
                myPlayerID: data.myPlayerID,
                allyTeamID: data.allyTeamID,
                playerName: data.playerName
            });
        }

        this.gameInitialized = true;
    }

    handleUnitFinished(data) {
        if (typeof gameState === 'undefined') return;
        
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
        if (typeof gameState === 'undefined') return;
        
        gameState.damageUnit(
            data.unitID,
            data.damage,
            data.attackerID,
            data.attackerTeam
        );

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
        if (typeof gameState === 'undefined') return;
        
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

    handleUpdateAllUnits(data) {
        console.log('📦 Received allUnits update with', Object.keys(data.unitDefs).length, 'units');
        window.unitDefs = data.unitDefs;
    }

    handleFullStatsUpdate(data) {
        if (typeof gameState === 'undefined') return;
        
        const myTeamID = gameState.gameState.myTeamID;
        
        // Update game state with stats
        gameState.updateTeamStats(myTeamID, {
            metal: data.metal,
            energy: data.energy,
            combat: data.combat
        });

        // Update overflow status
        if (data.overflow_m !== undefined) {
            gameState.gameState.overflow_m = data.overflow_m;
        }
        if (data.overflow_e !== undefined) {
            gameState.gameState.overflow_e = data.overflow_e;
        }

        // Throttle UI updates to prevent spam
        const now = Date.now();
        if (now - this.lastStatsUpdate > this.statsUpdateInterval) {
            this.lastStatsUpdate = now;
            
            // Update UI with current stats - THIS IS THE KEY FIX
            const myTeam = gameState.getMyTeam();
            if (typeof uiManager !== 'undefined') {
                uiManager.updateTeamStatsPanel(myTeam, data);
                uiManager.updateGameStatus(data.gameTime, gameState.gameState);
            }
        }
    }

    handleOverflowStatusChanged(data) {
        if (typeof gameState === 'undefined') return;
        
        // Update game state
        if (data.resource === 'metal') {
            gameState.gameState.overflow_m = data.overflow_m === '1' || data.overflow_m === true;
        } else if (data.resource === 'energy') {
            gameState.gameState.overflow_e = data.overflow_e === '1' || data.overflow_e === true;
        }

        console.log('⚠️ Overflow status changed:', {
            resource: data.resource,
            overflow: data.overflow
        });
    }

    handleAllyStates(data) {
        if (typeof gameState === 'undefined') return;
        
        if (data.event === 'AllyStatesUpdate') {
            for (const [teamID, stats] of Object.entries(data.teams)) {
                let team = gameState.getTeam(parseInt(teamID));
                if (!team) {
                    // Create team record if it doesn't exist
                    team = { teamID: parseInt(teamID), isMyAlly: true };
                    gameState.teams.set(parseInt(teamID), team);
                }
                team.playerName = stats.playerName;
                team.metalStats = stats.metal;
                team.energyStats = stats.energy;
            }
        }
    }

    /**
     * TRIGGER EVALUATION
     */

    evaluateTriggers(eventRecord) {
        if (typeof triggerEngine === 'undefined') return;
        
        const firedTriggers = triggerEngine.evaluateAllTriggers(eventRecord);

        firedTriggers.forEach(triggerId => {
            this.handleTriggerFired(triggerId, eventRecord);
        });
    }

    handleTriggerFired(triggerId, eventRecord) {
        if (typeof triggerEngine === 'undefined') return;
        
        const trigger = triggerEngine.triggers.get(triggerId);
        if (!trigger) return;

        console.log('🎯 Trigger fired:', trigger.name);

        if (typeof uiManager !== 'undefined') {
            uiManager.updateTriggerFiredState(triggerId);
        }
    }

    /**
     * UI UPDATES
     */

    updateUI(data, eventType) {
        // Log event to UI (for all event types except FullStatsUpdate which is too frequent)
        if (eventType !== 'FullStatsUpdate' && typeof uiManager !== 'undefined') {
            uiManager.logEvent({
                timestamp: Date.now(),
                event: eventType,
                data: data
            });
        }
    }

    /**
     * START METHOD - Called from initialization script
     */

    start(serverUrl) {
        console.log('🚀 Starting EventHandler with server URL:', serverUrl);
        
        // Initialize UI listeners
        if (typeof uiManager !== 'undefined') {
            uiManager.initialize();
            console.log('✅ UI Manager initialized');
        }

        // Load saved trigger settings
        const saved = localStorage.getItem('BAR-trigger-settings');
        if (saved && typeof triggerEngine !== 'undefined') {
            triggerEngine.importSettings(JSON.parse(saved));
            console.log('✅ Trigger settings loaded from localStorage');
        }

        // Load streaming layout
        if (typeof streamingWidgets !== 'undefined') {
            streamingWidgets.loadLayout();
            console.log('✅ Streaming layout loaded');
        }

        // Connect to event stream
        this.connect(serverUrl);
        console.log('🎮 Event handler started - listening for events');
    }

    /**
     * DEBUGGING & TESTING
     */

    runAllTests() {
        console.log('═══════════════════════════════════════════');
        console.log('🧪 RUNNING DIAGNOSTIC TESTS');
        console.log('═══════════════════════════════════════════');
        this.testGameState();
        this.testElements();
        this.testAddUnit();
        console.log('═══════════════════════════════════════════');
    }

    testGameState() {
        console.log('🧪 TEST: Checking game state...');
        if (typeof gameState === 'undefined') {
            console.warn('⚠️ gameState not initialized');
            return;
        }
        console.log('Units in gameState:', gameState.units.size);
        console.log('Teams in gameState:', gameState.teams.size);
        console.log('Events logged:', gameState.events.length);
        console.log('My team ID:', gameState.gameState.myTeamID);
        console.log('Is connected:', this.isConnected);
    }

    testElements() {
        console.log('🧪 TEST: Checking DOM elements...');
        const elements = {
            'event-log': document.getElementById('event-log'),
            'status': document.getElementById('status'),
            'connection-status': document.getElementById('connection-status'),
            'game-time': document.getElementById('game-time'),
            'tab-buttons': document.querySelectorAll('.tab-btn').length
        };
        
        Object.entries(elements).forEach(([name, el]) => {
            const status = el ? (typeof el === 'number' ? `${el} found` : '✅ Found') : '❌ NOT FOUND';
            console.log(`  ${name}: ${status}`);
        });
    }

    testAddUnit() {
        console.log('🧪 TEST: Adding fake unit to gameState...');
        if (typeof gameState === 'undefined') {
            console.warn('⚠️ gameState not initialized');
            return;
        }
        
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

        const unit = gameState.addUnit(fakeUnitData.unitID, fakeUnitData);
        console.log('✅ Unit added:', {
            unitID: unit.unitID,
            unitName: unit.unitName,
            teamID: unit.teamID
        });
    }
}

// Create global instance
const eventHandler = new EventHandler();

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