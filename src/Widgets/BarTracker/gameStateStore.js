/**
 * GameStateStore - Centralized, efficient game data management
 * Handles all event data, unit tracking, team stats, and historical queries
 * Designed for easy trigger development and custom condition evaluation
 */

class GameStateStore {
    constructor() {
        // Core collections
        this.units = new Map();           // unitID -> unitData
        this.teams = new Map();           // teamID -> teamData
        this.events = [];                 // chronological event log
        this.eventIndex = new Map();      // eventType -> [eventIDs]
        
        // Time-series data for trends
        this.statsHistory = [];           // [{timestamp, frame, teamID, stats}]
        this.damageHistory = [];          // [{timestamp, frame, attacker, victim, damage}]
        
        // Current game state
        this.gameState = {
            frame: 0,
            gameTime: 0,
            myTeamID: -1,
            myPlayerID: -1,
            allyTeamID: -1,
            gameStarted: false,
            gameEnded: false,
            overflow_m: false,
            overflow_e: false
        };
        
        // Performance optimization - batch updates
        this.pendingUpdates = [];
        this.updateBatchSize = 5;
        this.updateCounter = 0;
    }

    /**
     * INITIALIZATION & GAME STATE
     */

    initGame(playerInfo) {
        this.gameState = {
            ...this.gameState,
            myTeamID: playerInfo.myTeamID,
            myPlayerID: playerInfo.myPlayerID,
            allyTeamID: playerInfo.allyTeamID,
            playerName: playerInfo.playerName,
            gameStarted: true
        };
        
        // Initialize team tracking
        this.teams.set(playerInfo.myTeamID, {
            teamID: playerInfo.myTeamID,
            allyTeamID: playerInfo.allyTeamID,
            isMyTeam: true,
            isMyAlly: true,
            unitCount: 0,
            totalMetalCost: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            killedCount: 0,
            lostCount: 0,
            metalStats: {},
            energyStats: {},
            lastUpdate: Date.now()
        });
        
        this.logEvent({
            event: 'GameInitialized',
            timestamp: Date.now(),
            data: playerInfo
        });
    }

    /**
     * EVENT LOGGING & INDEXING
     */

    logEvent(eventData) {
        const eventRecord = {
            id: this.events.length,
            timestamp: eventData.timestamp || Date.now(),
            frame: this.gameState.frame,
            gameTime: this.gameState.gameTime,
            type: eventData.event,
            data: eventData
        };
        
        this.events.push(eventRecord);
        
        // Build reverse index for fast lookup by type
        if (!this.eventIndex.has(eventData.event)) {
            this.eventIndex.set(eventData.event, []);
        }
        this.eventIndex.get(eventData.event).push(eventRecord.id);
        
        return eventRecord;
    }

    /**
     * UNIT TRACKING & QUERIES
     */

    addUnit(unitID, unitData) {
        const unit = {
            unitID,
            unitDefID: unitData.unitDefID,
            unitName: unitData.unitName,
            unitTier: unitData.unitTier || 1,
            metalCost: unitData.unitMetalCost || 0,
            teamID: unitData.unitTeam,
            relation: unitData.relation,
            
            // Tracking metrics
            createdAt: this.gameState.gameTime,
            damageTaken: 0,
            damageDealt: 0,
            killCount: 0,
            assistCount: 0,
            lastDamagedAt: null,
            lastDamagedBy: null,
            inCombat: false,
            
            // State
            destroyed: false,
            destroyedAt: null,
            destroyedBy: null,
            destroyedByTeam: null,
            creatorPlayer: unitData.playerName || 'Unknown'
        };
        
        this.units.set(unitID, unit);
        
        // Update team stats
        if (this.teams.has(unit.teamID)) {
            const team = this.teams.get(unit.teamID);
            team.unitCount += 1;
            team.totalMetalCost += unit.metalCost;
        }
        
        return unit;
    }

    destroyUnit(unitID, attackerID, attackerTeam) {
        const unit = this.units.get(unitID);
        if (!unit) return null;
        
        unit.destroyed = true;
        unit.destroyedAt = this.gameState.gameTime;
        unit.destroyedBy = attackerID;
        unit.destroyedByTeam = attackerTeam;
        
        // Update team stats
        if (this.teams.has(unit.teamID)) {
            const team = this.teams.get(unit.teamID);
            team.unitCount -= 1;
            team.totalMetalCost -= unit.metalCost;
            team.lostCount += 1;
        }
        
        if (attackerTeam && this.teams.has(attackerTeam)) {
            const attackerTeamData = this.teams.get(attackerTeam);
            attackerTeamData.killedCount += 1;
        }
        
        return unit;
    }

    damageUnit(unitID, damage, attackerID, attackerTeam) {
        const unit = this.units.get(unitID);
        if (!unit) return null;
        
        unit.damageTaken += damage;
        unit.lastDamagedAt = this.gameState.gameTime;
        unit.lastDamagedBy = attackerID;
        unit.inCombat = true;
        
        // Update team stats
        if (this.teams.has(attackerTeam)) {
            const team = this.teams.get(attackerTeam);
            team.totalDamageDealt += damage;
        }
        
        if (this.teams.has(unit.teamID)) {
            const team = this.teams.get(unit.teamID);
            team.totalDamageTaken += damage;
        }
        
        // Track damage history for trend analysis
        this.damageHistory.push({
            timestamp: Date.now(),
            frame: this.gameState.frame,
            attacker: attackerID,
            attackerTeam: attackerTeam,
            victim: unitID,
            victimTeam: unit.teamID,
            damage: damage
        });
        
        return unit;
    }

    /**
     * QUERY METHODS - For building triggers
     */

    // Get unit with full context
    getUnit(unitID) {
        return this.units.get(unitID);
    }

    // Get all units matching criteria
    queryUnits(criteria) {
        const results = [];
        for (const unit of this.units.values()) {
            if (this.matchesCriteria(unit, criteria)) {
                results.push(unit);
            }
        }
        return results;
    }

    // Get units by team
    getTeamUnits(teamID, includeDestroyed = false) {
        return Array.from(this.units.values()).filter(u => 
            u.teamID === teamID && (includeDestroyed || !u.destroyed)
        );
    }

    // Get team data
    getTeam(teamID) {
        return this.teams.get(teamID);
    }

    // Get my team
    getMyTeam() {
        return this.teams.get(this.gameState.myTeamID);
    }

    // Get recent events of a type
    getRecentEvents(eventType, seconds = 30) {
        const cutoff = Date.now() - (seconds * 1000);
        const eventIDs = this.eventIndex.get(eventType) || [];
        
        return eventIDs
            .map(id => this.events[id])
            .filter(e => e && e.timestamp >= cutoff)
            .reverse(); // Most recent first
    }

    // Count kills in time window
    countKillsInWindow(unitID, seconds = 30) {
        const cutoff = this.gameState.gameTime - seconds;
        const destroyEvents = this.getRecentEvents('UnitDestroyed', seconds);
        
        return destroyEvents.filter(e => 
            e.data.data.attackerID === unitID &&
            e.gameTime >= cutoff
        ).length;
    }

    // Get units killed by a specific unit
    getKilledBy(unitID) {
        return Array.from(this.units.values()).filter(u => 
            u.destroyedBy === unitID
        );
    }

    // Get damage dealt by unit
    getDamageDealtBy(unitID) {
        return this.damageHistory
            .filter(d => d.attacker === unitID)
            .reduce((sum, d) => sum + d.damage, 0);
    }

    // Get damage taken by unit
    getDamageTakenBy(unitID) {
        const unit = this.units.get(unitID);
        return unit ? unit.damageTaken : 0;
    }

    // Time-series analysis: damage rate
    getDamageRateInWindow(teamID, seconds = 120) {
        const cutoff = Date.now() - (seconds * 1000);
        const recentDamage = this.damageHistory.filter(d =>
            d.victimTeam === teamID &&
            d.timestamp >= cutoff
        );
        
        if (recentDamage.length === 0) return 0;
        
        const totalDamage = recentDamage.reduce((sum, d) => sum + d.damage, 0);
        return totalDamage / seconds; // damage per second
    }

    // Check if team is bleeding resources/losing units rapidly
    isTeamBleeding(teamID, damagePerSecThreshold = 50, windowSeconds = 120) {
        return this.getDamageRateInWindow(teamID, windowSeconds) > damagePerSecThreshold;
    }

    // Get metal/energy stats snapshot
    updateTeamStats(teamID, stats) {
        const team = this.teams.get(teamID);
        if (team) {
            team.metalStats = stats.metal || {};
            team.energyStats = stats.energy || {};
            team.lastUpdate = Date.now();
            
            // Log to history for trend analysis
            this.statsHistory.push({
                timestamp: Date.now(),
                frame: this.gameState.frame,
                teamID: teamID,
                stats: { ...stats }
            });
        }
    }

    // Get resources history for trend analysis
    getResourceTrend(teamID, seconds = 60, resource = 'metal') {
        const cutoff = Date.now() - (seconds * 1000);
        return this.statsHistory.filter(s =>
            s.teamID === teamID &&
            s.timestamp >= cutoff
        ).map(s => ({
            timestamp: s.timestamp,
            income: s.stats[resource]?.income || 0,
            usage: s.stats[resource]?.usage || 0,
            storage: s.stats[resource]?.storage || 0,
            excess: s.stats[resource]?.excess || 0
        }));
    }

    // get resource status (flowing or overflowing)
    getResourceStatus(resource = 'metal') {
        if (resource=='metal') {
            return this.gameState.overflow_m;
        } else if (resource=='energy') {
            return this.gameState.overflow_e;
        }
        return false;
    }

    /**
     * UTILITY METHODS
     */

    matchesCriteria(unit, criteria) {
        if (criteria.teamID && unit.teamID !== criteria.teamID) return false;
        if (criteria.minCost && unit.metalCost < criteria.minCost) return false;
        if (criteria.maxCost && unit.metalCost > criteria.maxCost) return false;
        if (criteria.tier && unit.unitTier !== criteria.tier) return false;
        if (criteria.relation && unit.relation !== criteria.relation) return false;
        if (criteria.inCombat && unit.inCombat !== criteria.inCombat) return false;
        return true;
    }

    // Reset for new game
    reset() {
        this.units.clear();
        this.teams.clear();
        this.events = [];
        this.eventIndex.clear();
        this.statsHistory = [];
        this.damageHistory = [];
    }

    // Get stats summary
    getGameSummary() {
        const myTeam = this.getMyTeam();
        return {
            gameTime: this.gameState.gameTime,
            frame: this.gameState.frame,
            myTeam: myTeam ? {
                units: myTeam.unitCount,
                totalCost: myTeam.totalMetalCost,
                damageDealt: myTeam.totalDamageDealt,
                damageTaken: myTeam.totalDamageTaken,
                kills: myTeam.killedCount,
                losses: myTeam.lostCount
            } : null,
            eventCount: this.events.length
        };
    }
}

// Singleton instance
const gameState = new GameStateStore();
