#!/usr/bin/env bash
# usage: set-stack-policy.sh [--unlock] [--dry-run]
# Sets a CloudFormation stack policy on InboundGatewayHost that denies Update:Replace and Update:Delete
# on the instance, the Elastic IP and the EIP association, so no deploy can replace the host or change
# its IP. Logical IDs come from the synthesized template (bunx cdk synth). --unlock sets an allow-all
# policy for a deliberate replacement (for example an AMI change); run this script again afterwards.
# --dry-run prints the policy without calling AWS.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
stack="${GATEWAY_STACK_NAME:-InboundGatewayHost}"
export AWS_REGION="${AWS_REGION:-us-east-2}"
mode=lock dry_run=0
for arg in "$@"; do
	case "$arg" in
	--unlock) mode=unlock ;;
	--dry-run) dry_run=1 ;;
	*)
		echo "usage: $0 [--unlock] [--dry-run]" >&2
		exit 2
		;;
	esac
done

if [ "$mode" = unlock ]; then
	policy='{"Statement":[{"Effect":"Allow","Action":"Update:*","Principal":"*","Resource":"*"}]}'
else
	bunx cdk synth --quiet "$stack" >/dev/null
	template="cdk.out/$stack.template.json"
	protected="$(jq -c '[.Resources | to_entries[]
		| select(.value.Type == "AWS::EC2::Instance" or .value.Type == "AWS::EC2::EIP" or .value.Type == "AWS::EC2::EIPAssociation")
		| .key] | sort' "$template")"
	[ "$(jq length <<<"$protected")" = 3 ] || { echo "expected 3 protected resources in $template, found $protected" >&2; exit 1; }
	policy="$(jq -c '{Statement: [
		{Effect: "Allow", Action: "Update:*", Principal: "*", Resource: "*"},
		{Effect: "Deny", Action: ["Update:Replace", "Update:Delete"], Principal: "*",
			Resource: map("LogicalResourceId/" + .)}
	]}' <<<"$protected")"
fi

if [ "$dry_run" = 1 ]; then
	jq . <<<"$policy"
	exit 0
fi

if [ "$mode" = lock ]; then
	deployed="$(aws cloudformation describe-stack-resources --stack-name "$stack" \
		--query 'StackResources[].LogicalResourceId' --output json)"
	missing="$(jq -r --argjson deployed "$deployed" 'map(select(. as $id | $deployed | index($id) | not)) | join(", ")' <<<"$protected")"
	[ -z "$missing" ] || { echo "not in the deployed stack (deploy first): $missing" >&2; exit 1; }
fi

aws cloudformation set-stack-policy --stack-name "$stack" --stack-policy-body "$policy"
echo "stack policy on $stack: $mode"
aws cloudformation get-stack-policy --stack-name "$stack" --query StackPolicyBody --output text | jq .
