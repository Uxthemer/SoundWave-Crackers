/*
 * Blog articles that ship with the build.
 *
 * These live in the repo rather than the `blogs` table so the build can write
 * each one out as a real HTML page (see scripts/prerenderBlog.ts). A search
 * crawler then gets the title, description and full text in the first
 * response instead of an empty <div id="root"> it has to run JavaScript to
 * fill. Posts in the `blogs` table still work; a slug here wins over the same
 * slug there.
 *
 * Keep this file free of browser imports — vite.config.ts imports it at build
 * time, in Node.
 *
 * Write facts that are true of this shop (₹3,000 minimum, 5–9 working days,
 * tracking by order number + phone) and nothing about prices or discounts that
 * would go stale — link to the live catalogue for those.
 */

export interface BlogArticle {
  slug: string;
  title: string;
  /** Meta description: what shows under the link in Google. Aim for 140–160 characters. */
  description: string;
  /** File name under /assets/img/blogs/. */
  image: string;
  imageAlt: string;
  publishedAt: string;
  updatedAt: string;
  /** Article body as HTML: h2/h3/p/ul/ol/table/a only, styled by `.blog-article`. */
  html: string;
}

export const BLOG_INDEX_TITLE =
  "Crackers Buying Guides & Diwali Tips | SoundWave Crackers Blog";
export const BLOG_INDEX_DESCRIPTION =
  "Guides to buying Sivakasi crackers online: price lists, types of crackers, family packs, safety tips for kids and how to plan your Diwali crackers budget.";

const cat = (name: string) =>
  `/buy-cracker-online?category=${encodeURIComponent(name.toLowerCase())}`;

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    slug: "how-to-order-sivakasi-crackers-online",
    title: "How to Order Sivakasi Crackers Online: A Step-by-Step Guide for Diwali 2026",
    description:
      "Order Sivakasi crackers online in a few minutes: pick from the catalogue, check out with or without an account, pay by UPI and track delivery to your door.",
    image: "buy-firecrackers-online.jpg",
    imageAlt: "Sivakasi crackers ordered online and packed for delivery",
    publishedAt: "2026-10-09",
    updatedAt: "2026-10-09",
    html: `
<p>Most of the crackers burst in India are made in and around <strong>Sivakasi</strong>, in Tamil Nadu's Virudhunagar district. Buying straight from a Sivakasi seller, instead of a roadside stall several hands down the chain, is the simplest way to get fresh stock and a fair price. SoundWave Crackers is based at Vembakottai near Sivakasi, and this guide walks through exactly how an online order with us works, from choosing crackers to the parcel reaching your door.</p>

<h2>Step 1: Browse the catalogue or download the price list</h2>
<p>Start at <a href="/buy-cracker-online">Explore Crackers</a>. Every product shows its current season price, and you can filter by category &ndash; <a href="${cat("Sparkler")}">sparklers</a>, <a href="${cat("Flower Pot")}">flower pots</a>, <a href="${cat("Chakkars")}">chakkars</a>, <a href="${cat("Rocket & Unique")}">rockets</a>, <a href="${cat("Multishot items")}">multishot items</a>, <a href="${cat("Digital LAR (Wala)")}">walas</a> and more.</p>
<p>If you prefer to plan on paper, use the <strong>Price List</strong> button in the menu. It builds a PDF from the live catalogue, so the prices on it are the prices at checkout. Many families print it, tick what they want and then order.</p>

<h2>Step 2: Use Quick Purchase if you already know what you want</h2>
<p>The <a href="/quick-online-cracker">Quick Purchase</a> page lists the whole catalogue in one table. Type a quantity next to each item and the running total updates as you go. It is the fastest way to place a large order, or to re-create last year's list.</p>

<h2>Step 3: Check your cart against the minimum order</h2>
<p>The minimum order value is <strong>₹3,000</strong>. Crackers travel by goods transport, not courier, and below that amount the packing and freight cost more than the order is worth. Most family orders clear it easily; if yours does not, a <a href="${cat("Family Pack")}">family pack</a> is an easy way to round it up.</p>

<h2>Step 4: Check out, with or without an account</h2>
<p>You can sign in, or check out as a guest with just your name, phone number and delivery address. Please give a phone number that will be answered on delivery day: the transport office calls it when your parcel arrives.</p>
<p>Prices are worked out on our side when the order is placed, so the total you see is the total you pay. Payment is by UPI, Google Pay and the other options listed on the <a href="/payment">payment page</a>.</p>

<h2>Step 5: Track the order</h2>
<p>Every order gets a number such as <em>SWCO2026K7P2-0001</em>. Enter it, or just its last four digits, with your phone number on the <a href="/track-order">Track Order</a> page to see its status and download an order summary. Asking for both halves keeps your order private: nobody can look it up with the order number alone.</p>

<h2>How long delivery takes</h2>
<p>Orders typically arrive within <strong>5&ndash;9 working days</strong> of dispatch. In the last two weeks before Diwali every transport route out of Sivakasi is busy, so the earlier you order, the less you depend on that rush. For Diwali 2026 (Sunday, 8 November), ordering by mid-October is the safe choice.</p>

<h2>Tips for a smooth order</h2>
<ul>
  <li><strong>Order early.</strong> Popular items, especially new arrivals and big multishots, sell out first.</li>
  <li><strong>Mix categories.</strong> A good evening has sparklers and flower pots for everyone, a few chakkars, some sky shots and one wala to finish. Our guide to <a href="/blog/types-of-crackers-explained">types of crackers</a> explains what each one does.</li>
  <li><strong>Check local rules.</strong> Some states and cities limit the hours for bursting crackers on festival days. Check what applies where you live before you plan the evening.</li>
  <li><strong>Read the safety basics.</strong> Our <a href="/blog/firecracker-safety-tips">firecracker safety tips</a> take two minutes and are worth it.</li>
</ul>

<h2>Ready to order?</h2>
<p>Browse the <a href="/buy-cracker-online">full crackers catalogue</a>, or go straight to <a href="/quick-online-cracker">Quick Purchase</a> if you already have your list.</p>
`,
  },
  {
    slug: "types-of-crackers-explained",
    title: "Types of Crackers Explained: Sparklers, Flower Pots, Chakkars, Rockets, Walas and More",
    description:
      "A plain guide to every type of Diwali cracker – what sparklers, flower pots, chakkars, rockets, bijili, walas, multishots and fancy shots do, and who each suits.",
    image: "top-10-firecrackers.jpeg",
    imageAlt: "Different types of Diwali crackers lighting up the night sky",
    publishedAt: "2026-10-09",
    updatedAt: "2026-10-09",
    html: `
<p>A Sivakasi price list can run to more than a hundred lines, and the names &ndash; <em>chakkar</em>, <em>bijili</em>, <em>sattai</em>, <em>lar</em>, <em>multishot</em> &ndash; are not obvious if you have never bought crackers in bulk. Here is what each type of cracker actually does, so you can build a balanced order instead of guessing.</p>

<h2>Sparklers</h2>
<p><a href="${cat("Sparkler")}">Sparklers</a> are hand-held wires coated in a composition that burns slowly with bright sparks. They come in lengths from 7 cm to 50 cm, and in electric, crackling, colour and green varieties. Longer sparklers burn longer. They make no bang, so they are what children, elders and first-timers reach for, and they are the item families run out of first. Buy more than you think you need.</p>

<h2>Flower pots</h2>
<p><a href="${cat("Flower Pot")}">Flower pots</a> (<em>anar</em>) are cone-shaped fountains placed on the ground. Once lit, they throw a tall shower of sparks for several seconds. They come in sizes from small to giant and in colour or crackling versions. They are quiet, spectacular and easy to light from a safe distance, which makes them the backbone of a family celebration.</p>

<h2>Ground chakkars</h2>
<p><a href="${cat("Chakkars")}">Ground chakkars</a> (<em>chakri</em>, ground spinners) spin on the floor in a circle of sparks. Big, deluxe and special chakkars spin longer and brighter. Light them on a hard, flat surface such as a road or terrace; they do not spin on grass or sand.</p>

<h2>Pencils and sattai</h2>
<p>The <a href="${cat("Sattai & Pencil")}">sattai and pencil</a> category covers sticks that burn with colour or crackle, often held in the hand. They are a step up from sparklers for older children and a cheap way to add variety.</p>

<h2>Sound crackers and bijili</h2>
<p><a href="${cat("Sound Crackers")}">Sound crackers</a> are the ones that go bang: bombs such as the classic atom bomb, hydro bomb and king bomb. <a href="${cat("Bombs & Bijili")}">Bijili</a> are small red crackers sold in bundles, each with a short, sharp pop. Light them, step well back, and keep them away from people, animals and vehicles.</p>

<h2>Walas (laris)</h2>
<p>A wala, or lari, is a long string of small crackers fused together that go off one after another in a continuous roll. They are counted by the number of crackers: 100, 1000, 2000, 5000 and up to 10000 wala. Walas are usually saved for the big moment &ndash; midnight, or the start of the celebration. <a href="${cat("Digital LAR (Wala)")}">Digital walas</a> add a crackling, rhythmic finish.</p>

<h2>Rockets</h2>
<p><a href="${cat("Rocket & Unique")}">Rockets</a> are launched from a bottle or tube, rise into the sky and burst with a whistle, a crackle or colour. Launch them in an open space, pointing straight up, well away from buildings, trees and wires.</p>

<h2>Multishot and sky shots</h2>
<p><a href="${cat("Multishot items")}">Multishot items</a> are boxes of tubes that fire one shell after another into the sky &ndash; 7, 12, 30, 60, 120 shots and more &ndash; each opening into colour. Light one fuse and the box gives you a small fireworks show. For the money they give the most dramatic effect of anything on the list, and they are the item most people remember.</p>

<h2>Fancy fireworks and night series</h2>
<p><a href="${cat("Fancy Fireworks")}">Fancy fireworks</a> and the <a href="${cat("Night Series")}">night series</a> are aerial shells and novelty effects built for the dark: peacock feathers, colour changes, crackling stars. They are best saved for later in the evening.</p>

<h2>Kids items and toy fireworks</h2>
<p><a href="${cat("Kids Item")}">Kids items</a> and <a href="${cat("Toys Fireworks")}">toy fireworks</a> are low-noise novelties picked to be gentle, with small effects and little or no bang. We have a separate guide to <a href="/blog/crackers-for-kids-safe-choices">crackers for kids</a>.</p>

<h2>Gift boxes and family packs</h2>
<p>If you would rather not choose item by item, <a href="${cat("Gift Box")}">gift boxes</a> and <a href="${cat("Family Pack")}">family packs</a> come ready-assorted. Read <a href="/blog/family-pack-vs-gift-box-crackers">family pack vs gift box</a> to see which suits you.</p>

<h2>Putting it together</h2>
<p>A balanced order has something quiet for everyone (sparklers, flower pots, chakkars), something loud for those who want it (bombs, walas), and something in the sky to finish (rockets, multishots). Browse each category in the <a href="/buy-cracker-online">crackers catalogue</a>, or download the price list from the menu and plan it on paper.</p>
`,
  },
  {
    slug: "family-pack-vs-gift-box-crackers",
    title: "Family Pack vs Gift Box Crackers: Which Should You Buy This Diwali?",
    description:
      "Family packs and cracker gift boxes both save you from choosing item by item. Here is how they differ, who each one suits, and when to build your own order instead.",
    image: "blog-3.jpg",
    imageAlt: "A family pack of assorted Diwali crackers",
    publishedAt: "2026-10-09",
    updatedAt: "2026-10-09",
    html: `
<p>Not everyone wants to read a hundred-line price list. A ready-made assortment &ndash; a <strong>family pack</strong> or a <strong>gift box</strong> &ndash; takes the choosing off your hands. They are not the same thing, though, and picking the right one depends on who it is for.</p>

<h2>What is a cracker gift box?</h2>
<p>A <a href="${cat("Gift Box")}">gift box</a> is a single, factory-packed carton holding a fixed mix of crackers: usually sparklers, flower pots, chakkars, pencils and a few sound crackers. Boxes come in several sizes, named by the number of items inside. They are designed to be handed over as they are, which is why companies and families buy them for staff, relatives and neighbours.</p>
<p><strong>Good for:</strong> gifting, corporate orders, and buyers who want one neat parcel per household.</p>

<h2>What is a family pack?</h2>
<p>A <a href="${cat("Family Pack")}">family pack</a> is an assortment we put together from our own catalogue, sized for a household's whole celebration. Ask us and we will tell you exactly what is in a pack &ndash; every item, its content and its quantity &ndash; before you pay. Family packs usually hold more full-size items than a gift box of the same price, because they are made for bursting, not presentation.</p>
<p><strong>Good for:</strong> a family that wants a complete, balanced Diwali without building an order line by line.</p>

<h2>Side by side</h2>
<table>
  <thead><tr><th></th><th>Gift box</th><th>Family pack</th></tr></thead>
  <tbody>
    <tr><td>Packed</td><td>Single sealed carton</td><td>Assorted from our catalogue</td></tr>
    <tr><td>Contents</td><td>Fixed by the maker</td><td>Chosen by us, item by item</td></tr>
    <tr><td>Best for</td><td>Gifting, bulk corporate orders</td><td>Your own family's celebration</td></tr>
    <tr><td>Presentation</td><td>Gift-ready</td><td>Practical</td></tr>
  </tbody>
</table>

<h2>When to build your own order instead</h2>
<p>Assortments are a compromise. If your family loves multishots and never touches bombs, or the children go through two hundred sparklers in an evening, you will get more of what you enjoy by choosing item by item. A common approach is to buy <strong>one family pack as the base</strong> and add extra boxes of the things your family always runs out of.</p>
<p>The <a href="/quick-online-cracker">Quick Purchase</a> page makes that easy: the whole catalogue in one table, with packs and single items side by side.</p>

<h2>Buying for several households</h2>
<p>Ordering gift boxes for staff, relatives or a residents' association? Put them all in one order to meet the ₹3,000 minimum easily and save on transport. Then split them up on arrival.</p>

<h2>Our recommendation</h2>
<ul>
  <li><strong>Giving them away?</strong> Gift boxes.</li>
  <li><strong>Celebrating at home and short on time?</strong> A family pack.</li>
  <li><strong>Know exactly what your family likes?</strong> Build your own, or start with a pack and add to it.</li>
</ul>
<p>See the current <a href="${cat("Family Pack")}">family packs</a> and <a href="${cat("Gift Box")}">gift boxes</a>, or read our guide to <a href="/blog/types-of-crackers-explained">types of crackers</a> if you are building your own.</p>
`,
  },
  {
    slug: "crackers-for-kids-safe-choices",
    title: "Crackers for Kids: Safe, Low-Noise Choices and Rules Every Parent Should Know",
    description:
      "The best crackers for children – sparklers, flower pots, chakkars and toy fireworks – plus the simple safety rules that keep kids' Diwali fun and injury-free.",
    image: "blog-2.jpg",
    imageAlt: "Children enjoying sparklers safely on Diwali night",
    publishedAt: "2026-10-09",
    updatedAt: "2026-10-09",
    html: `
<p>For most children, Diwali means sparklers. The trick for parents is choosing crackers that give children the fun without loud bangs, flying debris or anything too close to their hands. Here are the categories that work well for kids, by age, and the rules that matter most.</p>

<h2>Best crackers for young children (under 8)</h2>
<ul>
  <li><strong>Short sparklers (7&ndash;10 cm).</strong> They burn quickly and are light to hold. An adult should light them and stand right beside the child.</li>
  <li><strong>Small flower pots.</strong> The adult lights it, and the child watches from a few metres away. Flower pots are quiet and endlessly impressive to small children.</li>
  <li><strong>Toy fireworks.</strong> Our <a href="${cat("Toys Fireworks")}">toy fireworks</a> and <a href="${cat("Kids Item")}">kids items</a> are picked for low noise and a gentle effect.</li>
</ul>

<h2>Best crackers for older children (8&ndash;14)</h2>
<ul>
  <li><strong>Longer and colour <a href="${cat("Sparkler")}">sparklers</a></strong> (15&ndash;30 cm).</li>
  <li><strong><a href="${cat("Chakkars")}">Ground chakkars</a></strong>, lit by an adult or under close supervision.</li>
  <li><strong><a href="${cat("Sattai & Pencil")}">Pencils</a></strong> and small colour sticks.</li>
  <li><strong>Small <a href="${cat("Multishot items")}">multishot</a> boxes</strong>, which an adult lights while the children watch from a distance.</li>
</ul>

<h2>What to keep away from children</h2>
<p>Leave bombs, walas, rockets and large aerial shots to adults. They are loud, they travel or throw debris, and a misjudged second is enough for an injury. Even teenagers should light these only with an adult present.</p>

<h2>Ten safety rules for kids' crackers</h2>
<ol>
  <li>An adult is present for every cracker, every time.</li>
  <li>Dress children in close-fitting cotton clothes. Loose synthetic fabric catches fire and melts.</li>
  <li>Keep a bucket of water and a bucket of sand within reach.</li>
  <li>Drop used sparkler wires into the water bucket. They stay hot long after the sparks stop, and they cause more burns than the sparks do.</li>
  <li>Light one cracker at a time. Never light one while holding another.</li>
  <li>Stand to the side while lighting, never over the cracker, and step back at once.</li>
  <li>Never relight a cracker that did not go off. Wait several minutes, then soak it in water.</li>
  <li>Use open ground, away from parked vehicles, dry leaves and buildings.</li>
  <li>Keep pets indoors. Their hearing is far more sensitive than ours.</li>
  <li>Use footwear, never bare feet.</li>
</ol>
<p>For the full list, read our <a href="/blog/firecracker-safety-tips">firecracker safety tips</a>.</p>

<h2>Buying for children</h2>
<p>Children go through sparklers far faster than adults expect, so a box per child per evening is a sensible minimum. A <a href="${cat("Family Pack")}">family pack</a> gives you a ready-made mix of quiet items, and you can top it up with extra sparklers. Browse the <a href="${cat("Kids Item")}">kids items</a> to see what is in stock this season.</p>
`,
  },
  {
    slug: "diwali-crackers-budget-planner",
    title: "Diwali Crackers Budget Planner: How Much to Buy and How to Split It",
    description:
      "Plan your Diwali crackers budget the smart way – how to split spending across sparklers, flower pots, sky shots and walas, how much a family needs, and when to order.",
    image: "blog-4.jpg",
    imageAlt: "Planning a Diwali crackers shopping list on a budget",
    publishedAt: "2026-10-09",
    updatedAt: "2026-10-09",
    html: `
<p>Every year the same thing happens: the loud crackers are gone in twenty minutes and the children have run out of sparklers by eight o'clock. A little planning before you order gives you a longer, better evening for the same money. Here is a simple way to plan your Diwali cracker budget.</p>

<h2>Step 1: Decide who it is for</h2>
<p>Count the children, the adults who will actually light crackers, and how many evenings you are celebrating. A family of four bursting crackers on one evening needs a very different order from a joint family or an apartment group celebrating over three days.</p>

<h2>Step 2: Split the budget</h2>
<p>A balanced split that works for most families:</p>
<table>
  <thead><tr><th>Share</th><th>What</th><th>Why</th></tr></thead>
  <tbody>
    <tr><td>~30%</td><td><a href="${cat("Sparkler")}">Sparklers</a>, <a href="${cat("Sattai & Pencil")}">pencils</a></td><td>Everyone uses them, and they run out first</td></tr>
    <tr><td>~25%</td><td><a href="${cat("Flower Pot")}">Flower pots</a>, <a href="${cat("Chakkars")}">chakkars</a></td><td>Quiet, bright, and they fill the evening</td></tr>
    <tr><td>~25%</td><td><a href="${cat("Multishot items")}">Multishots</a>, <a href="${cat("Rocket & Unique")}">rockets</a>, <a href="${cat("Fancy Fireworks")}">fancy shots</a></td><td>The show everyone remembers</td></tr>
    <tr><td>~20%</td><td><a href="${cat("Sound Crackers")}">Sound crackers</a>, <a href="${cat("Digital LAR (Wala)")}">walas</a></td><td>The big moments: a wala at midnight</td></tr>
  </tbody>
</table>
<p>A family with small children can shift money from sound crackers to sparklers and flower pots. A group of teenagers will want more sky shots.</p>

<h2>Step 3: Use the price list, not guesses</h2>
<p>Download the current price list from the <strong>Price List</strong> button in our menu. It is built from the live catalogue, so the prices match checkout. Tick off quantities on paper or in a spreadsheet until the total fits your budget. Then type the same quantities into <a href="/quick-online-cracker">Quick Purchase</a>.</p>

<h2>Step 4: Consider a family pack as the base</h2>
<p>If planning item by item feels like too much, start from a <a href="${cat("Family Pack")}">family pack</a> sized for your household and add extra sparklers and one or two multishots. You get a balanced mix with almost no planning. Read <a href="/blog/family-pack-vs-gift-box-crackers">family pack vs gift box</a> for the difference.</p>

<h2>Step 5: Pool orders with neighbours</h2>
<p>Ordering together with relatives or your apartment association makes the ₹3,000 minimum easy to reach and saves on transport. One delivery is also simpler than five. Pick one person to place the order and split the items when they arrive.</p>

<h2>Step 6: Order early</h2>
<p>Diwali 2026 falls on <strong>Sunday, 8 November</strong>. Delivery usually takes 5&ndash;9 working days, and transport out of Sivakasi gets busier every day in the last fortnight. Ordering by mid-October gives you stock choice and time to spare. Popular multishots and new arrivals sell out first.</p>

<h2>Money-saving tips</h2>
<ul>
  <li><strong>Buy direct from Sivakasi.</strong> Every middleman between the factory and you adds a margin.</li>
  <li><strong>Spend on effect, not noise.</strong> A good multishot gives a minute of colour; a bomb gives one second.</li>
  <li><strong>Do not overbuy.</strong> Crackers do not improve in storage. Buy for this year and keep any leftovers cool, dry and away from children.</li>
</ul>
<p>Ready to plan? Start with the <a href="/buy-cracker-online">crackers catalogue</a>, or read <a href="/blog/how-to-order-sivakasi-crackers-online">how to order Sivakasi crackers online</a>.</p>
`,
  },
  {
    slug: "diwali-2026-crackers-price-list-guide",
    title: "Diwali 2026 Crackers Price List: How to Read It and Get the Best Value",
    description:
      "Download the Diwali 2026 Sivakasi crackers price list and learn how to read it: MRP vs offer price, what 'content' and pack size mean, and how to compare value.",
    image: "online-sale-firecrackers.jpg",
    imageAlt: "Diwali 2026 Sivakasi crackers price list",
    publishedAt: "2026-10-09",
    updatedAt: "2026-10-09",
    html: `
<p>Search for a "crackers price list" and you will find dozens of PDFs, many of them from past years. Here is how to get a price list you can actually order from for Diwali 2026, and how to read one so you compare real value instead of headline discounts.</p>

<h2>Get the current price list</h2>
<p>Use the <strong>Price List</strong> button in the menu at the top of this site. It does not hand you a PDF made months ago. It builds one on the spot from the live catalogue for the current season, so every price on it is the price you pay at checkout, and anything no longer on sale is already off the list. It also has blank columns for you to write in the quantity you want and total it up.</p>
<p>Prefer browsing on screen? The <a href="/buy-cracker-online">crackers catalogue</a> shows the same prices, with photos, grouped by category.</p>

<h2>How to read a crackers price list</h2>
<h3>Serial number (S.No)</h3>
<p>Every item has a serial number. When you order by phone, or hand us a handwritten list, the serial number tells us exactly which product you mean. Writing it next to each item saves confusion between products with similar names.</p>
<h3>Product name and category</h3>
<p>Items are grouped by category: sparklers, flower pots, chakkars, sound crackers, walas, rockets, multishots and so on. Our guide to <a href="/blog/types-of-crackers-explained">types of crackers</a> explains what each one does.</p>
<h3>Content</h3>
<p>The content (or quantity) column tells you <em>how many pieces</em> are in one unit: "10 pcs" for a box of sparklers, "5 pcs" for a box of flower pots, "1 box" for a multishot. Always compare prices per piece, not per box. A cheaper box with half the pieces is not cheaper.</p>
<h3>MRP and offer price</h3>
<p>Fireworks carry a printed MRP far above what they actually sell for, which is why price lists across the industry advertise large discounts. The discount percentage tells you very little. <strong>The number that matters is the final offer price</strong>, and that is the number to compare between sellers.</p>

<h2>Getting the best value</h2>
<ul>
  <li><strong>Compare offer price per piece</strong>, not discount percentages.</li>
  <li><strong>Check the date.</strong> A price list from last year will not match this year's prices or stock.</li>
  <li><strong>Buy direct from Sivakasi</strong>, where the crackers are made, to skip the distributor and retailer margins.</li>
  <li><strong>Look at family packs</strong> if you want an assortment. See <a href="/blog/family-pack-vs-gift-box-crackers">family pack vs gift box</a>.</li>
  <li><strong>Order early.</strong> The best-value items sell out first in a busy season.</li>
</ul>

<h2>From price list to order</h2>
<p>Once you have marked up your list, go to <a href="/quick-online-cracker">Quick Purchase</a>. It shows the whole catalogue in one table, so entering your quantities takes a couple of minutes. The minimum order is ₹3,000, and delivery usually takes 5&ndash;9 working days.</p>
<p>Planning the budget first? Read our <a href="/blog/diwali-crackers-budget-planner">Diwali crackers budget planner</a>.</p>
`,
  },
];

export function findBlogArticle(slug: string | undefined): BlogArticle | undefined {
  return BLOG_ARTICLES.find((a) => a.slug === slug);
}

/** Absolute URL of an article's image. */
export function articleImageUrl(siteUrl: string, a: BlogArticle): string {
  return `${siteUrl}/assets/img/blogs/${a.image}`;
}

/**
 * schema.org Article + BreadcrumbList for one post. Used both by the page in
 * the browser and by the build step that writes the static HTML, so the two
 * never disagree.
 */
export function articleJsonLd(siteUrl: string, a: BlogArticle): object {
  const url = `${siteUrl}/blog/${a.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: a.title,
        description: a.description,
        image: articleImageUrl(siteUrl, a),
        datePublished: a.publishedAt,
        dateModified: a.updatedAt,
        mainEntityOfPage: url,
        url,
        author: { "@type": "Organization", name: "SoundWave Crackers", url: siteUrl },
        publisher: {
          "@type": "Organization",
          name: "SoundWave Crackers",
          logo: { "@type": "ImageObject", url: `${siteUrl}/assets/img/logo/logo-2.png` },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
          { "@type": "ListItem", position: 3, name: a.title, item: url },
        ],
      },
    ],
  };
}
