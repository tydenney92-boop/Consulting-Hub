import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port=Number(process.env.AUTH_TEST_PORT||4199),base=`http://127.0.0.1:${port}`;
const fail=(message:string)=>{throw new Error(message)};
const expect=async(label:string,promise:Promise<Response>,status:number)=>{const response=await promise;if(response.status!==status)fail(`${label}: expected ${status}, got ${response.status} (${await response.text()})`);return response};
const request=(path:string,options:RequestInit={},cookie?:string)=>fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(options.headers||{})}});
const cookieFrom=(response:Response)=>{const value=response.headers.get('set-cookie');if(!value)throw new Error('Session response did not set a cookie.');if(!value.includes('HttpOnly')||!value.includes('SameSite=Lax'))fail('Session cookie is missing HttpOnly or SameSite=Lax.');return value.split(';')[0]};

async function main(){
 const server=spawn('node',['server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
 try{
  for(let attempt=0;attempt<40;attempt++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100));if(attempt===39)fail('Server did not start.');}
  await expect('health',request('/api/health'),200); // health is intentionally public
  await expect('unauthenticated dashboard',request('/api/dashboard'),401);
  const aRegister=await expect('register User A',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'User A',email:'user-a@example.test',password:'correct horse battery staple'})}),201),aCookie=cookieFrom(aRegister),a=await aRegister.json();
  const aProfile=await expect('onboard User A',request('/api/profile',{method:'PATCH',body:JSON.stringify({school:'BYU',graduationYear:2028,recruitingFor:'Internship',targetRecruitingYear:'Summer 2027',targetConsultingTypes:['MBB','Economic Consulting'],onboardingCompleted:true})},aCookie),200);const persisted=(await aProfile.json()).user;
  if(!persisted.onboardingCompleted||persisted.school!=='BYU'||persisted.targetConsultingTypes.length!==2)fail('Onboarding profile was not persisted.');
  const opportunity=await expect('create User A opportunity',request('/api/opportunities',{method:'POST',body:JSON.stringify({company:'A-only Firm',roleTitle:'Associate',practiceArea:'Strategy Consulting',location:'Provo, UT',userId:'not-user-a'})},aCookie),201).then(x=>x.json());
  await expect('create User A task',request('/api/tasks',{method:'POST',body:JSON.stringify({title:'A-only task',userId:'not-user-a'})},aCookie),201);
  await expect('create User A contact',request('/api/contacts',{method:'POST',body:JSON.stringify({firstName:'Ava',lastName:'Owner',company:'A-only Firm',userId:'not-user-a'})},aCookie),201);
  await expect('create User A application',request(`/api/opportunities/${opportunity.id}/application`,{method:'POST',body:'{}'},aCookie),201);
  await expect('logout User A',request('/api/auth/logout',{method:'POST'},aCookie),204);
  await expect('invalidated User A session',request('/api/auth/me',{},aCookie),401);
  const aLogin=await expect('log User A back in',request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'user-a@example.test',password:'correct horse battery staple'})}),200),aCookie2=cookieFrom(aLogin);
  const aMe=await expect('persisted login session',request('/api/auth/me',{},aCookie2),200).then(x=>x.json());if(aMe.user.school!=='BYU'||aMe.user.onboardingCompleted!==true)fail('Profile did not persist after login.');
  const bRegister=await expect('register User B',request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'User B',email:'user-b@example.test',password:'correct horse battery staple'})}),201),bCookie=cookieFrom(bRegister);
  for(const path of ['/api/opportunities','/api/contacts','/api/applications','/api/tasks','/api/documents']){const body=await expect(`User B ${path}`,request(path,{},bCookie),200).then(x=>x.json());if(body.length!==0)fail(`${path} leaked User A data to User B.`)}
  const timeline=await expect('User B timeline',request('/api/timeline',{},bCookie),200).then(x=>x.json());if(Object.values(timeline).some((items:any)=>items.length))fail('Timeline leaked User A data to User B.');
  const analytics=await expect('User B analytics',request('/api/analytics',{},bCookie),200).then(x=>x.json());if(analytics.total!==0)fail('Analytics leaked User A data to User B.');
  const dashboard=await expect('User B dashboard',request('/api/dashboard',{},bCookie),200).then(x=>x.json());if(Object.values(dashboard.metrics).some((value:any)=>value!==0))fail('Dashboard leaked User A data to User B.');
  await expect('User B update of User A record',request(`/api/opportunities/${opportunity.id}`,{method:'PATCH',body:JSON.stringify({status:'CLOSED',userId:a.user.id})},bCookie),404);
  await expect('User B delete of User A record',request(`/api/opportunities/${opportunity.id}`,{method:'DELETE'},bCookie),404);
  const bMe=await expect('client userId ignored',request(`/api/auth/me?userId=${a.user.id}`,{},bCookie),200).then(x=>x.json());if(bMe.user.id===a.user.id)fail('Client-supplied user ID overrode the authenticated identity.');
  await expect('invalid session',request('/api/auth/me',{},'consulting_hub_session=invalid'),401);
  if(stderr)fail(`Server emitted stderr: ${stderr}`);
  console.log('✓ Auth/session/onboarding persistence and two-user isolation verified.');
 }finally{server.kill('SIGTERM');await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
