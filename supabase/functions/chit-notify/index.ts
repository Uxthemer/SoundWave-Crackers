import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@2.1.0';
import admin from 'npm:firebase-admin@11';

/**
 * Chit scheme notifications. Called by the app right after a chit action has
 * succeeded (lib/chit.ts → notifyChit), with the event and the row's id:
 *
 *   enrollment_requested   member asked to join        → superadmins: push + email
 *   payment_submitted      member uploaded a payment   → superadmins: push + email
 *   enrollment_reviewed    superadmin approved/rejected → member: email
 *   payment_reviewed       superadmin approved/rejected → member: email
 *
 * Called from the app rather than from a database trigger: the existing
 * trigger-to-function wiring depends on a database setting
 * (app.settings.edge_function_url) that is not part of any migration, and a
 * notification that silently never fires is worse than one sent a moment
 * after the action.
 *
 * Nothing here trusts the request beyond the id. The row is read with the
 * service role, its state must match the event, and the caller must be the
 * person the event belongs to -- the member for a request, a superadmin for a
 * review -- so the function cannot be used to send arbitrary mail.
 *
 * Secrets: RESEND_API_KEY (email), FIREBASE_SERVICE_ACCOUNT (push), both
 * already set for the order notifications. CHIT_MAIL_FROM overrides the
 * sender; it must be an address on a domain verified in Resend.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const SITE = 'https://soundwavecrackers.com';
const FROM = Deno.env.get('CHIT_MAIL_FROM') ?? 'SoundWave Crackers <orders@soundwavecrackers.com>';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const rupees = (value: unknown) => {
  const n = Number(value || 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

let firebaseApp: admin.app.App | undefined;
function firebase() {
  if (firebaseApp) return firebaseApp;
  const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '{}');
  if (!serviceAccount.project_id) return undefined;
  firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'chit');
  return firebaseApp;
}

/** One email, laid out with inline styles and a table, as Gmail requires. */
function emailHtml(heading: string, intro: string, rows: [string, string][], button?: [string, string]) {
  const body = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `<tr>
        <td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-weight:bold;color:#222">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <h2 style="color:#ff5722;margin:0 0 12px">${escapeHtml(heading)}</h2>
      <p style="line-height:1.5">${intro}</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px">${body}</table>
      ${
        button
          ? `<p><a href="${escapeHtml(button[1])}" style="display:inline-block;background:#ff5722;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">${escapeHtml(button[0])}</a></p>`
          : ''
      }
      <p style="color:#888;font-size:12px;margin-top:24px">SoundWave Crackers · Chit Scheme</p>
    </div>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
  }

  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

  try {
    const service = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Who is calling: the user behind the JWT the app sent.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: caller } = await service.auth.getUser(jwt);
    const callerId = caller?.user?.id;
    if (!callerId) return reply({ error: 'Not signed in' }, 401);

    const { event, id } = await req.json();
    if (!event || !id) return reply({ error: 'event and id are required' }, 400);

    // Superadmins: who to tell about requests, and whether the caller is one.
    const { data: superadmins } = await service
      .from('user_profiles')
      .select('user_id, email, full_name, roles!inner(name)')
      .eq('roles.name', 'superadmin');
    const superadminIds = new Set((superadmins ?? []).map((s: any) => s.user_id));
    const callerIsSuperadmin = superadminIds.has(callerId);

    const { data: settings } = await service
      .from('app_settings')
      .select('enable_email_notifications')
      .maybeSingle();
    const emailOn = settings?.enable_email_notifications !== false;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const resend = emailOn && resendKey ? new Resend(resendKey) : null;

    // Emails for superadmins: the profile's, else the account's.
    const superadminEmails = async () => {
      const emails = new Set<string>();
      for (const s of superadmins ?? []) {
        let email = (s as any).email as string | null;
        if (!email) {
          const { data } = await service.auth.admin.getUserById((s as any).user_id);
          email = data?.user?.email ?? null;
        }
        if (email) emails.add(email.trim().toLowerCase());
      }
      return [...emails];
    };

    const pushSuperadmins = async (title: string, body: string) => {
      const tag = `chit-${id}`;
      const app = firebase();
      if (!app || superadminIds.size === 0) return 0;
      const { data: subs } = await service
        .from('admin_push_subscriptions')
        .select('fcm_token, user_id')
        .in('user_id', [...superadminIds]);
      const tokens = [...new Set((subs ?? []).map((s: any) => s.fcm_token).filter(Boolean))];
      if (tokens.length === 0) return 0;
      // Data-only, like the order alert, so the service worker draws it once.
      const result = await app.messaging().sendEachForMulticast({
        data: { title, body, tag, url: '/dashboard?tab=chit' },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        tokens,
      });
      return result.successCount;
    };

    const adminLink = `${SITE}/dashboard?tab=chit`;
    const memberLink = `${SITE}/chit-scheme`;
    let pushed = 0;
    let mailed = 0;

    if (event === 'enrollment_requested' || event === 'enrollment_reviewed') {
      const { data: e } = await service.from('chit_enrollments').select('*').eq('id', id).maybeSingle();
      if (!e) return reply({ error: 'Enrolment not found' }, 404);

      if (event === 'enrollment_requested') {
        if (e.user_id !== callerId || e.status !== 'pending') return reply({ error: 'Not allowed' }, 403);
        pushed = await pushSuperadmins(
          '🪔 New chit enrolment',
          `${e.member_name} · ${e.plan_name} (${rupees(e.monthly_amount)} × ${e.months})`
        );
        const to = await superadminEmails();
        if (resend && to.length) {
          await resend.emails.send({
            from: FROM,
            to,
            subject: `New chit enrolment: ${e.member_name} - ${e.plan_name}`,
            html: emailHtml(
              'New chit enrolment to approve',
              `${escapeHtml(e.member_name)} has asked to join a chit plan.`,
              [
                ['Plan', e.plan_name],
                ['Monthly', rupees(e.monthly_amount)],
                ['Months', String(e.months)],
                ['Member', e.member_name],
                ['Phone', e.phone],
                ['Email', e.email ?? ''],
                ['Note', e.user_note ?? ''],
              ],
              ['Review in the dashboard', adminLink]
            ),
          });
          mailed = to.length;
        }
      } else {
        if (!callerIsSuperadmin || !['active', 'rejected'].includes(e.status)) {
          return reply({ error: 'Not allowed' }, 403);
        }
        if (resend && e.email) {
          const approved = e.status === 'active';
          await resend.emails.send({
            from: FROM,
            to: e.email,
            subject: approved
              ? `You're in! Your ${e.plan_name} chit is active`
              : `About your ${e.plan_name} chit request`,
            html: emailHtml(
              approved ? 'Welcome to the chit scheme' : 'Chit request not approved',
              approved
                ? `Dear ${escapeHtml(e.member_name)}, your enrolment is approved. Pay ${escapeHtml(rupees(e.monthly_amount))} each month by the ${escapeHtml(e.due_day)}th, and upload the payment screenshot on the chit page.`
                : `Dear ${escapeHtml(e.member_name)}, we could not approve this request. Please contact us if you have any questions.`,
              [
                ['Plan', e.plan_name],
                ['Monthly', rupees(e.monthly_amount)],
                ['Months', String(e.months)],
                ['You pay in all', rupees(Number(e.monthly_amount) * Number(e.months))],
                ['Bonus', rupees(e.bonus_amount)],
                ['First month', approved && e.start_month ? new Date(e.start_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ''],
                ['Note', e.admin_note ?? ''],
              ],
              approved ? ['Open my chit', memberLink] : undefined
            ),
          });
          mailed = 1;
        }
      }
    } else if (event === 'payment_submitted' || event === 'payment_reviewed') {
      const { data: p } = await service
        .from('chit_payments')
        .select('*, enrollment:chit_enrollments(*)')
        .eq('id', id)
        .maybeSingle();
      if (!p) return reply({ error: 'Payment not found' }, 404);
      const e = p.enrollment;

      if (event === 'payment_submitted') {
        if (p.user_id !== callerId || p.status !== 'pending') return reply({ error: 'Not allowed' }, 403);
        pushed = await pushSuperadmins(
          '💰 Chit payment to verify',
          `${e.member_name} · ${rupees(p.amount)} · ${p.method ?? 'UPI'} · ${p.transaction_ref ?? ''}`
        );
        const to = await superadminEmails();
        if (resend && to.length) {
          await resend.emails.send({
            from: FROM,
            to,
            subject: `Chit payment to verify: ${e.member_name} - ${rupees(p.amount)}`,
            html: emailHtml(
              'Chit payment to verify',
              `${escapeHtml(e.member_name)} has uploaded a payment. The screenshot is in the dashboard.`,
              [
                ['Member', e.member_name],
                ['Plan', e.plan_name],
                ['Amount', rupees(p.amount)],
                ['Method', p.method ?? ''],
                ['Transaction ID', p.transaction_ref ?? ''],
                ['Paid on', p.paid_on ?? ''],
                ['Note', p.user_note ?? ''],
              ],
              ['Verify in the dashboard', adminLink]
            ),
          });
          mailed = to.length;
        }
      } else {
        if (!callerIsSuperadmin || !['approved', 'rejected'].includes(p.status)) {
          return reply({ error: 'Not allowed' }, 403);
        }
        if (resend && e?.email) {
          const approved = p.status === 'approved';
          // Paid so far, after this one, for the email's last line.
          const { data: all } = await service
            .from('chit_payments')
            .select('approved_amount')
            .eq('enrollment_id', e.id)
            .eq('status', 'approved');
          const paid = (all ?? []).reduce((s: number, r: any) => s + Number(r.approved_amount || 0), 0);
          const target = Number(e.monthly_amount) * Number(e.months);
          await resend.emails.send({
            from: FROM,
            to: e.email,
            subject: approved
              ? `Payment received: ${rupees(p.approved_amount)} for your ${e.plan_name} chit`
              : `Payment not verified: ${e.plan_name} chit`,
            html: emailHtml(
              approved ? 'Payment received, thank you!' : 'We could not verify a payment',
              approved
                ? `Dear ${escapeHtml(e.member_name)}, your payment has been verified and added to your chit.`
                : `Dear ${escapeHtml(e.member_name)}, we could not verify this payment. Please check the transaction ID and screenshot, or contact us.`,
              [
                ['Plan', e.plan_name],
                ['Amount', rupees(approved ? p.approved_amount : p.amount)],
                ['Transaction ID', p.transaction_ref ?? ''],
                ['Paid so far', approved ? `${rupees(paid)} of ${rupees(target)}` : ''],
                ['Note', p.admin_note ?? ''],
              ],
              ['Open my chit', memberLink]
            ),
          });
          mailed = 1;
        }
      }
    } else {
      return reply({ error: `Unknown event ${event}` }, 400);
    }

    return reply({ ok: true, pushed, mailed });
  } catch (error) {
    console.error('chit-notify failed:', error);
    return reply({ error: (error as Error).message }, 500);
  }
});
