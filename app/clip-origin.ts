import {env} from 'cloudflare:workers';
import {isIP} from 'node:net';
let ready:Promise<unknown>|undefined;
export function ensureClipOrigins(){
 if(!ready)ready=env.DB.prepare('CREATE TABLE IF NOT EXISTS clip_origins (slug TEXT PRIMARY KEY, public_ip TEXT)').run().catch(e=>{ready=undefined;throw e;});
 return ready;
}
// Cloudflare supplies this header at the edge. Never use a caller-provided body
// field or X-Forwarded-For as a substitute for it.
export async function saveClip(request:Request,slug:string,content:string,updatedAt:Date,onlyCreate=false){
 await ensureClipOrigins();
 const header=request.headers.get('CF-Connecting-IP')?.trim() || '';
 const ip=isIP(header)?header:null;
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO clip_origins(slug,public_ip) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM clips WHERE slug=?)').bind(slug,ip,slug),
  env.DB.prepare('INSERT INTO clips(slug,content,updated_at) VALUES(?,?,?) ON CONFLICT(slug) '+(onlyCreate?'DO NOTHING':'DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at')).bind(slug,content,updatedAt.getTime())
 ]);
}
