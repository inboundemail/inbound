# Inbound TypeScript SDK

The official TypeScript SDK for the Inbound E2 API.

```bash
bun add inboundemail
```

```ts
import { Inbound } from "inboundemail";

const inbound = new Inbound(process.env.INBOUND_API_KEY!);

const email = await inbound.emails.send({
	from: "Sender <sender@example.com>",
	to: "recipient@example.com",
	subject: "Hello",
	html: "<p>Hello from Inbound</p>",
});

console.log(email.id);
```

The package also provides a Resend-compatible sending client:

```ts
import { Resend } from "inboundemail";

const resend = new Resend(process.env.INBOUND_API_KEY!);
const { data, error } = await resend.emails.send({
	from: "Sender <sender@example.com>",
	to: "recipient@example.com",
	subject: "Hello",
	html: "<p>Hello from Inbound</p>",
});
```

Existing Resend imports can use an npm alias:

```bash
bun add resend@npm:inboundemail
```
