-- Creating Tables
CREATE TABLE blogs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title text NOT NULL,
    slug text NOT NULL,
    content text NOT NULL,
    image_url text,
    published_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    author_id uuid
);

CREATE TABLE categories (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    image_url text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE faqs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    question text NOT NULL,
    answer text NOT NULL,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE order_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    price numeric NOT NULL,
    total_price numeric NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    total_amount numeric NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    payment_method text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    discount_amt numeric,
    discount_percentage text,
    referred_by text,
    alternate_phone text,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    pincode text NOT NULL,
    country text NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL DEFAULT '-'
);

CREATE TABLE otp_verifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    otp text NOT NULL,
    verified boolean DEFAULT false,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE payments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    scheme_selection_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_date timestamp with time zone NOT NULL,
    status character varying(20) NOT NULL,
    transaction_id character varying(100),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE phone_auth (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    otp text NOT NULL,
    verified boolean DEFAULT false,
    attempts integer DEFAULT 0,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE products (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    category_id uuid,
    name text NOT NULL,
    description text,
    image_url text,
    actual_price numeric NOT NULL,
    discount_percentage numeric DEFAULT 0,
    offer_price numeric NOT NULL,
    content text,
    stock integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE user_profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    role_id uuid NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    address text,
    created_at timestamp with time zone DEFAULT now(),
    city text,
    state text,
    pincode text,
    country text DEFAULT 'India',
    phone_verified boolean NOT NULL DEFAULT false,
    email text NOT NULL,
    user_id uuid NOT NULL,
    pwd text NOT NULL,
    alternate_phone text
);

-- Adding Constraints
ALTER TABLE blogs ADD CONSTRAINT blogs_pkey PRIMARY KEY (id);
ALTER TABLE blogs ADD CONSTRAINT blogs_slug_key UNIQUE (slug);
ALTER TABLE categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE faqs ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);
ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
ALTER TABLE otp_verifications ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);
ALTER TABLE payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE phone_auth ADD CONSTRAINT phone_auth_pkey PRIMARY KEY (id);
ALTER TABLE products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name);
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

-- Adding Foreign Key Constraints
ALTER TABLE blogs ADD CONSTRAINT blogs_author_id_fkey FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_scheme_selection_id_fkey FOREIGN KEY (scheme_selection_id) REFERENCES scheme_selections(id) ON DELETE CASCADE;

-- Enabling Row-Level Security
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Row-Level Security Policies
CREATE POLICY "Users can create their own orders" ON orders FOR INSERT TO authenticated USING (TRUE) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own orders" ON orders FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Superadmin and Admin can insert products" ON products FOR INSERT TO authenticated USING (TRUE) WITH CHECK (is_superadmin(auth.uid()) OR is_admin(auth.uid()));
CREATE POLICY "Superadmin can view all Orders" ON orders FOR SELECT TO authenticated USING (is_superadmin(auth.uid()));
CREATE POLICY "Admin can view all Orders" ON orders FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Users can view their own order items" ON order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Users can create their own order items" ON order_items FOR INSERT TO authenticated USING (TRUE) WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

-- Add more policies based on the extracted data...

