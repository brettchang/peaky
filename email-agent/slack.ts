export interface SlackField {
  label: string;
  value: string | number | boolean | null | undefined;
}

export interface SlackNotificationInput {
  event: string;
  title: string;
  fields?: SlackField[];
  linkLabel?: string;
  linkUrl?: string;
}

function normalize(value: SlackField["value"]): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function toPlainText(input: SlackNotificationInput): string {
  const lines = [`[${input.event}] ${input.title}`];
  for (const field of input.fields ?? []) {
    lines.push(`${field.label}: ${normalize(field.value)}`);
  }
  if (input.linkUrl) {
    lines.push(`${input.linkLabel ?? "Open"}: ${input.linkUrl}`);
  }
  return lines.join("\n");
}

function toBlocks(input: SlackNotificationInput) {
  const detailLines = (input.fields ?? []).map(
    (field) => `*${field.label}:* ${normalize(field.value)}`
  );

  if (input.linkUrl) {
    detailLines.push(`<${input.linkUrl}|${input.linkLabel ?? "Open"}>`);
  }

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: input.title,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Event:* ${input.event}`,
      },
    },
    ...(detailLines.length > 0
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: detailLines.join("\n"),
            },
          },
        ]
      : []),
  ];
}

async function sendViaWebhook(
  webhookUrl: string,
  input: SlackNotificationInput
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: toPlainText(input),
      blocks: toBlocks(input),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed (${res.status}): ${body}`);
  }
}

async function sendViaBotToken(
  token: string,
  channel: string,
  input: SlackNotificationInput
): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: toPlainText(input),
      blocks: toBlocks(input),
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (!res.ok || !data?.ok) {
    throw new Error(
      `Slack API failed (${res.status}): ${data?.error ?? "unknown_error"}`
    );
  }
}

export async function sendSlackNotification(
  input: SlackNotificationInput
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_CHANNEL_ID?.trim();

  if (webhookUrl) {
    await sendViaWebhook(webhookUrl, input);
    return;
  }

  if (token && channel) {
    await sendViaBotToken(token, channel, input);
  }
}
