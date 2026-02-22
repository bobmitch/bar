/**
 * WidgetManager — draggable, scalable, toggleable widget framework
 * for BAR Tracker streaming view.
 *
 * Widget definition shape:
 * {
 *   id:             string           — unique stable identifier
 *   type:           string           — 'trigger' | 'stat' | 'image' | 'custom'
 *   label:          string           — human-readable name
 *   defaultX:       number
 *   defaultY:       number
 *   defaultScale:   number           — 0.5–2.0 (maps to font-size rem)
 *   defaultEnabled: bool
 *   render:         (def, inner) => void
 *   update:         (def, inner, data) => void
 *   onTrigger:      (def, inner, triggerData) => void   [trigger type only]
 * }
 *
 * Edit Mode behaviour:
 *   MOUSE
 *   • Any mouse movement on the streaming canvas wakes "edit mode"
 *   • After IDLE_TIMEOUT_MS of no movement, edit mode sleeps (OBS-clean)
 *   • While awake: HUD bar fades in, disabled widgets appear ghosted,
 *     ALL widgets get a dashed outline so you can find them
 *   • Middle-click anywhere → toggle LOCK (keeps edit mode on permanently
 *     regardless of idle timeout — middle-click again to unlock)
 *   TOUCH
 *   • Any touch on the streaming canvas wakes edit mode (same idle timer)
 *   • Long-press (500 ms) on canvas background → toggle LOCK (replaces middle-click)
 *   • Long-press (500 ms) on a widget → toggle enable/disable (replaces dblclick)
 *   • Two-finger tap on canvas background → navigate back (replaces right-click)
 *
 * Drag:
 *   MOUSE — mousedown / mousemove / mouseup (left button only)
 *   TOUCH — touchstart / touchmove / touchend (single finger)
 *
 * Scale:
 *   MOUSE — scroll wheel on widget
 *   TOUCH — two-finger pinch on widget
 *
 * Snap-to-edge:
 *   • While dragging, each widget's left/centre/right and top/centre/bottom
 *     edges are compared against all other widgets' edges.
 *   • When within SNAP_THRESHOLD px, the widget snaps to exact alignment
 *     and a cyan guide line appears on the matching axis.
 *   • Guide lines clear on drag-end.
 */
class WidgetManager {
    constructor() {
        this.widgets      = new Map();
        this.instances    = new Map();
        this.layout       = {};
        this.container    = null;

        // Edit-mode state
        this._isEditing   = false;   // true while interaction is active / locked
        this._editLocked  = false;   // true when user has pinned edit mode on
        this._idleTimer   = null;

        this.STORAGE_KEY        = 'bar-widget-layout-v1';
        this.MIN_SCALE          = 0.5;
        this.MAX_SCALE          = 2.0;
        this.SCALE_STEP         = 0.1;
        this.IDLE_TIMEOUT_MS    = 2500;  // ms of no interaction → sleep
        this.SNAP_THRESHOLD     = 10;    // px — edge proximity that triggers snap
        this.LONG_PRESS_MS      = 500;   // ms hold to trigger long-press actions

        this._loadLayout();
        this._bindGlobalEvents();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    register(definition) {
        if (this.widgets.has(definition.id)) {
            console.warn(`[WidgetManager] Already registered: ${definition.id}`);
            return this;
        }
        this.widgets.set(definition.id, definition);
        return this;
    }

    mountAll(containerEl) {
        this.container = containerEl;
        this._initSnapGuides();
        for (const [id, def] of this.widgets) {
            this._mountWidget(id, def);
        }
        console.log(`[WidgetManager] Mounted ${this.widgets.size} widgets`);
    }

    update(id, data) {
        const inst = this.instances.get(id);
        const def  = this.widgets.get(id);
        if (!inst || !def?.update) return;
        def.update(def, inst.inner, data);
    }

    emitTrigger(triggerData) {
        for (const [, def] of this.widgets) {
            if (def.type !== 'trigger' || !def.onTrigger) continue;
            const inst = this.instances.get(def.id);
            if (inst?.state.enabled) def.onTrigger(def, inst.inner, triggerData);
        }
    }

    resetLayout() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.layout = {};
        for (const [, inst] of this.instances) inst.el.remove();
        this.instances.clear();
        if (this.container) this.mountAll(this.container);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WIDGET MOUNTING
    // ─────────────────────────────────────────────────────────────────────────

    _mountWidget(id, def) {
        const saved = this.layout[id] || {};
        const state = {
            x:       saved.x       ?? def.defaultX       ?? 20,
            y:       saved.y       ?? def.defaultY       ?? 20,
            scale:   saved.scale   ?? def.defaultScale   ?? 1.0,
            enabled: saved.enabled ?? def.defaultEnabled ?? true,
        };

        const el = document.createElement('div');
        el.className = `wm-widget wm-type-${def.type}`;
        el.id = id;
        el.dataset.wmId = id;
        el.style.fontSize = `${state.scale}rem`;
        // Prevent native touch actions (scroll, zoom) interfering with drag/pinch
        el.style.touchAction = 'none';
        this._applyPosition(el, state);
        this._applyEnabled(el, state);

        const inner = document.createElement('div');
        inner.className = 'wm-inner';
        el.appendChild(inner);

        if (def.render) def.render(def, inner);

        this.container.appendChild(el);
        this.instances.set(id, { el, inner, state });
        this._bindWidgetInteractions(id, el, state);
    }

    _applyPosition(el, state) {
        el.style.left = `${state.x}px`;
        el.style.top  = `${state.y}px`;
    }

    _applyEnabled(el, state) {
        if (state.enabled) {
            el.classList.remove('wm-disabled', 'wm-show-disabled');
            el.style.display       = '';
            el.style.opacity       = '';
            el.style.visibility    = '';
            el.style.pointerEvents = '';
        } else {
            el.classList.add('wm-disabled');
            const show = this._isEditing === true;
            el.classList.toggle('wm-show-disabled', show);
            el.style.display       = show ? '' : 'none';
            el.style.pointerEvents = show ? 'all' : 'none';
            el.style.visibility    = '';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EDIT MODE — interaction detection + idle sleep + lock
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Called on any mouse movement or touch while in streaming view.
     * Wakes edit mode and restarts the idle countdown (unless locked).
     */
    _onInteractionActivity() {
        if (!this._isEditing) {
            this._isEditing = true;
            this._applyEditMode(true);
        }
        if (this._editLocked) return;
        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            this._isEditing = false;
            this._applyEditMode(false);
        }, this.IDLE_TIMEOUT_MS);
    }

    /**
     * Toggle the edit-mode lock.
     * Mouse: middle-click anywhere | Touch: long-press on canvas background
     * Locked = edit UI stays visible until unlocked.
     */
    _toggleEditLock() {
        this._editLocked = !this._editLocked;

        if (this._editLocked) {
            clearTimeout(this._idleTimer);
            this._isEditing = true;
            this._applyEditMode(true);
            this._flashToast('🔒 Edit mode locked — long-press canvas to unlock');
        } else {
            this._flashToast('🔓 Edit mode unlocked — auto-hides after idle');
            clearTimeout(this._idleTimer);
            this._idleTimer = setTimeout(() => {
                this._isEditing = false;
                this._applyEditMode(false);
            }, this.IDLE_TIMEOUT_MS);
        }

        const lockBtn = document.getElementById('wm-lock-btn');
        if (lockBtn) {
            lockBtn.textContent = this._editLocked ? '🔒 LOCKED' : '🔓 LOCK';
            lockBtn.classList.toggle('wm-hud-locked', this._editLocked);
        }
    }

    /**
     * Apply or remove all edit-mode visual changes.
     */
    _applyEditMode(active) {
        const hud = document.getElementById('wm-hud');
        if (hud) hud.classList.toggle('wm-hud-visible', active);

        const hint = document.getElementById('wm-disabled-hint');
        if (hint) hint.classList.toggle('wm-hint-visible', active);

        for (const [, inst] of this.instances) {
            inst.el.classList.toggle('wm-editing', active);
            if (!inst.state.enabled) {
                inst.el.classList.toggle('wm-show-disabled', active);
                inst.el.style.display       = active ? '' : 'none';
                inst.el.style.pointerEvents = active ? 'all' : 'none';
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GLOBAL EVENT BINDINGS
    // ─────────────────────────────────────────────────────────────────────────

    _bindGlobalEvents() {
        // ── MOUSE ────────────────────────────────────────────────────────────

        // Mouse movement → wake edit mode
        document.addEventListener('mousemove', () => {
            if (document.body.dataset.view !== 'streaming') return;
            this._onInteractionActivity();
        });

        // Middle-click → toggle edit-mode lock
        document.addEventListener('mousedown', (e) => {
            if (document.body.dataset.view !== 'streaming') return;
            if (e.button !== 1) return;
            e.preventDefault();
            this._toggleEditLock();
        });

        // Right-click → back to standard view
        document.addEventListener('contextmenu', (e) => {
            if (document.body.dataset.view !== 'streaming') return;
            e.preventDefault();
            if (typeof uiManager !== 'undefined') uiManager.switchView('standard');
        });

        // Double-click on canvas background → test trigger
        document.addEventListener('dblclick', (e) => {
            if (document.body.dataset.view !== 'streaming') return;
            if (e.target.closest('.wm-widget')) return;
            this.emitTrigger({ name: 'TEST TRIGGER', id: 'test' });
        });

        // HUD buttons
        document.addEventListener('click', (e) => {
            if (e.target.id === 'wm-back-btn') {
                if (typeof uiManager !== 'undefined') uiManager.switchView('standard');
            }
            if (e.target.id === 'wm-lock-btn') {
                this._toggleEditLock();
            }
        });

        // ── TOUCH — global canvas gestures ───────────────────────────────────
        // We attach to document so we catch touches anywhere in streaming view.

        let _globalTouchStartTime  = 0;
        let _globalTouchCount      = 0;
        let _globalLongPressTimer  = null;
        let _globalLongPressFired  = false;

        document.addEventListener('touchstart', (e) => {
            if (document.body.dataset.view !== 'streaming') return;

            // Wake edit mode on any touch
            this._onInteractionActivity();

            _globalTouchCount = e.touches.length;

            // Two-finger tap → navigate back (replaces right-click)
            if (_globalTouchCount === 2 && !e.target.closest('.wm-widget')) {
                e.preventDefault();
                // Short two-finger tap: if both fingers lift quickly it's a back nav;
                // handled in touchend below.
                _globalTouchStartTime = Date.now();
            }

            // Long-press on canvas background → toggle edit lock (replaces middle-click)
            if (_globalTouchCount === 1 && !e.target.closest('.wm-widget')) {
                _globalLongPressFired = false;
                clearTimeout(_globalLongPressTimer);
                _globalLongPressTimer = setTimeout(() => {
                    if (document.body.dataset.view !== 'streaming') return;
                    _globalLongPressFired = true;
                    this._toggleEditLock();
                    // Brief haptic pulse if available
                    if (navigator.vibrate) navigator.vibrate(30);
                }, this.LONG_PRESS_MS);
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (document.body.dataset.view !== 'streaming') return;
            // Any movement cancels the long-press timer
            clearTimeout(_globalLongPressTimer);
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (document.body.dataset.view !== 'streaming') return;
            clearTimeout(_globalLongPressTimer);

            // Two-finger quick tap → back to standard view
            if (_globalTouchCount === 2
                && !e.target.closest('.wm-widget')
                && (Date.now() - _globalTouchStartTime) < 300
                && !_globalLongPressFired) {
                e.preventDefault();
                if (typeof uiManager !== 'undefined') uiManager.switchView('standard');
            }

            _globalTouchCount = e.touches.length;
        }, { passive: false });

        document.addEventListener('touchcancel', () => {
            clearTimeout(_globalLongPressTimer);
            _globalTouchCount = 0;
        }, { passive: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PER-WIDGET INTERACTIONS (drag, scale, enable-toggle)
    // ─────────────────────────────────────────────────────────────────────────

    _bindWidgetInteractions(id, el, state) {
        let scaleTimer = null;

        // ── MOUSE drag ───────────────────────────────────────────────────────
        let dragging = false, ox, oy, sx, sy;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragging = true;
            ox = e.clientX; oy = e.clientY;
            sx = state.x;   sy = state.y;
            el.classList.add('wm-dragging');
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!dragging) return;
            const rawX = sx + (e.clientX - ox);
            const rawY = sy + (e.clientY - oy);
            const { x, y, guideX, guideY } = this._applySnap(id, rawX, rawY);
            state.x = x;
            state.y = y;
            this._applyPosition(el, state);
            this._updateGuides(guideX, guideY);
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('wm-dragging');
            this._clearGuides();
            this._saveLayout();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // ── MOUSE scroll to scale ────────────────────────────────────────────
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            const dir = e.deltaY < 0 ? 1 : -1;
            state.scale = +(Math.min(this.MAX_SCALE,
                Math.max(this.MIN_SCALE, state.scale + dir * this.SCALE_STEP)
            ).toFixed(1));
            el.style.fontSize = `${state.scale}rem`;

            el.dataset.scaleHint = `×${state.scale.toFixed(1)}`;
            el.classList.remove('wm-scale-hint');
            void el.offsetWidth;
            el.classList.add('wm-scale-hint');
            clearTimeout(scaleTimer);
            scaleTimer = setTimeout(() => el.classList.remove('wm-scale-hint'), 1000);

            this._saveLayout();
        }, { passive: false });

        // ── MOUSE double-click to enable/disable ─────────────────────────────
        el.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleWidgetEnabled(el, state);
        });

        // ── TOUCH drag + pinch-to-scale + long-press-to-toggle ───────────────
        let touchDragging       = false;
        let touchOx, touchOy, touchSx, touchSy;
        let pinchStartDist      = null;
        let pinchStartScale     = null;
        let widgetLongPressTimer = null;
        let widgetLongPressFired = false;
        let touchMoved          = false;

        el.addEventListener('touchstart', (e) => {
            e.stopPropagation(); // don't bubble to global canvas handler

            this._onInteractionActivity(); // wake edit mode

            if (e.touches.length === 1) {
                // Single finger — start drag candidate + long-press timer
                const t = e.touches[0];
                touchDragging       = false;
                touchMoved          = false;
                widgetLongPressFired = false;
                touchOx = t.clientX; touchOy = t.clientY;
                touchSx = state.x;   touchSy = state.y;

                clearTimeout(widgetLongPressTimer);
                widgetLongPressTimer = setTimeout(() => {
                    if (!touchMoved) {
                        widgetLongPressFired = true;
                        touchDragging = false;
                        if (navigator.vibrate) navigator.vibrate(30);
                        this._toggleWidgetEnabled(el, state);
                    }
                }, this.LONG_PRESS_MS);

            } else if (e.touches.length === 2) {
                // Two fingers — start pinch, cancel drag & long-press
                clearTimeout(widgetLongPressTimer);
                touchDragging    = false;
                el.classList.remove('wm-dragging');
                this._clearGuides();

                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pinchStartDist  = Math.hypot(dx, dy);
                pinchStartScale = state.scale;
            }

            e.preventDefault();
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            e.preventDefault();
            e.stopPropagation();

            this._onInteractionActivity();

            if (e.touches.length === 1 && !widgetLongPressFired) {
                const t = e.touches[0];
                const dx = t.clientX - touchOx;
                const dy = t.clientY - touchOy;

                // Only commit to drag once finger has moved >4px (avoids accidental drag on tap)
                if (!touchDragging && Math.hypot(dx, dy) > 4) {
                    touchDragging = true;
                    touchMoved    = true;
                    clearTimeout(widgetLongPressTimer); // movement cancels long-press
                    el.classList.add('wm-dragging');
                }

                if (touchDragging) {
                    const rawX = touchSx + dx;
                    const rawY = touchSy + dy;
                    const { x, y, guideX, guideY } = this._applySnap(id, rawX, rawY);
                    state.x = x;
                    state.y = y;
                    this._applyPosition(el, state);
                    this._updateGuides(guideX, guideY);
                }

            } else if (e.touches.length === 2 && pinchStartDist !== null) {
                // Pinch-to-scale
                const dx   = e.touches[0].clientX - e.touches[1].clientX;
                const dy   = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const ratio = dist / pinchStartDist;
                const raw   = pinchStartScale * ratio;

                state.scale = +(Math.min(this.MAX_SCALE,
                    Math.max(this.MIN_SCALE, Math.round(raw / this.SCALE_STEP) * this.SCALE_STEP)
                ).toFixed(1));
                el.style.fontSize = `${state.scale}rem`;

                el.dataset.scaleHint = `×${state.scale.toFixed(1)}`;
                el.classList.remove('wm-scale-hint');
                void el.offsetWidth;
                el.classList.add('wm-scale-hint');
                clearTimeout(scaleTimer);
                scaleTimer = setTimeout(() => el.classList.remove('wm-scale-hint'), 1000);
            }
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            e.stopPropagation();
            clearTimeout(widgetLongPressTimer);

            if (touchDragging) {
                touchDragging = false;
                el.classList.remove('wm-dragging');
                this._clearGuides();
                this._saveLayout();
            }

            if (e.touches.length < 2) {
                // Pinch ended — save whatever scale we landed on
                if (pinchStartDist !== null) {
                    this._saveLayout();
                }
                pinchStartDist  = null;
                pinchStartScale = null;
            }

            touchOx = touchOy = touchSx = touchSy = undefined;
        }, { passive: false });

        el.addEventListener('touchcancel', () => {
            clearTimeout(widgetLongPressTimer);
            touchDragging  = false;
            pinchStartDist = null;
            el.classList.remove('wm-dragging');
            this._clearGuides();
        }, { passive: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WIDGET ENABLE / DISABLE (shared by dblclick and long-press)
    // ─────────────────────────────────────────────────────────────────────────

    _toggleWidgetEnabled(el, state) {
        state.enabled = !state.enabled;
        this._applyEnabled(el, state);
        this._saveLayout();
        this._flashToast(state.enabled
            ? '✓ Widget enabled'
            : '✕ Widget hidden — long-press canvas to reveal');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SNAP-TO-EDGE
    // ─────────────────────────────────────────────────────────────────────────

    _initSnapGuides() {
        this._guideV = document.createElement('div');
        this._guideV.className = 'wm-snap-guide wm-snap-guide-v';
        this.container.appendChild(this._guideV);

        this._guideH = document.createElement('div');
        this._guideH.className = 'wm-snap-guide wm-snap-guide-h';
        this.container.appendChild(this._guideH);
    }

    _getSnapLines(excludeId) {
        const xLines = [];
        const yLines = [];

        for (const [id, inst] of this.instances) {
            if (id === excludeId) continue;
            if (inst.el.style.display === 'none') continue;
            if (!inst.state.enabled) continue;

            const r  = inst.el.getBoundingClientRect();
            const cr = this.container.getBoundingClientRect();

            const left   = r.left   - cr.left;
            const top    = r.top    - cr.top;
            const right  = r.right  - cr.left;
            const bottom = r.bottom - cr.top;

            xLines.push(left, left + r.width  / 2, right);
            yLines.push(top,  top  + r.height / 2, bottom);
        }

        return { xLines, yLines };
    }

    _applySnap(id, rawX, rawY) {
        const el = this.instances.get(id).el;
        const r  = el.getBoundingClientRect();
        const w  = r.width;
        const h  = r.height;
        const T  = this.SNAP_THRESHOLD;

        const { xLines, yLines } = this._getSnapLines(id);

        let snappedX = rawX, guideX = null;
        let snappedY = rawY, guideY = null;

        let bestX = T + 1;
        for (const offset of [0, w / 2, w]) {
            for (const target of xLines) {
                const d = Math.abs((rawX + offset) - target);
                if (d < bestX) {
                    bestX    = d;
                    snappedX = target - offset;
                    guideX   = target;
                }
            }
        }
        if (bestX > T) { snappedX = rawX; guideX = null; }

        let bestY = T + 1;
        for (const offset of [0, h / 2, h]) {
            for (const target of yLines) {
                const d = Math.abs((rawY + offset) - target);
                if (d < bestY) {
                    bestY    = d;
                    snappedY = target - offset;
                    guideY   = target;
                }
            }
        }
        if (bestY > T) { snappedY = rawY; guideY = null; }

        return { x: snappedX, y: snappedY, guideX, guideY };
    }

    _updateGuides(guideX, guideY) {
        if (guideX !== null) {
            this._guideV.style.left = `${guideX}px`;
            this._guideV.classList.add('wm-snap-active');
        } else {
            this._guideV.classList.remove('wm-snap-active');
        }
        if (guideY !== null) {
            this._guideH.style.top = `${guideY}px`;
            this._guideH.classList.add('wm-snap-active');
        } else {
            this._guideH.classList.remove('wm-snap-active');
        }
    }

    _clearGuides() {
        this._guideV.classList.remove('wm-snap-active');
        this._guideH.classList.remove('wm-snap-active');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSISTENCE
    // ─────────────────────────────────────────────────────────────────────────

    _saveLayout() {
        const out = {};
        for (const [id, inst] of this.instances) out[id] = { ...inst.state };
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(out)); } catch (_) {}
    }

    _loadLayout() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            this.layout = raw ? JSON.parse(raw) : {};
        } catch (_) { this.layout = {}; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOAST
    // ─────────────────────────────────────────────────────────────────────────

    _flashToast(msg) {
        let t = document.getElementById('wm-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'wm-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.remove('wm-toast-show');
        void t.offsetWidth;
        t.classList.add('wm-toast-show');
    }
}

window.widgetManager = new WidgetManager();