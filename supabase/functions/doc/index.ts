import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * The short link behind a shared invoice, quotation or price list.
 *
 * WhatsApp prints a link in full, and a signed storage URL is a few hundred
 * characters of JWT -- the message ends up all link and no greeting. So the
 * message carries this instead:
 *
 *     https://<project>.supabase.co/functions/v1/doc/q/<32 hex characters>
 *
 * The letter is the folder (i = invoices, q = quotations, p = price-lists)
 * and the hex is the id of the upload, the random uuid in its storage path
 * with the dashes taken out. The function signs the file in that folder and
 * redirects to it, so the customer lands on the same PDF.
 *
 * Nothing but that id is accepted: there is no listing, no guessing from one
 * document to the next, and no file is reachable without the uuid that was
 * sent to the customer -- the same secret the signed URL carried.
 *
 * The signature it hands out is short-lived (an hour): the link itself is the
 * lasting thing, and it keeps working for as long as the file is in the
 * bucket, rather than expiring 60 days after it was sent.
 *
 * DEPLOY WITHOUT A JWT CHECK -- a customer opening this in WhatsApp sends no
 * Authorization header:
 *
 *     supabase functions deploy doc --no-verify-jwt
 */

/** Folder letter in the link -> folder in the bucket. */
const FOLDERS: Record<string, string> = {
  i: 'invoices',
  q: 'quotations',
  p: 'price-lists',
};

const BUCKET = 'documents';

/** How long the signature the customer is redirected with stays valid. */
const SIGNATURE_SECONDS = 60 * 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

/** "a1b2…" (32 hex characters) -> the uuid that is actually in the path. */
function toUuid(compact: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(compact)) return null;
  const hex = compact.toLowerCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // The path is /doc/<letter>/<id>; everything else is a mistyped link.
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const index = parts.indexOf('doc');
  const [letter, compactId] = index >= 0 ? parts.slice(index + 1) : [];
  const folder = letter ? FOLDERS[letter] : undefined;
  const id = compactId ? toUuid(compactId) : null;

  if (!folder || !id) {
    return new Response('This link is not valid.', { status: 404, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // The file name is whatever was uploaded ("Quotation-QT-004.pdf"), so the
  // folder is listed rather than guessed at. One upload, one file in it.
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(`${folder}/${id}`, { limit: 1 });

  if (listError) {
    console.error('doc: could not list', folder, id, listError);
    return new Response('This document could not be opened.', {
      status: 500,
      headers: corsHeaders,
    });
  }

  const file = files?.[0]?.name;
  if (!file) {
    return new Response('This document is no longer available.', {
      status: 404,
      headers: corsHeaders,
    });
  }

  const path = `${folder}/${id}/${file}`;
  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNATURE_SECONDS, { download: file });

  if (signError || !data?.signedUrl) {
    console.error('doc: could not sign', path, signError);
    return new Response('This document could not be opened.', {
      status: 500,
      headers: corsHeaders,
    });
  }

  // 302, not 301: the signature expires, so nothing about this redirect is
  // permanent and no browser should cache it.
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: data.signedUrl,
      'Cache-Control': 'no-store',
    },
  });
});
