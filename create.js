import { db } from '../../src/compat.js';
export const access='public';
export const methods=['POST'];
const clean=v=>String(v??'').trim();
async function quote(b){
 const items=Array.isArray(b.items)?b.items:[];if(!items.length)throw new Error('Your bag is empty.');
 const name=clean(b.customer_name),mail=clean(b.email).toLowerCase(),phone=clean(b.phone),address=clean(b.address),city=clean(b.city),state=clean(b.state),pincode=clean(b.pincode);
 if(!name||!mail||!phone||!address||!city||!state||!pincode)throw new Error('Please complete all delivery details.');
 const ids=[...new Set(items.map(x=>x.product_id).filter(Boolean))];if(!ids.length)throw new Error('Invalid bag.');
 const {rows:products}=await db.query('SELECT id,name,price,stock,active FROM products WHERE id = ANY($1::uuid[])',[ids]);const byId=new Map(products.map(p=>[String(p.id),p]));let subtotal=0;const checked=[];
 for(const item of items){const p=byId.get(String(item.product_id));const qty=Math.max(1,Math.min(10,Number(item.quantity)||1));if(!p||!p.active)throw new Error('A product in your bag is unavailable.');if(Number(p.stock)>0&&Number(p.stock)<qty)throw new Error(`Only ${p.stock} available for ${p.name}.`);const size=clean(item.size);const line=Number(p.price)*qty;subtotal+=line;checked.push({p,qty,size,customFit:!!item.custom_fit,line});}
 const promoCode=clean(b.promo_code).toUpperCase();let discount=0,campaign=null;
 if(promoCode){const {rows}=await db.query("SELECT * FROM campaigns WHERE code=$1 AND active=true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()) AND (max_uses IS NULL OR used_count < max_uses) LIMIT 1",[promoCode]);campaign=rows[0];if(!campaign)throw new Error('That discount code is not active or has expired.');if(subtotal<Number(campaign.min_subtotal||0))throw new Error(`This code requires a minimum order of ₹${Number(campaign.min_subtotal).toFixed(0)}.`);if(campaign.max_uses_per_customer){const {rows:uc}=await db.query("SELECT COUNT(*)::int AS count FROM orders WHERE lower(email)=lower($1) AND upper(coalesce(promo_code,''))=$2 AND payment_status IN ('paid','pending')",[mail,promoCode]);if(Number(uc[0].count)>=Number(campaign.max_uses_per_customer))throw new Error('This discount has reached its limit for this customer.');}discount=campaign.discount_type==='fixed'?Math.min(subtotal,Number(campaign.discount_value)):Math.min(subtotal,subtotal*Number(campaign.discount_value)/100);}
 const shipping=49,total=Math.max(0,subtotal-discount+shipping);return {name,mail,phone,address,city,state,pincode,subtotal,discount,shipping,total,promoCode,campaign,checked};
}
export default async function(req,res){
 try{
  if(!env().RAZORPAY_KEY_ID||!env().RAZORPAY_KEY_SECRET)return res.status(503).json({error:'Online payment is not configured yet. Add the Razorpay Key ID and Key Secret in the project setup.'});
  const b=req.body||{},q=await quote(b),user=req.member,orderNumber='ALV-'+Date.now().toString(36).toUpperCase();
  const r=await db.query("INSERT INTO orders (order_number,user_id,customer_name,email,phone,address,city,state,pincode,notes,subtotal,shipping,total,payment_method,payment_status,status,promo_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'online','pending','payment_pending',$14) RETURNING id,order_number,total",[orderNumber,user?.id||null,q.name,q.mail,q.phone,q.address,q.city,q.state,q.pincode,clean(b.notes),q.subtotal,q.shipping,q.total,q.promoCode]);
  const order=r.rows[0];
  for(const x of q.checked)await db.query("INSERT INTO order_items (order_id,product_id,product_name,size,quantity,unit_price,line_total,custom_fit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",[order.id,x.p.id,x.p.name,x.size,x.qty,x.p.price,x.line,x.customFit]);
  const authHeader=btoa(`${env().RAZORPAY_KEY_ID}:${env().RAZORPAY_KEY_SECRET}`);
  const rr=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:`Basic ${authHeader}`,'Content-Type':'application/json'},body:JSON.stringify({amount:Math.round(q.total*100),currency:'INR',receipt:order.order_number,notes:{order_number:order.order_number},capture:'automatic'})});
  const paymentOrder=await rr.json();if(!rr.ok)throw new Error(paymentOrder.error?.description||'Could not create the online payment.');
  await db.query('UPDATE orders SET payment_order_id=$1 WHERE id=$2',[paymentOrder.id,order.id]);
  res.json({ok:true,key_id:env().RAZORPAY_KEY_ID,razorpay_order_id:paymentOrder.id,db_order_id:order.id,amount:paymentOrder.amount,currency:paymentOrder.currency,order:order.order_number,total:q.total,logo_url:`https://${req.headers.host||'aliveraatelier.in'}/api/brand/logo`});
 }catch(e){res.status(400).json({error:e.message||'Could not start payment.'});}
}