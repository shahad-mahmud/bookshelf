import { Resend } from 'resend'
import { serverEnv } from '@/lib/env-server'
import { renderInviteEmail, type InviteTemplateInput } from './templates/invite'

// Lazy-init so that tests can mock before first use.
let _client: Resend | null = null
function client(): Resend {
  if (!_client) _client = new Resend(serverEnv.RESEND_API_KEY)
  return _client
}

export type SendInviteEmailInput = InviteTemplateInput & { to: string }

export async function sendInviteEmail(input: SendInviteEmailInput): Promise<{ ok: boolean; error?: string }> {
  const { subject, html, text } = renderInviteEmail(input)
  try {
    const res = await client().emails.send({
      from: serverEnv.EMAIL_FROM,
      to: input.to,
      subject,
      html,
      text,
    })
    if (res.error) {
      console.error('[email] Resend returned error:', res.error)
      return { ok: false, error: res.error.message }
    }
    return { ok: true }
  } catch (err) {
    console.error('[email] Resend send threw:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// For tests
export const __testing = {
  resetClient: () => {
    _client = null
  },
  setClient: (c: Resend) => {
    _client = c
  },
}
