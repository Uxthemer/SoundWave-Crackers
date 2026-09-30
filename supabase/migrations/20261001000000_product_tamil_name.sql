/*
  # Tamil product names

  The printed price list goes out to shops and walk-in customers who read the
  names in Tamil, and the English catalogue name is no help to them. So a
  product now carries an optional Tamil name alongside its English one, and
  the custom price list can print it as a column of its own.

  The name is identity, not commerce: it is the same product in every season,
  so it belongs on `products` and not on `product_seasons`. `season_catalog`
  is rebuilt below to carry it, which is how every screen and the storefront
  already read a product.

  The seed below is the 126 pairs supplied by the shop. Matching is done on a
  flattened form of the English name -- lower case, every character that is
  not a letter or a digit removed -- because the two lists disagree about
  quotes, brackets and spacing but not about the words:

      4" Deluxe Lakshmi/Dead Pool (8 Ply)  ->  4deluxelakshmideadpool8ply

  That is deliberately blunt. It matches a name typed with a curly quote
  against one typed with a straight one, and "(10 Pcs)" against "10 Pcs",
  without the false positives a similarity threshold would bring: two
  different products in this catalogue never flatten to the same string
  (checked against all 126 seeds). Anything that does not match is left alone
  and reported as a NOTICE rather than guessed at.

  Re-running this is safe. It only fills a name in where there is not one
  already, so a Tamil name corrected by hand afterwards is not overwritten.
*/

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tamil_name text;

COMMENT ON COLUMN public.products.tamil_name IS
  'The product name in Tamil, for the printed price list. Optional: a product '
  'without one simply prints a blank cell in that column.';

-- ---------------------------------------------------------------------------
-- 2. The seed, matched on the flattened English name
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE tamil_seed (
  english_name text NOT NULL,
  tamil_name   text NOT NULL,
  match_key    text
) ON COMMIT DROP;

INSERT INTO tamil_seed (english_name, tamil_name) VALUES
    ('2 3/4" Kuruvi', '2¾” குருவி'),
    ('3 1/2 Lakshmi/Chotta/Flash', '3½” லட்சுமி'),
    ('4" Lakshmi/Ant-Man/Dora', '4” லட்சுமி'),
    ('4" Deluxe Lakshmi/Dead Pool (8 Ply)', '4” டீலக்ஸ் லட்சுமி'),
    ('5" Gold Ben 10 Deluxe (10 Ply)', '5” கோல்டு டீலக்ஸ்'),
    ('6" Thanos / Shiva (12 Ply)', '6” தானோஸ்'),
    ('Lucky Money / Money Bank (3 Pcs)', 'மணி பேங்க்'),
    ('Black Money / Mankatha (5 Pcs)', 'பிளாக் மணி'),
    ('2 Sound Crackers', '2 சவுண்ட்'),
    ('Paper Bomb 1/4 Kg', 'பேப்பர் பாம் 1/4 Kg'),
    ('Paper Bomb 1/2 Kg', 'பேப்பர் பாம் 1/2 Kg'),
    ('Paper Bomb 1Kg', 'பேப்பர் பாம் 1Kg'),
    ('Ground Chakkar Big (10 Pcs)', 'தரைச்சக்கரம் பிக்'),
    ('Ground Chakkar Big (25 Pcs)', 'தரைச்சக்கரம் பிக்'),
    ('Ground Chakkar Asoka', 'தரைச்சக்கரம் அசோகா'),
    ('Ground Chakkar Special', 'தரைச்சக்கரம் ஸ்பெஷல்'),
    ('Ground Chakkar Deluxe', 'தரைச்சக்கரம் டீலக்ஸ்'),
    ('Ground Chakkar Orbit Spinner', 'தரைச்சக்கரம் ஸ்பின்னர்'),
    ('Flower Pots Small', 'பூச்சட்டி சிறியது'),
    ('Flower Pots Big', 'பூச்சட்டி பெரியது'),
    ('Flower Pots Special', 'பூச்சட்டி ஸ்பெஷல்'),
    ('Flower Pots Asoka', 'பூச்சட்டி அசோகா'),
    ('Colour Koti', 'கலர் கோட்டி'),
    ('Flower Pots Deluxe (5 Pcs)', 'பூச்சட்டி டீலக்ஸ்'),
    ('Oola Vedi / Old is Gold (25 Pcs)', 'ஓலை வெடி'),
    ('Bullet Bomb', 'புல்லட் பாம்'),
    ('Mega Bullet Bomb', 'மெகா புல்லட்'),
    ('Red Bijili Bag (100 Pcs)', 'சிவப்பு பிஜிலி'),
    ('Stripped Bijili Bag / Gold (100 Pcs)', 'ஸ்ட்ரிப்புட் பிஜிலி'),
    ('Hydro Bomb', 'ஹைட்ரோ பாம்'),
    ('King Bomb', 'கிங் பாம்'),
    ('Mega Flash (Classic Bomb)', 'மெகா பிளாஷ்'),
    ('10 Cm Electric Sparkler', '10 செ.மீ. எலக்ட்ரிக்'),
    ('10 Cm Crackling Sparkler', '10 செ.மீ. கிராக்கிலிங்'),
    ('10 Cm Green Sparkler', '10 செ.மீ. பச்சை'),
    ('10 Cm Red Sparkler', '10 செ.மீ. சிவப்பு'),
    ('12 Cm Electric Sparkler', '12 செ.மீ. எலக்ட்ரிக்'),
    ('12 Cm Crackling Sparkler', '12 செ.மீ. கிராக்கிலிங்'),
    ('12 Cm Green Sparkler', '12 செ.மீ. பச்சை'),
    ('12 Cm Red Sparkler', '12 செ.மீ. சிவப்பு'),
    ('15 Cm Electric Sparkler', '15 செ.மீ. எலக்ட்ரிக்'),
    ('15 Cm Crackling Sparkler', '15 செ.மீ. கிராக்கிலிங்'),
    ('15 Cm Green Sparkler', '15 செ.மீ. பச்சை'),
    ('15 Cm Red Sparkler', '15 செ.மீ. சிவப்பு'),
    ('30 Cm Electric Sparkler (5 Pcs)', '30 செ.மீ. எலக்ட்ரிக்'),
    ('30 Cm Crackling Sparkler (5 Pcs)', '30 செ.மீ. கிராக்கிலிங்'),
    ('30 Cm Green Sparkler (5 Pcs)', '30 செ.மீ. பச்சை'),
    ('30 Cm Red Sparkler (5 Pcs)', '30 செ.மீ. சிவப்பு'),
    ('50 Cm Electric Sparkler (5 Pcs)', '50 செ.மீ. எலக்ட்ரிக்'),
    ('Rotating Sparkler (1 Pcs)', 'ரோட்டேட்டிங் ஸ்பார்க்லர்ஸ்'),
    ('Lollypop (5 Pcs)', 'லாலிபாப்'),
    ('Water Falls Pencil (5 Pcs)', 'வாட்டர் பால்ஸ் பென்சில்'),
    ('Popcorn Pencil (5 Pcs)', 'பாப்கார்ன் பென்சில்'),
    ('Kids Star Wars / Star Falls Pencil', 'கிட்ஸ் ஸ்டார் வார்ஸ் பென்சில்'),
    ('1 1/2" Twinkling Star', 'ட்விங்கிளிங் ஸ்டார்'),
    ('4" Twinkling Star', 'ட்விங்கிளிங் ஸ்டார்'),
    ('Jagajai (30 Pcs) / 28 digital Chorsa', 'ஜகாஜால்'),
    ('Kunfu (Children 1000 Wala)', 'குங்பூ'),
    ('Alert Lar (Digital Wala)', 'அலர்ட் லார்'),
    ('1000-2000 Lar (Digital Wala)', '1000-2000 டிஜிட்டல் வாலா'),
    ('Magic Whip (Digital Wala with Color)', 'மெகா விப்'),
    ('I Am Lar (Children 2000 Wala)', 'ஐ ஆம் லார்'),
    ('Elakkiya (3000 Wala Timing Colour)', 'இலக்கியா'),
    ('Yalini (5000 Wala Timing Garland)', 'யாழினி'),
    ('Dharsha (10000 Wala Garland)', 'தர்ஷா'),
    ('1000 Wala', '1000 வாலா'),
    ('2000 Wala', '2000 வாலா'),
    ('5000 Wala', '5000 வாலா'),
    ('10000 Wala', '10000 வாலா'),
    ('Baby Rocket', 'பேபி ராக்கெட்'),
    ('Rocket Bomb', 'ராக்கெட் பாம்'),
    ('Colour Rocket', 'கலர் ராக்கெட்'),
    ('Lunik Rocket', 'யுனிக் ராக்கெட்'),
    ('Pop Corn Kit Kat Color', 'பாப்கார்ன் கிட்கேட் கலர்'),
    ('Stone / Jee Boom Baa', 'ஸ்டோன், ஜீ பூம் பா'),
    ('Match Box 5 In 1', 'மேட்ச்பாக்ஸ் 5 இன் 1'),
    ('Magical Peacock - Red-Green-Cracking-Gold', 'மேஜிக் பீகாக்'),
    ('Badaa Peacock (5 Hole)', 'படா பீகாக்'),
    ('6" Aqua Queen / Water Queen / Touch Me Fall', '6 வாட்டர் குயின்'),
    ('6" Monster Tn67 Fountain', 'மான்ஸ்டர் பவுண்டன்'),
    ('6" Rolex 100 (Rx100) Fountain', '6 ரோலக்ஸ் 100 பவுண்டன்'),
    ('The Leader (3 Pcs) Fountain', 'தி லீடர் பவுண்டன்'),
    ('Jigarthanda (3 Pcs) Fountain', 'ஜிகர்தண்டா பவுண்டன்'),
    ('Thunder Coconut Crackling Fountain (3 Pcs)', 'தண்டர் கோக்கனட்'),
    ('Fire & Feather Fountain (5 Pcs)', 'பயர் & பெதர் பவுண்டன்'),
    ('Nebula Fountain (5 Pcs)', 'நெபுலா பவுண்டன்'),
    ('Golden Sparrow Fountain (5 Pcs)', 'கோல்டன் ஸ்பாரோ'),
    ('Dragon Slay Multi Function Fountain (5 Pcs)', 'டிராகன் ஸ்லே மல்டி கலர்'),
    ('12 Shot Color & Tails', '12 ஷாட் கலர்'),
    ('Siren / Super Singer (5 Pcs)', 'சைரன்'),
    ('Sharp Shooter / Big Gun (2 Pcs)', 'ஷார்ப் ஷூட்டர்'),
    ('Dancing Butterfly', 'டான்சிங் பட்டர்பிளை'),
    ('Helicopter', 'ஹெலிகாப்டர்'),
    ('3 1/2 Navagara Falls (Red & Green) (2 Pcs)', 'நவரா பால்ஸ்'),
    ('Sky Shots', 'ஸ்கை ஷாட்ஸ்'),
    ('7 Peacock Shots', '7 பீகாக் ஷாட்ஸ்'),
    ('Motu Patlu (2 Pcs)', 'மோட்டு பட்டுலு'),
    ('4X4 Wheel / Trend Wheel (5 Pcs)', '4X4 வீல்'),
    ('Shin Chan / Mogli (5 Pcs)', 'ஷின் சான்'),
    ('Chotta Fancy', 'சோட்டா பேன்சி'),
    ('Photo Flash', 'போட்டோ பிளாஷ்'),
    ('Tin Beer - Fountain', 'டின் பீர் பவுண்டன்'),
    ('25 Shot Colour & Tails', '25 ஷாட் கலர்'),
    ('30 Shot - Economic', '30 ஷாட் எக்னாமிக்'),
    ('30 Shot Colour & Crackling', '30 ஷாட் கலர் & கிராக்கிலிங்'),
    ('60 Shot Colour & Crackling', '60 ஷாட் கலர் & கிராக்கிலிங்'),
    ('120 Shot Colour & Crackling', '120 ஷாட் கலர் & கிராக்கிலிங்'),
    ('240 Shot Color And Crackling', '240 ஷாட் கலர் & கிராக்கிலிங்'),
    ('Hunter 007 Gun (5 Pcs)', 'ஹண்டர் 007 கன்'),
    ('Emu Egg (2 Pcs)', 'ஈமு எக்'),
    ('Rollcap', 'ரோல்கேப்'),
    ('Gift Box -21 Item', 'கிப்ட் பாக்ஸ் - 21'),
    ('Gift Box -31 Item', 'கிப்ட் பாக்ஸ் - 31'),
    ('Gift Box -41 Item', 'கிப்ட் பாக்ஸ் - 41'),
    ('Gift Box - 51 Item', 'கிப்ட் பாக்ஸ் - 51'),
    ('Family Pack 2000', 'ஃபேமிலி பேக் 2000'),
    ('Joy Family Pack 3500', 'ஜாய் ஃபேமிலி பேக் 3500'),
    ('VIP Family Pack 5500', 'VIP ஃபேமிலி பேக் 5500'),
    ('VVIP Family Pack 10000', 'VVIP ஃபேமிலி பேக் 10000'),
    ('Night Aerials (3Pcs)', 'நைட் ஏரியல்ஸ் (3Pcs)'),
    ('2 1/2" Pipe Fancy', '2 1/2" பைப் பேன்சி'),
    ('3 1/2" Pipe Fancy', '3 1/2" பைப் பேன்சி'),
    ('2" Pipe Fancy', '2" பைப் பேன்சி'),
    ('4" Pipe Fancy', '4" பைப் பேன்சி'),
    ('Hanuman Gatha', 'ஹனுமான் கதா'),
    ('Car', 'கார்');

UPDATE tamil_seed
   SET match_key = lower(regexp_replace(english_name, '[^a-zA-Z0-9]', '', 'g'));

DO $$
DECLARE
  matched   integer;
  unmatched text;
BEGIN

  -- A seed row that flattens to the same key as another would make the update
  -- non-deterministic. There are none today; fail loudly if a later edit
  -- introduces one rather than silently picking one of them.
  IF EXISTS (
    SELECT 1 FROM tamil_seed GROUP BY match_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Two Tamil seed rows flatten to the same English name';
  END IF;

  UPDATE public.products p
     SET tamil_name = s.tamil_name
    FROM tamil_seed s
   WHERE lower(regexp_replace(p.name, '[^a-zA-Z0-9]', '', 'g')) = s.match_key
     AND (p.tamil_name IS NULL OR btrim(p.tamil_name) = '');

  GET DIAGNOSTICS matched = ROW_COUNT;
  RAISE NOTICE 'Tamil names written: %', matched;

  -- Both directions are worth seeing: a seed nobody could be found for is
  -- usually a renamed product, a product with no seed is usually new.
  SELECT string_agg(s.english_name, ' | ' ORDER BY s.english_name)
    INTO unmatched
    FROM tamil_seed s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.products p
      WHERE lower(regexp_replace(p.name, '[^a-zA-Z0-9]', '', 'g')) = s.match_key
   );
  IF unmatched IS NOT NULL THEN
    RAISE NOTICE 'No product matched these Tamil seeds: %', unmatched;
  END IF;

  SELECT string_agg(p.name, ' | ' ORDER BY p.name)
    INTO unmatched
    FROM public.products p
   WHERE p.tamil_name IS NULL OR btrim(p.tamil_name) = '';
  IF unmatched IS NOT NULL THEN
    RAISE NOTICE 'Products still without a Tamil name: %', unmatched;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. season_catalog carries it
--
-- Same columns in the same order as 20260915060000_pack_own_stock, with
-- tamil_name added beside name. CREATE OR REPLACE cannot reorder or remove
-- columns, so it is appended at the end; every caller selects by name.
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
  ps.stock,
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
  p.combo_pack_id,
  p.tamil_name
FROM public.products p
JOIN public.product_seasons ps ON ps.product_id = p.id
LEFT JOIN public.categories c ON c.id = p.category_id;

GRANT SELECT ON public.season_catalog TO anon, authenticated;
