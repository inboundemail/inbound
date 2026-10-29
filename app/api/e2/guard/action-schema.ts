import { t } from "elysia";

export const GuardRuleActionSchema = t.Union(
	[
		t.Object({ action: t.Literal("allow") }, { title: "Allow" }),
		t.Object({ action: t.Literal("block") }, { title: "Block" }),
		t.Object(
			{ action: t.Literal("junk") },
			{
				title: "Junk",
				description:
					"Mark the email as junk. It is still delivered to endpoints, and shown in the Junk folder of mailboxes.",
			},
		),
		t.Object(
			{
				action: t.Literal("route"),
				endpointId: t.String({
					minLength: 1,
					description: "ID of an active endpoint owned by the account.",
				}),
			},
			{ title: "Route" },
		),
	],
	{
		description:
			"Action to take when the rule matches: allow (also marks the email as not junk), block, junk, or route to an owned endpoint.",
	},
);
