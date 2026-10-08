import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DOMPurify from 'dompurify';
import {
  articleImageUrl,
  articleJsonLd,
  findBlogArticle,
} from '../data/blogPosts';
import { blogImageSrc, fetchBlogSummaries, type BlogSummary } from '../lib/blogs';
import { SITE_URL, usePageMeta, type PageMeta } from '../lib/seo';

interface Blog {
  id: string;
  title: string;
  slug: string;
  content: string;
  image_url: string;
  published_at: string;
  author: {
    full_name: string;
  } | null;
}

// Database posts carry no description of their own; the opening text of the
// post is the closest thing to one.
function excerpt(html: string, length = 155): string {
  const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

export function BlogPost() {
  const { slug } = useParams();
  const article = findBlogArticle(slug);
  const [blog, setBlog] = useState<Blog | null>(null);
  const [relatedBlogs, setRelatedBlogs] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(!article);

  useEffect(() => {
    if (!slug) return;

    fetchBlogSummaries()
      .then((all) => setRelatedBlogs(all.filter((b) => b.slug !== slug).slice(0, 3)))
      .catch((error) => console.error('Error fetching related blogs:', error));

    // Articles that ship with the build need no fetch.
    if (findBlogArticle(slug)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('blogs')
      .select(`
        *,
        author:author_id (
          full_name
        )
      `)
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Error fetching blog:', error);
        setBlog(data ?? null);
        setLoading(false);
      });
  }, [slug]);

  let meta: PageMeta | null = null;
  if (article) {
    meta = {
      title: `${article.title} | SoundWave Crackers`,
      description: article.description,
      image: articleImageUrl(SITE_URL, article),
      type: 'article',
      jsonLd: articleJsonLd(SITE_URL, article),
    };
  } else if (blog) {
    meta = {
      title: `${blog.title} | SoundWave Crackers`,
      description: excerpt(blog.content || ''),
      image: `${SITE_URL}${blogImageSrc(blog.image_url)}`,
      type: 'article',
    };
  }
  usePageMeta(meta);

  if (loading) {
    return (
      <div className="min-h-screen pt-8 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!article && !blog) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Blog post not found</h1>
            <Link
              to="/blog"
              className="text-primary-orange hover:text-primary-orange/80 inline-flex items-center"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              All articles
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-12 pb-12">
      <div className="container mx-auto px-4">
        <Link
          to="/blog"
          className="inline-flex items-center text-primary-orange hover:text-primary-orange/80 mb-8"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          All articles
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <article className="lg:col-span-2">
            <div className="bg-card rounded-2xl overflow-hidden shadow-lg">
              {article ? (
                <>
                  <div className="aspect-video">
                    <img
                      src={blogImageSrc(article.image)}
                      alt={article.imageAlt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-4 pt-6 pb-8 sm:px-8">
                    <h1 className="font-montserrat font-bold text-2xl sm:text-3xl text-primary-orange mb-3 leading-tight">
                      {article.title}
                    </h1>
                    <div className="text-sm text-text/60 mb-6">
                      <time dateTime={article.updatedAt}>
                        {format(new Date(article.updatedAt), 'MMMM dd, yyyy')}
                      </time>
                      <span className="mx-2">•</span>
                      <span>SoundWave Crackers, Sivakasi</span>
                    </div>
                    {/* Our own text, from the repo — not user content. */}
                    <div
                      className="blog-article"
                      dangerouslySetInnerHTML={{ __html: article.html }}
                    />
                  </div>
                </>
              ) : (
                <div className="pt-2 px-2 pb-4 sm:pt-6 sm:px-6 sm:pb-8">
                  <div className="prose prose-lg max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(blog?.content || ''),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="bg-card rounded-2xl p-6 shadow-lg sticky top-24">
              <h2 className="font-heading text-2xl mb-6">Related Posts</h2>
              <div className="space-y-6">
                {relatedBlogs.map((relatedBlog) => (
                  <Link
                    key={relatedBlog.slug}
                    to={`/blog/${relatedBlog.slug}`}
                    className="block group"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="w-24 h-24 flex-shrink-0 overflow-hidden rounded-lg">
                        <img
                          src={blogImageSrc(relatedBlog.image)}
                          alt={relatedBlog.title}
                          className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                        />
                      </div>
                      <div>
                        <h3 className="font-montserrat font-bold text-lg mb-2 group-hover:text-primary-orange transition-colors line-clamp-2">
                          {relatedBlog.title}
                        </h3>
                        <time className="text-sm text-text/60">
                          {format(new Date(relatedBlog.publishedAt), 'MMM dd, yyyy')}
                        </time>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Link
                to="/blog"
                className="block mt-6 text-primary-orange hover:text-primary-orange/80 font-semibold"
              >
                See all articles →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
