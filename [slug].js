import { db } from '../../src/compat.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 const {rows}=await db.query("SELECT id,name,slug,description,price,sizes,stock,active FROM products WHERE slug=$1 AND active=true LIMIT 1",[req.params.slug]);
 if(!rows.length)return res.status(404).json({error:'Product not found'});
 const p=rows[0],base=`https://${req.headers.host||'aliveraatelier.in'}`;
 res.json({...p,image_url:`${base}/api/media/product/${p.id}`,size_chart_url:`${base}/api/media/product/${p.id}/chart`});
}