import { db, storage } from '../../../../src/compat.js';
export const access='public'; export const methods=['GET'];
export default async function(req,res){
 const field=req.params.kind==='chart'?'size_chart_url':'image_url'; const {rows}=await db.query(`SELECT ${field} AS url FROM products WHERE id=$1 LIMIT 1`,[req.params.id]); const url=rows[0]?.url;
 if(!url||String(url).startsWith('pending-'))return res.status(404).send('Not found');
 try{
  const s=String(url); let file;
  if(s.startsWith('r2://')) file=await storage.get(s.slice(5));
  else if(s.startsWith('http')){const r=await fetch(s);if(!r.ok)return res.status(404).send('Not found');res.setHeader('Content-Type',r.headers.get('content-type')||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=86400');return res.send(await r.arrayBuffer());}
  else return res.status(404).send('Not found');
  res.setHeader('Content-Type',file.contentType||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=86400');return res.send(file.buffer);
 }catch{return res.status(404).send('Not found');}
}
