export type SendMessageResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string };

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: { reply_markup?: unknown },
): Promise<SendMessageResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        ...options,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown');
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }

    const data = (await res.json()) as { result?: { message_id?: number } };
    return { ok: true, messageId: data.result?.message_id ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown error' };
  }
}
