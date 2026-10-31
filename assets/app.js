(function () {
  'use strict';
  var KB = window.SEED, T = window.Translator;
  var $view = document.getElementById('view');
  var ruleById = {}, tokById = {}, gapById = {}, cfgById = {}, surfById = {};
  KB.rules.forEach(function (r) { ruleById[r.id] = r; });
  KB.tokens.forEach(function (t) { tokById[t.id] = t; });
  KB.gaps.forEach(function (g) { gapById[g.id] = g; });
  KB.configs.forEach(function (c) { cfgById[c.id] = c; });
  KB.surfaces.forEach(function (s) { surfById[s.id] = s; });

  var state = {
    surface: KB.surfaces[0].id, cfg: 'cfg-agentic', sel: null, ran: {},
    evalCfg: 'cfg-agentic', evalResult: null, evalOpen: {},
    cmpA: 'cfg-baseline', cmpB: 'cfg-agentic', cmpSurface: 'asset-list-screen', cmpPlat: 'swift'
  };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  var HL = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*$|@\w+|\b(?:import|export|function|const|return|struct|var|let|fun|val|if|else|private|some|init|type|true|false|by|from)\b|\b[A-Z]\w*(?=\())/g;
  function hl(text) {
    return esc(text).replace(HL, function (m) {
      if (m[0] === '"' || m[0] === "'") return '<span class="k2">' + m + '</span>';
      if (m.indexOf('//') === 0) return '<span class="k3">' + m + '</span>';
      if (/^[A-Z]/.test(m)) return '<span class="k4">' + m + '</span>';
      return '<span class="k1">' + m + '</span>';
    });
  }
  function cfgOptions(sel) {
    return KB.configs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  }
  var cache = {};
  function run(surfaceId, cfgId) {
    var k = surfaceId + '|' + cfgId;
    if (!cache[k]) cache[k] = T.translate(surfById[surfaceId], cfgById[cfgId], KB);
    return cache[k];
  }
  var evalCache = {};
  function evalFor(cfgId) { if (!evalCache[cfgId]) evalCache[cfgId] = T.runEval(KB, cfgById[cfgId]); return evalCache[cfgId]; }

  // ---------------- routing ----------------
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var tab = parts[0].split('/')[0] || 'translate';
    var arg = parts[0].split('/')[1];
    var q = {};
    (parts[1] || '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
    document.querySelectorAll('#tabs a').forEach(function (a) { a.classList.toggle('active', a.dataset.tab === tab); });
    if (tab === 'eval') { if (q.cfg && cfgById[q.cfg]) state.evalCfg = q.cfg; if (q.run) state.evalResult = evalFor(state.evalCfg); if (q.open) state.evalOpen[q.open] = true; renderEval(); }
    else if (tab === 'compare') renderCompare();
    else {
      if (arg && surfById[arg] && arg !== state.surface) { state.surface = arg; state.sel = null; }
      if (q.cfg && cfgById[q.cfg]) state.cfg = q.cfg;
      if (q.sel) { var sp = q.sel.split(':'); state.sel = { platform: sp[0], i: (+sp[1] || 1) - 1 }; state.ran[state.surface + '|' + state.cfg] = true; }
      renderTranslate(false);
    }
  }
  window.addEventListener('hashchange', route);

  // ---------------- translate & trace ----------------
  function codeLines(lines, platform, sel, hlSet, extraCls) {
    return lines.map(function (l, i) {
      var cls = ['ln'];
      if (l.rule === 'UNMAPPED') cls.push('todo');
      else if (l.guessed && l.guessed.length) cls.push('guess');
      if (sel && sel.platform === platform && sel.i === i) cls.push('sel');
      else if (hlSet && hlSet[i]) cls.push('hl');
      if (extraCls && extraCls[i]) cls.push(extraCls[i]);
      return '<div class="' + cls.join(' ') + '" data-p="' + platform + '" data-i="' + i + '"><span class="no">' + (i + 1) + '</span><span class="tx">' + (hl(l.text) || ' ') + '</span></div>';
    }).join('');
  }
  function sourceLines(src, sel, hlSet) {
    return src.map(function (s, i) {
      var cls = ['ln', 's-' + s.status];
      if (sel && sel.platform === 'source' && sel.i === i) cls.push('sel');
      else if (hlSet && hlSet[i]) cls.push('hl');
      return '<div class="' + cls.join(' ') + '" data-p="source" data-i="' + i + '"><span class="no">' + s.n + '</span><span class="dot"></span><span class="tx">' + (hl(s.text) || ' ') + '</span></div>';
    }).join('');
  }

  function computeHighlights(r, sel) {
    var h = { source: {}, swift: {}, kotlin: {} };
    if (!sel) return h;
    var srcSet = {};
    if (sel.platform === 'source') srcSet[sel.i + 1] = true;
    else (r[sel.platform][sel.i].src || []).forEach(function (n) { srcSet[n] = true; });
    Object.keys(srcSet).forEach(function (n) { h.source[n - 1] = true; });
    ['swift', 'kotlin'].forEach(function (p) {
      r[p].forEach(function (l, i) { if ((l.src || []).some(function (n) { return srcSet[n]; })) h[p][i] = true; });
    });
    return h;
  }

  function ruleCard(id) {
    var r = ruleById[id];
    if (!r) return '';
    return '<div class="rec"><div class="rt"><span class="chip blue">' + r.id + '</span>' + esc(r.title) +
      ' <span class="chip ' + (r.tier === 'extended' ? 'warn' : '') + '">' + r.tier + '</span></div>' +
      '<div class="rb">' + esc(r.rationale) + '</div>' +
      '<div class="kv"><div>React Native</div><div><code>' + esc(r.rn) + '</code></div><div>SwiftUI</div><div><code>' + esc(r.swift) + '</code></div>' +
      '<div>Compose</div><div><code>' + esc(r.kotlin) + '</code></div><div>Reviewed by</div><div>' + esc(r.reviewedBy) + ' · used in ' + r.approvedMigrations + ' approved migrations</div></div></div>';
  }
  function tokenCard(id, platform) {
    var t = tokById[id];
    var sw = t.kind === 'color' ? '<span class="swatch" style="background:' + t.value + '"></span>' : '';
    return '<div class="rec"><div class="rt"><span class="chip ok">' + t.id + '</span>' + sw + '<code>' + esc(t.rn) + '</code> → <code>' + esc(platform === 'kotlin' ? t.kotlin : t.swift) + '</code></div>' +
      '<div class="rb">' + t.kind + ' · value ' + esc(t.value) + ' · design-token registry</div></div>';
  }

  function traceHtml(r, sel, surface, cfg) {
    if (!sel) {
      return '<div class="card"><div class="card-head"><h3>Trace</h3></div><div class="empty">Click any generated SwiftUI or Compose line to see the source lines, pattern-library rule and design-token records it came from. Click a source line to see everything generated from it.</div></div>';
    }
    var html = '';
    if (sel.platform === 'source') {
      var s = r.source[sel.i];
      var outs = ['swift', 'kotlin'].map(function (p) { return r[p].filter(function (l) { return (l.src || []).indexOf(s.n) >= 0; }).length; });
      html += '<div class="rec"><div class="rt">Source line L' + s.n + ' <span class="chip ' + (s.status === 'mapped' ? 'ok' : s.status === 'partial' ? 'warn' : s.status === 'unmapped' ? 'err' : '') + '">' + s.status + '</span></div><pre>' + esc(s.text.trim() || '(blank)') + '</pre>' +
        '<div class="rb">' + esc(surface.path) + ' · generated ' + outs[0] + ' SwiftUI line(s) and ' + outs[1] + ' Compose line(s)' + (s.dropped.length ? ' · dropped style props: ' + s.dropped.join(', ') : '') + '</div></div>';
      s.rules.forEach(function (id) { html += ruleCard(id); });
      if (s.status === 'unmapped') html += unmappedCard(s.gap, s.blockedBy, cfg);
    } else {
      var l = r[sel.platform][sel.i];
      var pname = sel.platform === 'swift' ? 'SwiftUI' : 'Compose';
      html += '<div class="rec"><div class="rt">' + pname + ' line ' + (sel.i + 1) + (l.rule === 'UNMAPPED' ? ' <span class="chip err">needs human review</span>' : l.guessed && l.guessed.length ? ' <span class="chip warn">contains guesses</span>' : l.src.length ? ' <span class="chip ok">grounded</span>' : '') + '</div><pre>' + esc(l.text.trim() || '(blank)') + '</pre></div>';
      if (!l.src.length) html += '<div class="note">Formatting line - no source.</div>';
      if (l.src.length) {
        html += '<div class="rec"><div class="rt">Source records</div><div class="rb">' + esc(surface.path) + '</div><pre>' + l.src.slice().sort(function (a, b) { return a - b; }).map(function (n) { return 'L' + n + '  ' + esc(r.source[n - 1].text.trim()); }).join('\n') + '</pre></div>';
      }
      if (l.rule === 'UNMAPPED') html += unmappedCard(l.gap, l.blockedBy, cfg);
      (l.rules || []).filter(function (x) { return x !== 'UNMAPPED'; }).forEach(function (id) { html += ruleCard(id); });
      (l.tokens || []).forEach(function (id) { html += tokenCard(id, sel.platform); });
      (l.guessed || []).forEach(function (k) {
        html += '<div class="rec warn"><div class="rt">Literal guess for <code>' + esc(k) + '</code></div><div class="rb">Token retrieval is off in "' + esc(cfg.name) + '", so this value is not traced to a design-token record.</div></div>';
      });
    }
    return '<div class="card"><div class="card-head"><h3>Trace</h3><button class="btn ghost" data-act="clearsel">Clear</button></div><div class="pad">' + html + '</div></div>';
  }
  function unmappedCard(gap, blockedBy, cfg) {
    if (blockedBy && ruleById[blockedBy]) {
      return '<div class="rec warn"><div class="rt">Pattern available but disabled</div><div class="rb"><b>' + blockedBy + '</b> exists in the reviewed library (tier "' + ruleById[blockedBy].tier + '") but "' + esc(cfg.name) + '" only uses: ' + cfg.tiers.join(', ') + '.</div></div>' + ruleCard(blockedBy);
    }
    var g = gapById[gap];
    return '<div class="rec bad"><div class="rt">No reviewed pattern' + (g ? ' <span class="chip err">' + g.id + '</span>' : '') + '</div><div class="rb">' + (g ? esc(g.pattern) + ' - ' + esc(g.note) : 'Construct not covered by the pattern library; routed to human review instead of guessing.') + '</div></div>';
  }

  function renderTranslate(animate) {
    var surface = surfById[state.surface], cfg = cfgById[state.cfg];
    var r = run(surface.id, cfg.id);
    var ev = T.evaluate(surface, r);
    var h = computeHighlights(r, state.sel);
    var m = r.metrics;
    var ranKey = surface.id + '|' + cfg.id;
    var shown = state.ran[ranKey];
    var list = KB.surfaces.map(function (s) {
      return '<li data-surface="' + s.id + '" class="' + (s.id === surface.id ? 'active' : '') + '"><div class="nm"><span>' + esc(s.name) + '</span><span class="chip">' + s.priority + '</span></div><div class="meta">' + esc(s.area) + ' · ' + esc(s.squad) + '</div></li>';
    }).join('');
    var steps = r.steps.map(function (s) {
      return '<div class="step ' + (s.muted ? 'muted ' : '') + (s.level === 'error' ? 'error ' : '') + (shown && !animate ? 'show' : '') + '"><div class="sn">' + esc(s.name) + '</div><div class="sd">' + esc(s.detail) + '</div></div>';
    }).join('');
    var selfCheck = cfg.selfCheck ? r.checks.map(function (c) {
      return '<li><span class="ic ' + c.level + '">' + (c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✕') + '</span><span>' + esc(c.msg) + '</span></li>';
    }).join('') : '<li class="note">Self-check is disabled in this configuration.</li>';
    var goldenList = ev.checks.map(function (c) {
      return '<li><span class="ic ' + (c.pass ? 'ok' : 'fail') + '">' + (c.pass ? '✓' : '✕') + '</span><span><span class="chip">' + (c.platform === 'swift' ? 'SwiftUI' : 'Compose') + '</span> ' + esc(c.label) + (c.expect ? ' <code>' + esc(c.expect) + '</code>' : '') + '</span></li>';
    }).join('');

    $view.innerHTML =
      '<div class="layout">' +
      '<aside class="card"><div class="card-head"><h3>Seeded RN surfaces</h3><span class="chip">' + KB.surfaces.length + '</span></div><ul class="surface-list">' + list + '</ul></aside>' +
      '<section>' +
      '<div class="card"><div class="toolbar"><div class="grow"><div class="h">' + esc(surface.name) + '</div><div class="p">' + esc(surface.path) + ' · ' + esc(surface.squad) + ' · ~' + (surface.dailyViews / 1000).toFixed(0) + 'k daily views (synthetic)</div></div>' +
      '<label class="lbl">Configuration<select id="cfgSel">' + cfgOptions(cfg.id) + '</select></label>' +
      '<button class="btn" id="runBtn">▶ Run translation agent</button></div>' +
      '<div class="steps" id="steps">' + steps + '</div></div>' +
      '<div class="metrics">' +
      metric(pct(m.coverage), 'Source lines mapped (' + m.mappedLines + '/' + m.sourceLines + ')', m.coverage) +
      metric(pct(m.grounding), 'Output lines grounded in records', m.grounding) +
      metric(cfg.tokenRetrieval ? m.tokensResolved + '/' + m.tokenRefs : m.guessed + ' guessed', cfg.tokenRetrieval ? 'Design tokens resolved' : 'Style values guessed (no token lookup)', cfg.tokenRetrieval ? (m.tokenRefs ? m.tokensResolved / m.tokenRefs : 1) : 0) +
      metric(ev.passed + '/' + ev.total, 'Golden checks passed for this surface', ev.passed / ev.total) +
      '</div>' +
      '<div class="codegrid">' +
      pane('React Native (source)', 'TSX · ' + m.sourceLines + ' lines', sourceLines(r.source, state.sel, h.source)) +
      pane('SwiftUI (generated)', 'iOS', codeLines(r.swift, 'swift', state.sel, h.swift)) +
      pane('Jetpack Compose (generated)', 'Android', codeLines(r.kotlin, 'kotlin', state.sel, h.kotlin)) +
      '</div>' +
      '<div class="trace">' + traceHtml(r, state.sel, surface, cfg) +
      '<div><div class="card"><div class="card-head"><h3>Self-check</h3>' + (cfg.selfCheck ? '' : '<span class="chip">off</span>') + '</div><div class="pad"><ul class="checks">' + selfCheck + '</ul></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="card-head"><h3>Golden checks (eval set)</h3><span class="chip ' + (ev.casePass ? 'ok' : 'err') + '">' + ev.passed + '/' + ev.total + '</span></div><div class="pad"><ul class="checks">' + goldenList + '</ul></div></div></div>' +
      '</div></section></div>';

    if (animate) {
      var els = $view.querySelectorAll('.step');
      els.forEach(function (el, i) { setTimeout(function () { el.classList.add('show'); }, 150 * (i + 1)); });
      state.ran[ranKey] = true;
    }
  }
  function metric(v, k, frac) {
    return '<div class="metric"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div><div class="bar"><i style="width:' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%"></i></div></div>';
  }
  function pane(title, sub, body) {
    return '<div class="pane"><div class="pane-head"><span>' + esc(title) + '</span><span>' + esc(sub) + '</span></div><div class="code">' + body + '</div></div>';
  }

  // ---------------- evaluation ----------------
  function renderEval(running) {
    var cfg = cfgById[state.evalCfg];
    var res = state.evalResult && state.evalResult.configId === cfg.id ? state.evalResult : null;
    var html = '<div class="card"><div class="toolbar"><div class="grow"><div class="h">Evaluation set</div><div class="p">' + KB.surfaces.length + ' surfaces · ' +
      KB.surfaces.reduce(function (a, s) { return a + s.golden.length; }, 0) + ' golden assertions written by (synthetic) senior reviewers in scripts/seed.py</div></div>' +
      '<label class="lbl">Configuration<select id="evalCfg">' + cfgOptions(cfg.id) + '</select></label>' +
      '<button class="btn" id="evalBtn">▶ Run evaluation</button></div>' +
      '<div class="progress"><i id="evalProg" style="width:' + (res ? 100 : 0) + '%"></i></div>' +
      '<div class="pad note" style="padding-top:0">' + esc(cfg.description) + '</div></div>';
    if (!res) {
      html += '<div class="card pad" style="margin-top:12px"><span class="note">' + (running ? 'Running…' : 'Press “Run evaluation” to translate every surface with this configuration and score the output against the golden checks.') + '</span></div>';
      $view.innerHTML = html;
      return;
    }
    var s = res.summary;
    html += '<div class="metrics">' +
      metric(pct(s.assertionAccuracy), 'Assertion accuracy (' + s.passed + '/' + s.total + ')', s.assertionAccuracy) +
      metric(s.casesPassed + '/' + s.cases, 'Surfaces fully passing', s.casePassRate) +
      metric(pct(s.coverage), 'Source lines mapped by a rule', s.coverage) +
      metric(pct(s.grounding), 'Output lines grounded in records', s.grounding) + '</div>';
    html += '<div class="card"><table class="t"><thead><tr><th>Surface</th><th>Area</th><th>SwiftUI checks</th><th>Compose checks</th><th>Coverage</th><th>Result</th></tr></thead><tbody>';
    res.cases.forEach(function (c) {
      var sf = surfById[c.surfaceId];
      var sw = c.checks.filter(function (x) { return x.platform === 'swift'; });
      var kt = c.checks.filter(function (x) { return x.platform === 'kotlin'; });
      var cnt = function (a) { var p = a.filter(function (x) { return x.pass; }).length; return '<span class="mini"><i style="width:' + (a.length ? p / a.length * 100 : 100) + '%"></i></span>' + p + '/' + a.length; };
      html += '<tr class="row" data-case="' + c.surfaceId + '"><td><b>' + esc(sf.name) + '</b></td><td>' + esc(sf.area) + '</td><td>' + cnt(sw) + '</td><td>' + cnt(kt) + '</td><td>' + pct(c.metrics.coverage) + '</td><td><span class="chip ' + (c.casePass ? 'ok">pass' : 'err">fail') + '</span></td></tr>';
      if (state.evalOpen[c.surfaceId]) {
        html += '<tr class="detail"><td colspan="6"><ul class="checks">' + c.checks.map(function (x) {
          return '<li><span class="ic ' + (x.pass ? 'ok' : 'fail') + '">' + (x.pass ? '✓' : '✕') + '</span><span><span class="chip">' + (x.platform === 'swift' ? 'SwiftUI' : 'Compose') + '</span> ' + esc(x.label) + (x.expect ? ' - expects <code>' + esc(x.expect) + '</code>' : ' - output must contain no TODO markers') + '</span></li>';
        }).join('') + '</ul><div style="margin-top:6px"><a href="#/translate/' + c.surfaceId + '?cfg=' + cfg.id + '">Open in trace view →</a></div></td></tr>';
      }
    });
    html += '</tbody></table></div><div class="note" style="margin-top:8px">Click a row to see each assertion. Failures on TransactionHistoryList and PriceChartHeader are known library gaps (ternary render, useMemo, Animated) that the agentic config routes to human review instead of guessing.</div>';
    $view.innerHTML = html;
  }
  function runEvalAnimated() {
    state.evalResult = null;
    renderEval(true);
    var prog = document.getElementById('evalProg');
    var steps = KB.surfaces.length, i = 0;
    var tick = setInterval(function () {
      i++;
      if (prog) prog.style.width = Math.round(i / steps * 100) + '%';
      if (i >= steps) {
        clearInterval(tick);
        state.evalResult = evalFor(state.evalCfg);
        renderEval();
      }
    }, 70);
  }

  // ---------------- compare ----------------
  function renderCompare() {
    var A = cfgById[state.cmpA], B = cfgById[state.cmpB];
    var ea = evalFor(A.id), eb = evalFor(B.id);
    var surface = surfById[state.cmpSurface];
    var ra = run(surface.id, A.id), rb = run(surface.id, B.id);
    var p = state.cmpPlat;
    var setOf = function (lines) { var o = {}; lines.forEach(function (l) { o[l.text.trim()] = true; }); return o; };
    var sa = setOf(ra[p]), sb = setOf(rb[p]);
    var clsA = {}, clsB = {};
    ra[p].forEach(function (l, i) { if (l.text.trim() && !sb[l.text.trim()]) clsA[i] = 'del'; });
    rb[p].forEach(function (l, i) { if (l.text.trim() && !sa[l.text.trim()]) clsB[i] = 'add'; });
    var ca = T.evaluate(surface, ra), cb = T.evaluate(surface, rb);

    var rows = [
      ['Assertion accuracy', ea.summary.assertionAccuracy, eb.summary.assertionAccuracy],
      ['Surfaces fully passing', ea.summary.casePassRate, eb.summary.casePassRate],
      ['Source lines mapped', ea.summary.coverage, eb.summary.coverage],
      ['Output lines grounded', ea.summary.grounding, eb.summary.grounding]
    ];
    var bars = rows.map(function (r) {
      var d = r[2] - r[1];
      return '<div><b>' + r[0] + '</b></div><div><div class="bar"><i style="width:' + r[1] * 100 + '%"></i></div><div class="bar b" style="margin-top:3px"><i style="width:' + r[2] * 100 + '%"></i></div></div>' +
        '<div class="delta ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '') + '">' + (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + '</div>';
    }).join('');
    var table = rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + pct(r[1]) + '</td><td>' + pct(r[2]) + '</td></tr>'; }).join('');
    var perCase = ea.cases.map(function (c, i) {
      var c2 = eb.cases[i], d = c2.passed - c.passed;
      return '<tr class="row" data-cmp="' + c.surfaceId + '"' + (c.surfaceId === surface.id ? ' style="background:var(--blue-soft)"' : '') + '><td>' + esc(surfById[c.surfaceId].name) + '</td><td>' + c.passed + '/' + c.total + '</td><td>' + c2.passed + '/' + c2.total + '</td><td class="delta ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '') + '">' + (d > 0 ? '+' : '') + d + '</td></tr>';
    }).join('');
    var surfOpts = KB.surfaces.map(function (s) { return '<option value="' + s.id + '"' + (s.id === surface.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');

    $view.innerHTML =
      '<div class="card"><div class="toolbar"><div class="grow"><div class="h">Compare two configurations</div><div class="p">Same seeded surfaces, same golden checks - only the agent configuration changes.</div></div>' +
      '<label class="lbl">Config A<select id="cmpA">' + cfgOptions(A.id) + '</select></label>' +
      '<label class="lbl">Config B<select id="cmpB">' + cfgOptions(B.id) + '</select></label></div></div>' +
      '<div class="two" style="margin-top:12px">' +
      '<div class="card"><div class="card-head"><h3>Eval set results</h3><span class="note"><span class="chip blue">A</span> ' + esc(A.name) + ' &nbsp; <span class="chip ok">B</span> ' + esc(B.name) + '</span></div>' +
      '<div class="pad"><div class="cmpbars">' + bars + '</div>' +
      '<table class="t" style="margin-top:10px"><thead><tr><th>Metric</th><th>A</th><th>B</th></tr></thead><tbody>' + table + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-head"><h3>Per surface (golden checks passed)</h3></div><table class="t"><thead><tr><th>Surface</th><th>A</th><th>B</th><th>Δ</th></tr></thead><tbody>' + perCase + '</tbody></table></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px"><div class="toolbar"><div class="grow"><div class="h">Side-by-side output</div><div class="p">Lines only in A are red, lines only in B are green. Click a row above to switch surface.</div></div>' +
      '<label class="lbl">Surface<select id="cmpSurf">' + surfOpts + '</select></label>' +
      '<div class="seg" id="cmpPlat"><button data-plat="swift" class="' + (p === 'swift' ? 'on' : '') + '">SwiftUI</button><button data-plat="kotlin" class="' + (p === 'kotlin' ? 'on' : '') + '">Compose</button></div></div></div>' +
      '<div class="two" style="margin-top:10px">' +
      pane('A · ' + A.name, ca.passed + '/' + ca.total + ' checks · ' + pct(ra.metrics.grounding) + ' grounded', codeLines(ra[p], 'a', null, null, clsA)) +
      pane('B · ' + B.name, cb.passed + '/' + cb.total + ' checks · ' + pct(rb.metrics.grounding) + ' grounded', codeLines(rb[p], 'b', null, null, clsB)) +
      '</div>';
  }

  // ---------------- events ----------------
  $view.addEventListener('click', function (e) {
    var t = e.target;
    var li = t.closest('[data-surface]');
    if (li) { location.hash = '#/translate/' + li.dataset.surface + '?cfg=' + state.cfg; return; }
    if (t.id === 'runBtn') { cache = {}; renderTranslate(true); return; }
    if (t.dataset.act === 'clearsel') { state.sel = null; renderTranslate(false); return; }
    var ln = t.closest('.ln');
    if (ln && ['source', 'swift', 'kotlin'].indexOf(ln.dataset.p) >= 0) {
      var i = +ln.dataset.i;
      if (state.sel && state.sel.platform === ln.dataset.p && state.sel.i === i) state.sel = null;
      else state.sel = { platform: ln.dataset.p, i: i };
      var scrolls = Array.prototype.map.call($view.querySelectorAll('.code'), function (c) { return c.scrollTop; });
      var y = window.scrollY;
      renderTranslate(false);
      $view.querySelectorAll('.code').forEach(function (c, k) { c.scrollTop = scrolls[k] || 0; });
      window.scrollTo(0, y);
      return;
    }
    if (t.id === 'evalBtn') { runEvalAnimated(); return; }
    var row = t.closest('tr[data-case]');
    if (row && !t.closest('a')) { state.evalOpen[row.dataset.case] = !state.evalOpen[row.dataset.case]; renderEval(); return; }
    var cr = t.closest('tr[data-cmp]');
    if (cr) { state.cmpSurface = cr.dataset.cmp; renderCompare(); return; }
    var pb = t.closest('[data-plat]');
    if (pb) { state.cmpPlat = pb.dataset.plat; renderCompare(); }
  });
  $view.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'cfgSel') { state.cfg = t.value; state.sel = null; location.hash = '#/translate/' + state.surface + '?cfg=' + state.cfg; }
    else if (t.id === 'evalCfg') { state.evalCfg = t.value; state.evalResult = null; renderEval(); }
    else if (t.id === 'cmpA') { state.cmpA = t.value; renderCompare(); }
    else if (t.id === 'cmpB') { state.cmpB = t.value; renderCompare(); }
    else if (t.id === 'cmpSurf') { state.cmpSurface = t.value; renderCompare(); }
  });

  if (!location.hash) state.ran[state.surface + '|' + state.cfg] = false;
  route();
  if (!location.hash || /^#\/?translate/.test(location.hash)) {
    if (!state.ran[state.surface + '|' + state.cfg]) renderTranslate(true);
  }
})();
