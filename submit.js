import { db, storage } from '../../src/compat.js';
import { moderateStoryImage, moderateStoryCaption } from '../../lib/story-moderation.js';

export const access = 'user';
export const methods = ['POST'];

const site = req => `https://${req.headers.host}`;

export default async function(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Please sign in first.' });
  const file = (req.files || [])[0];
  if (!file) return res.status(400).json({ error: 'Please choose a photo for your story.' });
  if (!String(file.contentType || '').startsWith('image/')) return res.status(400).json({ error: 'Please upload an image file.' });
  if (file.buffer.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Please keep your story photo under 4MB.' });

  try {
    const [imageSafe, captionSafe] = await Promise.all([
      moderateStoryImage(file.buffer, file.contentType),
      moderateStoryCaption(req.body?.caption || '')
    ]);
    if (!imageSafe || !captionSafe) {
      return res.status(422).json({
        error: 'Your story was removed because it does not meet Alivèra Atelier’s community guidelines.',
        warning: 'Please upload a respectful fashion photo and caption. Explicit, nude, violent, hateful, or otherwise inappropriate content is not allowed.'
      });
    }
  } catch (e) {
    console.error('Story moderation failed', e);
    return res.status(503).json({ error: 'We could not safely check this story right now. Please try again in a moment.' });
  }

  const key = `stories/${Date.now()}-${String(file.filename || 'story').replace(/[^a-zA-Z0-9._-]/g,'-')}`;
  await storage.put(key, file.buffer, file.contentType);
  const imageUrl = `${site(req)}/api/storage/${encodeURIComponent(key)}`;
  const productId = String(req.body?.product_id || '').trim();
  let productName = String(req.body?.product_name || '').trim();
  if (productId) {
    const p = await db.query('SELECT name FROM products WHERE id=$1 LIMIT 1', [productId]);
    if (p.rows[0]) productName = p.rows[0].name;
  }
  const { rows } = await db.query(
    'INSERT INTO customer_stories (image_url,customer_name,caption,product_name,active) VALUES ($1,$2,$3,$4,$5) RETURNING id,customer_name,caption,product_name,created_at',
    [imageUrl, user.name || user.email.split('@')[0], String(req.body?.caption || '').slice(0,500), productName, true]
  );
  res.json({ ok: true, story: rows[0], message: 'Your Alivèra story is live for 24 hours.' });
}
