import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(__dirname, '../data/freebuff.db');
let db: SqlJsDatabase;

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS governorates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      governorate_id INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (governorate_id) REFERENCES governorates(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image_path TEXT,
      governorate_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (governorate_id) REFERENCES governorates(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posting_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ad_id) REFERENCES ads(id),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );
  `);

  // Insert Egyptian governorates if not exists
  const countResult = db.exec('SELECT COUNT(*) as count FROM governorates');
  const count = countResult[0]?.values[0][0] as number || 0;
  
  if (count === 0) {
    const governorates = [
      { name_ar: 'القاهرة', name_en: 'Cairo' },
      { name_ar: 'الإسكندرية', name_en: 'Alexandria' },
      { name_ar: 'الجيزة', name_en: 'Giza' },
      { name_ar: 'القليوبية', name_en: 'Qalyubia' },
      { name_ar: 'الشرقية', name_en: 'Sharqia' },
      { name_ar: 'الدقهلية', name_en: 'Dakahlia' },
      { name_ar: 'البحيرة', name_en: 'Beheira' },
      { name_ar: 'كفر الشيخ', name_en: 'Kafr El Sheikh' },
      { name_ar: 'الغربية', name_en: 'Gharbia' },
      { name_ar: 'المنوفية', name_en: 'Monufia' },
      { name_ar: 'دمياط', name_en: 'Damietta' },
      { name_ar: 'بورسعيد', name_en: 'Port Said' },
      { name_ar: 'الإسماعيلية', name_en: 'Ismailia' },
      { name_ar: 'شمال سيناء', name_en: 'North Sinai' },
      { name_ar: 'جنوب سيناء', name_en: 'South Sinai' },
      { name_ar: 'بني سويف', name_en: 'Beni Suef' },
      { name_ar: 'الفيوم', name_en: 'Faiyum' },
      { name_ar: 'المنيا', name_en: 'Minya' },
      { name_ar: 'أسيوط', name_en: 'Assiut' },
      { name_ar: 'سوهاج', name_en: 'Sohag' },
      { name_ar: 'قنا', name_en: 'Qena' },
      { name_ar: 'الأقصر', name_en: 'Luxor' },
      { name_ar: 'أسوان', name_en: 'Aswan' },
      { name_ar: 'البحر الأحمر', name_en: 'Red Sea' },
      { name_ar: 'الوادي الجديد', name_en: 'New Valley' },
      { name_ar: 'مطروح', name_en: 'Matrouh' }
    ];

    for (const gov of governorates) {
      db.run('INSERT INTO governorates (name_ar, name_en) VALUES (?, ?)', [gov.name_ar, gov.name_en]);
    }
    
    console.log('✅ Egyptian governorates initialized');
  }

  saveDatabase();
}

export function getDatabase(): SqlJsDatabase {
  return db;
}

export function saveDatabase(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Helper function to query data
export function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper function to query single row
export function queryOne(sql: string, params: any[] = []): any | null {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper function to run INSERT/UPDATE/DELETE
export function run(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  db.run(sql, params);
  const lastId = queryOne('SELECT last_insert_rowid() as id');
  const changes = db.getRowsModified();
  saveDatabase();
  return {
    lastInsertRowid: lastId?.id || 0,
    changes
  };
}
