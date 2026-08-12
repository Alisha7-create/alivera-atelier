import { db } from '../src/compat.js';
export const access = 'user';
export const methods = ['GET'];
export default async function(req,res){ const {rows}=await db.query("SELECT id,order_number,total,payment_method,payment_status,status,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]); res.json(rows); }