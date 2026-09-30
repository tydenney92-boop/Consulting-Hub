import {strict as assert} from 'node:assert';

// Runs inside the detail suite's isolated database and authenticated two-user fixture.
export async function checkExpiration({request, prisma, a, b, firm, op, application, contact, interview, task}: any) {
  const {filterOpportunities, deadlineState} = await import(new URL('../../client/src/opportunity-workspace.ts',import.meta.url).href);
  const previousZone=process.env.TZ;
  process.env.TZ='America/Denver';
  try {
    assert.equal(deadlineState('2026-09-30T00:00:00.000Z',new Date('2026-10-01T05:59:59Z')),'today');
    assert.equal(deadlineState('2026-09-30T00:00:00.000Z',new Date('2026-10-01T06:00:00Z')),'passed');
    assert.equal(deadlineState('2026-11-01',new Date('2026-11-02T06:59:59Z')),'today');
    assert.equal(deadlineState('2026-11-01',new Date('2026-11-02T07:00:00Z')),'passed');
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=(type:string)=>parts.find(x=>x.type===type)!.value;
    const today=`${part('year')}-${part('month')}-${part('day')}`;
    const offset=(days:number)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
    await prisma.opportunity.update({where:{id:op.id},data:{applicationDeadline:new Date(offset(-10)),status:'READY_TO_APPLY'}});
    await prisma.task.update({where:{id:task.id},data:{dueDate:new Date(offset(-1))}});
    await prisma.contact.update({where:{id:contact.id},data:{nextFollowUpDate:new Date(offset(-1))}});
    const create=async(title:string,deadline:string|null,status='TARGET')=>request('/opportunities',a.cookie,'POST',{companyId:firm.id,roleTitle:title,applicationDeadline:deadline,status},201).then((r:any)=>r.json());
    const future=await create('Future window',offset(5)),due=await create('Today window',today),expired=await create('Expired unapplied',offset(-1),'READY_TO_APPLY'),undated=await create('No deadline',null),archived=await create('Archived window',offset(5),'CLOSED');
    const rows=await request('/opportunities?includeConverted=true',a.cookie).then((r:any)=>r.json());
    const ids=(activity:string)=>filterOpportunities(rows,{activity}).map((x:any)=>x.id);
    for(const id of [future.id,due.id,undated.id])assert(ids('active').includes(id));
    for(const id of [op.id,expired.id,archived.id])assert(!ids('active').includes(id));
    for(const id of [op.id,expired.id]){assert(ids('expired').includes(id));assert(ids('').includes(id))}
    assert(ids('archived').includes(archived.id));
    assert.equal(filterOpportunities(rows,{activity:'expired',q:'Expired unapplied',stage:'READY_TO_APPLY'}).length,1);
    const changed=await request(`/applications/${application.id}/stage`,a.cookie,'PATCH',{stage:'ASSESSMENT'}).then((r:any)=>r.json());
    assert.equal(changed.item.currentStage,'ASSESSMENT');
    await request(`/interviews/${interview.id}`,a.cookie,'PATCH',{completed:true,outcome:'PENDING'});
    const round=await request('/interviews',a.cookie,'POST',{applicationId:application.id,scheduledAt:offset(2)+'T10:00:00-06:00',timezone:'America/Denver',interviewRound:'FINAL_ROUND',interviewType:'VIRTUAL'},201).then((r:any)=>r.json());
    await request(`/interviews/${round.id}`,a.cookie,'PATCH',{preparationNotes:'Later round after deadline.'});
    const dashboard=await request('/dashboard',a.cookie).then((r:any)=>r.json());
    assert(!dashboard.todayActions.some((x:any)=>x.kind==='opportunity'&&[op.id,expired.id].includes(x.id)));
    for(const id of [future.id,due.id])assert(dashboard.deadlines.some((x:any)=>x.id===id));
    for(const zone of ['America/Denver','Pacific/Honolulu','Pacific/Kiritimati']) {
      const zoned=await request('/dashboard?timeZone='+encodeURIComponent(zone),a.cookie).then((r:any)=>r.json());
      const localParts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const value=(type:string)=>localParts.find(x=>x.type===type)!.value;
      const localToday=`${value('year')}-${value('month')}-${value('day')}`;
      assert.equal(zoned.deadlines.some((x:any)=>x.id===due.id),today>=localToday,zone);
    }
    await request('/dashboard?timeZone=invalid-zone',a.cookie);
    for(const [kind,id] of [['task',task.id],['contact',contact.id],['application',application.id],['interview',round.id],['interview',interview.id]])assert(dashboard.todayActions.some((x:any)=>x.kind===kind&&x.id===id),`Missing ${kind} ${id}`);
    assert(!(await request('/dashboard',b.cookie).then((r:any)=>r.json())).todayActions.some((x:any)=>[op.id,round.id,task.id,contact.id].includes(x.id)));
    const detail=await request(`/opportunities/${op.id}`,a.cookie).then((r:any)=>r.json());
    assert.equal(detail.status,'READY_TO_APPLY');
    assert.equal(detail.applications[0].currentStage,'ASSESSMENT');
    assert(detail.interviews.some((x:any)=>x.id===round.id));assert(detail.interviews.some((x:any)=>x.id===interview.id));
    assert((await request('/applications',a.cookie).then((r:any)=>r.json())).some((x:any)=>x.id===application.id));
    await request(`/applications/${application.id}/stage`,a.cookie,'PATCH',{stage:'FIRST_ROUND'});
    await request(`/applications/${application.id}/stage`,b.cookie,'PATCH',{stage:'OFFER'},404);
    await request(`/interviews/${round.id}`,b.cookie,'PATCH',{outcome:'OFFER'},404);
    await request(`/opportunities/${op.id}`,b.cookie,'GET',undefined,404);
    console.log('✓ Expiration dates/DST, Open/Expired/All/archive filters, Today action types, active applications, multiple rounds, detail access and ownership passed.');
  } finally {if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone}
}
