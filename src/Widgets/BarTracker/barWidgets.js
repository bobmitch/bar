/**
 * barWidgets.js — BAR Tracker widget definitions
 * Depends on: widgetManager.js, gameStateStore.js
 *
 * Call statWidgets.tick() after any gameState data update.
 * Call widgetManager.emitTrigger(triggerData) when a trigger fires.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────
function _bwEsc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _bwFmt(n) {
    n = Math.round(n);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 10_000)    return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}

// ── Trigger Feed Widget ───────────────────────────────────────────────────────
// Stacking toast cards that animate in, live for DISPLAY_MS, then fade out.
const TRIGGER_DISPLAY_MS = 4500;
const TRIGGER_MAX_STACK  = 8;

widgetManager.register({
    id: 'trigger-feed',
    type: 'trigger',
    label: 'Trigger Feed',
    defaultX: 30,
    defaultY: 50,
    defaultScale: 1.0,
    defaultEnabled: true,

    render(def, inner) {
        inner.innerHTML = `<div class="wt-stack"></div>`;
    },

    onTrigger(def, inner, data) {
        const stack = inner.querySelector('.wt-stack');
        if (!stack) return;

        // Cull oldest if at max
        while (stack.children.length >= TRIGGER_MAX_STACK) {
            const oldest = stack.firstElementChild;
            oldest.classList.add('wt-exit');
            setTimeout(() => oldest.remove(), 400);
            break; // only remove one at a time
        }

        const card = document.createElement('div');
        card.className = 'wt-card';
        card.innerHTML = `
            <span class="wt-icon">⚡</span>
            <span class="wt-name">${_bwEsc(data.name || 'Trigger Fired')}</span>
        `;
        stack.appendChild(card);

        // Animate in — double rAF forces a reflow between add and class
        requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('wt-visible')));

        // Schedule fade-out
        setTimeout(() => {
            card.classList.remove('wt-visible');
            card.classList.add('wt-exit');
            card.addEventListener('transitionend', () => card.remove(), { once: true });
        }, TRIGGER_DISPLAY_MS);
    }
});


// ── Stat Widgets ──────────────────────────────────────────────────────────────
// Each stat is a fully independent draggable widget.
// They share a single update loop via statWidgets.tick().

const STAT_DEFS = [
    {
        id: 'stat-army-value',
        label: 'ARMY VALUE',
        icon: '⚙',
        defaultX: 30, defaultY: 50,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? t.totalMetalCost : 0;
        }
    },
    {
        id: 'stat-unit-count',
        label: 'UNITS',
        icon: '▣',
        defaultX: 30, defaultY: 130,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? t.unitCount : 0;
        }
    },
    {
        id: 'stat-kills',
        label: 'KILLS',
        icon: '✕',
        defaultX: 30, defaultY: 210,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? t.killedCount : 0;
        }
    },
    {
        id: 'stat-losses',
        label: 'LOSSES',
        icon: '↓',
        defaultX: 30, defaultY: 290,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? t.lostCount : 0;
        }
    },
    {
        id: 'stat-dmg-dealt',
        label: 'DMG DEALT',
        icon: '▲',
        defaultX: 30, defaultY: 370,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? t.totalDamageDealt : 0;
        }
    },
    {
        id: 'stat-dmg-taken',
        label: 'DMG TAKEN',
        icon: '▼',
        defaultX: 30, defaultY: 450,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? t.totalDamageTaken : 0;
        }
    },
    {
        id: 'stat-metal-lost',
        label: 'METAL LOST',
        icon: '◆',
        defaultX: 30, defaultY: 530,
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? (t.metalLost || 0) : 0;
        }
    },
];

for (const s of STAT_DEFS) {
    // Capture s in closure
    (function(s) {
        console.log("Registering Widget: ", s);
        widgetManager.register({
            id: s.id,
            type: 'stat',
            label: s.label,
            defaultX: s.defaultX,
            defaultY: s.defaultY,
            defaultScale: 1.0,
            defaultEnabled: true,
            _prevVal: null,
            _getValue: s.getValue,

            render(def, inner) {
                inner.innerHTML = `
                    <div class="ws-card">
                        <span class="ws-icon">${s.icon}</span>
                        <div class="ws-body">
                            <div class="ws-value" id="${s.id}-val">—</div>
                            <div class="ws-label">${s.label}</div>
                        </div>
                    </div>`;
            },

            update(def, inner) {
                const valEl = inner.querySelector(`#${s.id}-val`);
                if (!valEl) return;
                const raw = def._getValue();
                const fmt = _bwFmt(raw);
                if (fmt === valEl.textContent) return;

                valEl.textContent = fmt;
                // Flash animation on change
                valEl.classList.remove('ws-pop');
                void valEl.offsetWidth;
                valEl.classList.add('ws-pop');
                setTimeout(() => valEl.classList.remove('ws-pop'), 500);
                def._prevVal = raw;
            }
        });
    })(s);
}

// ── Public tick — call after any gameState update ─────────────────────────────
const statWidgets = {
    tick() {
        for (const s of STAT_DEFS) widgetManager.update(s.id, null);
    }
};