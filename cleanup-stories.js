import { db, storage } from '../src/compat.js';

export const access = 'scheduler';
export const schedule = '*/15 * * * *';

function storageKeyFromUrl(url) {
  try {
    const u = new URL(url);
    const prefix = '/api/storage/';
    if (!u.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(u.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

export default async function(req,res){
  const { rows } = await db.query(
    "SELECT id,image_url FROM customer_stories WHERE datetime(created_at) <= datetime('now','-24 hours')"
  );

  let deleted = 0;
  let mediaDeleted = 0;

  for (const story of rows) {
    const key = storageKeyFromUrl(story.image_url);
    if (key) {
      try {
        await storage.del(key);
        mediaDeleted++;
      } catch (e) {
        console.error('Could not delete story media', key, e);
      }
    }

    await db.query("DELETE FROM customer_stories WHERE id=$1", [story.id]);
    deleted++;
  }

  res.json({ ok:true, deleted, mediaDeleted });
}
