import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
const mf=new Miniflare({name:'clip',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'test-history'},d1Databases:['DB'],r2Buckets:['CLIP_IMAGES'],serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
try {
 const db=await mf.getD1Database('DB');await db.exec("CREATE TABLE clips(slug TEXT PRIMARY KEY,content TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL)");
 const origin=(await mf.ready).origin;
 const keys=new Map(),cookies=new Map();const pass='test-password-123';
 async function req(path,method='GET',body,admin=false,extra={}){const board=path.match(/^\/api\/history\/([^/?]+)/)?.[1];return mf.dispatchFetch(origin+path,{method,headers:{...(board&&cookies.has(board)?{Cookie:cookies.get(board)}:{}),...(board&&method==='POST'&&keys.has(board)?{Authorization:'Bearer '+keys.get(board)}:{}),...(admin?{Authorization:'Bearer test-history'}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});}
 assert.equal((await req('/api/admin/history','POST',{slug:'adam',password:pass})).status,401);
 assert.equal((await req('/api/history/adam','POST',{content:'no board'})).status,404);
 const created=await req('/api/admin/history','POST',{slug:'adam',password:pass},true);assert.equal(created.status,201);keys.set('adam',(await created.json()).uploadKey);
 assert.equal((await mf.dispatchFetch(origin+'/api/history/adam')).status,401);
 assert.equal((await mf.dispatchFetch(origin+'/api/history/adam',{headers:{Authorization:'Bearer '+keys.get('adam')}})).status,401);
 async function unlock(board,password=pass,ip='1.2.3.4'){const r=await req('/api/history/'+board+'/login','POST',{password},false,{'CF-Connecting-IP':ip});if(r.ok)cookies.set(board,r.headers.get('set-cookie').split(';')[0]);return r;}
 assert.equal((await unlock('adam')).status,200);
 const second=await req('/api/admin/history','POST',{slug:'alicia',password:pass},true);assert.equal(second.status,201);keys.set('alicia',(await second.json()).uploadKey);assert.equal((await unlock('alicia')).status,200);
 assert.equal((await req('/api/admin/history','POST',{slug:'adam',password:pass},true)).status,409);
 assert.equal((await req('/api/history/adam','POST',{content:'wrong origin'},false,{Origin:'https://other.test'})).status,403);
 const put=(content,headers={})=>req('/api/history/adam','POST',{content},false,headers);
 assert.equal((await put('café 😀\nline two',{'X-Capture-ID':'same'})).status,200);
 assert.equal((await(await put('café 😀\nline two')).json()).duplicate,true);
 assert.equal((await(await put('different',{'X-Capture-ID':'same'})).json()).duplicate,true);
 let entries=(await(await req('/api/history/adam')).json()).entries;assert.equal(entries.length,1);assert.equal(entries[0].number,1);
 const png=Buffer.from('89504e470d0a1a0a00000000','hex');
 const r=await mf.dispatchFetch(origin+'/api/history/adam',{method:'POST',headers:{'Content-Type':'image/png',Authorization:'Bearer '+keys.get('adam')},body:png});assert.equal(r.status,200);
 assert.equal((await mf.dispatchFetch(origin+'/api/history/adam/images/2')).status,401);
 assert.equal((await mf.dispatchFetch(origin+'/api/history/adam/images/2',{headers:{Cookie:cookies.get('alicia')}})).status,401);
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
 assert.equal((await req('/api/admin/history','DELETE',{slug:'adam',password:pass},true)).status,200);
 assert.equal((await req('/api/history/adam')).status,404);assert.equal((await(await req('/api/history/alicia')).json()).entries.length,1);

 // Upgrade locks existing boards without destroying their entries.
 await db.prepare('INSERT INTO history_boards(slug,created_at) VALUES(?,?)').bind('legacy',Date.now()).run();
 assert.equal((await req('/api/history/legacy')).status,423);
 const secured=await req('/api/admin/history','PATCH',{slug:'legacy',password:pass},true);assert.equal(secured.status,200);assert.ok((await secured.json()).uploadKey);
 // Password reset invalidates old browser sessions; upload-only credentials remain separate.
 const oldCookie=cookies.get('alicia');
 assert.equal((await req('/api/admin/history','PATCH',{slug:'alicia',password:'replacement-pass-456'},true)).status,200);
 assert.equal((await req('/api/history/alicia')).status,401);
 assert.equal((await req('/api/history/alicia','POST',{content:'upload after password reset'})).status,200);
 assert.equal((await unlock('alicia','replacement-pass-456')).status,200);
 const rotated=await req('/api/admin/history','PATCH',{slug:'alicia',action:'rotate-key'},true);assert.equal(rotated.status,200);const newKey=(await rotated.json()).uploadKey;
 assert.equal((await req('/api/history/alicia','POST',{content:'old key blocked'})).status,401);keys.set('alicia',newKey);
 assert.equal((await req('/api/history/alicia','POST',{content:'new key works'})).status,200);
 assert.equal((await req('/api/history/alicia/logout','POST')).status,200);assert.equal((await req('/api/history/alicia')).status,401);
 for(let i=0;i<5;i++)assert.equal((await unlock('legacy','wrong','5.6.7.8')).status,401);
 assert.equal((await unlock('legacy',pass,'5.6.7.8')).status,429);
 assert.equal((await unlock('legacy',pass,'9.8.7.6')).status,200);
 await db.prepare('UPDATE history_sessions SET expires_at=0 WHERE board=?').bind('legacy').run();assert.equal((await req('/api/history/legacy')).status,401);
 console.log('PASS: password gate, screenshot URL protection, upload-only keys, cross-board isolation, reset/revocation, key rotation, logout, session expiry, legacy fail-closed migration and login rate limits');
 const page=await req('/history/alicia');assert.equal(page.status,200);assert.match(await page.text(),/Clipboard history/);
 console.log('PASS: admin-only board creation, independent boards, persistent numbered text/images, deduplication, idempotency, 100-entry retention, image cleanup, concurrent uploads, refresh, deletion and history page');
}finally{await mf.dispose();}
