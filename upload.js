import { storage, db } from '../../src/compat.js';
export const access = 'admin';
export const methods = ['POST'];
const site=req=>`https://${req.headers.host}`;
export default async function(req,res){
  const f=(req.files||[])[0];
  if(!f) return res.status(400).json({error:'No image uploaded.'});
  if(!String(f.contentType||'').startsWith('image/')) return res.status(400).json({error:'Please upload an image file.'});
  if(f.buffer.length>8*1024*1024) return res.status(400).json({error:'Image must be 8MB or smaller.'});
  const productId=String(req.body?.product_id||'').trim();
  const field=String(req.body?.field||'image_url').trim();
  if(!['image_url','size_chart_url'].includes(field)) return res.status(400).json({error:'Invalid image field.'});
  const key=`products/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${String(f.filename||'image').replace(/[^a-zA-Z0-9._-]/g,'-')}`;
  await storage.put(key,f.buffer,f.contentType);
  const url=productId ? `${site(req)}/api/media/product/${productId}${field==='size_chart_url'?'/chart':''}` : `${site(req)}/api/storage/${encodeURIComponent(key)}`;
  if(productId){
    const {rows}=await db.query(`UPDATE products SET ${field}=$1,updated_at=now() WHERE id=$2 RETURNING id,name,image_url,size_chart_url`,[`r2://${key}`,productId]);
    if(!rows.length) return res.status(404).json({error:'Product not found.'});
    return res.json({ok:true,url,product:rows[0],saved:true});
  }
  res.json({ok:true,url,saved:false});
}