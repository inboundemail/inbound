"use server";

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Inbound } from '@inboundemail/sdk';

// Server action to submit Vercel OSS Program application
export async function submitVercelOssApplication(formData: FormData) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      throw new Error("User not authenticated");
    }

    const inbound = new Inbound(process.env.INBOUND_API_KEY!);
    
    const { data } = await inbound.emails.send({
      from: 'Vercel OSS Program Applications<noreply@inbound.new>',
      to: 'ryan@inbound.new',
      subject: 'New Vercel OSS Program Application',
      replyTo: session.user.email,
      text: `User ${session.user.name || session.user.email} has applied for the Vercel OSS Program.\n\nUser Details:\n- ID: ${session.user.id}\n- Email: ${session.user.email}\n- Name: ${session.user.name || 'Not provided'}`,
      html: `
        <h2>New Vercel OSS Program Application</h2>
        <p>User <strong>${session.user.name || session.user.email}</strong> has applied for the Vercel OSS Program.</p>
        
        <h3>User Details:</h3>
        <ul>
          <li><strong>ID:</strong> ${session.user.id}</li>
          <li><strong>Email:</strong> ${session.user.email}</li>
          <li><strong>Name:</strong> ${session.user.name || 'Not provided'}</li>
        </ul>
      `
    });

    console.log('Application email sent:', data?.id);
    
    return { success: true };
  } catch (error) {
    console.error('Error sending application email:', error);
    return { success: false };
  }
}
