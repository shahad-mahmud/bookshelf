export type InviteTemplateInput = {
  libraryName: string
  inviterName: string | null
  inviteUrl: string
}

export function renderInviteEmail(input: InviteTemplateInput): { subject: string; html: string; text: string } {
  const who = input.inviterName ?? 'Someone'
  const safeLibrary = escapeHtml(input.libraryName)
  const safeWho = escapeHtml(who)
  const safeUrl = escapeHtml(input.inviteUrl)
  const subject = `${who} invited you to ${input.libraryName} on Bookshelf`
  const html = `
<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5; color: #0a0a0a;">
  <div style="max-width: 480px; margin: 40px auto; padding: 24px;">
    <h1 style="font-size: 20px; margin-bottom: 16px;">You&rsquo;re invited to ${safeLibrary}</h1>
    <p>${safeWho} has invited you to join the library <strong>${safeLibrary}</strong> on Bookshelf.</p>
    <p>This link expires in 7 days.</p>
    <p style="margin: 28px 0;">
      <a href="${safeUrl}" style="display: inline-block; background: #0a0a0a; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px;">
        Accept invite
      </a>
    </p>
    <p style="color: #666; font-size: 13px;">If the button doesn&rsquo;t work, copy and paste this URL into your browser:<br><span style="word-break: break-all;">${safeUrl}</span></p>
    <p style="color: #999; font-size: 12px; margin-top: 40px;">If you weren&rsquo;t expecting this invite, you can ignore this email.</p>
  </div>
</body>
</html>`
  const text = `${who} has invited you to ${input.libraryName} on Bookshelf.\n\nAccept: ${input.inviteUrl}\n\nThis link expires in 7 days.`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
