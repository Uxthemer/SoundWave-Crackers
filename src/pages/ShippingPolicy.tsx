import React from "react";

const ShippingPolicy: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-primary-orange mb-6">
        Shipping & Delivery Policy 🚚
      </h1>
      <p className="text-sm text-gray-500 mb-4">Last Updated: 05/03/2025</p>

      <div className="space-y-6 text-black">
        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Login Requirement 🔑</h2>
          <p>Before placing an order, you must create an account.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Shipping Details 📦</h2>
          <p>
            Orders will be shipped in a single box whenever possible. However, for certain
            types of orders, multiple boxes may be required. You can track your shipment
            and check packaging details after dispatch.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Delivery Timeline ⏳</h2>
          <p>
            Orders are typically delivered within <strong>5-9 working days</strong>.
            Estimated delivery times for specific items are displayed on the product page
            and in the shopping cart. If your order contains multiple items with different
            delivery times, the longest delivery time will apply.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Shipping Charges 💰</h2>
          <p>
            Shipping costs vary depending on your location and the items ordered. The
            shipping charge for your order will be displayed before you confirm your
            purchase on <strong>soundwavecrackers.com</strong>. If you place an order via
            our <strong>call center</strong>, the representative will inform you of the
            applicable charges. If ordering online, the shipping charge will be visible in
            your shopping cart or at checkout.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Can I Choose My Delivery Date? 📅</h2>
          <p>At this time, we do <strong>not</strong> offer the option to select a preferred delivery date.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Potential Delivery Issues ⚠️</h2>
          <p>
            Despite our best efforts, occasional delays or delivery issues may arise.
            <strong>SoundWave Crackers</strong> is committed to investigating and resolving
            any such concerns as quickly as possible to ensure customer satisfaction.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Delivery Areas 🌍</h2>
          <p>
            We currently deliver to <strong>12,000 locations across India</strong>.
            However, <strong>international shipping is not available</strong> at this
            time. To ensure timely and secure deliveries, we partner with
            <strong> trusted and experienced courier services</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Expedited Shipping 🚀</h2>
          <p>
            We do <strong>not</strong> currently offer expedited shipping. If this service
            becomes available in the future and your area is eligible, you will be notified
            accordingly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-primary-orange">Important Guidelines 📝</h2>
          <ul className="list-disc list-inside">
            <li>All items will be shipped with an invoice from the seller.</li>
            <li>
              If you do not receive an invoice, please contact us via
              <strong> phone</strong> or email at
              <strong> soundwavecrackers@gmail.com</strong> with your order reference number.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default ShippingPolicy;
