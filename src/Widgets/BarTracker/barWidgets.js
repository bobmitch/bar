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

// image widget timing (also used in CSS, keep in sync)
const IMAGE_DISPLAY_MS    = 4000;   // how long the image stays visible
const IMAGE_FADE_MS       = 300;    // CSS transition duration (keep in sync with CSS)

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

        // Pull subtitle from context if the action provided one
        const subtitle = data.context?.visual?.description
                  || data.context?.visual?.value
                  || null;
        const card = document.createElement('div');
        card.className = 'wt-card';
        card.innerHTML = `
            <span class="wt-icon">⚡</span>
            <div class="wt-body">
                <span class="wt-name">${_bwEsc(data.name || 'Trigger Fired')}</span>
                ${subtitle ? `<span class="wt-subtitle">${_bwEsc(subtitle)}</span>` : ''}
            </div>
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


widgetManager.register({
    id             : 'image-display',
    type           : 'image-display',
    label          : 'Image Display',
    defaultX       : 400,
    defaultY       : 200,
    defaultScale   : 1.0,
    defaultEnabled : true,

    /** Called once at mount time — build the DOM skeleton. */
    render(def, inner) {
        inner.innerHTML = `
            <div class="wid-frame">
                <img class="wid-img" src="" alt="" draggable="false" />
            </div>
        `;
        // Start hidden; opacity driven by .wid-visible class
        inner.querySelector('.wid-frame').style.opacity = '0';
        inner.querySelector('.wid-img').style.display   = 'none';

        // Stash timer ref on the def so re-entrant fires cancel correctly
        def._hideTimer = null;
    },

    /** Called each time a trigger fires (from widgetManager.emitTrigger). */
    onTrigger(def, inner, triggerData) {
        // Only act when this trigger carries an image
        const src = triggerData.image_src;
        if (!src) return;

        const frame = inner.querySelector('.wid-frame');
        const img   = inner.querySelector('.wid-img');
        if (!frame || !img) return;

        // Cancel any in-progress hide timer so we restart the 2s window
        if (def._hideTimer) {
            clearTimeout(def._hideTimer);
            def._hideTimer = null;
        }

        // Swap src if it changed (re-triggers GIF from frame 1 by forcing reload)
        if (img.src !== src) {
            img.style.display = 'none';
            img.src = '';
            // A tiny delay lets the browser drop the previous decode before reloading
            requestAnimationFrame(() => {
                img.src           = src;
                img.style.display = '';
            });
        } else {
            img.style.display = '';
        }

        // Fade in
        requestAnimationFrame(() => {
            frame.style.opacity    = '1';
            frame.style.transition = `opacity ${IMAGE_FADE_MS}ms ease`;
        });

        // Schedule fade-out
        def._hideTimer = setTimeout(() => {
            frame.style.opacity = '0';
            def._hideTimer = null;
        }, IMAGE_DISPLAY_MS);
    }
});

// ── Public tick — call after any gameState update ─────────────────────────────
const statWidgets = {
    tick() {
        for (const s of STAT_DEFS) widgetManager.update(s.id, null);
    }
};