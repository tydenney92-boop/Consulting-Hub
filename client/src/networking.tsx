import React, {useEffect, useRef, useState} from 'react';
import {safeExternalUrl} from './opportunity-detail-model';
import './networking.css';

const label=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const name=(c:any)=>[c.firstName,c.lastName].filter(Boolean).join(' ');
const day=(s?:string)=>s?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(new Date(s.slice(0,10)+'T12:00:00')):'Not set';
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const types=['COFFEE_CHAT','PHONE_CALL','TEXT','EMAIL','LINKEDIN_MESSAGE','RECRUITING_EVENT','INTERVIEW','OFFICE_VISIT','OTHER'];
const stages=['IDENTIFIED','CONTACTED','RESPONDED','COFFEE_CHAT','RELATIONSHIP','REFERRAL'];
function ContactLinks({contact:c}:any){const linked=safeExternalUrl(c.linkedinUrl);return <div className="contact-links">{c.email&&<a href={`mailto:${c.email}`}>{c.email}</a>}{c.phone&&<a href={`tel:${c.phone.replace(/[^+\d]/g,'')}`}>{c.phone}</a>}{linked&&<a href={linked} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn profile for ${name(c)} (opens in a new tab)`}>LinkedIn ↗</a>}</div>}

export function NetworkingDialog({kind,contact,interaction,contacts=[],api,onClose,onSaved}:any){
  const editingInteraction=kind==='interaction'&&!!interaction;
  const [form,setForm]=useState<any>(kind==='interaction'?interaction?{...interaction,date:interaction.date?.slice(0,10),followUpDate:interaction.followUpDate?.slice(0,10)||'',contactId:contact?.id||interaction.contactId}:{type:'PHONE_CALL',date:today(),contactId:contact?.id||''}:contact?{...contact,name:name(contact),company:contact.company?.name||'',nextFollowUpDate:contact.nextFollowUpDate?.slice(0,10)||''}:{name:''});
  const [firms,setFirms]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;dialog.current?.showModal();dialog.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();if(kind==='contact')api('/companies').then(setFirms).catch((e:any)=>setError(e.message));return()=>{previous?.focus()}},[]);
  const set=(key:string,value:any)=>setForm((f:any)=>({...f,[key]:value}));
  const firm=firms.find(f=>f.id===form.companyId);
  const field=(key:string,title:string,type='text')=><label>{title}<input name={key} type={type} value={type==='date'?undefined:form[key]||''} defaultValue={type==='date'?form[key]||'':undefined} onChange={type==='date'?undefined:e=>set(key,e.target.value)}/></label>;
  const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const values=new FormData(e.currentTarget);setBusy(true);setError('');try{
    const body={...form};
    if(kind==='interaction'){
      // Use a calendar date, not an accidental UTC-midnight conversion.
      body.date=String(values.get('date'))+'T12:00:00.000Z';
      body.followUpDate=String(values.get('followUpDate')||'');
      if(!editingInteraction&&!body.followUpDate)delete body.followUpDate;
      await api(editingInteraction?`/interactions/${interaction.id}`:`/contacts/${form.contactId}/interactions`,{method:editingInteraction?'PATCH':'POST',body:JSON.stringify(body)});
      await onSaved(form.contactId);
    }else{
      body.nextFollowUpDate=String(values.get('nextFollowUpDate')||'');
      delete body.company; if(!body.companyId&&form.company?.trim())body.company=form.company.trim();
      const saved=await api(contact?`/contacts/${contact.id}`:'/contacts',{method:contact?'PATCH':'POST',body:JSON.stringify(body)});
      await onSaved(saved.id);
    }
    onClose();
  }catch(e:any){setError(e.message)}finally{setBusy(false)}};
  return <dialog className="network-dialog" ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} aria-labelledby="network-dialog-title"><form onSubmit={save}>
    <div className="panel-head"><h2 id="network-dialog-title">{kind==='interaction'?`${editingInteraction?'Edit':'Log'} interaction${contact?' · '+name(contact):''}`:contact?'Edit contact':'Add contact'}</h2><button type="button" className="text-btn" disabled={busy} onClick={onClose} aria-label="Close form">✕</button></div>
    {error&&<p className="notice" role="alert">{error}</p>}
    {kind==='interaction'?<>
      {!contact&&<label>Contact<select required value={form.contactId} onChange={e=>set('contactId',e.target.value)}><option value="">Choose a contact</option>{contacts.map((c:any)=><option key={c.id} value={c.id}>{name(c)}{c.company?' · '+c.company.name:''}</option>)}</select></label>}
      <div className="network-fields"><label>Interaction type<select required value={form.type} onChange={e=>set('type',e.target.value)}>{types.map(t=><option key={t} value={t}>{label(t)}</option>)}</select></label><label>Date<input name="date" required type="date" defaultValue={form.date}/></label></div>
      {editingInteraction&&<label>Summary <small>optional</small><input value={form.summary||''} onChange={e=>set('summary',e.target.value)} placeholder="Short interaction summary"/></label>}
      <label>Notes <small>optional</small><textarea autoFocus rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="What would you like to remember?"/></label>
      {field('followUpDate','Follow-up date (optional)','date')}<p className="empty-copy">{editingInteraction?'Changing this date updates the generated reminder; clearing it removes that reminder when no other interaction uses it.':'A follow-up date updates your networking reminder. Leave blank to keep any existing reminder.'}</p>
    </>:<>
      <label>Name<input required autoFocus autoComplete="name" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Sarah Chen"/></label>
      <label>Firm / company <small>optional</small><input list="network-firms" value={form.company||''} onChange={e=>{const value=e.target.value,match=firms.find(f=>f.name.toLowerCase()===value.toLowerCase());setForm({...form,company:value,companyId:match?.id||null,officeId:null})}} placeholder="Choose an existing firm or type a name"/><datalist id="network-firms">{firms.map(f=><option key={f.id} value={f.name}/>)}</datalist></label>
      {field('title','Role / title (optional)')}
      <details open={contact?true:undefined}><summary>Add more details</summary><div className="network-fields">
        <label>Target office<select value={form.officeId||''} onChange={e=>set('officeId',e.target.value||null)}><option value="">No target office</option>{firm?.offices?.map((o:any)=><option key={o.id} value={o.id}>{[o.city,o.region].filter(Boolean).join(', ')}</option>)}</select></label>
        {field('location','Location')}{field('email','Email','email')}{field('phone','Phone','tel')}{field('linkedinUrl','LinkedIn URL','url')}{field('school','School / alumni connection')}
        <label>How I met / source<select value={form.source||'OTHER'} onChange={e=>set('source',e.target.value)}>{['OTHER','ALUMNI','CONSULTING_NIGHT','CAREER_FAIR','PROFESSOR','FRIEND','LINKEDIN','RECRUITER','REFERRAL'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label>Networking stage<select value={form.networkingStage||'IDENTIFIED'} onChange={e=>set('networkingStage',e.target.value)}>{stages.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label>Referral status<select value={form.referralStatus||'NONE'} onChange={e=>set('referralStatus',e.target.value)}>{['NONE','POTENTIAL','REQUESTED','RECEIVED'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
        {field('nextFollowUpDate','Next follow-up','date')}{contact&&field('relationshipType','Relationship type')}{contact&&field('relationshipStrength','Relationship strength')}
      </div><label>Notes<textarea rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></label></details>
    </>}
    <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':kind==='interaction'?(editingInteraction?'Save changes':'Save interaction'):'Save contact'}</button></div>
  </form></dialog>;
}

export function Networking({contacts,api,refresh,focusId,onBack}:any){
  const [selected,setSelected]=useState<any>(null),[query,setQuery]=useState(''),[stage,setStage]=useState(''),[dialog,setDialog]=useState<any>(null),[message,setMessage]=useState('');
  const load=async(id:string)=>{try{setSelected(await api(`/contacts/${id}`))}catch(e:any){setMessage(e.message)}};
  useEffect(()=>{if(focusId)load(focusId)},[focusId,contacts]);
  const saved=async(id:string)=>{await refresh();await load(id);setMessage('Saved.')};
  const rows=contacts.filter((c:any)=>[name(c),c.title,c.company?.name,c.school,c.email,c.location,c.office?.city].join(' ').toLowerCase().includes(query.toLowerCase())&&(!stage||c.networkingStage===stage));
  const log=(c:any)=>setDialog({kind:'interaction',contact:c});
  const remove=async()=>{if(!confirm(`Delete ${name(selected)}? This cannot be undone.`))return;try{await api(`/contacts/${selected.id}`,{method:'DELETE'});setSelected(null);await refresh();onBack?.()}catch(e:any){setMessage(e.message)}};
  return <div className="network-page">
    {message&&<p className="notice" role="status">{message}</p>}
    {selected?<>
      <button className="text-btn" onClick={()=>{setSelected(null);onBack?.()}}>← All contacts</button>
      <section className="panel network-profile"><div className="panel-head"><div><h1>{name(selected)}</h1><p>{[selected.title,selected.company?.name,selected.office?.city||selected.location].filter(Boolean).join(' · ')||'Networking contact'}</p></div><button className="primary" onClick={()=>log(selected)}>+ Log interaction</button></div>
        <ContactLinks contact={selected}/><dl className="network-dates"><div><dt>Last contacted</dt><dd>{day(selected.lastContactDate)}</dd></div><div><dt>Next follow-up</dt><dd>{day(selected.nextFollowUpDate)}</dd></div><div><dt>Networking stage</dt><dd>{label(selected.networkingStage)}</dd></div></dl>
        {selected.school&&<p>{selected.school}</p>}{selected.notes&&<p className="network-note">{selected.notes}</p>}
        <details><summary>Relationship details</summary><p>Source: {label(selected.source)} · Referral: {label(selected.referralStatus)}</p><p>{selected.relationshipType} · {selected.relationshipStrength}</p></details>
        <div className="modal-actions"><button className="secondary" onClick={()=>setDialog({kind:'contact',contact:selected})}>Edit contact</button><button className="text-btn danger" onClick={remove}>Delete contact</button></div>
      </section>
      <section className="panel"><div className="panel-head"><h2>Relationship history</h2><span>{selected.interactions.length} interactions</span></div>{selected.interactions.length?<ol className="network-history">{selected.interactions.map((i:any)=><li key={i.id}><div className="network-history-head"><h3>{day(i.date)} — {label(i.type)}</h3><button className="text-btn" onClick={()=>setDialog({kind:'interaction',contact:selected,interaction:i})} aria-label={`Edit ${label(i.type)} from ${day(i.date)}`}>Edit</button></div>{i.summary&&i.summary!==label(i.type)&&<p>{i.summary}</p>}{i.notes&&i.notes!==i.summary&&<p>{i.notes}</p>}{i.followUpDate&&<small>Follow-up planned for {day(i.followUpDate)}</small>}</li>)}</ol>:<p className="empty-copy">No interactions yet. Log a conversation to start your history.</p>}</section>
    </>:<>
      <div className="page-head"><div><h1>Networking</h1><p className="sub">Your relationships, conversations, and next follow-ups.</p></div><button className="primary" onClick={()=>setDialog({kind:'contact'})}>+ Add contact</button></div>
      <div className="opportunity-toolbar"><input aria-label="Search contacts" placeholder="Search people, firms, or schools" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Networking stage filter" value={stage} onChange={e=>setStage(e.target.value)}><option value="">All stages</option>{stages.map(s=><option value={s} key={s}>{label(s)}</option>)}</select></div>
      <div className="network-cards">{rows.map((c:any)=><article className="panel" key={c.id}><button className="text-btn network-name" onClick={()=>load(c.id)}>{name(c)}</button><p>{[c.title,c.company?.name].filter(Boolean).join(' · ')||'Networking contact'}</p><span className="status-badge">{label(c.networkingStage)}</span><dl className="network-dates"><div><dt>Last contacted</dt><dd>{day(c.lastContactDate)}</dd></div><div><dt>Next follow-up</dt><dd>{day(c.nextFollowUpDate)}</dd></div></dl><div className="modal-actions"><button className="secondary" onClick={()=>log(c)}>+ Log interaction</button><button className="text-btn" onClick={()=>load(c.id)}>Profile →</button>{safeExternalUrl(c.linkedinUrl)&&<a href={safeExternalUrl(c.linkedinUrl)!} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn profile for ${name(c)} (opens in a new tab)`}>LinkedIn ↗</a>}</div></article>)}</div>
      {!rows.length&&<p className="panel empty-copy">{contacts.length?'No contacts match these filters.':'Start with a name. You can add the details later.'}</p>}
    </>}
    {dialog&&<NetworkingDialog {...dialog} api={api} onClose={()=>setDialog(null)} onSaved={saved}/>}
  </div>;
}
