/**
 * BAR Tracker - Event Type Registry
 * 
 * Single source of truth for all event type strings received from the BAR data stream.
 * 
 * USAGE:
 *   // Instead of:          if (eventType === 'UnitFinished') { ... }
 *   // Use:                 if (eventType === BAR_EVENTS.UNIT_FINISHED) { ... }
 * 
 *   // Instead of:          case 'FullStatsUpdate':
 *   // Use:                 case BAR_EVENTS.FULL_STATS_UPDATE:
 * 
 *   // Check if an event should be logged to the battle log:
 *   if (BAR_EVENT_META[eventType]?.logToBattleLog) { ... }
 * 
 * ADDING NEW EVENTS:
 *   1. Add the constant to BAR_EVENTS below
 *   2. Add a metadata entry to BAR_EVENT_META below
 *   3. Add a handler to eventHandler.js updateGameState() switch
 *   4. Add display formatting to uiManager.js logEvent() if logToBattleLog is true
 * 
 * Event types confirmed from live session data (session_2026-02-15):
 *   WidgetInitializedPreGame x1, GameStart x1, GameOver x1, AllUnits x1,
 *   UnitFinished x989, UnitDamaged x2134, UnitDestroyed x243,
 *   FullStatsUpdate x165, AllyStatsUpdate x165
 */

const BAR_EVENTS = Object.freeze({

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    WIDGET_INITIALIZED_PRE_GAME : 'WidgetInitializedPreGame',
    GAME_START                  : 'GameStart',
    GAME_OVER                   : 'GameOver',

    // ── Units ─────────────────────────────────────────────────────────────────
    ALL_UNITS                   : 'AllUnits',           // Full unit definition dump
    UNIT_FINISHED               : 'UnitFinished',       // Unit construction complete
    UNIT_DAMAGED                : 'UnitDamaged',        // Unit took damage
    UNIT_DESTROYED              : 'UnitDestroyed',      // Unit killed

    // ── Stats ─────────────────────────────────────────────────────────────────
    FULL_STATS_UPDATE           : 'FullStatsUpdate',    // My team's resource + combat stats
    ALLY_STATS_UPDATE           : 'AllyStatsUpdate',    // All teams' resource stats
    ALLY_COLORS_UPDATE          : 'AllyColorsUpdate',   // In-game team colours

    // ── Status ────────────────────────────────────────────────────────────────
    OVERFLOW_STATUS_CHANGED     : 'OverflowStatusChanged',
    ALLY_STATES_UPDATE          : 'AllyStatesUpdate',
    PLAYER_BECAME_SPECTATOR     : 'PlayerBecameSpectator',

});

/**
 * Metadata for each event type.
 * 
 * logToBattleLog  {bool}   - Show in the battle log panel (standard view)
 * logPriority     {string} - 'critical' | 'high' | 'normal' | 'low'
 * throttle        {bool}   - High-frequency event, UI should throttle updates
 * icon            {string} - Default emoji for battle log display
 * label           {string} - Human-readable label for UI display
 */
const BAR_EVENT_META = Object.freeze({

    [BAR_EVENTS.WIDGET_INITIALIZED_PRE_GAME]: {
        logToBattleLog : false,
        logPriority    : 'low',
        throttle       : false,
        icon           : '🟡',
        label          : 'Widget Ready',
    },

    [BAR_EVENTS.GAME_START]: {
        logToBattleLog : true,
        logPriority    : 'high',
        throttle       : false,
        icon           : '🎮',
        label          : 'Game Start',
    },

    [BAR_EVENTS.GAME_OVER]: {
        logToBattleLog : true,
        logPriority    : 'critical',
        throttle       : false,
        icon           : '🏁',
        label          : 'Game Over',
    },

    [BAR_EVENTS.ALL_UNITS]: {
        logToBattleLog : false,
        logPriority    : 'low',
        throttle       : false,
        icon           : '📦',
        label          : 'Unit Definitions Loaded',
    },

    [BAR_EVENTS.UNIT_FINISHED]: {
        logToBattleLog : true,
        logPriority    : 'normal',   // overridden to 'high' for own units in uiManager
        throttle       : false,
        icon           : '🔧',
        label          : 'Unit Finished',
    },

    [BAR_EVENTS.UNIT_DAMAGED]: {
        logToBattleLog : false,      // too frequent — filtered in updateUI
        logPriority    : 'low',
        throttle       : true,
        icon           : '💥',
        label          : 'Unit Damaged',
    },

    [BAR_EVENTS.UNIT_DESTROYED]: {
        logToBattleLog : true,
        logPriority    : 'critical',
        throttle       : false,
        icon           : '💀',
        label          : 'Unit Destroyed',
    },

    [BAR_EVENTS.FULL_STATS_UPDATE]: {
        logToBattleLog : false,      // too frequent
        logPriority    : 'low',
        throttle       : true,
        icon           : '📊',
        label          : 'Stats Update',
    },

    [BAR_EVENTS.ALLY_STATS_UPDATE]: {
        logToBattleLog : false,
        logPriority    : 'low',
        throttle       : true,
        icon           : '📈',
        label          : 'Ally Stats',
    },

    [BAR_EVENTS.ALLY_COLORS_UPDATE]: {
        logToBattleLog : false,
        logPriority    : 'low',
        throttle       : false,
        icon           : '🎨',
        label          : 'Ally Colors',
    },

    [BAR_EVENTS.OVERFLOW_STATUS_CHANGED]: {
        logToBattleLog : true,
        logPriority    : 'high',
        throttle       : false,
        icon           : '⚠️',
        label          : 'Overflow Status',
    },

    [BAR_EVENTS.ALLY_STATES_UPDATE]: {
        logToBattleLog : false,
        logPriority    : 'low',
        throttle       : false,
        icon           : '👥',
        label          : 'Ally States',
    },

    [BAR_EVENTS.PLAYER_BECAME_SPECTATOR]: {
        logToBattleLog : true,
        logPriority    : 'high',
        throttle       : false,
        icon           : '👁️',
        label          : 'Player Became Spectator',
    },

});

/**
 * Helper — returns the metadata for an event type, with safe fallback.
 * Use this instead of directly indexing BAR_EVENT_META so unknown events
 * don't silently fail.
 * 
 * @param {string} eventType
 * @returns {object}
 */
function getEventMeta(eventType) {
    return BAR_EVENT_META[eventType] ?? {
        logToBattleLog : true,
        logPriority    : 'normal',
        throttle       : false,
        icon           : '❓',
        label          : eventType,   // show raw string for unknown events
    };
}

// Expose globally for use across all modules
window.BAR_EVENTS     = BAR_EVENTS;
window.BAR_EVENT_META = BAR_EVENT_META;
window.getEventMeta   = getEventMeta;