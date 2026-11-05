import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Boxes, Braces, Check, ChevronDown, Cpu, Dices, Gauge, Library, Play, Route as RouteIcon,
  Save, Settings2, Shuffle, Trash2, Workflow, X,
} from "lucide-react";
import { AgentConfig, api, Eligibility, InstanceRow, Meta, RunSettings } from "../api";
import { AgentDot, Badge, Button, Card, Field, inputCls, ParamInput, Toggle } from "../components/ui";
import { AGENT_ORDER, TYPE_LABEL } from "../theme";
import { navigate } from "../App";
import RouteMap from "../viz/RouteMap";

const TYPE_ICON: Record<string, JSX.Element> = {
  jobshop: <Workflow size={16} />,
  vrp: <RouteIcon size={16} />,
  knapsack: <Boxes size={16} />,
};

export default function Lab({ meta }: { meta: Meta }) {
  const [type, setType] = useState(meta.problem_types[0].key);
  const pt = meta.problem_types.find((p) => p.key === type)!;
  const [library, setLibrary] = useState<InstanceRow[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [data, setData] = useState<any>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [elig, setElig] = useState<Eligibility[]>([]);
  const [genParams, setGenParams] = useState<Record<string, unknown>>({});
  const [seed, setSeed] = useState(1);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<RunSettings>(meta.run_defaults);
  const [agents, setAgents] = useState<AgentConfig[]>(() =>
    AGENT_ORDER.map((key) => ({
      key,
      enabled: true,
      weight: 1,
      max_iterations: null,
      params: Object.fromEntries(meta.agents.find((a) => a.key === key)!.params.map((p) => [p.key, p.default])),
    })),
  );
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  const refreshLibrary = useCallback(() => api.instances().then(setLibrary), []);
  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const ofType = useMemo(() => library.filter((i) => i.type === type), [library, type]);
  const [loadedType, setLoadedType] = useState<string | null>(null);

  // On a problem type change: reset the generator and load the smallest
  // saved instance of that type (the library is newest-first).
  useEffect(() => {
    if (loadedType === type || !library.length) return;
    setLoadedType(type);
    setGenParams(Object.fromEntries(pt.generator_params.map((p) => [p.key, p.default])));
    setData(null);
    setSummary(null);
    setInstanceId(null);
    if (ofType.length) loadInstance(ofType[ofType.length - 1].id);
  }, [type, library]); // eslint-disable-line react-hooks/exhaustive-deps

  async function inspect(d: any) {
    try {
      const r = await api.inspect(type, d);
      setSummary(r.summary);
      setElig(r.agents);
      setError(null);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }

  async function loadInstance(id: string) {
    const inst = await api.instance(id);
    setInstanceId(id);
    setName(inst.name);
    setData(inst.data);
    inspect(inst.data);
  }

  async function generate(newSeed?: number) {
    setBusy(true);
    const s = newSeed ?? seed;
    try {
      const r = await api.generate(type, genParams, s);
      setData(r.data);
      setInstanceId(null);
      setName(`${TYPE_LABEL[type]} · seed ${s}`);
      await inspect(r.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyJson() {
    try {
      const d = JSON.parse(jsonText);
      if (await inspect(d)) {
        setData(d);
        setInstanceId(null);
        setJsonOpen(false);
      }
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
    }
  }

  async function save() {
    if (!data) return;
    const row = await api.saveInstance(type, name || "Untitled", data);
    await refreshLibrary();
    setInstanceId(row.id);
  }

  async function remove(id: string) {
    await api.deleteInstance(id);
    if (id === instanceId) {
      setInstanceId(null);
    }
    refreshLibrary();
  }

  async function launch() {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api.startRun({
        type,
        data,
        name: name || TYPE_LABEL[type],
        instance_id: instanceId,
        config: { ...settings, agents },
      });
      navigate(`run/${r.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const eligibleMap = Object.fromEntries(elig.map((e) => [e.key, e]));
  const enabledCompatible = agents.filter((a) => a.enabled && eligibleMap[a.key]?.compatible !== false);
  const updAgent = (key: string, patch: Partial<AgentConfig>) =>
    setAgents((as) => as.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">New optimization run</h1>
          <p className="text-sm text-sub mt-0.5">
            Define a problem, choose which agents compete and cooperate, and set the compute budget.
          </p>
        </div>
      </div>

      {/* Problem type selector */}
      <div className="grid gap-3 md:grid-cols-3">
        {meta.problem_types.map((p) => (
          <button
            key={p.key}
            onClick={() => setType(p.key)}
            className={`card text-left p-4 transition ${
              p.key === type ? "border-accent ring-1 ring-accent/50" : "hover:border-mute"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <span className={p.key === type ? "text-accent" : "text-mute"}>{TYPE_ICON[p.key]}</span>
              {p.title}
              <span className="ml-auto">
                <Badge>{p.sense === "min" ? "minimise" : "maximise"} {p.objective_name}</Badge>
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-sub">{p.description}</p>
          </button>
        ))}
      </div>

      {error && (
        <div className="card flex items-start gap-2 border-bad/40 p-3 text-sm text-bad">
          <X size={16} className="mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
          <button className="ml-auto text-mute hover:text-ink" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        {/* ---------------- Instance column ---------------- */}
        <div className="space-y-5">
          <Card title="Instance library" icon={<Library size={15} />}>
            {ofType.length === 0 && <p className="text-sm text-mute">No saved {pt.title.toLowerCase()} instances.</p>}
            <ul className="space-y-1">
              {ofType.map((i) => (
                <li key={i.id}>
                  <div
                    className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm cursor-pointer ${
                      i.id === instanceId ? "bg-accent/10 text-ink" : "hover:bg-raised text-sub"
                    }`}
                    onClick={() => loadInstance(i.id)}
                  >
                    {i.id === instanceId ? <Check size={14} className="text-accent" /> : <span className="w-3.5" />}
                    <span className="truncate">{i.name}</span>
                    <span className="ml-auto text-xs text-mute num">{String(i.summary.size ?? "")} </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-mute hover:text-bad"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(i.id);
                      }}
                      aria-label="Delete instance"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Generate an instance" icon={<Dices size={15} />}>
            <div className="grid grid-cols-2 gap-3">
              {pt.generator_params.map((p) => (
                <div key={p.key} className={p.type === "bool" ? "col-span-2" : ""}>
                  <ParamInput spec={p} value={genParams[p.key]} onChange={(v) => setGenParams((g) => ({ ...g, [p.key]: v }))} />
                </div>
              ))}
              <Field label="Random seed">
                <input type="number" className={inputCls} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
              </Field>
              <div className="flex items-end gap-2">
                <Button onClick={() => generate()} disabled={busy} className="flex-1">
                  <Dices size={14} /> Generate
                </Button>
                <Button
                  title="New random seed"
                  onClick={() => {
                    const s = Math.floor(Math.random() * 100000);
                    setSeed(s);
                    generate(s);
                  }}
                  disabled={busy}
                >
                  <Shuffle size={14} />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ---------------- Current instance + agents ---------------- */}
        <div className="space-y-5">
          <Card
            title="Current instance"
            icon={<Braces size={15} />}
            right={
              data && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setJsonText(JSON.stringify(data, null, 2));
                      setJsonOpen(true);
                    }}
                  >
                    <Braces size={14} /> Edit JSON
                  </Button>
                  <Button variant="ghost" onClick={save} disabled={!!instanceId} title={instanceId ? "Already saved" : "Save to library"}>
                    <Save size={14} /> Save
                  </Button>
                </>
              )
            }
          >
            {!data ? (
              <p className="text-sm text-mute">Pick an instance from the library or generate one.</p>
            ) : (
              <div className="space-y-3">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} aria-label="Instance name" />
                {summary && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary)
                      .filter(([k]) => k !== "size")
                      .map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-raised px-2.5 py-1.5">
                          <div className="text-[10px] uppercase tracking-wider text-mute">{k.replace(/_/g, " ")}</div>
                          <div className="text-sm font-medium num">{v === null ? "—" : String(v)}</div>
                        </div>
                      ))}
                  </div>
                )}
                {type === "vrp" && data.depot && data.customers && <RouteMap data={{ depot: data.depot, customers: data.customers, routes: [] }} height={220} />}
                {jsonOpen && (
                  <div className="space-y-2">
                    <textarea
                      className={`${inputCls} font-mono text-xs h-72`}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      spellCheck={false}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" onClick={() => setJsonOpen(false)}>Cancel</Button>
                      <Button variant="primary" onClick={applyJson}>
                        <Check size={14} /> Validate & apply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Optimization agents" icon={<Cpu size={15} />} right={<span className="text-xs text-mute">{enabledCompatible.length} will run</span>}>
            <ul className="space-y-2">
              {agents.map((a) => {
                const info = meta.agents.find((m) => m.key === a.key)!;
                const el = eligibleMap[a.key];
                const incompatible = el && !el.compatible;
                const open = openAgent === a.key;
                return (
                  <li key={a.key} className={`rounded-lg border ${incompatible ? "border-dashed border-line opacity-60" : "border-line"} bg-bg/40`}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <AgentDot agent={a.key} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {info.name}
                          {incompatible && <Badge tone="warn">not applicable</Badge>}
                        </div>
                        <div className="text-xs text-sub truncate" title={incompatible ? el.reason : info.description}>
                          {incompatible ? el.reason : info.description}
                        </div>
                      </div>
                      <button
                        className="text-mute hover:text-ink p-1"
                        onClick={() => setOpenAgent(open ? null : a.key)}
                        aria-label="Agent settings"
                      >
                        <motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-block">
                          <ChevronDown size={16} />
                        </motion.span>
                      </button>
                      <Toggle checked={a.enabled && !incompatible} onChange={(v) => updAgent(a.key, { enabled: v })} label={`Enable ${info.name}`} />
                    </div>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="overflow-hidden border-t border-line px-3 py-3"
                      >
                        <div className="grid grid-cols-2 gap-3">
                          {!info.background && (
                            <Field label={`Compute weight · ${a.weight}×`} hint="Share of the time slices this agent gets relative to the others.">
                              <input
                                type="range" min={0.25} max={4} step={0.25} value={a.weight} className="w-full"
                                onChange={(e) => updAgent(a.key, { weight: Number(e.target.value) })}
                              />
                            </Field>
                          )}
                          <Field label="Iteration budget (blank = none)">
                            <input
                              type="number" className={inputCls} value={a.max_iterations ?? ""} min={1}
                              onChange={(e) => updAgent(a.key, { max_iterations: e.target.value ? Number(e.target.value) : null })}
                            />
                          </Field>
                          {info.params.map((p) => (
                            <div key={p.key} className={p.type === "bool" ? "col-span-2" : ""}>
                              <ParamInput
                                spec={p}
                                value={a.params[p.key]}
                                onChange={(v) => updAgent(a.key, { params: { ...a.params, [p.key]: v } })}
                              />
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Budget & coordination" icon={<Settings2 size={15} />}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Time budget (s)">
                <input type="number" className={inputCls} min={1} value={settings.time_limit}
                  onChange={(e) => setSettings({ ...settings, time_limit: Number(e.target.value) })} />
              </Field>
              <Field label="Migration interval (s)" hint="How often the global incumbent is offered to agents that are behind.">
                <input type="number" className={inputCls} min={0.1} step={0.1} value={settings.migration_interval}
                  onChange={(e) => setSettings({ ...settings, migration_interval: Number(e.target.value) })} />
              </Field>
              <Field label="Stall limit (s, blank = off)" hint="Stop when the global incumbent has not improved for this long.">
                <input type="number" className={inputCls} min={1} value={settings.stall_limit ?? ""}
                  onChange={(e) => setSettings({ ...settings, stall_limit: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label="Time slice (ms)" hint="Base slice each Python agent runs before the coordinator moves on.">
                <input type="number" className={inputCls} min={5} value={settings.slice_ms}
                  onChange={(e) => setSettings({ ...settings, slice_ms: Number(e.target.value) })} />
              </Field>
              <Field label="Run seed">
                <input type="number" className={inputCls} value={settings.seed}
                  onChange={(e) => setSettings({ ...settings, seed: Number(e.target.value) })} />
              </Field>
              <div className="col-span-2 sm:col-span-1 space-y-1.5 pt-4">
                <div className="flex items-center justify-between gap-2 text-xs text-sub">
                  Share candidates <Toggle checked={settings.migration} onChange={(v) => setSettings({ ...settings, migration: v })} />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-sub">
                  Stop when optimal <Toggle checked={settings.stop_on_optimal} onChange={(v) => setSettings({ ...settings, stop_on_optimal: v })} />
                </div>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-mute flex items-center gap-1">
              <Gauge size={13} /> {settings.time_limit}s budget · {enabledCompatible.length} agents
            </span>
            <Button variant="primary" onClick={launch} disabled={!data || busy || enabledCompatible.length === 0} className="px-5 py-2">
              <Play size={15} /> Launch agents
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
