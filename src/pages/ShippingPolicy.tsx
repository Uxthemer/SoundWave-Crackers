import React from "react";

const ShippingPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-card rounded-2xl p-8 shadow-lg">
          <h1 className="text-4xl font-heading text-primary-orange mb-6">
            Shipping & Delivery Policy
          </h1>
          <p className="text-sm text-text/60 mb-8">Last Updated: 05/03/2025</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Login Requirement
              </h2>
              <div className="bg-card/30 p-6 rounded-lg">
                <p className="text-text/80">
                  Before placing an order, you must create an account.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Shipping Details
              </h2>
              <div className="bg-card/30 p-6 rounded-lg">
                <p className="text-text/80">
                  Orders will be shipped in a single box whenever possible. However, for certain
                  types of orders, multiple boxes may be required. You can track your shipment
                  and check packaging details after dispatch.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Delivery Timeline
              </h2>
              <div className="bg-card/30 p-6 rounded-lg">
                <p className="text-text/80">
                  Orders are typically delivered within <strong>5-9 working days</strong>.
                  Estimated delivery times for specific items are displayed on the product page
                  and in the shopping cart.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Shipping Charges
              </h2>
              <div className="bg-card/30 p-6 rounded-lg">
                <p className="text-text/80">
                  Shipping costs vary depending on your location and the items ordered. The
                  shipping charge for your order will be displayed before you confirm your
                  purchase.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Delivery Areas
              </h2>
              <div className="bg-card/30 p-6 rounded-lg">
                <p className="text-text/80">
                  We currently deliver to <strong>12,000 locations across India</strong>.
                  However, <strong>international shipping is not available</strong> at this
                  time.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Important Guidelines
              </h2>
              <div className="bg-card/30 p-6 rounded-lg">
                <ul className="list-disc list-inside space-y-2 text-text/80">
                  <li>All items will be shipped with an invoice from the seller.</li>
                  <li>
                    If you do not receive an invoice, please contact us via phone or email at
                    <strong> soundwavecracker@gmail.com</strong>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShippingPolicy;