import { clearSessionCookie } from '../../src/compat.js';
export const access='public'; export const methods=['POST'];
export default async function(req,res){res.setHeader('Set-Cookie',clearSessionCookie());res.json({ok:true});}
