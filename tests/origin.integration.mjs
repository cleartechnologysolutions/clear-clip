import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
const mf=new Miniflare({name:'clip',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,bindings:{ADMIN_PASSWORD:'test'},d1Databases:['DB'],r2Buckets:['CLIP_IMAGES'],serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
try {
 const db=await mf.getD1Database('DB');await db.exec("CREATE TABLE clips (slug TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)");await db.prepare('INSERT INTO clips VALUES(?,?,?)').bind('old','old',Date.now()).run();
 const origin=(await mf.ready).origin;
 const req=(path,method='GET',body,ip='203.0.113.10',admin=false)=>mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip,...(admin?{Authorization:'Bearer test'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await req('/api/clips/new','PUT',{content:'First'})).status,200);
 await req('/api/clips/new','PUT',{content:'Second'},'198.51.100.20');await req('/api/clips/old','PUT',{content:'Update'});
 await req('/api/clips/ipv6','PUT',{content:'Six'},'2001:db8::1234');await req('/api/clips/invalid','PUT',{content:'Bad'},'invalid');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGz8AAAAASUVORK5CYII=','base64');
 assert.equal((await mf.dispatchFetch(origin+'/api/clips/image/image',{method:'PUT',headers:{Origin:origin,'CF-Connecting-IP':'203.0.113.12'},body:png})).status,200);
 assert.equal((await req('/api/admin/clips')).status,401);
 const own=await req('/api/public-ip','GET',null,'2001:db8::99');assert.equal((await own.json()).publicIp,'2001:db8::99');assert.ok(own.headers.get('Cache-Control').includes('no-store'));
 const list=(await (await req('/api/admin/clips','GET',null,'203.0.113.10',true)).json()).clips;
 const ipFor=name=>list.find(c=>c.slug===name).publicIp;
 assert.equal(ipFor('new'),'203.0.113.10');assert.equal(ipFor('old'),null);assert.equal(ipFor('ipv6'),'2001:db8::1234');assert.equal(ipFor('invalid'),null);assert.equal(ipFor('image'),'203.0.113.12');
 for(const method of ['GET','PUT','DELETE']){const r=await req('/api/clips/new',method,method==='PUT'?{content:'Hi'}:undefined);const text=await r.text();assert.ok(!text.includes('203.0.113.10')&&!text.includes('publicIp'));}
 assert.equal((await db.prepare("SELECT public_ip FROM clip_origins WHERE slug='new'").first()).public_ip,'203.0.113.10');
 await req('/api/admin/clips','DELETE',null,'203.0.113.10',true);assert.equal((await db.prepare('SELECT COUNT(*) n FROM clip_origins').first()).n,0);
 await req('/api/clips/new','PUT',{content:'Recreated'},'198.51.100.30');assert.equal((await db.prepare("SELECT public_ip FROM clip_origins WHERE slug='new'").first()).public_ip,'198.51.100.30');
 console.log('PASS: first creator retained, existing unknown, IPv4/IPv6, invalid header, image-first creation, admin-only exposure, clear preserves origin, delete-all clears metadata, recreation');
}finally{await mf.dispose();}
