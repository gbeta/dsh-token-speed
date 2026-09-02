/**
 * Browser half of dsh-token-speed: a draggable ring gauge pinned to the
 * bottom-right of the shell that shows live model output speed.
 *
 * Data source (client-side, read-only): the session's **chat target**,
 * reached from the root scope via
 * `ctx.uiConversation.binding(sessionId).target('chat')` — the same target the
 * host Chat view reads from. Its snapshot carries:
 *  - `legacy.partial`  — the in-flight assistant step; its text grows as
 *    chunks stream in. The only source that moves *during* generation, so the
 *    live needle is an estimate driven by text volume.
 *  - `legacy.nodes` — settled assistant nodes, each carrying
 *    `usage.outputTokens` plus `timing` (firstTokenTime → completedTime), the
 *    exact provider-reported throughput. Used to display the last settled step
 *    and to calibrate the chars-per-token ratio the live estimate multiplies by.
 *
 * @module dsh-token-speed/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-token-speed',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;
    var useMemo = React.useMemo;

    //#region CSS
    // Injected once and guarded by data-plugin-css, the same contract the
    // shipped UI packages use, so HMR re-mounts never stack duplicates.
    var CSS_ID = 'dsh-token-speed/widget.css';
    var CSS =
      '.dtsw-root{position:absolute;z-index:5;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}' +
      '.dtsw-root *{box-sizing:border-box}' +
      '.dtsw-card{display:flex;align-items:center;gap:10px;padding:8px 12px 8px 8px;border-radius:14px;' +
      'background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'box-shadow:0 6px 24px rgba(0,0,0,.16);color:var(--dsw-alias-label-primary,#111);' +
      'cursor:grab;user-select:none;transition:box-shadow .18s ease}' +
      '.dtsw-card:hover{box-shadow:0 8px 30px rgba(0,0,0,.22)}' +
      '.dtsw-card[data-dragging=true]{cursor:grabbing;box-shadow:0 12px 34px rgba(0,0,0,.28)}' +
      '.dtsw-gauge{position:relative;flex:0 0 auto;line-height:0}' +
      '.dtsw-gauge-svg{display:block;transform:rotate(-90deg)}' +
      '.dtsw-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}' +
      '.dtsw-value{font-size:12px;font-weight:650;letter-spacing:-.2px;line-height:1.15;color:var(--dsw-alias-label-primary,#111)}' +
      '.dtsw-value[data-idle=true]{color:var(--dsw-alias-label-tertiary,#999)}' +
      '.dtsw-unit{font-size:8px;line-height:1;color:var(--dsw-alias-label-tertiary,#999)}' +
      '.dtsw-meta{display:flex;flex-direction:column;gap:3px;min-width:76px}' +
      '.dtsw-state{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:550;color:var(--dsw-alias-label-secondary,#555)}' +
      '.dtsw-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#999);flex:0 0 auto}' +
      '.dtsw-dot[data-live=true]{background:#22c55e;animation:dtsw-pulse 1.1s ease-in-out infinite}' +
      '@keyframes dtsw-pulse{0%,100%{opacity:1}50%{opacity:.35}}' +
      '@media (prefers-reduced-motion:reduce){.dtsw-dot[data-live=true]{animation:none}}' +
      '.dtsw-sub{font-size:10px;line-height:1.25;color:var(--dsw-alias-label-tertiary,#999)}' +
      '.dtsw-panel{margin-top:6px;width:216px;padding:9px 11px;border-radius:12px;' +
      'background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'box-shadow:0 8px 26px rgba(0,0,0,.18);cursor:default}' +
      '.dtsw-panel dl{margin:0;display:flex;flex-direction:column;gap:5px}' +
      '.dtsw-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px}' +
      '.dtsw-row dt{color:var(--dsw-alias-label-tertiary,#999);margin:0;white-space:nowrap}' +
      '.dtsw-row dd{margin:0;font-weight:600;color:var(--dsw-alias-label-primary,#111);font-variant-numeric:tabular-nums}' +
      '.dtsw-hint{margin:8px 0 0;font-size:10px;line-height:1.35;color:var(--dsw-alias-label-tertiary,#999);' +
      'border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));padding-top:6px}' +
      '.dtsw-actions{display:flex;gap:6px;margin-top:8px}' +
      '.dtsw-btn{flex:1;font-size:10px;font-weight:550;line-height:1;padding:6px 8px;border-radius:8px;cursor:pointer;' +
      'background:var(--dsw-alias-bg-layer-3,rgba(0,0,0,.04));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'color:var(--dsw-alias-label-secondary,#555);transition:background .15s ease,border-color .15s ease}' +
      '.dtsw-btn:hover{background:var(--dsw-alias-bg-layer-4,rgba(0,0,0,.08));border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.18))}' +
      '.dtsw-btn[data-done=true]{color:#22c55e;border-color:#22c55e}';
    function injectCss() {
      if (typeof document === 'undefined') return;
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') !== null) return;
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-token-speed';
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
    //#endregion

    //#region constants
    /** Services required before mounting. */
    var INJECT = ['slots', 'uiConversation'];

    var STORE_KEY = 'dsh-token-speed:prefs:v1';
    var MARGIN = 16;
    /** Ring geometry (radius / stroke / circumference). */
    var R = 21;
    var STROKE = 4.5;
    var CIRC = 2 * Math.PI * R;
    /** Sliding window behind the live estimate. */
    var WINDOW_MS = 1200;
    /** EMA weight of the newest speed sample (higher = twitchier needle). */
    var ALPHA = 0.35;
    /** Chars-per-token seed, replaced by measurement after the first step. */
    var DEFAULT_CHARS_PER_TOKEN = 3.2;
    /** EMA weight of a freshly measured chars-per-token ratio. */
    var RATIO_ALPHA = 0.4;
    /** Gauge full-scale floor so slow models don't peg the needle. */
    var SCALE_MIN = 30;
    /** Below this, the needle is treated as "not generating". */
    var IDLE_EPS = 0.35;
    //#endregion

    //#region helpers
    function clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    }

    /** Load persisted prefs; a malformed entry degrades to the defaults. */
    function loadPrefs() {
      var fallback = { x: null, y: null, open: false };
      try {
        var raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return fallback;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return fallback;
        return {
          x: typeof parsed.x === 'number' ? parsed.x : null,
          y: typeof parsed.y === 'number' ? parsed.y : null,
          open: parsed.open === true,
        };
      } catch (error) {
        return fallback;
      }
    }

    function savePrefs(prefs) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
      } catch (error) {
        /* storage disabled — the widget still works, it just forgets. */
      }
    }

    /**
     * Output characters of one assistant step: the streamed prefix while it
     * is in flight, the settled blocks once it lands. Reasoning text counts —
     * it is billed output the model produced during the same decode window.
     * @param partial - snapshot.partial, or null.
     * @returns character count.
     */
    function partialChars(partial) {
      if (!partial || !partial.blocks) return 0;
      var total = 0;
      for (var i = 0; i < partial.blocks.length; i += 1) {
        var block = partial.blocks[i];
        if ((block.kind === 'text' || block.kind === 'reasoning') && typeof block.text === 'string') {
          total += block.text.length;
        }
      }
      return total;
    }

    /**
     * The newest settled assistant node, whose `usage` and `timing` are the
     * exact throughput source for the step that just finished.
     * @param nodes - snapshot nodes (newest last).
     * @returns the last assistant node, or undefined.
     */
    function lastAssistantNode(nodes) {
      for (var i = nodes.length - 1; i >= 0; i -= 1) {
        if (nodes[i].kind === 'assistant') return nodes[i];
      }
      return undefined;
    }

    /** Read the provider-reported output-token count, guarded like the shipped UI. */
    function outputTokensOf(usage) {
      if (typeof usage !== 'object' || usage === null) return null;
      var value = usage.outputTokens;
      return typeof value === 'number' && isFinite(value) && value >= 0 ? value : null;
    }

    /**
     * Exact throughput of one settled step: output tokens over the decode
     * window (first token → completed), the same division the shipped stats
     * line performs.
     * @param node - a settled assistant node.
     * @returns tok/s, or null when the step reported no usable timing/usage.
     */
    function exactStepTps(node) {
      if (!node) return null;
      var tokens = outputTokensOf(node.usage);
      var timing = node.timing;
      if (tokens === null || !timing || timing.firstTokenTime === null) return null;
      var decodeMs = Math.max(0, timing.completedTime - timing.firstTokenTime);
      if (decodeMs <= 0 || tokens <= 0) return null;
      return tokens / (decodeMs / 1000);
    }

    function formatTps(value) {
      if (value === null || value === undefined) return '—';
      if (value >= 100) return String(Math.round(value));
      if (value >= 10) return (Math.round(value * 10) / 10).toFixed(1);
      return (Math.round(value * 100) / 100).toFixed(2);
    }

    function formatMs(ms) {
      if (!ms || ms <= 0) return '—';
      return ms >= 1000 ? (Math.round(ms / 100) / 10).toFixed(1) + 's' : Math.round(ms) + 'ms';
    }

    function formatCount(value) {
      if (typeof value !== 'number' || !isFinite(value)) return '—';
      if (value >= 1000000) return (Math.round(value / 10000) / 100).toFixed(2) + 'M';
      if (value >= 10000) return (Math.round(value / 100) / 100).toFixed(2) + 'k';
      return String(Math.round(value));
    }

    /**
     * Needle colour: warm (slow) → green (fast). The faster the throughput the
     * more satisfying it should read, so the top of the scale is green.
     * Smoothly interpolated across the 0–60 tok/s band (60+ stays fully green)
     * so the hue glides instead of snapping between discrete stops.
     */
    var SPEED_COLOR_STOPS = [
      { t: 0, c: [239, 68, 68] }, // red — slow
      { t: 12, c: [245, 158, 11] }, // amber
      { t: 30, c: [163, 230, 53] }, // lime
      { t: 60, c: [34, 197, 94] }, // green — fast
    ];
    function speedColor(tps) {
      var v = tps < 0 ? 0 : tps > 60 ? 60 : tps;
      var stops = SPEED_COLOR_STOPS;
      var a = stops[0];
      var b = stops[stops.length - 1];
      for (var i = 0; i < stops.length - 1; i += 1) {
        if (v >= stops[i].t && v <= stops[i + 1].t) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      var span = b.t - a.t;
      var f = span > 0 ? (v - a.t) / span : 0;
      var r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * f);
      var g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * f);
      var bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * f);
      return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    /**
     * Copy text to the clipboard. Prefers the async Clipboard API; falls back
     * to a hidden textarea + execCommand when it is unavailable (e.g. a
     * non-secure context). Resolves true on success, false on failure.
     */
    function copyText(text) {
      function fallback() {
        try {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.top = '-1000px';
          area.style.left = '-1000px';
          document.body.appendChild(area);
          area.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(area);
          return ok;
        } catch (error) {
          return false;
        }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(
          function () {
            return true;
          },
          function () {
            return fallback();
          }
        );
      }
      return Promise.resolve(fallback());
    }
    //#endregion

    //#region sampler
    /**
     * Live-speed sampler, kept outside React so chunk-driven snapshot updates
     * never re-create it and never trigger a render on their own.
     *
     * It holds two pieces of state:
     *  - a ring of `(time, chars)` samples for the step being generated, whose
     *    oldest-in-window entry gives the instantaneous char rate;
     *  - an EMA'd chars-per-token ratio, seeded with a guess and re-measured
     *    against every settled step, so the estimate converges on the real
     *    tokenizer behaviour of whatever model is answering.
     */
    function createSampler() {
      var samples = [];
      var ema = 0;
      var lastStepKey = null;
      var ratio = 1 / DEFAULT_CHARS_PER_TOKEN;
      var lastStepTps = null;

      return {
        /**
         * Feed the current stream state.
         * @param stepKey - `turn:step` identity of the step, or null when idle.
         * @param chars - output characters accumulated so far this step.
         * @param now - wall clock (ms).
         * @returns estimated tok/s, or 0 while no rate can be derived.
         */
        sample: function sample(stepKey, chars, now) {
          if (stepKey === null) {
            samples.length = 0;
            ema = 0;
            lastStepKey = null;
            return 0;
          }
          if (stepKey !== lastStepKey) {
            samples.length = 0;
            ema = 0;
            lastStepKey = stepKey;
          }
          samples.push({ t: now, c: chars });
          // Keep one sample before the window so the rate spans the full window.
          while (samples.length > 2 && now - samples[0].t > WINDOW_MS) samples.shift();
          if (samples.length < 2) return ema;

          var first = samples[0];
          var dt = now - first.t;
          var dc = chars - first.c;
          if (dt <= 0 || dc <= 0) return ema;
          var tps = (dc / dt) * 1000 * ratio;
          ema = ema === 0 ? tps : ema + ALPHA * (tps - ema);
          return ema;
        },
        /**
         * Calibrate against a settled step and remember its exact throughput.
         * @param node - the settled assistant node.
         */
        settle: function settle(node) {
          var tps = exactStepTps(node);
          if (tps !== null) lastStepTps = tps;
          var tokens = outputTokensOf(node.usage);
          if (tokens === null) return;
          var chars = 0;
          var blocks = node.blocks || [];
          for (var i = 0; i < blocks.length; i += 1) {
            var block = blocks[i];
            if ((block.kind === 'text' || block.kind === 'reasoning') && typeof block.text === 'string') {
              chars += block.text.length;
            }
          }
          if (chars <= 0 || tokens <= 0) return;
          var measured = tokens / chars;
          // Reject absurd calibrations (e.g. a step whose text was truncated
          // out of the loaded window) instead of poisoning the estimate.
          if (measured > 0.02 && measured < 4) {
            ratio = ratio + RATIO_ALPHA * (measured - ratio);
          }
        },
        /** @returns exact tok/s of the most recent settled step. */
        lastStepTps: function () {
          return lastStepTps;
        },
        /** @returns the current chars-per-token ratio (diagnostics). */
        ratio: function () {
          return ratio;
        },
      };
    }
    //#endregion

    //#region gauge
    /**
     * The ring gauge: a track, a coloured arc whose length is the speed
     * relative to full scale, and the centred reading.
     */
    function Gauge(props) {
      var tps = props.tps;
      var live = props.live;
      var scale = props.scale;
      var frac = clamp(tps / scale, 0, 1);
      var color = speedColor(tps);
      var size = (R + STROKE) * 2;
      return h(
        'div',
        { className: 'dtsw-gauge', style: { width: size, height: size } },
        h(
          'svg',
          { className: 'dtsw-gauge-svg', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size },
          h('circle', {
            cx: size / 2,
            cy: size / 2,
            r: R,
            fill: 'none',
            stroke: 'var(--dsw-alias-border-l1, rgba(128,128,128,.28))',
            strokeWidth: STROKE,
          }),
          h('circle', {
            cx: size / 2,
            cy: size / 2,
            r: R,
            fill: 'none',
            stroke: color,
            strokeWidth: STROKE,
            strokeLinecap: 'round',
            strokeDasharray: CIRC,
            strokeDashoffset: CIRC * (1 - frac),
            style: { transition: 'stroke-dashoffset .2s linear, stroke .3s ease' },
          })
        ),
        h(
          'div',
          { className: 'dtsw-center' },
          h('span', { className: 'dtsw-value', 'data-idle': live ? 'false' : 'true' }, formatTps(tps)),
          h('span', { className: 'dtsw-unit' }, 'tok/s')
        )
      );
    }
    //#endregion

    //#region widget
    /**
     * Build the widget component. Factored so it closes over `ctx` (needed to
     * resolve the current session's face) while React sees one stable type.
     * @param ctx - the client Cordis context.
     * @returns the shell.overlay entry component.
     */
    function createWidget(ctx) {
      return function TokenSpeedWidget(props) {
        var useSessions = props.useSessions;
        var currentId = useSessions(function (s) {
          var current = s.current;
          var entry = s.byId ? s.byId[current] : undefined;
          return current !== undefined && entry && entry.blank === false ? current : undefined;
        });

        var samplerRef = useRef(null);
        if (samplerRef.current === null) samplerRef.current = createSampler();

        // Resolve the current session's chat target — the authoritative source
        // for the in-flight partial and the settled assistant nodes. `binding()`
        // is cached per session by the conversation service and render-safe.
        var chatTarget = useMemo(
          function () {
            if (!currentId) return undefined;
            try {
              return ctx.uiConversation.binding(currentId).target('chat');
            } catch (error) {
              return undefined;
            }
          },
          [currentId, ctx]
        );

        // Chat snapshot: subscribe manually (not uSES) because the target
        // identity changes with the selected session.
        var snapshotState = useState(null);
        var snapshot = snapshotState[0];
        var setSnapshot = snapshotState[1];
        useEffect(
          function () {
            if (!chatTarget) {
              setSnapshot(null);
              return undefined;
            }
            setSnapshot(chatTarget.getSnapshot() || null);
            return chatTarget.subscribe(function () {
              setSnapshot(chatTarget.getSnapshot() || null);
            });
          },
          [chatTarget]
        );

        var sampler = samplerRef.current;
        var settledKeyRef = useRef(null);

        // Fold the snapshot into live speed + settled-step facts. Runs on every
        // snapshot change; the sampler is a plain object, so nothing here
        // schedules extra renders.
        var live = false;
        var tps = 0;
        var stepLabel = '';
        var settled = null;
        var totalOutput = null;
        if (snapshot) {
          var legacy = snapshot.legacy || {};
          var partial = legacy.partial;
          var nodes = legacy.nodes || [];

          // Cumulative output over the loaded window (sum of settled steps).
          var sumTokens = 0;
          var hasTokens = false;
          for (var i = 0; i < nodes.length; i += 1) {
            if (nodes[i].kind === 'assistant') {
              var t = outputTokensOf(nodes[i].usage);
              if (t !== null) {
                sumTokens += t;
                hasTokens = true;
              }
            }
          }
          if (hasTokens) totalOutput = sumTokens;

          var lastNode = lastAssistantNode(nodes);
          if (lastNode) {
            var key = lastNode.turn + ':' + lastNode.step;
            if (settledKeyRef.current !== key) {
              settledKeyRef.current = key;
              sampler.settle(lastNode);
            }
            settled = {
              tps: exactStepTps(lastNode),
              tokens: outputTokensOf(lastNode.usage),
              ttftMs:
                lastNode.timing && lastNode.timing.stepStartTime !== null && lastNode.timing.firstTokenTime !== null
                  ? Math.max(0, lastNode.timing.firstTokenTime - lastNode.timing.stepStartTime)
                  : null,
            };
          }
          if (partial) {
            live = true;
            var chars = partialChars(partial);
            tps = sampler.sample(partial.turn + ':' + partial.step, chars, Date.now());
            stepLabel = 'step ' + partial.step;
          } else {
            tps = sampler.sample(null, 0, Date.now());
          }
        }
        if (tps < IDLE_EPS) tps = 0;

        // Full scale follows the peak so the needle stays readable.
        var scaleRef = useRef(SCALE_MIN);
        if (tps > scaleRef.current) scaleRef.current = Math.ceil((tps * 1.15) / 10) * 10;
        else if (tps === 0 && scaleRef.current > SCALE_MIN) scaleRef.current = Math.max(SCALE_MIN, scaleRef.current - 1);

        // A 220ms tick keeps the needle moving (and decaying to zero) even when
        // chunks arrive in bursts or stop mid-step.
        var tickState = useState(0);
        var setTick = tickState[0];
        var bump = tickState[1];
        useEffect(function () {
          var id = window.setInterval(function () {
            bump(function (n) {
              return n + 1;
            });
          }, 220);
          return function () {
            window.clearInterval(id);
          };
        }, [bump]);
        void setTick;

        var prefsRef = useRef(null);
        if (prefsRef.current === null) prefsRef.current = loadPrefs();
        var openState = useState(prefsRef.current.open);
        var open = openState[0];
        var setOpen = openState[1];
        var posState = useState({
          x: prefsRef.current.x,
          y: prefsRef.current.y,
        });
        var pos = posState[0];
        var setPos = posState[1];
        var draggingState = useState(false);
        var dragging = draggingState[0];
        var setDragging = draggingState[1];
        var copiedState = useState(false);
        var copied = copiedState[0];
        var setCopied = copiedState[1];

        var dragRef = useRef(null);
        var rootRef = useRef(null);
        var copyTimerRef = useRef(null);

        var onPointerDown = useCallback(
          function (event) {
            if (event.button !== 0) return;
            var node = rootRef.current;
            if (!node) return;
            var rect = node.getBoundingClientRect();
            dragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              originLeft: rect.left,
              originTop: rect.top,
              width: rect.width,
              height: rect.height,
              moved: false,
            };
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch (error) {
              /* capture unsupported */
            }
          },
          []
        );

        var onPointerMove = useCallback(
          function (event) {
            var drag = dragRef.current;
            if (!drag) return;
            var dx = event.clientX - drag.startX;
            var dy = event.clientY - drag.startY;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
            if (!drag.moved) {
              drag.moved = true;
              setDragging(true);
            }
            var maxX = window.innerWidth - drag.width - 4;
            var maxY = window.innerHeight - drag.height - 4;
            var left = clamp(drag.originLeft + dx, 4, Math.max(4, maxX));
            var top = clamp(drag.originTop + dy, 4, Math.max(4, maxY));
            setPos({ x: left, y: top });
          },
          [setPos, setDragging]
        );

        var onPointerUp = useCallback(
          function (event) {
            var drag = dragRef.current;
            dragRef.current = null;
            setDragging(false);
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch (error) {
              /* not captured */
            }
            // A press that never moved is a click: toggle the detail panel.
            if (drag && !drag.moved) {
              setOpen(function (prev) {
                prefsRef.current.open = !prev;
                savePrefs(prefsRef.current);
                return !prev;
              });
            } else if (drag && drag.moved) {
              prefsRef.current.x = pos.x;
              prefsRef.current.y = pos.y;
              savePrefs(prefsRef.current);
            }
          },
          [pos.x, pos.y, setOpen]
        );

        // Keep the widget inside the viewport after a resize.
        useEffect(function () {
          function onResize() {
            setPos(function (prev) {
              if (prev.x === null || prev.y === null) return prev;
              var node = rootRef.current;
              if (!node) return prev;
              var rect = node.getBoundingClientRect();
              var maxX = window.innerWidth - rect.width - 4;
              var maxY = window.innerHeight - rect.height - 4;
              var next = { x: clamp(prev.x, 4, Math.max(4, maxX)), y: clamp(prev.y, 4, Math.max(4, maxY)) };
              if (next.x === prev.x && next.y === prev.y) return prev;
              prefsRef.current.x = next.x;
              prefsRef.current.y = next.y;
              savePrefs(prefsRef.current);
              return next;
            });
          }
          window.addEventListener('resize', onResize);
          return function () {
            window.removeEventListener('resize', onResize);
          };
        }, [setPos]);

        var style =
          pos.x === null || pos.y === null
            ? { right: MARGIN, bottom: MARGIN }
            : { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' };

        var runningCalls = (snapshot && snapshot.legacy && snapshot.legacy.runningCalls) || [];
        var stateText = !snapshot ? '无会话' : live ? '生成中' : runningCalls.length > 0 ? '工具执行中' : '空闲';
        var subText = live ? stepLabel : settled && settled.tps !== null ? '上次 ' + formatTps(settled.tps) + ' tok/s' : '等待输出';

        var onCopy = useCallback(
          function () {
            var lines = [];
            lines.push('dsh-token-speed 会话速度');
            lines.push('实时速度（估算）: ' + formatTps(tps) + ' tok/s');
            lines.push('上一步（精确）: ' + (settled && settled.tps !== null ? formatTps(settled.tps) + ' tok/s' : '—'));
            lines.push('上一步输出: ' + (settled && settled.tokens !== null ? formatCount(settled.tokens) + ' tok' : '—'));
            lines.push('上一步 TTFT: ' + (settled ? formatMs(settled.ttftMs) : '—'));
            lines.push('累计输出（窗口内）: ' + (totalOutput !== null ? formatCount(totalOutput) + ' tok' : '—'));
            lines.push('状态: ' + stateText);
            var text = lines.join('\n');
            copyText(text).then(
              function (ok) {
                if (ok) {
                  setCopied(true);
                  if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
                  copyTimerRef.current = window.setTimeout(function () {
                    setCopied(false);
                  }, 1400);
                }
              },
              function () {
                /* copy failed — leave the button in its default state */
              }
            );
          },
          [tps, settled, totalOutput, stateText, setCopied]
        );

        return h(
          'div',
          { ref: rootRef, className: 'dtsw-root', style: style },
          h(
            'div',
            {
              className: 'dtsw-card',
              'data-dragging': dragging ? 'true' : 'false',
              title: '拖动移动位置 · 点击展开详情',
              onPointerDown: onPointerDown,
              onPointerMove: onPointerMove,
              onPointerUp: onPointerUp,
              onPointerCancel: onPointerUp,
            },
            h(Gauge, { tps: tps, live: live || tps > 0, scale: scaleRef.current }),
            h(
              'div',
              { className: 'dtsw-meta' },
              h(
                'span',
                { className: 'dtsw-state' },
                h('span', { className: 'dtsw-dot', 'data-live': live ? 'true' : 'false' }),
                stateText
              ),
              h('span', { className: 'dtsw-sub' }, subText)
            )
          ),
          open
            ? h(
                'div',
                { className: 'dtsw-panel' },
                h(
                  'dl',
                  null,
                  row('实时速度（估算）', formatTps(tps) + ' tok/s'),
                  row('上一步（精确）', settled && settled.tps !== null ? formatTps(settled.tps) + ' tok/s' : '—'),
                  row('上一步输出', settled && settled.tokens !== null ? formatCount(settled.tokens) + ' tok' : '—'),
                  row('上一步 TTFT', settled ? formatMs(settled.ttftMs) : '—'),
                  row('累计输出（窗口内）', totalOutput !== null ? formatCount(totalOutput) + ' tok' : '—')
                ),
                h(
                  'p',
                  { className: 'dtsw-hint' },
                  '流式输出期间没有真实 token 计数，实时值按输出文本量 × 实测字符/token 比率估算；每一步结束后用 provider 上报的 usage 校准。'
                ),
                h(
                  'div',
                  { className: 'dtsw-actions' },
                  h(
                    'button',
                    {
                      className: 'dtsw-btn',
                      type: 'button',
                      'data-done': copied ? 'true' : 'false',
                      onClick: onCopy,
                    },
                    copied ? '已复制' : '复制数据'
                  )
                )
              )
            : null
        );
      };

      function row(label, value) {
        return h('div', { className: 'dtsw-row' }, h('dt', null, label), h('dd', null, value));
      }
    }
    //#endregion

    /**
     * Client plugin body.
     * @param ctx - the client Cordis context (slots, sessions).
     */
    function apply(ctx) {
      injectCss();
      var Widget = createWidget(ctx);
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register(
          { name: 'shell.overlay', id: 'dsh-token-speed', order: 100, label: 'Token speed' },
          Widget
        );
      });
    }

    module.exports = {
      name: 'dsh-token-speed',
      inject: INJECT,
      apply: apply,
    };
    return module.exports;
  },
});
