/*
 * Native Rebuild Copilot - translation engine.
 * Deterministic, rule- and retrieval-based translator from a constrained
 * React Native (TSX) subset to SwiftUI and Jetpack Compose. Every generated
 * line carries a trace back to source line(s), pattern-library rule(s) and
 * design-token record(s). Runs fully in the browser; no external services.
 */
(function (root) {
  'use strict';

  var IND = '    ';
  var TOKEN_RE = /\b(colors|spacing|radii|typography)\.(\w+)\b/g;
  var RN_BUILTINS = ['View', 'Text', 'ScrollView', 'Pressable', 'TouchableOpacity', 'Switch', 'TextInput',
    'ActivityIndicator', 'Image', 'FlatList'];

  function indexBy(arr, key) {
    var o = {};
    arr.forEach(function (x) { o[x[key || 'id']] = x; });
    return o;
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function snake(s) { return s.replace(/([A-Z])/g, '_$1').toLowerCase(); }

  // ---------- small parsers ----------
  function readBalanced(s, i) {
    // s[i] === '{'; returns index of matching '}'
    var depth = 0, quote = null;
    for (var j = i; j < s.length; j++) {
      var c = s[j];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return j; }
    }
    return -1;
  }

  function scanTag(t) {
    var m = /^<([\w.]+)/.exec(t);
    if (!m) return null;
    var name = m[1], i = m[0].length, depth = 0, quote = null;
    for (; i < t.length; i++) {
      var c = t[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    if (i >= t.length) return null;
    var selfClosing = t[i - 1] === '/';
    return {
      name: name,
      attrs: parseAttrs(t.slice(m[0].length, selfClosing ? i - 1 : i).trim()),
      selfClosing: selfClosing,
      rest: t.slice(i + 1)
    };
  }

  function parseAttrs(s) {
    var attrs = {}, i = 0;
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      var m = /^[A-Za-z_]\w*/.exec(s.slice(i));
      if (!m) break;
      var name = m[0];
      i += name.length;
      if (s[i] === '=') {
        i++;
        if (s[i] === '"') {
          var end = s.indexOf('"', i + 1);
          attrs[name] = { type: 'str', v: s.slice(i + 1, end) };
          i = end + 1;
        } else if (s[i] === '{') {
          var close = readBalanced(s, i);
          attrs[name] = { type: 'expr', v: s.slice(i + 1, close).trim() };
          i = close + 1;
        }
      } else {
        attrs[name] = { type: 'bool', v: 'true' };
      }
    }
    return attrs;
  }

  function splitTop(s, sep) {
    var out = [], depth = 0, quote = null, start = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if ('({['.indexOf(c) >= 0) depth++;
      else if (')}]'.indexOf(c) >= 0) depth--;
      else if (c === sep && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    out.push(s.slice(start));
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function parseStyle(attr) {
    if (!attr || attr.type !== 'expr') return [];
    var body = attr.v.trim().replace(/^\{/, '').replace(/\}$/, '');
    return splitTop(body, ',').map(function (p) {
      if (p.indexOf('...') === 0) return { key: '...', value: p.slice(3).trim() };
      var k = p.indexOf(':');
      return { key: p.slice(0, k).trim(), value: p.slice(k + 1).trim() };
    });
  }

  function lit(v) { return v.replace(/'([^']*)'/g, '"$1"'); }

  // ---------- type mapping ----------
  function mapType(t, platform) {
    t = t.trim();
    var fn = /^\((.*)\)\s*=>\s*(\w+)$/.exec(t);
    if (fn) {
      var params = fn[1].trim() ? fn[1].split(',').map(function (p) {
        var parts = p.split(':');
        return mapType(parts[1] || 'any', platform);
      }) : [];
      var ret = fn[2] === 'void' ? (platform === 'swift' ? 'Void' : 'Unit') : mapType(fn[2], platform);
      return '(' + params.join(', ') + ') -> ' + ret;
    }
    var arr = /^(\w+)\[\]$/.exec(t);
    if (arr) return platform === 'swift' ? '[' + mapType(arr[1], platform) + ']' : 'List<' + mapType(arr[1], platform) + '>';
    var map = { string: 'String', number: 'Double', boolean: platform === 'swift' ? 'Bool' : 'Boolean', any: platform === 'swift' ? 'Any' : 'Any' };
    return map[t] || t;
  }

  // ---------- engine ----------
  function translate(surface, config, kb) {
    var rules = indexBy(kb.rules);
    var tokenByRn = indexBy(kb.tokens, 'rn');
    var allowed = function (id) { return !!rules[id] && config.tiers.indexOf(rules[id].tier) >= 0; };

    var lines = surface.source.split('\n');
    var swift = [], kotlin = [];
    var source = lines.map(function (t, i) {
      return { n: i + 1, text: t, rules: [], status: t.trim() ? 'pending' : 'blank', gap: null, blockedBy: null, dropped: [] };
    });
    var notes = { unknownTokens: [], dropped: [], guessed: [], tokenRefs: 0, tokensResolved: 0 };
    var sd = 0, kd = 0;
    var st = {
      name: null, props: [], typeLine: null, states: [], setters: {}, stateFromProp: [],
      rootSwiftMods: [], stack: [], inComponent: false, inBody: false, jsxCount: 0, hookCount: 0
    };
    var cur = null;

    function use(id) {
      if (!allowed(id)) { if (!cur.blockedBy) cur.blockedBy = id; return false; }
      cur.rules.push(id);
      return true;
    }
    function try_(id) { // use an optional rule; returns whether allowed
      if (!allowed(id)) return false;
      cur.rules.push(id);
      return true;
    }

    function mkLine(platform, depth, text, o) {
      o = o || {};
      var toks = o.toks || cur.tokens, guesses = o.guesses || cur.guesses;
      var src = o.src || [cur.n];
      var line = {
        text: text === '' ? '' : IND.repeat(Math.max(depth, 0)) + text,
        src: uniq(src),
        rule: o.rule || cur.rules[0] || null,
        rules: uniq([o.rule].concat(o.rules || cur.rules).filter(Boolean)),
        tokens: uniq(toks.filter(function (t) { return text.indexOf(t[platform]) >= 0; }).map(function (t) { return t.id; })),
        guessed: uniq(guesses.filter(function (g) { return text.indexOf(g[platform]) >= 0; }).map(function (g) { return g.key; })),
        gap: o.gap || null,
        blockedBy: o.blockedBy || null
      };
      return line;
    }
    function S(text, o) { swift.push(mkLine('swift', sd, text, o)); }
    function K(text, o) { kotlin.push(mkLine('kotlin', kd, text, o)); }
    function blank() {
      if (swift.length && swift[swift.length - 1].text === '') return;
      swift.push({ text: '', src: [], rules: [], tokens: [], guessed: [] });
      kotlin.push({ text: '', src: [], rules: [], tokens: [], guessed: [] });
    }

    // token resolution
    function resolve(expr, platform) {
      return expr.replace(TOKEN_RE, function (m, group, name) {
        var key = group + '.' + name;
        if (platform === 'swift') notes.tokenRefs++;
        if (config.tokenRetrieval) {
          var tok = tokenByRn[key];
          if (tok) {
            if (platform === 'swift') notes.tokensResolved++;
            if (cur.tokens.indexOf(tok) < 0) cur.tokens.push(tok);
            return tok[platform];
          }
          notes.unknownTokens.push({ key: key, n: cur.n });
          return '/* TODO token ' + key + ' */';
        }
        var g = {
          colors: { swift: 'Color("' + name + '")', kotlin: 'colorResource(R.color.' + snake(name) + ')' },
          spacing: { swift: '16', kotlin: '16.dp' },
          radii: { swift: '8', kotlin: '8.dp' },
          typography: { swift: '.body', kotlin: 'MaterialTheme.typography.bodyMedium' }
        }[group];
        var guess = { key: key, swift: g.swift, kotlin: g.kotlin, n: cur.n };
        if (!cur.guesses.some(function (x) { return x.key === key; })) cur.guesses.push(guess);
        if (platform === 'swift') notes.guessed.push(guess);
        return g[platform];
      });
    }

    function exprS(e) {
      e = lit(e.trim()).replace(/!==/g, '!=').replace(/===/g, '==').replace(/\.length\b/g, '.count');
      if (/\.toFixed\(/.test(e) && try_('R-NUMBER-FORMAT')) {
        e = e.replace(/([\w.]+)\.toFixed\((\d+)\)/g, function (m, a, n) { return 'String(format: "%.' + n + 'f", ' + a + ')'; });
      }
      return resolve(e, 'swift');
    }
    function exprK(e) {
      e = lit(e.trim()).replace(/!==/g, '!=').replace(/===/g, '==');
      if (/\.toFixed\(/.test(e) && try_('R-NUMBER-FORMAT')) {
        e = e.replace(/([\w.]+)\.toFixed\((\d+)\)/g, function (m, a, n) { return '"%.' + n + 'f".format(' + a + ')'; });
      }
      var t = /^(.+?) \? (.+?) : (.+)$/.exec(e);
      if (t) e = 'if (' + t[1] + ') ' + t[2] + ' else ' + t[3];
      return resolve(e, 'kotlin');
    }
    function stmtS(b) {
      b = b.trim().replace(/;$/, '');
      var m = /^(set\w+)\((.*)\)$/.exec(b);
      if (m && st.setters[m[1]]) return st.setters[m[1]] + ' = ' + exprS(m[2]);
      return exprS(b);
    }
    function stmtK(b) {
      b = b.trim().replace(/;$/, '');
      var m = /^(set\w+)\((.*)\)$/.exec(b);
      if (m && st.setters[m[1]]) return st.setters[m[1]] + ' = ' + exprK(m[2]);
      return exprK(b);
    }
    function handler(attr) {
      if (!attr) return { s: '{}', k: '{}', ks: '{ }' };
      var e = attr.v.trim();
      if (/^\w+$/.test(e)) return { s: e, k: '{ ' + e + '() }', ref: e };
      var m = /^\(\)\s*=>\s*(.+)$/.exec(e);
      if (m) return { s: '{ ' + stmtS(m[1]) + ' }', k: '{ ' + stmtK(m[1]) + ' }' };
      return { s: exprS(e), k: exprK(e) };
    }
    function textParts(content) {
      var parts = [], re = /\{([^}]*)\}/g, last = 0, m;
      while ((m = re.exec(content))) {
        if (m.index > last) parts.push({ lit: content.slice(last, m.index) });
        parts.push({ expr: m[1] });
        last = re.lastIndex;
      }
      if (last < content.length) parts.push({ lit: content.slice(last) });
      return parts;
    }
    function textS(content) {
      return textParts(content).map(function (p) {
        return p.lit !== undefined ? p.lit.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : '\\(' + exprS(p.expr) + ')';
      }).join('');
    }
    function textK(content) {
      var parts = textParts(content);
      return parts.map(function (p, i) {
        if (p.lit !== undefined) return p.lit.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
        var e = exprK(p.expr);
        var next = parts[i + 1];
        var simple = /^\w+$/.test(e) && !(next && next.lit && /^\w/.test(next.lit));
        return simple ? '$' + e : '${' + e + '}';
      }).join('');
    }

    function dim(v, platform) {
      v = v.trim();
      if (/^-?\d+(\.\d+)?$/.test(v)) return platform === 'swift' ? v : v + '.dp';
      return platform === 'swift' ? exprS(v) : exprK(v);
    }

    // style -> modifiers
    function buildStyle(entries, opts) {
      var r = { sw: [], k: { fill: [], size: [], clip: [], bg: [], click: [], pad: [], alpha: [] }, kParams: [], gapS: null, gapK: null,
        center: false, row: false, spaceBetween: false };
      var swOrder = { font: 1, fg: 2, pad: 3, size: 4, flex: 5, bg: 6, clip: 7 };
      var sw = [];
      var box = false, text = false;
      entries.forEach(function (e) {
        var k = e.key, v = e.value;
        if (k === '...' && /^typography\./.test(v)) {
          text = true;
          sw.push({ o: swOrder.font, t: '.font(' + (config.tokenRetrieval ? exprS(v) : exprS(v).replace(/^\.?/, '.')) + ')' });
          r.kParams.push('style = ' + exprK(v));
        } else if (k === 'color') {
          text = true;
          sw.push({ o: swOrder.fg, t: '.foregroundColor(' + exprS(v) + ')' });
          r.kParams.push('color = ' + exprK(v));
        } else if (k === 'padding') {
          box = true; sw.push({ o: swOrder.pad, t: '.padding(' + dim(v, 'swift') + ')' }); r.k.pad.push('padding(' + dim(v, 'kotlin') + ')');
        } else if (k === 'paddingHorizontal' || k === 'paddingVertical') {
          box = true;
          var axis = k === 'paddingHorizontal' ? 'horizontal' : 'vertical';
          sw.push({ o: swOrder.pad, t: '.padding(.' + axis + ', ' + dim(v, 'swift') + ')' });
          r.k.pad.push('padding(' + axis + ' = ' + dim(v, 'kotlin') + ')');
        } else if (k === 'backgroundColor') {
          box = true; sw.push({ o: swOrder.bg, t: '.background(' + exprS(v) + ')' }); r.k.bg.push('background(' + exprK(v) + ')');
        } else if (k === 'borderRadius') {
          box = true; sw.push({ o: swOrder.clip, t: '.clipShape(RoundedRectangle(cornerRadius: ' + dim(v, 'swift') + '))' });
          r.k.clip.push('clip(RoundedCornerShape(' + dim(v, 'kotlin') + '))');
        } else if (k === 'gap') {
          box = true; r.gapS = dim(v, 'swift'); r.gapK = dim(v, 'kotlin');
        } else if (k === 'flexDirection') {
          r.row = /row/.test(v);
        } else if (k === 'alignItems') {
          box = true; r.center = /center/.test(v);
        } else if (k === 'width' || k === 'height') {
          box = true;
        } else if (k === 'flex' && v.trim() === '1') {
          if (try_('R-LAYOUT-FLEX')) {
            if (opts.isRoot) {
              sw.push({ o: swOrder.flex, t: '.frame(maxWidth: .infinity, maxHeight: .infinity)' });
              r.k.fill.push('fillMaxSize()');
            } else {
              sw.push({ o: swOrder.flex, t: opts.parentRow ? '.frame(maxWidth: .infinity, alignment: .leading)' : '.frame(maxWidth: .infinity, alignment: .leading)' });
              r.k.fill.push('weight(1f)');
            }
          } else { r.dropped = (r.dropped || []).concat(k); }
        } else if (k === 'justifyContent' && /space-between/.test(v)) {
          if (try_('R-LAYOUT-SPACE-BETWEEN')) r.spaceBetween = true;
          else r.dropped = (r.dropped || []).concat(k);
        } else {
          r.dropped = (r.dropped || []).concat(k);
        }
      });
      var w = entries.filter(function (e) { return e.key === 'width'; })[0];
      var h = entries.filter(function (e) { return e.key === 'height'; })[0];
      if (w || h) {
        var parts = [];
        if (w) parts.push('width: ' + dim(w.value, 'swift'));
        if (h) parts.push('height: ' + dim(h.value, 'swift'));
        sw.push({ o: swOrder.size, t: '.frame(' + parts.join(', ') + ')' });
        if (w && h && w.value.trim() === h.value.trim()) r.k.size.push('size(' + dim(w.value, 'kotlin') + ')');
        else { if (w) r.k.size.push('width(' + dim(w.value, 'kotlin') + ')'); if (h) r.k.size.push('height(' + dim(h.value, 'kotlin') + ')'); }
      }
      if (box) try_('R-STYLE-BOX');
      if (text) try_('R-STYLE-TEXT');
      (r.dropped || []).forEach(function (d) {
        notes.dropped.push({ prop: d, n: cur.n });
        source[cur.n - 1].dropped.push(d);
      });
      r.sw = sw.sort(function (a, b) { return a.o - b.o; }).map(function (x) { return x.t; });
      return r;
    }
    function kModifier(r, extra) {
      var parts = [].concat(r.k.fill, r.k.size, r.k.clip, r.k.bg, extra || [], r.k.pad);
      return parts.length ? 'Modifier.' + parts.join('.') : null;
    }
    function top() { return st.stack[st.stack.length - 1]; }
    function beforeChild() {
      var t = top();
      if (t && t.spaceBetween) {
        if (t.childCount > 0) S('Spacer()', { rule: 'R-LAYOUT-SPACE-BETWEEN', src: [cur.n, t.openN], toks: [], guesses: [] });
        t.childCount++;
      }
    }
    function parentRow() { var t = top(); return !!(t && t.row); }

    // ---------- element emitters ----------
    function buildCustom(tag) {
      var sArgs = [], kArgs = [];
      Object.keys(tag.attrs).forEach(function (k) {
        var a = tag.attrs[k], sv, kv;
        if (a.type === 'str') { sv = kv = '"' + a.v + '"'; }
        else if (/^\(\)\s*=>/.test(a.v)) { var h = handler(a); sv = h.s; kv = h.k; }
        else { sv = exprS(a.v); kv = exprK(a.v); }
        sArgs.push(k + ': ' + sv);
        kArgs.push(k + ' = ' + kv);
      });
      return { s: tag.name + '(' + sArgs.join(', ') + ')', k: tag.name + '(' + kArgs.join(', ') + ')' };
    }

    function emitLeaf(tag) {
      var a = tag.attrs, name = tag.name;
      st.jsxCount++;
      if (name === 'Switch') {
        if (!use('R-SWITCH')) return false;
        var v = a.value ? a.value.v : 'false';
        var setter = a.onValueChange && st.setters[a.onValueChange.v];
        beforeChild();
        if (setter) {
          S('Toggle("", isOn: $' + setter + ')');
          K('Switch(checked = ' + exprK(v) + ', onCheckedChange = { ' + setter + ' = it })');
        } else {
          var h = handler(a.onValueChange);
          S('Toggle("", isOn: Binding(get: { ' + exprS(v) + ' }, set: { ' + (h.ref || 'cb') + '($0) }))');
          K('Switch(checked = ' + exprK(v) + ', onCheckedChange = { ' + (h.ref || 'cb') + '(it) })');
        }
        S(IND + '.labelsHidden()');
        return true;
      }
      if (name === 'TextInput') {
        if (!use('R-TEXTINPUT')) return false;
        var val = a.value ? a.value.v : '""';
        var set = a.onChangeText && st.setters[a.onChangeText.v];
        var ph = a.placeholder ? a.placeholder.v : '';
        beforeChild();
        S('TextField("' + ph + '", text: $' + (set || val) + ')');
        var kp = ['value = ' + exprK(val), 'onValueChange = { ' + (set || val) + ' = it }'];
        if (ph) kp.push('placeholder = { Text("' + ph + '") }');
        if (a.keyboardType) {
          var kt = { 'decimal-pad': ['.decimalPad', 'Decimal'], 'numeric': ['.numberPad', 'Number'], 'email-address': ['.emailAddress', 'Email'] }[a.keyboardType.v];
          if (kt && try_('R-KEYBOARD-TYPE')) {
            S(IND + '.keyboardType(' + kt[0] + ')');
            kp.push('keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.' + kt[1] + ')');
          } else {
            notes.dropped.push({ prop: 'keyboardType', n: cur.n });
            source[cur.n - 1].dropped.push('keyboardType');
          }
        }
        K('OutlinedTextField(' + kp.join(', ') + ')');
        return true;
      }
      if (name === 'ActivityIndicator') {
        if (!use('R-ACTIVITY')) return false;
        beforeChild();
        S('ProgressView()');
        K('CircularProgressIndicator()');
        return true;
      }
      if (name === 'Image') {
        if (!use('R-IMAGE')) return false;
        var srcAttr = a.source ? a.source.v : '';
        var um = /uri:\s*(.+?)\s*\}?$/.exec(srcAttr.replace(/^\{\s*/, '').replace(/\s*\}$/, ''));
        var uri = um ? um[1] : '""';
        var style = buildStyle(parseStyle(a.style), { parentRow: parentRow() });
        beforeChild();
        S('AsyncImage(url: URL(string: ' + exprS(uri) + '))');
        style.sw.forEach(function (m) { S(IND + m); });
        var mod = kModifier(style);
        K('AsyncImage(model = ' + exprK(uri) + ', contentDescription = null' + (mod ? ', modifier = ' + mod : '') + ')');
        return true;
      }
      if (name === 'FlatList') {
        if (!use('R-FLATLIST')) return false;
        var data = a.data ? a.data.v : 'items';
        var keyM = a.keyExtractor && /=>\s*\w+\.(\w+)/.exec(a.keyExtractor.v);
        var key = keyM ? keyM[1] : 'id';
        var rm = a.renderItem && /=>\s*(<.*\/>)\s*$/.exec(a.renderItem.v);
        var inner = rm ? scanTag(rm[1]) : null;
        if (!inner) return false;
        cur.rules.push('R-CUSTOM-COMPONENT');
        var call = buildCustom(inner);
        beforeChild();
        S('List(' + exprS(data) + ', id: \\.' + key + ') { item in');
        S(IND + call.s);
        S('}');
        S('.listStyle(.plain)');
        K('LazyColumn {');
        K(IND + 'items(' + exprK(data) + ', key = { it.' + key + ' }) { item ->');
        K(IND + IND + call.k);
        K(IND + '}');
        K('}');
        return true;
      }
      if (RN_BUILTINS.indexOf(name) < 0 && /^[A-Z]\w*$/.test(name)) {
        if (!use('R-CUSTOM-COMPONENT')) return false;
        var c = buildCustom(tag);
        beforeChild();
        S(c.s);
        K(c.k);
        return true;
      }
      return false;
    }

    function emitText(tag, content) {
      if (!use('R-TEXT')) return false;
      st.jsxCount++;
      var style = buildStyle(parseStyle(tag.attrs.style), { parentRow: parentRow() });
      beforeChild();
      S('Text("' + textS(content) + '")');
      style.sw.forEach(function (m) { S(IND + m); });
      var kp = ['text = "' + textK(content) + '"'].concat(style.kParams);
      var mod = kModifier(style);
      if (mod) kp.push('modifier = ' + mod);
      K('Text(' + kp.join(', ') + ')');
      return true;
    }

    function openContainer(tag) {
      var name = tag.name, a = tag.attrs;
      var kind = name === 'View' ? 'view' : name === 'ScrollView' ? 'scroll' : 'press';
      var entries = parseStyle(a.style);
      var isRow = entries.some(function (e) { return e.key === 'flexDirection' && /row/.test(e.value); });
      var ruleId = kind === 'view' ? (isRow ? 'R-VIEW-ROW' : 'R-VIEW-COLUMN') : kind === 'scroll' ? 'R-SCROLLVIEW' : 'R-PRESSABLE';
      if (!use(ruleId)) return false;
      st.jsxCount++;
      var isRoot = st.stack.length === 0;
      var style = buildStyle(entries, { parentRow: parentRow(), isRoot: isRoot });
      beforeChild();
      var sOpen, kOpen, kArgs = [];
      if (kind === 'view') {
        if (style.row) {
          sOpen = 'HStack(alignment: ' + (style.center ? '.center' : '.top') + ', spacing: ' + (style.gapS || '0') + ') {';
          var m1 = kModifier(style); if (m1) kArgs.push('modifier = ' + m1);
          if (style.spaceBetween) kArgs.push('horizontalArrangement = Arrangement.SpaceBetween');
          else if (style.gapK) kArgs.push('horizontalArrangement = Arrangement.spacedBy(' + style.gapK + ')');
          if (style.center) kArgs.push('verticalAlignment = Alignment.CenterVertically');
          kOpen = 'Row(' + kArgs.join(', ') + ') {';
        } else {
          sOpen = 'VStack(alignment: ' + (style.center ? '.center' : '.leading') + ', spacing: ' + (style.gapS || '0') + ') {';
          var m2 = kModifier(style); if (m2) kArgs.push('modifier = ' + m2);
          if (style.gapK) kArgs.push('verticalArrangement = Arrangement.spacedBy(' + style.gapK + ')');
          if (style.center) kArgs.push('horizontalAlignment = Alignment.CenterHorizontally');
          kOpen = 'Column(' + kArgs.join(', ') + ') {';
        }
      } else if (kind === 'scroll') {
        sOpen = 'ScrollView {';
        kOpen = 'Column(modifier = ' + kModifier(style, ['verticalScroll(rememberScrollState())']) + ') {';
      } else {
        var h = handler(a.onPress);
        sOpen = 'Button(action: ' + h.s + ') {';
        kOpen = 'Box(modifier = ' + kModifier(style, ['clickable ' + h.k]) + ') {';
      }
      S(sOpen);
      K(kOpen);
      var mods = (kind === 'press' ? ['.buttonStyle(.plain)'] : []).concat(style.sw);
      st.stack.push({ type: 'tag', tag: name, kind: kind, row: style.row, spaceBetween: style.spaceBetween && kind === 'view',
        childCount: 0, swiftMods: mods, openN: cur.n, rule: ruleId, rules: cur.rules.slice(), toks: cur.tokens.slice(), guesses: cur.guesses.slice() });
      sd++; kd++;
      return true;
    }

    function closeEntry(entry) {
      st.stack.pop();
      sd--; kd--;
      var o = { src: [cur.n, entry.openN], rule: entry.rule, rules: entry.rules, toks: entry.toks, guesses: entry.guesses };
      S('}', o);
      entry.swiftMods.forEach(function (m) { S(m, o); });
      K('}', o);
      if (st.stack.length === 0 && st.rootSwiftMods.length) {
        st.rootSwiftMods.forEach(function (rm) {
          rm.lines.forEach(function (l) { S(l, { src: [rm.n], rule: 'R-EFFECT', rules: ['R-EFFECT'], toks: [], guesses: [] }); });
        });
      }
    }

    function findGap(t) {
      if (/\?\s*</.test(t)) return 'GAP-TERNARY-RENDER';
      if (/useMemo/.test(t)) return 'GAP-USEMEMO';
      if (/Animated/.test(t)) return 'GAP-ANIMATED';
      return null;
    }

    // ---------- line handler ----------
    function handle(t) {
      var m;
      if ((m = /^import (.+) from '([^']+)';?$/.exec(t))) {
        var mod = m[2];
        var names = (/\{([^}]*)\}/.exec(m[1]) || [, ''])[1].split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        if (mod === 'react') {
          use('R-IMPORT-REACT');
          K('import androidx.compose.runtime.*');
          return true;
        }
        if (mod === 'react-native') {
          use('R-IMPORT-RN');
          S('import SwiftUI');
          K('import androidx.compose.foundation.layout.*');
          K('import androidx.compose.material3.*');
          K('import androidx.compose.ui.Modifier');
          K('import androidx.compose.ui.unit.dp');
          if (names.indexOf('View') >= 0) {
            K('import androidx.compose.ui.Alignment');
            K('import androidx.compose.ui.draw.clip');
            K('import androidx.compose.foundation.background');
            K('import androidx.compose.foundation.shape.RoundedCornerShape');
          }
          if (names.indexOf('Pressable') >= 0) K('import androidx.compose.foundation.clickable');
          if (names.indexOf('ScrollView') >= 0) { K('import androidx.compose.foundation.rememberScrollState'); K('import androidx.compose.foundation.verticalScroll'); }
          if (names.indexOf('FlatList') >= 0) K('import androidx.compose.foundation.lazy.*');
          if (names.indexOf('Image') >= 0) K('import coil.compose.AsyncImage');
          if (names.indexOf('TextInput') >= 0) { K('import androidx.compose.foundation.text.KeyboardOptions'); K('import androidx.compose.ui.text.input.KeyboardType'); }
          return true;
        }
        if (/design\/tokens$/.test(mod)) {
          use('R-IMPORT-TOKENS');
          S('import DesignSystem');
          K('import com.example.designsystem.DSTheme');
          return true;
        }
        use('R-IMPORT-LOCAL');
        if (mod.charAt(0) !== '.') {
          var pkg = mod.replace(/^@app\//, '');
          S('import ' + cap(pkg));
          names.forEach(function (n) { K('import com.example.' + pkg + '.' + n); });
        }
        return true;
      }
      if ((m = /^type Props = \{(.*)\};?$/.exec(t))) {
        use('R-PROPS-TYPE');
        st.typeLine = cur.n;
        st.props = splitTop(m[1], ';').map(function (p) {
          var i = p.indexOf(':');
          return { name: p.slice(0, i).trim(), type: p.slice(i + 1).trim() };
        });
        return true;
      }
      if ((m = /^export (?:default )?function (\w+)\((.*)\) \{$/.exec(t))) {
        use('R-COMPONENT');
        st.name = m[1];
        st.inComponent = true;
        var declared = (/\{([^}]*)\}/.exec(m[2]) || [, ''])[1].split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        var props = declared.map(function (n) {
          var p = st.props.filter(function (x) { return x.name === n; })[0];
          return p || { name: n, type: 'any' };
        });
        st.props = props;
        var extra = st.typeLine ? [st.typeLine] : [];
        if (props.length) cur.rules.push('R-PROPS-TYPE');
        if (swift.length) blank();
        S('struct ' + st.name + ': View {', { src: [cur.n].concat(extra) });
        sd = 1;
        props.forEach(function (p) { S('let ' + p.name + ': ' + mapType(p.type, 'swift'), { src: [cur.n].concat(extra), rule: 'R-PROPS-TYPE' }); });
        K('@Composable');
        K('fun ' + st.name + '(' + props.map(function (p) { return p.name + ': ' + mapType(p.type, 'kotlin'); }).join(', ') + ') {', { src: [cur.n].concat(extra) });
        kd = 1;
        return true;
      }
      if ((m = /^const \[(\w+), (set\w+)\] = useState\((.*)\);?$/.exec(t))) {
        use('R-STATE');
        st.hookCount++;
        var v = m[1], init = lit(m[3].trim());
        st.setters[m[2]] = v;
        st.states.push(v);
        var fromProp = st.props.filter(function (p) { return p.name === init; })[0];
        if (fromProp && try_('R-STATE-FROM-PROP')) {
          S('@State private var ' + v + ': ' + mapType(fromProp.type, 'swift'));
          st.stateFromProp.push({ v: v, prop: fromProp, n: cur.n });
        } else {
          S('@State private var ' + v + ' = ' + init);
        }
        K('var ' + v + ' by remember { mutableStateOf(' + init + ') }');
        return true;
      }
      if ((m = /^useEffect\(\(\) => \{ (.*?) \}, \[(.*?)\]\);?$/.exec(t))) {
        st.hookCount++;
        if (!use('R-EFFECT')) return false;
        var body = splitTop(m[1], ';').map(stmtS);
        var bodyK = splitTop(m[1], ';').map(stmtK);
        var dep = m[2].trim().split(',')[0].trim();
        st.rootSwiftMods.push({ n: cur.n, lines: [dep ? '.task(id: ' + dep + ') {' : '.task {'].concat(body.map(function (b) { return IND + b; }), ['}']) });
        K('LaunchedEffect(' + (dep || 'Unit') + ') {');
        bodyK.forEach(function (b) { K(IND + b); });
        K('}');
        return true;
      }
      if (t === 'return (' && st.inComponent) {
        use('R-RENDER-RETURN');
        if (st.stateFromProp.length) {
          var src = [cur.n].concat(st.stateFromProp.map(function (x) { return x.n; }), st.typeLine ? [st.typeLine] : []);
          var o = { src: src, rule: 'R-STATE-FROM-PROP', rules: ['R-STATE-FROM-PROP'] };
          swift.push({ text: '', src: [], rules: [], tokens: [], guessed: [] });
          S('init(' + st.props.map(function (p) {
            var ty = mapType(p.type, 'swift');
            return p.name + ': ' + (ty.indexOf('->') >= 0 ? '@escaping ' : '') + ty;
          }).join(', ') + ') {', o);
          st.props.forEach(function (p) { S(IND + 'self.' + p.name + ' = ' + p.name, o); });
          st.stateFromProp.forEach(function (x) { S(IND + '_' + x.v + ' = State(initialValue: ' + x.prop.name + ')', o); });
          S('}', o);
        }
        swift.push({ text: '', src: [], rules: [], tokens: [], guessed: [] });
        S('var body: some View {');
        sd = 2;
        st.inBody = true;
        return true;
      }
      if (t === ');' && st.inBody && st.stack.length === 0) {
        use('R-RENDER-RETURN');
        sd = 1;
        S('}');
        st.inBody = false;
        return true;
      }
      if (t === '}' && st.inComponent && !st.inBody) {
        use('R-BLOCK-CLOSE');
        sd = 0; kd = 0;
        S('}'); K('}');
        st.inComponent = false;
        return true;
      }
      if ((m = /^<\/([\w.]+)>$/.exec(t))) {
        var tp = top();
        if (tp && tp.type === 'tag' && tp.tag === m[1]) {
          cur.rules.push(tp.rule);
          closeEntry(tp);
          return true;
        }
        return false;
      }
      if ((m = /^\{(.+?) && \($/.exec(t))) {
        if (!use('R-COND-RENDER')) return false;
        beforeChild();
        S('if ' + exprS(m[1]) + ' {');
        K('if (' + exprK(m[1]) + ') {');
        st.stack.push({ type: 'cond', openN: cur.n });
        sd++; kd++;
        return true;
      }
      if (t === ')}') {
        var c = top();
        if (c && c.type === 'cond') {
          cur.rules.push('R-COND-RENDER');
          st.stack.pop();
          sd--; kd--;
          var oc = { src: [cur.n, c.openN], rule: 'R-COND-RENDER' };
          S('}', oc); K('}', oc);
          return true;
        }
        return false;
      }
      if ((m = /^\{([^?]+?) && (<.*\/>)\}$/.exec(t))) {
        var innerTag = scanTag(m[2]);
        if (!innerTag || !use('R-COND-RENDER')) return false;
        var before = { s: swift.length, k: kotlin.length };
        beforeChild();
        S('if ' + exprS(m[1]) + ' {'); K('if (' + exprK(m[1]) + ') {');
        sd++; kd++;
        var saved = st.stack; st.stack = [];
        var ok = emitLeaf(innerTag);
        st.stack = saved;
        sd--; kd--;
        if (!ok) { swift.length = before.s; kotlin.length = before.k; return false; }
        S('}'); K('}');
        return true;
      }
      if (t.charAt(0) === '<' && t.charAt(1) !== '/') {
        var tag = scanTag(t);
        if (!tag) return false;
        if (tag.name === 'Text' && !tag.selfClosing) {
          var tm = /^(.*)<\/Text>$/.exec(tag.rest);
          if (!tm) return false;
          return emitText(tag, tm[1]);
        }
        if (!tag.selfClosing && ['View', 'ScrollView', 'Pressable', 'TouchableOpacity'].indexOf(tag.name) >= 0) return openContainer(tag);
        if (tag.selfClosing) return emitLeaf(tag);
        return false;
      }
      return false;
    }

    lines.forEach(function (raw, i) {
      var t = raw.trim();
      cur = { n: i + 1, rules: [], tokens: [], guesses: [], blockedBy: null };
      if (!t) {
        if (!st.inComponent && swift.length) blank();
        return;
      }
      var sLen = swift.length, kLen = kotlin.length;
      var ok = handle(t);
      var info = source[i];
      if (!ok) {
        swift.length = sLen; kotlin.length = kLen;
        var gap = findGap(t);
        info.status = 'unmapped';
        info.gap = gap;
        info.blockedBy = cur.blockedBy;
        cur.rules = [];
        var o = { rule: 'UNMAPPED', rules: ['UNMAPPED'], gap: gap, blockedBy: cur.blockedBy, toks: [], guesses: [] };
        S('// TODO(migration): unmapped L' + (i + 1) + ': ' + t, o);
        K('// TODO(migration): unmapped L' + (i + 1) + ': ' + t, o);
      } else {
        info.status = info.dropped.length ? 'partial' : 'mapped';
        info.rules = uniq(cur.rules);
      }
    });

    // ---------- self-check ----------
    var checks = [];
    if (config.selfCheck) {
      source.filter(function (s) { return s.status === 'unmapped'; }).forEach(function (s) {
        checks.push({ level: 'error', msg: 'L' + s.n + ' has no reviewed pattern' + (s.gap ? ' (' + s.gap + ')' : '') + ' - routed to human review', src: [s.n] });
      });
      notes.dropped.forEach(function (d) { checks.push({ level: 'warn', msg: 'Style prop "' + d.prop + '" on L' + d.n + ' was not translated', src: [d.n] }); });
      notes.unknownTokens.forEach(function (u) { checks.push({ level: 'warn', msg: 'Token ' + u.key + ' (L' + u.n + ') not found in registry', src: [u.n] }); });
      [['SwiftUI', swift], ['Compose', kotlin]].forEach(function (pair) {
        var bal = 0;
        pair[1].forEach(function (l) {
          var s = l.text.replace(/"(?:[^"\\]|\\.)*"/g, '').replace(/\/\/.*$/, '');
          bal += (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
        });
        checks.push({ level: bal === 0 ? 'ok' : 'error', msg: pair[0] + ' braces ' + (bal === 0 ? 'balanced' : 'unbalanced (' + bal + ')'), src: [] });
      });
      var bindings = [];
      swift.forEach(function (l) {
        var s = l.text.replace(/"(?:[^"\\]|\\.)*"/g, '').replace(/\/\/.*$/, '');
        (s.match(/\$(\w+)/g) || []).forEach(function (b) { bindings.push(b.slice(1)); });
      });
      var badBind = uniq(bindings).filter(function (b) { return st.states.indexOf(b) < 0; });
      checks.push({ level: badBind.length ? 'error' : 'ok', msg: badBind.length ? 'Bindings without @State: ' + badBind.join(', ') : 'All $bindings refer to declared @State (' + uniq(bindings).length + ')', src: [] });
      if (st.stateFromProp.length) checks.push({ level: 'ok', msg: 'State seeded from props initialised in init()', src: st.stateFromProp.map(function (x) { return x.n; }) });
    }

    // ---------- metrics & agent steps ----------
    var nonBlank = source.filter(function (s) { return s.status !== 'blank'; });
    var mapped = nonBlank.filter(function (s) { return s.status === 'mapped' || s.status === 'partial'; });
    var outLines = swift.concat(kotlin).filter(function (l) { return l.text.trim(); });
    var grounded = outLines.filter(function (l) { return l.src.length && l.rule !== 'UNMAPPED' && !l.guessed.length; });
    var usedRules = uniq([].concat.apply([], source.map(function (s) { return s.rules; })));
    var extUsed = usedRules.filter(function (r) { return rules[r] && rules[r].tier === 'extended'; });
    var metrics = {
      sourceLines: nonBlank.length,
      mappedLines: mapped.length,
      unmappedLines: nonBlank.length - mapped.length,
      coverage: nonBlank.length ? mapped.length / nonBlank.length : 1,
      outputLines: outLines.length,
      groundedLines: grounded.length,
      grounding: outLines.length ? grounded.length / outLines.length : 1,
      tokenRefs: notes.tokenRefs,
      tokensResolved: notes.tokensResolved,
      guessed: notes.guessed.length,
      rulesUsed: usedRules.length
    };
    var steps = [];
    steps.push({ name: 'Parse component', detail: metrics.sourceLines + ' source lines, ' + st.jsxCount + ' JSX elements, ' + st.hookCount + ' hooks' });
    if (config.tiers.indexOf('extended') >= 0) {
      steps.push({ name: 'Retrieve reviewed patterns', detail: usedRules.length + ' patterns matched' + (extUsed.length ? ' incl. extended ' + extUsed.join(', ') : '') });
    } else {
      steps.push({ name: 'Apply core rules', detail: usedRules.length + ' core rules matched (extended library disabled)', muted: true });
    }
    steps.push(config.tokenRetrieval
      ? { name: 'Resolve design tokens', detail: metrics.tokensResolved + '/' + metrics.tokenRefs + ' token references resolved to registry records' }
      : { name: 'Token lookup skipped', detail: metrics.guessed + ' style values emitted as literal guesses', muted: true });
    steps.push({ name: 'Generate SwiftUI', detail: swift.filter(function (l) { return l.text.trim(); }).length + ' lines' });
    steps.push({ name: 'Generate Jetpack Compose', detail: kotlin.filter(function (l) { return l.text.trim(); }).length + ' lines' });
    if (config.selfCheck) {
      var errs = checks.filter(function (c) { return c.level === 'error'; }).length;
      var warns = checks.filter(function (c) { return c.level === 'warn'; }).length;
      steps.push({ name: 'Self-check', detail: errs ? errs + ' issue(s) routed to human review, ' + warns + ' warning(s)' : 'passed, ' + warns + ' warning(s)', level: errs ? 'error' : 'ok' });
    } else {
      steps.push({ name: 'Self-check disabled', detail: 'output not verified', muted: true });
    }

    return { surfaceId: surface.id, configId: config.id, swift: swift, kotlin: kotlin, source: source, checks: checks, steps: steps, metrics: metrics };
  }

  function evaluate(surface, result) {
    var text = {
      swift: result.swift.map(function (l) { return l.text; }).join('\n'),
      kotlin: result.kotlin.map(function (l) { return l.text; }).join('\n')
    };
    var checks = surface.golden.map(function (g) {
      var pass = g.type === 'noTodo' ? text[g.platform].indexOf('TODO') < 0 : text[g.platform].indexOf(g.expect) >= 0;
      return Object.assign({}, g, { pass: pass });
    });
    var passed = checks.filter(function (c) { return c.pass; }).length;
    return { surfaceId: surface.id, checks: checks, passed: passed, total: checks.length, casePass: passed === checks.length };
  }

  function runEval(kb, config) {
    var cases = kb.surfaces.map(function (s) {
      var r = translate(s, config, kb);
      var e = evaluate(s, r);
      e.metrics = r.metrics;
      return e;
    });
    var passed = cases.reduce(function (a, c) { return a + c.passed; }, 0);
    var total = cases.reduce(function (a, c) { return a + c.total; }, 0);
    var srcL = cases.reduce(function (a, c) { return a + c.metrics.sourceLines; }, 0);
    var mapL = cases.reduce(function (a, c) { return a + c.metrics.mappedLines; }, 0);
    var outL = cases.reduce(function (a, c) { return a + c.metrics.outputLines; }, 0);
    var grL = cases.reduce(function (a, c) { return a + c.metrics.groundedLines; }, 0);
    return {
      configId: config.id,
      cases: cases,
      summary: {
        assertionAccuracy: passed / total, passed: passed, total: total,
        casePassRate: cases.filter(function (c) { return c.casePass; }).length / cases.length,
        casesPassed: cases.filter(function (c) { return c.casePass; }).length, cases: cases.length,
        coverage: mapL / srcL, grounding: grL / outL
      }
    };
  }

  root.Translator = { translate: translate, evaluate: evaluate, runEval: runEval, _scanTag: scanTag, _parseAttrs: parseAttrs };
})(typeof window !== 'undefined' ? window : globalThis);
