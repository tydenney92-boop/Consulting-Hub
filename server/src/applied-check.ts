import {spawn} from 'node:child_process';
import {once} from 'node:events';

const port=4328,base=`http://127.0.0.1:${port}`;
const fail=(message:string):never=>{throw new Error(message)};
const request=(path:string,init:RequestInit={},cookie='')=>fetch(base+path,{...init,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(init.headers||{})}});
const expect=async(label:string,promise:Promise<Response>,status:number)=>{const response=await promise;if(response.status!==status)fail(`${label}: expected ${status}, received ${response.status}: ${await response.text()}`);return response};
const session=(response:Response)=>{const value=response.headers.get('set-cookie')?.match(/consulting_hub_session=([^;]+)/)?.[1];if(!value)fail('Session cookie missing.');return `consulting_hub_session=${value}`};
const waitForServer=async()=>{for(let tries=0;tries<80;tries++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,75))}fail('Applied test server did not start.');};

async function main(){
 let stderr='';const server=spawn('node',['server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});server.stderr.on('data',chunk=>stderr+=chunk);
 try{
  await waitForServer();
  const aRegistration=await expect('register owner',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Applied Owner',email:'applied-owner@example.test',password:'correct horse battery staple'})}),201),aCookie=session(aRegistration);
  const firm=await expect('create firm',request('/api/companies',{method:'POST',body:JSON.stringify({name:'Bain & Company',priority:'HIGH'})},aCookie),201).then(r=>r.json());
  const office=await expect('create target office',request(`/api/companies/${firm.id}/offices`,{method:'POST',body:JSON.stringify({city:'Dallas',region:'TX'})},aCookie),201).then(r=>r.json());
  const contact=await expect('create networking contact',request('/api/contacts',{method:'POST',body:JSON.stringify({firstName:'Sarah',lastName:'Chen',companyId:firm.id,officeId:office.id,referralStatus:'RECEIVED'})},aCookie),201).then(r=>r.json());
  const deadline='2027-09-15T12:00:00.000Z',opportunity=await expect('create opportunity',request('/api/opportunities',{method:'POST',body:JSON.stringify({companyId:firm.id,officeId:office.id,networkingContactId:contact.id,roleTitle:'Summer Associate',location:'Dallas, TX',jobUrl:'https://careers.example.test/bain',applicationDeadline:deadline,notes:'Referral confirmed',status:'READY_TO_APPLY',referralStatus:'RECEIVED'})},aCookie),201).then(r=>r.json());
  const converted=await expect('move opportunity to Applied',request(`/api/opportunities/${opportunity.id}/applied`,{method:'POST',body:JSON.stringify({userId:'not-the-owner'})},aCookie),201).then(r=>r.json());
  if(!converted.created||converted.item.currentStage!=='APPLIED'||!converted.item.dateSubmitted||converted.item.opportunity.id!==opportunity.id||converted.item.opportunity.company.id!==firm.id||converted.item.opportunity.office.id!==office.id||converted.item.opportunity.networkingContact.id!==contact.id||converted.item.opportunity.jobUrl!=='https://careers.example.test/bain'||converted.item.opportunity.notes!=='Referral confirmed'||converted.item.opportunity.applicationDeadline!==deadline)fail('Applied conversion did not preserve owned opportunity context or submission data.');
  const activeOpportunities=await expect('read active opportunities',request('/api/opportunities',{},aCookie),200).then(r=>r.json());if(activeOpportunities.some((item:any)=>item.id===opportunity.id))fail('Converted opportunity remained in the default active opportunities list.');
  const applications=await expect('read Applied pipeline',request('/api/applications',{},aCookie),200).then(r=>r.json());if(!applications.some((item:any)=>item.id===converted.item.id&&item.currentStage==='APPLIED'))fail('Converted opportunity was missing from the Applied pipeline.');
  const repeated=await expect('repeat Applied action',request(`/api/opportunities/${opportunity.id}/applied`,{method:'POST',body:'{}'},aCookie),200).then(r=>r.json());if(repeated.created||repeated.item.id!==converted.item.id||repeated.item.dateSubmitted!==converted.item.dateSubmitted)fail('Repeated Applied action created a duplicate or replaced the submission date.');
  const secondOpportunity=await expect('create pre-existing application opportunity',request('/api/opportunities',{method:'POST',body:JSON.stringify({companyId:firm.id,roleTitle:'Associate',status:'READY_TO_APPLY'})},aCookie),201).then(r=>r.json());
  const started=await expect('start application',request(`/api/opportunities/${secondOpportunity.id}/application`,{method:'POST',body:'{}'},aCookie),201).then(r=>r.json());
  const reused=await expect('reuse existing application',request(`/api/opportunities/${secondOpportunity.id}/applied`,{method:'POST',body:'{}'},aCookie),200).then(r=>r.json());if(reused.created||reused.item.id!==started.id||reused.item.currentStage!=='APPLIED'||!reused.item.dateSubmitted)fail('Existing application was not safely moved to Applied.');
  const bRegistration=await expect('register second user',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Applied Intruder',email:'applied-intruder@example.test',password:'correct horse battery staple'})}),201),bCookie=session(bRegistration);
  await expect('block cross-user Applied action',request(`/api/opportunities/${opportunity.id}/applied`,{method:'POST',body:'{}'},bCookie),404);
  const bApplications=await expect('isolate second user applications',request('/api/applications',{},bCookie),200).then(r=>r.json());if(bApplications.length)fail('Second user saw the owner application.');
  if(stderr)fail(`Server emitted stderr: ${stderr}`);
  console.log('✓ Applied transition, idempotency, persistence, and two-user isolation verified.');
 }finally{server.kill('SIGTERM');await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
