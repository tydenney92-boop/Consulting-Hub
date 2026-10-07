import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function main(){
 const folder=mkdtempSync(join(tmpdir(),'consulting-audit-regression-')),db=join(folder,'test.db');
 const schema=spawnSync('npx',['prisma','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8'});assert.equal(schema.status,0,schema.stderr);assert.equal(spawnSync('sqlite3',[db],{input:schema.stdout}).status,0);
 const child=spawn('node',['server/dist/index.js'],{env:{...process.env,DATABASE_URL:`file:${db}`,PORT:'4361',NODE_ENV:'development',UPLOAD_DIR:join(folder,'uploads')},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',x=>errors+=x);
 const request=async(path:string,cookie='',method='GET',body?:any,status=200)=>{const r=await fetch('http://127.0.0.1:4361/api'+path,{method,headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,status,`${method} ${path}: ${await r.clone().text()}`);return r};
 try{
  for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4361/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  const register=async(email:string)=>{const r=await request('/auth/register','','POST',{name:'Audit User',email,password:'synthetic-audit-password'},201);return r.headers.get('set-cookie')!.split(';')[0]};
  const a=await register('audit-a@example.test'),b=await register('audit-b@example.test');
  const op=await request('/opportunities',a,'POST',{company:'=Audit Firm',roleTitle:'Audit Intern',applicationDeadline:new Date().toISOString().slice(0,10)},201).then(r=>r.json());
  const app=await request(`/opportunities/${op.id}/applied`,a,'POST',{},201).then(r=>r.json()).then(x=>x.item);
  for(const stage of ['PREPARING_APPLICATION','APPLIED','ASSESSMENT','FIRST_ROUND','FINAL_ROUND','OFFER','REJECTED','WITHDRAWN','CLOSED'])await request(`/applications/${app.id}/stage`,a,'PATCH',{stage});
  const actions=await request('/dashboard',a).then(r=>r.json());assert(!actions.todayActions.some((x:any)=>x.id===op.id&&x.title.startsWith('Apply to')));assert.equal(actions.pipeline.target,0);
  const task=await request('/tasks',a,'POST',{title:'Quick task',companyId:op.companyId,opportunityId:op.id,dueDate:'2026-10-10T17:30:00.000Z'},201).then(r=>r.json());
  await request(`/tasks/${task.id}`,a,'PATCH',{description:'Changed notes'});assert.equal((await request('/tasks',a).then(r=>r.json())).find((t:any)=>t.id===task.id).dueDate,'2026-10-10T17:30:00.000Z');
  const form=new FormData();form.append('files',new Blob(['synthetic transcript'],{type:'application/pdf'}),'transcript.pdf');form.append('type','TRANSCRIPT');
  const upload=await fetch('http://127.0.0.1:4361/api/documents',{method:'POST',headers:{cookie:a},body:form});assert.equal(upload.status,201);const doc=(await upload.json()).documents[0];
  await request(`/applications/${app.id}/documents`,a,'PATCH',{transcriptId:doc.id});
  const detail=await request(`/documents/${doc.id}`,a).then(r=>r.json());assert.equal(detail.applications[0].id,app.id);assert(!('storageKey' in detail));
  await request(`/documents/${doc.id}`,a,'PATCH',{name:'Updated transcript.pdf',notes:'Metadata'});assert.equal((await request(`/documents/${doc.id}`,a).then(r=>r.json())).name,'Updated transcript.pdf');
  await request(`/documents/${doc.id}`,a,'DELETE',undefined,409);await request(`/documents/${doc.id}`,b,'GET',undefined,404);
  assert.equal((await request(`/applications/${app.id}`,a).then(r=>r.json())).transcriptId,doc.id);
  const csv=await request('/export/opportunities',a).then(r=>r.text());assert(csv.includes("'=Audit Firm"));assert(csv.includes('Audit Intern'));assert(!(await request('/export/opportunities',b).then(r=>r.text())).includes('Audit Intern'));
  await request('/export/opportunities','','GET',undefined,401);
  console.log('✓ Audit regressions: timezone/DST, record URLs, canonical stages, applied queue/counts, task instants, transcript deletion guard, document detail/rename, CSV formula safety and ownership.');
 }finally{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited}if(errors)console.error(errors)}
}
main().catch(e=>{console.error(e);process.exitCode=1});
