import React from "react";
import { Link } from "react-router-dom"; // Only if you're using React Router

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-card rounded-2xl p-8 shadow-lg">
          <h1 className="text-4xl font-heading text-primary-orange mb-6">
            Privacy Policy
          </h1>
          <p className="text-sm text-text/60 mb-8">Last Updated: September 2025</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Introduction
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p className="mb-4">
                  Welcome to <strong>SoundWave Crackers</strong> (“we,” “our,” “us”). We value your privacy and are committed to protecting your personal information.
                </p>
                <p>
                  This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website{" "}
                  <Link to="/" className="text-primary-orange underline hover:text-primary-orange/80">
                    www.soundwavecrackers.com
                  </Link>, use our services, or purchase our products. By using our website or services, you agree to the terms outlined in this Privacy Policy.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Information We Collect
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-4">
                <p><strong>Personal Information:</strong> When you purchase products, sign up for newsletters, or contact us, we may collect personal information such as your name, email address, phone number, and payment details.</p>
                <p><strong>Transactional Information:</strong> Details about your purchases, including the products you buy and your transaction history.</p>
                <p><strong>Usage Data:</strong> Information about how you use our website, such as IP address, browser type, pages visited, and the date and time of your visits.</p>
                <p><strong>Cookies and Tracking Technologies:</strong> We use cookies and similar technologies to enhance your experience on our website and track usage patterns.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                How We Use Your Information
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>To Process Transactions:</strong> To complete and manage your purchases, process payments, and deliver products.</li>
                  <li><strong>To Improve Our Services:</strong> To understand your preferences and improve our website, products, and customer service.</li>
                  <li><strong>To Communicate with You:</strong> To send order confirmations, updates, promotional offers, and other communications that you may find relevant.</li>
                  <li><strong>To Provide Customer Support:</strong> To respond to your inquiries, requests, and feedback.</li>
                  <li><strong>To Comply with Legal Obligations:</strong> To adhere to applicable laws, regulations, and legal processes.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                How We Share Your Information
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>Service Providers:</strong> Third-party vendors who perform services on our behalf, such as payment processors, shipping companies, and marketing partners.</li>
                  <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction.</li>
                  <li><strong>Legal Requirements:</strong> To comply with legal obligations or respond to lawful requests from public authorities.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Your Choices
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>Opt-Out:</strong> You can opt-out of receiving promotional emails by following the instructions in those emails or by contacting us directly.</li>
                  <li><strong>Access and Update:</strong> You may access and update your personal information by contacting us or through your account settings on our website.</li>
                  <li><strong>Cookies:</strong> You can manage your cookie preferences through your browser settings. Please note that disabling cookies may affect your ability to use certain features of our website.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Data Security
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  We implement reasonable measures to protect your information from unauthorized access, disclosure, alteration, or destruction. However, no security system is impenetrable, and we cannot guarantee absolute security.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Children's Privacy
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  Our website and services are not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will take steps to delete it.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Changes to This Privacy Policy
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  We may update this Privacy Policy from time to time. Any changes will be posted on our website with an updated effective date. We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your information.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Contact Us
              </h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <p><strong>SoundWave Crackers</strong></p>
                <p>D.No:1/493, Main Road,</p>
                <p>Kananjampatti Village, Sivakasi – 626 123, Tamil Nadu, India</p>
                <p>Email: <a href="mailto:soundwavecrackers@gmail.com" className="text-primary-orange underline">soundwavecracker@gmail.com</a></p>
                <p>Phone: <a href="tel:+919789794518" className="text-primary-orange underline">+91 9789794518</a></p>
                <p>Phone: <a href="tel:+919363515184" className="text-primary-orange underline">+91 9363515184</a></p>
                <p>For Order: <a href="/quick-online-cracker" className="text-primary-orange underline">SoundWave Crackers - Online Crackers</a></p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
