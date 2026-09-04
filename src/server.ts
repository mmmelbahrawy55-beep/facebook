import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase, queryAll, queryOne, run, saveDatabase } from './database';
import { FacebookAutomation } from './facebook';
import multer from 'multer';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// File upload configuration
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Facebook automation instance
let facebookAutomation: FacebookAutomation | null = null;

// SSE clients for progress tracking
let sseClients: express.Response[] = [];

function broadcastProgress(data: any): void {
  sseClients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// API Routes

// Get all governorates
app.get('/api/governorates', (req, res) => {
  const governorates = queryAll('SELECT * FROM governorates ORDER BY name_ar');
  res.json(governorates);
});

// Get groups by governorate
app.get('/api/groups/:governorateId', (req, res) => {
  const { governorateId } = req.params;
  const groups = queryAll('SELECT * FROM groups WHERE governorate_id = ?', [parseInt(governorateId)]);
  res.json(groups);
});

// Add group manually
app.post('/api/groups', (req, res) => {
  const { name, url, governorate_id } = req.body;
  
  if (!name || !url || !governorate_id) {
    return res.status(400).json({ error: 'Name, URL, and governorate_id are required' });
  }
  
  try {
    const result = run(
      'INSERT INTO groups (name, url, governorate_id) VALUES (?, ?, ?)',
      [name, url, parseInt(governorate_id)]
    );
    res.json({ id: result.lastInsertRowid, message: 'Group added successfully' });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'This group URL already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete group
app.delete('/api/groups/:id', (req, res) => {
  const { id } = req.params;
  
  const group = queryOne('SELECT * FROM groups WHERE id = ?', [parseInt(id)]);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  // Delete posting history for this group
  run('DELETE FROM posting_history WHERE group_id = ?', [parseInt(id)]);
  // Delete the group
  run('DELETE FROM groups WHERE id = ?', [parseInt(id)]);
  
  res.json({ message: 'Group deleted successfully' });
});

// Toggle group active status
app.patch('/api/groups/:id/toggle', (req, res) => {
  const { id } = req.params;
  
  const group = queryOne('SELECT * FROM groups WHERE id = ?', [parseInt(id)]);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const newStatus = group.is_active ? 0 : 1;
  run('UPDATE groups SET is_active = ? WHERE id = ?', [newStatus, parseInt(id)]);
  
  res.json({ message: 'Group status updated', is_active: newStatus });
});

// Create new ad
app.post('/api/ads', upload.single('image'), (req, res) => {
  const { title, description, governorate_id } = req.body;
  const image_path = req.file ? req.file.filename : null;
  
  const result = run(
    'INSERT INTO ads (title, description, image_path, governorate_id, status) VALUES (?, ?, ?, ?, ?)',
    [title, description, image_path, parseInt(governorate_id), 'pending']
  );
  
  res.json({ id: result.lastInsertRowid, message: 'Ad created successfully' });
});

// Get all ads
app.get('/api/ads', (req, res) => {
  const ads = queryAll(`
    SELECT a.*, g.name_ar as governorate_name 
    FROM ads a 
    LEFT JOIN governorates g ON a.governorate_id = g.id 
    ORDER BY a.created_at DESC
  `);
  res.json(ads);
});

// Get single ad
app.get('/api/ads/:id', (req, res) => {
  const ad = queryOne(`
    SELECT a.*, g.name_ar as governorate_name 
    FROM ads a 
    LEFT JOIN governorates g ON a.governorate_id = g.id 
    WHERE a.id = ?
  `, [parseInt(req.params.id)]);
  
  if (!ad) {
    return res.status(404).json({ error: 'Ad not found' });
  }
  res.json(ad);
});

// Update ad
app.put('/api/ads/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { title, description, governorate_id } = req.body;
  
  const existingAd = queryOne('SELECT * FROM ads WHERE id = ?', [parseInt(id)]);
  if (!existingAd) {
    return res.status(404).json({ error: 'Ad not found' });
  }
  
  let image_path = existingAd.image_path;
  if (req.file) {
    // Delete old image if exists
    if (existingAd.image_path) {
      const oldImagePath = path.join(uploadsDir, existingAd.image_path as string);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    image_path = req.file.filename;
  }
  
  run(
    'UPDATE ads SET title = ?, description = ?, image_path = ?, governorate_id = ? WHERE id = ?',
    [title, description, image_path, parseInt(governorate_id), parseInt(id)]
  );
  
  res.json({ message: 'Ad updated successfully' });
});

// Delete ad
app.delete('/api/ads/:id', (req, res) => {
  const { id } = req.params;
  
  const ad = queryOne('SELECT * FROM ads WHERE id = ?', [parseInt(id)]);
  if (!ad) {
    return res.status(404).json({ error: 'Ad not found' });
  }
  
  // Delete image if exists
  if (ad.image_path) {
    const imagePath = path.join(uploadsDir, ad.image_path as string);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
  
  // Delete posting history for this ad
  run('DELETE FROM posting_history WHERE ad_id = ?', [parseInt(id)]);
  // Delete the ad
  run('DELETE FROM ads WHERE id = ?', [parseInt(id)]);
  
  res.json({ message: 'Ad deleted successfully' });
});

// Get posting history
app.get('/api/history', (req, res) => {
  const history = queryAll(`
    SELECT h.*, a.title as ad_title, g.name_ar as governorate_name
    FROM posting_history h
    LEFT JOIN ads a ON h.ad_id = a.id
    LEFT JOIN groups gr ON h.group_id = gr.id
    LEFT JOIN governorates g ON gr.governorate_id = g.id
    ORDER BY h.posted_at DESC
  `);
  res.json(history);
});

// Facebook Login
app.post('/api/facebook/login', async (req, res) => {
  try {
    facebookAutomation = new FacebookAutomation();
    await facebookAutomation.login();
    res.json({ message: 'Facebook login successful', status: 'connected' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check Facebook connection status
app.get('/api/facebook/status', (req, res) => {
  const isLoggedIn = facebookAutomation?.isLoggedIn() || false;
  res.json({ connected: isLoggedIn });
});

// Facebook Logout
app.post('/api/facebook/logout', async (req, res) => {
  try {
    if (facebookAutomation) {
      await facebookAutomation.close();
      facebookAutomation = null;
    }
    res.json({ message: 'Logged out successfully', status: 'disconnected' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Discover groups for a governorate
app.post('/api/groups/discover', async (req, res) => {
  try {
    const { governorate_id } = req.body;
    
    if (!facebookAutomation?.isLoggedIn()) {
      return res.status(400).json({ error: 'Facebook not connected' });
    }
    
    const governorate = queryOne('SELECT * FROM governorates WHERE id = ?', [parseInt(governorate_id)]);
    
    if (!governorate) {
      return res.status(404).json({ error: 'Governorate not found' });
    }
    
    const groups = await facebookAutomation.discoverGroups(governorate.name_en as string);
    
    // Save discovered groups
    for (const group of groups) {
      try {
        run('INSERT OR IGNORE INTO groups (name, url, governorate_id) VALUES (?, ?, ?)', 
          [group.name, group.url, parseInt(governorate_id)]);
      } catch (e) {
        // Ignore duplicate errors
      }
    }
    
    res.json({ message: `Discovered ${groups.length} groups`, groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for progress tracking
app.get('/api/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  sseClients.push(res);
  
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Post ad to groups with delay and progress
app.post('/api/ads/:adId/post', async (req, res) => {
  try {
    const { adId } = req.params;
    const { delaySeconds = 60 } = req.body; // Default 60 seconds between posts
    
    if (!facebookAutomation?.isLoggedIn()) {
      return res.status(400).json({ error: 'Facebook not connected' });
    }
    
    const ad = queryOne('SELECT * FROM ads WHERE id = ?', [parseInt(adId)]);
    
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }
    
    const groups = queryAll('SELECT * FROM groups WHERE governorate_id = ?', [ad.governorate_id]);
    
    if (groups.length === 0) {
      return res.status(400).json({ error: 'No groups found for this governorate' });
    }
    
    // Start posting in background
    res.json({ 
      message: 'Posting started', 
      totalGroups: groups.length,
      delaySeconds: delaySeconds 
    });
    
    // Post to groups with delay (runs in background)
    const results = [];
    
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      
      // Broadcast progress update
      broadcastProgress({
        type: 'posting',
        current: i + 1,
        total: groups.length,
        groupName: group.name,
        status: 'posting',
        delaySeconds: delaySeconds
      });
      
      try {
        const imagePath = ad.image_path ? path.join(uploadsDir, ad.image_path as string) : undefined;
        await facebookAutomation.postToGroup(
          group.url as string,
          ad.title as string,
          ad.description as string,
          imagePath
        );
        
        // Record successful post
        run('INSERT INTO posting_history (ad_id, group_id, status) VALUES (?, ?, ?)',
          [parseInt(adId), group.id, 'success']);
        
        results.push({ group: group.name, status: 'success' });
        
        broadcastProgress({
          type: 'posted',
          current: i + 1,
          total: groups.length,
          groupName: group.name,
          status: 'success'
        });
      } catch (error: any) {
        // Record failed post
        run('INSERT INTO posting_history (ad_id, group_id, status, error_message) VALUES (?, ?, ?, ?)',
          [parseInt(adId), group.id, 'failed', error.message]);
        
        results.push({ group: group.name, status: 'failed', error: error.message });
        
        broadcastProgress({
          type: 'posted',
          current: i + 1,
          total: groups.length,
          groupName: group.name,
          status: 'failed',
          error: error.message
        });
      }
      
      // Wait for delay between posts (except after the last post)
      if (i < groups.length - 1) {
        broadcastProgress({
          type: 'waiting',
          current: i + 1,
          total: groups.length,
          delaySeconds: delaySeconds,
          nextGroup: groups[i + 1].name
        });
        
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }
    }
    
    // Update ad status
    run('UPDATE ads SET status = ? WHERE id = ?', ['posted', parseInt(adId)]);
    
    // Broadcast completion
    broadcastProgress({
      type: 'completed',
      total: groups.length,
      successCount: results.filter(r => r.status === 'success').length,
      failedCount: results.filter(r => r.status === 'failed').length
    });
    
  } catch (error: any) {
    broadcastProgress({
      type: 'error',
      message: error.message
    });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Freebuff Desktop running on http://localhost:${PORT}`);
  });
}

startServer();
