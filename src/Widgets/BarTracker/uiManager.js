/**
 * UI Manager - Handles all visual updates and DOM manipulation
 * ENHANCED: Includes full event listener initialization and view management
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

        // Streaming mode listeners (if available)
        // none yet
        // this.initializeStreamingModeListeners();

        console.log('✅ Event listeners initialized');
    }

    /**
     * STATS PANEL UPDATES - The core fix for team status
     */

    updateTeamStatsPanel(teamData, fullStatsData) {
        const statusDiv = document.getElementById('status');
        if (!statusDiv) {
            console.warn('⚠️ Status div not found for panel update');
            return;
        }

        // Extract values with fallbacks
        const unitCount = teamData?.unitCount || 0;
        const totalMetalCost = teamData?.totalMetalCost || 0;
        const damageDealt = fullStatsData?.combat?.damage_dealt || 0;
        const damageTaken = fullStatsData?.combat?.damage_received || 0;
        const unitsKilled = fullStatsData?.combat?.units_killed || 0;
        const unitsLost = fullStatsData?.combat?.units_died || 0;
        
        // Metal stats
        const metalIncome = fullStatsData?.metal?.income || 0;
        const metalUsage = fullStatsData?.metal?.usage || 0;
        const metalCurrent = fullStatsData?.metal?.storage || 0;
        const metalStorage = fullStatsData?.metal?.max_storage || fullStatsData?.metal?.storage || 0;
        
        // Energy stats
        const energyIncome = fullStatsData?.energy?.income || 0;
        const energyUsage = fullStatsData?.energy?.usage || 0;
        const energyCurrent = fullStatsData?.energy?.storage || 0;
        const energyStorage = fullStatsData?.energy?.max_storage || fullStatsData?.energy?.storage || 0;

        // Calculate K/D ratio
        const kdRatio = damageTaken > 0 ? (damageDealt / damageTaken).toFixed(2) : damageDealt > 0 ? '∞' : '0.0';

        // Update cache for reference
        Object.assign(this.displayStats, {
            unitCount,
            totalMetalCost,
            damageDealt: Math.round(damageDealt),
            damageTaken: Math.round(damageTaken),
            unitsKilled,
            unitsLost,
            metalIncome: metalIncome.toFixed(1),
            metalUsage: metalUsage.toFixed(1),
            energyIncome: energyIncome.toFixed(1),
            energyUsage: energyUsage.toFixed(1),
            metalCurrent: Math.round(metalCurrent),
            metalStorage: Math.round(metalStorage),
            energyCurrent: Math.round(energyCurrent),
            energyStorage: Math.round(energyStorage),
            kdRatio
        });

        // Build HTML for status panel
        statusDiv.innerHTML = `
            <div class="stat-section">
                <div class="stat-title">ARMY</div>
                <div class="stat-row">
                    <span class="stat-label">Active Units:</span>
                    <span class="stat-value">${unitCount}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Army Value:</span>
                    <span class="stat-value">${this.formatNumber(totalMetalCost)}M</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Killed:</span>
                    <span class="stat-value stat-positive">${unitsKilled}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Lost:</span>
                    <span class="stat-value stat-negative">${unitsLost}</span>
                </div>
            </div>

            <div class="stat-section">
                <div class="stat-title">COMBAT</div>
                <div class="stat-row">
                    <span class="stat-label">Damage Dealt:</span>
                    <span class="stat-value stat-positive">${this.formatNumber(damageDealt)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Damage Taken:</span>
                    <span class="stat-value stat-negative">${this.formatNumber(damageTaken)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">K/D Ratio:</span>
                    <span class="stat-value">${kdRatio}</span>
                </div>
            </div>

            <div class="stat-section">
                <div class="stat-title">METAL</div>
                <div class="stat-row">
                    <span class="stat-label">Income:</span>
                    <span class="stat-value">${metalIncome.toFixed(1)}/s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Usage:</span>
                    <span class="stat-value">${metalUsage.toFixed(1)}/s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Storage:</span>
                    <span class="stat-value">${this.formatNumber(metalCurrent)} / ${this.formatNumber(metalStorage)}</span>
                </div>
                <div class="stat-row ${fullStatsData?.overflow_m ? 'overflow-active' : ''}">
                    <span class="stat-label">Status:</span>
                    <span class="stat-value">${fullStatsData?.overflow_m ? '🔴 OVERFLOW' : '✓ Normal'}</span>
                </div>
            </div>

            <div class="stat-section">
                <div class="stat-title">ENERGY</div>
                <div class="stat-row">
                    <span class="stat-label">Income:</span>
                    <span class="stat-value">${energyIncome.toFixed(1)}/s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Usage:</span>
                    <span class="stat-value">${energyUsage.toFixed(1)}/s</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Storage:</span>
                    <span class="stat-value">${this.formatNumber(energyCurrent)} / ${this.formatNumber(energyStorage)}</span>
                </div>
                <div class="stat-row ${fullStatsData?.overflow_e ? 'overflow-active' : ''}">
                    <span class="stat-label">Status:</span>
                    <span class="stat-value">${fullStatsData?.overflow_e ? '🔴 STALLED' : '✓ Flowing'}</span>
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
            eventItem.className = 'event-item';
            
            const timestamp = this.formatTime(Date.now());
            const eventType = event.data?.event || event.event;
            const eventData = event.data?.data || event.data;
            const myTeamID = gameState.gameState.myTeamID;
            
            let details = '';
            let priority = 'normal';

            if (eventType === 'UnitFinished') {
                const unitName = eventData?.unitName || 'unknown';
                const relation = eventData?.relation || 'unknown';
                const isMyUnit = relation === 'self';
                const icon = isMyUnit ? '✅' : '🔧';
                details = `<span class="event-details">${icon} ${this.getName(unitName)} completed</span>`;
                priority = isMyUnit ? 'high' : 'normal';
            } else if (eventType === 'UnitDestroyed') {
                const unitName = eventData?.unitName || 'unknown';
                const attackerName = eventData?.attackerName || 'unknown';
                const unitTeam = eventData?.unitTeam;
                const isMyUnit = unitTeam === myTeamID;
                const destroyColor = isMyUnit ? '#ff4444' : '#00d084';
                const destroyLabel = isMyUnit ? '💀 LOSS' : '⚔️ KILL';
                details = `<span class="event-details" style="color: ${destroyColor}; font-weight: 600;">
                    ${destroyLabel}: ${this.getName(unitName)} by ${this.getName(attackerName)}
                </span>`;
                priority = 'critical';
            } else if (eventType === 'FullStatsUpdate') {
                const combat = eventData?.combat;
                if (combat) {
                    details = `<span class="event-details">📊 K: ${combat.units_killed} | D: ${combat.units_died} | Dmg: ${Math.round(combat.damage_dealt)}</span>`;
                }
                priority = 'low';
            }

            eventItem.className = `event-item event-priority-${priority}`;
            eventItem.innerHTML = `
                <div class="event-timestamp">${timestamp}</div>
                <div class="event-type">${eventType}</div>
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
        
        const timestamp = this.formatTime(Date.now());
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

    /**
     * VIEW MANAGEMENT - CRITICAL FOR PANEL NAVIGATION
     */

    switchView(viewName) {
        console.log('📌 Switching to view:', viewName);

        // add viewname to body for global css changing
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

        // Initialize view-specific content
        if (viewName === 'streaming') {
            this.initializeStreamingMode();
        }
    }

    initializeStreamingMode() {
        console.log('📺 Initializing streaming mode...');

        if (typeof widgetManager === 'undefined') {
            console.warn('⚠️ widgetManager not loaded');
            return;
        }

        const container = document.getElementById('streaming-widgets-container');
        if (!container) {
            console.warn('⚠️ #streaming-widgets-container not found');
            return;
        }

        // Only mount once — mountAll is idempotent via the instances Map,
        // but we guard with a flag to avoid re-registering drag listeners.
        if (!widgetManager._mounted) {
            widgetManager.mountAll(container);
            widgetManager._mounted = true;

            // Initial stat render
            if (typeof statWidgets !== 'undefined') statWidgets.tick();

            console.log('✅ Streaming widgets mounted');
        }
    }

    updateUnitRosterFilter() {
        const cards = document.querySelectorAll('.unit-card');
        cards.forEach(card => {
            const unitName = card.querySelector('.unit-name').textContent.toLowerCase();
            const matches = unitName.includes(this.unitFilterText);
            card.style.display = matches ? '' : 'none';
        });
    }

    updateUnitRosterSort() {
        // Placeholder for unit roster sorting
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

// Auto-initialize when DOM is ready
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