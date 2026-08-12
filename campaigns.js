import { db } from '../src/compat.js';
export const access = 'public';
export const methods = ['GET'];
export default async function(req,res){
 const now=new Date().toISOString();
 const {rows}=await db.query("SELECT id,title,description,code,discount_type,discount_value,min_subtotal,starts_at,ends_at,max_uses,max_uses_per_customer,used_count FROM campaigns WHERE active=true AND (starts_at IS NULL OR starts_at <= $1) AND (ends_at IS NULL OR ends_at >= $1) AND (max_uses IS NULL OR used_count < max_uses) ORDER BY created_at DESC",[now]);
 res.json(rows);
}