const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const hashToken=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
export async function passwordHash(password:string,salt:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
export function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return diff===0;}
export type Security={board:string;salt:string;password_hash:string;upload_hash:string;version:string};
export const cookieName=(slug:string)=>'__Host-history-'+slug;
export function sessionToken(request:Request,slug:string){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName(slug)+'='))?.slice(cookieName(slug).length+1)||'';}
export async function validSession(db:D1Database,request:Request,security:Security){
 const token=sessionToken(request,security.board);if(!/^[a-f0-9]{64}$/.test(token))return false;
 return !!await db.prepare('SELECT token_hash FROM history_sessions WHERE token_hash=? AND board=? AND version=? AND expires_at>?').bind(await hashToken(token),security.board,security.version,Date.now()).first();
}
export function authSchema(db:D1Database){return [
 db.prepare('CREATE TABLE IF NOT EXISTS history_security(board TEXT PRIMARY KEY,salt TEXT NOT NULL,password_hash TEXT NOT NULL,upload_hash TEXT NOT NULL,version TEXT NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS history_sessions(token_hash TEXT PRIMARY KEY,board TEXT NOT NULL,version TEXT NOT NULL,expires_at INTEGER NOT NULL)'),
 db.prepare('CREATE INDEX IF NOT EXISTS history_sessions_board ON history_sessions(board)'),
 db.prepare('CREATE INDEX IF NOT EXISTS history_sessions_expiry ON history_sessions(expires_at)'),
 db.prepare('CREATE TABLE IF NOT EXISTS history_attempts(scope TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)'),
 db.prepare('CREATE INDEX IF NOT EXISTS history_attempts_expiry ON history_attempts(expires_at)')];}
export async function configure(db:D1Database,slug:string,password:string){
 const old=await db.prepare('SELECT upload_hash FROM history_security WHERE board=?').bind(slug).first<{upload_hash:string}>();
 const key=old?null:randomToken(),salt=randomToken();
 await db.batch([
 db.prepare('INSERT INTO history_security(board,salt,password_hash,upload_hash,version) VALUES(?,?,?,?,?) ON CONFLICT(board) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,version=excluded.version').bind(slug,salt,await passwordHash(password,salt),old?.upload_hash||await hashToken(key!),randomToken()),
 db.prepare('DELETE FROM history_sessions WHERE board=?').bind(slug)
 ]);return key;
}
export async function login(db:D1Database,request:Request,security:Security,password:string){
 const now=Date.now(),scope=security.board+':'+await hashToken(request.headers.get('CF-Connecting-IP')||'unknown');
 // Shared D1 counters survive restarts and enforce concurrent attempts atomically.
 const results=await db.batch([scope,'board:'+security.board].map(s=>db.prepare('INSERT INTO history_attempts(scope,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts,expires_at').bind(s,now+900000,now,now)));
 const local=results[0].results[0] as {attempts:number;expires_at:number},global=results[1].results[0] as {attempts:number;expires_at:number};
 if(local.attempts>5||global.attempts>100)return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':String(Math.ceil((Math.max(local.expires_at,global.expires_at)-now)/1000))}});
 if(!equal(await passwordHash(password,security.salt),security.password_hash))return Response.json({error:'Incorrect board password.'},{status:401,headers:{'Cache-Control':'no-store'}});
 const token=randomToken();
 await db.batch([db.prepare('DELETE FROM history_sessions WHERE expires_at<=?').bind(now),db.prepare('DELETE FROM history_attempts WHERE expires_at<=?').bind(now),db.prepare('INSERT INTO history_sessions(token_hash,board,version,expires_at) VALUES(?,?,?,?)').bind(await hashToken(token),security.board,security.version,now+28800000)]);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`${cookieName(security.board)}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`}});
}
