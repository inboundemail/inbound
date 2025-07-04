import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);


const response = await resend.emails.send({
  from: "onboarding@resend.dev",
  to: "delivered@resend.dev",
  subject: "hello world",
  html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
});

console.log(response);