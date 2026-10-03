import {strict as assert} from 'node:assert';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {parsePosting} from './quick-add.js';
import {checkExpiration} from './expiration-check.js';

async function main() {
  const {opportunityExternalLink, relatedOpportunityAction, opportunityPath, opportunityIdFromHash}=await import(new URL('../../client/src/opportunity-detail-model.ts',import.meta.url).href);
  assert.equal(opportunityIdFromHash(opportunityPath('owned-id')), 'owned-id');
  assert.equal(opportunityIdFromHash('#/opportunities/%invalid'),null);
  const folder=mkdtempSync(join(tmpdir(),'opportunity-detail-')),db=join(folder,'test.db');
  const schema=spawnSync('npx',['prisma','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8'});
  assert.equal(schema.status,0,schema.stderr);
  assert.equal(spawnSync('sqlite3',[db],{input:schema.stdout,encoding:'utf8'}).status,0);
  const env={...process.env,DATABASE_URL:`file:${db}`,PORT:'4345',NODE_ENV:'development',UPLOAD_DIR:join(folder,'uploads')};
  const prisma=new PrismaClient({datasourceUrl:env.DATABASE_URL});
  const server=spawn('node',['server/dist/index.js'],{env,stdio:['ignore','pipe','pipe']});
  let errors='';server.stderr.on('data',x=>errors+=x);
  const base='http://127.0.0.1:4345';
  const request=async(path:string,cookie='',method='GET',body?:any,status=200)=>{
    const r=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
    assert.equal(r.status,status,`${method} ${path}: ${await r.clone().text()}`);
    return r;
  };
  try {
    for(let attempt=0;attempt<100;attempt++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
    const register=async(email:string)=>{
      const r=await request('/auth/register','','POST',{name:'Synthetic Detail QA',email,password:'Local-detail-QA-2026!'},201);
      const cookie=r.headers.get('set-cookie')!.split(';')[0];
      const {user}=await r.json();
      await request('/profile',cookie,'PATCH',{school:'QA University',graduationYear:2028,recruitingFor:'Internship',targetRecruitingYear:'2027',onboardingCompleted:true});
      return {cookie,user};
    };
    const a=await register('detail-a@example.test'),b=await register('detail-b@example.test');
    const firm=await request('/companies',a.cookie,'POST',{name:'Synthetic Bain QA',website:'https://example.org',careersUrl:'https://example.org/careers'},201).then(r=>r.json());
    const contact=await request('/contacts',a.cookie,'POST',{firstName:'Sarah',lastName:'QA Chen',companyId:firm.id,school:'BYU',title:'Associate',nextFollowUpDate:'2026-10-02'},201).then(r=>r.json());
    const parsed=parsePosting('Company: Synthetic Bain QA\nRole: Summer Associate\nLocation: Dallas, TX\nDeadline: October 15, 2026','https://example.org/jobs/summer');
    const op=await request('/opportunities',a.cookie,'POST',{...parsed,companyId:firm.id,networkingContactId:contact.id,notes:'Prepare a tailored resume.',status:'READY_TO_APPLY',priority:'HIGH'},201).then(r=>r.json());
    await request('/opportunities',a.cookie,'POST',{companyId:firm.id,roleTitle:'Invalid URL',jobUrl:'javascript:alert(1)'},400);
    const application=await request(`/opportunities/${op.id}/application`,a.cookie,'POST',{},201).then(r=>r.json());
    await request(`/opportunities/${op.id}/details`,a.cookie,'PATCH',{applicationPortalUrl:'https://example.org/apply'});
    const interview=await request('/interviews',a.cookie,'POST',{applicationId:application.id,scheduledAt:'2026-10-10T10:00:00-06:00',timezone:'America/Denver',interviewRound:'FIRST_ROUND',interviewType:'VIRTUAL',preparationNotes:'Practice profitability cases.'},201).then(r=>r.json());
    const task=await request('/tasks',a.cookie,'POST',{title:'Prepare for synthetic interview',interviewId:interview.id,opportunityId:op.id,dueDate:'2026-10-09'},201).then(r=>r.json());
    const updatedTask=await request(`/tasks/${task.id}`,a.cookie,'PATCH',{title:'Complete synthetic case prep',description:'Practice a profitability case and review notes.',dueDate:'2026-10-08',priority:'HIGH',taskType:'PREP'},200).then(r=>r.json());
    assert.equal(updatedTask.title,'Complete synthetic case prep');
    assert.equal(updatedTask.description,'Practice a profitability case and review notes.');
    assert.equal(updatedTask.priority,'HIGH');
    assert.equal(updatedTask.taskType,'PREP');
    await request(`/contacts/${contact.id}/interactions`,a.cookie,'POST',{type:'EMAIL',summary:'Discussed Dallas recruiting.'},201);
    // Inject foreign-owned children to ensure detail reads scope each relationship,
    // even if inconsistent associations were ever introduced outside the API.
    await prisma.task.create({data:{userId:b.user.id,title:'Private B task',opportunityId:op.id}});
    await prisma.interview.create({data:{userId:b.user.id,applicationId:application.id,date:new Date(),interviewRound:'FIRST_ROUND',interviewType:'CASE'}});
    await prisma.interaction.create({data:{userId:b.user.id,contactId:contact.id,type:'EMAIL',summary:'Private B interaction'}});
    const detail=await request(`/opportunities/${op.id}`,a.cookie).then(r=>r.json());
    assert.equal(detail.rawPostingText,parsed.rawPostingText);
    assert.equal(detail.jobUrl,parsed.jobUrl);
    assert.deepEqual(detail.tasks.map((x:any)=>x.id),[task.id]);
    assert.deepEqual(detail.interviews.map((x:any)=>x.id),[interview.id]);
    assert.equal(detail.contacts[0].interactions[0].summary,'Discussed Dallas recruiting.');
    assert.equal(opportunityExternalLink(detail)?.href,'https://example.org/apply');
    assert.equal(opportunityExternalLink({...detail,applications:[]})?.href,parsed.jobUrl);
    assert.equal(opportunityExternalLink({...detail,applications:[],jobUrl:null})?.label,'Company Careers');
    assert.equal(opportunityExternalLink({company:{website:'https://example.org'}})?.label,'Company Website');
    assert.equal(opportunityExternalLink({jobUrl:'javascript:alert(1)'}),null);
    assert.equal(opportunityExternalLink({}),null);
    const foreignDoc=await prisma.document.create({data:{name:'Private B resume',type:'RESUME',userId:b.user.id}});
    await prisma.application.update({where:{id:application.id},data:{resumeId:foreignDoc.id}});
    assert.equal((await request(`/opportunities/${op.id}`,a.cookie).then(r=>r.json())).applications[0].resume,null);
    await prisma.application.update({where:{id:application.id},data:{resumeId:null}});
    assert.equal(relatedOpportunityAction(detail,[{kind:'task',id:'unrelated'},{kind:'interview',id:interview.id}])?.id,interview.id);
    await request(`/opportunities/${op.id}`,b.cookie,'GET',undefined,404);
    await request(`/opportunities/${op.id}`,'','GET',undefined,401);
    await request(`/opportunities/${op.id}/details`,b.cookie,'PATCH',{jobUrl:'https://example.org/b',userId:a.user.id},404);
    await request(`/opportunities/${op.id}/details`,b.cookie,'PATCH',{applicationPortalUrl:'https://example.org/b'},404);
    await request(`/opportunities/${op.id}/details`,a.cookie,'PATCH',{applicationPortalUrl:'javascript:alert(1)'},400);
    for(const jobUrl of ['javascript:alert(1)','ftp://example.org/file','not a url','https://user:password@example.org'])await request(`/opportunities/${op.id}/details`,a.cookie,'PATCH',{jobUrl},400);
    await request(`/opportunities/${op.id}/details`,a.cookie,'PATCH',{jobUrl:'https://example.org/updated',userId:b.user.id,notes:'Updated notes'});
    assert.equal((await request(`/opportunities/${op.id}`,a.cookie).then(r=>r.json())).jobUrl,'https://example.org/updated');
    await request(`/opportunities/${op.id}/context`,b.cookie,'PATCH',{networkingContactId:contact.id},404);
    await request(`/opportunities/${op.id}/context`,a.cookie,'PATCH',{networkingContactId:null});
    await request(`/opportunities/${op.id}/context`,a.cookie,'PATCH',{networkingContactId:contact.id});
    await request(`/opportunities/${op.id}/applied`,a.cookie,'POST',{});
    await request(`/opportunities/${op.id}/stage`,a.cookie,'PATCH',{stage:'CLOSED'});
    assert.equal((await request(`/opportunities/${op.id}`,a.cookie).then(r=>r.json())).status,'CLOSED');
    await request(`/opportunities/${op.id}/stage`,a.cookie,'PATCH',{stage:'READY_TO_APPLY'});
    for(const [roleTitle,jobUrl,companyId] of [['Posting only','https://example.org/posting',firm.id],['Careers only',null,firm.id]])await request('/opportunities',a.cookie,'POST',{companyId,roleTitle,jobUrl},201);
    const noUrlFirm=await request('/companies',a.cookie,'POST',{name:'Synthetic No URL Firm'},201).then(r=>r.json());
    await request('/opportunities',a.cookie,'POST',{companyId:noUrlFirm.id,roleTitle:'No URL Analyst',status:'CLOSED'},201);
    await checkExpiration({request,prisma,a,b,firm,op,application,contact,interview,task});
    assert.equal(errors,'');
    console.log('✓ Detail context, URL priority/validation/persistence, Quick Add preservation, archive/applied and nested ownership passed.');
    if(process.env.KEEP_DETAIL_QA==='true'){
      console.log(`Local browser QA available at ${base}; account detail-a@example.test / Local-detail-QA-2026!; opportunity ${op.id}`);
      await new Promise(()=>{});
    }
  } finally {server.kill('SIGTERM');await once(server,'exit');await prisma.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
