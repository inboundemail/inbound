import FeedbackEmail from './feedback'

export default function FeedbackPreview() {
  return (
    <FeedbackEmail
      userFirstname="John"
      userEmail="john@example.com"
      feedback="This is a test feedback message. I really like the new features you've added to the platform, but I think the dashboard could use some improvements. The loading times are a bit slow, and it would be great to have more customization options for the email templates."
      submittedAt="December 12, 2024 at 2:30 PM PST"
    />
  )
} 