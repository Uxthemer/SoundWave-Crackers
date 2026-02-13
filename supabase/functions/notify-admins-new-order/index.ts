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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
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
       return new Response(JSON.stringify({ message: "Push disabled" }), { headers: corsHeaders });
    }

    // 2. Parse Webhook Payload
    const payload = await req.json();

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
        const message = {
            notification: {
                title: '🔔 Test Notification',
                body: isBroadcast 
                    ? 'This is a BROADCAST test to ALL admins.' 
                    : 'This is a test notification to this device.',
            },
            tokens: tokensToSend,
        };
        
        try {
            // Use sendEachForMulticast for both single (as array) and multiple
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

    const order = payload.record; // 'record' holds the new row data on INSERT
    
    if (!order) {
        throw new Error("No record found in payload");
    }

    const orderId = order.id;
    const orderTotal = order.total_amount || order.total || 0; 
    // Adjust field names based on your actual orders table schema

    // 3. Update 'orders' status? No, we just notify.

    // 4. Get Admin Tokens
    const { data: subscriptions } = await supabase
        .from('admin_push_subscriptions')
        .select('fcm_token');

    if (!subscriptions || subscriptions.length === 0) {
        console.log("No admin subscriptions found.");
        return new Response(JSON.stringify({ message: "No subscribers" }), { headers: corsHeaders });
    }

    const tokens = subscriptions.map(s => s.fcm_token);
    
    // 5. Send Notification
    const firebase = getFirebaseAdmin();
    
    // Remove duplicates
    const uniqueTokens = [...new Set(tokens)];

    if (uniqueTokens.length === 0) {
        return new Response(JSON.stringify({ message: "No tokens" }), { headers: corsHeaders });
    }

    const message = {
        notification: {
            title: '🎉 New Order Received!',
            body: `Order #${orderId} for ₹${orderTotal} has been placed.`,
        },
        tokens: uniqueTokens,
    };

    const response = await firebase.messaging().sendMulticast(message); // sendMulticast changed to sendEachForMulticast in v11? 
    // v11 uses sendEachForMulticast usually, but let's check. 
    // Actually sendMulticast is generic in older versions but sendEachForMulticast is recommended.
    // Let's use sendEachForMulticast if available, or try/catch.
    // To be safe with v11, let's use sendEachForMulticast.
    
    // Correction: v11 legacy API is removed? No, supports HTTP v1.
    // 'sendMulticast' sends to multiple tokens.
    
    const batchResponse = await firebase.messaging().sendEachForMulticast(message);

    console.log(batchResponse.successCount + ' messages were sent successfully');

    // 6. Send WhatsApp Notifications (Parallel)
    const adminPhoneNumbers = Deno.env.get('ADMIN_PHONE_NUMBERS'); // Comma separated
    if (adminPhoneNumbers) {
       const phones = adminPhoneNumbers.split(',').map(p => p.trim()).filter(p => p);
       const whatsappBody = `🎉 New Order Received!\nOrder #${orderId} for ₹${orderTotal} has been placed. Check dashboard for details.`;
       
       console.log(`Sending WhatsApp to ${phones.length} admins...`);
       await Promise.all(phones.map(phone => sendWhatsApp(phone, whatsappBody)));
    }

    // 7. Send WhatsApp to Customer
    const customerPhone = order.phone;
    const customerName = order.full_name || 'Customer';
    
    if (customerPhone) {
        // Sanitize phone number: remove non-digits, ensure country code if needed (assuming India +91 for now if missing?)
        // Meta API requires country code. Let's assume the DB has it or we prepend 91 if length is 10.
        let cleanPhone = customerPhone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
            cleanPhone = '91' + cleanPhone;
        }

        const customerMsg = `Hello ${customerName}, 👋\n\nThank you for your order (Order #${orderId}) with Soundwave Crackers! 🎆\n\nTotal Amount: ₹${orderTotal}\n\nWe have received your order and will process it shortly.`;
        
        console.log(`Sending WhatsApp to customer ${cleanPhone}...`);
        await sendWhatsApp(cleanPhone, customerMsg);
    }

    // Optional: Cleanup invalid tokens?
    if (batchResponse.failureCount > 0) {
        const failedTokens = [];
        batchResponse.responses.forEach((resp, idx) => {
            if (!resp.success) {
                failedTokens.push(uniqueTokens[idx]);
            }
        });
        // We could delete these from DB:
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
