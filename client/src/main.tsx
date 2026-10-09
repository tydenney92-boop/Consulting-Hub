import { WorkspaceSearch } from './workspace-search';
import { DefinitionList } from './ui';
import {NavigationContext, RecordLink, recordPath, useNavigation, useWorkspaceRoute} from './navigation';
import {zonedInput, zonedInstant} from './timezone';
import {DocumentDetail} from './document-detail';
import {Firms} from './firms';
import {Timeline} from './timeline';
import {LinkedText,RelatedTask} from './record-ui';
import { Networking, NetworkingDialog } from './networking';
import { OpportunityDetail } from './opportunity-detail';
import { opportunityPath, opportunityIdFromHash, safeExternalUrl } from './opportunity-detail-model';
import { PublicLanding } from './public-landing';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Briefcase, LayoutDashboard, Building2, Target, Users, CalendarDays, History, FileText, CheckSquare, BarChart3, Settings, Plus, Search, Bell, ChevronRight, ArrowUpRight, MoreHorizontal, Clock, Upload, Download, KanbanSquare, Table2, X } from 'lucide-react';
import { actionPage } from './today-actions';
import { deadlineState, filterOpportunities, opportunityStage } from './opportunity-workspace';
import { applicationExternalLink, filterApplications } from './application-workspace';
import { OpportunityImport } from './opportunity-import';
import './styles.css';
import './workspace-polish.css';
const api = async (p: string, o?: RequestInit) => { const r = await fetch('/api' + p, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...o }); if (!r.ok)
    throw Object.assign(new Error((await r.json().catch(() => ({}))).error || 'Something went wrong'), {status:r.status}); return r.status === 204 ? null : r.json(); };
const fmt = (d?: string) => d ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(d)) : '—';
const stage = (s: string) => s.replaceAll('_', ' ').replace(/\b\w/g, (x: string) => x.toUpperCase());
const stageTone = (value?: string) => value === 'READY_TO_APPLY' || value === 'OFFER' ? 'green' : value === 'NETWORKING' || value === 'ASSESSMENT' ? 'orange' : value === 'CLOSED' || value === 'REJECTED' || value === 'WITHDRAWN' ? 'gray' : 'blue';
const deadlineDate = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const deadlineStatus = (value?: string) => { const state = deadlineState(value); return { label: !value ? 'No deadline listed' : state === 'passed' ? `Application window closed · ${deadlineDate(value)}` : state === 'today' ? 'Deadline today' : state === 'soon' ? `Deadline soon · ${deadlineDate(value)}` : `Deadline: ${deadlineDate(value)}`, tone: state === 'today' || state === 'soon' ? 'soon' : 'muted' }; };
function DashboardOpportunityCards({ opportunities, onOpen }: {
    opportunities: any[];
    onOpen: (id: string) => void;
}) { const cards = filterOpportunities(opportunities, { activity: 'active' }).sort((a, b) => { const aDate = a.applicationDeadline ? +new Date(a.applicationDeadline) : Number.MAX_SAFE_INTEGER, bDate = b.applicationDeadline ? +new Date(b.applicationDeadline) : Number.MAX_SAFE_INTEGER; return aDate - bDate || String(a.company?.name || '').localeCompare(String(b.company?.name || '')); }).slice(0, 8); return <section className="panel dashboard-opportunity-panel"><div className="panel-head"><div><h2>Opportunities</h2><p>Upcoming and active roles worth keeping in view</p></div><button className="text-btn" onClick={() => onOpen('')}>View all <ChevronRight size={15}/></button></div>{cards.length ? <div className="dashboard-opportunity-list">{cards.map(item => { const deadline = deadlineStatus(item.applicationDeadline); const contact = item.networkingContact || item.referralContact; return <button type="button" className="dashboard-opportunity-card" key={item.id} onClick={() => onOpen(item.id)} aria-label={`Open ${item.company?.name || 'firm'} ${item.roleTitle} opportunity`}><div className="dashboard-opportunity-main"><div className="dashboard-opportunity-copy"><strong>{item.company?.name || 'Firm'}</strong><span>{item.roleTitle}</span></div><Badge tone={stageTone(opportunityStage(item))}>{stage(opportunityStage(item))}</Badge></div><div className="dashboard-opportunity-meta"><span>{item.office ? [item.office.city, item.office.region].filter(Boolean).join(', ') : item.location || 'Location not listed'}</span><span className={`dashboard-opportunity-deadline ${deadline.tone}`}>{deadline.label}</span></div>{(contact || item.referralStatus && item.referralStatus !== 'NONE') && <p className="dashboard-opportunity-context">{contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : 'Referral'}{item.referralStatus && item.referralStatus !== 'NONE' ? ` · Referral ${stage(item.referralStatus)}` : ''}</p>}</button>; })}</div> : <p className="empty-copy">No active opportunities yet. Add a role to start tracking its deadline and recruiting stage.</p>}</section>; }
function ActionDashboard({ data, setPage, onOpenAction }: {
    data: any;
    setPage: (s: string) => void;
    onOpenAction: (action: any) => void;
}) { const [showAll, setShowAll] = useState(false); if (!data)
    return <div className="loading">Loading your next recruiting actions…</div>; const actions = data.todayActions || data.needsAttention || [], visible = showAll ? actions : actions.slice(0, 5), pipeline = [['Target', data.pipeline?.target], ['Networking', data.pipeline?.networking], ['Ready to apply', data.pipeline?.readyToApply], ['Applied', data.pipeline?.applied], ['Interviewing', data.pipeline?.interviewing], ['Offers', data.pipeline?.offers]], when = (x: any) => x.kind === 'interview' && x.dueDate ? interviewWhen(x.dueDate, x.timezone) : x.dueDate ? fmt(x.dueDate) : x.urgencyLabel; return <><div className="page-head"><div><p className="eyebrow">RECRUITING COMMAND CENTER</p><h1>What should you do next?</h1><p className="sub">Prioritized from your real recruiting deadlines, follow-ups, and pipeline.</p></div><button className="primary" onClick={() => setPage('Tasks')}>Manage tasks <CheckSquare size={16}/></button></div><section className="dashboard-grid"><article className="panel today-queue"><div className="panel-head"><div><h2>Today</h2><p>Your highest-priority recruiting actions, ranked for the day.</p></div>{actions.length > 5 && <button className="text-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `More actions (${actions.length - 5})`} <ChevronRight size={15}/></button>}</div>{actions.length ? <div className="today-queue-list">{visible.map((x: any) => <button className={`today-action urgency-${x.urgency || 'upcoming'}`} key={`${x.kind}-${x.id}`} onClick={() => onOpenAction(x)} aria-label={`Open ${x.typeLabel || x.kind} action: ${x.title}`}><i /><div className="today-action-copy"><div><strong>{x.title}</strong><span className="action-type">{x.typeLabel || stage(x.kind)}</span></div><p>{x.detail || 'Recruiting action'}{when(x) ? ` · ${when(x)}` : ''}</p></div><span className="urgency-label">{x.urgencyLabel || 'Upcoming'}</span></button>)}</div> : <p className="empty-copy">Nothing needs attention today. Add a task, follow-up, or opportunity deadline when you have one.</p>}</article><article className="panel"><div className="panel-head"><div><h2>Tasks by timing</h2><p>Finish overdue work first.</p></div><button className="text-btn" onClick={() => setPage('Tasks')}>Open tasks <ChevronRight size={15}/></button></div>{[['Overdue', data.taskBuckets?.overdue], ['Due today', data.taskBuckets?.today], ['Upcoming', data.taskBuckets?.upcoming]].map(([label, items]: any) => <div className="task-line" key={label}><div><strong>{label}</strong><p>{items?.length || 0} task{items?.length === 1 ? '' : 's'}</p></div><span className={label === 'Overdue' && items?.length ? 'overdue' : 'due'}>{items?.length || 0}</span></div>)}</article><article className="panel funnel"><div className="panel-head"><div><h2>Pipeline</h2><p>Where your active recruiting work stands</p></div><button className="text-btn" onClick={() => setPage('Opportunities')}>View pipeline <ChevronRight size={15}/></button></div>{pipeline.map(([label, count]: any) => { const max = Math.max(...pipeline.map((x: any) => x[1] || 0), 1); return <div className="funnel-row" key={label}><span>{label}</span><div><i style={{ width: `${Math.max(7, (count || 0) / max * 100)}%` }}/></div><b>{count || 0}</b></div>; })}</article><article className="panel"><div className="panel-head"><div><h2>Networking health</h2><p>Relationships that need attention</p></div><button className="text-btn" onClick={() => setPage('Networking')}>Contacts <ChevronRight size={15}/></button></div><div className="list"><div className="task-line"><div><strong>Follow-ups due</strong><p>{data.networkingHealth?.overdueFollowUps || 0} overdue</p></div><span className={data.networkingHealth?.overdueFollowUps ? 'overdue' : 'due'}>{data.networkingHealth?.contactsDue || 0}</span></div><div className="task-line"><div><strong>Priority firms without contacts</strong><p>Build a relationship before recruiting moves on.</p></div><span className="due">{data.networkingHealth?.highPriorityFirmsWithoutContacts || 0}</span></div>{data.networkingHealth?.recentActivity?.slice(0, 3).map((x: any) => <div className="activity-line" key={x.id}><i /><div><strong>{x.message}</strong><p>{fmt(x.createdAt)}</p></div></div>)}</div></article><article className="panel"><div className="panel-head"><div><h2>Recruiting milestones</h2><p>Deadlines, assessments, and interviews ahead</p></div></div><div className="list"><div className="task-line"><div><strong>Ready to apply</strong><p>{data.readyToApply?.length || 0} {data.readyToApply?.length === 1 ? 'opportunity' : 'opportunities'} awaiting an application.</p></div><button className="text-btn" onClick={() => setPage('Opportunities')}>View</button></div><div className="task-line"><div><strong>Assessments outstanding</strong><p>{data.assessments?.length || 0} application{data.assessments?.length === 1 ? '' : 's'} in assessment.</p></div><button className="text-btn" onClick={() => setPage('Applications')}>View</button></div><div className="task-line"><div><strong>Upcoming interviews</strong><p>{data.interviews?.length || 0} in the next week.</p></div><button className="text-btn" onClick={() => setPage('Interviews')}>View</button></div></div></article></section></>; }
function ActionTasks({ tasks, data, refresh, focusId, onBack, create=false, context={} }: {
    tasks: any[];
    data: any;
    refresh: () => void;
    focusId?: string | null;
    onBack:()=>void;create?:boolean;context?:any;
}) {
    const empty = { priority: 'MEDIUM', taskType: 'GENERAL', ...context }, [show, setShow] = useState(create), [editing, setEditing] = useState<any>(null), [message, setMessage] = useState(''), [form, setForm] = useState<any>(empty), opportunities = data.opportunities || [], firms = data.companies || [], focused = focusId ? tasks.find(x => x.id === focusId) : null;
    const firmOpportunities = opportunities.filter((x: any) => x.company?.id === form.companyId);
    const beginAdd = () => { setEditing(null); setForm(empty); setShow(true); };
    const beginEdit = (task: any) => { setEditing(task); setForm({ ...task, companyId: task.companyId || task.opportunity?.company?.id || task.application?.opportunity?.company?.id || null, dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '' }); setShow(true); };
    const chooseFirm = (companyId: string) => { const matches = opportunities.filter((x: any) => x.company?.id === companyId); setForm({ ...form, companyId: companyId || null, opportunityId: matches.length === 1 ? matches[0].id : null, applicationId: null, interviewId: null }); };
    const chooseOpportunity = (opportunityId: string) => setForm({ ...form, opportunityId: opportunityId || null, applicationId: null, interviewId: null });
    const save = async (e: any) => { e.preventDefault(); try {
        await api(editing ? `/tasks/${editing.id}` : '/tasks', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({...form,dueDate:editing&&form.dueDate===editing.dueDate?.slice(0,10)?editing.dueDate:form.dueDate}) });
        setForm(empty);
        setShow(false);
        setEditing(null);
        setMessage(editing ? 'Task updated.' : 'Task added.');
        await refresh();
    }
    catch (e: any) {
        setMessage(e.message);
    } };
    const toggle = async (x: any) => { try {
        await api(`/tasks/${x.id}`, { method: 'PATCH', body: JSON.stringify({ completed: x.status !== 'COMPLETED' }) });
        await refresh();
    }
    catch (e: any) {
        setMessage(e.message);
    } };
    const remove = async (id: string) => { if (confirm('Delete this task?'))
        try {
            await api(`/tasks/${id}`, { method: 'DELETE' });
            await refresh();
        }
        catch (e: any) {
            setMessage(e.message);
        } };
    return <>{focusId&&<button className="text-btn" onClick={onBack}>← Back</button>}<Header title="Tasks" desc="Turn recruiting momentum into clear, owned next actions." action={<button className="primary" onClick={show ? () => { setShow(false); setEditing(null); } : beginAdd}><Plus size={16}/> {show ? 'Cancel' : 'Add task'}</button>}/>{message && <p className="notice">{message}</p>}{focused && <section className="panel focused-task" aria-label="Opened task"><div><p className="eyebrow">SELECTED TASK</p><h2>{focused.title}</h2><p><LinkedText text={focused.description || stage(focused.taskType || 'GENERAL')}/></p><RelatedTask task={focused}/></div><div><span className="due">Due {fmt(focused.dueDate)}</span><button className="secondary" onClick={() => beginEdit(focused)}>Edit task</button><button className="secondary" onClick={() => toggle(focused)}>{focused.status === 'COMPLETED' ? 'Reopen task' : 'Complete task'}</button></div></section>}{show && <form className="firm-create panel" onSubmit={save}><h2>{editing ? 'Edit task' : 'Add task'}</h2><label>Title<input required value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })}/></label><label>Due date<input type="date" value={form.dueDate || ''} onChange={e => setForm({ ...form, dueDate: e.target.value })}/></label><label>Category<select value={form.taskType || 'GENERAL'} onChange={e => setForm({ ...form, taskType: e.target.value })}>{['GENERAL', 'FOLLOW_UP', 'APPLICATION', 'NETWORKING', 'INTERVIEW', 'PREP'].map(x => <option key={x} value={x}>{stage(x)}</option>)}</select></label><label>Priority<select value={form.priority || 'MEDIUM'} onChange={e => setForm({ ...form, priority: e.target.value })}>{['HIGH', 'MEDIUM', 'LOW'].map(x => <option key={x}>{x}</option>)}</select></label><label>Firm<select value={form.companyId || ''} onChange={e => chooseFirm(e.target.value)}><option value="">No firm</option>{firms.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{form.companyId && <label>Opportunity<select value={form.opportunityId || ''} onChange={e => chooseOpportunity(e.target.value)}><option value="">{firmOpportunities.length ? 'Choose an opportunity' : 'No opportunities for this firm'}</option>{firmOpportunities.map((x: any) => <option key={x.id} value={x.id}>{x.roleTitle}{x.office?.city ? ` · ${x.office.city}` : x.location ? ` · ${x.location}` : ''}</option>)}</select>{firmOpportunities.length === 1 && <small>Filled automatically because this firm has one opportunity.</small>}</label>}<label>Contact<select value={form.contactId || ''} onChange={e => setForm({ ...form, contactId: e.target.value || null })}><option value="">No contact</option>{(data.contacts || []).map((x: any) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}</select></label><label>Interview<select value={form.interviewId || ''} onChange={e => setForm({ ...form, interviewId: e.target.value || null })}><option value="">No interview</option>{(data.interviews || []).map((x: any) => <option key={x.id} value={x.id}>{x.application?.opportunity?.company?.name} — {stage(x.interviewRound)}</option>)}</select></label><label className="span-all">Description<textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}/></label><button className="primary">{editing ? 'Save changes' : 'Save task'}</button></form>}<div className="tasks-view">{(focusId?tasks.filter(x=>x.id===focusId):tasks).length ? (focusId?tasks.filter(x=>x.id===focusId):tasks).map(x => <article className={`task-item ${x.status === 'COMPLETED' ? 'done' : ''} ${x.id === focusId ? 'focused' : ''}`} key={x.id}><button className="check" aria-label={`${x.status==='COMPLETED'?'Reopen':'Complete'} ${x.title}`} aria-pressed={x.status==='COMPLETED'} onClick={() => toggle(x)}>{x.status === 'COMPLETED' ? '✓' : ''}</button><div><h3><RecordLink kind="task" id={x.id}>{x.title}</RecordLink></h3><p><LinkedText text={x.description || x.taskType?.replaceAll('_', ' ') || 'General recruiting task'}/></p><small>{x.company?.name || x.opportunity?.company?.name || x.application?.opportunity?.company?.name || (x.contact ? `${x.contact?.firstName || ''} ${x.contact?.lastName || ''}`.trim() : 'Independent task')}{x.interview && ` · ${stage(x.interview.interviewRound)}`}{x.completedAt ? ` · Completed ${fmt(x.completedAt)}` : ''}</small></div><Badge tone={x.priority === 'HIGH' ? 'rose' : 'gray'}>{x.priority}</Badge><span className="due">{fmt(x.dueDate)}</span><button className="text-btn" onClick={() => beginEdit(x)}>Edit</button><button className="text-btn danger" onClick={() => remove(x.id)}>Delete</button></article>) : <div className="empty-state"><CheckSquare size={26}/><h2>No tasks yet</h2><p>Add the next recruiting action you want to complete.</p><button className="primary" onClick={beginAdd}>Add task</button></div>}</div></>;
}
const interviewWhen = (date: string, timezone: string) => new Intl.DateTimeFormat('en-US', { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(date));
const toLocalInput = (date?: string, timezone?: string) => { if (!date)
    return ''; const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(date)), part = (type: string) => parts.find(x => x.type === type)?.value || ''; return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`; };
function InterviewDashboard({ data, setPage, onOpenOpportunity, onOpenAction }: {
    data: any;
    setPage: (s: string) => void;
    onOpenOpportunity: (id: string) => void;
    onOpenAction: (action: any) => void;
}) { return <><ActionDashboard data={data} setPage={setPage} onOpenAction={onOpenAction}/><DashboardOpportunityCards opportunities={data?.opportunities || []} onOpen={onOpenOpportunity}/><section className="panel activity"><div className="panel-head"><div><h2>Interview schedule</h2><p>Upcoming interviews and completed conversations needing an outcome.</p></div><button className="text-btn" onClick={() => setPage('Interviews')}>Manage interviews <ChevronRight size={15}/></button></div>{data?.interviews?.length ? <div className="list">{data.interviews.map((item: any) => <button className="activity-line dashboard-action" key={item.id} onClick={() => onOpenAction({ kind: 'interview', id: item.id })}><i /><div><strong>{item.application?.opportunity?.company?.name} {stage(item.interviewRound)}</strong><p>{interviewWhen(item.date, item.timezone)} · {item.application?.opportunity?.roleTitle}{item.application?.opportunity?.office ? ` · ${item.application.opportunity.office.city}` : ''}</p></div></button>)}</div> : <p className="empty-copy">No upcoming interviews this week.</p>}{data?.awaitingOutcome?.length ? <div className="list"><h3>Outcome to record</h3>{data.awaitingOutcome.map((item: any) => <button className="activity-line dashboard-action" key={item.id} onClick={() => onOpenAction({ kind: 'interview', id: item.id })}><i /><div><strong>{item.application?.opportunity?.company?.name} {stage(item.interviewRound)}</strong><p>Completed {interviewWhen(item.completedAt, item.timezone)} · Outcome pending</p></div></button>)}</div> : null}</section></>; }
function ApplicationDeletionControls({ data, refresh }: {
    data: any[];
    refresh: () => void;
}) { const [message, setMessage] = useState(''); const remove = async (app: any) => { if (!confirm(`Delete ${app.opportunity.company.name} — ${app.opportunity.roleTitle}? This only removes this application; its opportunity and documents remain.`))
    return; try {
    await api(`/applications/${app.id}`, { method: 'DELETE' });
    setMessage('Application removed. You can now remove its opportunity if appropriate.');
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; return <section className="panel"><div className="panel-head"><div><h2>Application cleanup</h2><p>Delete only applications with no associated interviews or tasks.</p></div></div>{message && <p className="notice">{message}</p>}{data.map(app => <div className="task-line" key={app.id}><div><strong>{app.opportunity.company.name} — {app.opportunity.roleTitle}</strong><p>{stage(app.currentStage)} · {app.interviews?.length || 0} interviews · {app.tasks?.length || 0} tasks</p></div><button className="text-btn danger" onClick={() => remove(app)}>Delete application</button></div>)}</section>; }
function Interviews({ applications, contacts, tasks, refresh, focusId, onBack, create=false, context={} }: {
    applications: any[];
    contacts: any[];
    tasks: any[];
    refresh: () => void;
    focusId?:string;onBack:()=>void;create?:boolean;context?:any;
}) { const {go}=useNavigation(); const [archiveView,setArchiveView]=useState('active'); const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver', [items, setItems] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [show, setShow] = useState(create), [message, setMessage] = useState(''), [form, setForm] = useState<any>({applicationId:context.applicationId||'', interviewRound: 'FIRST_ROUND', interviewType: 'VIRTUAL', outcome: 'PENDING', timezone: localZone }); const load = async () => { try {
    const all=await api('/interviews?archived=true');setItems(all);if(focusId)setSelected(all.find((x:any)=>x.id===focusId)||await api('/interviews/'+focusId));
}
catch (e: any) {
    setMessage(e.message);
} }; useEffect(() => { load(); }, []); const reset = () => setForm({ interviewRound: 'FIRST_ROUND', interviewType: 'VIRTUAL', outcome: 'PENDING', timezone: localZone }); const submit = async (e: any) => { e.preventDefault(); try {
    if (!form.when)
        return setMessage('Choose a date and time.');
    const body = { ...form, scheduledAt: zonedInstant(form.when,form.timezone,selected?.date) };
    delete (body as any).when;
    const item = await api(selected ? `/interviews/${selected.id}` : '/interviews', { method: selected ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    setSelected(item);
    setShow(false);
    setMessage(selected ? 'Interview updated.' : 'Interview scheduled.');
    if(!focusId)go(recordPath('interview',item.id));
    await load();
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const edit = (item: any) => { setSelected(item); setForm({ ...item, when: zonedInput(item.date, item.timezone) }); setShow(true); }; const toggleComplete = async (item: any) => { try {
    const updated = await api(`/interviews/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !item.completedAt }) });
    setSelected(updated);
    await load();
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const archive = async (item: any) => { try {
    const updated = await api(`/interviews/${item.id}`, { method: 'PATCH', body: JSON.stringify({ archived: !item.archivedAt }) });
    setSelected(updated);
    await load();
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const remove = async (item: any) => { if (!confirm('Delete this interview? This cannot be undone.'))
    return; try {
    await api(`/interviews/${item.id}`, { method: 'DELETE' });
    setSelected(null);
    go('#/interviews',true);
    await load();
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const addPrep = async (item: any) => { const title = prompt('Preparation task title'); if (!title)
    return; try {
    await api('/tasks', { method: 'POST', body: JSON.stringify({ title, taskType: 'INTERVIEW', priority: 'HIGH', interviewId: item.id, applicationId: item.applicationId, dueDate: item.date }) });
    setMessage('Preparation task added.');
    await load();
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; if(focusId&&!selected)return <><button className="text-btn" onClick={onBack}>← Back</button><p role="status">{message||'Loading interview…'}</p></>;if (selected && !show) {
    const item = items.find(x => x.id === selected.id) || selected;
    return <><button className="text-btn" onClick={onBack}>← Back</button><Header title={`${item.application.opportunity.company.name} — ${stage(item.interviewRound)}`} desc={`${item.application.opportunity.roleTitle} · ${item.application.opportunity.office?.city || 'Target office not selected'}`}/>{message && <p className="notice">{message}</p>}<div className="detail-layout"><article className="panel"><div className="detail-fields"><div><span>Scheduled</span><strong>{interviewWhen(item.date, item.timezone)}</strong></div><div><span>Timezone</span><strong>{item.timezone}</strong></div><div><span>Format</span><strong>{stage(item.interviewType)}</strong></div><div><span>Outcome</span><strong>{stage(item.outcome)}</strong></div><div><span>Interviewer</span><strong>{item.interviewer || item.interviewerContact ? `${item.interviewer || ''}${item.interviewer && item.interviewerContact ? ' · ' : ''}${item.interviewerContact?.firstName || ''} ${item.interviewerContact?.lastName || ''}`.trim() : '—'}</strong></div><div><span>Completed</span><strong>{item.completedAt ? interviewWhen(item.completedAt, item.timezone) : 'Not yet'}</strong></div></div>{item.meetingLink && <p><a href={item.meetingLink} target="_blank" rel="noreferrer">Open meeting link</a></p>}{item.location && <p><b>Location:</b> {item.location}</p>}{item.preparationNotes && <p><b>Preparation notes:</b> {item.preparationNotes}</p>}{item.notes && <p><b>Notes:</b> {item.notes}</p>}<div className="detail-actions"><button className="secondary" onClick={() => edit(item)}>Edit / reschedule</button><button className="secondary" onClick={() => toggleComplete(item)}>{item.completedAt ? 'Reopen' : 'Mark complete'}</button><button className="text-btn" onClick={() => archive(item)}>{item.archivedAt ? 'Restore' : 'Archive'}</button><button className="text-btn danger" onClick={() => remove(item)}>Delete</button></div></article><article className="panel"><div className="panel-head"><div><h2>Preparation tasks</h2><p>Keep interview preparation tied to this process.</p></div><button className="text-btn" onClick={() => addPrep(item)}>Add task</button></div>{item.tasks?.length ? item.tasks.map((task: any) => <p key={task.id}><RecordLink kind="task" id={task.id}>{task.title}</RecordLink> · {task.status === 'COMPLETED' ? 'Completed' : `Due ${fmt(task.dueDate)}`}</p>) : <p className="empty-copy">No preparation tasks yet.</p>}<h3>Linked application</h3><p><RecordLink kind="application" id={item.applicationId}>{item.application.opportunity.company.name} — {item.application.opportunity.roleTitle}</RecordLink></p><p>{stage(item.application.currentStage)}</p></article></div></>;
} ; return <><Header title="Interviews" desc="Schedule, prepare for, and close the loop on every consulting interview." action={<button className="primary" onClick={() => { reset(); setSelected(null); setShow(!show); }}><Plus size={16}/> Schedule interview</button>}/>{message && <p className="notice">{message}</p>}{show && <form className="firm-create panel" onSubmit={submit}><label>Application<select required value={form.applicationId || ''} onChange={e => setForm({ ...form, applicationId: e.target.value })}><option value="">Choose an application</option>{applications.map((x: any) => <option key={x.id} value={x.id}>{x.opportunity?.company?.name} — {x.opportunity?.roleTitle} · {x.opportunity?.office?.city || 'No office'}</option>)}</select></label><label>Round<select value={form.interviewRound} onChange={e => setForm({ ...form, interviewRound: e.target.value })}>{['RECRUITER_SCREEN', 'ASSESSMENT', 'FIRST_ROUND', 'FINAL_ROUND', 'OTHER'].map(x => <option key={x} value={x}>{stage(x)}</option>)}</select></label><label>Scheduled date & time<input required type="datetime-local" value={form.when || ''} onChange={e => setForm({ ...form, when: e.target.value })}/></label><label>Timezone<input required readOnly value={form.timezone || localZone}/></label><label>Format<select value={form.interviewType} onChange={e => setForm({ ...form, interviewType: e.target.value })}>{['VIRTUAL', 'PHONE', 'IN_PERSON', 'ASSESSMENT', 'OTHER'].map(x => <option key={x} value={x}>{stage(x)}</option>)}</select></label><label>Meeting URL<input type="url" placeholder="https://" value={form.meetingLink || ''} onChange={e => setForm({ ...form, meetingLink: e.target.value })}/></label><label>Location<input value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })}/></label><label>Interviewer name(s)<input value={form.interviewer || ''} onChange={e => setForm({ ...form, interviewer: e.target.value })}/></label><label>Recruiter/contact<select value={form.interviewerContactId || ''} onChange={e => setForm({ ...form, interviewerContactId: e.target.value || null })}><option value="">No linked contact</option>{contacts.map((x: any) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}{x.company?.name ? ` · ${x.company.name}` : ''}</option>)}</select></label><label>Outcome<select value={form.outcome || 'PENDING'} onChange={e => setForm({ ...form, outcome: e.target.value })}>{['PENDING', 'ADVANCED', 'REJECTED', 'WITHDRAWN', 'OFFER', 'OTHER'].map(x => <option key={x} value={x}>{stage(x)}</option>)}</select></label><label className="span-all">Preparation notes<textarea value={form.preparationNotes || ''} onChange={e => setForm({ ...form, preparationNotes: e.target.value })}/></label><label className="span-all">Interview notes<textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}/></label><button className="primary">{selected ? 'Save interview' : 'Schedule interview'}</button><button type="button" className="secondary" onClick={() => { setShow(false); if(!focusId){setSelected(null); if(create)onBack();} }}>Cancel</button></form>}<label>Interview view<select value={archiveView} onChange={e=>setArchiveView(e.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All interviews</option></select></label><div className="tasks-view">{items.filter(item=>archiveView==='all'||(archiveView==='archived'?!!item.archivedAt:!item.archivedAt)).length ? items.filter(item=>archiveView==='all'||(archiveView==='archived'?!!item.archivedAt:!item.archivedAt)).map(item => <button className="firm-card" key={item.id} onClick={() => go(recordPath('interview',item.id))}><div><Badge tone={item.completedAt ? 'gray' : 'blue'}>{stage(item.interviewRound)}</Badge><h2>{item.application.opportunity.company.name}</h2><p>{item.application.opportunity.roleTitle} · {item.application.opportunity.office?.city || 'No office'}</p></div><div className="firm-card-meta"><span>{interviewWhen(item.date, item.timezone)}</span><span>{stage(item.interviewType)}</span><span>{stage(item.outcome)}</span></div></button>) : <div className="empty-state"><CalendarDays size={26}/><h2>No interviews scheduled</h2><p>Add an interview from an owned application when an invitation arrives.</p><button className="primary" onClick={() => setShow(true)}>Schedule interview</button></div>}</div></>; }
const nav = [['Dashboard', LayoutDashboard], ['Firms', Building2], ['Opportunities', Target], ['Applications', KanbanSquare], ['Interviews', CalendarDays], ['Networking', Users], ['Timeline', History], ['Documents', FileText], ['Tasks', CheckSquare], ['Analytics', BarChart3], ['Settings', Settings]] as const;
function Badge({ children, tone }: {
    children: React.ReactNode;
    tone?: string;
}) { return <span className={`badge ${tone || ''}`}>{children}</span>; }
function Modal({ open, onClose, kind, refresh, onCreated }: {
    open: string | null;
    onClose: () => void;
    kind: string | null;
    refresh: () => void;
    onCreated?: (id: string) => void;
}) { const [form, setForm] = useState<any>({ priority: 'MEDIUM' }), [step, setStep] = useState<'import' | 'review'>('import'), [text, setText] = useState(''), [url, setUrl] = useState(''), [message, setMessage] = useState(''), [duplicates, setDuplicates] = useState<any[]>([]); useEffect(() => { if (open) {
    setForm({ priority: 'MEDIUM' });
    setStep('import');
    setText('');
    setUrl('');
    setMessage('');
    setDuplicates([]);
} }, [open]); if (!open)
    return null; const change = (key: string, value: any) => setForm({ ...form, [key]: value }); const parse = async (manual = false) => { if (manual) {
    setStep('review');
    return;
} try {
    const result = await api('/quick-add/opportunity/parse', { method: 'POST', body: JSON.stringify({ text, url }) });
    setForm({ ...result.draft, company: result.draft.company, priority: 'MEDIUM', notes: '' });
    setDuplicates(result.duplicates || []);
    setStep('review');
}
catch (e: any) {
    setMessage(e.message);
} }; const submit = async (e: any) => { e.preventDefault(); try {
    const item = await api(kind==='task'?'/tasks':'/opportunities', { method: 'POST', body: JSON.stringify(form) });
    await refresh();
    onClose();
    onCreated?.(item.id);
}
catch (e: any) {
    setMessage(e.message);
} }; const field = (name: string, label = name, required = false) => <label>{label}<input required={required} value={form[name] || ''} onChange={e => change(name, e.target.value)}/></label>; if (kind === 'opportunity')
    return <div className="overlay"><form className="modal quick-opportunity" onSubmit={submit}><button type="button" className="icon close" aria-label="Close quick add" onClick={onClose}><X /></button><p className="eyebrow">QUICK ADD · {step === 'import' ? '1 OF 2' : '2 OF 2'}</p><h2>{step === 'import' ? 'Paste a job posting' : 'Review opportunity draft'}</h2>{message && <p className="notice">{message}</p>}{step === 'import' ? <><p className="sub">Paste a public job description or URL. Nothing is saved until you confirm the review.</p><label>Job posting text<textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Paste a LinkedIn, Handshake, or careers-page posting"/></label><label>Public URL (optional)<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => parse(true)}>Enter manually</button><button type="button" className="primary" onClick={() => parse(false)} disabled={!text && !url}>Review draft</button></div>{url && !text && <p className="empty-copy">The URL will be saved and its source recognized when possible. Paste the description for reliable field extraction.</p>}</> : <><p className="sub">Here’s what Consulting Hub found — check it before saving.</p>{duplicates.length > 0 && <p className="notice">Possible duplicate: {duplicates.map(x => `${x.company.name} — ${x.roleTitle}`).join(', ')}. Review before saving.</p>}<div className="form-grid">{field('company', 'Firm / company', true)}{field('roleTitle', 'Role title', true)}{field('location', 'Location')}{field('practiceArea', 'Practice / function')}<label>Employment type<select value={form.employmentType || ''} onChange={e => change('employmentType', e.target.value)}><option value="">Not specified</option><option value="INTERNSHIP">Internship</option><option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option><option value="CONTRACT">Contract</option><option value="OTHER">Other</option></select></label>{field('recruitingSeason', 'Recruiting season')}<label>Deadline<input type="date" value={form.applicationDeadline || ''} onChange={e => change('applicationDeadline', e.target.value)}/></label>{field('source', 'Source')}<label className="span2">Original URL<input type="url" value={form.jobUrl || ''} onChange={e => change('jobUrl', e.target.value)}/></label><label>Priority<select value={form.priority || 'MEDIUM'} onChange={e => change('priority', e.target.value)}><option>MEDIUM</option><option>HIGH</option><option>LOW</option></select></label><label>Stage<select value={form.status || 'TARGET'} onChange={e => change('status', e.target.value)}>{['TARGET', 'NETWORKING', 'READY_TO_APPLY'].map(x => <option key={x}>{x}</option>)}</select></label><label className="span2">Your notes (the full posting is saved separately)<textarea value={form.notes || ''} onChange={e => change('notes', e.target.value)}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setStep('import')}>Back</button><button className="primary">Save opportunity</button></div></>}</form></div>; return <div className="overlay"><form className="modal" onSubmit={submit}><button type="button" className="icon close" aria-label="Close quick add" onClick={onClose}><X /></button><p className="eyebrow">QUICK ADD</p><h2>Add {kind}</h2>{message && <p role="alert" className="notice">{message}</p>}{field('title', 'Title', true)}<button className="primary full">Save {kind}</button></form></div>; }
function Opportunities({ data, refresh, onApplied, onOpen, filters, setFilters }: {
    data: any[];
    refresh: () => void;
    onApplied: (id: string) => Promise<void>;
    onOpen: (id: string) => void;
    filters: any;
    setFilters: any;
}) { const [notice, setNotice] = useState(''), [applying, setApplying] = useState<string | null>(null), rows = filterOpportunities(data, filters), set = (key: string, value: string) => setFilters({ ...filters, [key]: value, ...(key === 'activity' ? { deadline: '' } : key === 'deadline' && value === 'passed' && filters.activity === 'active' ? { activity: 'expired' } : {}) }), location = (x: any) => x.office ? [x.office.city, x.office.region].filter(Boolean).join(', ') : x.location || 'Location not listed', next = (x: any) => { const app = x.applications?.[0], contact = x.networkingContact; if (app?.currentStage === 'ASSESSMENT')
    return 'Complete assessment'; if (app?.currentStage && app.currentStage !== 'APPLIED')
    return `Move ${stage(app.currentStage)} process forward`; if (!app && deadlineState(x.applicationDeadline) === 'passed')
    return 'Application window closed'; if (!app && x.status === 'READY_TO_APPLY')
    return 'Start application'; if (contact?.nextFollowUpDate)
    return `Follow up with ${contact.firstName} ${contact.lastName}`; if (x.applicationDeadline)
    return 'Review application deadline'; return 'Add recruiting context'; }; const apply = async (id: string) => { setApplying(id); try {
    await onApplied(id);
    setNotice('Moved to Applied.');
}
catch (e: any) {
    setNotice(e.message);
}
finally {
    setApplying(null);
} }; const archive = async (id: string) => { if (!confirm('Archive this opportunity?'))
    return; try {
    await api(`/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'CLOSED' }) });
    setNotice('Opportunity archived.');
    await refresh();
}
catch (e: any) {
    setNotice(e.message);
} }; return <><Header title="Opportunities" desc="Manage each recruiting opportunity from research through application." action={<OpportunityImport api={api} refresh={refresh} onNotice={setNotice}/>}/>{notice && <p className="notice">{notice}</p>}<div className="opportunity-toolbar"><div className="search small"><Search size={17}/><input placeholder="Search firms, roles, offices" value={filters.q} onChange={e => set('q', e.target.value)}/></div><select aria-label="Opportunity stage" value={filters.stage} onChange={e => set('stage', e.target.value)}><option value="">All stages</option>{['TARGET', 'NETWORKING', 'READY_TO_APPLY', 'APPLIED', 'ASSESSMENT', 'FIRST_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'].map(x => <option key={x} value={x}>{stage(x)}</option>)}</select><select aria-label="Priority" value={filters.priority} onChange={e => set('priority', e.target.value)}><option value="">All priorities</option>{['HIGH', 'MEDIUM', 'LOW'].map(x => <option key={x}>{x}</option>)}</select><select aria-label="Deadline window" value={filters.deadline} onChange={e => set('deadline', e.target.value)}><option value="">Any deadline</option><option value="passed">Passed</option><option value="today">Due today</option><option value="soon">Due within 7 days</option><option value="normal">Later</option><option value="none">No deadline</option></select><select aria-label="Opportunity activity" value={filters.activity} onChange={e => set('activity', e.target.value)}><option value="active">Open</option><option value="expired">Expired</option><option value="archived">Archived</option><option value="">All records</option></select><button className="secondary" onClick={() => setFilters({ q: '', stage: '', priority: '', activity: 'active', deadline: '' })}>Clear filters</button><a className="secondary" href="/api/export/opportunities">Export CSV</a><a className="secondary" href="/api/opportunity-imports/template.csv"><Download size={14}/> Template</a></div><p className="results-copy">{rows.length} {rows.length === 1 ? 'opportunity' : 'opportunities'} shown</p><div className="opportunity-workspace">{rows.map(x => { const deadline = deadlineState(x.applicationDeadline), app = x.applications?.[0], context = x.networkingContact ? `${x.networkingContact.firstName} ${x.networkingContact.lastName}` : x.referralStatus && x.referralStatus !== 'NONE' ? `Referral ${stage(x.referralStatus)}` : 'No networking or referral linked'; return <article className="opportunity-card" key={x.id}><div className="opportunity-card-head"><div><p className="eyebrow">{x.company.name}</p><h2>{x.roleTitle}</h2><p className="opportunity-location">{location(x)}</p></div><div className="opportunity-badges"><Badge tone={x.priority === 'HIGH' ? 'rose' : x.priority === 'LOW' ? 'gray' : 'blue'}>{x.priority || 'MEDIUM'}</Badge><Badge tone={app ? 'blue' : stageTone(x.status)}>{stage(opportunityStage(x))}</Badge></div></div><div className="opportunity-meta"><span className={`opportunity-deadline ${deadline}`}>{deadline === 'passed' ? `Application window closed · ${deadlineDate(x.applicationDeadline)}` : deadline === 'today' ? 'Deadline today' : deadline === 'soon' ? `Deadline soon · ${deadlineDate(x.applicationDeadline)}` : deadline === 'normal' ? `Deadline · ${deadlineDate(x.applicationDeadline)}` : 'No deadline listed'}</span><span>{context}</span></div><div className="opportunity-next"><span>NEXT</span><strong>{next(x)}</strong></div><div className="opportunity-card-actions"><button className="text-btn" onClick={() => onOpen(x.id)}>Open details <ChevronRight size={15}/></button>{!app && deadline !== 'passed' && x.status !== 'CLOSED' && <button className="text-btn" disabled={applying === x.id} onClick={() => apply(x.id)}>{applying === x.id ? 'Moving…' : 'Applied'}</button>}{x.status !== 'CLOSED' && <button className="text-btn danger" onClick={() => archive(x.id)}>Archive</button>}</div></article>; })}</div>{!rows.length && <section className="panel empty-copy">No opportunities match these filters. Try clearing a filter or add a new role.</section>}</>; }
function Applications({ data, docs, refresh, focusId, onBack }: {
    data: any[];
    docs: any[];
    refresh: () => void;
    focusId?:string;onBack:()=>void;
}) { const {go}=useNavigation(); const columns = ['PREPARING_APPLICATION', 'APPLIED', 'ASSESSMENT', 'FIRST_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED']; const [selected, setSelected] = useState<any>(null), [message, setMessage] = useState(''), [query,setQuery]=useState(''), [lifecycle,setLifecycle]=useState('active'); useEffect(()=>{if(focusId)api('/applications/'+focusId).then(setSelected).catch((e:any)=>setMessage(e.message))},[focusId]); const move = async (id: string, stageName: string) => { try {
    await api(`/applications/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: stageName }) });
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const saveDocuments = async (e: any) => { e.preventDefault(); try {
    const body:Record<string,any> = Object.fromEntries(new FormData(e.currentTarget));
    for (const key of ['resumeId', 'coverLetterId', 'transcriptId'])
        if (!body[key])
            body[key] = null;
    const updated = await api(`/applications/${selected.id}/documents`, { method: 'PATCH', body: JSON.stringify(body) });
    setSelected(updated);
    await refresh();
    setMessage('Application documents saved.');
}
catch (e: any) {
    setMessage(e.message);
} }; const options = (type: string) => <><option value="">None selected</option>{docs.filter(x => x.type === type).map(x => <option value={x.id} key={x.id}>{x.name}{x.version ? ` · v${x.version}` : ''}</option>)}</>; if (selected) {
    const app = data.find(x => x.id === selected.id) || selected, jobPosting = applicationExternalLink(app);
    return <><button className="text-btn" onClick={onBack}>← Back</button><Header title={`${app.opportunity.company.name} — ${app.opportunity.roleTitle}`} desc={`${stage(app.currentStage)} · ${app.opportunity.office?.city || app.opportunity.location || 'Target office not selected'}`}/>{message && <p className="notice">{message}</p>}<div className="detail-layout"><article className="panel"><h2>Recruiting context</h2><p><RecordLink kind="opportunity" id={app.opportunityId}>View opportunity →</RecordLink> · <RecordLink kind="company" id={app.opportunity.companyId}>View firm →</RecordLink></p><h3>Interviews & tasks</h3>{(app.interviews||[]).map((i:any)=><p key={i.id}><RecordLink kind="interview" id={i.id}>{stage(i.interviewRound)} · {interviewWhen(i.date,i.timezone)}</RecordLink></p>)}{(app.tasks||[]).map((t:any)=><p key={t.id}><RecordLink kind="task" id={t.id}>{t.title}</RecordLink></p>)}<div className="detail-fields"><div><span>Opportunity stage</span><strong>{stage(app.opportunity.status)}</strong></div><div><span>Referral</span><strong>{app.opportunity.referralStatus || 'NONE'}</strong></div><div><span>Networking contact</span><strong><RecordLink kind="contact" id={app.opportunity.networkingContact?.id}>{app.opportunity.networkingContact ? `${app.opportunity.networkingContact.firstName} ${app.opportunity.networkingContact.lastName}` : '—'}</RecordLink></strong></div><div><span>Submitted</span><strong>{fmt(app.dateSubmitted)}</strong></div></div>{jobPosting ? <p><a className="secondary" href={jobPosting.href} target="_blank" rel="noopener noreferrer">{jobPosting.label} ↗</a></p> : <p className="empty-copy">No application or job-posting link was saved for this application.</p>}<label className="recruiting-stage-control">Move recruiting stage<select value={app.currentStage} onChange={e => move(app.id, e.target.value)}>{columns.map(x => <option key={x} value={x}>{stage(x)}</option>)}</select></label></article><article className="panel"><h2>Documents used for this application</h2><p className="sub">Changing your global default resume never changes this saved selection.</p><form className="profile-form" onSubmit={saveDocuments}><label>Resume<select name="resumeId" defaultValue={app.resumeId || ''}>{options('RESUME')}</select></label><label>Cover letter<select name="coverLetterId" defaultValue={app.coverLetterId || ''}>{options('COVER_LETTER')}</select></label><label>Transcript<select name="transcriptId" defaultValue={app.transcriptId || ''}>{options('TRANSCRIPT')}</select></label><button className="primary">Save document selections</button></form><div className="detail-fields"><div><span>Resume used</span><strong><RecordLink kind="document" id={app.resume?.id}>{app.resume?.name || 'None selected'}</RecordLink></strong></div><div><span>Cover letter used</span><strong><RecordLink kind="document" id={app.coverLetter?.id}>{app.coverLetter?.name || 'None selected'}</RecordLink></strong></div><div><span>Transcript used</span><strong><RecordLink kind="document" id={app.transcript?.id}>{app.transcript?.name || 'None selected'}</RecordLink></strong></div></div></article></div></>;
} ;
if(focusId)return <><button className="text-btn" onClick={onBack}>← Back</button><p role="status">{message||'Loading application…'}</p></>;
const filtered=filterApplications(data,query,lifecycle);
const visibleColumns=lifecycle==='active'?columns.slice(0,5):lifecycle==='terminal'?columns.slice(5):columns;
return <><Header title="Applications" desc="Move each consulting process forward and keep its recruiting context together."/>
{message&&<p className="notice">{message}</p>}
<div className="opportunity-toolbar application-toolbar"><div className="search small"><Search size={17}/><input aria-label="Search applications" placeholder="Search firms, roles, locations" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Application lifecycle" value={lifecycle} onChange={e=>setLifecycle(e.target.value)}><option value="active">Active pipeline</option><option value="terminal">Offers & closed outcomes</option><option value="all">All applications</option></select>{(query||lifecycle!=='active')&&<button className="secondary" onClick={()=>{setQuery('');setLifecycle('active')}}>Clear filters</button>}</div>
<p className="results-copy">{filtered.length} of {data.length} applications shown</p>
<div className="kanban">{visibleColumns.map(c=><div className="kanban-col" key={c} onDragOver={e=>e.preventDefault()} onDrop={e=>move(e.dataTransfer.getData('id'),c)}><div className="kanban-head"><h3>{stage(c)}</h3><span>{filtered.filter(x=>x.currentStage===c).length}</span></div>{filtered.filter(x=>x.currentStage===c).map(x=><article className="app-card" draggable onClick={()=>go(recordPath('application',x.id))} role="link" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')go(recordPath('application',x.id))}} onDragStart={e=>e.dataTransfer.setData('id',x.id)} key={x.id}><div className="card-top"><div className="company-mark">{x.opportunity.company.name.slice(0,1)}</div><span className="badge gray">{x.opportunity.employmentType?stage(x.opportunity.employmentType):'Role'}</span></div><h4>{x.opportunity.company.name}</h4><p>{x.opportunity.roleTitle}</p><small>{x.opportunity.office?.city||x.opportunity.location||'Location not listed'} · {x.opportunity.referralStatus&&x.opportunity.referralStatus!=='NONE'?stage(x.opportunity.referralStatus):'No referral'}</small>{x.opportunity.applicationDeadline&&<small>Deadline {deadlineDate(x.opportunity.applicationDeadline)}</small>}{x.opportunity.networkingContact&&<small>{x.opportunity.networkingContact.firstName} {x.opportunity.networkingContact.lastName}</small>}<footer><span>{x.resume?.name||'No resume selected'}</span><b>View</b></footer></article>)}</div>)}</div>
{!filtered.length&&<section className="panel empty-copy">No applications match these filters. Clear the search or choose a different lifecycle view.</section>}</>;
}
const documentTypes = [['RESUME', 'Resume'], ['COVER_LETTER', 'Cover Letter'], ['TRANSCRIPT', 'Transcript'], ['HEADSHOT', 'Headshot'], ['WRITING_SAMPLE', 'Writing Sample'], ['REFERENCE', 'Reference'], ['OTHER', 'Other']] as const;
const documentLabel = (type: string) => documentTypes.find(([value]) => value === type)?.[1] || type;
function Documents({ docs, refresh }: {
    docs: any[];
    refresh: () => void;
}) { const [type, setType] = useState('RESUME'), [filter, setFilter] = useState(''), [pending, setPending] = useState(false), [message, setMessage] = useState(''), [dragging, setDragging] = useState(false); const rows = docs.filter(x => !filter || x.type === filter); const bytes = (size?: number) => size ? size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB` : ''; const upload = async (files: FileList | File[]) => { const selected = Array.from(files); if (!selected.length)
    return; setPending(true); setMessage(''); const fd = new FormData(); selected.forEach(file => fd.append('files', file)); fd.append('type', type); try {
    const r = await fetch('/api/documents', { method: 'POST', credentials: 'include', body: fd }), body = await r.json().catch(() => ({}));
    if (!r.ok)
        throw new Error(body.error || 'Upload failed.');
    const success = body.documents?.length || 0, rejected = body.rejected?.length || 0;
    setMessage(`${success} document${success === 1 ? '' : 's'} uploaded${rejected ? `; ${rejected} skipped: ${body.rejected.map((x: any) => x.name).join(', ')}` : '.'}`);
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
}
finally {
    setPending(false);
} }; const updateType = async (id: string, value: string) => { try {
    await api(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ type: value }) });
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const setDefault = async (id: string) => { try {
    await api(`/documents/${id}/default`, { method: 'POST' });
    setMessage('Default resume updated.');
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; const remove = async (x: any) => { if (!confirm(`Delete ${x.name}?`))
    return; try {
    await api(`/documents/${x.id}`, { method: 'DELETE' });
    setMessage('Document deleted.');
    await refresh();
}
catch (e: any) {
    setMessage(e.message);
} }; return <><Header title="Documents" desc="Keep the right version ready for every application." action={<label className="primary upload"><Upload size={16}/> {pending ? 'Uploading…' : 'Upload files'}<input disabled={pending} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={e => { upload(e.target.files || []); e.currentTarget.value = ''; }}/></label>}/>{message && <p className="notice">{message}</p>}<section className={`document-drop panel ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}><div><strong>Drop recruiting files here</strong><p>PDF, DOC, DOCX, PNG, JPG, or JPEG · up to 10 MB each</p></div><label>Apply type<select value={type} onChange={e => setType(e.target.value)}>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></section><div className="toolbar"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All document types</option>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{docs.some(x => x.type === 'RESUME') && !docs.some(x => x.type === 'RESUME' && x.isDefault) && <p className="empty-copy">Choose a resume as your default before starting an application.</p>}</div>{rows.length ? <div className="docs-grid">{rows.map(x => <article className="doc-card document-card" key={x.id}><div className="doc-icon"><FileText /></div><div className="document-copy">{x.isDefault && <Badge tone="green">DEFAULT RESUME</Badge>}<h3><RecordLink kind="document" id={x.id}>{x.name}</RecordLink></h3><p>{documentLabel(x.type)} · {fmt(x.dateCreated)}{x.sizeBytes ? ` · ${bytes(x.sizeBytes)}` : ''}</p><div className="document-actions"><a className="text-btn" href={`/api/documents/${x.id}/download`}>Download</a><label>Type<select aria-label={`Type for ${x.name}`} value={x.type} onChange={e => updateType(x.id, e.target.value)}>{documentTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{x.type === 'RESUME' && !x.isDefault && <button className="text-btn" onClick={() => setDefault(x.id)}>Set as default</button>}<button className="text-btn danger" onClick={() => remove(x)}>Delete</button></div></div></article>)}</div> : <section className="panel empty-copy">{filter ? `No ${documentLabel(filter).toLowerCase()} documents uploaded yet.` : 'No documents uploaded yet. Add a resume, transcript, or application material to get started.'}</section>}</>; }
function Analytics({ data }: {
    data: any;
}) { const bar = (title: string, arr: any[]) => <article className="panel chart"><div className="panel-head"><div><h2>{title}</h2><p>Applications in your active pipeline</p></div></div>{arr?.map((x: any) => { const max = Math.max(...arr.map(y => y.value), 1); return <div className="chart-row" key={x.label}><span>{x.label}</span><div><i style={{ width: `${x.value / max * 100}%` }}/></div><b>{x.value}</b></div>; })}</article>; return <><Header title="Analytics" desc="Use the data to find where your recruiting engine is working."/><section className="metrics analytics-metrics">{[['Applications', data?.total], ['Interviews', data?.interviews], ['Interview rate', `${data?.interviewRate || 0}%`], ['Offer rate', `${data?.offerRate || 0}%`]].map(([l, v]) => <article className="metric" key={String(l)}><p>{l}</p><strong>{v}</strong><span className="metric-note">Current cycle</span></article>)}</section><section className="chart-grid">{bar('Applications by source', data?.bySource || [])}{bar('Applications by practice', data?.byPractice || [])}</section></>; }
function Header({ title, desc, action }: {
    title: string;
    desc: string;
    action?: React.ReactNode;
}) { return <div className="page-head compact"><div><h1>{title}</h1><p className="sub">{desc}</p></div>{action}</div>; }
function Workspace({user,onUserChange,onLogout}:{user:any,onUserChange:(u:any)=>void,onLogout:()=>void}) {
 const {hash,route,go,back}=useWorkspaceRoute();
 const page=nav.find(([name])=>name.toLowerCase()===route.section)?.[0]||'Dashboard';
 const [modal,setModal]=useState<string|null>(null),[data,setData]=useState<any>({}),[accountMenuOpen,setAccountMenuOpen]=useState(false),[notice,setNotice]=useState(''),[loadError,setLoadError]=useState('');
 const [opportunityFilters,setOpportunityFilters]=useState({q:'',stage:'',priority:'',activity:'active',deadline:''});
 const load=async()=>{
  const requests=[['dashboard','dashboard?timeZone='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)],['opportunities','opportunities?includeConverted=true'],['applications','applications'],['contacts','contacts'],['timeline','timeline'],['documents','documents'],['tasks','tasks'],['analytics','analytics'],['interviews','interviews?archived=true'],['companies','companies']];
  const results=await Promise.allSettled(requests.map(([,path])=>api('/'+path)));
  const updates:any={};let failed=false;
  results.forEach((result,i)=>{if(result.status==='fulfilled')updates[requests[i][0]]=result.value;else{failed=true;if(result.reason.status===401)onLogout()}});
  setData((current:any)=>({...current,...updates}));setLoadError(failed?'Some workspace data could not be loaded. Your saved data is unchanged.':'');
 };
 useEffect(()=>{void load()},[]);
 useEffect(()=>{setAccountMenuOpen(false)},[hash]);
 const setPage=(name:string)=>{setNotice('');go('#/'+name.toLowerCase())};
 const openOpportunity=(id:string)=>go(id?recordPath('opportunity',id):'#/opportunities');
 const openAction=(action:any)=>go(recordPath(action.kind,action.id));
 const markApplied=async(id:string)=>{const result=await api('/opportunities/'+id+'/applied',{method:'POST',body:'{}'});await load();setNotice('Moved to Applied.');go(recordPath('application',result.item.id))};
 const deleteOpportunity=async(id:string)=>{await api('/opportunities/'+id,{method:'DELETE'});await load();setNotice('Opportunity deleted.');go('#/opportunities',true)};
 const id=route.id,create=route.query.get('create')==='true',context={opportunityId:route.query.get('opportunityId'),applicationId:route.query.get('applicationId'),companyId:route.query.get('companyId')};
 const basic=route.kind==='opportunity'&&id?<OpportunityDetail key={id} api={api} refresh={load} actions={data.dashboard?.todayActions||[]} opportunity={{id}} onOpen={openAction} onBack={()=>back('#/opportunities')} onApplied={markApplied} onDelete={deleteOpportunity} onNetworking={()=>go('#/networking')} onAddTask={(op:any)=>go('#/tasks?create=true&opportunityId='+encodeURIComponent(op.id)+'&companyId='+encodeURIComponent(op.companyId)+(op.applications[0]?'&applicationId='+encodeURIComponent(op.applications[0].id):''))} onSchedule={(op:any)=>go('#/interviews?create=true'+(op.applications[0]?'&applicationId='+encodeURIComponent(op.applications[0].id):''))}/>:
 page==='Dashboard'?<InterviewDashboard data={data.dashboard?{...data.dashboard,opportunities:data.opportunities||[]}:null} setPage={setPage} onOpenOpportunity={openOpportunity} onOpenAction={openAction}/>:
 page==='Firms'?<Firms api={api} key={hash} focusId={id} onBack={()=>back('#/firms')}/>:
 page==='Opportunities'?<Opportunities filters={opportunityFilters} setFilters={setOpportunityFilters} data={data.opportunities||[]} refresh={load} onApplied={markApplied} onOpen={openOpportunity}/>:
 page==='Applications'?<><Applications key={hash} focusId={id} data={data.applications||[]} docs={data.documents||[]} refresh={load} onBack={()=>back('#/applications')}/>{!id&&<ApplicationDeletionControls data={data.applications||[]} refresh={load}/>}</>:
 page==='Interviews'?<Interviews key={hash} focusId={id} create={create} context={context} applications={data.applications||[]} contacts={data.contacts||[]} tasks={data.tasks||[]} refresh={load} onBack={()=>back('#/interviews')}/>:
 page==='Networking'?<Networking key={id||'list'} api={api} contacts={data.contacts||[]} refresh={load} focusId={id} onBack={()=>back('#/networking')}/>:
 page==='Timeline'?<Timeline data={data.timeline}/>:
 page==='Documents'?id?<DocumentDetail key={id} id={id} api={api} refresh={load}/>:<Documents docs={data.documents||[]} refresh={load}/>:
 page==='Tasks'?<ActionTasks key={hash} focusId={id} create={create} context={context} tasks={data.tasks||[]} data={data} refresh={load} onBack={()=>back('#/tasks')}/>:
 page==='Analytics'?<Analytics data={data.analytics}/>:<Profile user={user} onSaved={onUserChange}/>;
    return <NavigationContext.Provider value={{go,back}}><div className="app"><aside><div className="brand"><div>c</div><span>consulting<span>hub</span></span></div><nav>{nav.map(([name, Icon]) => <button className={page === name ? 'active' : ''} aria-current={page === name ? 'page' : undefined} aria-label={name} title={name} key={name} onClick={() => setPage(name)}><Icon size={19}/>{name}</button>)}</nav><div className="sidebar-bottom"><div className="account-menu"><button className="profile profile-trigger" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(!accountMenuOpen)} onKeyDown={e => { if (e.key === 'Escape')
        setAccountMenuOpen(false); }}><div className="avatar">{user.name.split(' ').map((x: string) => x[0]).join('').slice(0, 2)}</div><div><strong>{user.name}</strong><span>{user.school || 'Recruiting profile'}{user.graduationYear ? ` · ${user.graduationYear}` : ''}</span></div><span className="account-caret" aria-hidden="true">▾</span><span className="sr-only">Open account menu</span></button>{accountMenuOpen && <div className="account-dropdown" role="menu"><button role="menuitem" onClick={() => setPage('Settings')}>Profile & settings</button><button role="menuitem" onClick={onLogout}>Log out</button></div>}</div></div></aside><main><header className="topbar"><WorkspaceSearch data={data} onOpen={openAction}/><button className="primary" onClick={() => setModal('opportunity')}><Plus size={17}/> Add</button></header><div className="content">{notice && <p className="notice">{notice}</p>}{loadError&&<p className="notice" role="alert">{loadError} <button className="text-btn" onClick={()=>load()}>Retry loading</button></p>}{basic}</div><div className="quick" role="toolbar" aria-label="Quick add"><button onClick={() => setModal('opportunity')}><Plus /> Opportunity</button><button onClick={() => setModal('contact')}><Users /> Contact</button><button onClick={() => setModal('interaction')}><Clock /> Interaction</button><button onClick={() => setModal('task')}><CheckSquare /> Task</button></div></main>{modal!==null && ['contact', 'interaction'].includes(modal) ? <NetworkingDialog key={modal} kind={modal} api={api} contacts={data.contacts || []} onClose={() => setModal(null)} onSaved={async (id: string) => { await load(); openAction({ kind: 'contact', id }); }}/> : <Modal open={modal} onClose={() => setModal(null)} kind={modal} refresh={load}/>}</div></NavigationContext.Provider>;
}
const consultingTypes = ['MBB', 'Big 4', 'Strategy Consulting', 'Boutique Consulting', 'Economic Consulting', 'Technology Consulting', 'Other'];
function CalendarSettings() { const [status, setStatus] = useState<any>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false); const load = () => api('/google-calendar/status').then(setStatus).catch((e: any) => setMessage(e.message)); useEffect(() => { load(); const result = new URLSearchParams(location.hash.split('?')[1] || '').get('calendar'); if (result === 'connected')
    setMessage('Google Calendar connected.');
else if (result === 'canceled')
    setMessage('Google Calendar connection canceled.');
else if (result === 'error')
    setMessage('Google Calendar could not be connected. Check the configuration and try again.'); }, []); const preference = async (value: boolean) => { setBusy(true); try {
    setStatus(await api('/google-calendar/preferences', { method: 'PATCH', body: JSON.stringify({ autoAddPlannedInteractions: value }) }));
    setMessage('Calendar preference saved.');
}
catch (e: any) {
    setMessage(e.message);
}
finally {
    setBusy(false);
} }; const disconnect = async () => { if (!confirm('Disconnect Google Calendar? Existing Google Calendar events will remain, but Consulting Hub will stop syncing them.'))
    return; setBusy(true); try {
    await api('/google-calendar/connection', { method: 'DELETE' });
    await load();
    setMessage('Google Calendar disconnected.');
}
catch (e: any) {
    setMessage(e.message);
}
finally {
    setBusy(false);
} }; return <section className="profile-form calendar-settings" aria-labelledby="calendar-settings-title"><div className="panel-head"><div><h2 id="calendar-settings-title">Google Calendar</h2><p>Optionally add planned networking interactions to your primary calendar. Follow-up reminders remain Consulting Hub tasks.</p></div>{status?.connected && <span className="status-badge">Connected</span>}</div>{message && <p className="notice" role="status">{message}</p>}{status === null ? <p className="empty-copy">Checking calendar connection…</p> : status.connected ? <><label className="calendar-preference"><input type="checkbox" checked={!!status.autoAddPlannedInteractions} disabled={busy} onChange={e => preference(e.target.checked)}/><span><strong>Add new planned interactions by default</strong><small>You can override this in each Plan Interaction form.</small></span></label><button className="text-btn danger calendar-disconnect" type="button" disabled={busy} onClick={disconnect}>Disconnect Google Calendar</button></> : status.configured ? <div><p className="empty-copy">Connect only if you want one-way event creation and updates. Consulting Hub never reads or imports your calendar.</p><a className="primary calendar-connect" href="/api/google-calendar/connect">Connect Google Calendar</a></div> : <p className="notice">Google Calendar is not configured for this environment yet.</p>}</section>; }
function Profile({ user, onSaved }: {
    user: any;
    onSaved: (u: any) => void;
}) { const [form, setForm] = useState<any>(user), [message, setMessage] = useState(''); const save = async (e: any) => { e.preventDefault(); try {
    const r = await api('/profile', { method: 'PATCH', body: JSON.stringify(form) });
    onSaved(r.user);
    setMessage('Profile saved.');
}
catch (e: any) {
    setMessage(e.message);
} }; return <><Header title="Profile" desc="Your recruiting preferences shape your workspace."/><form className="profile-form" onSubmit={save}><label>Full name<input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>School<input value={form.school || ''} onChange={e => setForm({ ...form, school: e.target.value })}/></label><label>Graduation year<input type="number" value={form.graduationYear || ''} onChange={e => setForm({ ...form, graduationYear: e.target.value })}/></label><label>Recruiting for<select value={form.recruitingFor || ''} onChange={e => setForm({ ...form, recruitingFor: e.target.value })}><option value="">Select one</option><option>Internship</option><option>Full-time</option></select></label><label>Target recruiting year<input placeholder="Summer 2027" value={form.targetRecruitingYear || ''} onChange={e => setForm({ ...form, targetRecruitingYear: e.target.value })}/></label><fieldset><legend>Target consulting types</legend>{consultingTypes.map(type => <label className="check-option" key={type}><input type="checkbox" checked={(form.targetConsultingTypes || []).includes(type)} onChange={e => setForm({ ...form, targetConsultingTypes: e.target.checked ? [...(form.targetConsultingTypes || []), type] : (form.targetConsultingTypes || []).filter((x: string) => x !== type) })}/>{type}</label>)}</fieldset>{message && <p className="notice">{message}</p>}<button className="primary">Save profile</button></form><CalendarSettings /></>; }
function AuthScreen({ mode, onSuccess }: {
    mode: 'login' | 'register';
    onSuccess: (u: any) => void;
}) { const [form, setForm] = useState<any>({}), [error, setError] = useState(''), [loading, setLoading] = useState(false); const register = mode === 'register'; const submit = async (e: any) => { e.preventDefault(); setError(''); if (register && form.password !== form.confirmPassword)
    return setError('Passwords do not match.'); setLoading(true); try {
    const r = await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(form) });
    onSuccess(r.user);
}
catch (e: any) {
    setError(e.message);
}
finally {
    setLoading(false);
} }; return <div className="auth-shell"><section className="auth-card"><div className="auth-brand"><div>c</div><span>consulting<span>hub</span></span></div><p className="eyebrow">YOUR RECRUITING OS</p><h1>{register ? 'Create your account' : 'Welcome back'}</h1><p>{register ? 'Set up your private consulting recruiting workspace.' : 'Log in to continue your recruiting process.'}</p><form onSubmit={submit}>{register && <label>Full name<input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })}/></label>}<label>Email<input required type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label>Password<input required minLength={8} type="password" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })}/></label>{register && <label>Confirm password<input required type="password" value={form.confirmPassword || ''} onChange={e => setForm({ ...form, confirmPassword: e.target.value })}/></label>}{error && <p className="auth-error">{error}</p>}<button className="primary full" disabled={loading}>{loading ? 'Please wait…' : register ? 'Create account' : 'Log in'}</button></form><p className="auth-switch">{register ? 'Already have an account?' : 'New to Consulting Hub?'} <a href={register ? '#/login' : '#/register'}>{register ? 'Log in' : 'Create one'}</a></p><p className="auth-switch"><a href="#/">← Back to product overview</a></p></section></div>; }
function Onboarding({ user, onDone }: {
    user: any;
    onDone: (u: any) => void;
}) { const [form, setForm] = useState<any>({ ...user, school: user.school || 'BYU', graduationYear: user.graduationYear || 2028 }), [message, setMessage] = useState(''); const save = async (e: any) => { e.preventDefault(); try {
    const r = await api('/profile', { method: 'PATCH', body: JSON.stringify({ ...form, onboardingCompleted: true }) });
    onDone(r.user);
}
catch (e: any) {
    setMessage(e.message);
} }; return <div className="auth-shell"><section className="auth-card onboarding"><div className="auth-brand"><div>c</div><span>consulting<span>hub</span></span></div><p className="eyebrow">WELCOME TO CONSULTING HUB</p><h1>Tell us what you’re recruiting for.</h1><p>We’ll use this to organize your process.</p><form onSubmit={save}><label>School<input required value={form.school || ''} onChange={e => setForm({ ...form, school: e.target.value })}/></label><label>Graduation year<input required type="number" value={form.graduationYear || ''} onChange={e => setForm({ ...form, graduationYear: e.target.value })}/></label><label>Recruiting for<select required value={form.recruitingFor || ''} onChange={e => setForm({ ...form, recruitingFor: e.target.value })}><option value="">Select one</option><option>Internship</option><option>Full-time</option></select></label><label>Target recruiting year<input required placeholder="Summer 2027" value={form.targetRecruitingYear || ''} onChange={e => setForm({ ...form, targetRecruitingYear: e.target.value })}/></label><fieldset><legend>Target consulting types</legend>{consultingTypes.map(type => <label className="check-option" key={type}><input type="checkbox" checked={(form.targetConsultingTypes || []).includes(type)} onChange={e => setForm({ ...form, targetConsultingTypes: e.target.checked ? [...(form.targetConsultingTypes || []), type] : (form.targetConsultingTypes || []).filter((x: string) => x !== type) })}/>{type}</label>)}</fieldset>{message && <p className="auth-error">{message}</p>}<button className="primary full">Finish setup</button></form></section></div>; }
function App() { const [user, setUser] = useState<any>(null), [checking, setChecking] = useState(true), [publicRoute, setPublicRoute] = useState(location.hash.split('?')[0] || '#/'); useEffect(() => { api('/auth/me').then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecking(false)); const onHashChange = () => setPublicRoute(location.hash.split('?')[0] || '#/'); addEventListener('hashchange', onHashChange); return () => removeEventListener('hashchange', onHashChange); }, []); const logout = async () => { try {
    await api('/auth/logout', { method: 'POST' });
}
finally {
    setUser(null);
    location.hash = '#/';
} }; if (checking)
    return <div className="auth-loading">Loading Consulting Hub…</div>; if (!user) {
    if (publicRoute === '#/login' || publicRoute === '#/register')
        return <AuthScreen mode={publicRoute === '#/register' ? 'register' : 'login'} onSuccess={setUser}/>;
    return <PublicLanding />;
} if (!user.onboardingCompleted)
    return <Onboarding user={user} onDone={setUser}/>; return <Workspace user={user} onUserChange={setUser} onLogout={logout}/>; }
;
createRoot(document.getElementById('root')!).render(<App />);
