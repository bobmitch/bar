/**
 * Event Handler - Processes incoming JSONL events and routes them to appropriate handlers
 * COMPLETE: Includes connection setup, start method, and all original functionality
 * 
 * UPDATED: All event type strings replaced with BAR_EVENTS constants (eventTypes.js)
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

            // Warn on unknown event types so new events from the LUA widget surface immediately
            if (!BAR_EVENT_META[eventType]) {
                console.warn(`⚠️ Unknown event type received: "${eventType}" — add to eventTypes.js`);
            }

            const meta = getEventMeta(eventType);

            if (!meta.throttle) {
                console.log(`📨 Event received: ${eventType}`, {
                    gameTime: data.gameTime,
                    frame: data.frame
                });
            }

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
            this.updateUI(data, eventType, meta);

            // STEP 5: Store in event history
            this.eventHistory.push(eventRecord);
            if (this.eventHistory.length > 10000) {
                this.eventHistory.shift(); // keep last 10000 events
            }

            // STEP 6:  Update widgets
            // make sure statWidgets is loaded in case we dynamically load this in future
            if (typeof statWidgets !== 'undefined') {
                statWidgets.tick();
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
            case BAR_EVENTS.GAME_START:
                this.initializeGame(data);
                break;
            case BAR_EVENTS.UNIT_FINISHED:
                this.handleUnitFinished(data);
                break;
            case BAR_EVENTS.UNIT_DAMAGED:
                this.handleUnitDamaged(data);
                break;
            case BAR_EVENTS.UNIT_DESTROYED:
                this.handleUnitDestroyed(data);
                break;
            case BAR_EVENTS.FULL_STATS_UPDATE:
                this.handleFullStatsUpdate(data);
                break;
            case BAR_EVENTS.OVERFLOW_STATUS_CHANGED:
                this.handleOverflowStatusChanged(data);
                break;
            case BAR_EVENTS.ALLY_STATES_UPDATE:
                this.handleAllyStates(data);
                break;
            case BAR_EVENTS.ALLY_STATS_UPDATE:
                this.handleAllyStats(data);
                break;
            case BAR_EVENTS.ALLY_COLORS_UPDATE:
                this.handleAllyColors(data);
                break;
            case BAR_EVENTS.ALL_UNITS:
                this.handleUpdateAllUnits(data);
                break;
            case BAR_EVENTS.WIDGET_INITIALIZED_PRE_GAME:
                // Pre-game init — no state changes needed, connection confirmed
                break;
            case BAR_EVENTS.GAME_OVER:
                this.handleGameOver(data);
                break;
            case BAR_EVENTS.PLAYER_BECAME_SPECTATOR:
                // No state needed — handled via trigger
                break;
            // NOTE: BAR_EVENTS.ALLY_STATS_UPDATE is handled in handleFullStatsUpdate
            // flow — add a dedicated case here if ally stats need separate state updates
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

    handleGameOver(data) {
        console.log('🏁 Game over received', data);
        // Placeholder — add end-of-game state handling here
    }

    handleUnitFinished(data) {
        if (typeof gameState === 'undefined') return;
        
        gameState.addUnit(data.unitID, {
            unitDefID:     data.unitDefID,
            unitName:      data.unitName,
            unitTeam:      data.unitTeam,
            unitTier:      data.unitTier || 1,
            unitMetalCost: data.unitMetalCost || 0,
            unitBuildSpeed: data.unitBuildSpeed || 0,   // ← ADDED: was always 0 before
            relation:      data.relation,
            playerName:    data.playerName
        });
 
        console.log('✅ Unit finished:', {
            unitName:      data.unitName,
            unitID:        data.unitID,
            relation:      data.relation,
            unitBuildSpeed: data.unitBuildSpeed || 0    // ← log it so it's verifiable
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
        // Reset BEFORE processing the incoming unit defs
        // we only get this data once per game, so we can be aggressive about resetting state here to ensure accuracy
        if (typeof uiManager !== 'undefined') {
            uiManager.resetAll();
        }
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
            
            const myTeam = gameState.getMyTeam();
            if (typeof uiManager !== 'undefined') {
                uiManager.updateTeamStatsPanel(myTeam, data);
                uiManager.updateGameStatus(data.gameTime, gameState.gameState);
            }
        }
    }

    handleOverflowStatusChanged(data) {
        if (typeof gameState === 'undefined') return;
        
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
        
        // Guard: this handler is for AllyStatesUpdate, not AllyStatsUpdate
        if (data.event !== BAR_EVENTS.ALLY_STATES_UPDATE) return;

        for (const [teamID, stats] of Object.entries(data.teams)) {
            //let team = gameState.getTeam(parseInt(teamID));
            const team = gameState.initTeam(parseInt(teamID), {       // ✅ idempotent — safe to call repeatedly
                isMyAlly:   true,
                playerName: stats.playerName
            });

            if (!team) {
                console.error('Failed to initialize team for ally states update:', teamID);
                team = { teamID: parseInt(teamID), isMyAlly: true };
                gameState.teams.set(parseInt(teamID), team);
            }
            team.playerName = stats.playerName;
            team.metalStats = stats.metal;
            team.energyStats = stats.energy;
        }
    }

    handleAllyStats(data) {
        if (typeof gameState === 'undefined') return;
        if (!data.teams || typeof data.teams !== 'object') return;

        for (const [teamIDStr, stats] of Object.entries(data.teams)) {
            const teamID = parseInt(teamIDStr);
            const team = gameState.initTeam(teamID, {
                isMyAlly:   true,
                playerName: stats.playerName
            });
            team.playerName  = stats.playerName;
            team.metalStats  = stats.metal  || {};
            team.energyStats = stats.energy || {};
        }
    }

    /**
     * ALLY COLORS
     * Stores the in-game team color on each ally team object so
     * widgets can use matching colors on charts and overlays.
     *
     * data.colors shape (keyed by teamID string):
     *   { playerName, r, g, b, hex }
     */
    handleAllyColors(data) {
        if (typeof gameState === 'undefined') return;
        if (!data.colors || typeof data.colors !== 'object') return;

        for (const [teamIDStr, colorData] of Object.entries(data.colors)) {
            const teamID = parseInt(teamIDStr);
            const team   = gameState.initTeam(teamID, { isMyAlly: true });
            // Lua sends r/g/b as floats (0–1). Derive hex here since it's not sent.
            const toHex = (f) => Math.round((f ?? 0) * 255).toString(16).padStart(2, '0');
            const hex = colorData.hex
                ?? `#${toHex(colorData.r)}${toHex(colorData.g)}${toHex(colorData.b)}`;
            team.color   = {
                r:   colorData.r,
                g:   colorData.g,
                b:   colorData.b,
                hex
            };
            // Keep playerName in sync if Lua sent it
            if (colorData.playerName) team.playerName = colorData.playerName;
        }

        console.log('🎨 Ally team colors stored:', data.colors);
    }
    // ── USAGE EXAMPLE (barWidgets.js or any chart code) ──────────
    // When you need a per-player color for a chart series, do:
    //
    //   const team  = gameState.teams.get(teamID);
    //   const color = team?.color?.hex ?? '#4ab4ff';   // fallback

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
        const state   = triggerEngine.triggerStates.get(triggerId);
        if (!trigger) return;

        console.log('🎯 Trigger fired:', trigger.name);

        if (typeof uiManager !== 'undefined') {
            uiManager.updateTriggerFiredState(triggerId);
        }

        // Emit trigger event for widgets
        if (typeof widgetManager !== 'undefined') {
            widgetManager.emitTrigger({
                id: triggerId,
                name: trigger.name, 
                event: eventRecord.data.event,
                context: state?.lastContext ?? null,
                image_src: trigger.image_src ?? null 
            });
        }
    }

    /**
     * UI UPDATES
     * 
     * Uses BAR_EVENT_META.logToBattleLog to decide what gets logged,
     * replacing the previous hardcoded string exclusion list.
     */

    updateUI(data, eventType, meta) {
        // meta is passed in from handleMessage, avoiding a second getEventMeta() call
        if (!meta) meta = getEventMeta(eventType);

        if (meta.logToBattleLog && typeof uiManager !== 'undefined') {
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
        console.log('Known event types:', Object.keys(BAR_EVENTS).length);
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