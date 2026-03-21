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
const BUILDSPEED_TO_METAL = 15; // matches gameStateStore — divides raw buildSpeed to metal/s

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


// ── Chart Widgets ─────────────────────────────────────────────────────────────
// Native Canvas 2D line chart — no external libraries.
// New data points scroll in from the right via a canvas-translate animation.
// Each chart widget is independently draggable / scalable / toggleable
// through the standard WidgetManager interface.
//
// CHART_DEFS — add more chart types here; each gets its own widget.
//
// Single-series def shape:
//   id, label, icon, defaultX, defaultY, defaultWidth, defaultHeight
//   color          → hex string for the line / fill
//   getValue()     → current numeric value
//   formatY(n)     → Y axis label formatter
//
// Dual-series def shape — add a `series` array instead of getValue/color:
//   series: [
//     { label, color, getValue() },
//     { label, color, getValue() }
//   ]
//   formatY(n)     → shared Y axis formatter
// ─────────────────────────────────────────────────────────────────────────────

const CHART_DEFS = [
    // ── Army Value ─────────────────────────────────────────────────────────────
    {
        id:           'chart-army-value',
        label:        'ARMY VALUE',
        icon:         '⚙',
        defaultX:     420,
        defaultY:     50,
        defaultWidth: 300,
        defaultHeight:180,
        color:        '#4ab4ff',
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? Math.round(t.totalMetalCost || 0) : 0;
        },
        formatY(n) {
            if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
            if (n >= 10_000)    return (n / 1_000).toFixed(0) + 'K';
            return Math.round(n).toLocaleString();
        }
    },

    // ── Kill / Death Ratio ─────────────────────────────────────────────────────
    // Single line hovering around 1.0 — spikes on hot streaks, dips on disasters.
    // Clamped to [0, 5] so one lucky nuke doesn't wreck the scale.
    // Change detection uses raw kills+losses, not the derived ratio, to avoid
    // false equality (e.g. 2/1 and 4/2 both equal 2.0).
    {
        id:           'chart-kd-ratio',
        label:        'K/D RATIO',
        icon:         '✕',
        defaultX:     420,
        defaultY:     250,
        defaultWidth: 300,
        defaultHeight:180,
        color:        '#30f0a0',
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            if (!t) return { ratio: 0, kills: 0, losses: 0 };
            const kills  = t.killedCount || 0;
            const losses = t.lostCount   || 0;
            const ratio  = losses === 0
                ? (kills > 0 ? Math.min(5, kills) : 0)
                : Math.min(5, kills / losses);
            return { ratio, kills, losses };
        },
        formatY(n) {
            return n.toFixed(2);
        }
    },

    // ── Damage Dealt vs Damage Taken ───────────────────────────────────────────
    // Dual-series: blue (dealt) vs red (taken).
    // The gap between them is the story — crossings are dramatic moments.
    {
        id:           'chart-damage',
        label:        'DAMAGE',
        icon:         '▲',
        defaultX:     420,
        defaultY:     450,
        defaultWidth: 300,
        defaultHeight:180,
        series: [
            {
                label: 'DEALT',
                color: '#4ab4ff',
                getValue() {
                    const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
                    return t ? Math.round(t.totalDamageDealt || 0) : 0;
                }
            },
            {
                label: 'TAKEN',
                color: '#ff3b5c',
                getValue() {
                    const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
                    return t ? Math.round(t.totalDamageTaken || 0) : 0;
                }
            }
        ],
        formatY(n) {
            if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
            if (n >= 10_000)    return (n / 1_000).toFixed(0) + 'K';
            return Math.round(n).toLocaleString();
        }
    },

    // ── Build Efficiency ───────────────────────────────────────────────────────
    // Single-series percentage chart fed by metal.builderEfficiency from
    // FullStatsUpdate (computed in killbridge.lua, stored in gameStateStore).
    //
    // 100% = every active builder is drawing metal at theoretical maximum rate.
    // <100% = builders are eco-starved or the engine is throttling their metal pull.
    // Idle builders (no assigned target) are excluded from the calculation, so
    // 100% when no one is building simply means "nothing to measure".
    //
    // A stall badge is overlaid on the chart by BARChart._draw() via the optional
    // def.drawOverlay(ctx, W, H, PAD) hook — called at the very end of each draw.
    // Badge colour codes:
    //   🟠  orange  = metal stall   (metal pull  > metal income  × 1.10)
    //   🟡  gold    = energy stall  (energy pull > energy income × 1.10)
    //   🔴  red     = both stalling simultaneously
    {
        id:           'chart-build-efficiency',
        label:        'BUILD EFFICIENCY',
        icon:         '🔧',
        defaultX:     730,
        defaultY:     250,
        defaultWidth: 300,
        defaultHeight:180,
        yMin: 0,
        yMax: 100,
        color:        '#f0c040',        // gold — matches charts.lua COLOR.gold

        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            if (!t) return { ratio: 0, changeKey: '0' };
            return {
                ratio:     t.builderEfficiency ?? 100,
                changeKey: String(t.efficiencyVersion ?? 0)
            };
        },

        formatY(n) {
            return Math.min(100, Math.max(0, n)).toFixed(1) + '%';
        },

        // drawOverlay is an optional hook called by BARChart._draw() at the very end,
        // after all chart content has been rendered.  This keeps the badge persistent
        // across RAF animation frames without needing a separate overlay canvas.
        drawOverlay(ctx, W, H, PAD) {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            if (!t) return;

            const stall = t.stallState || 0;
            if (stall === 0) return;

            // Per-state badge config
            const cfg = {
                1: { label: '\u25A0 METAL STALL',  bg: 'rgba(255,107,53,0.25)',  border: '#ff6b35', text: '#ff9060' },
                2: { label: '\u26A1 ENERGY STALL', bg: 'rgba(240,192,64,0.22)',  border: '#f0c040', text: '#f0d060' },
                3: { label: '\u26A0 ECO STALL',    bg: 'rgba(255,59,92,0.25)',   border: '#ff3b5c', text: '#ff6080' },
            }[stall];

            const BADGE_PAD = 5;
            const BADGE_H   = 15;
            ctx.save();
            ctx.font = `bold 8px "Share Tech Mono", monospace`;
            const tw   = ctx.measureText(cfg.label).width;
            const bw   = tw + BADGE_PAD * 2 + 1;
            // Position: top-right, inside the chart area header strip
            const bx   = W - bw - PAD.right - 2;
            const by   = H - BADGE_H - 4;

            // Background pill
            ctx.fillStyle   = cfg.bg;
            ctx.strokeStyle = cfg.border;
            ctx.lineWidth   = 1;
            if (ctx.roundRect) {
                ctx.beginPath(); ctx.roundRect(bx, by, bw, BADGE_H, 3);
                ctx.fill(); ctx.stroke();
            } else {
                ctx.fillRect(bx, by, bw, BADGE_H);
                ctx.strokeRect(bx, by, bw, BADGE_H);
            }

            // Label
            ctx.fillStyle    = cfg.text;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(cfg.label, bx + BADGE_PAD, by + BADGE_H / 2);
            ctx.restore();
        }
    },

    // ── Team Army Value ────────────────────────────────────────────────────────
    // One line per ally team, colored with the player's in-game color.
    // Series list is built dynamically in update() once AllyColorsUpdate
    // has populated gameState team colors — no static series array needed.
    // seriesCount gives BARChart its initial buffer size; it will be rebuilt
    // via chart.rebuildSeries() if team count changes mid-game.
    {
        id:             'chart-team-army-value',
        label:          'TEAM ARMY VALUE',
        icon:           '⚙',
        defaultX:       730,
        defaultY:       50,
        defaultWidth:   340,
        defaultHeight:  200,
        defaultEnabled: false,          // streamer enables this, disables solo chart
        isTeamChart:    true,           // flag consumed by the register loop
        seriesCount:    4,              // generous initial buffer; clear() uses this
        formatY(n) {
            if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
            if (n >= 10_000)    return (n / 1_000).toFixed(0) + 'K';
            return Math.round(n).toLocaleString();
        }
    },

    // ── Build Power (Solo) ─────────────────────────────────────────────────────
    // Single-series chart for the local player's cumulative build power.
    // teamBuildSpeed is the raw sum of buildSpeed across all living builder units
    // (incremented by addUnit, decremented by destroyUnit in gameStateStore).
    // Divided by BUILDSPEED_TO_METAL (15) to give metal/s equivalent — matching
    // the scale documented in gameStateStore and used by charts.lua.
    {
        id:             'chart-build-speed',
        label:          'BUILD POWER',
        icon:           '🏗',
        defaultX:       730,
        defaultY:       260,
        defaultWidth:   300,
        defaultHeight:  180,
        defaultEnabled: true,
        color:          '#a0e080',   // lime-green — distinct from gold efficiency chart
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? Math.round((t.teamBuildSpeed || 0) / BUILDSPEED_TO_METAL) : 0;
        },
        formatY(n) {
            if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
            return Math.round(n).toLocaleString();
        }
    },
 
    // ── Team Build Power ───────────────────────────────────────────────────────
    // Multi-series chart: one line per ally team (including your own), each
    // colored with that player's in-game team color — same as TEAM ARMY VALUE.
    // Uses isTeamBuildChart (not isTeamChart) so it gets its own dedicated
    // update branch and the existing army value block is completely untouched.
    {
        id:               'chart-team-build-speed',
        label:            'TEAM BUILD POWER',
        icon:             '🏗',
        defaultX:         730,
        defaultY:         470,
        defaultWidth:     340,
        defaultHeight:    200,
        defaultEnabled:   false,        // pair with chart-team-army-value for streamer view
        isTeamBuildChart: true,         // distinct flag — isTeamChart block not affected
        seriesCount:      4,
        formatY(n) {
            if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
            return Math.round(n).toLocaleString();
        }
    },
];

// ── Chart rendering engine ────────────────────────────────────────────────────
 
/**
 * BARChart — lightweight native-canvas line chart.
 * Supports 1 or N series.
 *
 * Animation strategy: scroll
 *   When a new data point is pushed, displayData immediately mirrors data (no
 *   value morphing). The chart area is translated right by one point-width and
 *   that offset eases back to zero over SCROLL_DUR_MS, producing a natural
 *   "new point slides in from the right" effect.
 *
 * Performance: dirty-flag rendering
 *   The RAF loop runs continuously but only calls _draw() when _dirty is true.
 *   _dirty is set by: pushSeries(), resize(), clear(), and during scroll
 *   animation frames. This means idle charts (no new data, no animation) cost
 *   only a single boolean check per frame instead of a full canvas repaint.
 *
 * Lifecycle:
 *   new BARChart(canvas, def)
 *   .push(value)           — single-series: add a data point
 *   .pushSeries(i, value)  — add a point for series index i
 *   .resize(w, h)          — sync canvas to new container size
 *   .clear()               — wipe all data, back to "awaiting data"
 *   .destroy()             — cancel RAF, free refs
 */
class BARChart {
    constructor(canvas, def) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.def     = def;
        this.isDual  = Array.isArray(def.series);
 
        // N-series support: honour an explicit seriesCount on the def,
        // otherwise fall back to series array length or 1 for single-series.
        const N = def.seriesCount ?? (this.isDual ? def.series.length : 1);
        this.seriesCount = N;
 
        this.MAX_POINTS    = 60;
        this.data          = Array.from({ length: N }, () => []);
        this.displayData   = Array.from({ length: N }, () => []);
 
        // ── Scroll animation state ────────────────────────────────────────────
        // _scrollOffset is a pixel amount added to the right of the plotted line
        // and eased back to zero, giving a "slide in" effect on each new point.
        this._scrollOffset = 0;      // current pixel offset (0 = settled)
        this._scrollFrom   = 0;      // offset at animation start
        this._scrollStart  = 0;      // performance.now() timestamp
        this.SCROLL_DUR_MS = 220;    // total slide duration in ms
 
        // ── Dirty flag ───────────────────────────────────────────────────────
        // true  → _draw() will be called this frame
        // false → loop skips _draw() entirely (idle charts are near-zero cost)
        // Start dirty so the initial "awaiting data" placeholder renders once.
        this._dirty = true;
 
        this.PAD = { top: 10, right: 10, bottom: 26, left: 48 };
 
        this._loop = this._loop.bind(this);
        this._raf  = requestAnimationFrame(this._loop);
    }
 
    push(value) { this.pushSeries(0, value); }
 
    pushSeries(i, value) {
        this.data[i].push(value);
        if (this.data[i].length > this.MAX_POINTS) this.data[i].shift();
 
        // displayData always mirrors data directly — no value morphing.
        // All series are synced together so the scroll fires once per update.
        for (let s = 0; s < this.data.length; s++) {
            this.displayData[s] = [...this.data[s]];
        }
 
        // Kick off a new scroll animation from the current offset (handles
        // rapid pushes gracefully by continuing from wherever we are).
        this._scrollFrom  = this._scrollOffset;
        this._scrollStart = performance.now();
        this._dirty       = true;
    }
 
    resize(w, h) {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width  = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._dirty = true;
    }
 
    clear() {
        const N = this.seriesCount;
        this.data          = Array.from({ length: N }, () => []);
        this.displayData   = Array.from({ length: N }, () => []);
        this._scrollOffset = 0;
        this._scrollFrom   = 0;
        this._scrollStart  = 0;
        this._dirty        = true;
    }
 
    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
    }
 
    // ── Animation loop ────────────────────────────────────────────────────────
 
    _loop(ts) {
        if (!this._raf) return;
 
        const isAnimating = this._scrollFrom > 0 || this._scrollOffset > 0;
 
        if (isAnimating) {
            const elapsed = ts - this._scrollStart;
            const t       = Math.min(1, elapsed / this.SCROLL_DUR_MS);
            // easeOutQuart — snappy start, soft landing
            const ease    = 1 - Math.pow(1 - t, 4);
            this._scrollOffset = this._scrollFrom * (1 - ease);
            if (t >= 1) {
                this._scrollOffset = 0;
                this._scrollFrom   = 0;
            }
            this._dirty = true;
        }
 
        if (this._dirty) {
            this._draw();
            this._dirty = false;
        }
 
        this._raf = requestAnimationFrame(this._loop);
    }
 
    // ── Drawing ───────────────────────────────────────────────────────────────
 
    _draw() {
        const { canvas, ctx, def, PAD } = this;
        const W  = canvas.width  / (window.devicePixelRatio || 1);
        const H  = canvas.height / (window.devicePixelRatio || 1);
        const cX = PAD.left;
        const cY = PAD.top;
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top  - PAD.bottom;
 
        ctx.clearRect(0, 0, W, H);
 
        // Background
        ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
        this._roundRect(ctx, 0, 0, W, H, 4);
        ctx.fill();
 
        // Border
        ctx.strokeStyle = 'rgba(90, 180, 255, 0.18)';
        ctx.lineWidth   = 1;
        this._roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4);
        ctx.stroke();
 
        // Check we have enough data to draw
        const allPts  = this.displayData.flat().filter(v => !isNaN(v));
        const hasData = this.displayData.some(s => s.length >= 2);
 
        if (!hasData) {
            this._drawHeader(ctx, W, H);
            this._drawNoData(ctx, cX, cY, cW, cH);
            return;
        }
 
        // Shared Y range across all series
        let minV = def.yMin ?? Math.min(...allPts);
        let maxV = def.yMax ?? Math.max(...allPts);
 
        if (def.yMin == null || def.yMax == null) {
            const span     = maxV - minV;
            const rangePad = span > 0 ? span * 0.12 : Math.max(maxV * 0.1, 100);
            minV = def.yMin ?? Math.max(0, minV - rangePad);
            maxV = def.yMax ?? maxV + rangePad;
        }
 
        // calc range after padding so the gridlines and value labels reflect
        // the actual chart scale, not just the data range
        const range = maxV - minV || 1;
 
        // Gridlines + Y labels (drawn outside clip so labels stay visible)
        ctx.font         = '9px "Share Tech Mono", monospace';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
 
        for (let i = 0; i <= 4; i++) {
            const v = minV + (range * i / 4);
            const y = cY + cH - (cH * i / 4);
            ctx.beginPath();
            ctx.strokeStyle = i === 0 ? 'rgba(90,180,255,0.22)' : 'rgba(90,180,255,0.08)';
            ctx.lineWidth   = 1;
            ctx.moveTo(cX, y);
            ctx.lineTo(cX + cW, y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(160,190,220,0.55)';
            ctx.fillText(def.formatY(v), cX - 5, y);
        }
 
        const toX = (pts, i) => cX + (i / (pts.length - 1)) * cW;
        const toY = (v)       => cY + cH - ((v - minV) / range) * cH;
 
        // Series list: unified structure for single and dual/multi
        const seriesList = this.isDual
            ? def.series.map((s, i) => ({ pts: this.displayData[i], color: s.color, label: s.label }))
            : [{ pts: this.displayData[0], color: def.color, label: def.label }];
 
        // ── Scroll clip + translate ───────────────────────────────────────────
        // Clip to the chart plot area so the sliding line doesn't bleed into
        // the Y-axis labels or outside the widget border.
        // Then translate right by _scrollOffset so the newest point starts
        // off-screen-right and glides into position as the offset eases to 0.
        ctx.save();
        ctx.beginPath();
        ctx.rect(cX, cY, cW, cH);
        ctx.clip();
        ctx.translate(this._scrollOffset, 0);
 
        for (const { pts, color } of seriesList) {
            if (pts.length < 2) continue;
 
            // Gradient fill
            const grad = ctx.createLinearGradient(0, cY, 0, cY + cH);
            grad.addColorStop(0, this._hexAlpha(color, 0.20));
            grad.addColorStop(1, this._hexAlpha(color, 0.01));
 
            ctx.beginPath();
            ctx.moveTo(toX(pts, 0), toY(pts[0]));
            for (let i = 1; i < pts.length; i++) {
                const cpx = (toX(pts, i - 1) + toX(pts, i)) / 2;
                ctx.bezierCurveTo(cpx, toY(pts[i - 1]), cpx, toY(pts[i]), toX(pts, i), toY(pts[i]));
            }
            ctx.lineTo(toX(pts, pts.length - 1), cY + cH);
            ctx.lineTo(toX(pts, 0), cY + cH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
 
            // Line
            ctx.beginPath();
            ctx.moveTo(toX(pts, 0), toY(pts[0]));
            for (let i = 1; i < pts.length; i++) {
                const cpx = (toX(pts, i - 1) + toX(pts, i)) / 2;
                ctx.bezierCurveTo(cpx, toY(pts[i - 1]), cpx, toY(pts[i]), toX(pts, i), toY(pts[i]));
            }
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1.8;
            ctx.lineJoin    = 'round';
            ctx.lineCap     = 'round';
            ctx.shadowColor = color;
            ctx.shadowBlur  = 6;
            ctx.stroke();
            ctx.shadowBlur  = 0;
 
            // End dot
            const lx = toX(pts, pts.length - 1);
            const ly = toY(pts[pts.length - 1]);
            ctx.beginPath();
            ctx.arc(lx, ly, 3, 0, Math.PI * 2);
            ctx.fillStyle   = '#fff';
            ctx.shadowColor = color;
            ctx.shadowBlur  = 8;
            ctx.fill();
            ctx.shadowBlur  = 0;
        }
 
        ctx.restore(); // removes clip and scroll translate
 
        // Latest value labels — drawn after restore so they sit at true position
        // and are never clipped by the chart area rect.
        ctx.font         = '10px "Rajdhani", sans-serif';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'top';
 
        seriesList.forEach(({ pts, color, label }, idx) => {
            if (!pts.length) return;
            ctx.fillStyle = color;
            // Single-series: omit the label prefix for a cleaner look
            const text = (seriesList.length === 1)
                ? def.formatY(pts[pts.length - 1])
                : `${label} ${def.formatY(pts[pts.length - 1])}`;
            ctx.fillText(text, cX + cW, cY + 1 + idx * 13);
        });
 
        this._drawHeader(ctx, W, H);
 
        // Optional per-chart overlay hook (e.g. stall badge on efficiency chart)
        if (typeof this.def.drawOverlay === 'function') {
            this.def.drawOverlay(ctx, W, H, PAD);
        }
    }
 
    _drawHeader(ctx, W, H) {
        ctx.font         = '10px "Rajdhani", sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle    = 'rgba(160,190,220,0.55)';
        ctx.fillText(`${this.def.icon}  ${this.def.label}`, this.PAD.left + 2, H - 5);
    }
 
    _drawNoData(ctx, cX, cY, cW, cH) {
        ctx.font         = '10px "Share Tech Mono", monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(160,190,220,0.25)';
        ctx.fillText('— awaiting data —', cX + cW / 2, cY + cH / 2);
    }
 
    _roundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
        }
    }
 
    _hexAlpha(color, alpha) {
        if (color.startsWith('#') && color.length === 7) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${alpha})`;
        }
        return color;
    }
}

// ── Register chart widgets ────────────────────────────────────────────────────

for (const cd of CHART_DEFS) {
    (function(cd) {
        console.log('Registering Chart Widget:', cd.id);

        const isDual = Array.isArray(cd.series);

        widgetManager.register({
            id:             cd.id,
            type:           'chart',
            label:          cd.label,
            defaultX:       cd.defaultX,
            defaultY:       cd.defaultY,
            defaultScale:   1.0,
            defaultEnabled: cd.defaultEnabled ?? true,
            _chart:         null,
            _observer:      null,
            _prevValue:     isDual
                ? Array(cd.series?.length ?? 2).fill(null)
                : [null, null],

            render(def, inner) {
                inner.innerHTML = `
                    <div class="wc-chart-frame" id="${cd.id}-frame">
                        <canvas class="wc-canvas" id="${cd.id}-canvas"></canvas>
                        <div class="wc-resize-handle" id="${cd.id}-resize" title="Drag to resize"></div>
                    </div>`;

                const frame  = inner.querySelector('.wc-chart-frame');
                const canvas = inner.querySelector('.wc-canvas');
                const handle = inner.querySelector('.wc-resize-handle');

                const wm    = window.widgetManager;
                const saved = wm?.layout?.[cd.id] || {};
                let initW = saved.chartW || cd.defaultWidth;
                let initH = saved.chartH || cd.defaultHeight;

                // Apply saved scale to initial frame size
                const widgetEl = inner.closest('.wm-widget');
                const initScale = parseFloat(widgetEl?.style.fontSize) || 1.0;

                frame.style.width  = (initW * initScale) + 'px';
                frame.style.height = (initH * initScale) + 'px';

                const chart = new BARChart(canvas, cd);
                def._chart  = chart;

                // For team charts, patch def.series so _draw()'s seriesList
                // builder reads from def._teamSeries (populated by update()).
                // We do this by making def.series a live getter.
                if (cd.isTeamChart || cd.isTeamBuildChart) {
                    Object.defineProperty(chart.def, 'series', {
                        get() { return def._teamSeries ?? []; },
                        configurable: true
                    });
                    chart.isDual = true; // ensures _draw() uses the multi-series path
                }

                chart.resize(initW, initH);

                const ro = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        const { width, height } = entry.contentRect;
                        if (width > 0 && height > 0) chart.resize(width, height);
                    }
                });
                ro.observe(frame);
                def._observer = ro;

                // ── Scale observer ────────────────────────────────────────────
                // widgetManager sets fontSize on the .wm-widget element when the
                // user scrolls to scale. We watch for that and resize the frame
                // proportionally so the chart scales like every other widget.
                const scaleObs = new MutationObserver(() => {
                    const el    = inner.closest('.wm-widget');
                    const scale = parseFloat(el?.style.fontSize) || 1.0;
                    const base  = saved.chartW || cd.defaultWidth;
                    const baseH = saved.chartH || cd.defaultHeight;
                    frame.style.width  = (base  * scale) + 'px';
                    frame.style.height = (baseH * scale) + 'px';
                });
                if (widgetEl) {
                    scaleObs.observe(widgetEl, { attributes: true, attributeFilter: ['style'] });
                }
                def._scaleObserver = scaleObs;

                // ── Resize handle ─────────────────────────────────────────────
                let resizing = false, resizeStartX = 0, resizeStartY = 0, resizeStartW = 0, resizeStartH = 0;

                const doResize = (clientX, clientY) => {
                    const el    = inner.closest('.wm-widget');
                    const scale = parseFloat(el?.style.fontSize) || 1.0;
                    const dW    = clientX - resizeStartX;
                    const dH    = clientY - resizeStartY;
                    const newW  = Math.max(150, resizeStartW + dW / scale);
                    const newH  = Math.max(100, resizeStartH + dH / scale);
                    frame.style.width  = (newW * scale) + 'px';
                    frame.style.height = (newH * scale) + 'px';
                    chart.resize(newW * scale, newH * scale);
                    saved.chartW = newW;
                    saved.chartH = newH;
                    if (wm?.layout) {
                        wm.layout[cd.id] = wm.layout[cd.id] || {};
                        wm.layout[cd.id].chartW = newW;
                        wm.layout[cd.id].chartH = newH;
                        wm.saveLayout?.();
                    }
                };

                const endResize = () => {
                    resizing = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup',   endResize);
                };
                const onMouseMove = (e) => { if (resizing) doResize(e.clientX, e.clientY); };

                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    resizing    = true;
                    resizeStartX = e.clientX;
                    resizeStartY = e.clientY;
                    resizeStartW = parseFloat(frame.style.width)  || initW;
                    resizeStartH = parseFloat(frame.style.height) || initH;
                    const el    = inner.closest('.wm-widget');
                    const scale = parseFloat(el?.style.fontSize) || 1.0;
                    resizeStartW /= scale;
                    resizeStartH /= scale;
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup',   endResize);
                });

                // Touch resize
                handle.addEventListener('touchstart', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    resizing    = true;
                    resizeStartX = e.touches[0].clientX;
                    resizeStartY = e.touches[0].clientY;
                    resizeStartW = parseFloat(frame.style.width)  || initW;
                    resizeStartH = parseFloat(frame.style.height) || initH;
                    const el    = inner.closest('.wm-widget');
                    const scale = parseFloat(el?.style.fontSize) || 1.0;
                    resizeStartW /= scale;
                    resizeStartH /= scale;
                    document.addEventListener('touchmove', (e) => {
                        if (resizing) doResize(e.touches[0].clientX, e.touches[0].clientY);
                    }, { passive: false });
                    document.addEventListener('touchend', endResize);
                }, { passive: false });
            },

            update(def, inner) {
                if (!def._chart) return;

                // ── Team army value: N-series dynamic update ───────────────
                if (cd.isTeamChart) {
                    if (typeof gameState === 'undefined') return;

                    // Build the current ordered team list from gameState
                    const teams = [];
                    for (const [, team] of gameState.teams) {
                        if (team.isMyAlly) teams.push(team);
                    }
                    if (!teams.length) return;

                    // Rebuild chart series buffers if team count changed
                    if (teams.length !== def._chart.seriesCount) {
                        def._chart.seriesCount = teams.length;
                        def._chart.clear();
                        def._prevValue = Array(teams.length).fill(null);
                    }

                    // Push each team's current army value
                    teams.forEach((team, i) => {
                        const raw = Math.round(team.totalMetalCost || 0);
                        if (raw !== def._prevValue[i]) {
                            def._chart.pushSeries(i, raw);
                            def._prevValue[i] = raw;
                        }
                    });

                    // Inject live colors into the def so _draw() picks them up.
                    // We store them on def._teamSeries which _draw() reads via
                    // a small shim added to the def below.
                    def._teamSeries = teams.map(team => ({
                        label: (team.playerName || `Team ${team.teamID}`).substring(0, 12),
                        color: team.color?.hex ?? '#4ab4ff'
                    }));

                    return;
                }

                // ── Team build power: N-series dynamic update ──────────────
                if (cd.isTeamBuildChart) {
                    if (typeof gameState === 'undefined') return;
 
                    const teams = [];
                    for (const [, team] of gameState.teams) {
                        if (team.isMyAlly) teams.push(team);
                    }
                    if (!teams.length) return;
 
                    // Rebuild series buffers if team count changed
                    if (teams.length !== def._chart.seriesCount) {
                        def._chart.seriesCount = teams.length;
                        def._chart.clear();
                        def._prevValue = Array(teams.length).fill(null);
                    }
 
                    // Push each team's current build power (metal/s equivalent)
                    teams.forEach((team, i) => {
                        const raw = Math.round((team.teamBuildSpeed || 0) / BUILDSPEED_TO_METAL);
                        if (raw !== def._prevValue[i]) {
                            def._chart.pushSeries(i, raw);
                            def._prevValue[i] = raw;
                        }
                    });
 
                    // Inject live player colors — identical pattern to army value chart
                    def._teamSeries = teams.map(team => ({
                        label: (team.playerName || `Team ${team.teamID}`).substring(0, 12),
                        color: team.color?.hex ?? '#a0e080'
                    }));
 
                    return;
                }

                // ── Existing dual-series update (chart-damage etc.) ─────────
                if (isDual) {
                    cd.series.forEach((s, i) => {
                        const raw = s.getValue();
                        if (raw === 0 && def._prevValue[i] !== null) {
                            def._chart.clear();
                            def._prevValue = [null, null];
                            return;
                        }
                        if (raw !== def._prevValue[i]) {
                            def._chart.pushSeries(i, raw);
                            def._prevValue[i] = raw;
                        }
                    });
                } else {
                    // ── Single-series update ────────────────────────────────
                    const raw = cd.getValue();
                    const isObj     = raw !== null && typeof raw === 'object';
                    const pushVal   = isObj ? raw.ratio  : raw;
                    const changeKey = isObj
                        ? (raw.changeKey ?? `${raw.kills}/${raw.losses}`)
                        : raw;
                    const resetVal  = isObj ? raw.ratio  : raw;

                    if (resetVal === 0 && def._prevValue !== null) {
                        def._chart.clear();
                        def._prevValue = null;
                        return;
                    }
                    if (cd.alwaysPush || changeKey !== def._prevValue) {
                        def._chart.push(pushVal);
                        def._prevValue = changeKey;
                    }
                }
            },

            destroy(def) {
                if (def._observer)      { def._observer.disconnect();      def._observer      = null; }
                if (def._scaleObserver) { def._scaleObserver.disconnect(); def._scaleObserver = null; }
                if (def._chart)         { def._chart.destroy();            def._chart         = null; }
            }
        });
    })(cd);
}

// ── chartWidgets — public API ─────────────────────────────────────────────────
// Call chartWidgets.reset() from uiManager.resetAll() on new game / manual reset.

const chartWidgets = {
    reset() {
        for (const cd of CHART_DEFS) {
            const def = widgetManager.widgets.get(cd.id);
            if (!def?._chart) continue;
            def._chart.clear();
            if (cd.isTeamChart) {
                // Reset to same length as current buffer; update() will resize
                // if team count differs when the next game starts.
                const n = def._chart.seriesCount;
                def._prevValue = Array(n).fill(null);
                def._teamSeries = [];
            } else {
                def._prevValue = Array.isArray(cd.series)
                    ? Array(cd.series.length).fill(null)
                    : null;
            }
        }
    }
};


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
        for (const c of CHART_DEFS) widgetManager.update(c.id, null);
    }
};