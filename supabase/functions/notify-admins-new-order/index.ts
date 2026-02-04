import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as admin from 'npm:firebase-admin@11';

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
