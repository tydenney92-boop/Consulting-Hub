import {PrismaClient} from '@prisma/client';
import {spawnSync} from 'node:child_process';

// Recover only the known redundant nullable-column migration. Never reset data,
// resolve unrelated failures, or bypass the normal migrate deploy workflow.
const migration='20261020230000_add_application_assessment_status';
const prisma=new PrismaClient();
const run=(args)=>{const result=spawnSync('npx',['prisma',...args,'--schema','prisma/schema.postgres.prisma'],{stdio:'inherit'});if(result.status!==0)throw new Error('Production migration command failed.');};
try{
 const tables=await prisma.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS name`;
 if(tables[0]?.name){
  const failures=await prisma.$queryRaw`SELECT migration_name, logs FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL AND started_at IS NOT NULL`;
  if(failures.length===1&&failures[0].migration_name===migration&&/42701/.test(failures[0].logs||'')&&/assessmentStatus/.test(failures[0].logs||'')){
   const columns=await prisma.$queryRaw`SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='Application' AND column_name='assessmentStatus'`;
   if(columns.length!==1||columns[0].data_type!=='text'||columns[0].is_nullable!=='YES')throw new Error('Assessment column does not match the expected nullable text definition; manual review required.');
   console.log('Recovering the redundant assessment-column migration; existing data is unchanged.');
   run(['migrate','resolve','--rolled-back',migration]);
  }
 }
 await prisma.$disconnect();
 run(['migrate','deploy']);
}finally{await prisma.$disconnect();}
