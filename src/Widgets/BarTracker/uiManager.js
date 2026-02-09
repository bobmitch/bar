/**
 * UIManager - Handles all UI updates and interactions
 */

class UIManager {
    constructor() {
        this.currentView = 'standard';
        this.eventLogLimit = 50;
        this.unitSortBy = 'damage';
        this.unitFilterText = '';
        
        this.initializeEventListeners();
        this.initializeTriggerList();
    }

    /**
     * VIEW MANAGEMENT
     */

    switchView(viewName) {

        console.log('Switching to view:', viewName);

        // Hide all views
        document.querySelectorAll('.view-section').forEach(section => {
            section.classList.remove('active');
        });

        // Remove active state from all tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected view
        document.getElementById(`${viewName}-view`).classList.add('active');
        document.querySelector(`[data-tab="${viewName}"]`).classList.add('active');

        this.currentView = viewName;

        // Initialize view-specific content
        if (viewName === 'streaming') {
            this.initializeStreamingMode();
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

            // Create event item
            const eventItem = document.createElement('div');
            eventItem.className = 'event-item';
            
            const timestamp = this.formatTime(Date.now());
            // Handle both event.data.event and event.event structures
            const eventType = event.data?.event || event.event;
            const eventData = event.data?.data || event.data;
            const myTeamID = gameState.gameState.myTeamID;
            
            let details = '';
            if (eventType === 'UnitFinished') {
                const unitName = eventData?.unitName || 'unknown';
                details = `<span class="event-details">✓ ${getName(unitName)} completed</span>`;
            } else if (eventType === 'UnitDamaged') {
                const damage = eventData?.damage || 0;
                const unitName = eventData?.unitName || 'unknown';
                const unitTeam = eventData?.unitTeam;
                const isIncoming = unitTeam === myTeamID;
                const damageColor = isIncoming ? '#ff6b35' : '#00d084';
                const damageLabel = isIncoming ? '🔴 INCOMING' : '🟢 OUTGOING';
                details = `<span class="event-details" style="color: ${damageColor}; font-weight: 600;">
                    ${damageLabel} ${Math.round(damage)} dmg to ${getName(unitName)}
                </span>`;
            } else if (eventType === 'UnitDestroyed') {
                const unitName = eventData?.unitName || 'unknown';
                const attackerName = eventData?.attackerName || 'unknown';
                const unitTeam = eventData?.unitTeam;
                const isMyUnit = unitTeam === myTeamID;
                const destroyColor = isMyUnit ? '#ff4444' : '#00d084';
                const destroyLabel = isMyUnit ? '💀 LOSS' : '⚔️ KILL';
                details = `<span class="event-details" style="color: ${destroyColor}; font-weight: 600;">
                    ${destroyLabel}: ${getName(unitName)} by ${getName(attackerName)}
                </span>`;
            } else if (eventType === 'FullStatsUpdate') {
                const combat = eventData?.combat;
                if (combat) {
                    details = `<span class="event-details">K: ${combat.units_killed} | D: ${combat.units_died} | Dmg: ${Math.round(combat.damage_dealt)}</span>`;
                }
            }

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

    clearEventLog() {
        const logArea = document.getElementById('event-log');
        logArea.innerHTML = '<div class="event-empty">Waiting for events...</div>';
    }

    /**
     * STATS UPDATES
     */

    updateGameStatus(gameTime, gameState) {
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        document.getElementById('game-time').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    updateTeamStats(teamData, combatData) {
        // todo: we can probably split this into separate updates for different sections of the UI, but for now we will just update it all at once when we get the data, which is on every UnitDamaged event currently, so it should be fairly responsive for now
        return false; // early exit to disable for now, we will re-enable when we have the data and can format it nicely
        document.getElementById('unit-count').textContent = teamData.unitCount || 0;
        document.getElementById('army-cost').textContent = 
            this.formatNumber(teamData.totalMetalCost || 0) + 'M';
        document.getElementById('damage-dealt').textContent = 
            this.formatNumber(combatData.damage_dealt || 0);
        document.getElementById('damage-taken').textContent = 
            this.formatNumber(combatData.damage_received || 0);
        
        const ratio = (combatData.damage_dealt || 0) / (combatData.damage_received || 1);
        document.getElementById('kd-ratio').textContent = ratio.toFixed(1);
    }

    updateResourceStats(metalStats, energyStats) {
        return true; // early exit to disable for now, we will re-enable when we have the data and can format it nicely
        // Metal
        document.getElementById('metal-income').textContent = 
            this.formatNumber(metalStats.income || 0, 1) + '/s';
        document.getElementById('metal-usage').textContent = 
            this.formatNumber(metalStats.usage || 0, 1) + '/s';
        document.getElementById('metal-storage').textContent = 
            `${this.formatNumber(metalStats.storage || 0)}`;

        // Energy
        document.getElementById('energy-income').textContent = 
            this.formatNumber(energyStats.income || 0, 1) + '/s';
        document.getElementById('energy-usage').textContent = 
            this.formatNumber(energyStats.usage || 0, 1) + '/s';
        document.getElementById('energy-storage').textContent = 
            `${this.formatNumber(energyStats.storage || 0)}`;
    }


    /**
     * TRIGGER CONFIGURATION UI
     */

    initializeTriggerList() {
        const triggerList = document.getElementById('trigger-list');
        const triggers = triggerEngine.getAllTriggers();

        triggerList.innerHTML = '';

        for (const trigger of triggers) {
            const triggerItem = document.createElement('div');
            triggerItem.className = 'trigger-item';
            triggerItem.id = `trigger-${trigger.id}`;

            const lastFired = trigger.state.lastFired 
                ? new Date(trigger.state.lastFired).toLocaleTimeString()
                : 'Never';

            triggerItem.innerHTML = `
                <div class="trigger-header">
                    <div>
                        <div class="trigger-name">${trigger.name}</div>
                        <div class="trigger-description">${trigger.description}</div>
                    </div>
                    <div class="trigger-toggle ${trigger.enabled ? 'enabled' : ''}" 
                         data-trigger-id="${trigger.id}"></div>
                </div>
                <div class="trigger-controls">
                    <div class="trigger-control-item">
                        <span>Last Fired:</span>
                        <span data-last-fired>${lastFired}</span>
                    </div>
                    <div class="trigger-control-item">
                        <span>Count:</span>
                        <span data-fire-count>${trigger.state.fireCount}</span>
                    </div>
                    <div class="trigger-control-item">
                        <span>Cooldown:</span>
                        <span data-cooldown>${trigger.cooldown}s</span>
                    </div>
                </div>
            `;

            triggerList.appendChild(triggerItem);

            // Add toggle listener
            const toggle = triggerItem.querySelector('.trigger-toggle');
            toggle.addEventListener('click', () => {
                // FIX: Convert the string from dataset into a Number
                const triggerId = Number(toggle.dataset.triggerId); 
                
                const isEnabled = !toggle.classList.contains('enabled');
                
                const success = triggerEngine.setTriggerEnabled(triggerId, isEnabled);
                
                if (success) {
                    toggle.classList.toggle('enabled');
                    console.log(`Trigger ${triggerId} enabled state set to: ${isEnabled}`);
                } else {
                    console.error(`Failed to find trigger with ID: ${triggerId} (Type: ${typeof triggerId})`);
                }
            });
        }
    }

    updateTriggerFiredState(triggerId) {
        const triggerItem = document.getElementById(`trigger-${triggerId}`);
        if (!triggerItem) return;

        const trigger = triggerEngine.getTriggerConfig(triggerId);
        const lastFired = new Date(trigger.lastFired).toLocaleTimeString();

        triggerItem.querySelector('[data-last-fired]').textContent = lastFired;
        triggerItem.querySelector('[data-fire-count]').textContent = trigger.fireCount;

        // Add animation
        triggerItem.classList.add('triggering');
        setTimeout(() => triggerItem.classList.remove('triggering'), 600);
    }

    /**
     * EVENT LISTENERS INITIALIZATION
     */

    initializeEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchView(btn.dataset.tab);
            });
        });

        // Event log clear
        const clearBtn = document.getElementById('clear-log');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearEventLog());
        }

        // Unit roster sort
        const sortSelect = document.getElementById('unit-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.unitSortBy = e.target.value;
                this.updateUnitRosterSort();
            });
        }

        // Unit filter
        const unitFilter = document.getElementById('unit-filter');
        if (unitFilter) {
            unitFilter.addEventListener('input', (e) => {
                this.unitFilterText = e.target.value.toLowerCase();
                this.updateUnitRosterFilter();
            });
        }

        // Settings controls
        this.initializeSettingsListeners();

        // Streaming mode
        this.initializeStreamingModeListeners();
    }

    initializeSettingsListeners() {
        // Master volume
        const volumeSlider = document.getElementById('master-volume');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                document.getElementById('master-volume-value').textContent = e.target.value + '%';
                audioManager.setMasterVolume(e.target.value / 100);
            });
        }

        // Enable/disable all triggers
        const enableAll = document.getElementById('enable-all-triggers');
        const disableAll = document.getElementById('disable-all-triggers');

        if (enableAll) {
            enableAll.addEventListener('click', () => {
                triggerEngine.triggers.forEach((trigger, id) => {
                    triggerEngine.setTriggerEnabled(id, true);
                });
                this.initializeTriggerList();
            });
        }

        if (disableAll) {
            disableAll.addEventListener('click', () => {
                triggerEngine.triggers.forEach((trigger, id) => {
                    triggerEngine.setTriggerEnabled(id, false);
                });
                this.initializeTriggerList();
            });
        }

        // Export/Import
        const exportBtn = document.getElementById('export-settings');
        const importBtn = document.getElementById('import-settings');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const settings = triggerEngine.exportSettings();
                const dataStr = JSON.stringify(settings, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                const exportFileDefaultName = 'BAR-triggers-config.json';
                
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const settings = JSON.parse(event.target.result);
                            triggerEngine.importSettings(settings);
                            this.initializeTriggerList();
                            alert('Settings imported successfully!');
                        } catch (err) {
                            alert('Error importing settings: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                });
                input.click();
            });
        }
    }

    initializeStreamingModeListeners() {
        const editModeToggle = document.getElementById('edit-mode-toggle');
        const resetLayout = document.getElementById('reset-layout');
        const saveLayout = document.getElementById('save-layout');

        if (editModeToggle) {
            editModeToggle.addEventListener('click', () => {
                const grid = document.getElementById('streaming-grid');
                grid.classList.toggle('edit-mode');
                editModeToggle.textContent = grid.classList.contains('edit-mode') ? '🔒 Lock' : '🔓 Edit';
            });
        }

        if (resetLayout) {
            resetLayout.addEventListener('click', () => {
                if (confirm('Reset to default layout?')) {
                    streamingWidgets.resetLayout();
                }
            });
        }

        if (saveLayout) {
            saveLayout.addEventListener('click', () => {
                streamingWidgets.saveLayout();
                alert('Layout saved!');
            });
        }

        // Widget add buttons
        document.querySelectorAll('.widget-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const widgetType = btn.dataset.widget;
                streamingWidgets.addWidget(widgetType);
            });
        });
    }

    /**
     * UNIT FILTER
     */

    updateUnitRosterFilter() {
        const cards = document.querySelectorAll('.unit-card');
        cards.forEach(card => {
            const unitName = card.querySelector('.unit-name').textContent.toLowerCase();
            const matches = unitName.includes(this.unitFilterText);
            card.style.display = matches ? '' : 'none';
        });
    }

    /**
     * CONNECTION STATUS
     */

    setConnectionStatus(connected) {
        const badge = document.getElementById('connection-status');
        if (connected) {
            badge.textContent = '🟢 Connected';
            badge.classList.remove('disconnected');
            badge.classList.add('connected');
        } else {
            badge.textContent = '🔴 Disconnected';
            badge.classList.add('disconnected');
            badge.classList.remove('connected');
        }
    }

    /**
     * UTILITIES
     */

    formatNumber(num, decimals = 0) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(decimals) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(decimals) + 'K';
        }
        return Math.round(num).toString();
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    formatAge(seconds) {
        if (seconds < 60) return Math.round(seconds) + 's';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${minutes}m ${secs}s`;
    }

    initializeStreamingMode() {
        // Create default widgets if none exist
        if (document.querySelectorAll('.streaming-widget').length === 0) {
            streamingWidgets.createDefaultLayout();
        }
    }
}

// Singleton instance
const uiManager = new UIManager();
