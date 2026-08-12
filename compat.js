import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
export const withEnv = (env, fn) => als.run(env, fn);
export const env = () => als.getStore();

function sqliteSql(sql) {
  return String(sql)
    .replace(/::[a-zA-Z_][a-zA-Z0-9_]*(\[\])?/g, '')
    .replace(/\bnow\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\btrue\b/gi, '1')
    .replace(/\bfalse\b/gi, '0')
    .replace(/\bGREATEST\s*\(/gi, 'max(')
    .replace(/\bLEAST\s*\(/gi, 'min(')
    .replace(/\bEXCLUDED\./g, 'excluded.')
    .replace(/\$([0-9]+)/g, (_, n) => '?')
    .replace(/\bON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET/gi, 'ON CONFLICT ($1) DO UPDATE SET');
}

function normalizeRow(row) {
  if (!row) return row;
  const r = {...row};
  if (typeof r.sizes === 'string') {
    try { r.sizes = JSON.parse(r.sizes); } catch {}
  }
  for (const k of ['active','is_default','custom_fit']) if (k in r) r[k] = !!r[k];
  return r;
}

function prepare(sql, params=[]) {
  let s = sqliteSql(sql);
  const values = [];
  // D1/SQLite has no ANY(array) operator. Expand the one form used by the app.
  const any = s.match(/id\s*=\s*ANY\s*\(\?\)/i);
  if (any) {
    const idx = (() => {
      let q = 0;
      for (let i=0;i<s.length;i++) if (s[i] === '?') { if (q++ === 0) return 0; }
      return 0;
    })();
    const arr = Array.isArray(params[idx]) ? params[idx] : [];
    s = s.replace(/id\s*=\s*ANY\s*\(\?\)/i, arr.length ? `id IN (${arr.map(()=>'?').join(',')})` : '1=0');
    for (let i=0;i<params.length;i++) i === idx ? values.push(...arr) : values.push(params[i]);
  } else {
    values.push(...params);
  }
  // JSON/array values are stored as text in D1.
  const cols = (s.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i)?.[1] || '').split(',').map(x=>x.trim());
  const sizeIndex = cols.findIndex(x=>x === 'sizes');
  if (sizeIndex >= 0 && Array.isArray(values[sizeIndex])) values[sizeIndex] = JSON.stringify(values[sizeIndex]);
  for (let i=0;i<values.length;i++) if (typeof values[i] === 'boolean') values[i] = values[i] ? 1 : 0;
  return {s, values};
}

export const db = {
  async query(sql, params=[]) {
    const e = env();
    if (!e?.DB) throw new Error('D1 database binding DB is not configured.');
    const {s, values} = prepare(sql, params);
    const result = await e.DB.prepare(s).bind(...values).all();
    const rows = (result.results || []).map(normalizeRow);
    return { rows, rowCount: result.meta?.changes ?? 0 };
  }
};

export const storage = {
  async put(key, data, contentType='application/octet-stream') {
    const e = env();
    if (!e?.MEDIA) throw new Error('R2 bucket binding MEDIA is not configured.');
    await e.MEDIA.put(key, data, {httpMetadata: {contentType}});
    return `r2://${key}`;
  },
  async get(key) {
    const e = env();
    const obj = await e.MEDIA?.get(key);
    if (!obj) throw new Error('File not found');
    return {buffer: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType || 'application/octet-stream'};
  },
  async del(key) {
    const e = env();
    if (!e?.MEDIA) throw new Error('R2 bucket binding MEDIA is not configured.');
    await e.MEDIA.delete(key);
  }
};

function cookieValue(cookieHeader, name) {
  return (cookieHeader || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1) || '';
}
function b64u(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function fromB64u(s) { const t=s.replace(/-/g,'+').replace(/_/g,'/'); const p='='.repeat((4-t.length%4)%4); const bin=atob(t+p); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }
async function hmac(secret, value) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
}
export async function signSession(payload) {
  const e=env(); const data=b64u(new TextEncoder().encode(JSON.stringify(payload))); const sig=b64u(await hmac(e.AUTH_SECRET || 'change-me',data)); return `${data}.${sig}`;
}
export async function readSession(request) {
  const e=env(); const raw=cookieValue(request.headers.get('Cookie'),'alv_session'); if(!raw) return null;
  const [data,sig]=raw.split('.'); if(!data||!sig) return null;
  const expected=b64u(await hmac(e.AUTH_SECRET || 'change-me',data)); if(expected!==sig) return null;
  try { const p=JSON.parse(new TextDecoder().decode(fromB64u(data))); if(p.exp && p.exp<Date.now()) return null; return p; } catch { return null; }
}
export function sessionCookie(value,maxAge=60*60*24*30) { return `alv_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
export const clearSessionCookie = () => 'alv_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

export async function hashPassword(password, saltBytes=crypto.getRandomValues(new Uint8Array(16))) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:100000,hash:'SHA-256'},key,256);
  return {salt:b64u(saltBytes),hash:b64u(bits)};
}
export async function verifyPassword(password,salt,expected) {
  const s=fromB64u(salt); const x=await hashPassword(password,s); return x.hash===expected;
}

export const auth = {
  async signOut(req,res) { res.setHeader('Set-Cookie', clearSessionCookie()); }
};

export function setProcessEnv() {
  const e=env();
  globalThis.process = globalThis.process || {};
  globalThis.process.env = {
    RAZORPAY_KEY_ID:e.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET:e.RAZORPAY_KEY_SECRET,
    RESEND_API_KEY:e.RESEND_API_KEY
  };
}
