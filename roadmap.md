1. awaiting ses verification for the sending
2. setup email routing
3. setup so you can have a webhook, email address or action as an inbound email destination
    3a. an action is a eval ruleset for routing




groups -> groups can contain email addresses and webhooks

sale.inbound.run

when emails are sent to this thing an agent can prescan them and have it be integrated with stripe so you can approve/deny refunds and such based on your TOS.

1. routing rules would route it to sale
    2. agent would scale to determine intent and tag it with a tag, if it is a refund request then it can check to see if the email the user provided is listed in stripe and evaluate the users case based on the TOS and that users history, then would present the admin with a simple method to accept/deny the refund in those cases. 


## dynamic emails

setup a primary name+[slug]@domain.com

would be routed based on slug


# primary issues right now:

- not easy to find the webhook id (needed for creating email addr via api)
- your api docs still show a placeholder url
- idea - add catchall logic as an option. maybe secure it on an email header?
- idea - default webhook for all unset




left off:

- need to finalize the accept all domain
- need to modify the way the emails are stored to be able to store and pull from S3 and be able to parse better
- need to enable the email redirection and stuff