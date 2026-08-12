import { db, storage } from '../src/compat.js';

const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export async function emailAssets(items, req){
  const base=`https://${req.headers.host||'aliveraatelier.in'}`;
  const attachments=[];
  try{
    const logo=await fetch(`${base}/api/brand/logo`);
    if(logo.ok){const bytes=Buffer.from(await logo.arrayBuffer());attachments.push({filename:'alivera-logo.jpg',content:bytes.toString('base64'),content_type:'image/jpeg',content_id:'alivera-logo'});}
  }catch{}
  const cards=[];
  for(let n=0;n<items.length;n++){
    const x=items[n], cid=`product-${n}`;
    let src='';
    try{
      const {rows}=await db.query('SELECT image_url FROM products WHERE id=$1 LIMIT 1',[x.product_id||x.p?.id]);
      const url=rows[0]?.image_url;
      const key=url&&String(url).startsWith('r2://') ? String(url).slice(5) : null;
      if(key){const file=await storage.get(key);attachments.push({filename:`product-${n}.jpg`,content:Buffer.from(file.buffer).toString('base64'),content_type:file.contentType||'image/jpeg',content_id:cid});src=`cid:${cid}`;}
      else if(url&&/^https?:\/\//i.test(String(url))){const img=await fetch(String(url));if(img.ok){const type=img.headers.get('content-type')||'image/jpeg';const bytes=Buffer.from(await img.arrayBuffer());attachments.push({filename:`product-${n}.jpg`,content:bytes.toString('base64'),content_type:type,content_id:cid});src=`cid:${cid}`;}}
    }catch{}
    cards.push(`<div style="display:flex;gap:16px;padding:15px 0;border-bottom:1px solid #eee4dc">${src?`<img src="${src}" alt="${esc(x.product_name||x.p?.name)}" width="88" height="112" style="object-fit:cover;background:#f4eee8;border-radius:4px">`:''}<div style="flex:1"><div style="font-family:Georgia,serif;font-size:17px">${esc(x.product_name||x.p?.name)}</div><div style="font-size:12px;color:#746b73;margin-top:5px">Size: ${esc(x.size||'Standard')}${x.custom_fit?' · Custom fit':''} · Qty ${x.quantity||x.qty}</div><div style="margin-top:9px;font-weight:700">₹${Number(x.line_total??x.line).toFixed(0)}</div></div></div>`);
  }
  return {base,attachments,cards:cards.join('')};
}

export function shell(body){return `<div style="margin:0;background:#f7f1eb;padding:34px 14px;font-family:Arial,sans-serif;color:#241f26"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e7ddd4"><div style="text-align:center;padding:26px 20px 18px;border-bottom:1px solid #eee4dc"><img src="cid:alivera-logo" alt="Alivèra Atelier" width="86" height="86" style="border-radius:50%;display:block;margin:0 auto 10px"><div style="font-family:Georgia,serif;letter-spacing:6px;font-size:20px">ALIVÈRA</div><div style="font-size:10px;letter-spacing:5px;margin-top:5px;color:#7e6c7e">ATELIER</div></div><div style="padding:30px 28px">${body}</div><div style="padding:18px 28px;border-top:1px solid #eee4dc;text-align:center;color:#7c7179;font-size:11px;letter-spacing:1px">BEAUTIFUL, JUST THE WAY YOU ARE. ♥</div></div></div>`}

export async function sendResend(to,subject,html,attachments=[]){
  const key=env().RESEND_API_KEY;
  if(!key) throw new Error('RESEND_API_KEY is not configured');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from:'Alivèra Atelier <contact@aliveraatelier.in>',to:[to],reply_to:['contact@aliveraatelier.in'],subject,html,attachments})});
  const text=await r.text();
  if(!r.ok)throw new Error(`Resend ${r.status}: ${text}`);
  return JSON.parse(text);
}