/**
 * GameStateStore - Centralized, efficient game data management
 * Handles all event data, unit tracking, team stats, and historical queries
 * Designed for easy trigger development and custom condition evaluation
 *
 * Fix #5: damageHistory, statsHistory, and the events log are now bounded.
 *   - damageHistory: rolling cap of DAMAGE_HISTORY_MAX entries (~30s at peak fire rate)
 *   - statsHistory:  rolling cap of STATS_HISTORY_MAX entries (~2 min at 1 Hz)
 *   - events:        rolling cap of EVENTS_MAX entries; eventIndex IDs are relative
 *                    positions in the capped array so old entries age out cleanly.
 *
 * Unit-level and team-level running counters (damageDealt, damageTaken,
 * totalDamageDealt, killedCount, etc.) are unaffected — they accumulate for
 * the whole game and are the primary path for O(1) trigger lookups.
 * The history arrays exist only for windowed / trend queries.
 */

// ── Capacity constants ────────────────────────────────────────────────────────
// Tune these if memory becomes a concern; they are deliberately generous.

/** Max entries kept in damageHistory. UnitDamaged fires ~30 Hz per unit in
 *  combat; 2 000 entries covers ~60s of heavy fighting with headroom. */
const DAMAGE_HISTORY_MAX = 2000;

/** Max entries in statsHistory. FullStatsUpdate fires ~1 Hz → 120 entries = 2 min. */
const STATS_HISTORY_MAX = 120;

/** Max entries in the events log. Covers the longest trigger look-back window
 *  (currently 30 s) with ample headroom for bursty UnitFinished traffic. */
const EVENTS_MAX = 1000;

class GameStateStore {
    constructor() {
        // Core collections
        this.units      = new Map();   // unitID  -> unitData
        this.teams      = new Map();   // teamID  -> teamData
        this.events     = [];          // capped chronological event log
        this.eventIndex = new Map();   // eventType -> [indices into this.events]

        // Time-series data for trends — capped ring buffers
        this.statsHistory  = [];       // [{timestamp, frame, teamID, stats}]
        this.damageHistory = [];       // [{timestamp, frame, attacker, victim, damage}]

        // Current game state
        this.gameState = {
            frame:       0,
            gameTime:    0,
            myTeamID:   -1,
            myPlayerID: -1,
            allyTeamID: -1,
            gameStarted: false,
            gameEnded:   false,
            overflow_m:  false,
            overflow_e:  false
        };

        // Performance optimization - batch updates
        this.pendingUpdates  = [];
        this.updateBatchSize = 5;
        this.updateCounter   = 0;
    }

    /**
     * INITIALIZATION & GAME STATE
     */

    initGame(playerInfo) {
        this.gameState = {
            ...this.gameState,
            myTeamID:    playerInfo.myTeamID,
            myPlayerID:  playerInfo.myPlayerID,
            allyTeamID:  playerInfo.allyTeamID,
            playerName:  playerInfo.playerName,
            gameStarted: true
        };

        // Use initTeam so the shape is always consistent
        this.initTeam(playerInfo.myTeamID, {
            isMyTeam:   true,
            isMyAlly:   true,
            playerName: playerInfo.playerName
        });

        this.logEvent({
            event:     'GameInitialized',
            timestamp: Date.now(),
            data:      playerInfo
        });
    }

    /**
     * Single place that creates a team entry.
     * Idempotent: returns the existing team if already initialised, without
     * touching any counters.
     */
    initTeam(teamID, options = {}) {
        if (this.teams.has(teamID)) return this.teams.get(teamID);

        const team = {
            teamID,
            isMyTeam:         options.isMyTeam   || false,
            isMyAlly:         options.isMyAlly   || false,
            playerName:       options.playerName || null,
            color:            options.color      || null,
            unitCount:        0,
            totalMetalCost:   0,
            builderEfficiency:   100,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            killedCount:      0,
            lostCount:        0,
            metalKilled:      0,
            metalLost:        0,
            // Cumulative build capacity: sum of buildSpeed for all living builder units.
            // Incremented by addUnit(), decremented by destroyUnit() using unitBuildSpeed
            // from UnitFinished / UnitDestroyed events (mirrors charts.lua logic).
            // Divide by BUILDSPEED_TO_METAL (15) to convert to metal/s equivalent for charts.
            teamBuildSpeed:   0,
            metalStats:       {},
            energyStats:      {},
            efficiencyVersion:   0,
            lastUpdate:       Date.now()
        };

        this.teams.set(teamID, team);
        return team;
    }

    /**
     * EVENT LOGGING & INDEXING
     * Fix #5: events array is capped at EVENTS_MAX. When the cap is hit the
     * oldest entry is removed and the eventIndex is rebuilt for that type so
     * stale indices are never served to callers.
     */

    logEvent(eventData) {
        const eventRecord = {
            id:        this.events.length,   // logical ID; only used for ordering
            timestamp: eventData.timestamp || Date.now(),
            frame:     this.gameState.frame,
            gameTime:  this.gameState.gameTime,
            type:      eventData.event,
            data:      eventData
        };

        // Enforce cap: drop the oldest entry before pushing the new one
        if (this.events.length >= EVENTS_MAX) {
            const removed = this.events.shift();
            // Prune the eventIndex entry for the removed event's type
            if (removed && removed.type) {
                const idxArr = this.eventIndex.get(removed.type);
                if (idxArr && idxArr.length > 0) idxArr.shift();
            }
        }

        this.events.push(eventRecord);

        // Build reverse index for fast lookup by type
        if (!this.eventIndex.has(eventData.event)) {
            this.eventIndex.set(eventData.event, []);
        }
        this.eventIndex.get(eventData.event).push(eventRecord);

        return eventRecord;
    }

    /**
     * UNIT TRACKING & QUERIES
     */

    addUnit(unitID, unitData) {
        const unit = {
            unitID,
            unitDefID:    unitData.unitDefID,
            unitName:     unitData.unitName,
            unitTier:     unitData.unitTier || 1,
            metalCost:    unitData.unitMetalCost || 0,
            buildSpeed:   unitData.unitBuildSpeed || 0,
            teamID:       unitData.unitTeam,
            relation:     unitData.relation,

            // Tracking metrics
            createdAt:       this.gameState.gameTime,
            damageTaken:     0,
            damageDealt:     0,
            killCount:       0,
            metalKilled:     0,
            assistCount:     0,
            lastDamagedAt:   null,
            lastDamagedBy:   null,
            inCombat:        false,

            // State
            destroyed:       false,
            destroyedAt:     null,
            destroyedBy:     null,
            destroyedByTeam: null,
            creatorPlayer:   unitData.playerName || 'Unknown'
        };

        this.units.set(unitID, unit);

        // Update team stats
        if (this.teams.has(unit.teamID)) {
            const team = this.teams.get(unit.teamID);
            team.unitCount      += 1;
            team.totalMetalCost += unit.metalCost;
            // unitBuildSpeed is 0 for combat/structure units; safe to always add
            team.teamBuildSpeed   += (unit.buildSpeed || 0);
        }

        return unit;
    }

    destroyUnit(unitID, attackerID, attackerTeam) {
        const unit = this.units.get(unitID);
        console.log('🔍 destroyUnit | unitID:', unitID, '| found:', !unit, '| units in map:', this.units.size);
        if (!unit) return null;

        unit.destroyed       = true;
        unit.destroyedAt     = this.gameState.gameTime;
        unit.destroyedBy     = attackerID;
        unit.destroyedByTeam = attackerTeam;

        // Update victim's team stats
        if (this.teams.has(unit.teamID)) {
            const team = this.teams.get(unit.teamID);
            team.unitCount      -= 1;
            team.totalMetalCost -= unit.metalCost;
            team.lostCount      += 1;
            team.metalLost       = (team.metalLost || 0) + unit.metalCost;
            // Clamp to 0 — floating point or ordering edge cases shouldn't go negative
            team.teamBuildSpeed  = Math.max(0, team.teamBuildSpeed - (unit.buildSpeed || 0));
        }

        // Update attacker unit stats
        if (attackerID != null && attackerID !== -1) {
            const attacker = this.units.get(attackerID);
            if (attacker) {
                attacker.killCount   += 1;
                attacker.metalKilled  = (attacker.metalKilled || 0) + unit.metalCost;
            }
        }

        // Update attacker's team stats
        // fix to ensure my own teams stats are updated
        if (attackerTeam != null && attackerTeam !== -1 && this.teams.has(attackerTeam)) {
            const attackerTeamData = this.teams.get(attackerTeam);
            attackerTeamData.killedCount += 1;
            attackerTeamData.metalKilled  = (attackerTeamData.metalKilled || 0) + unit.metalCost;
        }

        return unit;
    }

    damageUnit(unitID, damage, attackerID, attackerTeam) {
        const unit = this.units.get(unitID);
        if (!unit) return null;

        unit.damageTaken   += damage;
        unit.lastDamagedAt  = this.gameState.gameTime;
        unit.lastDamagedBy  = attackerID;
        unit.inCombat       = true;

        // Update attacker unit stats (O(1) running counter)
        if (attackerID != null && attackerID !== -1) {
            const attacker = this.units.get(attackerID);
            if (attacker) attacker.damageDealt += damage;
        }

        // NOTE: team.totalDamageDealt and team.totalDamageTaken are NOT updated here.
        // UnitDamaged events do not carry attackerTeam, and the Spring engine's
        // cumulative damage_dealt / damage_received values can differ from a naive
        // sum of individual hit events (shields, overkill, self-damage, etc.).
        // FullStatsUpdate is the sole authoritative source for team-level damage
        // totals — see updateTeamStats(). Per-unit counters above remain for triggers.


        // Fix #5: push to bounded damageHistory — drop oldest if at cap
        if (this.damageHistory.length >= DAMAGE_HISTORY_MAX) {
            this.damageHistory.shift();
        }
        this.damageHistory.push({
            timestamp:   Date.now(),
            frame:       this.gameState.frame,
            gameTime:    this.gameState.gameTime,
            attacker:    attackerID,
            attackerTeam,
            victim:      unitID,
            victimTeam:  unit.teamID,
            damage
        });

        return unit;
    }

    /**
     * QUERY METHODS — For building triggers
     */

    // O(1) via running counter on unit
    getUnit(unitID) {
        return this.units.get(unitID);
    }

    // Get all units matching criteria
    queryUnits(criteria) {
        const results = [];
        for (const unit of this.units.values()) {
            if (this.matchesCriteria(unit, criteria)) results.push(unit);
        }
        return results;
    }

    // Get units by team
    getTeamUnits(teamID, includeDestroyed = false) {
        return Array.from(this.units.values()).filter(u =>
            u.teamID === teamID && (includeDestroyed || !u.destroyed)
        );
    }

    getTeam(teamID) {
        return this.teams.get(teamID);
    }

    getMyTeam() {
        return this.teams.get(this.gameState.myTeamID);
    }

    /**
     * Get recent events of a type within a wall-clock window.
     * Fix #5: eventIndex now stores event record references directly, so
     * there is no stale-index problem after the events array is trimmed.
     */
    getRecentEvents(eventType, seconds = 30) {
        const cutoff  = Date.now() - (seconds * 1000);
        const records = this.eventIndex.get(eventType) || [];

        // Records are already in chronological order; filter and reverse for callers
        return records
            .filter(e => e && e.timestamp >= cutoff)
            .reverse(); // Most recent first
    }

    // O(1) via running counter on unit
    getKillCount(unitID) {
        const unit = this.units.get(unitID);
        return unit ? unit.killCount : 0;
    }

    // Count kills attributed to a unit within a game-time window
    countKillsInWindow(unitID, seconds = 30) {
        const cutoff = this.gameState.gameTime - seconds;
        return this.getRecentEvents('UnitDestroyed', seconds).filter(e =>
            e.data.attackerID === unitID &&
            e.gameTime >= cutoff
        ).length;
    }

    // O(n) scan — use sparingly; prefer getKillCount for plain counts
    getKilledBy(unitID) {
        return Array.from(this.units.values()).filter(u => u.destroyedBy === unitID);
    }

    /**
     * O(1) — reads the running counter accumulated during damageUnit().
     * This is the correct method to use in trigger conditions.
     */
    getDamageDealtBy(unitID) {
        const unit = this.units.get(unitID);
        return unit ? unit.damageDealt : 0;
    }

    getDamageTakenBy(unitID) {
        const unit = this.units.get(unitID);
        return unit ? unit.damageTaken : 0;
    }

    // Time-series analysis: damage rate against a team within a wall-clock window
    getDamageRateInWindow(teamID, seconds = 120) {
        const cutoff      = Date.now() - (seconds * 1000);
        const recentDamage = this.damageHistory.filter(d =>
            d.victimTeam === teamID && d.timestamp >= cutoff
        );

        if (recentDamage.length === 0) return 0;
        const totalDamage = recentDamage.reduce((sum, d) => sum + d.damage, 0);
        return totalDamage / seconds; // damage per second
    }

    isTeamBleeding(teamID, damagePerSecThreshold = 50, windowSeconds = 120) {
        return this.getDamageRateInWindow(teamID, windowSeconds) > damagePerSecThreshold;
    }

    /**
     * Update team resource stats and push to bounded statsHistory.
     * Fix #5: statsHistory is capped at STATS_HISTORY_MAX.
     */
    updateTeamStats(teamID, stats) {
        const team = this.teams.get(teamID);
        if (!team) return;

        team.metalStats  = stats.metal  || {};
        team.energyStats = stats.energy || {};
        team.lastUpdate  = Date.now();

        // ── meta: builder efficiency % ────────────────────────────────────────
        // Sent as data.meta.builderEfficiency from FullStatsUpdate (killbridge.lua).
        // 100 = all active builders at full speed (or no builders / all idle).
        // Values below 100 indicate eco starvation or partially-fed build queues.
        if (stats.metal?.builderEfficiency != null) {
            team.builderEfficiency = stats.metal.builderEfficiency;
            team.efficiencyVersion = (team.efficiencyVersion || 0) + 1; 
        }

        // ── Stall detection ───────────────────────────────────────────────────
        // Flag when pull > income by more than 10% on either resource.
        // stallState is a bitmask: bit 0 = metal, bit 1 = energy.
        //   0 = healthy
        //   1 = metal stall   (metal pull  > metal income  × 1.10)
        //   2 = energy stall  (energy pull > energy income × 1.10)
        //   3 = both stalling simultaneously
        {
            const m = team.metalStats;
            const e = team.energyStats;
            const metalStall  = m && (m.pull  ?? 0) > 0 && (m.income  ?? 0) > 0
                             && m.pull  > m.income  * 1.10;
            const energyStall = e && (e.pull  ?? 0) > 0 && (e.income  ?? 0) > 0
                             && e.pull  > e.income  * 1.10;
            team.stallState = (metalStall  ? 1 : 0)
                            | (energyStall ? 2 : 0);
        }

        // ── Combat totals (authoritative from FullStatsUpdate) ────────────────
        if (stats.combat) {
            const c = stats.combat;
            if (c.damage_dealt    != null) team.totalDamageDealt = c.damage_dealt;
            if (c.damage_received != null) team.totalDamageTaken = c.damage_received;
            if (c.units_killed    != null) team.killedCount       = c.units_killed;
            if (c.units_died      != null) team.lostCount         = c.units_died;
        }

        // ── Bounded statsHistory push ─────────────────────────────────────────
        if (this.statsHistory.length >= STATS_HISTORY_MAX) {
            this.statsHistory.shift();
        }
        this.statsHistory.push({
            timestamp: Date.now(),
            frame:     this.gameState.frame,
            teamID,
            stats:     { ...stats }
        });
    }

    getResourceTrend(teamID, seconds = 60, resource = 'metal') {
        const cutoff = Date.now() - (seconds * 1000);
        return this.statsHistory.filter(s =>
            s.teamID === teamID && s.timestamp >= cutoff
        ).map(s => ({
            timestamp: s.timestamp,
            income:    s.stats[resource]?.income  || 0,
            usage:     s.stats[resource]?.usage   || 0,
            storage:   s.stats[resource]?.storage || 0,
            excess:    s.stats[resource]?.excess  || 0
        }));
    }

    getResourceStatus(resource = 'metal') {
        if (resource === 'metal')  return this.gameState.overflow_m;
        if (resource === 'energy') return this.gameState.overflow_e;
        return false;
    }

    /**
     * UTILITY METHODS
     */

    matchesCriteria(unit, criteria) {
        if (criteria.teamID   && unit.teamID    !== criteria.teamID)   return false;
        if (criteria.minCost  && unit.metalCost  < criteria.minCost)   return false;
        if (criteria.maxCost  && unit.metalCost  > criteria.maxCost)   return false;
        if (criteria.tier     && unit.unitTier   !== criteria.tier)    return false;
        if (criteria.relation && unit.relation   !== criteria.relation) return false;
        if (criteria.inCombat && unit.inCombat   !== criteria.inCombat) return false;
        return true;
    }

    /**
     * Full reset for a new game.
     * Also calls triggerEngine.resetForNewGame() so non-repeatable trigger
     * firedOnce flags and per-game fire counts are cleared atomically.
     */
    reset() {
        this.units.clear();
        this.teams.clear();
        this.events       = [];
        this.eventIndex.clear();
        this.statsHistory  = [];
        this.damageHistory = [];

        // Reset game state flags (preserve identity fields until initGame fires)
        this.gameState.gameStarted = false;
        this.gameState.gameEnded   = false;
        this.gameState.overflow_m  = false;
        this.gameState.overflow_e  = false;
        this.gameState.frame       = 0;
        this.gameState.gameTime    = 0;

        // Reset trigger per-game state
        if (typeof triggerEngine !== 'undefined') {
            triggerEngine.resetForNewGame();
        }

        console.log('🔄 GameStateStore: full reset complete');
    }

    getGameSummary() {
        const myTeam = this.getMyTeam();
        return {
            gameTime:   this.gameState.gameTime,
            frame:      this.gameState.frame,
            myTeam:     myTeam ? {
                units:       myTeam.unitCount,
                totalCost:   myTeam.totalMetalCost,
                damageDealt: myTeam.totalDamageDealt,
                damageTaken: myTeam.totalDamageTaken,
                kills:       myTeam.killedCount,
                losses:      myTeam.lostCount
            } : null,
            eventCount:        this.events.length,
            damageHistorySize: this.damageHistory.length,
            statsHistorySize:  this.statsHistory.length
        };
    }
}

// Singleton instance
const gameState = new GameStateStore();