import fs from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import {
  BLOG_ARTICLES,
  BLOG_INDEX_DESCRIPTION,
  BLOG_INDEX_TITLE,
  articleImageUrl,
  articleJsonLd,
  type BlogArticle,
} from "../src/data/blogPosts";
import { SITE_URL } from "../src/lib/site";

/*
 * Writes /blog and every article in src/data/blogPosts.ts out as its own HTML
 * file after the build: dist/blog/index.html and dist/blog/<slug>/index.html.
 *
 * The app is a single page, so every URL is otherwise answered by the same
 * index.html — one title, one description, one canonical (the homepage) and
 * an empty <div id="root">. Google can run the JavaScript, but it does so
 * later and less reliably than it reads HTML, and every other crawler and
 * link preview (WhatsApp, Facebook) never does. These files give each post its
 * own head and its full text in the first response.
 *
 * Netlify serves a file that exists before the `/* /index.html 200` rewrite in
 * public/_redirects, so these are what /blog/<slug> returns. The app then
 * starts as normal: createRoot() replaces what is inside #root.
 *
 * It also adds each article to dist/sitemap.xml if it is not listed there.
 */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Head {
  title: string;
  description: string;
  url: string;
  image?: string;
  type: "website" | "article";
  jsonLd?: object;
  publishedAt?: string;
  updatedAt?: string;
}

function setMeta(html: string, attr: "name" | "property", key: string, value: string): string {
  const tag = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
  if (tag.test(html)) return html.replace(tag, `$1${esc(value)}$2`);
  return html.replace("</head>", `    <meta ${attr}="${key}" content="${esc(value)}" />\n  </head>`);
}

function withHead(template: string, head: Head): string {
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(head.title)}</title>`);
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${esc(head.url)}" />`
  );
  html = setMeta(html, "name", "description", head.description);
  html = setMeta(html, "property", "og:title", head.title);
  html = setMeta(html, "property", "og:description", head.description);
  html = setMeta(html, "property", "og:url", head.url);
  html = setMeta(html, "property", "og:type", head.type);
  html = setMeta(html, "name", "twitter:title", head.title);
  html = setMeta(html, "name", "twitter:description", head.description);
  if (head.image) {
    html = setMeta(html, "property", "og:image", head.image);
    html = setMeta(html, "property", "og:image:alt", head.title);
    html = setMeta(html, "name", "twitter:image", head.image);
  }
  if (head.publishedAt) html = setMeta(html, "property", "article:published_time", head.publishedAt);
  if (head.updatedAt) {
    html = setMeta(html, "property", "article:modified_time", head.updatedAt);
    html = setMeta(html, "property", "og:updated_time", head.updatedAt);
  }
  if (head.jsonLd) {
    // "</" cannot appear inside a script element.
    const json = JSON.stringify(head.jsonLd).replace(/<\//g, "<\\/");
    html = html.replace(
      "</head>",
      `    <script type="application/ld+json">${json}</script>\n  </head>`
    );
  }
  return html;
}

function withBody(html: string, body: string): string {
  const root = '<div id="root"></div>';
  if (!html.includes(root)) throw new Error(`prerenderBlog: ${root} not found in index.html`);
  return html.replace(root, `<div id="root">${body}</div>`);
}

const displayDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

function articleList(articles: BlogArticle[]): string {
  return articles
    .map(
      (a) =>
        `<li><a class="text-primary-orange hover:text-primary-red" href="/blog/${a.slug}">${esc(a.title)}</a></li>`
    )
    .join("");
}

function articlePage(a: BlogArticle): string {
  const others = BLOG_ARTICLES.filter((o) => o.slug !== a.slug);
  return `
<main class="container mx-auto px-4 pt-12 pb-12">
  <nav class="text-sm text-text/60 mb-8"><a href="/">Home</a> › <a href="/blog">Blog</a></nav>
  <article class="bg-card rounded-2xl overflow-hidden shadow-lg max-w-4xl">
    <img src="/assets/img/blogs/${esc(a.image)}" alt="${esc(a.imageAlt)}" class="w-full aspect-video object-cover" />
    <div class="px-4 pt-6 pb-8 sm:px-8">
      <h1 class="font-montserrat font-bold text-2xl sm:text-3xl text-primary-orange mb-3 leading-tight">${esc(a.title)}</h1>
      <p class="text-sm text-text/60 mb-6"><time datetime="${a.updatedAt}">${displayDate(a.updatedAt)}</time> • SoundWave Crackers, Sivakasi</p>
      <div class="blog-article">${a.html}</div>
    </div>
  </article>
  <aside class="mt-10 max-w-4xl">
    <h2 class="font-heading text-2xl mb-4">More crackers guides</h2>
    <ul class="blog-article">${articleList(others)}</ul>
  </aside>
</main>`;
}

function indexPage(): string {
  return `
<main class="container mx-auto px-4 pt-12 pb-16">
  <h1 class="font-heading text-4xl sm:text-5xl mb-4 text-center">Crackers Guides &amp; Diwali Tips</h1>
  <p class="text-text/70 text-center mb-10">Straight from Sivakasi: how to choose, plan, order and enjoy your crackers safely.</p>
  <ul class="blog-article max-w-3xl mx-auto">${BLOG_ARTICLES.map(
    (a) =>
      `<li><a href="/blog/${a.slug}">${esc(a.title)}</a><br /><span class="text-sm text-text/60">${esc(a.description)}</span></li>`
  ).join("")}</ul>
</main>`;
}

function addToSitemap(file: string) {
  if (!fs.existsSync(file)) return;
  let xml = fs.readFileSync(file, "utf8");
  const missing = BLOG_ARTICLES.filter((a) => !xml.includes(`<loc>${SITE_URL}/blog/${a.slug}</loc>`));
  if (missing.length === 0) return;
  const entries = missing
    .map(
      (a) => `   <url>
      <loc>${SITE_URL}/blog/${a.slug}</loc>
      <lastmod>${a.updatedAt}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.7</priority>
   </url>
`
    )
    .join("");
  xml = xml.replace("</urlset>", `${entries}</urlset>`);
  fs.writeFileSync(file, xml);
}

function write(file: string, html: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

export function prerenderBlog(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "prerender-blog",
    apply: "build",
    configResolved(c) {
      config = c;
    },
    writeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const template = fs.readFileSync(path.join(outDir, "index.html"), "utf8");

      write(
        path.join(outDir, "blog", "index.html"),
        withBody(
          withHead(template, {
            title: BLOG_INDEX_TITLE,
            description: BLOG_INDEX_DESCRIPTION,
            url: `${SITE_URL}/blog`,
            type: "website",
          }),
          indexPage()
        )
      );

      for (const a of BLOG_ARTICLES) {
        write(
          path.join(outDir, "blog", a.slug, "index.html"),
          withBody(
            withHead(template, {
              title: `${a.title} | SoundWave Crackers`,
              description: a.description,
              url: `${SITE_URL}/blog/${a.slug}`,
              image: articleImageUrl(SITE_URL, a),
              type: "article",
              jsonLd: articleJsonLd(SITE_URL, a),
              publishedAt: a.publishedAt,
              updatedAt: a.updatedAt,
            }),
            articlePage(a)
          )
        );
      }

      addToSitemap(path.join(outDir, "sitemap.xml"));
    },
  };
}
