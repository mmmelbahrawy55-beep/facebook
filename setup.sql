-- إنشاء جدول الإعلانات
CREATE TABLE IF NOT EXISTS ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  governorate TEXT NOT NULL,
  page_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- تفعيل Row Level Security
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

-- السماح بكل العمليات للمستخدمين المصادق عليهم
CREATE POLICY "Allow all operations" ON ads FOR ALL USING (true);
