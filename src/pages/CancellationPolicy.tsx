const CancellationPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-background py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-card rounded-2xl p-8 shadow-lg">
          <h1 className="text-4xl font-heading text-primary-orange mb-6">
            Cancellation & Return Policy
          </h1>
          <p className="text-sm text-text/60 mb-8">Last Updated: 05/03/2025</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Cancellation Policy
              </h2>
              <div className="bg-card/30 p-6 rounded-lg space-y-4">
                <p className="text-text/80">
                  Orders placed can be cancelled only before the order gets shipped.
                </p>
                <p className="text-text/80">
                  Once an order is shipped, neither the money nor the goods can be refunded or exchanged.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Order Tracking
              </h2>
              <div className="bg-card/30 p-6 rounded-lg space-y-4">
                <p className="text-text/80">
                  Track your parcel using the LR number and contact the respective lorry drivers for updates.
                </p>
                <p className="text-text/80">
                  Estimated delivery time will be provided at the time of order confirmation. Delays may occur due to unforeseen circumstances.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Product Availability
              </h2>
              <div className="bg-card/30 p-6 rounded-lg space-y-4">
                <p className="text-text/80">
                  All products are subject to availability. In case of out-of-stock items, we will notify you and offer alternatives or a refund.
                </p>
                <p className="text-text/80">
                  We ensure that all products are of the highest quality. Any complaints regarding product quality should be reported within 24 hours of delivery.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-montserrat font-bold text-primary-orange mb-4">
                Important Notes
              </h2>
              <div className="bg-card/30 p-6 rounded-lg space-y-4">
                <p className="text-text/80">
                  Product appearance may vary from the images shown on the website.
                </p>
                <p className="text-text/80">
                  Customers are advised to follow all safety precautions and guidelines provided with the products. We are not responsible for any accidents or injuries caused by improper use.
                </p>
              </div>
            </section>

            <div className="bg-primary-orange/10 p-6 rounded-lg mt-8">
              <p className="text-primary-orange font-montserrat">
                For any queries or assistance, please contact our customer support team via email or phone.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancellationPolicy;