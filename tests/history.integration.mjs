import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
const mf=new Miniflare({name:'clip',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'test-history'},d1Databases:['DB'],r2Buckets:['CLIP_IMAGES'],serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
try {
 const db=await mf.getD1Database('DB');await db.exec("CREATE TABLE clips(slug TEXT PRIMARY KEY,content TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL)");
 const origin=(await mf.ready).origin;
 async function req(path,method='GET',body,admin=false,extra={}){return mf.dispatchFetch(origin+path,{method,headers:{...(admin?{Authorization:'Bearer test-history'}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});}
 assert.equal((await req('/api/admin/history','POST',{slug:'adam'})).status,401);
 assert.equal((await req('/api/history/adam','POST',{content:'no board'})).status,404);
 assert.equal((await req('/api/admin/history','POST',{slug:'adam'},true)).status,201);
 assert.equal((await req('/api/admin/history','POST',{slug:'alicia'},true)).status,201);
 assert.equal((await req('/api/admin/history','POST',{slug:'adam'},true)).status,409);
 assert.equal((await req('/api/history/adam','POST',{content:'wrong origin'},false,{Origin:'https://other.test'})).status,403);
 const put=(content,headers={})=>req('/api/history/adam','POST',{content},false,headers);
 assert.equal((await put('café 😀\nline two',{'X-Capture-ID':'same'})).status,200);
 assert.equal((await(await put('café 😀\nline two')).json()).duplicate,true);
 assert.equal((await(await put('different',{'X-Capture-ID':'same'})).json()).duplicate,true);
 let entries=(await(await req('/api/history/adam')).json()).entries;assert.equal(entries.length,1);assert.equal(entries[0].number,1);
 const png=Buffer.from('89504e470d0a1a0a00000000','hex');
 const r=await mf.dispatchFetch(origin+'/api/history/adam',{method:'POST',headers:{'Content-Type':'image/png'},body:png});assert.equal(r.status,200);
 assert.deepEqual(Buffer.from(await(await req('/api/history/adam/images/2')).arrayBuffer()),png);
 // Fill and cross the retention boundary; numbering must continue.
 for(let i=3;i<=105;i++)assert.equal((await put('capture '+i)).status,200);
 entries=(await(await req('/api/history/adam')).json()).entries;assert.equal(entries.length,100);assert.equal(entries[0].number,105);assert.equal(entries.at(-1).number,6);
 assert.equal((await(await req('/api/history/adam?after=105')).json()).unchanged,true);
 assert.equal((await req('/api/history/adam/images/2')).status,404);assert.equal((await(await mf.getR2Bucket('CLIP_IMAGES')).list()).objects.length,0);
 // Concurrent captures cannot duplicate numbers or exceed retention.
 const concurrent=await Promise.all(Array.from({length:12},(_,i)=>put('parallel '+i)));assert.ok(concurrent.every(r=>r.status===200));
 entries=(await(await req('/api/history/adam')).json()).entries;assert.equal(entries.length,100);assert.equal(new Set(entries.map(e=>e.number)).size,100);assert.equal(entries[0].number,117);
 assert.equal((await(await req('/api/history/alicia')).json()).entries.length,0);
 assert.equal((await req('/api/history/alicia','POST',{content:'Alicia only'})).status,200);
 assert.equal((await req('/api/admin/history','DELETE',{slug:'adam'},true)).status,200);
 assert.equal((await req('/api/history/adam')).status,404);assert.equal((await(await req('/api/history/alicia')).json()).entries.length,1);
 const page=await req('/history/alicia');assert.equal(page.status,200);assert.match(await page.text(),/Clipboard history/);
 console.log('PASS: admin-only board creation, independent boards, persistent numbered text/images, deduplication, idempotency, 100-entry retention, image cleanup, concurrent uploads, refresh, deletion and history page');
}finally{await mf.dispose();}
