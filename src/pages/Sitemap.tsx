import { Link } from "react-router-dom";

export function Sitemap() {
  const currentYear = new Date().getFullYear();

  const sitemapData = {
    mainPages: [
      { title: "Home", path: "/" },
      { title: "Quick Purchase", path: "/quick-purchase" },
      { title: "Explore Crackers", path: "/explore" },
      { title: "Monthly Installment", path: "/payment" },
    ],
    accountPages: [
      { title: "Login", path: "/login" },
      { title: "Sign Up", path: "/signup" },
      { title: "Profile", path: "/profile" },
      { title: "My Orders", path: "/myorders" },
    ],
    informationPages: [
      { title: "About Us", path: "/about" },
      { title: "Contact Us", path: "/contact" },
      { title: "Blog", path: "/blog" },
      { title: "FAQ", path: "/faq" },
    ],
    policyPages: [
      { title: "Privacy Policy", path: "/privacy-policy" },
      { title: "Terms of Service", path: "/terms" },
      { title: "Shipping Policy", path: "/shipping-policy" },
      { title: "Cancellation Policy", path: "/cancellation-policy" },
    ],
  };

  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-montserrat font-bold text-center mb-12">
          Sitemap
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Main Pages */}
          <div>
            <h2 className="text-xl font-montserrat font-bold mb-4 text-primary-orange">
              Main Pages
            </h2>
            <ul className="space-y-2">
              {sitemapData.mainPages.map((page) => (
                <li key={page.path}>
                  <Link
                    to={page.path}
                    className="text-text/60 hover:text-primary-orange transition-colors"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account Pages */}
          <div>
            <h2 className="text-xl font-montserrat font-bold mb-4 text-primary-orange">
              Account
            </h2>
            <ul className="space-y-2">
              {sitemapData.accountPages.map((page) => (
                <li key={page.path}>
                  <Link
                    to={page.path}
                    className="text-text/60 hover:text-primary-orange transition-colors"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Information Pages */}
          <div>
            <h2 className="text-xl font-montserrat font-bold mb-4 text-primary-orange">
              Information
            </h2>
            <ul className="space-y-2">
              {sitemapData.informationPages.map((page) => (
                <li key={page.path}>
                  <Link
                    to={page.path}
                    className="text-text/60 hover:text-primary-orange transition-colors"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Policy Pages */}
          <div>
            <h2 className="text-xl font-montserrat font-bold mb-4 text-primary-orange">
              Policies
            </h2>
            <ul className="space-y-2">
              {sitemapData.policyPages.map((page) => (
                <li key={page.path}>
                  <Link
                    to={page.path}
                    className="text-text/60 hover:text-primary-orange transition-colors"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 text-center text-text/60">
          <p>© {currentYear} SoundWave Crackers. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
} 