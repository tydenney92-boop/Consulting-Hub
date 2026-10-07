import React, {useEffect,useState} from 'react';
import {RecordLink,useNavigation} from './navigation';
type Props={id:string;api:(path:string,options?:RequestInit)=>Promise<any>;refresh:()=>Promise<any>};
export function DocumentDetail({id,api,refresh}:Props){
  const [record,setRecord]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const {back}=useNavigation();
  useEffect(()=>{let active=true;api(`/documents/${id}`).then(r=>{if(active)setRecord(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[id]);
  const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');try{setRecord(await api(`/documents/${id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))}));await refresh()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  return <><button className="text-btn" onClick={()=>back('#/documents')}>← Back</button>{error&&<p className="notice" role="alert">{error}</p>}{record?<section className="panel"><h1>{record.name}</h1><a className="secondary" href={`/api/documents/${id}/download`}>Download document</a><form className="profile-form" onSubmit={save}>{['name','version','targetRole','notes'].map(field=><label key={field}>{field==='targetRole'?'Target role':field[0].toUpperCase()+field.slice(1)}<input name={field} required={field==='name'} defaultValue={record[field]||''}/></label>)}<button className="primary" disabled={busy}>{busy?'Saving…':'Save metadata'}</button></form><h2>Linked applications</h2>{record.applications?.length?record.applications.map((a:any)=><p key={a.id}><RecordLink kind="application" id={a.id}>{a.opportunity.company.name} — {a.opportunity.roleTitle}</RecordLink></p>):<p>No linked applications.</p>}</section>:<p role="status">{error?'Document could not be loaded.':'Loading document…'}</p>}</>;
}
