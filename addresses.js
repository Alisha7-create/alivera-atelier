import { db } from '../src/compat.js';
export const access='user';
export const methods=['GET','POST','PUT','DELETE'];
const clean=v=>String(v??'').trim();
export default async function(req,res){
 const uid=req.user.id, b=req.body||{};
 if(req.method==='GET'){const {rows}=await db.query('SELECT id,label,recipient_name,phone,address,city,state,pincode,is_default FROM customer_addresses WHERE user_id=$1 ORDER BY is_default DESC,created_at DESC',[uid]);return res.json(rows)}
 if(req.method==='POST'){
  const label=clean(b.label)||'Home', name=clean(b.recipient_name), phone=clean(b.phone), address=clean(b.address), city=clean(b.city), state=clean(b.state), pin=clean(b.pincode);
  if(!name||!phone||!address||!city||!state||!pin)return res.status(400).json({error:'Please complete all address fields.'});
  const {rows}=await db.query('SELECT count(*)::int AS n FROM customer_addresses WHERE user_id=$1',[uid]); const makeDefault=Boolean(b.is_default)||rows[0].n===0;
  if(makeDefault) await db.query('UPDATE customer_addresses SET is_default=false WHERE user_id=$1',[uid]);
  const r=await db.query('INSERT INTO customer_addresses (user_id,label,recipient_name,phone,address,city,state,pincode,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[uid,label,name,phone,address,city,state,pin,makeDefault]);return res.json(r.rows[0]);
 }
 if(req.method==='PUT'){
  const id=clean(b.id); if(!id)return res.status(400).json({error:'Address ID is required.'});
  if(b.is_default) await db.query('UPDATE customer_addresses SET is_default=false WHERE user_id=$1',[uid]);
  const r=await db.query('UPDATE customer_addresses SET label=$1,recipient_name=$2,phone=$3,address=$4,city=$5,state=$6,pincode=$7,is_default=$8,updated_at=now() WHERE id=$9 AND user_id=$10 RETURNING *',[clean(b.label)||'Home',clean(b.recipient_name),clean(b.phone),clean(b.address),clean(b.city),clean(b.state),clean(b.pincode),Boolean(b.is_default),id,uid]); if(!r.rows.length)return res.status(404).json({error:'Address not found.'}); return res.json(r.rows[0]);
 }
 const id=clean(b.id); if(!id)return res.status(400).json({error:'Address ID is required.'}); await db.query('DELETE FROM customer_addresses WHERE id=$1 AND user_id=$2',[id,uid]); return res.json({ok:true});
}