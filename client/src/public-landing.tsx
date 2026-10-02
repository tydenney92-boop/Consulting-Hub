import React from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronRight,
  Clock3,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Network,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import './public-landing.css';

const Logo = () => (
  <a className="public-brand" href="#/" aria-label="Consulting Hub home">
    <span className="public-brand-mark">c</span>
    <span>consulting<span>hub</span></span>
  </a>
);

const DemoBadge = () => <span className="demo-badge">Fictional demo data</span>;

const demoActions = [
  {tone:'urgent', title:'Submit Bluebird Economics application', meta:'Economic Consulting Intern · Due today', type:'Application'},
  {tone:'today', title:'Follow up with Maya Torres', meta:'Pine & Peak Advisory · Due today', type:'Networking'},
  {tone:'soon', title:'Complete Summit Ridge assessment', meta:'Strategy Analyst Intern · Due tomorrow', type:'Assessment'},
  {tone:'calm', title:'Prepare for first-round interview', meta:'Juniper Strategy Collective · Friday, 10:00 AM', type:'Interview'},
];

const stages = [
  {label:'Target', count:4, width:'74%'},
  {label:'Networking', count:3, width:'58%'},
  {label:'Ready to apply', count:2, width:'40%'},
  {label:'Applied', count:3, width:'58%'},
  {label:'Interviewing', count:1, width:'24%'},
  {label:'Offers', count:0, width:'7%'},
];

const opportunities = [
  {firm:'Pine & Peak Advisory', role:'Summer Strategy Associate', place:'Denver · Priority: High', stage:'NETWORKING', deadline:'Due Oct 8', next:'Follow up with Maya Torres'},
  {firm:'Bluebird Economics', role:'Economic Consulting Intern', place:'Chicago · Priority: High', stage:'READY TO APPLY', deadline:'Due today', next:'Submit application'},
  {firm:'Summit Ridge Partners', role:'Business Analyst Intern', place:'New York · Priority: Medium', stage:'APPLIED', deadline:'Applied Sep 28', next:'Complete online assessment'},
];

const features = [
  {icon:LayoutDashboard, title:'Know what matters today', copy:'A ranked action queue combines deadlines, follow-ups, assessments, interviews, and tasks so the next move is always clear.'},
  {icon:Target, title:'Run one recruiting pipeline', copy:'Track target roles from discovery and networking through application, interviews, and final outcomes without duplicating records.'},
  {icon:Users, title:'Build relationships deliberately', copy:'Keep contacts, alumni connections, interaction history, referral progress, and follow-up reminders connected to each firm.'},
  {icon:Building2, title:'Organize firms and offices', copy:'Group opportunities, contacts, applications, and activity under the firms and target offices they belong to.'},
  {icon:CalendarDays, title:'Prepare for every interview', copy:'Schedule interview rounds, record outcomes, connect preparation tasks, and optionally add planned networking to Google Calendar.'},
  {icon:FileText, title:'Use the right documents', copy:'Manage resumes, cover letters, and transcripts—and preserve exactly which version was used for each application.'},
];

function DemoWorkspace(){
  return <section className="demo-section" id="demo" aria-labelledby="demo-title">
    <div className="public-section-heading">
      <div><p className="public-kicker">THE WORKSPACE</p><h2 id="demo-title">Your recruiting process, in one view.</h2></div>
      <p>This preview is read-only. Every firm, person, role, and activity below is fictional.</p>
    </div>
    <div className="demo-window">
      <aside className="demo-sidebar" aria-label="Demo navigation">
        <Logo/>
        <div className="demo-nav">
          <span className="active"><LayoutDashboard/> Dashboard</span>
          <span><Building2/> Firms</span>
          <span><Target/> Opportunities</span>
          <span><Users/> Networking</span>
          <span><CalendarDays/> Interviews</span>
          <span><CheckSquare/> Tasks</span>
          <span><FileText/> Documents</span>
        </div>
        <div className="demo-user"><span>AD</span><div><strong>Alex Demo</strong><small>Summer 2027</small></div></div>
      </aside>
      <div className="demo-main">
        <div className="demo-topbar"><span>Recruiting command center</span><DemoBadge/></div>
        <div className="demo-content">
          <div className="demo-page-head"><div><p className="public-kicker">GOOD MORNING, ALEX</p><h3>What should you do next?</h3><p>Prioritized from your recruiting deadlines, follow-ups, and pipeline.</p></div><button type="button" tabIndex={-1}>Manage tasks <CheckSquare/></button></div>
          <div className="demo-dashboard-grid">
            <article className="demo-panel demo-today">
              <div className="demo-panel-head"><div><h4>Today</h4><p>Your highest-priority recruiting actions.</p></div><span>View all <ChevronRight/></span></div>
              <div className="demo-action-list">{demoActions.map(action=><div className="demo-action" key={action.title}><i className={action.tone}/><div><strong>{action.title}</strong><small>{action.meta}</small></div><em>{action.type}</em></div>)}</div>
            </article>
            <article className="demo-panel demo-pipeline">
              <div className="demo-panel-head"><div><h4>Pipeline</h4><p>Active recruiting work by stage.</p></div></div>
              {stages.map(item=><div className="demo-funnel" key={item.label}><span>{item.label}</span><div><i style={{width:item.width}}/></div><b>{item.count}</b></div>)}
            </article>
          </div>
          <article className="demo-panel demo-opportunities">
            <div className="demo-panel-head"><div><h4>Active opportunities</h4><p>Roles, coverage, deadlines, and next actions.</p></div><span>Open workspace <ChevronRight/></span></div>
            <div className="demo-opportunity-grid">{opportunities.map(item=><div className="demo-opportunity" key={item.role}><div><span>{item.stage}</span><small>{item.deadline}</small></div><h5>{item.firm}</h5><p>{item.role}</p><small>{item.place}</small><footer><span>Next action</span><strong>{item.next}</strong></footer></div>)}</div>
          </article>
          <div className="demo-lower-grid">
            <article className="demo-panel">
              <div className="demo-panel-head"><div><h4>Networking health</h4><p>Relationships that need attention.</p></div></div>
              <div className="demo-person"><span>MT</span><div><strong>Maya Torres</strong><small>Pine & Peak Advisory · Follow-up today</small></div><b>3 interactions</b></div>
              <div className="demo-person"><span>JK</span><div><strong>Jordan Kim</strong><small>Bluebird Economics · Referral received</small></div><b>5 interactions</b></div>
              <div className="demo-person"><span>EB</span><div><strong>Eli Bennett</strong><small>Juniper Strategy Collective · Coffee chat Friday</small></div><b>2 interactions</b></div>
            </article>
            <article className="demo-panel">
              <div className="demo-panel-head"><div><h4>Upcoming interview</h4><p>Preparation stays attached to the application.</p></div></div>
              <div className="demo-interview"><span><CalendarDays/></span><div><strong>Juniper Strategy Collective</strong><p>First round · Strategy Analyst Intern</p><small>Friday, Oct 9 · 10:00 AM MDT</small></div></div>
              <ul className="demo-checklist"><li><Check/> Review behavioral stories</li><li><Check/> Complete market-sizing practice</li><li className="open"><Clock3/> Research interviewers</li></ul>
            </article>
          </div>
        </div>
      </div>
    </div>
  </section>
}

export function PublicLanding(){
  return <div className="public-site">
    <header className="public-header">
      <Logo/>
      <nav aria-label="Public navigation"><a href="#features">Features</a><a href="#demo">Product tour</a><a href="#/login">Log in</a><a className="public-nav-cta" href="#/register">Create account <ArrowRight/></a></nav>
    </header>
    <main>
      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="public-kicker"><Sparkles/> BUILT FOR CONSULTING RECRUITING</p>
          <h1>Turn a complicated recruiting process into a clear next move.</h1>
          <p className="public-lede">Consulting Hub brings opportunities, networking, applications, interviews, tasks, and documents into one private recruiting workspace.</p>
          <div className="public-hero-actions"><a className="public-primary" href="#/register">Build your recruiting workspace <ArrowRight/></a><a className="public-secondary" href="#demo">Explore the demo</a></div>
          <div className="public-trust"><span><Check/> Purpose-built workflow</span><span><Check/> Real persisted data</span><span><LockKeyhole/> Private by account</span></div>
        </div>
        <div className="public-hero-preview" aria-label="Fictional recruiting action preview">
          <div className="preview-top"><div><span className="preview-logo">c</span><strong>Today</strong></div><DemoBadge/></div>
          <div className="preview-summary"><span>4</span><div><strong>actions need attention</strong><small>Across applications, networking, and interviews</small></div></div>
          {demoActions.slice(0,3).map((action,index)=><div className="preview-action" key={action.title}><span>{index+1}</span><div><strong>{action.title}</strong><small>{action.meta}</small></div><ArrowRight/></div>)}
          <div className="preview-foot"><Network/><span>One connected workflow from first target to final decision.</span></div>
        </div>
      </section>
      <section className="public-proof" aria-label="Product summary"><div><strong>One workspace</strong><span>for the entire recruiting process</span></div><div><strong>Action-first</strong><span>priorities instead of vanity metrics</span></div><div><strong>Ownership-scoped</strong><span>private records protected by account</span></div></section>
      <DemoWorkspace/>
      <section className="feature-section" id="features" aria-labelledby="features-title">
        <div className="public-section-heading"><div><p className="public-kicker">CONNECTED WORKFLOWS</p><h2 id="features-title">Everything behind the next action.</h2></div><p>Consulting Hub connects the details candidates normally scatter across spreadsheets, calendars, notes, and browser tabs.</p></div>
        <div className="feature-grid">{features.map(({icon:Icon,title,copy})=><article key={title}><span><Icon/></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="workflow-section">
        <div><p className="public-kicker">FROM TARGET TO OFFER</p><h2>A workflow designed around how consulting recruiting actually moves.</h2><p>Start with a target firm, build networking coverage, prepare the application, track every interview round, and keep the relevant tasks and documents attached throughout.</p><a className="public-primary" href="#/register">Create your account <ArrowRight/></a></div>
        <ol><li><span>01</span><div><strong>Target the right firms and offices</strong><small>Set priorities and collect the roles you want to pursue.</small></div></li><li><span>02</span><div><strong>Build real networking context</strong><small>Track contacts, interactions, alumni ties, referrals, and follow-ups.</small></div></li><li><span>03</span><div><strong>Move opportunities into applications</strong><small>Keep deadlines, documents, and application stages connected.</small></div></li><li><span>04</span><div><strong>Prepare and follow through</strong><small>Manage interviews, assessments, tasks, outcomes, and the next action.</small></div></li></ol>
      </section>
      <section className="public-cta"><div><p className="public-kicker">READY WHEN YOU ARE</p><h2>Spend less time managing the process.<br/>Spend more time moving it forward.</h2></div><div><a className="public-primary lime" href="#/register">Create a free workspace <ArrowRight/></a><a href="#/login">Already have an account? Log in</a></div></section>
    </main>
    <footer className="public-footer"><Logo/><p>A focused recruiting workspace for consulting candidates.</p><div><a href="#demo">Demo</a><a href="#features">Features</a><a href="#/login">Log in</a></div></footer>
  </div>
}
