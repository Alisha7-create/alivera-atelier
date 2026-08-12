import { storage } from '../../src/compat.js';
export const access='public'; export const methods=['GET'];
export default async function(req,res){
  try { const key=decodeURIComponent(req.params.key||''); const file=await storage.get(key); res.setHeader('Content-Type',file.contentType||'application/octet-stream'); res.setHeader('Cache-Control','public, max-age=31536000, immutable'); return res.send(file.buffer); }
  catch { return res.status(404).send('Not found'); }
}
