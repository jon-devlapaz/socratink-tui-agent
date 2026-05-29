# Free feedback → Gmail (`/feedback`)

Learners type `/feedback your message` in the loop UI or TUI. The server POSTs to a **Google Apps Script** web app you own; the script emails your Gmail inbox. No paid email API, no new npm packages.

## One-time setup (~5 minutes)

### 1. Create the script

1. Open [script.google.com](https://script.google.com) → **New project**.
2. Paste the script below.
3. **Project settings** → add script property `SECRET` = a long random string (optional but recommended).
4. Replace `FEEDBACK_TO` with your Gmail address.

```javascript
const FEEDBACK_TO = "you@gmail.com"; // inbox that receives feedback

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("SECRET");
  const data = JSON.parse(e.postData.contents || "{}");
  if (expected && data.secret !== expected && e.parameter.secret !== expected) {
    return json({ ok: false, error: "unauthorized" });
  }
  const subject = data.subject || "Socratink feedback";
  const body = data.body || data.message || "";
  if (!body.trim()) {
    return json({ ok: false, error: "empty_body" });
  }
  GmailApp.sendEmail(FEEDBACK_TO, subject, body);
  return json({ ok: true });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
```

### 2. Deploy as web app

1. **Deploy** → **New deployment** → type **Web app**.
2. Execute as: **Me**
3. Who has access: **Anyone** (the URL is unlisted; protect with `SECRET`).
4. Copy the **Web app URL** (ends with `/exec`).

### 3. Configure the loop server

In `.env`:

```bash
SOCRATINK_FEEDBACK_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
SOCRATINK_FEEDBACK_SECRET=same-as-script-property-SECRET
SOCRATINK_FEEDBACK_TO=you@gmail.com   # optional mailto fallback when webhook unset
```

Restart `./socratink-loop-server`.

### 4. Verify

```bash
curl -s http://127.0.0.1:8787/health | jq .feedback_configured
# true

# In /loop chat:
# /feedback The map step was confusing
```

Check your inbox.

## Behavior

| Input | Effect |
|--------|--------|
| `/feedback` | Shows usage; does not advance the learning loop |
| `/feedback something broke` | Sends email; does not advance the loop |
| Webhook unset | Prints usage + optional `mailto:` link if `SOCRATINK_FEEDBACK_TO` is set |

Session context (phase, concept, event types) is appended to the email body for debugging.

## Limits

- Apps Script free quota is generous for founder-scale dogfood (hundreds/day).
- Messages are single-line only (by design — minimal UX).
- First-time Apps Script deploy may require Google account review for “Anyone” access; use the same Google account as the inbox.

## Security

- Treat the web app URL + `SECRET` like a password.
- Do not commit `.env`.
- Optional: restrict deployment to your Google Workspace later.
