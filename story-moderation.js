import { env } from '../src/compat.js';

function toBase64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

export async function moderateStoryImage(buffer, contentType) {
  const e = env();
  if (!e?.AI) throw new Error('Story moderation is not configured yet.');
  const image = `data:${contentType};base64,${toBase64(buffer)}`;
  const result = await e.AI.run('@cf/moondream/moondream3.1-9B-A2B', {
    task: 'query',
    image,
    question: 'For a public fashion customer story, is this image clearly inappropriate? Allow normal fashion photography, dresses, swimwear, sleeveless clothing, cleavage that is not explicit, and ordinary posing. Mark UNSAFE only if it clearly contains nudity, exposed genitals or breasts, sexual activity, sexually explicit content, graphic gore, extreme violence, or hateful extremist imagery. Reply with exactly SAFE or UNSAFE.',
    reasoning: false,
    temperature: 0,
    max_tokens: 8,
    stream: false
  });
  const answer = String(result?.answer || result?.response || '').trim().toUpperCase();
  if (!answer) throw new Error('Story moderation returned no decision.');
  return !answer.includes('UNSAFE');
}

export async function moderateStoryCaption(caption) {
  const text = String(caption || '').trim();
  if (!text) return true;
  const e = env();
  if (!e?.AI) throw new Error('Story moderation is not configured yet.');
  const result = await e.AI.run('@cf/meta/llama-guard-3-8b', {
    messages: [
      { role: 'system', content: 'Classify whether this customer story caption is safe for a fashion brand website. Block sexual content, sexual exploitation, graphic violence, hate, threats, self-harm encouragement, criminal instructions, or doxxing/private personal information. Normal fashion, compliments, styling comments, and ordinary language are safe.' },
      { role: 'user', content: text }
    ],
    max_tokens: 32,
    temperature: 0
  });
  const answer = String(result?.response || result?.answer || '').toLowerCase();
  return !answer.startsWith('unsafe');
}
