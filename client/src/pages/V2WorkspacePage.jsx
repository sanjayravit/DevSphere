import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useLocation } from 'react-router-dom';
import { Activity, ArrowUpRight, Bot, Check, ChevronDown, CircleAlert, Clock3, GitBranch, GitCommitHorizontal, LoaderCircle, Play, Shield, ShieldAlert, ShieldCheck, Sparkles, Workflow, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { socketOrigin } from '../services/socket';

const MODES = [
  { id: 'manual', label: 'Manual', description: 'Suggestions only' },
  { id: 'approval', label: 'Approval', description: 'Approve each proposal' },
  { id: 'assisted', label: 'Assisted', description: 'Auto-run low-risk, high-confidence changes' },
  { id: 'full-auto', label: 'Full Auto', description: 'Policy-gated autonomy; elevated risk still needs approval' }
];
const dateText = value => value ? new Date(value).toLocaleString() : 'Just now';
const modeClass = mode => ({ manual: 'text-slate-300', approval: 'text-amber-300', assisted: 'text-cyan-300', 'full-auto': 'text-violet-300' }[mode] || 'text-slate-300');
const statusColor = status => ({ completed: 'text-emerald-300', passed: 'text-emerald-300', running: 'text-cyan-300', failed: 'text-rose-300', blocked: 'text-rose-300', inconclusive: 'text-amber-300', pending_approval: 'text-amber-300', suggested: 'text-slate-300', pull_request: 'text-emerald-300', approved: 'text-emerald-300' }[status] || 'text-slate-400');

function Panel({ title, icon: Icon, children, action }) {
  return <section className="rounded-2xl border border-white/[0.08] bg-[#11141e]/90 p-5 shadow-xl shadow-black/10">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Icon size={16} className="text-indigo-300" />{title}</h2>{action}</div>{children}
  </section>;
}

export const V2WorkspacePage = () => {
  const location = useLocation();
  const queryRunId = new URLSearchParams(location.search).get('runId');
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get('intent')?.slice(0, 12000) || '');
  const [mode, setMode] = useState('assisted');
  const [history, setHistory] = useState([]);
  const [active, setActive] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const session = useAuth();
  const token = session?.token || localStorage.getItem('token');
  const ownerKey = session?.user?.id || token || 'anonymous';
  const owner = useRef(null); if (owner.current?.key !== ownerKey) owner.current = { key: ownerKey };
  const historyRequest = useRef(0); const detailRequest = useRef(0);
  const activeId = useRef(null);
  const requestId = useRef(null);
  const mounted = useRef(true);
  const refreshHistory = useCallback(async () => {
    const scope = owner.current; const request = ++historyRequest.current;
    try { const response = await api.get('/v2/runs'); if (mounted.current && scope === owner.current && request === historyRequest.current) setHistory(response.data.runs || []); }
    catch (err) { if (mounted.current && scope === owner.current && request === historyRequest.current) setError(err.response?.data?.error || 'Unable to load DevSphere V2 run history.'); }
  }, []);
  const fetchDetails = useCallback(async id => {
    const scope = owner.current; const request = ++detailRequest.current;
    const response = await api.get(`/v2/runs/${id}`);
    if (mounted.current && scope === owner.current && activeId.current === id && request === detailRequest.current) {
      setActive(response.data.run);
      setLiveEvents(previous => [...new Map([...previous.filter(event => event.runId === id), ...(response.data.run.events || [])].map(event => [`${event.at}:${event.step}:${event.status}`, event])).values()].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-100));
    }
  }, []);
  useEffect(() => {
    mounted.current = true; activeId.current = null; requestId.current = null;
    setActive(null); setHistory([]); setLiveEvents([]); setError(''); setLoading(false); setActionLoading(false);
    refreshHistory();
    return () => { mounted.current = false; };
  }, [ownerKey, refreshHistory, fetchDetails]);
  useEffect(() => {
    const scope = owner.current;
    if (queryRunId && /^[A-Za-z0-9_-]{1,128}$/.test(queryRunId)) {
      activeId.current = queryRunId; requestId.current = null; setActive(null); setLiveEvents([]); setError('');
      fetchDetails(queryRunId).catch(() => { if (mounted.current && owner.current === scope && activeId.current === queryRunId) setError('Could not load the selected run.'); });
    }
  }, [queryRunId, ownerKey, fetchDetails]);
  useEffect(() => {
    if (!token) return undefined;
    const socket = io(socketOrigin(), { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnection: true, timeout: 10_000 });
    const refreshActive = () => {
      refreshHistory();
      if (activeId.current) fetchDetails(activeId.current).catch(() => {});
    };
    socket.on('connect', () => { setConnected(true); refreshActive(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('devsphere:update', event => {
      if (!event || typeof event.runId !== 'string') return;
      if (requestId.current && event.requestId === requestId.current && !activeId.current) {
        activeId.current = event.runId; setActive({ id: event.runId, status: 'running' });
      }
      if (event.runId !== activeId.current) return;
      setLiveEvents(previous => [...previous.filter(item => !(item.at === event.at && item.step === event.step && item.status === event.status)), event].slice(-100));
      if (event.status === 'failed') setError(event.detail?.message || 'The run failed. Inspect the recorded history before retrying.');
      if (['decision', 'approval', 'github-pr', 'github-checks', 'orchestrator', 'deployment'].includes(event.step) && event.status !== 'running') refreshActive();
    });
    return () => { socket.disconnect(); setConnected(false); };
  }, [token, refreshHistory, fetchDetails]);
  const selectRun = async item => {
    const scope = owner.current;
    setError(''); requestId.current = null; activeId.current = item.id; setActive(item); setLiveEvents([]);
    try { await fetchDetails(item.id); }
    catch (err) { if (mounted.current && owner.current === scope && activeId.current === item.id) setError(err.response?.data?.error || 'Could not load this run.'); }
  };
  const runIntent = async event => {
    event.preventDefault();
    if (input.trim().length < 8) { setError('Describe the change in at least 8 characters.'); return; }
    setLoading(true); setError(''); setLiveEvents([]); setActive(null); activeId.current = null;
    const correlation = window.crypto.randomUUID(); requestId.current = correlation;
    const scope = owner.current;
    const focused = () => mounted.current && owner.current === scope && requestId.current === correlation;
    try {
      const response = await api.post('/v2/run', { input: input.trim(), mode, requestId: correlation });
      if (focused()) {
        activeId.current = response.data.runId; setActive({ id: response.data.runId, ...response.data });
        await fetchDetails(response.data.runId);
      }
      if (owner.current === scope) await refreshHistory();
    } catch (err) {
      if (!focused()) return;
      const message = err.response?.data?.error || 'The run request failed or timed out. Check run history before retrying; an isolated branch may already exist.';
      if (err.response?.data?.runId) {
        activeId.current = err.response.data.runId;
        await fetchDetails(activeId.current).catch(() => {});
      }
      await refreshHistory(); setError(message);
    } finally {
      if (requestId.current === correlation) requestId.current = null;
      if (mounted.current && owner.current === scope) setLoading(false);
    }
  };
  const act = async (action, body) => {
    const id = activeId.current; const scope = owner.current;
    if (!id || actionLoading) return;
    setActionLoading(true); setError('');
    try { await api.post(`/v2/runs/${id}/${action}`, body); if (mounted.current && owner.current === scope) { await fetchDetails(id); await refreshHistory(); } }
    catch (err) {
      if (!mounted.current || owner.current !== scope) return;
      await fetchDetails(id).catch(() => {}); await refreshHistory();
      if (mounted.current && activeId.current === id) setError(err.response?.data?.error || 'The action failed or timed out. Inspect the recorded run before retrying.');
    } finally { if (mounted.current && owner.current === scope) setActionLoading(false); }
  };
  const approve = () => active?.approvalHash && act('approve', { approvalHash: active.approvalHash });
  const reject = () => active?.approvalHash && act('reject', { approvalHash: active.approvalHash });
  const requestDeployment = () => act('deploy');

  const currentEvents = (liveEvents.length ? liveEvents : active?.events || []).filter(event => !active?.id || event.runId === active.id);
  const proposal = active?.proposal;
  const pending = active?.status === 'pending_approval' && active?.approval === 'pending';

  return <div className="space-y-6 pb-10 text-slate-300">
    <header className="flex flex-col justify-between gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300"><Sparkles size={14} /> Decision-driven development</div><h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">DevSphere <span className="text-gradient">V2</span></h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Turn an intent into a reviewable, policy-gated repository change. Every proposal is audited; execution never skips the server-side risk and QA gates.</p></div>
      <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-2 text-xs ${connected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />{connected ? 'Live updates connected' : 'Live updates offline'}</div>
    </header>

    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] p-4 text-sm text-rose-200"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span>{error}</span><button onClick={() => setError('')} className="ml-auto text-rose-100"><X size={16} /></button></div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
      <Panel title="Start a repository run" icon={Bot}>
        <form onSubmit={runIntent} className="space-y-4">
          <label className="block text-xs font-medium text-slate-400" htmlFor="v2-intent">What should DevSphere investigate or change?</label>
          <textarea id="v2-intent" value={input} onChange={event => setInput(event.target.value)} rows={5} maxLength={12000} placeholder="Example: Add defensive validation to the workspace API and cover malformed input with tests…" className="w-full resize-y rounded-xl border border-white/10 bg-[#0b0e16] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/10" />
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <label className="block w-full max-w-xs text-xs font-medium text-slate-400">Execution mode<select value={mode} onChange={event => setMode(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0e16] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60">{MODES.map(item => <option key={item.id} value={item.id}>{item.label} — {item.description}</option>)}</select></label>
            <button disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <LoaderCircle size={17} className="animate-spin" /> : <Play size={16} fill="currentColor" />}{loading ? 'Orchestrating…' : 'Run DevSphere'}</button>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">Mode is enforced by the backend. High-risk changes always need approval; failed or inconclusive QA cannot be executed.</p>
        </form>
      </Panel>

      <Panel title="Run history" icon={Clock3} action={<button onClick={refreshHistory} className="text-xs text-indigo-300 hover:text-white">Refresh</button>}>
        <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
          {history.length ? history.map(item => <button key={item.id} onClick={() => selectRun(item)} className={`w-full rounded-xl border p-3 text-left transition ${active?.id === item.id || active?.runId === item.id ? 'border-indigo-400/30 bg-indigo-400/[0.08]' : 'border-white/[0.06] bg-black/10 hover:border-white/15 hover:bg-white/[0.03]'}`}>
            <span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium text-white">{item.intent?.summary || item.input || 'New DevSphere run'}</span><span className={`shrink-0 text-[10px] font-semibold uppercase ${statusColor(item.status)}`}>{(item.status || '').replaceAll('_', ' ')}</span></span><span className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span className={modeClass(item.mode)}>{item.mode}</span><span>{dateText(item.createdAt)}</span></span>
          </button>) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">Your saved runs will appear here.</p>}
        </div>
      </Panel>
    </div>

    {active && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5">
        <Panel title="Proposal & decision" icon={ShieldCheck} action={<span className={`rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusColor(active.status)}`}>{(active.status || 'running').replaceAll('_', ' ')}</span>}>
          {proposal ? <div className="space-y-4">
            <div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Issue</div><p className="mt-1 text-sm leading-6 text-slate-200">{proposal.issue || proposal.intent?.summary}</p></div>
            <div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested fix</div><p className="mt-1 text-sm leading-6 text-slate-300">{proposal.suggestedFix || proposal.intent?.summary}</p></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Confidence" value={`${proposal.confidence ?? proposal.decision?.confidence ?? 0}%`} icon={Activity} />
              <Metric label="Risk" value={proposal.risk || proposal.decision?.risk} icon={ShieldAlert} tone={proposal.risk === 'high' ? 'rose' : proposal.risk === 'medium' ? 'amber' : 'emerald'} />
              <Metric label="Impact" value={proposal.impact || proposal.decision?.impact} icon={Workflow} />
              <Metric label="Decision" value={proposal.decision?.decision || active.decision?.decision || active.status} icon={Shield} />
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs leading-5 text-slate-400"><b className="text-slate-200">Policy explanation:</b> {proposal.decision?.reason || active.decision?.reason || 'Proposal pending analysis.'}</div>
            {proposal.design?.suggestions?.length > 0 && <ul className="space-y-1 text-xs text-slate-400">{proposal.design.suggestions.map((suggestion, index) => <li key={index}>• {suggestion}</li>)}</ul>}
            <p className="break-all text-[10px] text-slate-500">Repository: {proposal.repository} · Base: {proposal.defaultBranch}@{proposal.baseSha?.slice(0, 12)}{active.approvalHash && <> · Approval hash: <code>{active.approvalHash}</code></>}</p>
            <div className="flex flex-wrap gap-2">
              {pending && <><button disabled={actionLoading} onClick={approve} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"><Check size={15} />{actionLoading ? 'Processing…' : 'Approve exact proposal'}</button><button disabled={actionLoading} onClick={reject} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/5"><X size={14} />Reject</button></>}
              {active.pullNumber && ['pull_request', 'deployment_skipped', 'deployment_failed', 'deployment_pending'].includes(active.status) && <button disabled={actionLoading} onClick={requestDeployment} className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-4 py-2.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/15"><ArrowUpRight size={15} />{active.status === 'deployment_pending' ? 'Refresh deployment status' : 'Verify merge & deploy'}</button>}
            </div>
          </div> : <p className="text-sm text-slate-500">The orchestrator will populate intent, plan, QA, and decision details as agents complete.</p>}
        </Panel>

        {proposal?.changes && <Panel title={`Proposed file changes · ${proposal.changes.length}`} icon={GitBranch}>
          <div className="space-y-2">{proposal.changes.map((change, index) => <details key={`${change.path}-${index}`} className="group rounded-xl border border-white/[0.07] bg-black/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3"><span className="min-w-0"><span className="mr-2 rounded px-1.5 py-1 text-[9px] uppercase tracking-wider text-indigo-200 bg-indigo-400/10">{change.operation}</span><code className="break-all text-xs text-slate-200">{change.path}</code><span className="mt-1 block text-[11px] text-slate-500">{change.reason}</span></span><ChevronDown size={15} className="shrink-0 text-slate-500 transition group-open:rotate-180" /></summary>
            <pre className="max-h-80 overflow-auto border-t border-white/[0.06] p-3 text-[11px] leading-5 text-slate-300">{change.content}</pre>
          </details>)}</div>
        </Panel>}

        {proposal?.qa && <Panel title="QA results" icon={proposal.qa.status === 'passed' ? Check : ShieldAlert} action={<span className={`text-xs font-semibold uppercase ${statusColor(proposal.qa.status)}`}>{proposal.qa.status}</span>}>
          <p className="mb-3 text-xs leading-5 text-slate-400">{proposal.qa.summary}</p><div className="space-y-2">{proposal.qa.checks?.map((check, index) => <div key={`${check.path}-${index}`} className="flex items-start gap-2 rounded-lg bg-black/20 p-2.5 text-xs"><span className={statusColor(check.status)}>{check.status === 'passed' ? '✓' : check.status === 'failed' ? '×' : '!'}</span><div className="min-w-0"><code className="break-all text-slate-200">{check.path}</code><span className="mx-2 text-slate-600">·</span><span className="text-slate-400">{check.type}: {check.message}</span></div></div>)}</div>
          <p className="mt-3 text-[10px] text-slate-500">Repository tests/builds executed: {proposal.qa.executedTests?.length ? proposal.qa.executedTests.map(command => typeof command === 'string' ? command : `${command.argv?.join(' ')} (exit ${command.exitCode})`).join(', ') : 'none (static review only)'}</p>
        </Panel>}
      </div>

      <div className="space-y-5">
        <Panel title="Orchestrator timeline" icon={Workflow} action={<span className="text-[10px] text-slate-500">{currentEvents.length} events</span>}>
          {currentEvents.length ? <ol className="relative ml-2 space-y-0 border-l border-white/10 pl-5">{currentEvents.map((event, index) => <li key={`${event.at || ''}-${event.step}-${index}`} className="relative pb-5 last:pb-0"><span className={`absolute -left-[25px] top-1 h-2 w-2 rounded-full ring-4 ring-[#11141e] ${event.status === 'failed' ? 'bg-rose-400' : event.status === 'running' ? 'bg-cyan-300' : 'bg-indigo-300'}`} /><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold capitalize text-slate-200">{event.step?.replaceAll('-', ' ')}</span><span className={`text-[10px] uppercase ${statusColor(event.status)}`}>{event.status}</span></div><div className="mt-1 text-[10px] text-slate-500">{dateText(event.at)}</div>{event.detail?.message && <p className="mt-1 text-[11px] text-slate-400">{event.detail.message}</p>}</li>)}</ol> : <p className="text-xs text-slate-500">Agent progress appears here for this run.</p>}
        </Panel>

        {active.pullNumber && <Panel title="GitHub CI · recorded evidence" icon={Workflow} action={<button disabled={actionLoading} onClick={() => act('checks/refresh')} className="text-xs text-indigo-300 disabled:opacity-50">{actionLoading ? 'Refreshing…' : 'Refresh checks'}</button>}>
          <p className={`text-sm font-semibold ${statusColor(active.ci?.state)}`}>{(active.ci?.state || 'missing').replaceAll('_', ' ')}</p>
          <p className="mt-2 break-all text-xs text-slate-400">{active.ci?.repository || proposal?.repository} · PR #{active.pullNumber} · Head {active.ci?.headSha || active.commitSha}</p>
          <p className="mt-1 text-xs text-slate-500">{active.ci?.checkedAt ? `Observed ${dateText(active.ci.checkedAt)}` : 'Not yet refreshed'} · At most once per minute</p>
          {active.ci?.reason && <p className="mt-2 text-xs text-amber-200">{active.ci.reason}</p>}
          <ul className="mt-3 space-y-2 text-xs">{active.ci?.observed?.map(check => <li key={`${check.source}:${check.id}`} className="rounded bg-black/20 p-2"><b>{check.name}</b> · {check.conclusion || check.status}<p className="mt-1 text-slate-400">{check.summary}</p>{check.url && <a href={check.url} target="_blank" rel="noreferrer" className="text-indigo-300">Open actual check ↗</a>}</li>)}</ul>
          <p className="mt-3 text-xs text-slate-500">Checks passing never approves, merges or deploys this PR. A changed head invalidates this run’s delivery authorization. Refresh is read-only at GitHub.</p>
        </Panel>}

        <Panel title="Repository delivery" icon={GitCommitHorizontal}>
          <div className="space-y-3 text-xs">
            <DeliveryLink label="Branch" value={active.branch} href={active.branchUrl} />
            <DeliveryLink label="Commit" value={active.commitSha?.slice(0, 12)} href={active.commitUrl} />
            <DeliveryLink label="Pull request" value={active.pullNumber ? `#${active.pullNumber}` : null} href={active.pullRequest} />
            {active.deployment && <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-slate-500">Deployment</span><b className={statusColor(active.deployment.status)}>{active.deployment.status}</b></div><p className="mt-1 break-words text-slate-300">{active.deployment.url || active.deployment.reason}</p>{active.deployment.url && <a href={active.deployment.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-indigo-300 hover:text-white">Open deployment <ArrowUpRight size={12} /></a>}</div>}
            {!active.branch && !active.pullRequest && !active.deployment && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-slate-500">No GitHub execution has been authorized for this proposal.</p>}
            {active.error && <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-rose-200">{active.error}</div>}
          </div>
        </Panel>
      </div>
    </div>}
  </div>;
};

function Metric({ label, value, icon: Icon, tone }) {
  const color = tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-slate-100';
  return <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500"><Icon size={12} />{label}</div><div className={`mt-1 truncate text-sm font-semibold capitalize ${color}`}>{value ?? '—'}</div></div>;
}
function DeliveryLink({ label, value, href }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><span className="shrink-0 text-slate-500">{label}</span>{href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-right text-indigo-300 hover:text-white">{value || href}<ArrowUpRight size={12} className="shrink-0" /></a> : <span className="truncate text-right text-slate-500">{value || 'Not created'}</span>}</div>;
}
