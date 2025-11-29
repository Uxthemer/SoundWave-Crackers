import { motion } from 'framer-motion';
import { LayoutGrid, LayoutList, Filter, Plus, Minus, ShoppingCart } from 'lucide-react';
import { products } from '../data/products';

export function Payment() {
  
  return (
    <div className="pt-2 min-h-screen">
      <div className="container mx-auto px-6 py-8 mt-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
          <h1 className="font-heading text-4xl">Payment Links</h1>
          <div className="flex items-center space-x-4">
           
          </div>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
            <motion.div
              key='01'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className='card'
            >
              <div className='mb-2'>
                <img
                  src='/assets/img/payment/QR-Code-payment.jpg'
                  alt='QR Code Payment'
                  className="w-full h-auto object-cover rounded-lg"
                />
              </div>
             
            </motion.div>

            <motion.div
              key='02'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`card`}
            >
              <div className='mb-2'>
                <p>Google Pay UPI ID:</p>
                <p>selvakumar541989@oksbi</p>
              </div>
             
            </motion.div>

            <motion.div
              key='03'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`card`}
            >
              <div className='mb-2'>
                <p>Account Name: Selvakumar</p>
                <p>Account No: </p>
                <p>Bank Name: State Bank Of India</p>
                <p>IFSC Code: SBIN0013833</p>
              </div>
             
            </motion.div>
        </div>
      </div>
    </div>
  );
}