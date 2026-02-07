import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { Resend } from 'npm:resend@2.1.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderNotification {
  orderId: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Fetch App Settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('enable_email_notifications, enable_whatsapp_notifications')
      .single();

    const enableEmail = settings?.enable_email_notifications ?? true;
    const enableWhatsApp = settings?.enable_whatsapp_notifications ?? false;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const whatsappToken = Deno.env.get('WHATSAPP_TOKEN');
    const whatsappPhoneId = Deno.env.get('WHATSAPP_PHONE_ID');

    const { orderId, status, customerName, customerEmail, customerPhone }: OrderNotification = await req.json();

    // Send email notification
    if (enableEmail && resendApiKey) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: 'orders@soundwavecrackers.com',
        to: customerEmail,
        subject: `Order Status Update - ${orderId}`,
        html: `
          <h2>Order Status Update</h2>
          <p>Dear ${customerName},</p>
          <p>Your order (${orderId}) status has been updated to: <strong>${status}</strong></p>
          <p>Thank you for shopping with SoundWave Crackers!</p>
        `
      });
    }

    // Send WhatsApp notification
    if (enableWhatsApp && whatsappToken && whatsappPhoneId && customerPhone) {
        const whatsappMessage = {
          messaging_product: 'whatsapp',
          to: customerPhone,
          type: 'template',
          template: {
            name: 'order_status_update',
            language: {
              code: 'en'
            },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: orderId },
                  { type: 'text', text: status }
                ]
              }
            ]
          }
        };

        await fetch(`https://graph.facebook.com/v17.0/${whatsappPhoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(whatsappMessage)
        });
    }

    return new Response(
      JSON.stringify({ message: 'Notifications processed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});