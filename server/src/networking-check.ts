import {strict as assert} from 'node:assert';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';

async function main(){
 const folder=mkdtempSync(join(tmpdir(),'networking-qa-')),db=join(folder,'test.db');
 const schema=spawnSync('npx',['prisma','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8'});
 assert.equal(schema.status,0,schema.stderr);assert.equal(spawnSync('sqlite3',[db],{input:schema.stdout,encoding:'utf8'}).status,0);
 const env={...process.env,DATABASE_URL:`file:${db}`,PORT:'4346',NODE_ENV:'development',UPLOAD_DIR:join(folder,'uploads')};
 const prisma=new PrismaClient({datasourceUrl:env.DATABASE_URL});
 const server=spawn('node',['server/dist/index.js'],{env,stdio:['ignore','pipe','pipe']});let errors='';server.stderr.on('data',x=>errors+=x);
 const request=async(path:string,cookie='',method='GET',body?:any,status=200)=>{const r=await fetch('http://127.0.0.1:4346/api'+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,status,`${method} ${path}: ${await r.clone().text()}`);return r};
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4346/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  const register=async(email:string)=>{const r=await request('/auth/register','','POST',{name:'Synthetic Networking QA',email,password:'Local-network-QA-2026!'},201),{user}=await r.json(),cookie=r.headers.get('set-cookie')!.split(';')[0];await request('/profile',cookie,'PATCH',{school:'QA University',graduationYear:2028,onboardingCompleted:true});return{user,cookie}};
  const a=await register('network-a@example.test'),b=await register('network-b@example.test');
  const firm=await request('/companies',a.cookie,'POST',{name:'Synthetic Cicero QA'},201).then(r=>r.json());
  const office=await request(`/companies/${firm.id}/offices`,a.cookie,'POST',{city:'Salt Lake City'},201).then(r=>r.json());
  const one=await request('/contacts',a.cookie,'POST',{name:'Avery'},201).then(r=>r.json());assert.equal(one.firstName,'Avery');assert.equal(one.lastName,'');
  const c=await request('/contacts',a.cookie,'POST',{name:'Sarah QA Chen',companyId:firm.id,officeId:office.id,title:'Consultant',email:'sarah@example.test',phone:'+1 801 555 0100',linkedinUrl:'https://www.linkedin.com/in/synthetic-qa',school:'BYU alum',notes:'Met through Trent.'},201).then(r=>r.json());
  assert.equal(c.lastName,'QA Chen');assert.equal(c.email,'sarah@example.test');assert.equal(c.phone,'+1 801 555 0100');assert.equal(c.office.id,office.id);
  await request('/contacts',a.cookie,'POST',{name:'   '},400);
  await request('/contacts',b.cookie,'POST',{name:'Foreign firm attempt',companyId:firm.id},404);
  await request('/contacts',b.cookie,'POST',{name:'Foreign office attempt',officeId:office.id},404);
  const localDay=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const today=localDay(0),tomorrow=localDay(1),next=localDay(2);
  const log=async(body:any)=>request(`/contacts/${c.id}/interactions`,a.cookie,'POST',body,201).then(r=>r.json());
  const call=await log({type:'PHONE_CALL',date:today,notes:'Talked about Cicero interview prep',followUpDate:tomorrow});
  assert.equal(call.summary,'');assert.equal(call.notes,'Talked about Cicero interview prep');
  await log({type:'TEXT',date:localDay(-5)});
  let contact=await request(`/contacts/${c.id}`,a.cookie).then(r=>r.json());
  assert.equal(contact.lastContactDate.slice(0,10),today);assert.equal(contact.nextFollowUpDate.slice(0,10),tomorrow);assert.equal(contact.interactions[0].id,call.id);
  await log({type:'EMAIL',date:today,followUpDate:tomorrow});
  await log({type:'EMAIL',date:today,followUpDate:next});
  const reminders=await prisma.task.findMany({where:{userId:a.user.id,contactId:c.id,status:{not:'COMPLETED'}}});assert.equal(reminders.length,1);assert.equal(reminders[0].dueDate!.toISOString().slice(0,10),next);
  let dashboard=await request('/dashboard',a.cookie).then(r=>r.json());
  assert.equal(dashboard.todayActions.filter((x:any)=>(x.kind==='contact'&&x.id===c.id)||(x.kind==='task'&&x.id===reminders[0].id)).length,1);
  await request(`/tasks/${reminders[0].id}`,a.cookie,'PATCH',{completed:true});
  assert.equal((await request(`/contacts/${c.id}`,a.cookie).then(r=>r.json())).nextFollowUpDate,null);
  await request(`/tasks/${reminders[0].id}`,a.cookie,'PATCH',{completed:false});
  assert.equal((await request(`/contacts/${c.id}`,a.cookie).then(r=>r.json())).nextFollowUpDate.slice(0,10),next);
  await request(`/contacts/${c.id}/interactions`,a.cookie,'POST',{type:'INVALID',date:today},400);
  await request(`/contacts/${c.id}/interactions`,a.cookie,'POST',{type:'EMAIL',date:'invalid'},400);
  await request(`/contacts/${c.id}/interactions`,b.cookie,'POST',{type:'EMAIL',userId:a.user.id},404);
  await request(`/contacts/${c.id}`,b.cookie,'GET',undefined,404);
  await request(`/contacts/${c.id}`,b.cookie,'PATCH',{name:'Stolen'},404);
  await request('/contacts','','GET',undefined,401);
  await prisma.interaction.create({data:{userId:b.user.id,contactId:c.id,type:'EMAIL',summary:'Foreign private history'}});
  await prisma.task.create({data:{userId:b.user.id,contactId:c.id,title:'Foreign private task'}});
  contact=await request(`/contacts/${c.id}`,a.cookie).then(r=>r.json());
  assert(!contact.interactions.some((x:any)=>x.summary==='Foreign private history'));assert(!contact.tasks.some((x:any)=>x.title==='Foreign private task'));
  await request(`/contacts/${c.id}`,a.cookie,'PATCH',{name:'Sarah QA Chen',notes:'Updated while keeping advanced data.'});
  contact=await request(`/contacts/${c.id}`,a.cookie).then(r=>r.json());assert.equal(contact.email,c.email);assert.equal(contact.officeId,office.id);
  assert.equal(errors,'');
  console.log('✓ Name-only/full contacts, optional interaction notes, chronological history, follow-up reuse/completion/reopening, dashboard suppression and nested ownership passed.');
  if(process.env.KEEP_NETWORK_QA==='true'){console.log('Local QA: http://127.0.0.1:4346 · network-a@example.test / Local-network-QA-2026!');await new Promise(()=>{})}
 }finally{if(server.exitCode===null&&server.signalCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited}await prisma.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
