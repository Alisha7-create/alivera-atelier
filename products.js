import { db } from '../src/compat.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 const {rows}=await db.query("SELECT id,name,slug,description,price,sizes,stock,active FROM products WHERE active=true ORDER BY created_at DESC");
 const base=`https://${req.headers.host||'aliveraatelier.in'}`;
 res.json(rows.map(p=>({...p,image_url:`${base}/api/media/product/${p.id}`,size_chart_url:`${base}/api/media/product/${p.id}/chart`})));
}