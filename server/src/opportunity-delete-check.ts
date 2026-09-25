import {spawn} from 'node:child_process';
import {once} from 'node:events';

const port=4331,base=`http://127.0.0.1:${port}`;
const fail=(message:string):never=>{throw new Error(message)};
const request=(path:string,init:RequestInit={},cookie='')=>fetch(base+path,{...init,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(init.headers||{})}});
const expect=async(label:string,promise:Promise<Response>,status:number)=>{const response=await promise;if(response.status!==status)fail(`${label}: expected ${status}, received ${response.status}: ${await response.text()}`);return response};
const session=(response:Response)=>{const value=response.headers.get('set-cookie')?.match(/consulting_hub_session=([^;]+)/)?.[1];if(!value)fail('Session cookie missing.');return `consulting_hub_session=${value}`};
const waitForServer=async()=>{for(let tries=0;tries<80;tries++){try{if((await fetch(base+'/api/health')).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,75))}fail('Opportunity deletion test server did not start.');};

async function main(){
 let stderr='';const server=spawn('node',['server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});server.stderr.on('data',chunk=>stderr+=chunk);
 try{
  await waitForServer();
  const ownerRegistration=await expect('register owner',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Deletion Owner',email:'deletion-owner@example.test',password:'correct horse battery staple'})}),201),ownerCookie=session(ownerRegistration);
  const firm=await expect('create firm',request('/api/companies',{method:'POST',body:JSON.stringify({name:'Deletion Test Firm'})},ownerCookie),201).then(r=>r.json());
  const createOpportunity=async(roleTitle:string)=>expect(`create ${roleTitle}`,request('/api/opportunities',{method:'POST',body:JSON.stringify({companyId:firm.id,roleTitle})},ownerCookie),201).then(r=>r.json());
  const removable=await createOpportunity('Removable Analyst');
  await expect('delete standalone opportunity',request(`/api/opportunities/${removable.id}`,{method:'DELETE',body:JSON.stringify({userId:'not-the-owner'})},ownerCookie),204);
  const opportunities=await expect('confirm opportunity removed from list',request('/api/opportunities',{},ownerCookie),200).then(r=>r.json());if(opportunities.some((item:any)=>item.id===removable.id))fail('Deleted opportunity remained in the owner list.');
  const applicationLinked=await createOpportunity('Application Linked Analyst');
  await expect('start linked application',request(`/api/opportunities/${applicationLinked.id}/application`,{method:'POST',body:'{}'},ownerCookie),201);
  const applicationBlocked=await expect('block deletion with application',request(`/api/opportunities/${applicationLinked.id}`,{method:'DELETE'},ownerCookie),409);if(!(await applicationBlocked.text()).includes('linked application'))fail('Application-linked delete response did not explain the blocker.');
  const taskLinked=await createOpportunity('Task Linked Analyst');
  await expect('create linked task',request('/api/tasks',{method:'POST',body:JSON.stringify({title:'Delete test follow-up',opportunityId:taskLinked.id})},ownerCookie),201);
  const taskBlocked=await expect('block deletion with task',request(`/api/opportunities/${taskLinked.id}`,{method:'DELETE'},ownerCookie),409);if(!(await taskBlocked.text()).includes('linked task'))fail('Task-linked delete response did not explain the blocker.');
  const secondRegistration=await expect('register second user',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'Deletion Intruder',email:'deletion-intruder@example.test',password:'correct horse battery staple'})}),201),secondCookie=session(secondRegistration);
  await expect('block cross-user deletion',request(`/api/opportunities/${applicationLinked.id}`,{method:'DELETE'},secondCookie),404);
  await expect('block unauthenticated deletion',request(`/api/opportunities/${taskLinked.id}`,{method:'DELETE'}),401);
  if(stderr)fail(`Server emitted stderr: ${stderr}`);
  console.log('✓ Opportunity deletion, linked-record blocking, ownership, and list persistence verified.');
 }finally{server.kill('SIGTERM');await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
