import { db, hashPassword, signSession, sessionCookie } from '../../src/compat.js';
export const access='public'; export const methods=['POST'];
export default async function(req,res){
  const b=req.body||{}, email=String(b.email||'').trim().toLowerCase(), password=String(b.password||''), name=String(b.name||'').trim();
  if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return res.status(400).json({error:'Enter a valid email and a password of at least 8 characters.'});
  const existing=await db.query('SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1',[email]);
  if(existing.rows.length)return res.status(409).json({error:'An account with this email already exists.'});
  const hp=await hashPassword(password);
  const r=await db.query('INSERT INTO users (email,name,password_salt,password_hash) VALUES ($1,$2,$3,$4) RETURNING id,email,name,active',[email,name,hp.salt,hp.hash]);
  const u=r.rows[0], token=await signSession({id:u.id,email:u.email,name:u.name,exp:Date.now()+30*24*60*60*1000});
  res.setHeader('Set-Cookie',sessionCookie(token)); res.json({ok:true,user:{id:u.id,email:u.email,name:u.name}});
}
