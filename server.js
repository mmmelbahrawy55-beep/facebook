const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

let browser = null;
let page = null;
let isLoggedIn = false;

// Facebook Login
app.post('/api/login', async (req, res) => {
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--window-size=1280,720']
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });

    // Wait for user to login (check for profile elements)
    await page.waitForFunction(
      () => {
        return document.querySelector('[aria-label="Your profile"]') ||
               document.querySelector('[data-testid="bluebar-profile-picture"]') ||
               document.querySelector('svg[aria-label="Your profile"]') ||
               (document.querySelector('[role="navigation"]') && !window.location.href.includes('login'));
      },
      { timeout: 300000 }
    );

    isLoggedIn = true;
    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح' });
  } catch (error) {
    res.json({ success: false, message: 'فشل تسجيل الدخول: ' + error.message });
  }
});

// Check login status
app.get('/api/status', (req, res) => {
  res.json({ loggedIn: isLoggedIn });
});

// Logout
app.post('/api/logout', async (req, res) => {
  try {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
      isLoggedIn = false;
    }
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Post to Facebook groups
app.post('/api/post', async (req, res) => {
  const { title, description, governorate } = req.body;

  if (!isLoggedIn || !page) {
    return res.json({ success: false, message: 'يجب تسجيل الدخول أولاً' });
  }

  try {
    // Search for groups
    const searchTerms = [
      `${governorate} وظائف`,
      `${governorate} توظيف`,
      `وظائف ${governorate}`
    ];

    let allGroups = [];

    for (const term of searchTerms) {
      await page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(term)}`, {
        waitUntil: 'networkidle2'
      });
      await new Promise(r => setTimeout(r, 3000));

      const groups = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a[href*="/groups/"]').forEach(el => {
          const href = el.href;
          if (href.includes('/groups/') && !href.includes('search') && !href.includes('browse')) {
            const name = el.textContent?.trim();
            if (name && !links.some(g => g.url === href)) {
              links.push({ name, url: href });
            }
          }
        });
        return links;
      });

      allGroups.push(...groups);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Remove duplicates
    const uniqueGroups = allGroups.filter((g, i, self) =>
      i === self.findIndex(x => x.url === g.url)
    );

    if (uniqueGroups.length === 0) {
      return res.json({ success: false, message: 'لم يتم العثور على مجموعات' });
    }

    // Start posting
    res.json({ success: true, message: `تم العثور على ${uniqueGroups.length} مجموعة. جاري النشر...`, total: uniqueGroups.length });

    // Post to each group
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uniqueGroups.length; i++) {
      const group = uniqueGroups[i];
      try {
        await page.goto(group.url, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));

        // Click write area
        const writeArea = await page.$('[aria-label="Write something..."], [data-testid="status-attachment-mention-input"]');
        if (writeArea) {
          await writeArea.click();
          await new Promise(r => setTimeout(r, 1000));
        }

        // Wait for dialog
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
        await new Promise(r => setTimeout(r, 1000));

        // Type content
        const contentEditable = await page.$('[role="dialog"] [contenteditable="true"]');
        if (contentEditable) {
          await contentEditable.click();
          await page.keyboard.type(`📢 ${title}\n\n${description}`, { delay: 10 });
        }

        await new Promise(r => setTimeout(r, 1000));

        // Click post
        const postBtn = await page.$('[role="dialog"] [aria-label="Post"], [role="dialog"] button[aria-label*="Post"]');
        if (postBtn) {
          await postBtn.click();
          await new Promise(r => setTimeout(r, 3000));
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
      }

      // Wait between posts
      if (i < uniqueGroups.length - 1) {
        await new Promise(r => setTimeout(r, 60000)); // 60 seconds
      }
    }

    console.log(`اكتمل النشر: ${successCount} نجح, ${failCount} فشل`);

  } catch (error) {
    console.error('خطأ في النشر:', error);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 التطبيق يعمل على http://localhost:${PORT}`);
});
