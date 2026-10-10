import {authorized} from '../app/admin-auth';
type Env={DB:D1Database;CLIP_IMAGES?:R2Bucket};
let ready:Promise<unknown>|undefined;
function setup(db:D1Database){return ready??=db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS history_boards(slug TEXT PRIMARY KEY,next_number INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS history_entries(board TEXT NOT NULL,number INTEGER NOT NULL,content TEXT,image_key TEXT,media_type TEXT,digest TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(board,number),UNIQUE(board,request_id))'),
 db.prepare('CREATE TRIGGER IF NOT EXISTS history_number AFTER INSERT ON history_entries BEGIN UPDATE history_boards SET next_number=next_number+1 WHERE slug=NEW.board; END')
]).catch(e=>{ready=undefined;throw e});}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function bodyBytes(request:Request,limit:number){
 const reader=request.body?.getReader();if(!reader)throw Error('Empty upload');let size=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Upload too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function history(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),admin=url.pathname==='/api/admin/history';
 if(request.method!=='GET' && request.headers.get('origin') && request.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
 if(admin&&!authorized(request))return json({error:'Wrong password.'},401);
 try{
 await setup(env.DB);
 if(admin){
  if(request.method==='GET')return json({boards:(await env.DB.prepare('SELECT slug,next_number,created_at FROM history_boards ORDER BY created_at DESC').all()).results});
  const body=JSON.parse(new TextDecoder().decode(await bodyBytes(request,2048)));const slug=String(body.slug||'').trim().toLowerCase();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60)return json({error:'Use 1–60 lowercase letters, numbers or hyphens.'},400);
  if(request.method==='POST'){
   const r=await env.DB.prepare('INSERT OR IGNORE INTO history_boards(slug,created_at) VALUES(?,?)').bind(slug,Date.now()).run();
   return r.meta.changes?json({ok:true,slug},201):json({error:'That history board already exists.'},409);
  }
  if(request.method==='DELETE'){
   const results=await env.DB.batch([env.DB.prepare('DELETE FROM history_boards WHERE slug=?').bind(slug),env.DB.prepare('DELETE FROM history_entries WHERE board=? RETURNING image_key').bind(slug)]);
   const keys=results[1].results.map((r:any)=>r.image_key).filter(Boolean);if(keys.length)await env.CLIP_IMAGES?.delete(keys);
   return json({ok:true});
  }
  return json({error:'Method not allowed'},405);
 }
 const match=url.pathname.match(/^\/api\/history\/([a-z0-9-]{1,60})(?:\/images\/([0-9]+))?$/);
 if(!match)return json({error:'Not found'},404);const [,slug,image]=match;
 if(!await env.DB.prepare('SELECT slug FROM history_boards WHERE slug=?').bind(slug).first())return json({error:'History board not found. Ask the admin to create it first.'},404);
 if(image){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const row=await env.DB.prepare('SELECT image_key FROM history_entries WHERE board=? AND number=?').bind(slug,Number(image)).first<{image_key:string}>();
  const object=row?.image_key?await env.CLIP_IMAGES?.get(row.image_key):null;
  if(!object)return json({error:'Image not found'},404);
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(request.method==='GET'){
  const latest=await env.DB.prepare('SELECT number FROM history_entries WHERE board=? ORDER BY number DESC LIMIT 1').bind(slug).first<{number:number}>();
  if(latest && url.searchParams.get('after')===String(latest.number))return json({unchanged:true});
  const entries=await env.DB.prepare('SELECT number,content,media_type,created_at,image_key IS NOT NULL AS image FROM history_entries WHERE board=? ORDER BY number DESC LIMIT 100').bind(slug).all();
  return json({slug,entries:entries.results});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const bytes=await bodyBytes(request,10*1024*1024);let content:string|null=null,type:string|null=null;
 if(request.headers.get('content-type')?.startsWith('application/json')){
  const data=JSON.parse(new TextDecoder().decode(bytes));if(typeof data.content!=='string'||!data.content.length||data.content.length>200000)return json({error:'Text must be 1–200,000 characters.'},400);content=data.content;
 }else{
  const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
  type=bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':['GIF87a','GIF89a'].includes(ascii(0,6))?'image/gif':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
  if(!type)return json({error:'Use text, PNG, JPEG, GIF or WebP.'},415);
  if(!env.CLIP_IMAGES)return json({error:'Add the CLIP_IMAGES R2 binding to store screenshots.'},503);
 }
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content!==null?new TextEncoder().encode('text:'+content):bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const requestId=request.headers.get('X-Capture-ID')||crypto.randomUUID();if(!/^[a-zA-Z0-9-]{1,80}$/.test(requestId))return json({error:'Invalid capture ID'},400);
 const key=type?`history/${slug}/${crypto.randomUUID()}`:null;
 if(key)await env.CLIP_IMAGES!.put(key,bytes,{httpMetadata:{contentType:type!}});
 let results;
 try{
 results=await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO history_entries(board,number,content,image_key,media_type,digest,request_id,created_at) SELECT slug,next_number,?,?,?,?,?,? FROM history_boards WHERE slug=? AND COALESCE((SELECT digest FROM history_entries WHERE board=? ORDER BY number DESC LIMIT 1),\'\')<>?').bind(content,key,type,digest,requestId,Date.now(),slug,slug,digest),
  env.DB.prepare('DELETE FROM history_entries WHERE board=? AND number NOT IN(SELECT number FROM history_entries WHERE board=? ORDER BY number DESC LIMIT 100) RETURNING image_key').bind(slug,slug)
 ]);
 }catch(e){if(key)await env.CLIP_IMAGES!.delete(key);throw e;}
 const keys=results[1].results.map((r:any)=>r.image_key).filter(Boolean);if(!results[0].meta.changes&&key)keys.push(key);if(keys.length)await env.CLIP_IMAGES?.delete(keys);
 if(!results[0].meta.changes&&!await env.DB.prepare('SELECT slug FROM history_boards WHERE slug=?').bind(slug).first())return json({error:'Board was deleted.'},404);
 return json({ok:true,duplicate:!results[0].meta.changes});
 }catch(error){console.error('History request failed',error);return json({error:error instanceof Error&&error.message==='Upload too large'?'Upload too large. Maximum 10 MB.':'Could not access history storage. Try again.'},error instanceof Error&&error.message==='Upload too large'?413:503);}
}
