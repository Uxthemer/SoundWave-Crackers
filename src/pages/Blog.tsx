import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { blogImageSrc, fetchBlogSummaries, type BlogSummary } from '../lib/blogs';
import { usePageMeta } from '../lib/seo';
import { BLOG_INDEX_DESCRIPTION, BLOG_INDEX_TITLE } from '../data/blogPosts';

export function Blog() {
  const [blogs, setBlogs] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(true);

  usePageMeta({ title: BLOG_INDEX_TITLE, description: BLOG_INDEX_DESCRIPTION });

  useEffect(() => {
    fetchBlogSummaries()
      .then(setBlogs)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen pt-12 pb-16">
      <div className="container mx-auto px-4">
        <header className="text-center max-w-2xl mx-auto mb-10">
          <h1 className="font-heading text-4xl sm:text-5xl mb-4">Crackers Guides &amp; Diwali Tips</h1>
          <p className="text-text/70">
            Straight from Sivakasi: how to choose, plan, order and enjoy your crackers safely.
          </p>
        </header>

        {loading && blogs.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogs.map((blog) => (
              <Link
                key={blog.slug}
                to={`/blog/${blog.slug}`}
                className="card group flex flex-col"
              >
                <div className="relative h-48 overflow-hidden rounded-lg">
                  <img
                    src={blogImageSrc(blog.image)}
                    alt={blog.title}
                    loading="lazy"
                    className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h2 className="font-montserrat font-bold text-lg mb-2 group-hover:text-primary-orange transition-colors">
                    {blog.title}
                  </h2>
                  <time className="text-sm text-text/60 mt-auto">
                    {format(new Date(blog.publishedAt), 'MMMM dd, yyyy')}
                  </time>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
