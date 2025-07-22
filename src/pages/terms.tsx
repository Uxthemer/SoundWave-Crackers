import React from "react";
import { Link } from "react-router-dom"; // Remove if not using React Router

const TermsOfUse: React.FC = () => {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-card rounded-2xl p-8 shadow-lg">
          <h1 className="text-4xl font-heading text-primary-orange mb-6">
            Terms of Use
          </h1>
          <p className="text-sm text-text/60 mb-8">Last Updated: September 2025</p>

          <div className="space-y-8">

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Acceptance of Terms</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  By accessing or using the SoundWave Crackers website{" "}
                  <Link to="/" className="text-primary-orange underline hover:text-primary-orange/80">
                    www.soundwavecrackers.com
                  </Link>
                  , products, or services, you agree to comply with and be bound by these Terms of Use. If you do not agree with these terms, please do not use our website or services.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Changes to Terms</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  We may modify these Terms of Use at any time. Changes will be effective immediately upon posting on our website. Your continued use of our website and services after any changes constitutes your acceptance of the revised terms.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Use of Website</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>Eligibility:</strong> You must be at least 18 years old or have parental consent to use our website.</li>
                  <li><strong>Account Responsibility:</strong> If you create an account with us, you are responsible for maintaining the confidentiality of your account information and all activities under your account.</li>
                  <li><strong>Prohibited Activities:</strong> You agree not to engage in unlawful, harmful, or disruptive activities including unauthorized access, data mining, or transmitting malware.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Product Information</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>Accuracy:</strong> We strive to provide accurate product details but do not guarantee completeness or error-free content.</li>
                  <li><strong>Availability:</strong> Product availability may change without notice. We reserve the right to limit quantities or discontinue items.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Orders and Payments</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-2">
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>Order Acceptance:</strong> Orders are subject to acceptance. We may cancel orders due to availability, pricing errors, or payment issues.</li>
                  <li><strong>Payment:</strong> You agree to provide accurate payment details and authorize us to charge your chosen method upon purchase.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Intellectual Property</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  All content on our website—text, images, logos, and trademarks—is the property of SoundWave Crackers or its licensors and protected by intellectual property laws. You may not reuse any content without written permission.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Limitation of Liability</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  To the fullest extent permitted by law, SoundWave Crackers and its affiliates shall not be liable for any indirect or consequential damages arising from your use of our site or products. Total liability is limited to the amount paid for the product or service in question.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Indemnification</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  You agree to indemnify and hold harmless SoundWave Crackers, its officers, employees, and affiliates from any claims or liabilities arising from your use of the website or breach of these Terms of Use.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Governing Law</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  These Terms shall be governed by the laws of Tamil Nadu, India. Any disputes will be resolved in the courts located in Sivakasi, Tamil Nadu.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Termination</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80">
                <p>
                  We reserve the right to suspend or terminate your access to our website or services at any time, without notice, if you violate these Terms of Use.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">Contact Us</h2>
              <div className="bg-card/30 p-6 rounded-lg text-text/80 space-y-4">
                <div>
                   <p><strong>SoundWave Crackers</strong></p>
                <p>D.No:1/493, Main Road,</p>
                <p>Kananjampatti Village, Sivakasi – 626 123, Tamil Nadu, India</p>
                <p>Email: <a href="mailto:soundwavecrackers@gmail.com" className="text-primary-orange underline">soundwavecracker@gmail.com</a></p>
                <p>Phone: <a href="tel:+919789794518" className="text-primary-orange underline">+91 9789794518</a></p>
                <p>Phone: <a href="tel:+919363515184" className="text-primary-orange underline">+91 9363515184</a></p>
                <p>For Order: <a href="/quick-online-cracker" className="text-primary-orange underline">SoundWave Crackers - Online Crackers</a></p>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfUse;
