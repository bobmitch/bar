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
 * Edit Mode behaviour (replaces the old middle-click toggle):
 *   • Any mouse movement on the streaming canvas wakes "edit mode"
 *   • After IDLE_TIMEOUT_MS of no movement, edit mode sleeps (OBS-clean)
 *   • While awake: HUD bar fades in, disabled widgets appear ghosted,
 *     ALL widgets get a dashed outline so you can find them
 *   • Middle-click anywhere → toggle LOCK (keeps edit mode on permanently
 *     regardless of idle timeout — middle-click again to unlock)
 */
class WidgetManager {
    constructor() {
        this.widgets      = new Map();
        this.instances    = new Map();
        this.layout       = {};
        this.container    = null;

        // Edit-mode state
        this._isEditing   = false;   // true while mouse is active / locked
        this._editLocked  = false;   // true when user has middle-clicked to pin
        this._idleTimer   = null;

        this.STORAGE_KEY    = 'bar-widget-layout-v1';
        this.MIN_SCALE      = 0.5;
        this.MAX_SCALE      = 2.0;
        this.SCALE_STEP     = 0.1;
        this.IDLE_TIMEOUT_MS = 2500; // ms of no mouse movement → sleep

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
            el.style.pointerEvents = '';
        } else {
            el.classList.add('wm-disabled');
            // Visibility of disabled widgets follows edit mode
            const show = this._isEditing;
            el.classList.toggle('wm-show-disabled', show);
            el.style.display       = show ? '' : 'none';
            el.style.pointerEvents = show ? 'all' : 'none';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EDIT MODE — mouse motion detection + idle sleep + lock
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Called on every mousemove while in streaming view.
     * Wakes edit mode and restarts the idle countdown (unless locked).
     */
    _onMouseActivity() {
        if (!this._isEditing) {
            this._isEditing = true;
            this._applyEditMode(true);
        }

        // If locked, don't arm the idle timer — stay awake indefinitely
        if (this._editLocked) return;

        clearTimeout(this._idleTimer);
        this._idleTimer = setTimeout(() => {
            this._isEditing = false;
            this._applyEditMode(false);
        }, this.IDLE_TIMEOUT_MS);
    }

    /**
     * Toggle the edit-mode lock (middle-click).
     * Locked = edit UI stays visible until unlocked, ignoring idle timer.
     */
    _toggleEditLock() {
        this._editLocked = !this._editLocked;

        if (this._editLocked) {
            // Lock on — wake immediately and cancel any pending sleep
            clearTimeout(this._idleTimer);
            this._isEditing = true;
            this._applyEditMode(true);
            this._flashToast('🔒 Edit mode locked — middle-click to unlock');
        } else {
            // Lock off — restart the idle timer from now
            this._flashToast('🔓 Edit mode unlocked — auto-hides after idle');
            clearTimeout(this._idleTimer);
            this._idleTimer = setTimeout(() => {
                this._isEditing = false;
                this._applyEditMode(false);
            }, this.IDLE_TIMEOUT_MS);
        }

        // Update HUD lock indicator if present
        const lockBtn = document.getElementById('wm-lock-btn');
        if (lockBtn) {
            lockBtn.textContent = this._editLocked ? '🔒 LOCKED' : '🔓 LOCK';
            lockBtn.classList.toggle('wm-hud-locked', this._editLocked);
        }
    }

    /**
     * Apply or remove all edit-mode visual changes.
     * @param {boolean} active
     */
    _applyEditMode(active) {
        // HUD bar
        const hud = document.getElementById('wm-hud');
        if (hud) hud.classList.toggle('wm-hud-visible', active);

        // Disabled-widgets hint strip
        const hint = document.getElementById('wm-disabled-hint');
        if (hint) hint.classList.toggle('wm-hint-visible', active);

        // All widget instances
        for (const [, inst] of this.instances) {
            // Outline on ALL widgets so you can find them while editing
            inst.el.classList.toggle('wm-editing', active);

            // Disabled widgets: show ghosted when editing, hide when sleeping
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
        // Mouse movement → wake edit mode (streaming view only)
        document.addEventListener('mousemove', () => {
            if (document.body.dataset.view !== 'streaming') return;
            this._onMouseActivity();
        });

        // Middle-click anywhere → toggle edit-mode lock
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

        // Double-click on canvas background (not a widget) → test trigger
        document.addEventListener('dblclick', (e) => {
            if (document.body.dataset.view !== 'streaming') return;
            if (e.target.closest('.wm-widget')) return;
            this.emitTrigger({ name: 'TEST TRIGGER', id: 'test' });
        });

        // HUD back button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'wm-back-btn') {
                if (typeof uiManager !== 'undefined') uiManager.switchView('standard');
            }
            if (e.target.id === 'wm-lock-btn') {
                this._toggleEditLock();
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PER-WIDGET INTERACTIONS (drag, scroll-to-scale, dblclick-to-toggle)
    // ─────────────────────────────────────────────────────────────────────────

    _bindWidgetInteractions(id, el, state) {
        let dragging = false, ox, oy, sx, sy;
        let scaleTimer = null;

        // ── Drag ────────────────────────────────────────────────────────────
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragging = true;
            ox = e.clientX; oy = e.clientY;
            sx = state.x;   sy = state.y;
            el.classList.add('wm-dragging');
            e.preventDefault();
        });

        const onMove = (e) => {
            if (!dragging) return;
            state.x = sx + (e.clientX - ox);
            state.y = sy + (e.clientY - oy);
            this._applyPosition(el, state);
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('wm-dragging');
            this._saveLayout();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);

        // ── Scroll to scale ─────────────────────────────────────────────────
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

        // ── Double-click to enable/disable ──────────────────────────────────
        el.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.enabled = !state.enabled;
            this._applyEnabled(el, state);
            this._saveLayout();
            this._flashToast(state.enabled
                ? '✓ Widget enabled'
                : '✕ Widget hidden — move mouse to reveal');
        });
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

const widgetManager = new WidgetManager();