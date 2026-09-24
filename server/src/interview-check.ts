import {spawn} from 'node:child_process';
import {once} from 'node:events';

const port=4317,base=`http://127.0.0.1:${port}`;
const fail=(message:string):never=>{throw new Error(message)};
const request=(path:string,init:RequestInit={},cookie='')=>fetch(base+path,{...init,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(init.headers||{})}});
const expect=async(label:string,promise:Promise<Response>,status:number)=>{const response=await promise;if(response.status!==status)fail(`${label}: expected ${status}, received ${response.status}: ${await response.text()}`);return response};
const session=(response:Response)=>{const value=response.headers.get('set-cookie')?.match(/consulting_hub_session=([^;]+)/)?.[1];if(!value)fail('Session cookie missing.');return `consulting_hub_session=${value}`};
const waitForServer=async()=>{for(let tries=0;tries<80;tries++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,75))}fail('Interview test server did not start.');};

async function main(){
 let stderr='';const server=spawn('node',['server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});server.stderr.on('data',chunk=>stderr+=chunk);
 try{
  await waitForServer();
  const aRegister=await expect('register User A',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Interview Owner',email:'interview-owner@example.test',password:'correct horse battery staple'})}),201),aCookie=session(aRegister),a=await aRegister.json();
  const firm=await expect('create Bain',request('/api/companies',{method:'POST',body:JSON.stringify({name:'Bain & Company',priority:'HIGH'})},aCookie),201).then(r=>r.json());
  const office=await expect('create Dallas office',request(`/api/companies/${firm.id}/offices`,{method:'POST',body:JSON.stringify({city:'Dallas',region:'TX'})},aCookie),201).then(r=>r.json());
  const contact=await expect('create owned recruiter contact',request('/api/contacts',{method:'POST',body:JSON.stringify({firstName:'Sarah',lastName:'Chen',companyId:firm.id,officeId:office.id})},aCookie),201).then(r=>r.json());
  const opportunity=await expect('create Bain role',request('/api/opportunities',{method:'POST',body:JSON.stringify({companyId:firm.id,officeId:office.id,roleTitle:'Summer Associate',status:'READY_TO_APPLY'})},aCookie),201).then(r=>r.json());
  const application=await expect('start Bain application',request(`/api/opportunities/${opportunity.id}/application`,{method:'POST',body:'{}'},aCookie),201).then(r=>r.json());
  const scheduledAt=new Date(Date.now()+2*864e5).toISOString();
  const interview=await expect('schedule First Round',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:application.id,scheduledAt,timezone:'America/Denver',interviewRound:'FIRST_ROUND',interviewType:'VIRTUAL',meetingLink:'https://meet.example.test/bain',interviewer:'Jordan Taylor',interviewerContactId:contact.id,preparationNotes:'Practice two Bain cases',userId:'not-user-a'})},aCookie),201).then(r=>r.json());
  if(interview.userId!==a.user.id||interview.application.opportunity.company.id!==firm.id||interview.application.opportunity.office.id!==office.id||interview.date!==scheduledAt||interview.timezone!=='America/Denver'||interview.interviewerContact.id!==contact.id)fail('Interview did not preserve owned application context, instant, or contact association.');
  const labelInterview=await expect('accept interview form labels',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:application.id,scheduledAt,interviewRound:'FINAL ROUND',interviewType:'IN PERSON',outcome:'PENDING'})},aCookie),201).then(r=>r.json());if(labelInterview.interviewRound!=='FINAL_ROUND'||labelInterview.interviewType!=='IN_PERSON')fail('Interview display labels were not normalized to canonical values.');
  await expect('reject timestamp without timezone',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:application.id,scheduledAt:'2026-10-03T14:00',interviewRound:'FINAL_ROUND',interviewType:'VIRTUAL'})},aCookie),400);
  await expect('reject invalid application',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:'missing',scheduledAt,interviewRound:'FIRST_ROUND',interviewType:'VIRTUAL'})},aCookie),400);
  const prep=await expect('link owned prep task',request('/api/tasks',{method:'POST',body:JSON.stringify({title:'Complete Bain-style cases',taskType:'INTERVIEW',interviewId:interview.id,applicationId:application.id,dueDate:scheduledAt})},aCookie),201).then(r=>r.json());
  const scheduledDashboard=await expect('dashboard includes upcoming interview',request('/api/dashboard',{},aCookie),200).then(r=>r.json());if(!scheduledDashboard.interviews.some((x:any)=>x.id===interview.id)||scheduledDashboard.metrics.interviews<1)fail('Dashboard did not reflect the scheduled upcoming interview.');
  const rescheduledAt=new Date(Date.now()+3*864e5).toISOString();
  const updated=await expect('reschedule and complete interview',request(`/api/interviews/${interview.id}`,{method:'PATCH',body:JSON.stringify({scheduledAt:rescheduledAt,completed:true,outcome:'ADVANCED',notes:'Strong case discussion'})},aCookie),200).then(r=>r.json());
  if(updated.date!==rescheduledAt||!updated.completedAt||updated.outcome!=='ADVANCED'||updated.application.currentStage!=='PREPARING_APPLICATION')fail('Reschedule, outcome, or explicit stage behavior was incorrect.');
  const boundary='2026-10-04T00:30:00-06:00',boundaryInterview=await expect('preserve Mountain boundary instant',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:application.id,scheduledAt:boundary,timezone:'America/Denver',interviewRound:'FINAL_ROUND',interviewType:'VIRTUAL'})},aCookie),201).then(r=>r.json());
  if(boundaryInterview.date!==new Date(boundary).toISOString()||boundaryInterview.timezone!=='America/Denver')fail('Timezone boundary instant was changed.');
  const appDetail=await expect('application includes interviews',request(`/api/applications/${application.id}`,{},aCookie),200).then(r=>r.json());if(!appDetail.interviews.some((x:any)=>x.id===interview.id)||!appDetail.interviews.some((x:any)=>x.id===boundaryInterview.id))fail('Application did not include its interviews.');
  const firmDetail=await expect('firm includes interview history',request(`/api/companies/${firm.id}`,{},aCookie),200).then(r=>r.json());if(!firmDetail.opportunities[0].applications[0].interviews.some((x:any)=>x.id===interview.id))fail('Firm did not include related interview history.');
  const detail=await expect('interview includes preparation tasks',request(`/api/interviews/${interview.id}`,{},aCookie),200).then(r=>r.json());if(!detail.tasks.some((x:any)=>x.id===prep.id))fail('Interview did not include associated preparation task.');
  const dashboard=await expect('dashboard removes completed interview from upcoming',request('/api/dashboard',{},aCookie),200).then(r=>r.json());if(dashboard.interviews.some((x:any)=>x.id===interview.id)||dashboard.needsAttention.some((x:any)=>x.kind==='interview'&&x.id===interview.id))fail('Completed interview was duplicated as an upcoming dashboard item.');
  const bRegister=await expect('register User B',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Interview Intruder',email:'interview-intruder@example.test',password:'correct horse battery staple'})}),201),bCookie=session(bRegister);
  const bFirm=await expect('create User B firm',request('/api/companies',{method:'POST',body:JSON.stringify({name:'BCG'})},bCookie),201).then(r=>r.json());
  const bOpportunity=await expect('create User B role',request('/api/opportunities',{method:'POST',body:JSON.stringify({companyId:bFirm.id,roleTitle:'Associate'})},bCookie),201).then(r=>r.json());
  const bApplication=await expect('start User B application',request(`/api/opportunities/${bOpportunity.id}/application`,{method:'POST',body:'{}'},bCookie),201).then(r=>r.json());
  const bInterviews=await expect('User B interview list',request('/api/interviews',{},bCookie),200).then(r=>r.json());if(bInterviews.length)fail('User B saw User A interviews.');
  await expect('User B cannot read User A interview',request(`/api/interviews/${interview.id}`,{},bCookie),404);
  await expect('User B cannot create on User A application',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:application.id,scheduledAt,interviewRound:'FIRST_ROUND',interviewType:'VIRTUAL'})},bCookie),400);
  await expect('User B cannot attach User A contact',request('/api/interviews',{method:'POST',body:JSON.stringify({applicationId:bApplication.id,scheduledAt,interviewRound:'FIRST_ROUND',interviewType:'VIRTUAL',interviewerContactId:contact.id})},bCookie),400);
  await expect('User B cannot attach task to User A interview',request('/api/tasks',{method:'POST',body:JSON.stringify({title:'Unauthorized prep',interviewId:interview.id})},bCookie),400);
  await expect('User B cannot update User A interview',request(`/api/interviews/${interview.id}`,{method:'PATCH',body:JSON.stringify({outcome:'REJECTED'})},bCookie),404);
  await expect('User B cannot delete User A interview',request(`/api/interviews/${interview.id}`,{method:'DELETE'},bCookie),404);
  if(stderr)fail(`Server emitted stderr: ${stderr}`);
  console.log('✓ Interview scheduling, timezone preservation, owned associations, dashboard integration, and two-user isolation verified.');
 }finally{server.kill('SIGTERM');await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
