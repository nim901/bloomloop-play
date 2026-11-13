import http from 'node:http'; import fs from 'node:fs/promises'; import path from 'node:path'; import { webcrypto } from 'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname), password=process.env.BLOOMLOOP_PASSWORD;
if(!password){console.error('BLOOMLOOP_PASSWORD is required');process.exit(2)}
const p=JSON.parse(await fs.readFile(path.join(root,'payload.json'),'utf8')), b=s=>Buffer.from(s,'base64'), salt=b(p.salt);
const base=await webcrypto.subtle.importKey('raw',Buffer.from(password),'PBKDF2',false,['deriveKey']);
const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:p.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
const data=Buffer.concat([b(p.data),b(p.tag)]), html=Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:b(p.iv)},key,data));
const server=http.createServer(async(req,res)=>{let u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/game')){res.setHeader('content-type','text/html');res.end(html);return}let f=path.join(root,u.pathname==='/'?'index.html':u.pathname);try{res.end(await fs.readFile(f))}catch{res.statusCode=404;res.end('Not found')}});
server.listen(Number(process.env.PORT||8777),'127.0.0.1',()=>console.log('QA server ready'));
