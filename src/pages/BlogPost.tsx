import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DOMPurify from 'dompurify';

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

export function BlogPost() {
  const { slug } = useParams();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [relatedBlogs, setRelatedBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlogAndRelated = async () => {
      try {
        // Fetch main blog post
        const { data: blogData, error: blogError } = await supabase
          .from('blogs')
          .select(`
            *,
            author:author_id (
              full_name
            )
          `)
          .eq('slug', slug)
          .single();

        if (blogError) throw blogError;
        setBlog(blogData);

        // Fetch related blogs (excluding current blog)
        const { data: relatedData, error: relatedError } = await supabase
          .from('blogs')
          .select('*')
          .neq('slug', slug)
          .order('published_at', { ascending: false })
          .limit(3);

        if (relatedError) throw relatedError;
        setRelatedBlogs(relatedData || []);
      } catch (error) {
        console.error('Error fetching blog:', error);
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchBlogAndRelated();
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen pt-8 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!blog) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Blog post not found</h1>
            <Link
              to="/"
              className="text-primary-orange hover:text-primary-orange/80 inline-flex items-center"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Home
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
          to="/"
          className="inline-flex items-center text-primary-orange hover:text-primary-orange/80 mb-8"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <article className="lg:col-span-2">
            <div className="bg-card rounded-2xl overflow-hidden shadow-lg">
              {/* <div className="aspect-video">
                <img
                  src={`/assets/img/blogs/${blog.image_url}` || '/assets/img/blogs/online-sale-firecrackers.jpg'}
                  alt={blog.title}
                  className="w-full h-full object-cover"
                />
              </div> */}

              <div className="p-8">
                {/* <h1 className="text-4xl font-heading text-primary-orange mb-4">
                  {blog.title}
                </h1> */}

                {/* <div className="flex items-center text-text/60 mb-8">
                  <time dateTime={blog.published_at}>
                    {format(new Date(blog.published_at), 'MMMM dd, yyyy')}
                  </time>
                  {blog.author && (
                    <>
                      <span className="mx-2">•</span>
                      <span>{blog.author.full_name}</span>
                    </>
                  )}
                </div> */}

                {/* <div className="prose prose-lg max-w-none">
                  {blog.content.split('\n\n').map((paragraph, index) => (
                    <p key={index} className="mb-4 text-text/80">
                      {paragraph}
                    </p>
                  ))}
                </div> */}
                <div className="prose prose-lg max-w-none">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(blog.content || ''),
                    }}
                  />
                </div>
              </div>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="bg-card rounded-2xl p-6 shadow-lg sticky top-24">
              <h2 className="font-heading text-2xl mb-6">Related Posts</h2>
              <div className="space-y-6">
                {relatedBlogs.map((relatedBlog) => (
                  <Link
                    key={relatedBlog.id}
                    to={`/blog/${relatedBlog.slug}`}
                    className="block group"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="w-24 h-24 flex-shrink-0 overflow-hidden rounded-lg">
                        <img
                          src={relatedBlog.image_url ? `/assets/img/blogs/${relatedBlog.image_url}` : '/assets/img/blogs/online-sale-firecrackers.jpg'}
                          alt={relatedBlog.title}
                          className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                        />
                      </div>
                      <div>
                        <h3 className="font-montserrat font-bold text-lg mb-2 group-hover:text-primary-orange transition-colors line-clamp-2">
                          {relatedBlog.title}
                        </h3>
                        <time className="text-sm text-text/60">
                          {format(new Date(relatedBlog.published_at), 'MMM dd, yyyy')}
                        </time>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}