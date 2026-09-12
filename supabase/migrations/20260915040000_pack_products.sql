/*
  # Family packs listed as products

  How packs reach the shop:

    1. A superadmin builds a pack on the Family Packs page from real products.
    2. In Stock Management the pack is added to the product list: a normal
       products + product_seasons row, in whatever category, with its own
       image, price and position. products.combo_pack_id says which pack it is.
    3. The storefront lists it like any product -- because it is one.

  Previous migrations put packs on the storefront straight from
  combo_pack_catalog. That is replaced by this: a pack appears in the shop
  only once it has been added to the product list.

  What makes a pack product different is handled here, in the database, so
  every screen and both checkouts behave the same:

    * Its stock is not typed in. season_catalog reports how many whole packs
      the contents can make; the scarcest product inside decides.
    * Ordering it takes stock from the products INSIDE it, never from the
      pack row (order_item_components).
    * Its cost is the cost of its contents (stamp_order_item_cost).
    * Renaming, repricing or switching the pack off on the Family Packs page
      carries through to its product listing.
*/

-- ---------------------------------------------------------------------------
-- 1. The link
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS combo_pack_id uuid;

-- products has column-level SELECT grants (20260809020000 hid the cost
-- column that way), so a new column is unreadable until granted -- and
-- season_catalog reads this one with the caller's rights. Without this line
-- every product list comes back empty.
GRANT SELECT (combo_pack_id) ON public.products TO anon, authenticated;

-- RESTRICT: a pack that is on sale cannot be deleted out from under its
-- listing; it has to be taken off the product list first.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_combo_pack_id_fkey;
ALTER TABLE public.products
  ADD CONSTRAINT products_combo_pack_id_fkey
  FOREIGN KEY (combo_pack_id) REFERENCES public.combo_packs(id) ON DELETE RESTRICT;

-- One listing per pack.
CREATE UNIQUE INDEX IF NOT EXISTS products_combo_pack_unique
  ON public.products (combo_pack_id)
  WHERE combo_pack_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. How many whole packs the shelf can make
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pack_available_count(p_pack_id uuid, p_season_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    min(floor(GREATEST(COALESCE(ps.stock, 0), 0)::numeric / cpi.quantity))::integer,
    0
  )
  FROM public.combo_pack_items cpi
  LEFT JOIN public.product_seasons ps
    ON ps.product_id = cpi.product_id AND ps.season_id = p_season_id
  WHERE cpi.combo_pack_id = p_pack_id;
$$;

GRANT EXECUTE ON FUNCTION public.pack_available_count(uuid, uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. season_catalog: pack stock worked out, and the link exposed
--
-- Same columns in the same order as before (CREATE OR REPLACE VIEW requires
-- it); only `stock` changes meaning for pack rows, and combo_pack_id is
-- appended at the end.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.season_catalog
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.product_code,
  p.name,
  p.category_id,
  p.description,
  p.image_url,
  p.yt_link,
  p.product_type,
  ps.id                  AS product_season_id,
  ps.season_id,
  ps.actual_price,
  ps.offer_price,
  ps.discount_percentage,
  ps.content,
  CASE
    WHEN p.combo_pack_id IS NULL THEN ps.stock
    ELSE public.pack_available_count(p.combo_pack_id, ps.season_id)
  END AS stock,
  ps.opening_stock,
  ps.closing_stock,
  ps.reorder_level,
  ps.is_active,
  ps.display_order       AS "order",
  p.created_at,
  CASE WHEN c.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', c.id, 'name', c.name,
      'description', c.description, 'image_url', c.image_url
    )
  END AS categories,
  p.combo_pack_id
FROM public.products p
JOIN public.product_seasons ps ON ps.product_id = p.id
LEFT JOIN public.categories c ON c.id = p.category_id;

GRANT SELECT ON public.season_catalog TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ordering a pack product takes its contents
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_item_components(p_item_id uuid)
RETURNS TABLE (product_id uuid, quantity integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- An ordinary product line consumes itself.
  SELECT oi.product_id, oi.quantity
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id
  WHERE oi.id = p_item_id
    AND p.combo_pack_id IS NULL

  UNION ALL

  -- A pack listed as a product consumes what is inside the pack.
  SELECT cpi.product_id, cpi.quantity * oi.quantity
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id
  JOIN public.combo_pack_items cpi ON cpi.combo_pack_id = p.combo_pack_id
  WHERE oi.id = p_item_id
    AND p.combo_pack_id IS NOT NULL

  UNION ALL

  -- A line naming the pack directly (the earlier route) does the same.
  SELECT cpi.product_id, cpi.quantity * oi.quantity
  FROM public.order_items oi
  JOIN public.combo_pack_items cpi ON cpi.combo_pack_id = oi.combo_pack_id
  WHERE oi.id = p_item_id
    AND oi.combo_pack_id IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- 5. A pack product's cost is its contents' cost
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stamp_order_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season uuid;
  v_pack   uuid;
BEGIN
  IF NEW.apr_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT season_id INTO v_season FROM public.orders WHERE id = NEW.order_id;
  IF v_season IS NULL THEN
    v_season := public.current_season_id();
  END IF;

  v_pack := NEW.combo_pack_id;
  IF v_pack IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT combo_pack_id INTO v_pack FROM public.products WHERE id = NEW.product_id;
  END IF;

  IF v_pack IS NOT NULL THEN
    SELECT COALESCE(sum(cpi.quantity * COALESCE(psc.apr, 0)), 0)
      INTO NEW.apr_snapshot
    FROM public.combo_pack_items cpi
    LEFT JOIN public.product_season_costs psc
      ON psc.product_id = cpi.product_id AND psc.season_id = v_season
    WHERE cpi.combo_pack_id = v_pack;
  ELSE
    SELECT apr INTO NEW.apr_snapshot
    FROM public.product_season_costs
    WHERE season_id = v_season AND product_id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. The Family Packs page stays in charge of the pack
--
-- Name, description, rate and on/off are edited there; the listing follows.
-- Category, image and position belong to the listing and are left alone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_pack_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    UPDATE public.products
    SET name = NEW.name,
        description = COALESCE(NEW.description, description)
    WHERE combo_pack_id = NEW.id;
  END IF;

  IF NEW.pack_price IS DISTINCT FROM OLD.pack_price
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.product_seasons ps
    SET offer_price = NEW.pack_price,
        is_active   = NEW.is_active
    FROM public.products p
    WHERE p.combo_pack_id = NEW.id
      AND ps.product_id = p.id
      AND ps.season_id = NEW.season_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combo_packs_sync_listing ON public.combo_packs;
CREATE TRIGGER combo_packs_sync_listing
  AFTER UPDATE ON public.combo_packs
  FOR EACH ROW EXECUTE FUNCTION public.sync_pack_listing();

-- ---------------------------------------------------------------------------
-- 7. Product images that can be uploaded
--
-- Product photos have been files shipped with the site. A pack is put
-- together in the admin panel, so its photo is uploaded there. Public, like
-- any shop image; only admins may write.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = true;

DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
CREATE POLICY "Admins upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins read product images" ON storage.objects;
CREATE POLICY "Admins read product images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins replace product images" ON storage.objects;
CREATE POLICY "Admins replace product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.season_is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.season_is_admin());

DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;
CREATE POLICY "Admins delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.season_is_admin());
