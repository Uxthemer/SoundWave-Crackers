import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface Blog {
  id: string;
  title: string;
  slug: string;
  image_url: string;
  published_at: string;
}

export function BlogSection() {
  const [blogs, setBlogs] = useState<Blog[]>([]);

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const { data, error } = await supabase
          .from('blogs')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setBlogs(data || []);
      } catch (error) {
        console.error('Error fetching blogs:', error);
      }
    };

    fetchBlogs();
  }, []);

  return (
    <section className="py-16">
      <div className="container mx-auto px-6">
        <h2 className="font-heading text-4xl text-center mb-12">Latest Blog Posts</h2>
        <Swiper
          modules={[Navigation, Pagination]}
          navigation
          pagination={{ clickable: true }}
          spaceBetween={24}
          slidesPerView={1}
          breakpoints={{
            640: { slidesPerView: 2 },
            1024: { slidesPerView: 3 },
            1280: { slidesPerView: 4 }
          }}
          className="pb-12"
        >
          {blogs.map((blog) => (
            <SwiperSlide key={blog.id}>
              <Link to={`/blog/${blog.slug}`}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="card group h-[300px] flex flex-col"
                >
                  <div className="relative h-48 overflow-hidden rounded-lg">
                    <img
                      src={blog.image_url ? `/assets/img/blogs/${blog.image_url}` : `/assets/img/blogs/online-sale-firecrackers.jpg`}
                      alt={blog.title}
                      className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-montserrat font-bold text-lg mb-2 line-clamp-2 group-hover:text-primary-orange transition-colors">
                      {blog.title}
                    </h3>
                    <time className="text-sm text-text/60 mt-auto">
                      {format(new Date(blog.published_at), 'MMMM dd, yyyy')}
                    </time>
                  </div>
                </motion.div>
              </Link>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}