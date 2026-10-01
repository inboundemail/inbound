import {
	feature,
	product,
	featureItem,
	pricedFeatureItem,
	priceItem,
} from "atmn";

// Features
export const vipByok = feature({
	id: "vip-byok",
	name: "vip-byok",
	type: "boolean",
});

export const domains = feature({
	id: "domains",
	name: "Domains",
	type: "continuous_use",
});

export const emailRetention = feature({
	id: "email_retention",
	name: "Email Retention",
	type: "continuous_use",
});

export const inboundTriggers = feature({
	id: "inbound_triggers",
	name: "Emails Received ",
	type: "single_use",
});

export const emailsSent = feature({
	id: "emails_sent",
	name: "Emails Sent",
	type: "single_use",
});

export const emailSupport = feature({
	id: "email_support",
	name: "Email Support",
	type: "boolean",
});

export const slackSupport = feature({
	id: "slack_support",
	name: "Slack Support",
	type: "boolean",
});

export const simpleAiFeatures = feature({
	id: "simple_ai_features",
	name: "Simple AI Features",
	type: "boolean",
});

export const advancedAiFeatures = feature({
	id: "advanced_ai_features",
	name: "Advanced AI Features",
	type: "boolean",
});

export const inboundGuard = feature({
	id: "inbound_guard",
	name: "Inbound Guard",
	type: "boolean",
});

export const workspaceConnectorAccess = feature({
	id: "workspace_connector_access",
	name: "Workspace Connector Access",
	type: "boolean",
});

// Products
export const freeTier = product({
	id: "free_tier",
	name: "inbound free",
	items: [
		featureItem({
			feature_id: domains.id,
			included_usage: 1,
		}),

		featureItem({
			feature_id: inboundTriggers.id,
			included_usage: 10,
		}),

		featureItem({
			feature_id: emailsSent.id,
			included_usage: 10,
		}),
	],
});

export const inboundDefaultTest = product({
	id: "inbound_default_test",
	name: "Inbound Default",
	items: [
		priceItem({
			price: 9,
			interval: "month",
		}),

		featureItem({
			feature_id: domains.id,
			included_usage: 1,
		}),

		featureItem({
			feature_id: emailRetention.id,
			included_usage: 7,
		}),

		featureItem({
			feature_id: emailSupport.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: inboundTriggers.id,
			included_usage: 5000,
			interval: "month",
		}),

		featureItem({
			feature_id: emailsSent.id,
			included_usage: 5000,
			interval: "month",
		}),
	],
});

export const workspaceConnector = product({
	id: "workspace_connector",
	name: "Workspace Connector",
	items: [
		priceItem({
			price: 5,
			interval: "month",
		}),

		featureItem({
			feature_id: workspaceConnectorAccess.id,
			included_usage: 0,
		}),
	],
	free_trial: {
		duration: "day",
		length: 30,
		unique_fingerprint: true,
		card_required: true,
	},
});

export const pro = product({
	id: "pro",
	name: "inbound pro",
	items: [
		priceItem({
			price: 15,
			interval: "month",
		}),

		featureItem({
			feature_id: domains.id,
			included_usage: 50,
		}),

		featureItem({
			feature_id: emailRetention.id,
			included_usage: 15,
		}),

		featureItem({
			feature_id: emailSupport.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: inboundTriggers.id,
			included_usage: 50000,
			interval: "month",
		}),

		featureItem({
			feature_id: emailsSent.id,
			included_usage: 50000,
			interval: "month",
		}),

		featureItem({
			feature_id: inboundGuard.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: simpleAiFeatures.id,
			included_usage: 0,
		}),
	],
});

export const growth = product({
	id: "growth",
	name: "inbound growth",
	items: [
		priceItem({
			price: 39,
			interval: "month",
		}),

		featureItem({
			feature_id: advancedAiFeatures.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: domains.id,
			included_usage: 300,
		}),

		featureItem({
			feature_id: emailRetention.id,
			included_usage: 31,
		}),

		featureItem({
			feature_id: inboundTriggers.id,
			included_usage: 100000,
			interval: "month",
		}),

		featureItem({
			feature_id: emailsSent.id,
			included_usage: 100000,
			interval: "month",
		}),

		featureItem({
			feature_id: inboundGuard.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: slackSupport.id,
			included_usage: 0,
		}),
	],
});

export const scale = product({
	id: "scale",
	name: "inbound scale",
	items: [
		priceItem({
			price: 79,
			interval: "month",
		}),

		featureItem({
			feature_id: advancedAiFeatures.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: domains.id,
			included_usage: "inf",
		}),

		featureItem({
			feature_id: emailRetention.id,
			included_usage: 45,
		}),

		featureItem({
			feature_id: inboundTriggers.id,
			included_usage: 200000,
			interval: "month",
		}),

		featureItem({
			feature_id: emailsSent.id,
			included_usage: 200000,
			interval: "month",
		}),

		featureItem({
			feature_id: inboundGuard.id,
			included_usage: 0,
		}),

		featureItem({
			feature_id: slackSupport.id,
			included_usage: 0,
		}),
	],
});

export const extraDomains = product({
	id: "extra_domains",
	name: "Extra Domains",
	items: [
		pricedFeatureItem({
			feature_id: domains.id,
			price: 3.5,
			interval: "month",
			included_usage: 1,
			billing_units: 1,
			usage_model: "prepaid",
		}),
	],
});

export const defaultPlanYearly = product({
	id: "default_plan_yearly",
	name: "Default Plan (Yearly)",
	items: [
		priceItem({
			price: 26,
			interval: "year",
		}),
	],
});

export const defaultPlan = product({
	id: "default_plan",
	name: "Default Plan (Monthly)",
	items: [
		priceItem({
			price: 4,
			interval: "month",
		}),
	],
});

export const product50kEmailBlocks = product({
	id: "50k_email_blocks",
	name: "50K Email Pack",
	items: [
		pricedFeatureItem({
			feature_id: inboundTriggers.id,
			price: 8,
			interval: "month",
			included_usage: 0,
			billing_units: 50000,
			usage_model: "prepaid",
		}),

		pricedFeatureItem({
			feature_id: emailsSent.id,
			price: 8,
			interval: "month",
			included_usage: 0,
			billing_units: 50000,
			usage_model: "prepaid",
		}),
	],
});

export const inboundVip = product({
	id: "inbound_vip",
	name: "inbound vip",
	items: [
		priceItem({
			price: 20,
			interval: "month",
		}),

		featureItem({
			feature_id: vipByok.id,
			included_usage: 0,
		}),
	],
});
