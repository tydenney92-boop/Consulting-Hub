import {useState} from 'react';

export function AssessmentCompletion({application,api,refresh}:any){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const completed=application.assessmentStatus==='COMPLETED';
 return <div className="assessment-completion"><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api(`/applications/${application.id}/assessment`,{method:'PATCH',body:JSON.stringify({completed:!completed})});await refresh()}catch(e:any){setError(e.message)}finally{setBusy(false)}}}>{completed?'Reopen assessment':'Mark assessment complete'}</button><p>{completed?'Assessment completed. Awaiting the employer’s next step.':'Assessment outstanding.'} Completing an assessment does not change the recruiting stage.</p>{error&&<p role="alert">{error}</p>}</div>;
}

export function useActionCompletion(api:any,refresh:()=>Promise<void>){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[undos,setUndos]=useState<any[]>([]);
 const complete=async(action:any)=>{if(busy)return;setBusy(true);try{
  let undo:any;
  if(action.kind==='task'){await api(`/tasks/${action.id}`,{method:'PATCH',body:JSON.stringify({completed:true})});undo={path:`/tasks/${action.id}`,method:'PATCH',body:{completed:false}}}
  else if(action.kind==='application'){await api(`/applications/${action.id}/assessment`,{method:'PATCH',body:JSON.stringify({completed:true})});undo={path:`/applications/${action.id}/assessment`,method:'PATCH',body:{completed:false}}}
  else if(action.kind==='contact'){const result=await api(`/contacts/${action.id}/complete-follow-up`,{method:'POST'});undo={path:`/contacts/${action.id}/undo-follow-up`,method:'POST',body:result.undo}}
  else return;
  setUndos(items=>[...items.filter(x=>x.key!==action.kind+action.id),{...undo,key:action.kind+action.id,title:action.title}]);setMessage('Marked complete.');await refresh();
 }catch(e:any){setMessage(e.message)}finally{setBusy(false)}};
 const restore=async(item:any)=>{if(busy)return;setBusy(true);try{await api(item.path,{method:item.method,body:JSON.stringify(item.body)});setUndos(items=>items.filter(x=>x.key!==item.key));setMessage('Restored.');await refresh()}catch(e:any){setMessage(e.message)}finally{setBusy(false)}};
 const feedback=<>{message&&<p role="status" className="notice">{message}</p>}{undos.map(item=><div className="notice" key={item.key}>{item.title} — completed. <button className="text-btn" disabled={busy} onClick={()=>restore(item)}>Undo</button></div>)}</>;
 return{busy,complete,feedback};
}
