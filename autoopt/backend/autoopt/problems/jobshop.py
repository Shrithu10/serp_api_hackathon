"""Flexible Job Shop Scheduling with extra precedence constraints.

Each job is an ordered chain of operations. Each operation can run on one of
several compatible machines, with a machine-dependent processing time. Extra
precedence constraints may link operations of different jobs. Objective:
minimise the makespan.

Encoding used by the metaheuristics: (sequence, assignment)
  sequence   - a permutation of all operation ids, read as a priority list
  assignment - the chosen machine for every operation
The decoder turns any encoding into a feasible schedule: it releases
operations in topological order (ties broken by priority) and places each one
in the earliest idle gap of its machine (an active-style schedule).
"""
from __future__ import annotations

import bisect
import heapq
import random
from typing import Any

from pydantic import BaseModel, Field, model_validator

from .base import (
    CAP_CONSTRUCTIVE,
    CAP_CPSAT,
    CAP_CROSSOVER,
    CAP_NEIGHBORHOOD,
    CAP_RANDOM,
    CpsatFormulation,
    Evaluation,
    Problem,
    ox_crossover,
    perm_move,
)


class OpOption(BaseModel):
    machine: int = Field(ge=0)
    duration: int = Field(ge=1)


class Operation(BaseModel):
    options: list[OpOption] = Field(min_length=1)


class Job(BaseModel):
    name: str
    operations: list[Operation] = Field(min_length=1)


class Precedence(BaseModel):
    before: tuple[int, int]  # (job index, operation index)
    after: tuple[int, int]


class JobShopInstance(BaseModel):
    machines: list[str] = Field(min_length=1)
    jobs: list[Job] = Field(min_length=1)
    precedences: list[Precedence] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> "JobShopInstance":
        m = len(self.machines)
        for j, job in enumerate(self.jobs):
            for o, op in enumerate(job.operations):
                seen = set()
                for opt in op.options:
                    if opt.machine >= m:
                        raise ValueError(f"job {j} op {o}: machine {opt.machine} does not exist")
                    if opt.machine in seen:
                        raise ValueError(f"job {j} op {o}: machine {opt.machine} listed twice")
                    seen.add(opt.machine)
        for p in self.precedences:
            for j, o in (p.before, p.after):
                if not (0 <= j < len(self.jobs) and 0 <= o < len(self.jobs[j].operations)):
                    raise ValueError(f"precedence refers to missing operation ({j}, {o})")
            if tuple(p.before) == tuple(p.after):
                raise ValueError("an operation cannot precede itself")
        # Cycle check over job chains + extra precedences.
        ids, preds, succs = _graph(self)
        indeg = [len(p) for p in preds]
        stack = [i for i, d in enumerate(indeg) if d == 0]
        seen = 0
        while stack:
            v = stack.pop()
            seen += 1
            for s in succs[v]:
                indeg[s] -= 1
                if indeg[s] == 0:
                    stack.append(s)
        if seen != len(ids):
            raise ValueError("precedence constraints contain a cycle")
        return self


def _graph(inst: JobShopInstance):
    ids: list[tuple[int, int]] = []
    index: dict[tuple[int, int], int] = {}
    for j, job in enumerate(inst.jobs):
        for o in range(len(job.operations)):
            index[(j, o)] = len(ids)
            ids.append((j, o))
    preds: list[set[int]] = [set() for _ in ids]
    succs: list[set[int]] = [set() for _ in ids]
    for j, job in enumerate(inst.jobs):
        for o in range(1, len(job.operations)):
            a, b = index[(j, o - 1)], index[(j, o)]
            preds[b].add(a)
            succs[a].add(b)
    for p in inst.precedences:
        a, b = index[tuple(p.before)], index[tuple(p.after)]
        preds[b].add(a)
        succs[a].add(b)
    return ids, [sorted(p) for p in preds], [sorted(s) for s in succs]


class JobShopProblem(Problem):
    type_name = "jobshop"
    title = "Job Shop Scheduling"
    sense = "min"
    objective_name = "makespan"
    capabilities = frozenset({CAP_RANDOM, CAP_NEIGHBORHOOD, CAP_CROSSOVER, CAP_CONSTRUCTIVE, CAP_CPSAT})

    def __init__(self, instance: JobShopInstance):
        super().__init__(instance)
        self.ids, self.preds, self.succs = _graph(instance)
        self.n = len(self.ids)
        self.m = len(instance.machines)
        self.options: list[dict[int, int]] = []
        for j, o in self.ids:
            op = instance.jobs[j].operations[o]
            self.options.append({opt.machine: opt.duration for opt in op.options})
        self.machine_lists = [sorted(d) for d in self.options]
        self.flexible_ops = [i for i in range(self.n) if len(self.options[i]) > 1]
        self.min_dur = [min(d.values()) for d in self.options]
        self.indeg0 = [len(p) for p in self.preds]
        self.roots = [i for i in range(self.n) if not self.preds[i]]

    def size(self) -> int:
        return self.n

    def summary(self) -> dict:
        return {
            "size": self.n,
            "jobs": len(self.instance.jobs),
            "machines": self.m,
            "operations": self.n,
            "flexible_operations": len(self.flexible_ops),
            "extra_precedences": len(self.instance.precedences),
        }

    # ---- encoding -----------------------------------------------------------
    def random_solution(self, rng: random.Random):
        seq = list(range(self.n))
        rng.shuffle(seq)
        assign = [rng.choice(ml) for ml in self.machine_lists]
        return (seq, assign)

    def copy(self, sol):
        return (list(sol[0]), list(sol[1]))

    def neighborhoods(self) -> list[str]:
        moves = ["swap", "insert", "critical_swap"]
        if self.flexible_ops:
            moves.append("reassign")
        return moves

    def apply_move(self, sol, kind: str, rng: random.Random):
        seq, assign = sol
        if kind in ("swap", "insert", "reverse"):
            return (perm_move(seq, kind, rng), list(assign))
        if kind == "reassign":
            assign = list(assign)
            op = rng.choice(self.flexible_ops)
            choices = [mm for mm in self.machine_lists[op] if mm != assign[op]]
            assign[op] = rng.choice(choices)
            return (list(seq), assign)
        if kind == "critical_swap":
            return self._critical_swap(sol, rng)
        raise ValueError(kind)

    def _critical_swap(self, sol, rng: random.Random):
        """Swap two adjacent operations on one machine that both lie on a
        critical path - the classic N1 neighbourhood for job shop."""
        seq, assign = sol
        start, end, _ = self._schedule(seq, assign)
        makespan = max(end)
        # Walk back from the last finishing operation along tight arcs.
        on_machine: dict[int, list[int]] = {}
        for op in sorted(range(self.n), key=lambda i: start[i]):
            on_machine.setdefault(assign[op], []).append(op)
        prev_on_machine = {}
        for ops in on_machine.values():
            for a, b in zip(ops, ops[1:]):
                prev_on_machine[b] = a
        cur = max(range(self.n), key=lambda i: end[i])
        pairs = []
        guard = 0
        while cur is not None and guard <= self.n:
            guard += 1
            nxt = None
            pm = prev_on_machine.get(cur)
            if pm is not None and end[pm] == start[cur]:
                pairs.append((pm, cur))
                nxt = pm
            else:
                for p in self.preds[cur]:
                    if end[p] == start[cur]:
                        nxt = p
                        break
            cur = nxt
        if not pairs or makespan == 0:
            return (perm_move(seq, "swap", rng), list(assign))
        a, b = rng.choice(pairs)
        seq = list(seq)
        ia, ib = seq.index(a), seq.index(b)
        # Make b come before a in the priority list.
        if ib > ia:
            seq.pop(ib)
            seq.insert(ia, b)
        return (seq, list(assign))

    def crossover(self, a, b, rng: random.Random):
        seq = ox_crossover(a[0], b[0], rng)
        assign = [a[1][i] if rng.random() < 0.5 else b[1][i] for i in range(self.n)]
        return (seq, assign)

    # ---- decoder ------------------------------------------------------------
    def _schedule(self, seq, assign):
        pos = [0] * self.n
        for i, op in enumerate(seq):
            pos[op] = i
        indeg = list(self.indeg0)
        heap = [(pos[o], o) for o in self.roots]
        heapq.heapify(heap)
        starts_on: list[list[int]] = [[] for _ in range(self.m)]
        ends_on: list[list[int]] = [[] for _ in range(self.m)]
        start = [0] * self.n
        end = [0] * self.n
        while heap:
            _, o = heapq.heappop(heap)
            est = 0
            for p in self.preds[o]:
                if end[p] > est:
                    est = end[p]
            mach = assign[o]
            dur = self.options[o][mach]
            ss, ee = starts_on[mach], ends_on[mach]
            t = est
            k = bisect.bisect_right(ee, t)  # intervals ending after t
            idx = len(ss)
            while k < len(ss):
                if t + dur <= ss[k]:
                    idx = k
                    break
                if ee[k] > t:
                    t = ee[k]
                k += 1
            ss.insert(idx, t)
            ee.insert(idx, t + dur)
            start[o] = t
            end[o] = t + dur
            for s in self.succs[o]:
                indeg[s] -= 1
                if indeg[s] == 0:
                    heapq.heappush(heap, (pos[s], s))
        return start, end, assign

    def evaluate(self, sol) -> Evaluation:
        _, end, _ = self._schedule(sol[0], sol[1])
        return Evaluation(objective=float(max(end)), feasible=True)

    def decode(self, sol) -> dict:
        start, end, assign = self._schedule(sol[0], sol[1])
        tasks = []
        for i, (j, o) in enumerate(self.ids):
            tasks.append(
                {
                    "job": j,
                    "job_name": self.instance.jobs[j].name,
                    "op": o,
                    "machine": assign[i],
                    "machine_name": self.instance.machines[assign[i]],
                    "start": start[i],
                    "end": end[i],
                }
            )
        makespan = max(end)
        busy = [0] * self.m
        for t in tasks:
            busy[t["machine"]] += t["end"] - t["start"]
        return {
            "objective": float(makespan),
            "makespan": makespan,
            "tasks": sorted(tasks, key=lambda t: (t["machine"], t["start"])),
            "machines": list(self.instance.machines),
            "jobs": [j.name for j in self.instance.jobs],
            "utilization": [round(b / makespan, 4) if makespan else 0 for b in busy],
        }

    def validate(self, decoded: dict) -> list[str]:
        errs: list[str] = []
        inst = self.instance
        by_op: dict[tuple[int, int], dict] = {}
        for t in decoded["tasks"]:
            key = (t["job"], t["op"])
            if key in by_op:
                errs.append(f"operation {key} scheduled twice")
            by_op[key] = t
        for j, job in enumerate(inst.jobs):
            for o, op in enumerate(job.operations):
                t = by_op.get((j, o))
                if t is None:
                    errs.append(f"operation {(j, o)} not scheduled")
                    continue
                durs = {opt.machine: opt.duration for opt in op.options}
                if t["machine"] not in durs:
                    errs.append(f"operation {(j, o)} on incompatible machine {t['machine']}")
                elif t["end"] - t["start"] != durs[t["machine"]]:
                    errs.append(f"operation {(j, o)} has wrong duration")
                if t["start"] < 0:
                    errs.append(f"operation {(j, o)} starts before 0")
                if o > 0 and (j, o - 1) in by_op and by_op[(j, o - 1)]["end"] > t["start"]:
                    errs.append(f"job order violated at {(j, o)}")
        for p in inst.precedences:
            a, b = by_op.get(tuple(p.before)), by_op.get(tuple(p.after))
            if a and b and a["end"] > b["start"]:
                errs.append(f"precedence {tuple(p.before)} -> {tuple(p.after)} violated")
        per_machine: dict[int, list[dict]] = {}
        for t in decoded["tasks"]:
            per_machine.setdefault(t["machine"], []).append(t)
        for mach, ts in per_machine.items():
            ts = sorted(ts, key=lambda t: t["start"])
            for a, b in zip(ts, ts[1:]):
                if a["end"] > b["start"]:
                    errs.append(f"overlap on machine {mach}")
                    break
        real = max((t["end"] for t in decoded["tasks"]), default=0)
        if real != decoded["makespan"]:
            errs.append("reported makespan does not match the schedule")
        return errs

    def to_json(self, sol):
        return {"sequence": list(sol[0]), "assignment": list(sol[1])}

    def from_json(self, data):
        return (list(data["sequence"]), list(data["assignment"]))

    # ---- constructive heuristics (dispatching rules) -------------------------
    def constructive_heuristics(self):
        remaining_work = [0] * self.n
        # Work remaining in the job from this operation on (min durations).
        for i in reversed(range(self.n)):
            j, o = self.ids[i]
            nxt = i + 1 if i + 1 < self.n and self.ids[i + 1][0] == j else None
            remaining_work[i] = self.min_dur[i] + (remaining_work[nxt] if nxt is not None else 0)
        succ_count = [len(s) for s in self.succs]

        rules = {
            "SPT (shortest processing time)": lambda op, ect, est: self.min_dur[op],
            "LPT (longest processing time)": lambda op, ect, est: -self.min_dur[op],
            "MWKR (most work remaining)": lambda op, ect, est: -remaining_work[op],
            "ECT (earliest completion time)": lambda op, ect, est: ect,
            "MOPNR (most successors)": lambda op, ect, est: (-succ_count[op], -remaining_work[op]),
        }
        return {name: self._dispatch(rule) for name, rule in rules.items()}

    def _dispatch(self, rule):
        def build(rng: random.Random, alpha: float):
            indeg = list(self.indeg0)
            ready = list(self.roots)
            mach_free = [0] * self.m
            end = [0] * self.n
            seq, assign = [], [0] * self.n
            while ready:
                cands = []
                for op in ready:
                    est = max((end[p] for p in self.preds[op]), default=0)
                    best = None
                    for mach, dur in self.options[op].items():
                        c = max(est, mach_free[mach]) + dur
                        if best is None or c < best[0] or (c == best[0] and rng.random() < 0.5):
                            best = (c, mach)
                    cands.append((rule(op, best[0], est), rng.random(), op, best))
                cands.sort(key=lambda c: (c[0], c[1]))
                k = max(1, int(round(alpha * len(cands)))) if alpha > 0 else 1
                _, _, op, (c, mach) = cands[rng.randrange(k)]
                ready.remove(op)
                seq.append(op)
                assign[op] = mach
                end[op] = c
                mach_free[mach] = c
                for s in self.succs[op]:
                    indeg[s] -= 1
                    if indeg[s] == 0:
                        ready.append(s)
            return (seq, assign)

        return build

    # ---- CP-SAT -------------------------------------------------------------
    def cpsat_limit(self):
        if self.n > 400:
            return False, f"{self.n} operations is above the CP-SAT model limit of 400"
        return True, ""

    def build_cpsat(self, hint=None) -> CpsatFormulation:
        from ortools.sat.python import cp_model

        model = cp_model.CpModel()
        horizon = sum(max(d.values()) for d in self.options)
        starts, ends, presence = [], [], []
        per_machine: dict[int, list] = {mm: [] for mm in range(self.m)}
        for i in range(self.n):
            s = model.NewIntVar(0, horizon, f"s{i}")
            e = model.NewIntVar(0, horizon, f"e{i}")
            starts.append(s)
            ends.append(e)
            opts = self.options[i]
            lits = {}
            if len(opts) == 1:
                (mach, dur), = opts.items()
                iv = model.NewIntervalVar(s, dur, e, f"iv{i}")
                per_machine[mach].append(iv)
                lits[mach] = None
            else:
                for mach, dur in opts.items():
                    lit = model.NewBoolVar(f"x{i}_{mach}")
                    iv = model.NewOptionalIntervalVar(s, dur, e, lit, f"iv{i}_{mach}")
                    per_machine[mach].append(iv)
                    lits[mach] = lit
                model.AddExactlyOne(lits.values())
            presence.append(lits)
        for mach, ivs in per_machine.items():
            if len(ivs) > 1:
                model.AddNoOverlap(ivs)
        for b in range(self.n):
            for a in self.preds[b]:
                model.Add(starts[b] >= ends[a])
        makespan = model.NewIntVar(0, horizon, "makespan")
        model.AddMaxEquality(makespan, ends)
        model.Minimize(makespan)

        if hint is not None:
            st, en, asg = self._schedule(hint[0], hint[1])
            for i in range(self.n):
                model.AddHint(starts[i], st[i])
                model.AddHint(ends[i], en[i])
                for mach, lit in presence[i].items():
                    if lit is not None:
                        model.AddHint(lit, 1 if asg[i] == mach else 0)
            model.AddHint(makespan, max(en))

        def extract(src):
            st = [src.Value(s) for s in starts]
            asg = []
            for i in range(self.n):
                chosen = None
                for mach, lit in presence[i].items():
                    if lit is None or src.Value(lit):
                        chosen = mach
                        break
                asg.append(chosen)
            seq = sorted(range(self.n), key=lambda i: (st[i], i))
            return (seq, asg)

        return CpsatFormulation(
            model=model,
            extract=extract,
            notes=[
                f"{self.n} interval variables",
                f"{sum(len(v) for v in per_machine.values())} machine intervals with no-overlap",
                "makespan = max(end)",
            ],
        )


def generate(params: dict, rng: random.Random) -> dict:
    n_jobs = int(params.get("jobs", 6))
    n_machines = int(params.get("machines", 4))
    ops = int(params.get("ops_per_job", n_machines))
    flex = max(1, min(n_machines, int(params.get("flexibility", 2))))
    lo, hi = int(params.get("min_duration", 2)), int(params.get("max_duration", 12))
    n_prec = int(params.get("extra_precedences", 2))
    jobs = []
    for j in range(n_jobs):
        operations = []
        for _ in range(ops):
            k = rng.randint(1, flex)
            machs = rng.sample(range(n_machines), k)
            base = rng.randint(lo, hi)
            operations.append(
                {
                    "options": [
                        {"machine": mm, "duration": max(1, base + rng.randint(-2, 3) * (idx > 0))}
                        for idx, mm in enumerate(machs)
                    ]
                }
            )
        jobs.append({"name": f"J{j + 1}", "operations": operations})
    precedences = []
    attempts = 0
    while len(precedences) < n_prec and n_jobs > 1 and attempts < 100:
        attempts += 1
        a, b = sorted(rng.sample(range(n_jobs), 2))
        pa, pb = rng.randrange(ops), rng.randrange(ops)
        p = {"before": [a, pa], "after": [b, pb]}
        if p not in precedences:
            precedences.append(p)
    return {
        "machines": [f"M{i + 1}" for i in range(n_machines)],
        "jobs": jobs,
        "precedences": precedences,
    }


GENERATOR_PARAMS = [
    {"key": "jobs", "label": "Jobs", "default": 6, "min": 2, "max": 40},
    {"key": "machines", "label": "Machines", "default": 4, "min": 1, "max": 20},
    {"key": "ops_per_job", "label": "Operations per job", "default": 4, "min": 1, "max": 20},
    {"key": "flexibility", "label": "Machines per operation (max)", "default": 2, "min": 1, "max": 10},
    {"key": "min_duration", "label": "Min duration", "default": 2, "min": 1, "max": 50},
    {"key": "max_duration", "label": "Max duration", "default": 12, "min": 1, "max": 100},
    {"key": "extra_precedences", "label": "Cross-job precedences", "default": 2, "min": 0, "max": 40},
]
