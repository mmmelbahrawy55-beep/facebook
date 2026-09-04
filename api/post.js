import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, description, governorate, accessToken } = req.body;

    if (!title || !description || !governorate || !accessToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user info
    const userRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}`);
    const user = await userRes.json();

    if (user.error) {
      return res.status(400).json({ error: 'Invalid access token' });
    }

    // Search for groups
    const searchUrl = `https://graph.facebook.com/v19.0/search?q=${encodeURIComponent(governorate + ' jobs')}&type=group&access_token=${accessToken}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      return res.status(400).json({ error: searchData.error.message });
    }

    const groups = searchData.data || [];

    if (groups.length === 0) {
      return res.status(404).json({ error: 'لم يتم العثور على مجموعات' });
    }

    // Post to groups
    let posted = 0;
    let failed = 0;

    for (const group of groups.slice(0, 5)) {
      try {
        const postRes = await fetch(`https://graph.facebook.com/v19.0/${group.id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `📢 ${title}\n\n${description}`,
            access_token: accessToken
          })
        });
        const result = await postRes.json();
        if (result.id) posted++;
        else failed++;
      } catch (e) {
        failed++;
      }
    }

    // Save to Redis
    await redis.lpush('posts', JSON.stringify({
      user: user.name,
      title,
      governorate,
      posted,
      failed,
      date: new Date().toISOString()
    }));

    return res.status(200).json({ posted, failed, total: groups.length });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
