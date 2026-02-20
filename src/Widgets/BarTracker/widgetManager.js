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
 */
class WidgetManager {
    constructor() {
        this.widgets      = new Map();
        this.instances    = new Map();
        this.layout       = {};
        this.showDisabled = false;
        this.container    = null;

        this.STORAGE_KEY = 'bar-widget-layout-v1';
        this.MIN_SCALE   = 0.5;
        this.MAX_SCALE   = 2.0;
        this.SCALE_STEP  = 0.1;

        this._loadLayout();
        this._bindGlobalKeys();
    }

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
        el.classList.toggle('wm-disabled', !state.enabled);
        if (!state.enabled && !this.showDisabled) {
            el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    }

    _bindWidgetInteractions(id, el, state) {
        let dragging = false, ox, oy, sx, sy;
        let scaleTimer = null;

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

        el.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.enabled = !state.enabled;
            this._applyEnabled(el, state);
            this._saveLayout();
            this._flashToast(state.enabled ? '✓ Widget enabled' : '✕ Widget hidden — Space to reveal');
        });

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
    }

    _bindGlobalKeys() {
        document.addEventListener('keydown', (e) => {
            if (document.body.dataset.view !== 'streaming') return;

            if (e.code === 'Space' && !e.target.matches('input,textarea,select')) {
                e.preventDefault();
                this.showDisabled = !this.showDisabled;
                for (const [, inst] of this.instances) {
                    if (!inst.state.enabled) {
                        inst.el.style.display = this.showDisabled ? '' : 'none';
                        inst.el.classList.toggle('wm-show-disabled', this.showDisabled);
                    }
                }
                const hint = document.getElementById('wm-disabled-hint');
                if (hint) hint.classList.toggle('wm-hint-visible', this.showDisabled);
            }

            if (e.code === 'Escape') {
                if (typeof uiManager !== 'undefined') uiManager.switchView('standard');
            }
        });
    }

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

    resetLayout() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.layout = {};
        for (const [, inst] of this.instances) inst.el.remove();
        this.instances.clear();
        if (this.container) this.mountAll(this.container);
    }

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