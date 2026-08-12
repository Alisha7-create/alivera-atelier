import { storage } from '../../src/compat.js';
export const access = 'admin';
export const methods = ['POST'];
const site=req=>`https://${req.headers.host}`;
export default async function(req,res){const f=(req.files||[])[0];if(!f)return res.status(400).json({error:'No photo uploaded.'});if(!String(f.contentType||'').startsWith('image/'))return res.status(400).json({error:'Please upload an image file.'});if(f.buffer.length>8*1024*1024)return res.status(400).json({error:'Photo must be 8MB or smaller.'});const key=`stories/${Date.now()}-${String(f.filename||'story').replace(/[^a-zA-Z0-9._-]/g,'-')}`;await storage.put(key,f.buffer,f.contentType);const url=`${site(req)}/api/storage/${encodeURIComponent(key)}`;res.json({ok:true,url});}