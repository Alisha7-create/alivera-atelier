import { withEnv, readSession, db } from './compat.js';

import account from '../api/account.js';
import addresses from '../api/addresses.js';
import campaigns from '../api/campaigns.js';
import myOrders from '../api/my-orders.js';
import orders from '../api/orders.js';
import payCreate from '../api/payments/create.js';
import payVerify from '../api/payments/verify.js';
import products from '../api/products.js';
import productSlug from '../api/products/[slug].js';
import stories from '../api/stories.js';
import brandLogo from '../api/brand/logo.js';
import adminCampaigns from '../api/admin/campaigns.js';
import adminOrders from '../api/admin/orders.js';
import adminProducts from '../api/admin/products.js';
import adminStories from '../api/admin/stories.js';
import adminStoryUpload from '../api/admin/story-upload.js';
import adminUpload from '../api/admin/upload.js';
import productMedia from '../api/media/product/[id].js';
import productMediaKind from '../api/media/product/[id]/[kind].js';
import authRegister from '../api/auth/register.js';
import authLogin from '../api/auth/login.js';
import authSession from '../api/auth/session.js';
import authLogout from '../api/auth/logout.js';
import storageFile from '../api/storage/[...key].js';
import cleanupStories from '../api/cleanup-stories.js';
import submitStory from '../api/stories/submit.js';

const routes = [
  ['POST','/api/auth/register',authRegister],['POST','/api/auth/login',authLogin],['GET','/api/auth/session',authSession],['POST','/api/auth/logout',authLogout],
  ['GET','/api/brand/logo',brandLogo],['GET','/api/products',products],['GET','/api/stories',stories],['POST','/api/stories/submit',submitStory],['GET','/api/campaigns',campaigns],
  ['GET','/api/my-orders',myOrders],['GET','/api/account',account],['PUT','/api/account',account],['DELETE','/api/account',account],
  ['GET','/api/addresses',addresses],['POST','/api/addresses',addresses],['PUT','/api/addresses',addresses],['DELETE','/api/addresses',addresses],
  ['POST','/api/orders',orders],['POST','/api/payments/create',payCreate],['POST','/api/payments/verify',payVerify],
  ['GET','/api/admin/products',adminProducts],['POST','/api/admin/products',adminProducts],['PUT','/api/admin/products',adminProducts],['DELETE','/api/admin/products',adminProducts],
  ['GET','/api/admin/orders',adminOrders],['PUT','/api/admin/orders',adminOrders],
  ['GET','/api/admin/stories',adminStories],['POST','/api/admin/stories',adminStories],['PUT','/api/admin/stories',adminStories],['DELETE','/api/admin/stories',adminStories],
  ['GET','/api/admin/campaigns',adminCampaigns],['POST','/api/admin/campaigns',adminCampaigns],['PUT','/api/admin/campaigns',adminCampaigns],['DELETE','/api/admin/campaigns',adminCampaigns],
  ['POST','/api/admin/upload',adminUpload],['POST','/api/admin/story-upload',adminStoryUpload],
  ['POST','/api/cleanup-stories',cleanupStories],
  ['GET','/api/media/product/:id',productMedia],['GET','/api/media/product/:id/:kind',productMediaKind],
];

function matchPath(pattern,path){
  const pp=pattern.split('/').filter(Boolean), xp=path.split('/').filter(Boolean); if(pp.length!==xp.length)return null;
  const params={}; for(let i=0;i<pp.length;i++){if(pp[i].startsWith(':'))params[pp[i].slice(1)]=decodeURIComponent(xp[i]); else if(pp[i]!==xp[i])return null;} return params;
}
function findRoute(method,path){
  for(const [m,p,h] of routes) if(m===method){const params=matchPath(p,path);if(params)return {handler:h,params};}
  if(method==='GET' && path.startsWith('/api/storage/')) return {handler:storageFile,params:{key:path.slice('/api/storage/'.length)}};
  if(method==='GET' && path.startsWith('/api/products/')) return {handler:productSlug,params:{slug:decodeURIComponent(path.slice('/api/products/'.length))}};
  return null;
}

function makeResponse(){
  let status=200, headers=new Headers();
  const out={
    statusCode:()=>status,
    setHeader(k,v){headers.set(k,String(v));},
    status(n){status=n;return out;},
    json(obj){return new Response(JSON.stringify(obj),{status,headers:new Headers([...headers, ['Content-Type','application/json; charset=utf-8']])});},
    send(body){return new Response(body,{status,headers});}
  }; return out;
}

async function parseRequestBody(request){
  const ct=request.headers.get('content-type')||'';
  if(ct.includes('application/json')) return await request.json().catch(()=>({}));
  if(ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')){
    const fd=await request.formData(); const body={}; const files=[];
    for(const [k,v] of fd.entries()){
      if(typeof v==='string') body[k]=v;
      else if(v && typeof v.arrayBuffer==='function') files.push({fieldname:k,filename:v.name,contentType:v.type,buffer:new Uint8Array(await v.arrayBuffer())});
    }
    return {__form:true,body,files};
  }
  return {};
}

async function getUser(request){
  const session=await readSession(request); if(!session?.id)return null;
  const r=await db.query('SELECT id,email,name,active FROM users WHERE id=$1 LIMIT 1',[session.id]);
  const u=r.rows[0]; return u&&u.active?u:null;
}
function isAdmin(user,env){
  if(!user)return false; const list=String(env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean); return list.includes(String(user.email).toLowerCase());
}

async function dispatch(request, env){
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,'')||'/';
  const route=findRoute(request.method,path);
  if(route){
    const user=await getUser(request);
    const access=route.handler.access||'public';
    if(access==='user' && !user) return new Response(JSON.stringify({error:'Please sign in first.'}),{status:401,headers:{'Content-Type':'application/json'}});
    if(access==='admin' && !isAdmin(user,env)) return new Response(JSON.stringify({error:'Owner access required.'}),{status:403,headers:{'Content-Type':'application/json'}});
    if(route.handler.methods && !route.handler.methods.includes(request.method)) return new Response('Method not allowed',{status:405});
    const parsed=await parseRequestBody(request);
    const req={method:request.method,headers:Object.fromEntries(request.headers.entries()),body:parsed.__form?parsed.body:parsed,files:parsed.__form?parsed.files:[],params:route.params,user,member:user,query:Object.fromEntries(url.searchParams.entries()),env};
    const res=makeResponse();
    try { const result=await route.handler(req,res); return result instanceof Response?result:res.json(result??{ok:true}); }
    catch(e){ console.error(e); return res.status(500).json({error:e?.message||'Server error.'}); }
  }
  if(env.ASSETS){
    let assetPath=path;
    if(path==='/account')assetPath='/account.html';
    if(path==='/login')assetPath='/login.html';
    if(path==='/admin' || path==='/admin/')assetPath='/admin/index.html';
    const assetReq=new Request(new URL(assetPath,request.url),request);
    const r=await env.ASSETS.fetch(assetReq);
    if(r.status!==404)return r;
    return env.ASSETS.fetch(request);
  }
  return new Response('Not found',{status:404});
}

export default {
  async fetch(request,env,ctx){
    return withEnv(env,()=>dispatch(request,env));
  },
  async scheduled(event,env,ctx){
    return withEnv(env, async ()=>{
      const req = {
        method:'POST',
        headers:{'x-hatchable-trigger':'cron'},
        body:{},
        files:[],
        params:{},
        user:null,
        member:null,
        query:{}
      };
      const res = makeResponse();
      try {
        const result = await cleanupStories(req,res);
        return result instanceof Response ? result : res.json(result ?? {ok:true});
      } catch(e) {
        console.error(e);
        return res.status(500).json({error:e?.message||'Story cleanup failed.'});
      }
    });
  }
};
