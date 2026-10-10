'use client';
import {useEffect,useRef,useState} from 'react';
type Entry={number:number;content:string|null;image:number;media_type:string|null;created_at:number};
export function HistoryBoard({slug}:{slug:string}){
 const [entries,setEntries]=useState<Entry[]>([]),[status,setStatus]=useState('Loading history…'),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const [locked,setLocked]=useState(true),[password,setPassword]=useState('');const lockedRef=useRef(true);
 const authGeneration=useRef(0);
 const running=useRef(false),latest=useRef(0);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();latest.current=0;
  async function load(){if(running.current)return;running.current=true;const generation=authGeneration.current;setBusy(true);try{
   const r=await fetch(`/api/history/${encodeURIComponent(slug)}?after=${latest.current}`,{cache:'no-store',signal:controller.signal});const d=await r.json() as {error?:string;unchanged?:boolean;entries:Entry[]};if(!r.ok){if(r.status===401||r.status===423){lockedRef.current=true;setLocked(true);setEntries([]);latest.current=0;}throw Error(d.error||'Could not load history');}
   if(alive&&generation===authGeneration.current){lockedRef.current=false;setLocked(false);if(!d.unchanged){setEntries(d.entries);latest.current=d.entries[0]?.number||0;}setStatus('Saved online · latest 100 entries');}
  }catch(e){if(alive)setStatus(e instanceof Error?e.message:'Could not refresh');}finally{running.current=false;if(alive)setBusy(false);}}
  void load();const refresh=()=>void load();window.addEventListener('history-refresh',refresh);
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!lockedRef.current)void load();},15000);
  return()=>{alive=false;controller.abort();clearInterval(timer);window.removeEventListener('history-refresh',refresh);};
 },[slug]);
 async function unlock(){setBusy(true);try{const r=await fetch(`/api/history/${slug}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error);setPassword('');latest.current=0;window.dispatchEvent(new Event('history-refresh'));}catch(e){setStatus(e instanceof Error?e.message:'Unlock failed');}finally{setBusy(false);}}
 async function logout(){try{const r=await fetch(`/api/history/${slug}/logout`,{method:'POST'});if(!r.ok)throw Error('Could not sign out. Try again.');authGeneration.current++;lockedRef.current=true;setLocked(true);setEntries([]);latest.current=0;setStatus('Board locked.');}catch(e){setStatus(e instanceof Error?e.message:'Sign out failed');}}
 async function copy(entry:Entry){try{
  if(entry.image){const r=await fetch(`/api/history/${slug}/images/${entry.number}`);if(!r.ok)throw Error('Image unavailable');const blob=await r.blob();await navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})]);}
  else await navigator.clipboard.writeText(entry.content||'');setStatus(`Copied #${entry.number}`);
 }catch{setStatus('Copy unavailable in this browser. Select the text or open and save the image.');}}
 const visible=entries.filter(e=>!search||(e.content||'Screenshot').toLowerCase().includes(search.toLowerCase())||String(e.number)===search);
 return <main className="min-h-screen bg-[#06111f] p-4 text-slate-100 sm:p-8"><div className="mx-auto max-w-5xl">
  <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-5"><div><a href="/" className="text-sm text-sky-300">Clip</a><h1 className="text-3xl font-bold">Clipboard history <span className="font-mono text-sky-300">/{slug}</span></h1><p className="mt-2 text-sm text-slate-400">Newest first. Text and screenshots stay here until they roll past the latest 100.</p></div><button disabled={busy} onClick={()=>window.dispatchEvent(new Event('history-refresh'))} className="rounded-lg bg-sky-300 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">{busy?'Refreshing…':'Refresh'}</button></header>
  <p role="status" className="mb-4 text-sm text-sky-200">{status}</p><p className="mb-5 text-xs text-slate-400">Password-protected history. Clip Tray uses a separate upload key.</p>
  {locked?<form onSubmit={e=>{e.preventDefault();void unlock();}} className="mx-auto max-w-md space-y-4 rounded-xl border border-white/20 bg-slate-900 p-6"><h2 className="text-xl font-bold">Unlock history</h2><input aria-label="Board password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded border border-white/20 bg-slate-950 p-3"/><button disabled={busy} className="rounded bg-sky-300 px-5 py-3 font-bold text-slate-950">Unlock</button></form>:<><button onClick={()=>void logout()} className="mb-4 rounded border border-white/20 px-4 py-2">Lock board / sign out</button>
  <input aria-label="Search clipboard history" placeholder="Find text or an entry number…" value={search} onChange={e=>setSearch(e.target.value)} className="mb-5 w-full rounded-lg border border-white/20 bg-slate-900 p-3"/>
  <div className="space-y-4">{visible.map(e=><article key={e.number} className="overflow-hidden rounded-xl border border-white/15 bg-slate-900/70"><div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3"><strong className="font-mono text-lg text-sky-300">#{e.number}</strong><time className="flex-1 text-xs text-slate-400">{new Date(e.created_at).toLocaleString()}</time><button onClick={()=>void copy(e)} className="rounded border border-white/20 px-4 py-1.5">Copy</button>{!!e.image&&<a className="text-sm text-sky-300" href={`/api/history/${slug}/images/${e.number}`} target="_blank" rel="noreferrer">Open image</a>}</div>{e.image?<img alt={`Screenshot #${e.number}`} loading="lazy" src={`/api/history/${slug}/images/${e.number}`} className="max-h-[480px] max-w-full object-contain p-4"/>:<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm">{e.content}</pre>}</article>)}{!busy&&!visible.length&&<p className="rounded-xl border border-dashed border-white/20 p-8 text-center text-slate-400">{entries.length?'No matching entries.':'No saved entries yet. Start Clip Tray with this board’s link.'}</p>}</div>
 </>} </div></main>;
}
