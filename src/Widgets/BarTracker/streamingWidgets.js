/**
 * StreamingWidgetSystem - Streaming overlay widgets with dual modes
 * Mode 1: Streaming (transparent, production-ready)
 * Mode 2: Layout (full UI for editing)
 */

class StreamingWidgetSystem {
    constructor() {
        this.widgets = new Map();
        this.widgetCounter = 0;
        this.layoutMode = false;
        this.defaultLayout = [];
        
        this.initializeWidgetDefinitions();
        this.initializeEventListeners();
    }

    /**
     * WIDGET DEFINITIONS
     */

    initializeWidgetDefinitions() {
        this.widgetDefs = {
            'game-timer': {
                name: 'Game Timer',
                icon: '⏱️',
                description: 'Real-time game clock',
                defaultPos: { top: '20px', left: '20px', width: '200px' },
                render: () => this.renderGameTimer()
            },
            'economy-minimal': {
                name: 'Economy Status',
                icon: '💰',
                description: 'Metal/Energy income, usage, wasted',
                defaultPos: { top: '20px', right: '20px', width: '280px' },
                render: () => this.renderEconomyMinimal()
            },
            'combat-overview': {
                name: 'Combat Overview',
                icon: '⚔️',
                description: 'K/D, damage dealt/taken at a glance',
                defaultPos: { bottom: '20px', left: '20px', width: '280px' },
                render: () => this.renderCombatOverview()
            },
            'trigger-panel': {
                name: 'Trigger Alerts',
                icon: '🎯',
                description: 'Recent trigger animations',
                defaultPos: { bottom: '20px', right: '20px', width: '300px', height: '200px' },
                render: () => this.renderTriggerPanel()
            },
            'army-value': {
                name: 'Army Value',
                icon: '💪',
                description: 'Total unit cost + count',
                defaultPos: { top: '250px', left: '20px', width: '220px' },
                render: () => this.renderArmyValue()
            },
            'kd-ratio': {
                name: 'K/D Ratio',
                icon: '📊',
                description: 'Kill/Death ratio display',
                defaultPos: { top: '350px', left: '20px', width: '220px' },
                render: () => this.renderKDRatio()
            },
            'damage-meter': {
                name: 'Damage Meter',
                icon: '⚡',
                description: 'Damage balance visualization',
                defaultPos: { top: '450px', left: '20px', width: '220px' },
                render: () => this.renderDamageMeter()
            },
            'unit-production': {
                name: 'Unit Production',
                icon: '🏭',
                description: 'Units being built',
                defaultPos: { top: '250px', right: '20px', width: '260px' },
                render: () => this.renderUnitProduction()
            },
            'resource-graph': {
                name: 'Resource Trends',
                icon: '📈',
                description: 'Metal/Energy trend visualization',
                defaultPos: { top: '350px', right: '20px', width: '260px' },
                render: () => this.renderResourceGraph()
            }
        };
    }

    /**
     * MODE SWITCHING
     */

    switchToStreamingMode() {
        document.getElementById('streaming-mode').classList.add('active');
        document.getElementById('layout-mode').classList.remove('active');
        this.layoutMode = false;
        this.renderStreamingWidgets();
    }

    switchToLayoutMode() {
        document.getElementById('streaming-mode').classList.remove('active');
        document.getElementById('layout-mode').classList.add('active');
        this.layoutMode = true;
        this.renderLayoutWidgets();
    }

    /**
     * WIDGET MANAGEMENT
     */

    addWidget(widgetType) {
        const def = this.widgetDefs[widgetType];
        
        if (!def) return;

        const widgetId = `widget-${this.widgetCounter++}`;
        const widget = {
            id: widgetId,
            type: widgetType,
            def: def,
            position: { ...def.defaultPos },
            enabled: true
        };

        this.widgets.set(widgetId, widget);
        
        if (this.layoutMode) {
            this.renderLayoutWidgets();
        } else {
            this.renderStreamingWidgets();
        }

        return widget;
    }

    removeWidget(widgetId) {
        this.widgets.delete(widgetId);
        document.getElementById(widgetId)?.remove();
        if (this.layoutMode) {
            this.renderLayoutWidgets();
        }
    }

    /**
     * RENDERING - STREAMING MODE
     */

    renderStreamingWidgets() {
        const container = document.getElementById('streaming-widgets-container');
        if (!container) return;

        container.innerHTML = '';

        for (const widget of this.widgets.values()) {
            const el = document.createElement('div');
            el.id = widget.id;
            el.className = 'streaming-widget';
            el.style.top = widget.position.top || 'auto';
            el.style.left = widget.position.left || 'auto';
            el.style.right = widget.position.right || 'auto';
            el.style.bottom = widget.position.bottom || 'auto';
            el.style.width = widget.position.width || '280px';

            const content = widget.def.render();
            el.innerHTML = `
                <div class="streaming-widget-title">
                    <span class="streaming-widget-icon">${widget.def.icon}</span>
                    ${widget.def.name}
                </div>
                <div class="streaming-widget-content widget-${widget.type}">
                    ${content}
                </div>
            `;

            container.appendChild(el);
        }
    }

    /**
     * RENDERING - LAYOUT MODE
     */

    renderLayoutWidgets() {
        const container = document.getElementById('layout-widgets-container');
        if (!container) return;

        container.innerHTML = '';

        for (const widget of this.widgets.values()) {
            const el = document.createElement('div');
            el.id = widget.id;
            el.className = 'streaming-widget edit-mode';
            el.style.top = widget.position.top || 'auto';
            el.style.left = widget.position.left || 'auto';
            el.style.right = widget.position.right || 'auto';
            el.style.bottom = widget.position.bottom || 'auto';
            el.style.width = widget.position.width || '280px';
            el.draggable = true;

            const content = widget.def.render();
            el.innerHTML = `
                <div class="streaming-widget-title">
                    <span class="streaming-widget-icon">${widget.def.icon}</span>
                    ${widget.def.name}
                </div>
                <div class="streaming-widget-content widget-${widget.type}">
                    ${content}
                </div>
            `;

            // Add drag listeners
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('widgetId', widget.id);
            });

            el.addEventListener('dragend', () => {
                widget.position.top = el.style.top;
                widget.position.left = el.style.left;
                widget.position.right = el.style.right;
                widget.position.bottom = el.style.bottom;
            });

            // Add delete button
            el.addEventListener('click', (e) => {
                if (e.target.textContent === '✕') {
                    if (confirm(`Remove ${widget.def.name}?`)) {
                        this.removeWidget(widget.id);
                    }
                }
            });

            container.appendChild(el);
        }
    }

    /**
     * WIDGET RENDERERS
     */

    renderGameTimer() {
        const gameTime = gameState.gameState.gameTime || 0;
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    renderEconomyMinimal() {
        const myTeam = gameState.getMyTeam();
        if (!myTeam?.metalStats) return '<p>Waiting for data...</p>';

        const metal = myTeam.metalStats;
        const energy = myTeam.energyStats;
        
        const metalWaste = Math.max(0, (metal.excess || 0));
        const energyBalance = (energy.income || 0) - (energy.usage || 0);

        return `
            <div class="stat-row">
                <span class="stat-label">Metal Income</span>
                <span class="stat-value">${this.formatNumber(metal.income || 0, 1)}/s</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Metal Usage</span>
                <span class="stat-value">${this.formatNumber(metal.usage || 0, 1)}/s</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Metal Wasted</span>
                <span class="stat-value ${metalWaste > 10 ? 'negative' : ''}">${this.formatNumber(metalWaste, 1)}/s</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Energy Balance</span>
                <span class="stat-value ${energyBalance < 0 ? 'negative' : ''}">${energyBalance > 0 ? '+' : ''}${this.formatNumber(energyBalance, 1)}/s</span>
            </div>
        `;
    }

    renderCombatOverview() {
        const myTeam = gameState.getMyTeam();
        if (!myTeam) return '<p>Waiting for data...</p>';

        return `
            <div class="combat-stat">
                <div class="combat-stat-label">Kills</div>
                <div class="combat-stat-value">${myTeam.killedCount || 0}</div>
            </div>
            <div class="combat-stat">
                <div class="combat-stat-label">Deaths</div>
                <div class="combat-stat-value">${myTeam.lostCount || 0}</div>
            </div>
            <div class="combat-stat">
                <div class="combat-stat-label">Damage Out</div>
                <div class="combat-stat-value">${this.formatNumber(myTeam.totalDamageDealt || 0)}</div>
            </div>
            <div class="combat-stat">
                <div class="combat-stat-label">Damage In</div>
                <div class="combat-stat-value">${this.formatNumber(myTeam.totalDamageTaken || 0)}</div>
            </div>
        `;
    }

    renderTriggerPanel() {
        if (!this.triggerHistory) {
            this.triggerHistory = [];
        }

        const recentTriggers = this.triggerHistory.slice(-5).reverse();

        if (recentTriggers.length === 0) {
            return '<p style="color: var(--text-secondary);">No triggers fired yet...</p>';
        }

        return recentTriggers.map(trigger => `
            <div class="trigger-alert">
                <div class="trigger-alert-time">${new Date(trigger.timestamp).toLocaleTimeString()}</div>
                <div class="trigger-alert-name">🎯 ${trigger.triggerName}</div>
            </div>
        `).join('');
    }

    renderArmyValue() {
        const myTeam = gameState.getMyTeam();
        if (!myTeam) return '<p>Waiting for data...</p>';

        return `
            <div class="combat-stat">
                <div class="combat-stat-label">Units</div>
                <div class="combat-stat-value">${myTeam.unitCount || 0}</div>
            </div>
            <div class="combat-stat">
                <div class="combat-stat-label">Army Cost</div>
                <div class="combat-stat-value">${this.formatNumber(myTeam.totalMetalCost || 0)}M</div>
            </div>
        `;
    }

    renderKDRatio() {
        const myTeam = gameState.getMyTeam();
        if (!myTeam) return '<p>Waiting for data...</p>';

        const kills = myTeam.killedCount || 0;
        const deaths = myTeam.lostCount || 1;
        const ratio = (kills / deaths).toFixed(2);

        return `
            <div class="kd-stat">
                <div class="kd-stat-label">K/D</div>
                <div class="kd-stat-value">${ratio}</div>
            </div>
            <div class="kd-stat">
                <div class="kd-stat-label">W/L</div>
                <div class="kd-stat-value">${(kills - deaths).toString().padStart(2, ' ')}</div>
            </div>
        `;
    }

    renderDamageMeter() {
        const myTeam = gameState.getMyTeam();
        if (!myTeam) return '<p>Waiting for data...</p>';

        const dealt = myTeam.totalDamageDealt || 1;
        const taken = myTeam.totalDamageTaken || 1;
        const total = dealt + taken;
        const dealtPercent = (dealt / total) * 100;

        return `
            <div class="stat-row">
                <span class="stat-label">Damage Balance</span>
                <span class="stat-value">${dealtPercent.toFixed(0)}%</span>
            </div>
            <div class="damage-meter-bar">
                <div class="damage-meter-fill" style="width: ${dealtPercent}%"></div>
            </div>
            <div class="stat-row" style="font-size: 0.8rem; margin-top: 8px;">
                <span style="color: var(--success);">↗ ${this.formatNumber(dealt)}</span>
                <span style="color: var(--danger);">↙ ${this.formatNumber(taken)}</span>
            </div>
        `;
    }

    renderUnitProduction() {
        // Placeholder - would need to track building units from events
        const units = gameState.getTeamUnits(gameState.gameState.myTeamID, false);
        const recentUnits = units.slice(-5);

        if (recentUnits.length === 0) {
            return '<p style="color: var(--text-secondary);">No units built yet...</p>';
        }

        return recentUnits.map(unit => `
            <div class="production-item">
                <span>${getName(unit.unitName).substring(0, 15)}</span>
                <span class="production-count">Tier ${unit.unitTier}</span>
            </div>
        `).join('');
    }

    renderResourceGraph() {
        const myTeam = gameState.getMyTeam();
        if (!myTeam?.metalStats) return '<p>Waiting for data...</p>';

        // Get last 10 metal income values from trend
        const trend = gameState.getResourceTrend(gameState.gameState.myTeamID, 60, 'metal');
        const recentTrend = trend.slice(-10);

        if (recentTrend.length === 0) {
            return '<p style="color: var(--text-secondary);">No data yet...</p>';
        }

        const maxIncome = Math.max(...recentTrend.map(t => t.income), 50);

        return `
            <div class="stat-row" style="margin-bottom: 8px;">
                <span class="stat-label">Metal Trend</span>
                <span class="stat-value">${this.formatNumber(myTeam.metalStats.income || 0, 1)}/s</span>
            </div>
            <div class="resource-trend">
                ${recentTrend.map(t => `
                    <div class="trend-bar" style="height: ${(t.income / maxIncome) * 100}%;" title="${this.formatNumber(t.income, 1)}/s"></div>
                `).join('')}
            </div>
        `;
    }

    /**
     * UTILITY
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

    /**
     * EVENT LISTENERS
     */

    initializeEventListeners() {
        // Exit streaming mode
        document.getElementById('exit-streaming-btn')?.addEventListener('click', () => {
            uiManager.switchView('standard');
        });

        // Enter layout mode
        document.getElementById('edit-layout-btn')?.addEventListener('click', () => {
            this.switchToLayoutMode();
        });

        // Save layout and exit
        document.getElementById('save-layout-btn')?.addEventListener('click', () => {
            this.saveLayout();
            this.switchToStreamingMode();
        });

        // Reset layout
        document.getElementById('reset-layout-btn')?.addEventListener('click', () => {
            if (confirm('Reset layout to defaults?')) {
                this.widgets.clear();
                this.widgetCounter = 0;
                this.createDefaultLayout();
                this.renderLayoutWidgets();
            }
        });

        // Widget library dropdown
        document.getElementById('add-widget-dropdown-btn')?.addEventListener('click', (e) => {
            const dropdown = document.getElementById('widget-library-dropdown');
            dropdown.classList.toggle('hidden');
        });

        // Add widget buttons
        document.querySelectorAll('.widget-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                //const widgetType = e.target.dataset.widget;
                const widgetType = e.currentTarget.dataset.widget;
                this.addWidget(widgetType);
                document.getElementById('widget-library-dropdown').classList.add('hidden');
            });
        });

        // Update widgets periodically
        setInterval(() => {
            if (!this.layoutMode) {
                this.renderStreamingWidgets();
            }
        }, 1000);
    }

    /**
     * LAYOUT PERSISTENCE
     */

    saveLayout() {
        const layout = Array.from(this.widgets.values()).map(w => ({
            type: w.type,
            position: w.position
        }));
        localStorage.setItem('BAR-streaming-layout', JSON.stringify(layout));
    }

    loadLayout() {
        const saved = localStorage.getItem('BAR-streaming-layout');
        if (saved) {
            try {
                const layout = JSON.parse(saved);
                this.widgets.clear();
                this.widgetCounter = 0;
                layout.forEach(item => {
                    const widget = this.addWidget(item.type);
                    if (widget) {
                        widget.position = item.position;
                    }
                });
            } catch (err) {
                console.error('Error loading layout:', err);
                this.createDefaultLayout();
            }
        } else {
            this.createDefaultLayout();
        }
    }

    createDefaultLayout() {
        this.addWidget('game-timer');
        this.addWidget('economy-minimal');
        this.addWidget('combat-overview');
        this.addWidget('trigger-panel');
    }
}

// Singleton instance

const streamingWidgets = new StreamingWidgetSystem(); 

document.addEventListener('DOMContentLoaded', () => {
    streamingWidgets.loadLayout();
    streamingWidgets.switchToStreamingMode();
});


