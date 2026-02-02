import { supabase } from '../lib/supabase';

export async function generateDynamicSitemap() {
  const baseUrl = "https://soundwavecrackers.com";
  const lastmod = new Date().toISOString();

  // Fetch all blogs (assuming table: 'blogs', column: 'slug')
  const { data: blogs, error: blogError } = await supabase
    .from("blogs")
    .select("slug")
    .eq("is_public", true);

  // Fetch all products (assuming table: 'products', column: 'slug')
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("slug")
    .eq("is_active", true);

  if (blogError) {
    console.error("Error fetching blogs:", blogError.message);
  }
  if (productError) {
    console.error("Error fetching products:", productError.message);
  }

  let sitemap = "";

  // Blog URLs
  if (blogs && blogs.length > 0) {
    blogs.forEach((blog) => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/blog/${blog.slug}</loc>\n`;
      sitemap += `    <lastmod>${lastmod}</lastmod>\n`;
      sitemap += `    <changefreq>weekly</changefreq>\n`;
      sitemap += `    <priority>0.6</priority>\n`;
      sitemap += `  </url>\n`;
    });
  }

  // Product URLs
  if (products && products.length > 0) {
    products.forEach((product) => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/product/${product.slug}</loc>\n`;
      sitemap += `    <lastmod>${lastmod}</lastmod>\n`;
      sitemap += `    <changefreq>weekly</changefreq>\n`;
      sitemap += `    <priority>0.7</priority>\n`;
      sitemap += `  </url>\n`;
    });
  }

  // Print only dynamic URLs content
  console.log(sitemap);
}

// To run in console (Node.js REPL or browser console with proper setup):
// import { generateDynamicSitemap } from "./src/scripts/generateDynamicSitemap";
// generateDynamicSitemap();