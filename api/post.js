export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { title, description, governorate, pageId, accessToken } = req.body;

  if (!title || !description || !governorate || !pageId || !accessToken) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    // Search for groups using Facebook Graph API
    const searchUrl = `https://graph.facebook.com/v19.0/search?q=${encodeURIComponent(governorate + ' jobs')}&type=group&access_token=${accessToken}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (searchData.error) {
      return res.status(400).json({ 
        success: false, 
        message: 'خطأ في الوصول لفيسبوك: ' + searchData.error.message 
      });
    }

    const groups = searchData.data || [];

    if (groups.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'لم يتم العثور على مجموعات' 
      });
    }

    // Post to each group
    let postedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const group of groups) {
      try {
        const postUrl = `https://graph.facebook.com/v19.0/${group.id}/feed`;
        const postResponse = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `📢 ${title}\n\n${description}`,
            access_token: accessToken
          })
        });

        const postResult = await postResponse.json();

        if (postResult.id) {
          postedCount++;
        } else {
          failedCount++;
          errors.push(postResult.error?.message || 'Unknown error');
        }
      } catch (e) {
        failedCount++;
        errors.push(e.message);
      }

      // Delay between posts (1 second for API)
      await new Promise(r => setTimeout(r, 1000));
    }

    return res.status(200).json({
      success: true,
      posted: postedCount,
      failed: failedCount,
      total: groups.length,
      errors: errors.slice(0, 5) // Return first 5 errors
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'خطأ في الخادم: ' + error.message 
    });
  }
}
