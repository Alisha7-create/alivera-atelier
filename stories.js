import { db } from '../src/compat.js';
export const access = 'public';
export const methods = ['GET'];

// Stories behave like Instagram stories: they are public for 24 hours
// from publication/creation, then are no longer returned.
export default async function(req,res){
  const {rows}=await db.query(
    "SELECT id,image_url,customer_name,caption,product_name,created_at FROM customer_stories WHERE active = true AND datetime(created_at) > datetime('now','-24 hours') ORDER BY created_at DESC LIMIT 30"
  );
  res.json(rows);
}
