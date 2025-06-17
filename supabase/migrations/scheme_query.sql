-- Create schemes table
CREATE TABLE schemes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    installment VARCHAR(10) NOT NULL,
    duration VARCHAR(20) NOT NULL,
    total_amount VARCHAR(20) NOT NULL,
    bonus_amount VARCHAR(20) NOT NULL,
    total_value VARCHAR(20) NOT NULL,
    features TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true,
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create scheme_selections table
CREATE TABLE scheme_selections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scheme_id UUID NOT NULL REFERENCES schemes(id),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, status) -- Ensures a user can only have one active scheme
);

-- Create payments table
CREATE TABLE payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scheme_selection_id UUID NOT NULL REFERENCES scheme_selections(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    transaction_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create RLS (Row Level Security) policies
ALTER TABLE schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Schemes policies
CREATE POLICY "Anyone can view active schemes"
    ON schemes FOR SELECT
    USING (is_active = true);

CREATE POLICY "Only admins can manage schemes"
    ON schemes FOR ALL
    USING (auth.role() = 'authenticated' AND auth.uid() IN (
        SELECT user_id FROM user_profiles WHERE role_id IN (SELECT id FROM roles WHERE name = 'superadmin' or name ='admin')
    ));

-- Scheme selections policies
CREATE POLICY "Users can view their own scheme selections"
    ON scheme_selections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheme selections"
    ON scheme_selections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheme selections"
    ON scheme_selections FOR UPDATE
    USING (auth.uid() = user_id);

-- Payments policies
CREATE POLICY "Users can view their own payments"
    ON payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM scheme_selections
            WHERE scheme_selections.id = payments.scheme_selection_id
            AND scheme_selections.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create their own payments"
    ON payments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM scheme_selections
            WHERE scheme_selections.id = payments.scheme_selection_id
            AND scheme_selections.user_id = auth.uid()
        )
    );

-- Create functions for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updating timestamps
CREATE TRIGGER update_schemes_updated_at
    BEFORE UPDATE ON schemes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheme_selections_updated_at
    BEFORE UPDATE ON scheme_selections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert initial scheme data
INSERT INTO schemes (
    installment,
    duration,
    total_amount,
    bonus_amount,
    total_value,
    features,
    is_active,
    max_participants,
    current_participants
) VALUES
    ('₹500', '10 months', '₹5,000', '₹500', '₹5,500', 
     ARRAY['Free Delivery', 'Bonus Crackers', 'Priority Support'],
     true, 100, 0),
    ('₹1,000', '10 months', '₹10,000', '₹1,000', '₹11,000',
     ARRAY['Free Delivery', 'Bonus Crackers', 'Priority Support'],
     true, 75, 0),
    ('₹2,000', '10 months', '₹20,000', '₹2,000', '₹22,000',
     ARRAY['Free Delivery', 'Bonus Crackers', 'Priority Support'],
     true, 50, 0),
    ('₹3,000', '10 months', '₹30,000', '₹3,000', '₹23,000',
     ARRAY['Free Delivery', 'Bonus Crackers', 'Priority Support'],
     true, 50, 0),
    ('₹4,000', '10 months', '₹40,000', '₹4,000', '₹24,000',
     ARRAY['Free Delivery', 'Bonus Crackers', 'Priority Support'],
     true, 50, 0),
    ('₹5,000', '10 months', '₹50,000', '₹5,000', '₹55,000',
     ARRAY['Free Delivery', 'Bonus Crackers', 'Priority Support'],
     true, 50, 0);

-- Create indexes for better performance
CREATE INDEX idx_scheme_selections_user_id ON scheme_selections(user_id);
CREATE INDEX idx_scheme_selections_status ON scheme_selections(status);
CREATE INDEX idx_payments_scheme_selection_id ON payments(scheme_selection_id);
CREATE INDEX idx_payments_status ON payments(status);

-- In Supabase SQL Editor
create or replace function notify_order_placed()
returns trigger as $$
begin
  perform net.http_post(
    'https://YOUR_EDGE_FUNCTION_URL/send-order-email',
    json_build_object('order_id', NEW.id)::text,
    'application/json'
  );
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists order_placed_trigger on orders;
create trigger order_placed_trigger
after insert on orders
for each row execute procedure notify_order_placed();

create or replace function notify_order_status_changed()
returns trigger as $$
begin
  if NEW.status is distinct from OLD.status then
    perform net.http_post(
      'https://YOUR_EDGE_FUNCTION_URL/send-status-email',
      json_build_object('order_id', NEW.id)::text,
      'application/json'
    );
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists order_status_changed_trigger on orders;
create trigger order_status_changed_trigger
after update on orders
for each row execute procedure notify_order_status_changed();

import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

serve(async (req) => {
  const { order_id } = await req.json();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch order and user profile
  const { data: order } = await supabase.from("orders").select("*").eq("id", order_id).single();
  if (!order) return new Response("Order not found", { status: 404 });

  const { data: user } = await supabase.from("user_profiles").select("*").eq("user_id", order.user_id).single();
  if (!user) return new Response("User not found", { status: 404 });

  // Fetch admin emails
  const { data: admins } = await supabase
    .from("user_profiles")
    .select("email")
    .in("role", ["SuperAdmin", "Admin"]);
  const adminEmails = admins?.map((a: any) => a.email).filter(Boolean);

  // Compose email
  const recipients = [user.email, ...adminEmails];
  await resend.emails.send({
    from: "orders@yourdomain.com",
    to: recipients,
    subject: `New Order Placed: ${order.id}`,
    html: `<p>Order placed by ${user.full_name} (${user.email})</p>
           <p>Order ID: ${order.id}</p>
           <p>Status: ${order.status}</p>`
  });

  return new Response("OK");
});

