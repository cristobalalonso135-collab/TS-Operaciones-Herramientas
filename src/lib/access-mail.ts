export async function sendAccessCode(to: string, code: string): Promise<{ mailed: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return { mailed: false, error: 'missing-key' };
  const from = process.env.ACCESS_FROM_EMAIL || 'TS Operaciones <onboarding@resend.dev>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${code} · tu código de TS Operaciones`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#171612;line-height:1.5;padding:24px">
            <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a857a;margin:0 0 12px">Teamsports · TS Operaciones</p>
            <p style="font-size:16px;margin:0 0 16px">Tu código para entrar:</p>
            <p style="font-size:32px;letter-spacing:.28em;font-weight:700;margin:0 0 16px">${code}</p>
            <p style="font-size:13px;color:#5c584f;margin:0">Caduca en 10 minutos. Si no lo has pedido, ignora este correo.</p>
          </div>
        `,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { mailed: false, error: body.slice(0, 180) || `http-${response.status}` };
    }
    return { mailed: true };
  } catch (error) {
    return { mailed: false, error: error instanceof Error ? error.message : 'mail-failed' };
  }
}
