import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { Autumn as autumn } from 'autumn-js';

export async function GET(request: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }


        const billingPortal = await autumn.customers.billingPortal(session.user.id);
        console.log(billingPortal);

        const customer = await autumn.customers.get(session.user.id);
        console.log(customer, JSON.stringify(customer, null, 2));

        const userId = session.user.id;

        const { data: checkResultDomains, error: errorDomains } = await autumn.check({
            customer_id: userId,
            feature_id: "domains",
        });

        if (errorDomains) {
            console.error('Autumn check error:', errorDomains);
            return NextResponse.json({ error: 'Feature check failed' }, { status: 500 });
        }

        // So this is going to return something like this:
        /*
        
        "checkResultDomains": {
            "customer_id": "7fKQNzQV60SDbey91C2aACdEb8ROpEai",
            "feature_id": "domains",
            "required_balance": 1,
            "code": "feature_found",
            "allowed": true,
            "unlimited": false,
            "balance": 1
        }

        Since we cannot do the usage tracking for the domains like adding/deleting domains, we are going to have to check the balance
        of the domain feature and compare it with what the user currently has.

        So for example if the user has 1 domain and clicks the button to add a new domain we run the .check() and see that the balance is. 

        Since in this case the balance is 1, we know that the user cannot add a new domain, since they already have 1 domain.

        So this would return an error, and we would not be able to add a new domain.


        */
        const allowed = checkResultDomains?.allowed;

        const { data: checkResultRetention, error: errorRetention } = await autumn.check({
            customer_id: userId,
            feature_id: "email_retention",
        });

        if (errorRetention) {
            console.error('Autumn check error:', errorRetention);
            return NextResponse.json({ error: 'Feature check failed' }, { status: 500 });
        }


        /*

        "checkResultRetention": {
            "customer_id": "7fKQNzQV60SDbey91C2aACdEb8ROpEai",
            "feature_id": "email_retention",
            "required_balance": 1,
            "code": "feature_found",
            "allowed": true,
            "unlimited": false,
            "balance": 1
        }

        So this is a bit different since we are not going to be doing tracking we are just going to use this balance to see how many days (24hr intervals) 
        we need to keep the emails for.

        So when the cleanup function gets run it will check the balance of the email retention feature and see how many days (24hr intervals) we need to keep the emails for.

        So for example if the balance is 1, we know that the user needs to keep the emails for 1 day and it will delete any emails older than 1 day for the user.
        
        */

        const { data: checkResultInboundTriggers, error: errorInboundTriggers } = await autumn.check({
            customer_id: userId,
            feature_id: "inbound_triggers",
        });

        if (errorInboundTriggers) {
            console.error('Autumn check error:', errorInboundTriggers);
            return NextResponse.json({ error: 'Feature check failed' }, { status: 500 });
        }

        /*
        -> this would be shown for the pro or scale plan

        "checkResultInboundTriggers": {
            "customer_id": "7fKQNzQV60SDbey91C2aACdEb8ROpEai",
            "feature_id": "inbound_triggers",
            "required_balance": null,
            "code": "feature_found",
            "allowed": true,
            "unlimited": true,
            "balance": null
        }

        -> this would be shown for the free plan

        "checkResultInboundTriggers": {
            "customer_id": "7fKQNzQV60SDbey91C2aACdEb8ROpEai",
            "feature_id": "inbound_triggers",
            "required_balance": 1,
            "code": "feature_found",
            "allowed": false,
            "unlimited": false,
            "balance": 500
        }


        -> this is when we can use the .check() method to check if the user is allowed to use the feature.

        import { Autumn as autumn } from "autumn-js";

        const { data, error } = await autumn.check({
            customerId: "user-123",
            featureId: "inbound_triggers",
        });

        and if data.allowed is true, we can use the feature and track it using:

        await autumn.track({
            customer_id: "user-123",
            feature_id: "inbound_triggers",
            value: 1,
        });

        and if data.allowed is false, we can't use the feature and we can't track it, and it should return an error.



        */ 
        




        // Your logic here
        const data = {
            message: 'Hello from the API!',
            userId: userId,
            checkResultDomains: checkResultDomains,
            checkResultRetention: checkResultRetention,
            checkResultInboundTriggers: checkResultInboundTriggers,
            timestamp: new Date().toISOString(),
        };

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

