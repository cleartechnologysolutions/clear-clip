import assert from 'node:assert/strict';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
test('renders development preview metadata in the Worker runtime',async()=>{
 const root=fileURLToPath(new URL('../dist/server/',import.meta.url));
 const mf=new Miniflare({name:'clip-preview-test',rootPath:root,modulesRoot:root,modules:true,scriptPath:root+'/index.js',modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],serviceBindings:{ASSETS:async()=>new Response(null,{status:404})}});
 try{const response=await mf.dispatchFetch('http://localhost/');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/html\b/i);assert.match(await response.text(),/<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i);}finally{await mf.dispose();}
});
