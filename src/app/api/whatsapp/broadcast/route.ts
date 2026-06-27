import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
// THE FIX: We import the builder directly and bypass the old 'sendTemplateMessage' black box!
import { buildSendComponents, type SendTimeParams } from '@/lib/whatsapp/template-send-builder'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
interface BroadcastResult {
  phone: string
  status: 'sent' | 'failed'
  whatsapp_message_id?: string
  error?: string
}

interface NewRecipient {
  phone: string
  params?: string[]
  messageParams?: SendTimeParams
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limit = checkRateLimit(`broadcast:${user.id}`, RATE_LIMITS.broadcast)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      recipients: newRecipients,
      phone_numbers,
      template_name,
      template_language,
      template_params,
      headerMediaUrl,
      header_media_url
    } = body

    const finalMediaUrlToPass = headerMediaUrl || header_media_url;

    let recipients: NewRecipient[]
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params) ? template_params : []
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }))
    } else {
      return NextResponse.json(
        { error: 'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!template_name) {
      return NextResponse.json({ error: 'template_name is required' }, { status: 400 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Please set up your WhatsApp integration first.' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    const { data: rawTemplateRow } = await supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', template_name)
      .eq('language', template_language || 'en_US')
      .maybeSingle()

    if (rawTemplateRow && !isMessageTemplate(rawTemplateRow)) {
      return NextResponse.json(
        { error: 'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.' },
        { status: 500 },
      )
    }
    const templateRow = rawTemplateRow ?? null

    if (!templateRow) {
      return NextResponse.json({ error: 'Template not found in database.' }, { status: 404 })
    }

    // 🔥 ENFORCER: Force the template into an 'image' state if a URL is provided
    if (finalMediaUrlToPass) {
      if (!templateRow.header_type || templateRow.header_type === 'none' || templateRow.header_type === 'text') {
        templateRow.header_type = 'image';
      }
      templateRow.header_handle = ''; // Kill the draft ID completely
    }

    const results: BroadcastResult[] = []
    let sentCount = 0
    let failedCount = 0

    for (const recipient of recipients) {
      const sanitized = sanitizePhoneForMeta(recipient.phone)

      if (!isValidE164(sanitized)) {
        results.push({ phone: recipient.phone, status: 'failed', error: 'Invalid phone number format' })
        failedCount++
        continue
      }

      const variants = phoneVariants(sanitized)
      let sentMessageId: string | null = null
      let lastError: string | null = null

      for (const variant of variants) {
        try {
          // 🔥 THE EMPTY STRING SANITIZER 🔥
          // Meta crashes with #100 if any variable is an empty string. We replace "" with a blank space " ".
          const safeParams = (recipient.params ?? []).map(p => {
            return (p && String(p).trim() !== '') ? String(p) : ' ';
          });

          // Build the strict Meta components array
          const components = buildSendComponents(templateRow, {
            ...(recipient.messageParams || {}),
            headerMediaUrl: finalMediaUrlToPass,
            body: safeParams
          });

          // Build the direct Meta API payload
          const metaPayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: variant,
            type: 'template',
            template: {
              name: template_name,
              language: { code: template_language || 'en_US' },
              components: components
            }
          };

          // 🔥 DIRECT API CALL (Bypassing the old black box) 🔥
          const response = await fetch(`https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(metaPayload)
          });

          const data = await response.json();

          if (!response.ok) {
            // Enhanced Error Logging: If Meta complains, we grab the EXACT detail so it doesn't just say #100
            const errorMessage = data.error?.message || 'Meta API Error';
            const errorDetails = data.error?.error_data?.details || '';
            throw new Error(`${errorMessage}. ${errorDetails}`);
          }

          sentMessageId = data.messages?.[0]?.id || 'sent_successfully';
          lastError = null;
          break;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          if (!isRecipientNotAllowedError(errorMessage)) {
            lastError = errorMessage
            break
          }
          lastError = errorMessage
        }
      }

      if (sentMessageId) {
        results.push({ phone: recipient.phone, status: 'sent', whatsapp_message_id: sentMessageId })
        sentCount++
      } else {
        console.error(`Failed to send broadcast to ${recipient.phone}:`, lastError)
        results.push({ phone: recipient.phone, status: 'failed', error: lastError || 'Unknown error' })
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
    })
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error)
    return NextResponse.json({ error: 'Failed to process broadcast' }, { status: 500 })
  }
}