import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
const mf=new Miniflare({name:'clip',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,d1Databases:['DB'],r2Buckets:['CLIP_IMAGES'],serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
try {
 const db=await mf.getD1Database('DB'); await db.exec("CREATE TABLE clips (slug TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)");
 const origin=(await mf.ready).origin;
 const put=text=>mf.dispatchFetch(origin+'/api/clips/tray',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})});
 for(const text of ['First clipboard','Second: café 😀\nline two']){assert.equal((await put(text)).status,200);assert.equal((await(await mf.dispatchFetch(origin+'/api/clips/tray')).json()).content,text);}
 const png=Buffer.alloc(2*1024*1024);Buffer.from('89504e470d0a1a0a','hex').copy(png);
 const uploaded=await mf.dispatchFetch(origin+'/api/clips/tray/image',{method:'PUT',headers:{'Content-Type':'image/png'},body:png});
 assert.equal(uploaded.status,200);const {slot}=await uploaded.json();assert.equal(slot,0);
 assert.equal((await(await mf.dispatchFetch(origin+'/api/clips/tray/image?list=1')).json()).images.length,1);
 assert.deepEqual(Buffer.from(await(await mf.dispatchFetch(origin+'/api/clips/tray/image?slot=0')).arrayBuffer()),png);
 assert.equal((await(await mf.dispatchFetch(origin+'/api/clips/tray')).json()).content,'Second: café 😀\nline two');
 assert.equal((await put('x'.repeat(200001))).status,413);
 console.log('PASS: desktop requests without Origin, Unicode/multiline text replacement, 2 MB raw screenshot, receiver list and bytes, text retained, size rejection.');
}finally{await mf.dispose();}
