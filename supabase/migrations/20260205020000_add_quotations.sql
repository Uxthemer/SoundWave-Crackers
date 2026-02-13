-- Create table for quotations
  create table if not exists public.quotations (
    id uuid default gen_random_uuid() primary key,
    short_id text not null unique,
    user_id uuid references auth.users(id) on delete set null,
    customer_name text,
    email text,
    phone text,
    address text,
    city text,
    state text,
    pincode text,
    total_amount numeric not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
  );
  
  -- Create table for quotation items
  create table if not exists public.quotation_items (
    id uuid default gen_random_uuid() primary key,
    quotation_id uuid references public.quotations(id) on delete cascade not null,
    product_id uuid references public.products(id) on delete set null,
    quantity integer not null,
    price numeric not null,
    total_price numeric not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
  );
  
  -- Enable RLS
  alter table public.quotations enable row level security;
  alter table public.quotation_items enable row level security;
  
  -- Policies for quotations
  -- Admins can do everything
  create policy "Admins can view all quotations"
    on public.quotations for select
    using (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  create policy "Admins can insert quotations"
    on public.quotations for insert
    with check (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  create policy "Admins can update quotations"
    on public.quotations for update
    using (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  create policy "Admins can delete quotations"
    on public.quotations for delete
    using (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  -- Policies for quotation items
  create policy "Admins can view all quotation items"
    on public.quotation_items for select
    using (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  create policy "Admins can insert quotation items"
    on public.quotation_items for insert
    with check (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  create policy "Admins can update quotation items"
    on public.quotation_items for update
    using (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
  create policy "Admins can delete quotation items"
    on public.quotation_items for delete
    using (
      exists (
        select 1 from public.user_profiles
        where user_id = auth.uid()
        and role_id in (select id from public.roles where name in ('admin', 'superadmin'))
      )
    );
  
