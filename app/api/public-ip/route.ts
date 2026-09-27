import {isIP} from 'node:net';
export async function GET(request:Request){
 const ip=request.headers.get('CF-Connecting-IP')?.trim() || '';
 return Response.json({publicIp:isIP(ip)?ip:null},{headers:{'Cache-Control':'private, no-store, max-age=0','Vary':'CF-Connecting-IP'}});
}
