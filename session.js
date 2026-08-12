export const access='public'; export const methods=['GET'];
export default async function(req,res){ res.json({user:req.user||null}); }
