/**
 * UI Manager - Handles all visual updates and DOM manipulation
 * ENHANCED: Includes full event listener initialization and view management
 * 
 * UPDATED: logEvent() now uses BAR_EVENTS constants and BAR_EVENT_META for
 *          display formatting instead of hardcoded string comparisons.
 */

class UIManager {
    constructor() {
        this.currentView = 'standard';
        this.eventLogLimit = 100;
        this.statsUpdateInterval = 500; // ms between stats panel updates
        this.lastStatsUpdate = 0;
        this.unitFilterText = '';
        this.unitSortBy = 'name';
        
        // Team stats cache for display
        this.displayStats = {
            unitCount: 0,
            totalMetalCost: 0,
            damageDealt: 0,
            damageTaken: 0,
            unitsKilled: 0,
            unitsLost: 0,
            metalIncome: 0,
            metalUsage: 0,
            energyIncome: 0,
            energyUsage: 0,
            metalCurrent: 0,
            metalStorage: 0,
            energyCurrent: 0,
            energyStorage: 0,
            isPaused: false,
            overflow_m: false,
            overflow_e: false
        };
    }

    /**
     * INITIALIZATION - Called on page load
     */

    initialize() {
        console.log('📊 Initializing UIManager...');
        this.initializeEventListeners();
        const resetBtn = document.getElementById('reset-all-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetAll());
        }
    }

    /**
     * EVENT LISTENERS INITIALIZATION - Sets up all UI interactions
     */

    initializeEventListeners() {
        console.log('🎯 Setting up event listeners...');

        // Tab switching - CRITICAL FOR NAVIGATION
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                console.log('📌 Tab clicked:', tabName);
                this.switchView(tabName);
            });
        });

        // Event log clear button
        const clearLogBtn = document.getElementById('clear-log-btn');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                console.log('🗑️ Clearing event log...');
                this.clearEventLog();
            });
        }

        // Unit roster sort (if available)
        const sortSelect = document.getElementById('unit-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.unitSortBy = e.target.value;
                this.updateUnitRosterSort();
            });
        }

        // Unit filter input (if available)
        const filterInput = document.getElementById('unit-filter');
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                this.unitFilterText = e.target.value.toLowerCase();
                this.updateUnitRosterFilter();
            });
        }

        console.log('✅ Event listeners initialized');
    }

    /**
     * STATS PANEL UPDATE
     */

    updateTeamStatsPanel(myTeam, fullStatsData) {
        const statusEl = document.getElementById('status');
        if (!statusEl) return;

        if (!myTeam && !fullStatsData) {
            statusEl.innerHTML = '<p>No team data available</p>';
            return;
        }

        const metal   = fullStatsData?.metal   || myTeam?.metalStats   || {};
        const energy  = fullStatsData?.energy  || myTeam?.energyStats  || {};
        const combat  = fullStatsData?.combat  || myTeam?.combatStats  || {};

        statusEl.innerHTML = `
            <div class="stat-section">
                <div class="stat-section-title">⚙️ Metal</div>
                <div class="stat-row">
                    <span class="stat-label">Income:</span>
                    <span class="stat-value">${this.formatNumber(metal.income, 1)}/s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Usage:</span>
                    <span class="stat-value">${this.formatNumber(metal.usage, 1)}/s</span>
                </div>
                <div class="stat-row ${fullStatsData?.overflow_m ? 'overflow-active' : ''}">
                    <span class="stat-label">Status:</span>
                    <span class="stat-value">${fullStatsData?.overflow_m ? '🔴 OVERFLOW' : '✓ Normal'}</span>
                </div>
            </div>
            <div class="stat-section">
                <div class="stat-section-title">⚡ Energy</div>
                <div class="stat-row">
                    <span class="stat-label">Income:</span>
                    <span class="stat-value">${this.formatNumber(energy.income, 1)}/s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Usage:</span>
                    <span class="stat-value">${this.formatNumber(energy.usage, 1)}/s</span>
                </div>
                <div class="stat-row ${fullStatsData?.overflow_e ? 'overflow-active' : ''}">
                    <span class="stat-label">Status:</span>
                    <span class="stat-value">${fullStatsData?.overflow_e ? '🔴 STALLED' : '✓ Flowing'}</span>
                </div>
            </div>
            <div class="stat-section">
                <div class="stat-section-title">⚔️ Combat</div>
                <div class="stat-row">
                    <span class="stat-label">Kills:</span>
                    <span class="stat-value">${combat.units_killed ?? 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Losses:</span>
                    <span class="stat-value">${combat.units_died ?? 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Dmg dealt:</span>
                    <span class="stat-value">${this.formatNumber(combat.damage_dealt ?? 0)}</span>
                </div>
            </div>
        `;
    }

    /**
     * UPDATE GAME STATUS (for header display)
     */

    updateGameStatus(gameTime, gameState) {
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        const gameTimeEl = document.getElementById('game-time');
        if (gameTimeEl) {
            gameTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    /**
     * CONNECTION STATUS - CRITICAL FOR SHOWING ONLINE/OFFLINE
     */

    setConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) {
            console.warn('⚠️ Connection status element not found');
            return;
        }

        if (connected) {
            statusEl.textContent = '🟢 CONNECTED';
            statusEl.className = 'status-badge connected';
            console.log('✅ Connection status: CONNECTED');
        } else {
            statusEl.textContent = '🔴 OFFLINE';
            statusEl.className = 'status-badge disconnected';
            console.log('❌ Connection status: OFFLINE');
        }
    }

    /**
     * EVENT LOGGING
     * 
     * Uses BAR_EVENTS constants for event type comparisons and BAR_EVENT_META
     * for default icons and labels. Adding a new event type only requires:
     *   1. Adding it to BAR_EVENTS / BAR_EVENT_META in eventTypes.js
     *   2. Optionally adding a formatting case below if it needs custom display
     * 
     * Unknown events fall through to the default case and display raw data,
     * so new events from the widget are always visible even before a case is added.
     */

    logEvent(event) {
        try {
            const logArea = document.getElementById('event-log');
            if (!logArea) return;
            
            // Clear placeholder
            if (logArea.querySelector('.event-empty')) {
                logArea.innerHTML = '';
            }

            const eventItem = document.createElement('div');
            const timestamp  = this.formatTime(Date.now());
            const eventType  = event.data?.event || event.event;
            const eventData  = event.data?.data  || event.data;
            const myTeamID   = (typeof gameState !== 'undefined') ? gameState.gameState.myTeamID : null;

            // Pull defaults from the registry
            const meta     = getEventMeta(eventType);
            let details    = '';
            let priority   = meta.logPriority;

            // ── Per-event display formatting ─────────────────────────────────
            switch (eventType) {

                case BAR_EVENTS.UNIT_FINISHED: {
                    const unitName = eventData?.unitName || 'unknown';
                    const relation = eventData?.relation || 'unknown';
                    const isMyUnit = relation === 'self';
                    const icon     = isMyUnit ? '✅' : meta.icon;
                    priority       = isMyUnit ? 'high' : 'normal';
                    details        = `<span class="event-details">${icon} ${this.getName(unitName)} completed</span>`;
                    break;
                }

                case BAR_EVENTS.UNIT_DESTROYED: {
                    const unitName     = eventData?.unitName     || 'unknown';
                    const attackerName = eventData?.attackerName || 'unknown';
                    const unitTeam     = eventData?.unitTeam;
                    const isMyUnit     = unitTeam === myTeamID;
                    const colour       = isMyUnit ? '#ff4444' : '#00d084';
                    const label        = isMyUnit ? '💀 LOSS'  : '⚔️ KILL';
                    details = `<span class="event-details" style="color:${colour};font-weight:600;">
                        ${label}: ${this.getName(unitName)} by ${this.getName(attackerName)}
                    </span>`;
                    break;
                }

                case BAR_EVENTS.GAME_START: {
                    details = `<span class="event-details">${meta.icon} Game started — ${eventData?.playerName ?? ''}</span>`;
                    break;
                }

                case BAR_EVENTS.GAME_OVER: {
                    details = `<span class="event-details">${meta.icon} Game ended</span>`;
                    break;
                }

                case BAR_EVENTS.OVERFLOW_STATUS_CHANGED: {
                    const resource = eventData?.resource || 'unknown';
                    const active   = eventData?.overflow_m || eventData?.overflow_e;
                    details = `<span class="event-details">${meta.icon} ${resource} overflow ${active ? 'started' : 'ended'}</span>`;
                    break;
                }

                default: {
                    // Catch-all: display the raw event type and whatever data exists.
                    // This means NEW events from the LUA widget are always visible in
                    // the battle log without needing a code change here first.
                    const rawSummary = eventData ? JSON.stringify(eventData).slice(0, 80) : '';
                    details = `<span class="event-details">${meta.icon} ${meta.label}${rawSummary ? ': ' + rawSummary : ''}</span>`;
                    break;
                }
            }

            eventItem.className = `event-item event-priority-${priority}`;
            eventItem.innerHTML = `
                <div class="event-timestamp">${timestamp}</div>
                <div class="event-type">${meta.label}</div>
                ${details}
            `;

            logArea.insertBefore(eventItem, logArea.firstChild);

            // Limit log size
            while (logArea.children.length > this.eventLogLimit) {
                logArea.removeChild(logArea.lastChild);
            }
        } catch (err) {
            console.error('❌ Error in logEvent:', err);
        }
    }

    logTrigger(trigger) {
        const logArea = document.getElementById('event-log');
        if (!logArea) return;

        const triggerItem = document.createElement('div');
        triggerItem.className = 'event-item event-trigger event-priority-critical';
        
        const timestamp   = this.formatTime(Date.now());
        const triggerName = trigger.name || 'unknown trigger';
        
        triggerItem.innerHTML = `
            <div class="event-timestamp">${timestamp}</div>
            <div class="event-type">Trigger Fired</div>
            <div class="event-details">🚨 ${triggerName}</div>
        `;

        logArea.insertBefore(triggerItem, logArea.firstChild);

        // Limit log size
        while (logArea.children.length > this.eventLogLimit) {
            logArea.removeChild(logArea.lastChild);
        }
    }

    clearEventLog() {
        const logArea = document.getElementById('event-log');
        if (logArea) {
            logArea.innerHTML = '<div class="event-empty">Waiting for events...</div>';
        }
    }

    resetAll() {
        console.log('🔄 Reset all triggered');

        // Reset game state store
        if (typeof gameState !== 'undefined') {
            gameState.reset();
        }

        // Reset event handler internal state
        if (typeof eventHandler !== 'undefined') {
            eventHandler.gameInitialized = false;
            eventHandler.lastStatsUpdate = 0;
            eventHandler.eventHistory = [];
        }

        // Clear the battle log
        this.clearEventLog();

        // Reset the stats panel
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.innerHTML = '<p>Loading team status...</p>';

        // Reset game timer
        const gameTimeEl = document.getElementById('game-time');
        if (gameTimeEl) gameTimeEl.textContent = '00:00';

        

        if (typeof chartWidgets !== 'undefined') {
            chartWidgets.reset();
        }

        // Tick widgets so they render zeroed-out values immediately
        if (typeof statWidgets !== 'undefined') {
            statWidgets.tick(); // includes charts as well
        }

        console.log('✅ Reset complete');
    }

    /**
     * VIEW MANAGEMENT - CRITICAL FOR PANEL NAVIGATION
     */

    switchView(viewName) {
        console.log('📌 Switching to view:', viewName);

        document.body.dataset.view = viewName;

        if (this.currentView === viewName) {
            console.log('   Already on this view, skipping...');
            return;
        }

        // Hide all views
        document.querySelectorAll('.view-section').forEach(section => {
            section.classList.remove('active');
        });

        // Remove active state from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected view
        const targetView = document.getElementById(`${viewName}-view`);
        if (targetView) {
            targetView.classList.add('active');
            console.log(`✅ Activated view: ${viewName}-view`);
        } else {
            console.warn(`⚠️ View not found: ${viewName}-view`);
        }
        
        const targetTab = document.querySelector(`[data-tab="${viewName}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
            console.log(`✅ Activated tab: ${viewName}`);
        } else {
            console.warn(`⚠️ Tab not found: [data-tab="${viewName}"]`);
        }

        this.currentView = viewName;

        if (viewName === 'streaming') {
            this.initializeStreamingMode();
        }
    }

    initializeStreamingMode() {
        console.log('📺 Initializing streaming mode...');
        if (typeof streamingWidgets !== 'undefined') {
            // Placeholder for streaming-specific UI setup
        }
    }

    updateUnitRosterFilter() {
        const cards = document.querySelectorAll('.unit-card');
        cards.forEach(card => {
            const unitName = card.querySelector('.unit-name').textContent.toLowerCase();
            const matches  = unitName.includes(this.unitFilterText);
            card.style.display = matches ? '' : 'none';
        });
    }

    updateUnitRosterSort() {
        console.log('Sorting units by:', this.unitSortBy);
    }

    updateTriggerFiredState(triggerId) {
        const triggerEl = document.querySelector(`[data-trigger-id="${triggerId}"]`);
        if (triggerEl) {
            triggerEl.classList.add('fired');
            setTimeout(() => {
                triggerEl.classList.remove('fired');
            }, 500);
        }
    }

    /**
     * HELPER METHODS
     */

    formatNumber(num, decimals = 0) {
        if (typeof num !== 'number') return '0';
        
        if (num >= 1000000) {
            return (num / 1000000).toFixed(decimals) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(decimals) + 'K';
        }
        return num.toFixed(decimals);
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    getName(name) {
        if (window.unitDefs && window.unitDefs[name]) {
            return window.unitDefs[name].name || name;
        }
        return name;
    }
}

// Create global instance and initialize on load
const uiManager = new UIManager();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        uiManager.initialize();
    });
} else {
    uiManager.initialize();
}

let streamingView = document.getElementById('streaming-view');
if (streamingView) {
    streamingView.addEventListener('dblclick', () => {
        console.log('🔄 Double click detected on streaming view - switching to standard view');
        uiManager.switchView('standard');
    });
} else {
    console.warn('⚠️ #streaming-view element not found - cannot attach double click listener for view switching');
}