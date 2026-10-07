import React from 'react';
import {safeExternalUrl} from './opportunity-detail-model';
import {RecordLink} from './navigation';
export function LinkedText({text}:{text:string}){
 return <>{text.split(/(https?:\/\/[^\s]+)/g).map((part,i)=>safeExternalUrl(part)?<a key={i} href={safeExternalUrl(part)!} target="_blank" rel="noopener noreferrer">{part}</a>:<React.Fragment key={i}>{part}</React.Fragment>)}</>;
}
export function RelatedTask({task}:{task:any}){
 return <div className="related-task">{([['company',task.companyId,task.company?.name],['opportunity',task.opportunityId,task.opportunity?.roleTitle],['application',task.applicationId,'Application'],['contact',task.contactId,[task.contact?.firstName,task.contact?.lastName].filter(Boolean).join(' ')],['interview',task.interviewId,'Interview']] as const).filter(([,id])=>id).map(([kind,id,label])=><p key={kind}><RecordLink kind={kind} id={id}>{label||kind} →</RecordLink></p>)}</div>;
}
