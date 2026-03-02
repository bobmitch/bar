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


// ── Chart Widgets ─────────────────────────────────────────────────────────────
// Native Canvas 2D line chart — no external libraries.
// Smooth animation between data updates via RAF lerp.
// Each chart widget is independently draggable / scalable / toggleable
// through the standard WidgetManager interface.
//
// CHART_DEFS — add more chart types here; each gets its own widget.
// Each def provides:
//   id, label, icon, defaultX, defaultY, defaultWidth, defaultHeight
//   getValue()     → current numeric value (called on tick)
//   formatY(n)     → axis label formatter
//   color          → CSS variable name or hex for the line / fill
// ─────────────────────────────────────────────────────────────────────────────

const CHART_DEFS = [
    {
        id:           'chart-army-value',
        label:        'ARMY VALUE',
        icon:         '⚙',
        defaultX:     420,
        defaultY:     50,
        defaultWidth: 300,   // px — initial width (saved to layout)
        defaultHeight:180,   // px — initial height (saved to layout)
        color:        '#4ab4ff',   // --c-accent
        getValue() {
            const t = typeof gameState !== 'undefined' ? gameState.getMyTeam() : null;
            return t ? Math.round(t.totalMetalCost || 0) : 0;
        },
        formatY(n) {
            if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
            if (n >= 10_000)    return (n / 1_000).toFixed(0) + 'K';
            return Math.round(n).toLocaleString();
        }
    }
];

// ── Chart rendering engine ────────────────────────────────────────────────────

/**
 * BARChart — lightweight native-canvas line chart.
 *
 * Lifecycle:
 *   new BARChart(canvas, def)
 *   .push(value)    — add a new data point; starts lerp animation
 *   .resize(w, h)   — sync canvas physical px to new container size
 *   .destroy()      — cancel RAF, free refs
 */
class BARChart {
    constructor(canvas, def) {
        this.canvas  = canvas;
        this.ctx     = canvas.getContext('2d');
        this.def     = def;

        // Data ring-buffer — keep last N samples
        this.MAX_POINTS = 60;
        this.data       = [];          // committed values
        this.displayData = [];         // animated (lerped) values we render

        // Animation
        this._raf        = null;
        this._animFrom   = null;   // snapshot of displayData at anim start
        this._animTo     = null;   // snapshot after push
        this._animT      = 1;      // 0→1, 1 = settled
        this.ANIM_DUR_MS = 380;    // ms for full lerp
        this._animStart  = 0;

        // Padding (px) — space for axis labels
        this.PAD = { top: 10, right: 10, bottom: 26, left: 48 };

        this._loop = this._loop.bind(this);
        this._raf  = requestAnimationFrame(this._loop);
    }

    push(value) {
        this.data.push(value);
        if (this.data.length > this.MAX_POINTS) this.data.shift();

        // Snapshot animation targets
        this._animFrom  = [...this.displayData];
        this._animTo    = [...this.data];
        this._animT     = 0;
        this._animStart = performance.now();
    }

    resize(w, h) {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width  = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
    }

    // ── Internal animation loop ───────────────────────────────────────────────

    _loop(ts) {
        if (!this._raf) return;

        // Advance lerp
        if (this._animT < 1) {
            const elapsed = ts - this._animStart;
            this._animT   = Math.min(1, elapsed / this.ANIM_DUR_MS);
            const ease    = this._easeOutCubic(this._animT);

            this.displayData = this._animTo.map((toVal, i) => {
                const fromVal = (this._animFrom && this._animFrom[i] !== undefined)
                    ? this._animFrom[i]
                    : toVal;
                return fromVal + (toVal - fromVal) * ease;
            });
        }

        this._draw();
        this._raf = requestAnimationFrame(this._loop);
    }

    _easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    _draw() {
        const { canvas, ctx, def, PAD } = this;
        const W = canvas.width  / (window.devicePixelRatio || 1);
        const H = canvas.height / (window.devicePixelRatio || 1);
        const pts = this.displayData;

        ctx.clearRect(0, 0, W, H);

        // Background panel
        ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
        this._roundRect(ctx, 0, 0, W, H, 4);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(90, 180, 255, 0.18)';
        ctx.lineWidth   = 1;
        this._roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 4);
        ctx.stroke();

        // Chart area
        const cX = PAD.left;
        const cY = PAD.top;
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top  - PAD.bottom;

        if (pts.length < 2) {
            this._drawHeader(ctx, W, H);
            this._drawNoData(ctx, cX, cY, cW, cH);
            return;
        }

        // Value range with a sensible minimum span
        let minV = Math.min(...pts);
        let maxV = Math.max(...pts);
        const span = maxV - minV;

        // Pad range so the line never touches top/bottom edge
        const rangePad = span > 0 ? span * 0.12 : Math.max(maxV * 0.1, 100);
        minV = Math.max(0, minV - rangePad);
        maxV = maxV + rangePad;
        const range = maxV - minV || 1;

        // Gridlines + Y axis labels
        ctx.font         = '9px "Share Tech Mono", monospace';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        const Y_TICKS    = 4;

        for (let i = 0; i <= Y_TICKS; i++) {
            const v  = minV + (range * i / Y_TICKS);
            const y  = cY + cH - (cH * i / Y_TICKS);

            // Gridline
            ctx.beginPath();
            ctx.strokeStyle = i === 0
                ? 'rgba(90,180,255,0.22)'     // x-axis slightly brighter
                : 'rgba(90,180,255,0.08)';
            ctx.lineWidth = 1;
            ctx.moveTo(cX, y);
            ctx.lineTo(cX + cW, y);
            ctx.stroke();

            // Label
            ctx.fillStyle = 'rgba(160,190,220,0.55)';
            ctx.fillText(def.formatY(v), cX - 5, y);
        }

        // Convert data to screen coords
        const toX = (i) => cX + (i / (pts.length - 1)) * cW;
        const toY = (v) => cY + cH - ((v - minV) / range) * cH;

        // Gradient fill under line
        const grad = ctx.createLinearGradient(0, cY, 0, cY + cH);
        grad.addColorStop(0, this._hexAlpha(def.color, 0.28));
        grad.addColorStop(1, this._hexAlpha(def.color, 0.02));

        ctx.beginPath();
        ctx.moveTo(toX(0), toY(pts[0]));
        for (let i = 1; i < pts.length; i++) {
            const x0 = toX(i - 1), y0 = toY(pts[i - 1]);
            const x1 = toX(i),     y1 = toY(pts[i]);
            const cpx = (x0 + x1) / 2;
            ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
        }
        ctx.lineTo(toX(pts.length - 1), cY + cH);
        ctx.lineTo(toX(0), cY + cH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(pts[0]));
        for (let i = 1; i < pts.length; i++) {
            const x0 = toX(i - 1), y0 = toY(pts[i - 1]);
            const x1 = toX(i),     y1 = toY(pts[i]);
            const cpx = (x0 + x1) / 2;
            ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
        }
        ctx.strokeStyle = def.color;
        ctx.lineWidth   = 1.8;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.shadowColor  = def.color;
        ctx.shadowBlur   = 6;
        ctx.stroke();
        ctx.shadowBlur   = 0;

        // Latest value dot
        const lastX = toX(pts.length - 1);
        const lastY = toY(pts[pts.length - 1]);
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = def.color;
        ctx.shadowBlur  = 8;
        ctx.fill();
        ctx.shadowBlur  = 0;

        // Latest value label (top-right of chart area)
        ctx.font         = '10px "Rajdhani", sans-serif';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle    = def.color;
        ctx.fillText(def.formatY(pts[pts.length - 1]), cX + cW, cY + 1);

        this._drawHeader(ctx, W, H);
    }

    _drawHeader(ctx, W, H) {
        const { def, PAD } = this;
        // Icon + label at bottom-left (inside bottom padding)
        ctx.font         = '10px "Rajdhani", sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle    = 'rgba(160,190,220,0.55)';
        ctx.fillText(`${def.icon}  ${def.label}`, PAD.left + 2, H - 5);
    }

    _drawNoData(ctx, cX, cY, cW, cH) {
        ctx.font         = '10px "Share Tech Mono", monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(160,190,220,0.25)';
        ctx.fillText('— awaiting data —', cX + cW / 2, cY + cH / 2);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
        // Works with #rrggbb or rgb/rgba — fallback to raw with opacity via globalAlpha trick
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

        widgetManager.register({
            id:             cd.id,
            type:           'chart',
            label:          cd.label,
            defaultX:       cd.defaultX,
            defaultY:       cd.defaultY,
            defaultScale:   1.0,
            defaultEnabled: true,
            _chart:         null,     // BARChart instance, set in render()
            _observer:      null,     // ResizeObserver
            _getValue:      cd.getValue,
            _prevValue:     null,

            render(def, inner) {
                // Container drives physical size — uses em so scroll-to-scale works
                inner.innerHTML = `
                    <div class="wc-chart-frame" id="${cd.id}-frame">
                        <canvas class="wc-canvas" id="${cd.id}-canvas"></canvas>
                        <!-- Resize handle (bottom-right corner) -->
                        <div class="wc-resize-handle" id="${cd.id}-resize" title="Drag to resize"></div>
                    </div>`;

                const frame  = inner.querySelector('.wc-chart-frame');
                const canvas = inner.querySelector('.wc-canvas');
                const handle = inner.querySelector('.wc-resize-handle');

                // Retrieve saved or default pixel dimensions
                const wm     = window.widgetManager;
                const saved  = wm?.layout?.[cd.id] || {};
                const initW  = saved.chartW || cd.defaultWidth;
                const initH  = saved.chartH || cd.defaultHeight;

                frame.style.width  = initW + 'px';
                frame.style.height = initH + 'px';

                // Instantiate chart engine
                const chart = new BARChart(canvas, cd);
                def._chart  = chart;
                chart.resize(initW, initH);

                // ResizeObserver keeps canvas in sync when frame is resized
                const ro = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        const { width, height } = entry.contentRect;
                        if (width > 0 && height > 0) chart.resize(width, height);
                    }
                });
                ro.observe(frame);
                def._observer = ro;

                // ── Resize handle drag ────────────────────────────────────────
                let resizing  = false;
                let resX, resY, resW, resH;

                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();   // don't start widget drag
                    resizing = true;
                    resX = e.clientX; resY = e.clientY;
                    resW = frame.offsetWidth;
                    resH = frame.offsetHeight;
                    document.body.style.cursor = 'nwse-resize';
                });

                document.addEventListener('mousemove', (e) => {
                    if (!resizing) return;
                    const newW = Math.max(140, resW + (e.clientX - resX));
                    const newH = Math.max(90,  resH + (e.clientY - resY));
                    frame.style.width  = newW + 'px';
                    frame.style.height = newH + 'px';
                    // ResizeObserver will call chart.resize automatically
                });

                document.addEventListener('mouseup', () => {
                    if (!resizing) return;
                    resizing = false;
                    document.body.style.cursor = '';
                    // Persist chart dimensions alongside position/scale
                    const wm2 = window.widgetManager;
                    if (wm2) {
                        const inst = wm2.instances.get(cd.id);
                        if (inst) {
                            inst.state.chartW = frame.offsetWidth;
                            inst.state.chartH = frame.offsetHeight;
                            wm2._saveLayout();
                        }
                    }
                });

                // Touch resize handle
                handle.addEventListener('touchstart', (e) => {
                    if (e.touches.length !== 1) return;
                    e.preventDefault();
                    e.stopPropagation();
                    resizing = true;
                    resX = e.touches[0].clientX; resY = e.touches[0].clientY;
                    resW = frame.offsetWidth;
                    resH = frame.offsetHeight;
                }, { passive: false });

                document.addEventListener('touchmove', (e) => {
                    if (!resizing || e.touches.length < 1) return;
                    const newW = Math.max(140, resW + (e.touches[0].clientX - resX));
                    const newH = Math.max(90,  resH + (e.touches[0].clientY - resY));
                    frame.style.width  = newW + 'px';
                    frame.style.height = newH + 'px';
                }, { passive: false });

                document.addEventListener('touchend', () => {
                    if (!resizing) return;
                    resizing = false;
                    const wm2 = window.widgetManager;
                    if (wm2) {
                        const inst = wm2.instances.get(cd.id);
                        if (inst) {
                            inst.state.chartW = frame.offsetWidth;
                            inst.state.chartH = frame.offsetHeight;
                            wm2._saveLayout();
                        }
                    }
                });
            },

            update(def, inner) {
                if (!def._chart) return;
                const raw = def._getValue();
                // Only push a new point when value actually changes
                if (raw === def._prevValue) return;
                def._chart.push(raw);
                def._prevValue = raw;
            },

            // Clean up on widget remove (future-proofing)
            destroy(def) {
                if (def._observer) { def._observer.disconnect(); def._observer = null; }
                if (def._chart)    { def._chart.destroy();       def._chart    = null; }
            }
        });
    })(cd);
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
        for (const c of CHART_DEFS) widgetManager.update(c.id, null);
    }
};