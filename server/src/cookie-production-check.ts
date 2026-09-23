import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port=4200,base=`http://127.0.0.1:${port}`;
async function main(){
 const server=spawn('node',['server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});let stderr='';server.stderr.on('data',chunk=>stderr+=chunk);
 try{
  for(let attempt=0;attempt<40;attempt++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100));if(attempt===39)throw new Error('Production-mode server did not start.');}
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'user-a@example.test',password:'correct horse battery staple'})});if(response.status!==200)throw new Error(`Production login failed: ${await response.text()}`);const setCookie=response.headers.get('set-cookie')||'';if(!setCookie.includes('HttpOnly')||!setCookie.includes('SameSite=Lax')||!setCookie.includes('Secure'))throw new Error(`Production session cookie missing security attributes: ${setCookie}`);if(stderr)throw new Error(`Production server emitted stderr: ${stderr}`);console.log('✓ Production session cookie has HttpOnly, Secure, and SameSite=Lax.');
 }finally{server.kill('SIGTERM');await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1});
