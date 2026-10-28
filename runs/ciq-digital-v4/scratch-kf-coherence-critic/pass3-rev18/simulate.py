"""Coherence pass 2 (graph rev 18): replay every workflow journey scenario against the
committed data_model formulas, workflow conditions and security step cells.
Read-only over the slice files in this folder. Prints a JSON report to stdout."""
import json, re, sys

D = sys.argv[1] if len(sys.argv) > 1 else '.'
dm = json.load(open(f'{D}/slice-data_model.json'))['content']['flows']
wf = json.load(open(f'{D}/slice-workflow.json'))['content']
sec = json.load(open(f'{D}/slice-security.json'))['content']

FLOWNAME = {'CIQ Case': 'CIQ_Case_A00', 'CIQ Open Point': 'CIQ_Open_Point_A00',
            'CIQ Change Request': 'CIQ_Change_Request_A00'}

# ---------- tiny expression evaluator (IF/OR/AND/NOT/ISBLANK, = != <>, +, literals) ----------
TOK = re.compile(r'\s*(?:(\d+(?:\.\d+)?)|("(?:[^"]*)")|(!=|<>|=|\+|\(|\)|,)|([A-Za-z_][A-Za-z0-9_]*))')

def tokenize(s):
    pos, out = 0, []
    s = s.strip()
    while pos < len(s):
        m = TOK.match(s, pos)
        if not m:
            raise ValueError(f'bad token at {pos}: {s[pos:pos+20]!r}')
        pos = m.end()
        num, st, op, ident = m.groups()
        if num is not None: out.append(('num', float(num)))
        elif st is not None: out.append(('str', st[1:-1]))
        elif op is not None: out.append(('op', op))
        else: out.append(('id', ident))
    return out

class P:
    def __init__(self, toks): self.t, self.i = toks, 0
    def peek(self): return self.t[self.i] if self.i < len(self.t) else (None, None)
    def eat(self, v=None):
        tok = self.t[self.i]; self.i += 1
        if v is not None and tok[1] != v: raise ValueError(f'expected {v} got {tok}')
        return tok
    def expr(self):
        left = self.add()
        k, v = self.peek()
        if k == 'op' and v in ('=', '!=', '<>'):
            self.eat(); right = self.add()
            return ('cmp', v, left, right)
        return left
    def add(self):
        node = self.atom()
        while self.peek() == ('op', '+'):
            self.eat(); node = ('add', node, self.atom())
        return node
    def atom(self):
        k, v = self.eat()
        if k in ('num', 'str'): return ('lit', v)
        if k == 'op' and v == '(':
            e = self.expr(); self.eat(')'); return e
        if k == 'id':
            if self.peek() == ('op', '('):
                self.eat('('); args = []
                if self.peek() != ('op', ')'):
                    args.append(self.expr())
                    while self.peek() == ('op', ','):
                        self.eat(); args.append(self.expr())
                self.eat(')'); return ('fn', v.upper(), args)
            return ('ref', v)
        raise ValueError(f'unexpected {k} {v}')

def blank(v): return v is None or v == ''

def ev(node, rec, formulas, depth=0):
    t = node[0]
    if t == 'lit': return node[1]
    if t == 'ref':
        name = node[1]
        if name in formulas: return evalf(name, rec, formulas, depth + 1)
        return rec.get(name)
    if t == 'add':
        a, b = ev(node[1], rec, formulas, depth), ev(node[2], rec, formulas, depth)
        return (0 if blank(a) else float(a)) + (0 if blank(b) else float(b))
    if t == 'cmp':
        a, b = ev(node[2], rec, formulas, depth), ev(node[3], rec, formulas, depth)
        if isinstance(a, (int, float)) or isinstance(b, (int, float)):
            try: eq = (not blank(a) and not blank(b) and float(a) == float(b))
            except Exception: eq = False
        else: eq = ('' if a is None else str(a)) == ('' if b is None else str(b))
        return eq if node[1] == '=' else not eq
    if t == 'fn':
        f, args = node[1], node[2]
        if f == 'IF':
            return ev(args[1], rec, formulas, depth) if ev(args[0], rec, formulas, depth) else ev(args[2], rec, formulas, depth)
        if f == 'OR': return any(ev(a, rec, formulas, depth) for a in args)
        if f == 'AND': return all(ev(a, rec, formulas, depth) for a in args)
        if f == 'NOT': return not ev(args[0], rec, formulas, depth)
        if f == 'ISBLANK': return blank(ev(args[0], rec, formulas, depth))
        raise ValueError('fn ' + f)
    raise ValueError(t)

def evalf(name, rec, formulas, depth=0):
    if depth > 20: raise RecursionError(name)
    return ev(P(tokenize(formulas[name])).expr(), rec, formulas, depth)

def cond_true(cond, rec, formulas):
    if not cond: return True
    return bool(ev(P(tokenize(cond)).expr(), rec, formulas))

# ---------- flatten workflow ----------
def flatten(steps):
    out = []
    for s in steps:
        if s.get('branches'):
            arms = []
            for b in s['branches']:
                arms.append(flatten(b.get('steps', [])))
            out.append({'par': s['id'], 'arms': arms})
        else:
            out.append(s)
    return out

PROC = {}
for key, p in wf['processes'].items():
    fid = FLOWNAME.get(p.get('flow'), key)
    PROC[fid] = flatten(p['steps'])

def expected_path(fid, rec, formulas):
    path = []
    for node in PROC[fid]:
        if 'par' in node:
            for arm in node['arms']:
                for s in arm:
                    if cond_true(s.get('condition'), rec, formulas): path.append(s['id'])
        elif node.get('type') == 'task':
            if cond_true(node.get('condition'), rec, formulas): path.append(node['id'])
    return path

def step_meta(fid):
    m = {}
    for node in PROC[fid]:
        if 'par' in node:
            for arm in node['arms']:
                for s in arm: m[s['id']] = s
        else: m[node['id']] = node
    return m

INIT = sec['satisfiability']['initiators']

def apply_step(fid, sid, role, inp, rec, formulas, cells, meta, issues):
    """Returns error code or None."""
    sm = meta[sid]
    allowed = INIT.get(fid, []) if sid.endswith('_S0') else [sm.get('assignee_role')]
    if role not in allowed:
        return 'SCENARIO_ROLE_DENIED'
    cell = cells.get(sid, {})
    for k, v in inp.items():
        lvl = cell.get(k)
        if lvl not in ('Editable', 'Mandatory'):
            issues.append(f'{sid}: input {k} is {lvl} (not writable)')
        rec[k] = v
    err = None
    for k, lvl in cell.items():
        if lvl == 'Mandatory':
            val = evalf(k, rec, formulas) if k in formulas else rec.get(k)
            if blank(val) or (isinstance(val, list) and not val):
                err = 'SCENARIO_MANDATORY_MISSING'
                issues.append(f'{sid}: Mandatory {k} = {val!r} -> submit blocked')
    return err

report = []
for sc in wf['journey_scenarios']:
    fid = sc['flow']
    formulas = {f['id']: f['formula'] for f in dm[fid]['fields'] if f.get('formula')}
    cells = sec['field_permissions'][fid]
    meta = step_meta(fid)
    rec, issues, walked, skipped = {}, [], [], []
    exp_err = (sc.get('expect') or {}).get('error')
    queue = list(sc['steps'])
    observed_err = None
    def take(sid):
        if queue and queue[0]['step'] == sid:
            return queue.pop(0)
        return None
    for node in PROC[fid]:
        if observed_err: break
        if 'par' in node:
            due = [s['id'] for arm in node['arms'] for s in arm if cond_true(s.get('condition'), rec, formulas)]
            skipped += [s['id'] for arm in node['arms'] for s in arm if s['id'] not in due]
            got = []
            while queue and queue[0]['step'] in due and queue[0]['step'] not in got:
                st = queue.pop(0); got.append(st['step']); walked.append(st['step'])
                observed_err = apply_step(fid, st['step'], st['role'], st.get('input') or {}, rec, formulas, cells, meta, issues)
                if observed_err: break
            if not observed_err and set(got) != set(due):
                if not (exp_err and not queue):
                    issues.append(f'{node["par"]}: arms due {due} but scenario walks {got}')
            if not due:
                issues.append(f'{node["par"]}: every arm skipped (join must still advance: R-01/K-PAR)')
            continue
        if node.get('type') != 'task':
            continue
        sid = node['id']
        if cond_true(node.get('condition'), rec, formulas):
            st = take(sid)
            if st is None:
                if exp_err and not queue: break
                issues.append(f'{sid}: condition true at entry but scenario does not walk it (next: {queue[0]["step"] if queue else None})')
                break
            walked.append(sid)
            observed_err = apply_step(fid, sid, st['role'], st.get('input') or {}, rec, formulas, cells, meta, issues)
        else:
            skipped.append(sid)
            if queue and queue[0]['step'] == sid:
                issues.append(f'{sid}: scenario walks it but condition {node.get("condition")!r} is false at entry')
                queue.pop(0)
    if queue and not observed_err:
        issues.append(f'unconsumed scenario steps: {[q["step"] for q in queue]}')
    for k, v in ((sc.get('expect') or {}).get('record') or {}).items():
        got = evalf(k, rec, formulas) if k in formulas else rec.get(k)
        if got != v: issues.append(f'expect.record {k}={v!r} but got {got!r}')
    if exp_err:
        ok = observed_err == exp_err
        if not ok: issues.append(f'expected {exp_err}, observed {observed_err}')
        issues = [i for i in issues if not (exp_err == 'SCENARIO_MANDATORY_MISSING' and 'Mandatory' in i)]
        ok = ok and not [i for i in issues if 'every arm skipped' not in i]
    else:
        ok = observed_err is None and not [i for i in issues if 'every arm skipped' not in i]
    report.append({'id': sc['id'], 'flow': fid, 'ok': ok, 'walked': walked, 'skipped': skipped,
                   'observed_error': observed_err, 'expected_error': exp_err,
                   'final_formulas': {k: evalf(k, rec, formulas) for k in formulas},
                   'issues': issues})

print(json.dumps({'scenarios': len(report), 'ok': sum(r['ok'] for r in report),
                  'failed': [r for r in report if not r['ok']], 'all': report}, indent=1))
