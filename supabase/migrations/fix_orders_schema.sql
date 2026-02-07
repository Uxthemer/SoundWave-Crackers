-- Add missing columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS district TEXT,
ADD COLUMN IF NOT EXISTS short_id TEXT;

-- Create an index on short_id for faster lookups (since we query slightly often for generation)
CREATE INDEX IF NOT EXISTS idx_orders_short_id ON orders(short_id);
