const CancellationReturnPolicy: React.FC = () => {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-primary-orange text-2xl font-bold mb-4">
          Cancellation & Return Policy
        </h1>
        <p className="text-black text-sm mb-2">Last updated on 05/03/2025</p>
        
        <h2 className="text-primary-orange text-xl font-semibold mt-6 mb-2">
          Cancellation Policy:
        </h2>
        <p className="text-black mb-4">
          Orders placed can be cancelled only before the order gets shipped.
        </p>
        <p className="text-black mb-4">
          Once an order is shipped, neither the money nor the goods can be refunded or exchanged.
        </p>
        <p className="text-black mb-4">
          Track your parcel using the LR number and contact the respective lorry drivers for updates.
        </p>
        <p className="text-black mb-4">
          Estimated delivery time will be provided at the time of order confirmation. Delays may occur due to unforeseen circumstances.
        </p>
        
        <h2 className="text-primary-orange text-xl font-semibold mt-6 mb-2">
          Product Stockout:
        </h2>
        <p className="text-black mb-4">
          All products are subject to availability. In case of out-of-stock items, we will notify you and offer alternatives or a refund.
        </p>
        <p className="text-black mb-4">
          We ensure that all products are of the highest quality. Any complaints regarding product quality should be reported within 24 hours of delivery.
        </p>
        <p className="text-black mb-4">
          It may or may not look like the Image on the website.
        </p>
        <p className="text-black mb-4">
          Customers are advised to follow all safety precautions and guidelines provided with the products. We are not responsible for any accidents or injuries caused by improper use.
        </p>
        <p className="text-black mt-6">
          For any queries or assistance, please contact our customer support team via email or phone.
        </p>
      </div>
    );
  };
  
  export default CancellationReturnPolicy;
  