import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@2.1.0';
import admin from 'npm:firebase-admin@11';

/**
 * Tells superadmins about a new wholesale enquiry: a push to their devices and
 * an email with every detail the visitor gave. Called by the Wholesale page
 * right after `submit_wholesale_enquiry` succeeds (lib/wholesale.ts).
 *
 * Enquiries come from guests too, so the caller cannot be checked the way
 * chit-notify checks a member. Instead each enquiry is notified at most once:
 * `notified_at` is claimed with a conditional update before anything is sent,
 * and a second call for the same id finds it taken and sends nothing. Making
 * an enquiry is itself rate-limited in the database.
 *
 * Secrets: RESEND_API_KEY, FIREBASE_SERVICE_ACCOUNT (already set for the
 * order and chit alerts). WHOLESALE_MAIL_FROM overrides the sender.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const SITE = 'https://soundwavecrackers.com';
const FROM =
  Deno.env.get('WHOLESALE_MAIL_FROM') ?? 'SoundWave Crackers <orders@soundwavecrackers.com>';

const TYPE_LABEL: Record<string, string> = {
  price_list: 'Wholesale price list',
  bulk_order: 'Bulk order quote',
  dealership: 'Dealership / resale',
  other: 'Other',
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

let firebaseApp: admin.app.App | undefined;
function firebase() {
  if (firebaseApp) return firebaseApp;
  const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '{}');
  if (!serviceAccount.project_id) return undefined;
  firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'wholesale');
  return firebaseApp;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
  }
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

  try {
    const { id } = await req.json();
    if (!id) return reply({ error: 'id is required' }, 400);

    const service = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Claim the enquiry. Only the first call gets a row back.
    const { data: enquiry } = await service
      .from('wholesale_enquiries')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', id)
      .is('notified_at', null)
      .select('*')
      .maybeSingle();
    if (!enquiry) return reply({ ok: true, skipped: 'already notified or not found' });

    const { data: superadmins } = await service
      .from('user_profiles')
      .select('user_id, email, roles!inner(name)')
      .eq('roles.name', 'superadmin');
    const ids = (superadmins ?? []).map((s: any) => s.user_id);

    const type = TYPE_LABEL[enquiry.enquiry_type] ?? enquiry.enquiry_type;
    const who = enquiry.business_name
      ? `${enquiry.business_name} (${enquiry.contact_name})`
      : enquiry.contact_name;
    const place = [enquiry.city, enquiry.district, enquiry.state]
      .filter((v: string | null, i: number, all: (string | null)[]) => v && all.indexOf(v) === i)
      .join(', ');

    // Push
    let pushed = 0;
    const app = firebase();
    if (app && ids.length) {
      const { data: subs } = await service
        .from('admin_push_subscriptions')
        .select('fcm_token')
        .in('user_id', ids);
      const tokens = [...new Set((subs ?? []).map((s: any) => s.fcm_token).filter(Boolean))];
      if (tokens.length) {
        const result = await app.messaging().sendEachForMulticast({
          data: {
            title: '🏪 New wholesale enquiry',
            body: `${who} · ${type}${place ? ` · ${place}` : ''}\n${enquiry.phone}`,
            tag: `wholesale-${enquiry.id}`,
            url: '/dashboard?tab=wholesale',
          },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } },
          tokens,
        });
        pushed = result.successCount;
      }
    }

    // Email
    let mailed = 0;
    const { data: settings } = await service
      .from('app_settings')
      .select('enable_email_notifications')
      .maybeSingle();
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (settings?.enable_email_notifications !== false && resendKey) {
      const emails = new Set<string>();
      for (const s of superadmins ?? []) {
        let email = (s as any).email as string | null;
        if (!email) {
          const { data } = await service.auth.admin.getUserById((s as any).user_id);
          email = data?.user?.email ?? null;
        }
        if (email) emails.add(email.trim().toLowerCase());
      }
      if (emails.size) {
        const rows: [string, string | null][] = [
          ['Enquiry for', type],
          ['Business', enquiry.business_name],
          ['Business type', enquiry.business_type],
          ['Contact', enquiry.contact_name],
          ['Phone', enquiry.phone],
          ['Alternate phone', enquiry.alternate_phone],
          ['Email', enquiry.email],
          ['Prefers', enquiry.preferred_contact],
          ['GSTIN', enquiry.gstin],
          ['Place', [place, enquiry.pincode].filter(Boolean).join(' - ')],
          ['Budget', enquiry.budget],
          ['Products', enquiry.products],
          ['Message', enquiry.message],
        ];
        const table = rows
          .filter(([, v]) => v)
          .map(
            ([label, value]) => `<tr>
              <td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
              <td style="padding:6px 0;font-weight:bold;color:#222;white-space:pre-wrap">${escapeHtml(value)}</td>
            </tr>`
          )
          .join('');
        await new Resend(resendKey).emails.send({
          from: FROM,
          to: [...emails],
          reply_to: enquiry.email || undefined,
          subject: `Wholesale enquiry: ${who} - ${type}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
              <h2 style="color:#ff5722;margin:0 0 12px">New wholesale enquiry</h2>
              <table style="border-collapse:collapse;margin:16px 0;font-size:14px">${table}</table>
              <p><a href="${SITE}/dashboard?tab=wholesale" style="display:inline-block;background:#ff5722;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Open in the dashboard</a></p>
            </div>`,
        });
        mailed = emails.size;
      }
    }

    return reply({ ok: true, pushed, mailed });
  } catch (error) {
    console.error('wholesale-notify failed:', error);
    return reply({ error: (error as Error).message }, 500);
  }
});
