import { db, auth } from '../src/compat.js';
export const access='user';
export const methods=['GET','PUT','DELETE'];
export default async function(req,res){
 const user=req.user;
 if(req.method==='GET'){
  const {rows:p}=await db.query('SELECT phone FROM customer_profiles WHERE user_id=$1',[user.id]);
  const {rows:a}=await db.query('SELECT id,label,recipient_name,phone,address,city,state,pincode,is_default FROM customer_addresses WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC',[user.id]);
  return res.json({user:{email:user.email,name:user.name||''},profile:p[0]||{phone:''},addresses:a});
 }
 if(req.method==='PUT'){
  const b=req.body||{}; const phone=String(b.phone||'').trim();
  await db.query("INSERT INTO customer_profiles (user_id,phone,updated_at) VALUES ($1,$2,now()) ON CONFLICT (user_id) DO UPDATE SET phone=EXCLUDED.phone,updated_at=now()",[user.id,phone]);
  return res.json({ok:true});
 }
 if(req.method==='DELETE'){
  const b=req.body||{}; if(String(b.confirm||'').toUpperCase()!=='DELETE') return res.status(400).json({error:'Type DELETE to confirm account deactivation.'});
  await db.query('DELETE FROM customer_addresses WHERE user_id=$1',[user.id]);
  await db.query('DELETE FROM customer_profiles WHERE user_id=$1',[user.id]);
  await db.query('UPDATE orders SET user_id=NULL WHERE user_id=$1',[user.id]);
  await auth.signOut(req,res);
  return res.json({ok:true});
 }
}