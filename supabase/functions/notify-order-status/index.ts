import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { Resend } from 'npm:resend@2.1.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Anything from the order goes into HTML, so it is escaped first. */
const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Whole rupees print bare; paise print in full. */
const rupees = (value: number) =>
  value.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });

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

    /**
     * The trigger (notify_order_status_change) sends only the row id, the
     * status and the contact fields, so the email used to say nothing but a
     * uuid and a status. The rest is read here, with the service role because
     * orders are not readable anonymously. If that read fails the email still
     * goes, with what the trigger sent.
     */
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('short_id, full_name, phone, alternate_phone, city, district, state, total_amount, discount_amt, lr_number')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) console.error('Could not read the order for the email:', orderError);

    // The number on the order, not the row's uuid.
    const orderNumber = order?.short_id || String(orderId).slice(0, 8);
    const name = order?.full_name || customerName || 'Customer';
    const phone = [order?.phone || customerPhone, order?.alternate_phone]
      .filter(Boolean)
      .join(', ');
    const place =
      [order?.city, order?.district, order?.state]
        .filter((part, i, all) => part && all.indexOf(part) === i)
        .join(', ');
    // The billed figure, after discount -- the same as everywhere else.
    const orderValue = order
      ? Math.max(Number(order.total_amount || 0) - Number(order.discount_amt || 0), 0)
      : null;
    const lrNumber = status === 'Shipped' ? String(order?.lr_number ?? '').trim() : '';

    const row = (label: string, value: string) =>
      value
        ? `<tr>
             <td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${label}</td>
             <td style="padding:6px 0;font-weight:bold;color:#222">${escapeHtml(value)}</td>
           </tr>`
        : '';

    // Send email notification
    if (enableEmail && resendApiKey) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: 'orders@soundwavecrackers.com',
        to: customerEmail,
        subject: `Order ${orderNumber} - ${status}`,
        // Inline styles and a table: Gmail strips <style> blocks and most
        // layout CSS, and this survives every mail client.
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
            <h2 style="color:#ff5722;margin:0 0 12px">Order Status Update</h2>
            <p>Dear ${escapeHtml(name)},</p>
            <p>Your order <strong>${escapeHtml(orderNumber)}</strong> is now
              <strong style="color:#ff5722">${escapeHtml(status)}</strong>.</p>
            <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
              ${row('Order number', orderNumber)}
              ${row('Status', status)}
              ${row('Order value', orderValue !== null ? `₹${rupees(orderValue)}` : '')}
              ${row('Name', name)}
              ${row('City', place)}
              ${row('Contact number', phone)}
              ${row('LR number', lrNumber)}
            </table>
            <p>Thank you for shopping with SoundWave Crackers!</p>
          </div>
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
                  { type: 'text', text: orderNumber },
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