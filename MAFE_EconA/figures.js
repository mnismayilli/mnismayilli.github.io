/* Interactive figures for the Economics Block A1 notes.
   -----------------------------------------------------------------------
   Each figure block in the .qmd source carries a data-fig attribute:

       ::: {.gametree data-fig="tree01"}
       ![](../figures/tree01.svg){fig-alt="..."}
       :::

   With JavaScript off (or in the PDF) the static image is shown. With
   JavaScript on, this script hides the image and draws the same figure as
   an SVG that responds to sliders, buttons and editable payoffs.

   Plain JavaScript and SVG, no framework and no build step. One function
   per figure, registered in FIGS at the bottom of the file. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var C = {
    ink: '#1f2328', ink2: '#555b63', grid: '#cfd4da', axis: '#333',
    blue: '#1f4e95', red: '#b3261e', green: '#1d6a40', orange: '#d9730d',
    violet: '#563a98', grey: '#8a9099', pale: '#eef2f7',
    blueFill: 'rgba(31,78,149,0.14)', greenFill: 'rgba(29,106,64,0.16)',
    redFill: 'rgba(179,38,30,0.12)', orangeFill: 'rgba(217,115,13,0.16)'
  };

  /* ------------------------------------------------------------ helpers */
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function htmlEl(tag, attrs, parent) {
    var e = document.createElement(tag);
    for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(x, d) { if (d === undefined) d = 2; var s = (+x).toFixed(d); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* Text with simple sub/superscripts: "θ_H", "q_{B}", "a^2". */
  function text(parent, x, y, str, opts) {
    opts = opts || {};
    var t = svgEl('text', {
      x: x, y: y, fill: opts.color || C.ink, 'font-size': opts.size || 12.5,
      'text-anchor': opts.anchor || 'start', 'font-style': opts.italic ? 'italic' : null,
      'font-weight': opts.bold ? '600' : null, 'dominant-baseline': opts.baseline || null,
      'paint-order': opts.halo ? 'stroke' : null, stroke: opts.halo ? '#fff' : null, 'stroke-width': opts.halo ? 3 : null, 'stroke-linejoin': opts.halo ? 'round' : null,
      transform: opts.rotate ? 'rotate(' + opts.rotate + ' ' + x + ' ' + y + ')' : null
    }, parent);
    var re = /([_^])(\{[^}]*\}|.)/g, last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) svgEl('tspan', {}, t).textContent = str.slice(last, m.index);
      var s = m[2].replace(/^\{|\}$/g, '');
      var ts = svgEl('tspan', { 'baseline-shift': m[1] === '_' ? 'sub' : 'super', 'font-size': '75%' }, t);
      ts.textContent = s;
      last = m.index + m[0].length;
    }
    if (last < str.length) svgEl('tspan', {}, t).textContent = str.slice(last);
    return t;
  }

  /* Arrow-head marker, one per svg. */
  function ensureMarker(svg, color) {
    var id = 'arr-' + color.replace(/[^a-z0-9]/gi, '');
    if (svg.querySelector('#' + id)) return 'url(#' + id + ')';
    var defs = svg.querySelector('defs') || svgEl('defs', {}, svg);
    var mk = svgEl('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }, mk);
    return 'url(#' + id + ')';
  }

  /* A 2-D plotting surface with linear scales. */
  function Plot(svg, o) {
    this.svg = svg; this.o = o;
    var m = o.margin || { l: 56, r: 24, t: 20, b: 48 };
    this.l = m.l; this.r = o.width - m.r; this.t = m.t; this.b = o.height - m.b;
    this.x0 = o.x[0]; this.x1 = o.x[1]; this.y0 = o.y[0]; this.y1 = o.y[1];
    this.g = svgEl('g', {}, svg);
    svgEl('clipPath', { id: o.clip || 'clip' }, svgEl('defs', {}, svg));
    var cp = svg.querySelector('#' + (o.clip || 'clip'));
    svgEl('rect', { x: this.l, y: this.t, width: this.r - this.l, height: this.b - this.t }, cp);
    this.clipped = svgEl('g', { 'clip-path': 'url(#' + (o.clip || 'clip') + ')' }, this.g);
  }
  Plot.prototype.sx = function (x) { return this.l + (x - this.x0) / (this.x1 - this.x0) * (this.r - this.l); };
  Plot.prototype.sy = function (y) { return this.b - (y - this.y0) / (this.y1 - this.y0) * (this.b - this.t); };
  Plot.prototype.axes = function (xl, yl, opts) {
    opts = opts || {};
    var arrow = ensureMarker(this.svg, C.axis);
    var ox = this.sx(Math.max(this.x0, 0)), oy = this.sy(Math.max(this.y0, 0));
    svgEl('line', { x1: this.l, y1: oy, x2: this.r + 6, y2: oy, stroke: C.axis, 'stroke-width': 1.2, 'marker-end': arrow }, this.g);
    svgEl('line', { x1: ox, y1: this.b, x2: ox, y2: this.t - 6, stroke: C.axis, 'stroke-width': 1.2, 'marker-end': arrow }, this.g);
    if (xl) text(this.g, this.r + 4, oy + 31, xl, { anchor: 'end', size: 12.5 });
    if (yl) text(this.g, ox + 8, this.t + 2, yl, { size: 12.5 });
    if (!opts.noOrigin) text(this.g, ox - 6, oy + 14, '0', { anchor: 'end', size: 11, color: C.ink2 });
    return this;
  };
  Plot.prototype.curve = function (fn, a, b, attrs, n) {
    n = n || 160; var d = '', started = false;
    for (var i = 0; i <= n; i++) {
      var x = a + (b - a) * i / n, y = fn(x);
      if (!isFinite(y) || isNaN(y) || Math.abs(y) > 50 * Math.abs(this.y1 - this.y0) + Math.abs(this.y1) + Math.abs(this.y0)) { started = false; continue; }
      var px = this.sx(x), py = this.sy(y);
      d += (started ? 'L' : 'M') + px.toFixed(2) + ',' + py.toFixed(2); started = true;
    }
    return svgEl('path', Object.assign({ d: d, fill: 'none', stroke: C.ink, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, attrs), this.clipped);
  };
  Plot.prototype.poly = function (pts, attrs, clip) {
    var d = '', started = false;
    pts.forEach(function (p) {
      if (!isFinite(p[0]) || !isFinite(p[1])) { return; }
      var y = Math.max(this.y0 - (this.y1 - this.y0), Math.min(this.y1 + (this.y1 - this.y0), p[1]));
      d += (started ? 'L' : 'M') + this.sx(p[0]).toFixed(2) + ',' + this.sy(y).toFixed(2); started = true;
    }, this);
    return svgEl('path', Object.assign({ d: d, fill: 'none', stroke: C.ink, 'stroke-width': 1.6 }, attrs), clip === false ? this.g : this.clipped);
  };
  Plot.prototype.seg = function (x1, y1, x2, y2, attrs) {
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return null;
    return svgEl('line', Object.assign({ x1: this.sx(x1), y1: this.sy(y1), x2: this.sx(x2), y2: this.sy(y2), stroke: C.grey, 'stroke-width': 1 }, attrs), this.g);
  };
  Plot.prototype.guide = function (x, y, opts) {
    // dotted drop lines from (x,y) to both axes
    opts = opts || {};
    var a = { stroke: C.grey, 'stroke-dasharray': '2 3', 'stroke-width': 1 };
    if (!opts.noX) this.seg(x, Math.max(this.y0, 0), x, y, a);
    if (!opts.noY) this.seg(Math.max(this.x0, 0), y, x, y, a);
  };
  Plot.prototype.dot = function (x, y, color, r) {
    if (!isFinite(x) || !isFinite(y)) return null;
    return svgEl('circle', { cx: this.sx(x), cy: this.sy(y), r: r || 4.5, fill: color || C.ink, stroke: '#fff', 'stroke-width': 1.2 }, this.g);
  };
  Plot.prototype.tick = function (axis, v, label, color) {
    if (axis === 'x') {
      var x = this.sx(v), y = this.sy(Math.max(this.y0, 0));
      svgEl('line', { x1: x, y1: y - 3, x2: x, y2: y + 3, stroke: color || C.axis }, this.g);
      text(this.g, x, y + 15, label, { anchor: 'middle', size: 11, color: color || C.ink2 });
    } else {
      var yy = this.sy(v), xx = this.sx(Math.max(this.x0, 0));
      svgEl('line', { x1: xx - 3, y1: yy, x2: xx + 3, y2: yy, stroke: color || C.axis }, this.g);
      text(this.g, xx - 6, yy + 4, label, { anchor: 'end', size: 11, color: color || C.ink2 });
    }
  };
  Plot.prototype.label = function (x, y, str, opts) { if (!isFinite(x) || !isFinite(y)) return null; return text(this.g, this.sx(x) + (opts && opts.dx || 0), this.sy(y) + (opts && opts.dy || 0), str, opts); };
  Plot.prototype.arrow = function (x1, y1, x2, y2, color, attrs) {
    return svgEl('line', Object.assign({ x1: this.sx(x1), y1: this.sy(y1), x2: this.sx(x2), y2: this.sy(y2), stroke: color, 'stroke-width': 1.4, 'marker-end': ensureMarker(this.svg, color) }, attrs), this.g);
  };
  Plot.prototype.band = function (fnLo, fnHi, a, b, fill, n) {
    n = n || 80; var top = [], bot = [];
    for (var i = 0; i <= n; i++) {
      var x = a + (b - a) * i / n, lo = fnLo(x), hi = fnHi(x);
      if (hi < lo) hi = lo;
      top.push([x, hi]); bot.push([x, lo]);
    }
    return this.poly(top.concat(bot.reverse()), { fill: fill, stroke: 'none' });
  };

  /* Bisection on [a,b] for f(x)=0 (f(a) and f(b) of opposite sign). */
  function bisect(f, a, b, it) {
    var fa = f(a); it = it || 60;
    for (var i = 0; i < it; i++) {
      var m = (a + b) / 2, fm = f(m);
      if (fm === 0) return m;
      if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }

  /* ---------------------------------------------------------- scaffold */
  /* Builds the widget shell: an SVG panel, a row of controls and a readout.
     spec.controls: [{id,label,min,max,step,value,fmt}] (ranges) or
                    [{id,label,type:'toggle',value}] or {type:'select',options}
     spec.draw(svg, params, api) redraws the whole figure. */
  function widget(host, spec) {
    var wrap = htmlEl('div', { 'class': 'ifig' }, host);
    var W = spec.width || 560, H = spec.height || 330;
    var stage = htmlEl('div', { 'class': 'ifig-stage' }, wrap);
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': spec.alt || '' }, stage);
    svg.setAttribute('class', 'ifig-svg');
    var ctrl = htmlEl('div', { 'class': 'ifig-controls' }, wrap);
    var readout = htmlEl('div', { 'class': 'ifig-readout', 'aria-live': 'polite' }, wrap);
    var params = {}, inputs = {}, defaults = {};

    function build() {
      ctrl.innerHTML = '';
      (spec.controls || []).forEach(function (c) {
        defaults[c.id] = c.value;
        if (params[c.id] === undefined) params[c.id] = c.value;
        var lab = htmlEl('label', { 'class': 'ifig-ctl' + (c.type === 'toggle' ? ' ifig-ctl--toggle' : '') }, ctrl);
        if (c.type === 'toggle') {
          var cb = htmlEl('input', { type: 'checkbox' }, lab);
          cb.checked = !!params[c.id];
          htmlEl('span', { html: c.label }, lab);
          cb.addEventListener('change', function () { params[c.id] = cb.checked; redraw(); });
          inputs[c.id] = cb;
        } else if (c.type === 'select') {
          htmlEl('span', { 'class': 'ifig-ctl__label', html: c.label }, lab);
          var sel = htmlEl('select', {}, lab);
          c.options.forEach(function (o) { var op = htmlEl('option', { value: o[0], text: o[1] }, sel); if (o[0] === params[c.id]) op.selected = true; });
          sel.addEventListener('change', function () { params[c.id] = sel.value; redraw(); });
          inputs[c.id] = sel;
        } else {
          var head = htmlEl('span', { 'class': 'ifig-ctl__label' }, lab);
          htmlEl('span', { html: c.label }, head);
          var val = htmlEl('output', { 'class': 'ifig-ctl__val' }, head);
          var inp = htmlEl('input', { type: 'range', min: c.min, max: c.max, step: c.step || 0.01 }, lab);
          inp.value = params[c.id];
          val.textContent = (c.fmt || fmt)(params[c.id]);
          inp.addEventListener('input', function () { params[c.id] = +inp.value; val.textContent = (c.fmt || fmt)(params[c.id]); redraw(); });
          inputs[c.id] = inp; inputs[c.id + '__out'] = val; inputs[c.id + '__fmt'] = c.fmt || fmt;
        }
      });
      if (spec.controls && spec.controls.length) {
        var reset = htmlEl('button', { type: 'button', 'class': 'ifig-reset', text: 'Reset' }, ctrl);
        reset.addEventListener('click', function () {
          for (var k in defaults) { params[k] = defaults[k]; set(k, defaults[k]); }
          if (spec.onReset) spec.onReset(api);
          redraw();
        });
      }
    }
    function set(id, v) {
      params[id] = v; var i = inputs[id]; if (!i) return;
      if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
      if (inputs[id + '__out']) inputs[id + '__out'].textContent = inputs[id + '__fmt'](v);
    }
    function limit(id, min, max) {
      var i = inputs[id]; if (!i) return;
      if (min !== undefined) i.min = min; if (max !== undefined) i.max = max;
      var v = clamp(params[id], +i.min, +i.max);
      if (v !== params[id]) set(id, v);
    }
    var api = { params: params, set: set, limit: limit, readout: readout, ctrl: ctrl, wrap: wrap, redraw: redraw, svg: svg, W: W, H: H };
    function redraw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      readout.innerHTML = '';
      spec.draw(svg, params, api);
    }
    build();
    if (spec.init) spec.init(api);
    redraw();
    return api;
  }
  function note(api, html) {
    html = html.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>').replace(/_([A-Za-z0-9†′]+)/g, '<sub>$1</sub>').replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
    htmlEl('p', { html: html }, api.readout);
  }

  /* ======================================================== game trees */
  /* spec: { players: ['Entrant','Incumbent'], root: node, infosets: [[id,id]], nature: bool }
     node: { id, player, actions: [{ label, to: node }] } | { id, pay: [u1,u2], path: 'E,A' }
     Nature nodes: { player: 'Nature', actions: [{ label, prob, to }] } */
  function treeFigure(host, spec) {
    var terminals = [], decisions = [];
    (function walk(n, depth, path) {
      n.depth = depth; n.path = path;
      if (n.pay) { terminals.push(n); return; }
      decisions.push(n);
      n.actions.forEach(function (a) { walk(a.to, depth + 1, path.concat(a.label)); });
    })(spec.root, 0, []);
    var orig = terminals.map(function (t) { return t.pay.slice(); });
    var maxDepth = Math.max.apply(null, terminals.map(function (t) { return t.depth; }));

    // Backward-induction order: deepest decision nodes first, left to right.
    var order = decisions.filter(function (d) { return d.player !== 'Nature'; })
      .sort(function (a, b) { return b.depth - a.depth; });
    var solvable = !spec.infosets || spec.infosets.length === 0;
    var nSteps = solvable ? order.length : 0;
    var step = spec.solved ? nSteps : (spec.step || 0);

    function solve() {
      // value(n) = payoff vector reached under backward induction below n
      function val(n) {
        if (n.pay) return n.pay;
        if (n.player === 'Nature') {
          var acc = spec.players.map(function () { return 0; });
          n.actions.forEach(function (a) { var v = val(a.to); for (var i = 0; i < acc.length; i++) acc[i] += a.prob * v[i]; });
          return acc;
        }
        var pi = spec.players.indexOf(n.player), best = null, bestA = null;
        n.actions.forEach(function (a) { var v = val(a.to); if (best === null || v[pi] > best[pi]) { best = v; bestA = a; } });
        n.best = bestA; n.value = best;
        return best;
      }
      val(spec.root);
    }

    var W = spec.width || 560, H = spec.height || 300;
    var api = widget(host, {
      width: W, height: H, alt: spec.alt,
      controls: [],
      draw: function (svg, params, api) {
        solve();
        var solvedSet = {};
        for (var i = 0; i < step; i++) solvedSet[order[i].id] = true;
        var g = svgEl('g', {}, svg);
        // positions: leaves evenly spaced; parents centred over children
        var leafGap = (W - 140) / Math.max(terminals.length - 1, 1), li = 0;
        var levelH = (H - 60) / Math.max(maxDepth, 1);
        (function pos(n) {
          if (n.pay) { n.x = 70 + (terminals.length === 1 ? (W - 140) / 2 : leafGap * li++); }
          else { n.actions.forEach(function (a) { pos(a.to); }); n.x = (n.actions[0].to.x + n.actions[n.actions.length - 1].to.x) / 2; }
          n.y = 28 + n.depth * levelH;
        })(spec.root);

        // highlight: along the solved path from root, only through solved nodes
        var onPath = {};
        (function mark(n) {
          if (n.pay) return;
          if (n.player === 'Nature') { n.actions.forEach(function (a) { onPath[n.id + '>' + a.label] = true; mark(a.to); }); return; }
          if (!solvedSet[n.id]) return;
          onPath[n.id + '>' + n.best.label] = true; mark(n.best.to);
        })(spec.root);
        var fullPath = {};
        if (step === nSteps && nSteps > 0) (function mk(n) { if (n.pay) return; if (n.player === 'Nature') { n.actions.forEach(function (a) { mk(a.to); }); return; } fullPath[n.id + '>' + n.best.label] = true; mk(n.best.to); })(spec.root);

        // edges
        decisions.forEach(function (n) {
          n.actions.forEach(function (a) {
            var chosen = solvedSet[n.id] && n.best === a;
            var hot = chosen || (n.player === 'Nature' && step > 0 && false);
            svgEl('line', { x1: n.x, y1: n.y, x2: a.to.x, y2: a.to.y, stroke: chosen ? C.blue : C.ink2, 'stroke-width': chosen ? 3 : 1.3, 'stroke-linecap': 'round', opacity: (solvedSet[n.id] && !chosen) ? 0.45 : 1 }, g);
            var mx = (n.x + a.to.x) / 2, my = (n.y + a.to.y) / 2, left = a.to.x < n.x;
            var lab = a.label + (a.prob !== undefined ? '' : '');
            if (a.prob !== undefined) text(g, mx + (left ? -8 : 8), my - 4, fmtProb(a.prob), { anchor: left ? 'end' : 'start', size: 11, color: C.ink2 });
            text(g, mx + (left ? -8 : 8), my + (a.prob !== undefined ? 10 : 4), lab, { anchor: left ? 'end' : 'start', size: 12, color: chosen ? C.blue : C.ink, italic: true, halo: true });
          });
        });
        // information sets (dashed arcs)
        (spec.infosets || []).forEach(function (ids) {
          var nodes = ids.map(function (id) { return decisions.filter(function (d) { return d.id === id; })[0]; });
          for (var i = 0; i < nodes.length - 1; i++) {
            var a = nodes[i], b = nodes[i + 1], bend = (b.x - a.x) * 0.18;
            svgEl('path', { d: 'M' + a.x + ',' + a.y + ' Q' + ((a.x + b.x) / 2) + ',' + (a.y - bend) + ' ' + b.x + ',' + b.y, fill: 'none', stroke: C.ink, 'stroke-dasharray': '5 4', 'stroke-width': 1.2 }, g);
          }
        });
        // nodes
        decisions.forEach(function (n) {
          var isNature = n.player === 'Nature';
          svgEl('circle', { cx: n.x, cy: n.y, r: isNature ? 6 : 5, fill: isNature ? '#fff' : (solvedSet[n.id] ? C.blue : C.ink), stroke: isNature ? C.ink2 : (solvedSet[n.id] ? C.blue : C.ink), 'stroke-width': 1.5 }, g);
          var right = n.actions[0].to.x >= n.x - 1 || n.labelSide === 'right';
          var lx = n.labelSide === 'left' ? n.x - 10 : n.x + 10, anchor = n.labelSide === 'left' ? 'end' : 'start';
          if (n.labelSide === 'top') { lx = n.x; anchor = 'middle'; }
          text(g, lx, n.labelSide === 'top' ? n.y - 10 : n.y + 4, n.player, { anchor: anchor, size: 12, bold: !isNature, italic: isNature, halo: true });
          if (solvedSet[n.id] && n.value) {
            var vs = '(' + n.value.map(function (v) { return fmt(v); }).join(', ') + ')';
            if (n.labelSide === 'top') text(g, n.x + 8 + 4 * n.player.length, n.y - 10, vs, { size: 11, color: C.blue, halo: true });
            else text(g, n.labelSide === 'left' ? n.x + 10 : n.x - 10, n.y + 4, vs, { anchor: n.labelSide === 'left' ? 'start' : 'end', size: 11, color: C.blue, halo: true });
          }
        });
        terminals.forEach(function (t) {
          var onEq = step === nSteps && nSteps > 0 && isOutcome(t);
          svgEl('circle', { cx: t.x, cy: t.y, r: 4, fill: onEq ? C.blue : '#fff', stroke: onEq ? C.blue : C.ink, 'stroke-width': 1.4 }, g);
          text(g, t.x, t.y + 18, '(' + t.pay.map(function (v) { return fmt(v); }).join(', ') + ')', { anchor: 'middle', size: 12, color: onEq ? C.blue : C.ink, halo: true });
        });
        function isOutcome(t) {
          var n = spec.root;
          while (!n.pay) { if (n.player === 'Nature') return false; n = n.best.to; }
          return n === t;
        }

        // readout
        var r = api.readout;
        if (solvable && nSteps) {
          if (step === 0) note(api, 'Press <b>Next step</b> to apply backward induction one decision node at a time, or edit the payoffs below and watch the solution change.');
          else {
            var n = order[step - 1], pi = spec.players.indexOf(n.player);
            var opts = n.actions.map(function (a) { var v = (a.to.pay || a.to.value); return '<i>' + a.label + '</i> gives ' + fmt(v[pi]); }).join(', ');
            note(api, '<b>Step ' + step + ' of ' + nSteps + '.</b> ' + n.player + (n.path.length ? ' after ' + n.path.join(' → ') : ' at the root') + ' compares ' + opts + ', so chooses <b>' + n.best.label + '</b>.');
            if (step === nSteps) {
              var strat = order.slice().sort(function (a, b) { return a.depth - b.depth; }).map(function (d) { return d.player + ': ' + d.best.label + (d.path.length ? ' (after ' + d.path.join(' → ') + ')' : ''); }).join('; ');
              note(api, '<b>Backward-induction solution:</b> ' + strat + '. Outcome ' + '(' + spec.root.value.map(function (v) { return fmt(v); }).join(', ') + ').');
            }
          }
        }
        if (spec.readout) spec.readout(api, { decisions: decisions, terminals: terminals });
      }
    });

    // Step controls and payoff editor
    var bar = htmlEl('div', { 'class': 'ifig-steps' }, api.wrap);
    api.wrap.insertBefore(bar, api.ctrl);
    if (solvable && nSteps) {
      var prev = htmlEl('button', { type: 'button', 'class': 'ifig-btn', text: '← Previous' }, bar);
      var next = htmlEl('button', { type: 'button', 'class': 'ifig-btn ifig-btn--primary', text: 'Next step →' }, bar);
      var all = htmlEl('button', { type: 'button', 'class': 'ifig-btn', text: 'Solve all' }, bar);
      var clr = htmlEl('button', { type: 'button', 'class': 'ifig-btn', text: 'Clear' }, bar);
      function upd() { prev.disabled = step === 0; next.disabled = step === nSteps; all.disabled = step === nSteps; clr.disabled = step === 0; api.redraw(); }
      prev.addEventListener('click', function () { step = Math.max(0, step - 1); upd(); });
      next.addEventListener('click', function () { step = Math.min(nSteps, step + 1); upd(); });
      all.addEventListener('click', function () { step = nSteps; upd(); });
      clr.addEventListener('click', function () { step = 0; upd(); });
      upd();
    }
    if (spec.editable !== false) {
      var det = htmlEl('details', { 'class': 'ifig-payoffs' }, api.wrap);
      htmlEl('summary', { text: 'Edit payoffs (' + spec.players.join(', ') + ')' }, det);
      var tbl = htmlEl('table', {}, det);
      var thead = htmlEl('tr', {}, tbl); htmlEl('th', { text: 'Path' }, thead);
      spec.players.forEach(function (p) { htmlEl('th', { text: p }, thead); });
      terminals.forEach(function (t, ti) {
        var tr = htmlEl('tr', {}, tbl); htmlEl('td', { text: t.path.join(' → ') }, tr);
        t.pay.forEach(function (v, pi) {
          var td = htmlEl('td', {}, tr);
          var inp = htmlEl('input', { type: 'number', step: 1, value: v, 'aria-label': spec.players[pi] + ' payoff after ' + t.path.join(', ') }, td);
          inp.addEventListener('input', function () { var x = parseFloat(inp.value); if (isFinite(x)) { t.pay[pi] = x; api.redraw(); } });
          t.inputs = t.inputs || []; t.inputs[pi] = inp;
        });
      });
      var rb = htmlEl('button', { type: 'button', 'class': 'ifig-reset', text: 'Restore original payoffs' }, det);
      rb.addEventListener('click', function () { terminals.forEach(function (t, i) { t.pay = orig[i].slice(); t.inputs.forEach(function (inp, pi) { inp.value = t.pay[pi]; }); }); api.redraw(); });
    }
    return api;
  }
  function fmtProb(p) { if (Math.abs(p - 0.5) < 1e-9) return '½'; if (Math.abs(p - 1 / 3) < 1e-9) return '⅓'; if (Math.abs(p - 2 / 3) < 1e-9) return '⅔'; return fmt(p); }

  /* Tree specs ---------------------------------------------------------- */
  function T(id, player, actions, side) { return { id: id, player: player, actions: actions, labelSide: side }; }
  function A(label, to, prob) { return { label: label, to: to, prob: prob }; }
  function P(id, pay) { return { id: id, pay: pay }; }

  function entryTree(extended) {
    var fight = extended
      ? T('e2', 'Entrant', [A('Persist', P('t3', [-2, -1])), A('Exit', P('t4', [-1, 2]))])
      : P('t2', [-1, 0]);
    return {
      players: ['Entrant', 'Incumbent'],
      root: T('root', 'Entrant', [
        A('Enter', T('inc', 'Incumbent', [A('Accommodate', P('t1', [2, 1])), A('Fight', fight)])),
        A('Stay Out', P('t0', [0, 3]))
      ], 'top')
    };
  }
  function investTree() {
    return {
      players: ['Firm A', 'Firm B'],
      root: T('root', 'Firm A', [
        A('Invest', T('bI', 'Firm B', [
          A('Enter', T('aIE', 'Firm A', [A('High', P('t1', [3, 2])), A('Low', P('t2', [5, -1]))])),
          A('Stay Out', P('t3', [4, 0]))], 'left')),
        A('Not Invest', T('bN', 'Firm B', [
          A('Enter', T('aNE', 'Firm A', [A('High', P('t4', [2, 3])), A('Low', P('t5', [1, 1]))])),
          A('Stay Out', P('t6', [6, 0]))]))
      ], 'top')
    };
  }

  var FIGS = {};

  FIGS.tree01 = function (host) { treeFigure(host, Object.assign(entryTree(false), { alt: 'Market Entry Game tree', height: 260 })); };
  FIGS.tree03 = function (host) { treeFigure(host, Object.assign(entryTree(true), { alt: 'Extended Market Entry Game tree', height: 320 })); };
  FIGS.tree04 = function (host) {
    // reduced tree after step 1: Incumbent's node replaced by (2,1)
    var s = { players: ['Entrant', 'Incumbent'], alt: 'Reduced Market Entry Game', height: 200,
      root: T('root', 'Entrant', [A('Enter', P('t1', [2, 1])), A('Stay Out', P('t0', [0, 3]))], 'top') };
    treeFigure(host, s);
  };
  FIGS.tree05 = function (host) { treeFigure(host, Object.assign(entryTree(true), { alt: 'Extended Market Entry Game, solved', height: 320, solved: true })); };
  FIGS.tree06 = function (host) { treeFigure(host, Object.assign(investTree(), { alt: 'Investment Game tree', height: 330 })); };
  FIGS.tree07 = function (host) { treeFigure(host, Object.assign(investTree(), { alt: 'Investment Game tree, solved', height: 330, solved: true })); };

  FIGS.tree02 = function (host) {
    // simultaneous version: Incumbent's two nodes in one information set
    var s = {
      players: ['Entrant', 'Incumbent'], alt: 'Simultaneous Market Entry Game in extensive form', height: 270,
      root: T('root', 'Entrant', [
        A('Enter', T('i1', 'Incumbent', [A('Accommodate', P('t1', [2, 1])), A('Fight', P('t2', [-1, 0]))], 'left')),
        A('Stay Out', T('i2', 'Incumbent', [A('Accommodate', P('t3', [0, 3])), A('Fight', P('t4', [0, 3]))]))
      ], 'top'),
      infosets: [['i1', 'i2']], editable: false,
      readout: function (api) {
        note(api, 'The dashed line joins the Incumbent\'s two decision nodes into one <b>information set</b>: when it moves it does not know whether the Entrant chose Enter or Stay Out, so it must pick the same action at both nodes. Backward induction cannot be applied node by node here; the game is strategically the simultaneous-move game.');
      }
    };
    treeFigure(host, s);
  };

  FIGS['w9-fig01'] = function (host) {
    var pL = 0.5;
    var s = {
      players: ['Incumbent', 'Entrant'], alt: 'Sequential entry with cost uncertainty', height: 330, width: 600,
      root: { id: 'nat', player: 'Nature', labelSide: 'top', actions: [
        A('Low cost', T('IL', 'I', [
          A('F', T('e1', '2', [A('E', P('a', [1, -2])), A('S', P('b', [3, 0]))], 'left')),
          A('A', T('e2', '2', [A('E', P('c', [2, -1])), A('S', P('d', [4, 0]))], 'left'))], 'left'), pL),
        A('High cost', T('IH', 'I', [
          A('F', T('e3', '2', [A('E', P('e', [-2, -1])), A('S', P('f', [0, 0]))])),
          A('A', T('e4', '2', [A('E', P('g', [1, 2])), A('S', P('h', [3, 0]))]))]), 1 - pL)
      ] },
      infosets: [['e1', 'e3'], ['e2', 'e4']],
      readout: function (api, t) {
        var p = api.params.p === undefined ? 0.5 : api.params.p;
        function pay(id) { return t.terminals.filter(function (x) { return x.id === id; })[0].pay[1]; }
        var eF = p * pay('a') + (1 - p) * pay('e'), eA = p * pay('c') + (1 - p) * pay('g');
        note(api, 'The two dashed arcs are the Entrant\'s information sets: it sees the Incumbent\'s action but not its cost. If both cost types play the same action, the Entrant keeps its prior Pr(Low) = ' + fmt(p) + '.');
        note(api, 'After <i>F</i>: entering pays ' + fmt(p) + '·(' + fmt(pay('a')) + ') + ' + fmt(1 - p) + '·(' + fmt(pay('e')) + ') = <b>' + fmt(eF) + '</b> against 0 from staying out → ' + (eF > 0 ? 'Enter' : 'Stay out') + '. After <i>A</i>: ' + fmt(p) + '·(' + fmt(pay('c')) + ') + ' + fmt(1 - p) + '·(' + fmt(pay('g')) + ') = <b>' + fmt(eA) + '</b> → ' + (eA > 0 ? 'Enter' : 'Stay out') + '.');
      }
    };
    var api = treeFigure(host, s);
    // add a prior slider via a tiny secondary widget control
    var lab = htmlEl('label', { 'class': 'ifig-ctl' }, api.ctrl);
    var head = htmlEl('span', { 'class': 'ifig-ctl__label', html: 'Prior Pr(Low cost)' }, lab);
    var out = htmlEl('output', { 'class': 'ifig-ctl__val', text: '0.5' }, head);
    var inp = htmlEl('input', { type: 'range', min: 0.05, max: 0.95, step: 0.05, value: 0.5 }, lab);
    api.params.p = 0.5;
    inp.addEventListener('input', function () {
      api.params.p = +inp.value; out.textContent = fmt(api.params.p);
      s.root.actions[0].prob = api.params.p; s.root.actions[1].prob = 1 - api.params.p; api.redraw();
    });
  };

  /* ================================================ screening (ch. 3) */
  var SCR = [
    { id: 'tH', label: 'θ<sub>H</sub> (high type)', min: 2.5, max: 6, step: 0.1, value: 4 },
    { id: 'tL', label: 'θ<sub>L</sub> (low type)', min: 0.5, max: 4, step: 0.1, value: 2 }
  ];
  function screenParams(p) { if (p.tL >= p.tH) p.tL = p.tH - 0.1; return p; }

  FIGS['w11-fig01'] = function (host) {
    widget(host, {
      alt: 'Gross valuation lines', height: 300, controls: SCR,
      draw: function (svg, p, api) {
        api.limit('tL', 0.5, p.tH - 0.1); screenParams(p);
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 3], y: [0, 12] }).axes('Quality q', 'Gross valuation θ·q');
        pl.curve(function (q) { return p.tH * q; }, 0, 3, { stroke: C.blue });
        pl.curve(function (q) { return p.tL * q; }, 0, 3, { stroke: C.red });
        var qH = Math.min(3, 11 / p.tH), qL = Math.min(3, 11 / p.tL);
        pl.label(qH, p.tH * qH, 'θ_H·q  (slope θ_H = ' + fmt(p.tH) + ')', { color: C.blue, dx: -6, dy: -8, anchor: 'end' });
        pl.label(qL, p.tL * qL, 'θ_L·q  (slope θ_L = ' + fmt(p.tL) + ')', { color: C.red, dx: -6, dy: 16, anchor: 'end' });
        note(api, 'Both lines pass through the origin. At any quality q the high type values the good ' + fmt(p.tH / p.tL) + '× as much as the low type; the gap θ_H − θ_L = ' + fmt(p.tH - p.tL) + ' per unit of quality is what the monopolist can try to extract.');
      }
    });
  };

  FIGS['w11-fig02'] = function (host) {
    widget(host, {
      alt: 'Valuations of the damaged and original goods', height: 320,
      controls: [SCR[0], SCR[1], { id: 'qT', label: 'q<sub>T</sub> (original)', min: 1, max: 3, step: 0.1, value: 2 }, { id: 'qB', label: 'q<sub>B</sub> (damaged)', min: 0.2, max: 2.9, step: 0.1, value: 1 }],
      draw: function (svg, p, api) {
        api.limit('tL', 0.5, p.tH - 0.1); api.limit('qB', 0.2, p.qT - 0.1); screenParams(p);
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 3.2], y: [0, 13], margin: { l: 64, r: 24, t: 20, b: 44 } }).axes('Quality q', 'Gross valuation');
        pl.curve(function (q) { return p.tH * q; }, 0, 3.2, { stroke: C.blue });
        pl.curve(function (q) { return p.tL * q; }, 0, 3.2, { stroke: C.red });
        [['qB', C.ink2], ['qT', C.ink2]].forEach(function (k) {
          var q = p[k[0]];
          pl.seg(q, 0, q, p.tH * q, { 'stroke-dasharray': '2 3' });
          pl.tick('x', q, k[0] === 'qB' ? 'q_B' : 'q_T');
          pl.dot(q, p.tH * q, C.blue); pl.dot(q, p.tL * q, C.red);
          pl.guide(q, p.tH * q, { noX: true }); pl.guide(q, p.tL * q, { noX: true });
          pl.tick('y', p.tH * q, 'θ_H' + (k[0] === 'qB' ? 'q_B' : 'q_T') + ' = ' + fmt(p.tH * q), C.blue);
          pl.tick('y', p.tL * q, 'θ_L' + (k[0] === 'qB' ? 'q_B' : 'q_T') + ' = ' + fmt(p.tL * q), C.red);
        });
        pl.label(3.1, p.tH * 3.1, 'θ_H·q', { color: C.blue, anchor: 'end', dy: -6 });
        pl.label(3.1, p.tL * 3.1, 'θ_L·q', { color: C.red, anchor: 'end', dy: 16 });
        note(api, 'The high type\'s extra willingness to pay for the original over the damaged good is θ_H(q_T − q_B) = ' + fmt(p.tH * (p.qT - p.qB)) + '; the low type\'s is θ_L(q_T − q_B) = ' + fmt(p.tL * (p.qT - p.qB)) + '. The difference, (θ_H − θ_L)(q_T − q_B) = ' + fmt((p.tH - p.tL) * (p.qT - p.qB)) + ', is why a damaged good can separate the types.');
      }
    });
  };

  FIGS['w11-fig03'] = function (host) {
    widget(host, {
      alt: 'Profit from pooling, exclusion and screening against the share of high types', height: 340, width: 600,
      controls: [SCR[0], SCR[1],
        { id: 'qT', label: 'q<sub>T</sub>', min: 1, max: 3, step: 0.1, value: 2 }, { id: 'qB', label: 'q<sub>B</sub>', min: 0.2, max: 2.9, step: 0.1, value: 1 },
        { id: 'cB', label: 'c<sub>B</sub> − c<sub>T</sub> (cost of the damaged good relative to the original)', min: -1.5, max: 2, step: 0.1, value: -1 },
        { id: 'lam', label: 'λ (share of H-types)', min: 0, max: 1, step: 0.01, value: 0.4 }],
      draw: function (svg, p, api) {
        api.limit('tL', 0.5, p.tH - 0.1); api.limit('qB', 0.2, p.qT - 0.1); screenParams(p);
        var cT = 0, cB = p.cB;
        var pool = p.tL * p.qT - cT;
        var excl = function (l) { return l * (p.tH * p.qT - cT); };
        var scr = function (l) { return l * (p.tH * p.qT - (p.tH - p.tL) * p.qB - cT) + (1 - l) * (p.tL * p.qB - cB); };
        var l1 = (p.tL * (p.qT - p.qB) + cB - cT) / (p.tH * (p.qT - p.qB) + cB - cT);
        var l2 = (p.tL * p.qB - cB) / (p.tH * p.qB - cB);
        var ymax = Math.max(excl(1), pool, scr(1), 1) * 1.12, ymin = Math.min(0, scr(0)) - 0.5;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 1.08], y: [ymin, ymax], margin: { l: 70, r: 30, t: 20, b: 48 } }).axes('λ (share of H-types)', 'Profit per consumer');
        pl.tick('x', 1, '1');
        pl.curve(function () { return pool; }, 0, 1, { stroke: C.blue });
        pl.curve(excl, 0, 1, { stroke: C.red });
        pl.curve(scr, 0, 1, { stroke: C.green });
        pl.label(1, pool, 'π^{Pool}', { color: C.blue, dx: 6, dy: 4 });
        pl.label(1, excl(1), 'π^{Excl}', { color: C.red, dx: 6, dy: 4 });
        pl.label(1, scr(1), 'π^{S}', { color: C.green, dx: 6, dy: 4 });
        pl.tick('y', pool, 'θ_L q_T − c_T', C.blue);
        pl.tick('y', scr(0), 'θ_L q_B − c_B', C.green);
        var window = l1 < l2 && l2 > 0 && l1 < 1;
        if (window) {
          var a = clamp(l1, 0, 1), b = clamp(l2, 0, 1);
          pl.band(function () { return ymin; }, function () { return ymax; }, a, b, C.greenFill);
          pl.seg(a, ymin, a, scr(a), { 'stroke-dasharray': '3 3' }); pl.seg(b, ymin, b, scr(b), { 'stroke-dasharray': '3 3' });
          pl.tick('x', a, 'λ_1 = ' + fmt(a)); pl.tick('x', b, 'λ_2 = ' + fmt(b));
          pl.label((a + b) / 2, ymax, 'Screening', { color: C.green, anchor: 'middle', dy: 14, size: 11.5 });
        }
        // current λ marker
        var l = p.lam, vals = { Pooling: pool, Exclusion: excl(l), Screening: scr(l) };
        var best = Object.keys(vals).sort(function (a, b) { return vals[b] - vals[a]; })[0];
        pl.seg(l, ymin, l, ymax, { stroke: C.orange, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' });
        pl.dot(l, vals[best], C.orange, 5);
        pl.label(l, ymax, 'λ = ' + fmt(l), { color: C.orange, anchor: l > 0.85 ? 'end' : 'start', dx: l > 0.85 ? -4 : 4, dy: 28, size: 11 });
        note(api, 'At λ = ' + fmt(l) + ': π<sup>Pool</sup> = ' + fmt(pool) + ', π<sup>Excl</sup> = ' + fmt(excl(l)) + ', π<sup>S</sup> = ' + fmt(scr(l)) + ' → the monopolist chooses <b>' + best.toLowerCase() + '</b>.'
          + (window ? ' Screening window: ' + fmt(l1) + ' ≤ λ ≤ ' + fmt(l2) + '.' : ' With these parameters the screening window is empty: the damaged good is never introduced.')
          + ' The window is non-empty only when the damaged good is <em>cheaper</em> to make (c_B < c_T); with c_B ≥ c_T the lower bound λ_1 is at least θ_L/θ_H = ' + fmt(p.tL / p.tH) + ' and the upper bound λ_2 at most that, so screening never strictly beats both alternatives.');
      }
    });
  };

  FIGS['w11-fig04'] = function (host) {
    widget(host, {
      alt: 'Quality-price space with the separating menu', height: 340, width: 600,
      controls: [SCR[0], SCR[1], { id: 'qT', label: 'q<sub>T</sub>', min: 1, max: 3, step: 0.1, value: 2 }, { id: 'qB', label: 'q<sub>B</sub> (distortion)', min: 0.1, max: 2.9, step: 0.05, value: 1 }],
      draw: function (svg, p, api) {
        api.limit('tL', 0.5, p.tH - 0.1); api.limit('qB', 0.1, p.qT - 0.1); screenParams(p);
        var UH = (p.tH - p.tL) * p.qB;
        var pH = p.tH * p.qT - UH, pB = p.tL * p.qB, pFB = p.tL * p.qT;
        var xmax = p.qT * 1.35, ymax = Math.max(p.tH * xmax - UH, 1) * 1.05;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, xmax], y: [-ymax * 0.16, ymax], margin: { l: 56, r: 30, t: 20, b: 50 } }).axes('Quality q', 'Price p');
        // welfare-loss region: between L's line and p = pB, from qB to qT
        pl.band(function () { return pB; }, function (q) { return p.tL * q; }, p.qB, p.qT, C.redFill);
        pl.curve(function (q) { return p.tH * q - UH; }, 0, xmax, { stroke: C.blue });
        pl.curve(function (q) { return p.tL * q; }, 0, xmax, { stroke: C.red });
        pl.guide(p.qB, pB); pl.guide(p.qT, pH); pl.guide(p.qT, pFB, { noX: true });
        pl.dot(p.qB, pB, C.red); pl.label(p.qB, pB, 'L*', { color: C.red, dx: 6, dy: 16, bold: true });
        pl.dot(p.qT, pH, C.blue); pl.label(p.qT, pH, 'H*', { color: C.blue, dx: -8, dy: -8, anchor: 'end', bold: true });
        pl.dot(p.qT, pFB, C.red, 3.5); pl.label(p.qT, pFB, 'L^{FB}', { color: C.red, dx: 6, dy: 4, size: 11 });
        pl.tick('x', p.qB, 'q_B'); pl.tick('x', p.qT, 'q_T');
        pl.tick('y', pH, 'p_H = ' + fmt(pH), C.blue); pl.tick('y', pB, 'p_B = ' + fmt(pB), C.red);
        pl.label(xmax, p.tH * xmax - UH, 'H-type IC (slope θ_H)', { color: C.blue, anchor: 'end', dx: -4, dy: -6, size: 11.5 });
        pl.label(xmax, p.tL * xmax, 'L-type IC (slope θ_L)', { color: C.red, anchor: 'end', dx: -4, dy: 16, size: 11.5 });
        pl.arrow(p.qT * 1.04, pB, p.qT * 1.04, pFB, C.orange); pl.arrow(p.qT * 1.04, pFB, p.qT * 1.04, pB, C.orange);
        pl.label(p.qT * 1.06, (pB + pFB) / 2, 'value loss θ_L(q_T − q_B) = ' + fmt(p.tL * (p.qT - p.qB)), { color: C.orange, size: 11, dy: 4 });
        var ga = { stroke: C.green, 'stroke-width': 1.2 };
        var yq = -ymax * 0.12;
        pl.arrow(p.qB, yq, p.qT, yq, C.green, ga); pl.arrow(p.qT, yq, p.qB, yq, C.green, ga);
        pl.label((p.qB + p.qT) / 2, yq, 'quality distortion q_T − q_B = ' + fmt(p.qT - p.qB), { anchor: 'middle', dy: -4, size: 10.5, color: C.green });
        note(api, 'The high type gets efficient quality q_T at p_H = θ_H q_T − (θ_H − θ_L) q_B = ' + fmt(pH) + ' and keeps the information rent (θ_H − θ_L) q_B = <b>' + fmt(UH) + '</b>. The low type gets q_B at p_B = θ_L q_B = ' + fmt(pB) + ' with zero surplus. Lowering q_B cuts the rent but enlarges the shaded value loss.');
      }
    });
  };

  /* ================================================== cheap talk (ch. 3) */
  function bounds(N, b) { var t = []; for (var j = 0; j <= N; j++) t.push(j / N + 2 * b * j * (j - N)); return t; }
  function Nstar(b) { if (b <= 0) return Infinity; return Math.max(1, Math.floor(0.5 + Math.sqrt(0.25 + 1 / (2 * b)) - 1e-9)); }
  function nOK(N, b) { return b < 1 / (2 * N * (N - 1)) - 1e-12; }
  var BIAS = { id: 'b', label: 'Bias b', min: 0, max: 0.3, step: 0.005, value: 0.125, fmt: function (v) { return fmt(v, 3); } };

  function partitionDraw(svg, api, N, b, opts) {
    opts = opts || {};
    var th = bounds(N, b), W = api.W, L = 50, R = W - 50, barY = 48, barH = 26, axY = 150;
    var g = svgEl('g', {}, svg);
    function sx(t) { return L + t * (R - L); }
    text(g, L - 8, barY + 17, 'θ:', { anchor: 'end', italic: true });
    var shades = ['#d6e5fb', '#aac6f4', '#7fa7ec', '#5a8be0', '#3d72cf', '#2b5cb4'];
    for (var j = 1; j <= N; j++) {
      var x0 = sx(th[j - 1]), x1 = sx(th[j]);
      svgEl('rect', { x: x0, y: barY, width: x1 - x0, height: barH, fill: shades[Math.min(j - 1, shades.length - 1)], stroke: C.ink, 'stroke-width': 1 }, g);
      if (x1 - x0 > 46) text(g, (x0 + x1) / 2, barY + 17, opts.names ? opts.names[j - 1] : 'Send m_' + j, { anchor: 'middle', size: 11, color: j > 3 ? '#fff' : C.ink });
    }
    for (var k = 0; k <= N; k++) {
      var lbl = k === 0 ? '0 = θ_0' : (k === N ? 'θ_' + N + ' = 1' : 'θ_' + k + ' = ' + fmt(th[k], 3));
      text(g, sx(th[k]), barY + barH + 14, lbl, { anchor: k === 0 ? 'start' : (k === N ? 'end' : 'middle'), size: 10.5, color: C.ink2 });
    }
    // action axis
    var arrow = ensureMarker(svg, C.axis);
    svgEl('line', { x1: L - 10, y1: axY, x2: R + 20, y2: axY, stroke: C.axis, 'marker-end': arrow }, g);
    text(g, R + 22, axY + 4, 'action a', { size: 11.5, italic: true });
    var acts = [];
    for (var j2 = 1; j2 <= N; j2++) {
      var a = (th[j2 - 1] + th[j2]) / 2; acts.push(a);
      var ga = ensureMarker(svg, C.grey);
      svgEl('line', { x1: sx(a), y1: barY + barH + 20, x2: sx(a), y2: axY - 8, stroke: C.grey, 'stroke-width': 1.2, 'marker-end': ga }, g);
      svgEl('circle', { cx: sx(a), cy: axY, r: 4.5, fill: C.ink }, g);
      text(g, sx(a), axY + 18, 'a_' + j2 + ' = ' + fmt(a, 3), { anchor: 'middle', size: 10.5 });
    }
    // widths brackets
    if (opts.widths !== false) {
      var by = axY + 40, oa = ensureMarker(svg, C.orange);
      for (var j3 = 1; j3 <= N; j3++) {
        var x0b = sx(th[j3 - 1]) + 3, x1b = sx(th[j3]) - 3;
        if (x1b - x0b < 12) continue;
        svgEl('line', { x1: x0b, y1: by, x2: x1b, y2: by, stroke: C.orange, 'marker-end': oa, 'marker-start': oa }, g);
        text(g, (x0b + x1b) / 2, by + 14, 'width ' + fmt(th[j3] - th[j3 - 1], 3), { anchor: 'middle', size: 10.5, color: C.orange });
      }
    }
    return { th: th, acts: acts, sx: sx, g: g, axY: axY, barY: barY, barH: barH };
  }

  FIGS['w11-fig06'] = function (host) {
    widget(host, {
      alt: 'Posterior belief after a message', height: 260,
      controls: [{ id: 'lo', label: 'θ<sub>j−1</sub>', min: 0, max: 0.95, step: 0.01, value: 0.3 }, { id: 'hi', label: 'θ<sub>j</sub>', min: 0.05, max: 1, step: 0.01, value: 0.7 }],
      draw: function (svg, p, api) {
        api.limit('hi', p.lo + 0.05, 1);
        var lo = p.lo, hi = Math.max(p.hi, lo + 0.05), dens = 1 / (hi - lo), a = (lo + hi) / 2;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 1.08], y: [0, Math.max(dens * 1.25, 2.5)], margin: { l: 56, r: 24, t: 28, b: 44 } }).axes('θ', 'density');
        pl.poly([[lo, 0], [lo, dens], [hi, dens], [hi, 0]], { fill: C.blueFill, stroke: C.blue, 'stroke-width': 1.8 });
        pl.seg(a, 0, a, dens, { stroke: C.red, 'stroke-dasharray': '4 3', 'stroke-width': 1.4 });
        pl.dot(a, 0, C.red);
        pl.tick('x', lo, 'θ_{j−1} = ' + fmt(lo)); pl.tick('x', hi, 'θ_j = ' + fmt(hi)); pl.tick('x', 1, '1');
        pl.tick('y', dens, '1/(θ_j − θ_{j−1}) = ' + fmt(dens), C.blue);
        pl.label(a, dens, 'Posterior μ(θ | m_j) = U[θ_{j−1}, θ_j]', { anchor: 'middle', dy: -8, size: 11.5, color: C.blue });
        pl.label(a, dens * 1.25 > 2.5 ? dens * 1.25 : 2.5, 'a_j = E[θ | m_j] = (θ_{j−1} + θ_j)/2 = ' + fmt(a, 3), { anchor: 'middle', dy: 2, size: 12, color: C.red });
        note(api, 'Hearing m_j, the receiver only learns that θ lies in the cell; the prior U[0,1] updates to a uniform density of height ' + fmt(dens) + ' on it. With quadratic loss the optimal action is the posterior mean, the cell midpoint ' + fmt(a, 3) + '.');
      }
    });
  };

  FIGS['w11-fig07'] = function (host) {
    widget(host, {
      alt: 'Incentive compatibility at a boundary', height: 170,
      controls: [{ id: 'b', label: 'Bias b (two-step equilibrium)', min: 0, max: 0.24, step: 0.005, value: 0.125, fmt: function (v) { return fmt(v, 3); } }],
      draw: function (svg, p, api) {
        var b = p.b, th1 = 0.5 - 2 * b, a1 = th1 / 2, a2 = (th1 + 1) / 2, bliss = th1 + b;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [-0.05, 1.1], y: [0, 1], margin: { l: 30, r: 24, t: 20, b: 50 } });
        var y = 0.45, arrow = ensureMarker(svg, C.axis);
        pl.seg(-0.05, y, 1.05, y, { stroke: C.axis, 'marker-end': arrow, 'stroke-width': 1.2 });
        pl.label(1.06, y, 'Action a', { dy: 4, size: 11.5 });
        pl.dot(a1, y, C.blue, 6); pl.dot(a2, y, C.blue, 6); pl.dot(bliss, y, C.red, 6);
        pl.label(a1, y, 'a_1 = ' + fmt(a1, 3), { anchor: 'middle', dy: 22, color: C.blue, size: 11 });
        pl.label(a2, y, 'a_2 = ' + fmt(a2, 3), { anchor: 'middle', dy: 22, color: C.blue, size: 11 });
        pl.label(bliss, y, 'θ_1 + b = ' + fmt(bliss, 3) + ' (bliss point of the boundary type)', { anchor: 'middle', dy: -14, color: C.red, size: 11 });
        var ga = ensureMarker(svg, C.green), yy = 0.12;
        pl.seg(a1, yy, bliss, yy, { stroke: C.green, 'marker-end': ga, 'marker-start': ga }); pl.seg(bliss, yy, a2, yy, { stroke: C.green, 'marker-end': ga, 'marker-start': ga });
        pl.label((a1 + bliss) / 2, yy, 'equal', { anchor: 'middle', dy: 16, color: C.green, size: 11 }); pl.label((bliss + a2) / 2, yy, 'distance', { anchor: 'middle', dy: 16, color: C.green, size: 11 });
        note(api, 'With two steps the boundary is θ_1 = ½ − 2b = ' + fmt(th1, 3) + '. The boundary type\'s bliss point θ_1 + b = ' + fmt(bliss, 3) + ' sits exactly midway between a_1 = ' + fmt(a1, 3) + ' and a_2 = ' + fmt(a2, 3) + ', so that type is indifferent between the two messages; types just below prefer m_1, types just above prefer m_2.' + (b >= 0.25 ? ' At b ≥ ¼ the boundary would hit 0: only babbling survives.' : ''));
      }
    });
  };

  FIGS['w11-fig08'] = function (host) {
    widget(host, {
      alt: 'Maximum number of partition steps against bias', height: 320, width: 600,
      controls: [{ id: 'b', label: 'Bias b', min: 0.005, max: 0.3, step: 0.005, value: 0.1, fmt: function (v) { return fmt(v, 3); } }],
      draw: function (svg, p, api) {
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 0.31], y: [0, 6.5], margin: { l: 56, r: 24, t: 20, b: 50 } }).axes('Bias b', 'Max. steps N*(b)');
        for (var N = 1; N <= 6; N++) {
          var lo = N === 6 ? 0 : 1 / (2 * (N + 1) * N), hi = N === 1 ? 0.31 : 1 / (2 * N * (N - 1));
          pl.seg(lo, N, Math.min(hi, 0.31), N, { stroke: C.blue, 'stroke-width': 2.2 });
          if (N > 1) { pl.seg(hi, N, hi, N - 1, { stroke: C.blue, 'stroke-dasharray': '3 3' }); pl.tick('x', hi, N === 2 ? '1/4' : (N === 3 ? '1/12' : (N === 4 ? '1/24' : (N === 5 ? '1/40' : '')))); }
          pl.tick('y', N, N === 6 ? '≥ 6' : String(N));
        }
        pl.label(0.26, 1, 'Babbling only', { color: C.blue, anchor: 'middle', dy: -8, size: 11 });
        pl.label(0.16, 2, 'Binary ("low"/"high")', { color: C.blue, anchor: 'middle', dy: -8, size: 11 });
        pl.label(0.062, 3, '3 cells', { color: C.blue, dy: -8, size: 11 });
        var b = p.b, Ns = Nstar(b);
        pl.seg(b, 0, b, Math.min(Ns, 6), { stroke: C.orange, 'stroke-dasharray': '4 3', 'stroke-width': 1.3 });
        pl.dot(b, Math.min(Ns, 6), C.orange, 5.5);
        pl.label(b, Math.min(Ns, 6), 'N*(' + fmt(b, 3) + ') = ' + (Ns > 6 ? '≥ 6' : Ns), { color: C.orange, dx: 8, dy: 20, size: 11.5, halo: true });
        note(api, 'An N-step equilibrium exists iff b < 1/(2N(N−1)). At b = ' + fmt(b, 3) + ' the largest sustainable N is <b>' + (Ns > 6 ? '≥ 6' : Ns) + '</b>' + (Ns === 1 ? ': only babbling.' : '.') + ' Informativeness is strictly decreasing in bias.');
      }
    });
  };

  FIGS['w11-fig09'] = function (host) {
    widget(host, {
      alt: 'N-step partition equilibrium', height: 240, width: 600,
      controls: [{ id: 'N', label: 'Steps N', min: 2, max: 6, step: 1, value: 3, fmt: function (v) { return String(v); } }, { id: 'b', label: 'Bias b', min: 0, max: 0.24, step: 0.005, value: 1 / 24, fmt: function (v) { return fmt(v, 3); } }],
      draw: function (svg, p, api) {
        var Nmax = Math.min(6, Nstar(p.b)); api.limit('N', 2, Math.max(2, Nmax));
        var N = Math.min(p.N, Math.max(2, Nmax));
        var r = partitionDraw(svg, api, N, p.b);
        var ok = nOK(N, p.b);
        note(api, (ok ? 'Boundaries θ_j = j/N + 2b·j(j − N): ' : '<b>No ' + N + '-step equilibrium exists at this bias</b> (needs b < ' + fmt(1 / (2 * N * (N - 1)), 3) + '); the largest sustainable N is ' + Nstar(p.b) + '. Boundaries shown: ')
          + r.th.slice(1, -1).map(function (t, i) { return 'θ_' + (i + 1) + ' = ' + fmt(t, 3); }).join(', ') + '. Each cell is 4b = ' + fmt(4 * p.b, 3) + ' wider than the one below it, so types near the top are pooled more coarsely.');
      }
    });
  };

  FIGS['w11-fig10'] = function (host) {
    widget(host, {
      alt: 'Overshoot and undershoot within a cell', height: 250,
      controls: [{ id: 'w', label: 'Cell width d<sub>j</sub>', min: 0.1, max: 0.8, step: 0.01, value: 0.5 }, { id: 'b', label: 'Bias b', min: 0, max: 0.2, step: 0.005, value: 0.05, fmt: function (v) { return fmt(v, 3); } },
        { id: 'tl', label: 'Low type (position in cell)', min: 0, max: 1, step: 0.01, value: 0.15 }, { id: 'th', label: 'High type (position in cell)', min: 0, max: 1, step: 0.01, value: 0.85 }],
      draw: function (svg, p, api) {
        var lo = 0.2, hi = lo + p.w, a = (lo + hi) / 2, tL = lo + p.tl * p.w, tH = lo + p.th * p.w;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 1.15], y: [0, 1], margin: { l: 24, r: 24, t: 12, b: 30 } });
        var y = 0.32, arrow = ensureMarker(svg, C.axis);
        pl.poly([[lo, y - 0.1], [lo, y + 0.1], [hi, y + 0.1], [hi, y - 0.1]], { fill: C.blueFill, stroke: 'none' });
        pl.seg(0, y, 1.1, y, { stroke: C.axis, 'marker-end': arrow, 'stroke-width': 1.2 }); pl.label(1.11, y, 'θ', { dy: 4, italic: true });
        pl.seg(a, y - 0.12, a, 0.95, { stroke: C.red, 'stroke-dasharray': '4 3', 'stroke-width': 1.4 });
        pl.label(a, y, 'a_j = ' + fmt(a, 3) + ' (receiver\'s action)', { anchor: 'middle', dy: 26, color: C.red, size: 11 });
        pl.label(lo, y, 'θ_{j−1}', { anchor: 'middle', dy: 26, size: 11 }); pl.label(hi, y, 'θ_j', { anchor: 'middle', dy: 26, size: 11 });
        pl.dot(tL, y, C.green, 6); pl.dot(tH, y, C.orange, 6);
        pl.label(tL, y, 'Low type', { anchor: 'middle', dy: -34, color: C.green, size: 11 }); pl.label(tH, y, 'High type', { anchor: 'middle', dy: -34, color: C.orange, size: 11 });
        var bL = tL + p.b, bH = tH + p.b;
        pl.dot(bL, y, C.green, 3); pl.dot(bH, y, C.orange, 3);
        pl.label(tL, y, 'bliss ' + fmt(bL, 2), { anchor: 'middle', dy: -20, color: C.green, size: 10.5 }); pl.label(tH, y, 'bliss ' + fmt(bH, 2), { anchor: 'middle', dy: -20, color: C.orange, size: 10.5 });
        var ga = ensureMarker(svg, C.green), oa = ensureMarker(svg, C.orange);
        if (Math.abs(a - bL) > 0.01) { pl.seg(bL, 0.96, a, 0.96, { stroke: C.green, 'marker-end': ga, 'stroke-width': 1.4 }); pl.label(Math.min(bL, a), 0.96, (a > bL ? 'overshoot ' : 'undershoot ') + fmt(Math.abs(a - bL), 3), { anchor: 'end', dx: -6, dy: 4, color: C.green, size: 10.5 }); }
        if (Math.abs(a - bH) > 0.01) { pl.seg(bH, 0.82, a, 0.82, { stroke: C.orange, 'marker-end': oa, 'stroke-width': 1.4 }); pl.label(Math.max(bH, a), 0.82, (a > bH ? 'overshoot ' : 'undershoot ') + fmt(Math.abs(a - bH), 3), { anchor: 'start', dx: 6, dy: 4, color: C.orange, size: 10.5 }); }
        note(api, 'Every type in the cell induces the same action a_j = ' + fmt(a, 3) + '. For the low type the action ' + (a > bL ? 'overshoots' : 'undershoots') + ' its bliss point by ' + fmt(Math.abs(a - bL), 3) + '; for the high type it ' + (a > bH ? 'overshoots' : 'undershoots') + ' by ' + fmt(Math.abs(a - bH), 3) + '. Ex ante the sender cannot exploit the pooling: she does not choose which type she draws, so wider cells hurt her as well as the receiver.');
      }
    });
  };

  FIGS['w11-fig11'] = function (host) {
    widget(host, {
      alt: 'Two-step partition equilibrium', height: 250, width: 600,
      controls: [{ id: 'b', label: 'Bias b', min: 0, max: 0.24, step: 0.005, value: 0.125, fmt: function (v) { return fmt(v, 3); } }],
      draw: function (svg, p, api) {
        var r = partitionDraw(svg, api, 2, p.b, { names: ['"Low"', '"High"'] });
        var bliss = r.th[1] + p.b, g = r.g;
        svgEl('circle', { cx: r.sx(bliss), cy: r.axY, r: 5, fill: C.red }, g);
        text(g, r.sx(bliss), r.axY - 10, 'bliss point ' + fmt(bliss, 3), { anchor: 'middle', size: 10.5, color: C.red });
        var ga = ensureMarker(svg, C.green), y = r.axY + 70;
        svgEl('line', { x1: r.sx(r.acts[0]), y1: y, x2: r.sx(bliss), y2: y, stroke: C.green, 'marker-end': ga, 'marker-start': ga }, g);
        svgEl('line', { x1: r.sx(bliss), y1: y, x2: r.sx(r.acts[1]), y2: y, stroke: C.green, 'marker-end': ga, 'marker-start': ga }, g);
        text(g, r.sx((r.acts[0] + bliss) / 2), y + 14, fmt(bliss - r.acts[0], 3), { anchor: 'middle', size: 10.5, color: C.green });
        text(g, r.sx((r.acts[1] + bliss) / 2), y + 14, fmt(r.acts[1] - bliss, 3), { anchor: 'middle', size: 10.5, color: C.green });
        note(api, 'θ_1 = ½ − 2b = ' + fmt(r.th[1], 3) + '; a_1 = θ_1/2 = ' + fmt(r.acts[0], 3) + ', a_2 = (θ_1 + 1)/2 = ' + fmt(r.acts[1], 3) + '. The boundary type\'s bliss point θ_1 + b = ' + fmt(bliss, 3) + ' is equidistant from both actions. The "high" cell is ' + fmt((1 - r.th[1]) / Math.max(r.th[1], 1e-9), 2) + '× the width of the "low" cell.');
      }
    });
  };

  /* ============================================ moral hazard (ch. 3) */
  var MH = [
    { id: 'u', label: 'Outside option ū', min: 5, max: 25, step: 0.5, value: 15 },
    { id: 'gH', label: 'Effort cost g(e<sub>H</sub>)', min: 1, max: 15, step: 0.5, value: 10 },
    { id: 'pH', label: 'p<sub>H</sub> = Pr(good | e<sub>H</sub>)', min: 0.3, max: 0.95, step: 0.01, value: 0.8 },
    { id: 'pL', label: 'p<sub>L</sub> = Pr(good | e<sub>L</sub>)', min: 0.05, max: 0.9, step: 0.01, value: 0.3 }
  ];
  function mhSetup(svg, api, p) {
    api.limit('pL', 0.05, p.pH - 0.05); if (p.pL >= p.pH) p.pL = p.pH - 0.05;
    var kL = p.u, kH = p.u + p.gH;              // required expected utility of wage (v = √w)
    var wL1 = kL * kL, wH1 = kH * kH;            // first-best flat wages
    var max = Math.max(wH1 * 2.2, 600);
    var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, max], y: [0, max], margin: { l: 56, r: 24, t: 20, b: 46 } }).axes('w_H (wage after good outcome)', 'w_L');
    pl.seg(0, 0, max, max, { 'stroke-dasharray': '3 4', stroke: C.grey }); pl.label(max, max, '45° full insurance', { anchor: 'end', dy: -6, size: 10.5, color: C.grey });
    function ir(pe, k) { return function (wH) { var s = (k - pe * Math.sqrt(wH)) / (1 - pe); return s >= 0 ? s * s : NaN; }; }
    function iso(pe, cost) { return function (wH) { return (cost - pe * wH) / (1 - pe); }; }
    return { pl: pl, ir: ir, iso: iso, kL: kL, kH: kH, wL1: wL1, wH1: wH1, max: max };
  }

  FIGS['w11-fig05'] = function (host) {
    widget(host, {
      alt: 'First-best contracts in wage space', height: 360, width: 560, controls: MH,
      draw: function (svg, p, api) {
        var m = mhSetup(svg, api, p), pl = m.pl;
        pl.curve(m.ir(p.pL, m.kL), 0, m.max, { stroke: C.red }, 240);
        pl.curve(m.ir(p.pH, m.kH), 0, m.max, { stroke: C.blue }, 240);
        pl.curve(m.iso(p.pL, m.wL1), 0, m.max, { stroke: C.grey, 'stroke-width': 1.1 });
        pl.curve(m.iso(p.pH, m.wH1), 0, m.max, { stroke: C.grey, 'stroke-width': 1.1 });
        pl.dot(m.wL1, m.wL1, C.red); pl.label(m.wL1, m.wL1, 'w*_{e_L} = ' + fmt(m.wL1, 0), { color: C.red, dx: 8, dy: -6, size: 11.5 });
        pl.dot(m.wH1, m.wH1, C.blue); pl.label(m.wH1, m.wH1, 'w*_{e_H} = ' + fmt(m.wH1, 0), { color: C.blue, dx: 8, dy: -6, size: 11.5 });
        function irLabel(pe, k, name, color) {
          var f = m.ir(pe, k), y0 = f(1);
          if (y0 > m.max) { var x = bisect(function (w) { return f(w) - m.max; }, 1, (k / pe) * (k / pe)); pl.label(x, m.max * 0.97, name, { color: color, dx: 8, dy: 4 }); }
          else pl.label(1, y0, name, { color: color, dx: 8, dy: -8 });
        }
        irLabel(p.pL, m.kL, 'IR_L', C.red); irLabel(p.pH, m.kH, 'IR_H', C.blue);
        pl.label(m.max * 0.98, m.iso(p.pH, m.wH1)(m.max * 0.98), 'iso-cost (slope −p_H/(1−p_H))', { color: C.grey, anchor: 'end', dy: -5, size: 10.5 });
        note(api, 'With v(w) = √w the participation curve for effort e is p_e√w_H + (1 − p_e)√w_L = ū + g(e). Each is tangent to an iso-cost line on the 45° line, so the cheapest contract delivering the manager her outside option is a <b>flat wage</b>: w* = (ū + g(e))² → ' + fmt(m.wL1, 0) + ' for low effort and ' + fmt(m.wH1, 0) + ' for high effort. The risk-neutral owner bears all the risk (Borch rule).');
      }
    });
  };

  FIGS['w11-risk-averse'] = function (host) {
    widget(host, {
      alt: 'Second-best contract with hidden effort', height: 360, width: 560, controls: MH,
      draw: function (svg, p, api) {
        var m = mhSetup(svg, api, p), pl = m.pl;
        var k = p.gH / (p.pH - p.pL);                  // IC: √wH − √wL ≥ g_H/(p_H − p_L)
        var x = m.kH + (1 - p.pH) * k;                 // √wH at C
        var wH = x * x, wL = Math.pow(x - k, 2), ew = p.pH * wH + (1 - p.pH) * wL, ac = ew - m.wH1;
        pl.band(function (w) { var v = m.ir(p.pH, m.kH)(w); return isNaN(v) ? 0 : v; }, function (w) { var s = Math.sqrt(w) - k; return s > 0 ? s * s : 0; }, wH, m.max, C.greenFill);
        pl.curve(m.ir(p.pH, m.kH), 0, m.max, { stroke: C.blue }, 240);
        pl.curve(function (w) { var s = Math.sqrt(w) - k; return s >= 0 ? s * s : NaN; }, 0, m.max, { stroke: C.red }, 240);
        pl.curve(m.iso(p.pH, m.wH1), 0, m.max, { stroke: C.grey, 'stroke-width': 1.1 });
        pl.curve(m.iso(p.pH, ew), 0, m.max, { stroke: C.orange, 'stroke-width': 1.3, 'stroke-dasharray': '5 3' });
        pl.dot(m.wH1, m.wH1, C.blue); pl.label(m.wH1, m.wH1, 'first best w*_{e_H} = ' + fmt(m.wH1, 0), { color: C.blue, dx: -8, dy: -8, anchor: 'end', size: 11.5 });
        pl.dot(wH, wL, C.red, 5.5); pl.label(wH, wL, 'C = (' + fmt(wH, 0) + ', ' + fmt(wL, 0) + ')', { color: C.red, dx: 8, dy: 14, size: 11.5, bold: true });
        pl.guide(wH, wL);
        var fH = m.ir(p.pH, m.kH), yH0 = fH(1);
        if (yH0 > m.max) { var xh = bisect(function (w) { return fH(w) - m.max; }, 1, (m.kH / p.pH) * (m.kH / p.pH)); pl.label(xh, m.max * 0.97, 'IR_H', { color: C.blue, dx: 8, dy: 4 }); }
        else pl.label(1, yH0, 'IR_H', { color: C.blue, dx: 8, dy: -8 });
        var xi = m.max * 0.97; pl.label(xi, Math.pow(Math.sqrt(xi) - k, 2), 'IC', { color: C.red, dx: -4, dy: -8, anchor: 'end' });
        pl.label(m.max * 0.98, m.iso(p.pH, ew)(m.max * 0.98), 'E[w] = ' + fmt(ew, 0), { color: C.orange, anchor: 'end', dy: -5, size: 10.5 });
        note(api, 'The incentive constraint √w_H − √w_L ≥ g(e_H)/(p_H − p_L) = ' + fmt(k, 1) + ' rules out the flat wage. The cheapest contract that implements high effort is C, where IC and IR_H both bind: w_H = ' + fmt(wH, 0) + ', w_L = ' + fmt(wL, 0) + '. Its expected cost ' + fmt(ew, 0) + ' exceeds the first-best wage ' + fmt(m.wH1, 0) + ' by the <b>agency cost ' + fmt(ac, 0) + '</b>, the risk premium the manager must be paid for bearing income risk. The shaded region is the set of contracts satisfying both constraints.');
      }
    });
  };

  /* ================================================= insurance (ch. 2) */
  var INS = [
    { id: 'pH', label: 'p<sub>H</sub> (high-risk loss prob.)', min: 0.1, max: 0.9, step: 0.01, value: 0.4 },
    { id: 'pL', label: 'p<sub>L</sub> (low-risk loss prob.)', min: 0.02, max: 0.8, step: 0.01, value: 0.15 },
    { id: 'L', label: 'Loss L (wealth W = 100)', min: 10, max: 90, step: 1, value: 60, fmt: function (v) { return fmt(v, 0); } }
  ];
  var Wlth = 100;
  function u(w) { return Math.log(Math.max(w, 1e-6)); }
  function EU(p, q, a, L) { return (1 - p) * u(Wlth - q) + p * u(Wlth - q - L + a * L); }
  function icQ(p, a, L, U) { // premium q on type-p indifference curve at coverage a, EU = U
    var lo = -20, hi = Wlth - L + a * L - 1e-3;
    if (EU(p, hi, a, L) > U) return NaN;
    return bisect(function (q) { return EU(p, q, a, L) - U; }, lo, hi);
  }
  function insParams(api, p) { api.limit('pL', 0.02, p.pH - 0.03); if (p.pL >= p.pH) p.pL = p.pH - 0.03; }

  FIGS['w9-indifference'] = function (host) {
    widget(host, {
      alt: 'Indifference curves in wealth space', height: 340, width: 520, controls: INS,
      draw: function (svg, p, api) {
        insParams(api, p);
        var W1 = Wlth, W2 = Wlth - p.L, mx = Wlth * 1.15;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, mx], y: [0, mx], margin: { l: 56, r: 24, t: 20, b: 46 } }).axes('W_1 (no loss)', 'W_2 (loss)');
        pl.seg(0, 0, mx, mx, { 'stroke-dasharray': '3 4', stroke: C.grey }); pl.label(mx * 0.93, mx * 0.93, 'certainty line', { anchor: 'end', dy: -6, size: 10.5, color: C.grey, rotate: -45 });
        function ic(pp) { var U = (1 - pp) * u(W1) + pp * u(W2); return function (w1) { var s = (U - (1 - pp) * u(w1)) / pp; return Math.exp(s); }; }
        pl.curve(ic(p.pL), 5, mx, { stroke: C.blue }, 300);
        pl.curve(ic(p.pH), 5, mx, { stroke: C.red }, 300);
        pl.dot(W1, W2, C.ink); pl.label(W1, W2, 'E', { dx: 8, dy: 4, bold: true });
        pl.guide(W1, W2);
        pl.tick('x', W1, 'W'); pl.tick('y', W2, 'W − L');
        // certainty-line crossings
        var cL = bisect(function (w) { return ic(p.pL)(w) - w; }, 5, mx), cH = bisect(function (w) { return ic(p.pH)(w) - w; }, 5, mx);
        pl.dot(cL, cL, C.blue, 3.5); pl.dot(cH, cH, C.red, 3.5);
        var topL = bisect(function (w) { return ic(p.pL)(w) - mx; }, 5, mx);
        pl.label(topL, mx, 'U_L', { color: C.blue, dx: 8, dy: 12 }); pl.label(mx, ic(p.pH)(mx), 'U_H', { color: C.red, dx: -4, dy: -8, anchor: 'end' });
        pl.arrow(mx * 0.22, mx * 0.1, mx * 0.32, mx * 0.2, C.ink2); pl.label(mx * 0.3, mx * 0.08, 'utility increasing', { size: 10.5, color: C.ink2, dy: 4 });
        var sL = (1 - p.pL) / p.pL * (W2 / W1), sH = (1 - p.pH) / p.pH * (W2 / W1);
        note(api, 'Through the endowment E = (W, W − L) the low-risk curve is steeper: its slope is −(1 − p)u′(W_1)/(p u′(W_2)), which with u = ln w equals ' + fmt(-sL, 2) + ' for the low type and ' + fmt(-sH, 2) + ' for the high type. A low-risk consumer gives up less no-loss wealth for a unit of loss-state wealth, which is the single-crossing property that makes screening possible.');
      }
    });
  };

  FIGS['w9-fig02'] = function (host) {
    widget(host, {
      alt: 'Separating equilibrium in coverage-premium space', height: 360, width: 560, controls: INS,
      draw: function (svg, p, api) {
        insParams(api, p);
        var L = p.L, qmax = p.pH * L * 1.25;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 1.18], y: [0, qmax], margin: { l: 56, r: 24, t: 20, b: 48 } }).axes('Coverage α', 'Premium q');
        pl.curve(function (a) { return p.pH * a * L; }, 0, 1.15, { stroke: C.blue }); pl.label(1.15, p.pH * 1.15 * L, 'q = p_H αL', { color: C.blue, anchor: 'end', dy: -6, size: 11 });
        pl.curve(function (a) { return p.pL * a * L; }, 0, 1.15, { stroke: C.red }); pl.label(1.15, p.pL * 1.15 * L, 'q = p_L αL', { color: C.red, anchor: 'end', dy: 16, size: 11 });
        pl.seg(1, 0, 1, qmax, { 'stroke-dasharray': '2 3' }); pl.tick('x', 1, 'α = 1');
        var UH = EU(p.pH, p.pH * L, 1, L);
        var aL = bisect(function (a) { return EU(p.pH, p.pL * a * L, a, L) - UH; }, 1e-4, 1);
        var qL = p.pL * aL * L, UL = EU(p.pL, qL, aL, L);
        pl.curve(function (a) { return icQ(p.pH, a, L, UH); }, 0.02, 1.15, { stroke: C.blue, 'stroke-dasharray': '5 3', 'stroke-width': 1.4 }, 200);
        pl.curve(function (a) { return icQ(p.pL, a, L, UL); }, 0.02, 1.15, { stroke: C.red, 'stroke-dasharray': '5 3', 'stroke-width': 1.4 }, 200);
        pl.dot(1, p.pH * L, C.ink, 5); pl.label(1, p.pH * L, 'C*_H = (1, p_H L)', { dx: -8, dy: -10, anchor: 'end', size: 11.5, bold: true });
        pl.dot(aL, qL, C.ink, 5); pl.label(aL, qL, 'C*_L = (' + fmt(aL, 2) + ', ' + fmt(qL, 1) + ')', { dx: -8, dy: 16, anchor: 'end', size: 11.5, bold: true });
        pl.dot(1, p.pL * L, C.grey, 4); pl.label(1, p.pL * L, 'first best for L: (1, p_L L)', { color: C.grey, dx: -8, dy: 16, size: 10.5, anchor: 'end' });
        var ga = ensureMarker(svg, C.grey);
        pl.seg(aL, qmax * 0.06, 1, qmax * 0.06, { stroke: C.grey, 'marker-end': ga, 'marker-start': ga }); pl.label((aL + 1) / 2, qmax * 0.06, 'coverage distortion', { anchor: 'middle', dy: 14, size: 10.5, color: C.grey });
        pl.label(1.1, icQ(p.pH, 1.1, L, UH), 'Ū_H', { color: C.blue, dx: 4, dy: 4, size: 11 }); pl.label(1.1, icQ(p.pL, 1.1, L, UL), 'Ū_L', { color: C.red, dx: 4, dy: 4, size: 11 });
        note(api, 'High-risk consumers get full coverage at the fair premium p_H L = ' + fmt(p.pH * L, 1) + '. The low-risk contract is pushed down the low-risk zero-profit line until the high type\'s indifference curve through C*_H just binds: α*_L = <b>' + fmt(aL, 2) + '</b>, q*_L = ' + fmt(qL, 1) + '. Low-risk consumers bear the residual risk 1 − α*_L = ' + fmt(1 - aL, 2) + ' of the loss as the price of separation.' + (p.pH - p.pL < 0.08 ? ' When the types are close, almost no coverage can be offered to the low type.' : ''));
      }
    });
  };

  FIGS['w9-fig03'] = function (host) {
    widget(host, {
      alt: 'Cream-skimming wedge at a pooling contract', height: 360, width: 560,
      controls: INS.concat([{ id: 'lam', label: 'λ (share of high-risk)', min: 0.05, max: 0.95, step: 0.01, value: 0.5 }, { id: 'ap', label: 'Pooling coverage α<sub>p</sub>', min: 0.2, max: 1, step: 0.01, value: 0.7 }]),
      draw: function (svg, p, api) {
        insParams(api, p);
        var L = p.L, pb = p.lam * p.pH + (1 - p.lam) * p.pL, qmax = p.pH * L * 1.25;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, 1.18], y: [0, qmax], margin: { l: 56, r: 24, t: 20, b: 48 } }).axes('Coverage α', 'Premium q');
        var ap = p.ap, qp = pb * ap * L, UHp = EU(p.pH, qp, ap, L), ULp = EU(p.pL, qp, ap, L);
        var icH = function (a) { return icQ(p.pH, a, L, UHp); }, icL = function (a) { return icQ(p.pL, a, L, ULp); };
        // wedge: between max(icH, zero-profit-L) and icL, for α below α_p
        pl.band(function (a) { return Math.max(icH(a), p.pL * a * L); }, icL, 0.01, ap, C.greenFill, 120);
        pl.curve(function (a) { return p.pH * a * L; }, 0, 1.15, { stroke: C.blue }); pl.label(1.15, p.pH * 1.15 * L, 'q = p_H αL', { color: C.blue, anchor: 'end', dy: -6, size: 11 });
        pl.curve(function (a) { return pb * a * L; }, 0, 1.15, { stroke: C.grey }); pl.label(1.15, pb * 1.15 * L, 'q = p̄ αL', { color: C.grey, anchor: 'end', dy: -6, size: 11 });
        pl.curve(function (a) { return p.pL * a * L; }, 0, 1.15, { stroke: C.red }); pl.label(1.15, p.pL * 1.15 * L, 'q = p_L αL', { color: C.red, anchor: 'end', dy: 16, size: 11 });
        pl.curve(icH, 0.02, 1.15, { stroke: C.blue, 'stroke-dasharray': '5 3', 'stroke-width': 1.4 }, 200);
        pl.curve(icL, 0.02, 1.15, { stroke: C.red, 'stroke-dasharray': '5 3', 'stroke-width': 1.4 }, 200);
        pl.seg(1, 0, 1, qmax, { 'stroke-dasharray': '2 3' }); pl.tick('x', 1, 'α = 1');
        pl.dot(ap, qp, C.ink, 5); pl.label(ap, qp, 'P', { dx: 7, dy: -6, bold: true });
        // a cream-skimming contract: a little below α_p, inside the wedge
        var ac = ap * 0.9, lo = Math.max(icH(ac), p.pL * ac * L), hi = icL(ac), exists = hi > lo;
        if (exists) { var qc = (lo + hi) / 2; pl.dot(ac, qc, C.green, 5); pl.label(ac, qc, 'C', { color: C.green, dx: 7, dy: 14, bold: true }); }
        pl.label(1.1, icH(1.1), 'U^p_H', { color: C.blue, dx: 4, dy: 4, size: 11 }); pl.label(1.1, icL(1.1), 'U^p_L', { color: C.red, dx: 4, dy: 4, size: 11 });
        note(api, 'P = (' + fmt(ap, 2) + ', ' + fmt(qp, 1) + ') breaks even on the pooled risk p̄ = ' + fmt(pb, 3) + '. Because the high type\'s indifference curve through P is steeper, the shaded wedge below U<sup>p</sup><sub>L</sub>, above U<sup>p</sup><sub>H</sub> and above the low-risk fair line is non-empty' + (exists ? ': a contract such as C attracts only low-risk consumers and is profitable, so the pool unravels.' : ' in principle, though at these parameters it is too thin to place C in.') + ' No pooling equilibrium survives competition.');
      }
    });
  };

  /* ================================================= signalling (ch. 2) */
  FIGS['w9-fig04'] = function (host) {
    widget(host, {
      alt: 'Intuitive Criterion in education-wage space', height: 380, width: 600,
      controls: [
        { id: 'tH', label: 'θ<sub>H</sub>', min: 150, max: 300, step: 5, value: 200, fmt: function (v) { return fmt(v, 0); } },
        { id: 'lam', label: 'λ (share of high types)', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
        { id: 'kL', label: 'Low-type cost c<sub>L</sub>(e) = k<sub>L</sub>e²', min: 5, max: 40, step: 1, value: 20, fmt: function (v) { return fmt(v, 0); } },
        { id: 'kH', label: 'High-type cost c<sub>H</sub>(e) = k<sub>H</sub>e²', min: 2, max: 39, step: 1, value: 10, fmt: function (v) { return fmt(v, 0); } },
        { id: 'e', label: 'Deviation e′', min: 0.1, max: 4, step: 0.05, value: 1.9 }
      ],
      draw: function (svg, p, api) {
        api.limit('kH', 2, p.kL - 1); if (p.kH >= p.kL) p.kH = p.kL - 1;
        var tL = 100, tH = p.tH, tb = p.lam * tH + (1 - p.lam) * tL, gap = (1 - p.lam) * (tH - tL);
        var ed = Math.sqrt(gap / p.kL), eH = Math.sqrt(gap / p.kH), emax = 4, ymax = tH * 1.25;
        var pl = new Plot(svg, { width: api.W, height: api.H, x: [0, emax * 1.05], y: [60, ymax], margin: { l: 56, r: 24, t: 20, b: 60 } }).axes('Education e', 'Wage w', { noOrigin: true });
        pl.band(function () { return tb; }, function (e) { return Math.min(tb + p.kH * e * e, tH); }, ed, Math.min(eH, emax), C.greenFill, 60);
        [[tH, 'θ_H', C.blue], [tb, 'θ̄', C.ink2], [tL, 'θ_L', C.red]].forEach(function (r) { pl.seg(0, r[0], emax, r[0], { 'stroke-dasharray': '3 3' }); pl.tick('y', r[0], r[1] + ' = ' + fmt(r[0], 0), r[2]); });
        pl.curve(function (e) { return tb + p.kL * e * e; }, 0, emax, { stroke: C.red });
        pl.curve(function (e) { return tb + p.kH * e * e; }, 0, emax, { stroke: C.blue });
        var xL = Math.min(emax, Math.sqrt((ymax - tb) / p.kL)); pl.label(xL, tb + p.kL * xL * xL, 'U^p_L', { color: C.red, dx: 6, dy: 12, size: 11.5 });
        var xH = Math.min(emax, Math.sqrt((ymax - tb) / p.kH)); pl.label(xH, Math.min(ymax, tb + p.kH * xH * xH), 'U^p_H', { color: C.blue, dx: 6, dy: 12, size: 11.5 });
        pl.dot(0, tb, C.ink, 5); pl.label(0, tb, 'P', { dx: 8, dy: -6, bold: true });
        pl.seg(ed, 60, ed, tH, { stroke: C.red, 'stroke-dasharray': '2 3' }); pl.tick('x', ed, 'e† = ' + fmt(ed, 2), C.red);
        pl.seg(Math.min(eH, emax), 60, Math.min(eH, emax), tH, { stroke: C.blue, 'stroke-dasharray': '2 3' }); if (eH <= emax) pl.tick('x', eH, 'ē_H = ' + fmt(eH, 2), C.blue);
        // deviation e'
        var e = p.e, inBand = e > ed && e < eH, wPess = tL, wIC = inBand ? tH : (e >= eH ? tH : tL);
        pl.dot(e, wPess, C.ink2, 4); pl.label(e, wPess, 'μ(H | e′) = 0', { anchor: 'middle', dy: 18, size: 10.5, color: C.ink2 });
        if (inBand) {
          pl.arrow(e, wPess, e, tH, C.green); pl.dot(e, tH, C.green, 5);
          pl.label(e, (tL + tH) / 2, 'Intuitive Criterion: μ(H | e′) = 1', { dx: 8, dy: 30, size: 10.5, color: C.green, halo: true });
        } else { pl.dot(e, tL, C.ink2, 4); }
        var gain = tH - p.kH * e * e - tb, lossL = tH - p.kL * e * e - tb;
        var ga = ensureMarker(svg, C.green), yb = 70;
        if (eH > ed) { pl.seg(ed, yb, Math.min(eH, emax), yb, { stroke: C.green, 'marker-end': ga, 'marker-start': ga }); pl.label((ed + Math.min(eH, emax)) / 2, yb, 'deviations that break the pool', { anchor: 'middle', dy: -5, size: 10.5, color: C.green }); }
        note(api, 'Pooling pays θ̄ = ' + fmt(tb, 0) + '. At e′ = ' + fmt(e, 2) + ' the low type would need w ≥ θ̄ + c_L(e′) = ' + fmt(tb + p.kL * e * e, 0) + (lossL < 0 ? ' > θ_H, so it never deviates even if believed to be high (equilibrium-dominated).' : ' ≤ θ_H, so it could still gain if believed high.')
          + ' The high type needs θ̄ + c_H(e′) = ' + fmt(tb + p.kH * e * e, 0) + (gain > 0 ? ' < θ_H, so it gains ' + fmt(gain, 0) + ' if paid θ_H.' : ' ≥ θ_H, so it would not deviate.')
          + (inBand ? ' <b>e′ lies in the band (e†, ē_H): the Intuitive Criterion sets μ(H | e′) = 1, the wage jumps to θ_H, and the pooling equilibrium fails.</b>' : ' Move e′ into the band between e† and ē_H to break the pool.'));
      }
    });
  };

  /* ------------------------------------------------------------ boot */
  function init() {
    var blocks = document.querySelectorAll('.gametree[data-fig]');
    Array.prototype.forEach.call(blocks, function (block) {
      var id = block.getAttribute('data-fig'), fn = FIGS[id];
      if (!fn) return;
      var img = block.querySelector('img'), fig = block.querySelector('figure');
      var host = htmlEl('div', { 'class': 'ifig-host' });
      block.insertBefore(host, block.firstChild);
      try {
        fn(host);
        if (fig) fig.classList.add('ifig-fallback'); else if (img) img.classList.add('ifig-fallback');
        block.classList.add('has-ifig');
      } catch (err) {
        host.remove();
        if (window.console) console.error('interactive figure ' + id + ' failed', err);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
