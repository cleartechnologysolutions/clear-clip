import {Miniflare} from 'miniflare';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../dist/server/', import.meta.url));
const mf=new Miniflare({name:'clip',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'local-test-only'},host:'127.0.0.1',d1Databases:['DB'],r2Buckets:['CLIP_IMAGES'],serviceBindings:{ASSETS:async()=>new Response('Not found',{status:404})}});
const db=await mf.getD1Database('DB');await db.exec("CREATE TABLE clips (slug text PRIMARY KEY, content text NOT NULL DEFAULT '', updated_at integer NOT NULL)");
console.log(String(await mf.ready));

const fetch=(...args)=>mf.dispatchFetch(...args);
import assert from 'node:assert/strict';
const base='http://localhost:8791/api/clips/test';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGz8AAAAASUVORK5CYII=','base64');
let r=await fetch(base,{method:'PUT',body:JSON.stringify({content:'Keep this text'})}); assert.equal(r.status,200,await r.clone().text());
r=await fetch(base+'/image',{method:'PUT',body:png});assert.equal(r.status,200,await r.text());
r=await fetch(base+'/image');assert.equal(r.status,200,await r.clone().text());assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
assert.equal((await (await fetch(base)).json()).content,'Keep this text');
r=await fetch(base+'/image',{method:'PUT',body:'<svg></svg>'});assert.equal(r.status,415);
r=await fetch(base+'/image',{method:'PUT',body:Buffer.alloc(10*1024*1024+1)});assert.equal(r.status,413);
assert.equal((await fetch(base+'/image')).status,200);
await fetch(base+'/image',{method:'DELETE'});assert.equal((await fetch(base+'/image')).status,404);assert.equal((await (await fetch(base)).json()).content,'Keep this text');
await fetch(base+'/image',{method:'PUT',body:png});await fetch(base,{method:'DELETE'});assert.equal((await fetch(base+'/image')).status,404);
console.log('PASS: original bytes, text preservation, invalid file, size limit, remove and clear');


await fetch(base+'/image',{method:'PUT',body:png});
const denied = await fetch('http://localhost/api/admin/clips',{method:'DELETE'}); assert.equal(denied.status,401);
assert.equal((await fetch(base+'/image')).status,200);
const cleared = await fetch('http://localhost/api/admin/clips',{method:'DELETE',headers:{Authorization:'Bearer local-test-only'}}); assert.equal(cleared.status,200);
assert.equal((await fetch(base+'/image')).status,404);
console.log('PASS: authenticated admin deletion includes images');
await mf.dispose();
