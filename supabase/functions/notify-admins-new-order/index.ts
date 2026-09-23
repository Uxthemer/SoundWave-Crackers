import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import admin from 'npm:firebase-admin@11';

// Initialize Firebase Admin (Singleton)
let firebaseApp;

function getFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '{}');
  
  if (!serviceAccount.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or invalid');
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  return firebaseApp;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendWhatsApp(to: string, body: string) {
  const token = Deno.env.get('META_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_PHONE_NUMBER_ID');

  if (!token || !phoneId) {
    console.error("Missing Meta credentials for WhatsApp");
    return;
  }

  try {
    const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: body }, 
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`WhatsApp Error for ${to}:`, JSON.stringify(data));
    } else {
      console.log(`WhatsApp sent to ${to}:`, JSON.stringify(data));
    }
  } catch (err) {
    console.error("Error sending WhatsApp:", err);
  }
}

serve(async (req) => {
  // 0. IMMEDIATE LOG to prove we are running
  console.log("🔔 Function notify-admins-new-order invoked!");
  const envServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  console.log(`Debug: FIREBASE_SERVICE_ACCOUNT is ${envServiceAccount ? 'Set (Length: ' + envServiceAccount.length + ')' : 'MISSING'}`);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // USE SERVICE ROLE KEY to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Check if Push is enabled globally
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('enable_push_notifications')
      .single();

    if (settingsError) {
        console.error("Error fetching settings:", settingsError);
    }

    console.log("Debug: App Settings:", settings);

    if (settings && settings.enable_push_notifications === false) {
       console.log("Push notifications disabled in settings.");
       // We continue strictly for logging/debugging purposes or valid return. 
       // Actually user probably wants it to stop if disabled.
       return new Response(JSON.stringify({ message: "Push disabled in settings" }), { headers: corsHeaders });
    }

    // 2. Parse Webhook Payload
    const payload = await req.json();
    console.log("Packet received:", JSON.stringify(payload));

    // HANDLE TEST NOTIFICATION
    if (payload.test === true) {
        const isBroadcast = payload.broadcast === true;
        let tokensToSend = [];

        if (isBroadcast) {
            // Fetch all admin tokens
             const { data: subscriptions, error: subError } = await supabase
                .from('admin_push_subscriptions')
                .select('fcm_token');
             
             if (subError) {
                 console.error("Error fetching subscriptions:", subError);
             }

             if (subscriptions) {
                 console.log(`Found ${subscriptions.length} subscriptions for broadcast.`);
                 tokensToSend = subscriptions.map(s => s.fcm_token);
             } else {
                 console.log("No subscriptions found for broadcast.");
             }
        } else {
            // Target specific token
            const targetToken = payload.target_token;
            if (targetToken) tokensToSend = [targetToken];
        }

        // Remove duplicates and filter empty
        tokensToSend = [...new Set(tokensToSend)].filter(t => t);

        if (tokensToSend.length === 0) {
             return new Response(JSON.stringify({ error: "No tokens to target" }), { status: 400, headers: corsHeaders });
        }

        const firebase = getFirebaseAdmin();
        // Data-only, like the order notification below -- see the comment
        // there. A `notification` block here would arrive twice as well.
        const message = {
            data: {
                title: '🔔 Test Notification',
                body: isBroadcast
                    ? 'This is a BROADCAST test to ALL admins.'
                    : 'This is a test notification to this device.',
                url: '/orders',
            },
            webpush: { headers: { Urgency: 'high', TTL: '3600' } },
            tokens: tokensToSend,
        };
        
        try {
            const batchResponse = await firebase.messaging().sendEachForMulticast(message);
            
            return new Response(JSON.stringify({ 
                message: "Test sent successfully", 
                successCount: batchResponse.successCount,
                failureCount: batchResponse.failureCount
            }), { status: 200, headers: corsHeaders });

        } catch(e) {
             console.error("Test send failed", e);
             return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    }

    // HANDLE NEW ORDER NOTIFICATION
    const order = payload.record; 
    
    if (!order) {
        console.error("No record in payload", payload);
        return new Response(JSON.stringify({ error: "No record found in payload", debug_payload: payload }), { status: 400, headers: corsHeaders });
    }

    const orderId = order.id;
    const orderTotal = order.total_amount || order.total || 0;

    /**
     * What a person needs to recognise the order without opening anything.
     *
     * `order.id` is the row's uuid. It was what every message quoted, which
     * is unusable: it is not the number printed on the order, not the number
     * the customer reads out, and not searchable from the orders screen.
     * `short_id` is the real order number (SWCO2026K7P2-0001).
     */
    const orderNumber = order.short_id || String(orderId).slice(0, 8);
    const orderCustomer = order.full_name || 'Customer';
    // The billed figure, not the line total -- same as the Amount column.
    const orderAmount = Number(orderTotal) - Number(order.discount_amt || 0);
    // Whole rupees print bare; paise print in full. Without this, 3499.50
    // came out as "3,499.5".
    const orderAmountText = orderAmount.toLocaleString('en-IN', {
        minimumFractionDigits: Number.isInteger(orderAmount) ? 0 : 2,
        maximumFractionDigits: 2,
    });
    const orderLocation =
        [order.city, order.state].filter(Boolean).join(', ') || 'Location not given';

    // 4. Get Admin Tokens
    const { data: subscriptions, error: subError } = await supabase
        .from('admin_push_subscriptions')
        .select('fcm_token');

    if (subError) {
        console.error("Error fetching subscriptions:", subError);
        return new Response(JSON.stringify({ error: "Database error fetching subscriptions", details: subError }), { status: 500, headers: corsHeaders });
    }

    if (!subscriptions || subscriptions.length === 0) {
        console.log("No admin subscriptions found.");
        return new Response(JSON.stringify({ message: "No subscribers found in DB", settings_enabled: settings?.enable_push_notifications }), { headers: corsHeaders });
    }

    const tokens = subscriptions.map(s => s.fcm_token);
    const uniqueTokens = [...new Set(tokens)];
    
    console.log(`Found ${uniqueTokens.length} unique tokens to send to.`);

    if (uniqueTokens.length === 0) {
        return new Response(JSON.stringify({ message: "No valid tokens found" }), { headers: corsHeaders });
    }

    /**
     * Data-only, deliberately.
     *
     * A message carrying a `notification` block is displayed by the FCM
     * service worker itself, and then `onBackgroundMessage` runs as well --
     * so firebase-messaging-sw.js drew a second one for the same push. One
     * row in admin_push_subscriptions, one push, two notifications on the
     * phone. With data only there is nothing for the SDK to display and the
     * service worker is the single place a notification is created.
     *
     * The fields travel separately as well as pre-rendered, so the service
     * worker can lay them out and the click can open the right order.
     */
    const message = {
        data: {
            title: '🎉 New Order Received!',
            body:
                `${orderNumber} · ${orderCustomer}\n` +
                `₹${orderAmountText} · ${orderLocation}`,
            orderId: String(orderId),
            orderNumber,
            customerName: orderCustomer,
            amount: orderAmountText,
            location: orderLocation,
            url: '/orders',
        },
        webpush: { headers: { Urgency: 'high', TTL: '3600' } },
        tokens: uniqueTokens,
    };
    
    // 5. Send Notification
    const firebase = getFirebaseAdmin();
    let batchResponse;

    try {
        batchResponse = await firebase.messaging().sendEachForMulticast(message);
        console.log(batchResponse.successCount + ' messages were sent successfully');
        
        // 6. Send WhatsApp Notifications (Parallel)
        const adminPhoneNumbers = Deno.env.get('ADMIN_PHONE_NUMBERS'); // Comma separated
        if (adminPhoneNumbers) {
           const phones = adminPhoneNumbers.split(',').map(p => p.trim()).filter(p => p);
           // The same order number and figures as the push above, rather than
           // the row's uuid.
           const whatsappBody =
               `🎉 New Order Received!\n` +
               `Order ${orderNumber}\n` +
               `${orderCustomer} - ₹${orderAmountText}\n` +
               `${orderLocation}\n\n` +
               `Check the dashboard for details.`;
           
           console.log(`Sending WhatsApp to ${phones.length} admins...`);
           await Promise.all(phones.map(phone => sendWhatsApp(phone, whatsappBody)));
        }
    
        // 7. Send WhatsApp to Customer
        const customerPhone = order.phone;
        const customerName = order.full_name || 'Customer';
        
        if (customerPhone) {
            let cleanPhone = customerPhone.replace(/\D/g, '');
            // Simple validation for India: 10 digits -> preset 91
            if (cleanPhone.length === 10) {
                cleanPhone = '91' + cleanPhone;
            }
    
            const customerMsg = `Hello ${customerName}, 👋\n\nThank you for your order (Order ${orderNumber}) with Soundwave Crackers! 🎆\n\nTotal Amount: ₹${orderAmountText}\n\nWe have received your order and will process it shortly.`;
            
            console.log(`Sending WhatsApp to customer ${cleanPhone}...`);
            await sendWhatsApp(cleanPhone, customerMsg);
        }
    
        // Optional: Cleanup invalid tokens
        if (batchResponse.failureCount > 0) {
            const failedTokens = [];
            batchResponse.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(uniqueTokens[idx]);
                }
            });
            if (failedTokens.length > 0) {
                 await supabase.from('admin_push_subscriptions').delete().in('fcm_token', failedTokens);
            }
        }
    
        return new Response(
          JSON.stringify({ 
              message: 'Notifications sent', 
              success: batchResponse.successCount, 
              failure: batchResponse.failureCount 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );

    } catch (e) {
         console.error("Firebase Send Error", e);
         throw e;
    }
    
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
