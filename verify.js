import { db } from '../../src/compat.js';
import { emailAssets, shell, sendResend } from '../../lib/order-email.js';
export const access='public';
export const methods=['POST'];
const clean=v=>String(v??'').trim();
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function safeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
const legacyShell=null;
export default async function(req,res){
 try{
  const b=req.body||{},dbOrderId=clean(b.db_order_id),paymentId=clean(b.razorpay_payment_id),paymentOrderId=clean(b.razorpay_order_id),signature=clean(b.razorpay_signature);
  if(!dbOrderId||!paymentId||!paymentOrderId||!signature)return res.status(400).json({error:'Incomplete payment verification.'});
  const {rows}=await db.query('SELECT * FROM orders WHERE id=$1 LIMIT 1',[dbOrderId]);const order=rows[0];
  if(!order||order.payment_order_id!==paymentOrderId)return res.status(400).json({error:'Payment order could not be matched.'});
  if(order.payment_status==='paid')return res.json({ok:true,order:order.order_number,total:order.total});
  const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env().RAZORPAY_KEY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(`${order.payment_order_id}|${paymentId}`));
  const expected=[...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(!safeEqual(expected,signature))return res.status(400).json({error:'Payment verification failed.'});
  await db.query("UPDATE orders SET payment_id=$1,payment_signature=$2,payment_status='paid',status='placed' WHERE id=$3 AND payment_status <> 'paid'",[paymentId,signature,order.id]);
  const {rows:items}=await db.query('SELECT * FROM order_items WHERE order_id=$1',[order.id]);
  for(const x of items)await db.query('UPDATE products SET stock=GREATEST(stock-$1,0),updated_at=now() WHERE id=$2 AND stock>0',[x.quantity,x.product_id]);
  if(order.promo_code)await db.query("UPDATE campaigns SET used_count=used_count+1,updated_at=now() WHERE code=$1 AND used_count < COALESCE(max_uses,2147483647)",[order.promo_code]);
  const assets=await emailAssets(items,req),cards=assets.cards;
  const body=`<p style="font-size:11px;letter-spacing:2px;color:#846f8a">PAYMENT RECEIVED</p><h1 style="font:500 30px Georgia,serif;margin:5px 0 12px">Thank you, ${esc(order.customer_name)}.</h1><p>Your online payment for order <b>${esc(order.order_number)}</b> has been received. Your order is now placed and awaiting owner confirmation.</p>${cards}<div style="background:#fbf7f3;padding:18px;margin-top:22px;line-height:1.8">Subtotal: ₹${Number(order.subtotal).toFixed(0)}<br>${order.promo_code?`Discount (${esc(order.promo_code)})<br>`:''}Shipping: ₹${Number(order.shipping).toFixed(0)}<br><b style="font-size:17px">Total paid: ₹${Number(order.total).toFixed(0)}</b></div><div style="margin-top:22px;padding:16px;border:1px solid #e8ddd4"><b>Deliver to</b><br>${esc(order.address)}, ${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}<br>${esc(order.phone)}</div>`;
  const ownerBody=`<p style="font-size:11px;letter-spacing:2px;color:#846f8a">NEW PAID ORDER · ACTION REQUIRED</p><h1 style="font:500 30px Georgia,serif;margin:5px 0 12px">${esc(order.order_number)}</h1><p><b>${esc(order.customer_name)}</b><br>${esc(order.email)} · ${esc(order.phone)}<br>${esc(order.address)}, ${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}</p>${cards}<div style="background:#fbf7f3;padding:18px;margin-top:22px;line-height:1.8">Subtotal: ₹${Number(order.subtotal).toFixed(0)}<br>${order.promo_code?`Discount (${esc(order.promo_code)})<br>`:''}Shipping: ₹${Number(order.shipping).toFixed(0)}<br><b style="font-size:17px">Total paid: ₹${Number(order.total).toFixed(0)}</b></div><p>Razorpay payment ID: ${esc(paymentId)}</p>`;
  try{await sendResend('contact@aliveraatelier.in',`NEW PAID Alivèra Atelier order ${order.order_number}`,shell(ownerBody),assets.attachments);}catch(e){console.log('Owner email failed',e?.message)}
  try{await sendResend(order.email,`Payment received · ${order.order_number} · Alivèra Atelier`,shell(body),assets.attachments);}catch(e){console.log('Customer email failed',e?.message)}
  res.json({ok:true,order:order.order_number,total:order.total});
 }catch(e){res.status(400).json({error:e.message||'Payment verification failed.'});}
}