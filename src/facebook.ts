import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';

export class FacebookAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private loggedIn: boolean = false;
  private cookiesPath = path.join(__dirname, '../data/facebook-cookies.json');

  constructor() {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async login(): Promise<void> {
    try {
      // Launch browser
      this.browser = await puppeteer.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--window-size=1280,720'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Set viewport
      await this.page.setViewport({ width: 1280, height: 720 });

      // Navigate to Facebook
      await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });

      // Check if we have saved cookies
      if (fs.existsSync(this.cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf-8'));
        await this.page.setCookie(...cookies);
        await this.page.reload({ waitUntil: 'networkidle2' });
      }

      // Wait for user to login manually
      console.log('🔐 Please login to Facebook in the browser window...');
      console.log('⏳ Waiting for login...');

      // Wait for login to complete (check for profile icon or home page)
      await this.page.waitForFunction(
        () => {
          // Check if logged in by looking for common elements
          return document.querySelector('[aria-label="Your profile"]') ||
                 document.querySelector('[data-testid="bluebar-profile-picture"]') ||
                 document.querySelector('svg[aria-label="Your profile"]') ||
                 window.location.href.includes('facebook.com') && !window.location.href.includes('login');
        },
        { timeout: 300000 } // 5 minutes timeout
      );

      console.log('✅ Facebook login successful!');

      // Save cookies for future sessions
      const cookies = await this.page.cookies();
      fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));

      this.loggedIn = true;
    } catch (error) {
      console.error('❌ Login failed:', error);
      throw error;
    }
  }

  isLoggedIn(): boolean {
    return this.loggedIn && this.browser !== null;
  }

  async discoverGroups(governorateName: string): Promise<Array<{ name: string; url: string }>> {
    if (!this.page) {
      throw new Error('Not logged in');
    }

    const groups: Array<{ name: string; url: string }> = [];

    try {
      // Search for groups related to the governorate
      const searchQueries = [
        `${governorateName} وظائف`,
        `${governorateName} توظيف`,
        `${governorateName} jobs`,
        `وظائف ${governorateName}`,
        `توظيف ${governorateName}`
      ];

      for (const query of searchQueries) {
        console.log(`🔍 Searching for: ${query}`);
        
        // Go to Facebook search
        await this.page.goto(`https://www.facebook.com/search/groups/?q=${encodeURIComponent(query)}`, {
          waitUntil: 'networkidle2'
        });

        // Wait for results to load
        await this.page.waitForSelector('[role="feed"], [role="list"]', { timeout: 10000 }).catch(() => null);
        
        // Wait a bit for dynamic content
        await this.delay(2000);

        // Extract group links
        const groupLinks = await this.page.evaluate(() => {
          const links: Array<{ name: string; url: string }> = [];
          const groupElements = document.querySelectorAll('[role="feed"] a[href*="/groups/"], [role="list"] a[href*="/groups/"]');
          
          groupElements.forEach((el) => {
            const link = el as HTMLAnchorElement;
            const href = link.href;
            
            // Filter for actual group pages (not search results or other links)
            if (href.includes('/groups/') && !href.includes('search') && !href.includes('browse')) {
              const name = link.textContent?.trim() || '';
              if (name && !links.some(g => g.url === href)) {
                links.push({ name, url: href });
              }
            }
          });
          
          return links;
        });

        groups.push(...groupLinks);
        
        // Delay between searches to avoid rate limiting
        await this.delay(3000);
      }

      // Remove duplicates
      const uniqueGroups = groups.filter((group, index, self) =>
        index === self.findIndex(g => g.url === group.url)
      );

      console.log(`✅ Found ${uniqueGroups.length} groups for ${governorateName}`);
      return uniqueGroups;
    } catch (error) {
      console.error('❌ Error discovering groups:', error);
      throw error;
    }
  }

  async postToGroup(
    groupUrl: string,
    title: string,
    description: string,
    imagePath?: string
  ): Promise<void> {
    if (!this.page) {
      throw new Error('Not logged in');
    }

    try {
      // Navigate to group
      await this.page.goto(groupUrl, { waitUntil: 'networkidle2' });
      await this.delay(2000);

      // Click on "Write something..." or post creation area
      const postButton = await this.page.waitForSelector(
        '[aria-label="Write something..."], [data-testid="status-attachment-mention-input"], [role="button"][aria-label*="Write"], [role="button"][aria-label*="write"]',
        { timeout: 10000 }
      );
      
      if (postButton) {
        await postButton.click();
        await this.delay(1000);
      }

      // Wait for post creation modal
      await this.page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      await this.delay(1000);

      // Type the post content
      const postContent = `📢 ${title}\n\n${description}`;
      
      // Find the content editable area
      const contentEditable = await this.page.waitForSelector(
        '[role="dialog"] [contenteditable="true"]',
        { timeout: 5000 }
      );
      
      if (contentEditable) {
        await contentEditable.click();
        await this.page.keyboard.type(postContent, { delay: 10 });
      }

      // Add image if provided
      if (imagePath && fs.existsSync(imagePath)) {
        // Find file input for photo/video
        const fileInput = await this.page.$('[role="dialog"] input[type="file"]');
        
        if (fileInput) {
          await fileInput.uploadFile(imagePath);
          await this.delay(3000); // Wait for upload
        }
      }

      // Click Post button
      const postSubmitButton = await this.page.waitForSelector(
        '[role="dialog"] [aria-label="Post"], [role="dialog"] button[aria-label*="Post"], [role="dialog"] button[aria-label*="post"]',
        { timeout: 5000 }
      );
      
      if (postSubmitButton) {
        await postSubmitButton.click();
        await this.delay(3000); // Wait for post to be published
      }

      console.log(`✅ Posted to group: ${groupUrl}`);
    } catch (error) {
      console.error(`❌ Failed to post to ${groupUrl}:`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.loggedIn = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
