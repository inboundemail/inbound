#!/usr/bin/env bash
# usage: deploy.sh smtp|imap|both <artifact.tar.gz>
# Requires GATEWAY_HOST_INSTANCE_ID and GATEWAY_ARTIFACT_BUCKET (stack outputs InstanceId, ArtifactBucketName).
set -euo pipefail

gateway="${1:-}"
artifact="${2:-}"
[[ "$gateway" =~ ^(smtp|imap|both)$ ]] && [ -f "$artifact" ] || { echo "usage: $0 smtp|imap|both <artifact.tar.gz>" >&2; exit 2; }
: "${GATEWAY_HOST_INSTANCE_ID:?set GATEWAY_HOST_INSTANCE_ID}"
: "${GATEWAY_ARTIFACT_BUCKET:?set GATEWAY_ARTIFACT_BUCKET}"
export AWS_REGION="${AWS_REGION:-us-east-2}"
document="${GATEWAY_DEPLOY_DOCUMENT:-InboundGatewayDeploy}"

name="$(basename "$artifact")"
[[ "$name" == "$gateway"-* ]] || { echo "$name is not a $gateway artifact" >&2; exit 2; }
key="releases/$name"
if command -v sha256sum >/dev/null; then
	sha256="$(sha256sum "$artifact" | cut -d' ' -f1)"
else
	sha256="$(shasum -a 256 "$artifact" | cut -d' ' -f1)"
fi

echo "==> upload s3://$GATEWAY_ARTIFACT_BUCKET/$key (sha256 $sha256)"
aws s3 cp "$artifact" "s3://$GATEWAY_ARTIFACT_BUCKET/$key" --only-show-errors

echo "==> $document on $GATEWAY_HOST_INSTANCE_ID"
command_id="$(aws ssm send-command \
	--instance-ids "$GATEWAY_HOST_INSTANCE_ID" \
	--document-name "$document" \
	--comment "deploy $gateway ${name%.tar.gz}" \
	--timeout-seconds 600 \
	--parameters "{\"gateway\":[\"$gateway\"],\"s3Key\":[\"$key\"],\"sha256\":[\"$sha256\"]}" \
	--query Command.CommandId --output text)"
echo "    command $command_id"

deadline=$((SECONDS + 1500))
status=Pending
while [ "$SECONDS" -lt "$deadline" ]; do
	sleep 5
	status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$GATEWAY_HOST_INSTANCE_ID" \
		--query Status --output text 2>/dev/null || echo Pending)"
	case "$status" in
	Pending | InProgress | Delayed) continue ;;
	*) break ;;
	esac
done

for stream in StandardOutputContent StandardErrorContent; do
	aws ssm get-command-invocation --command-id "$command_id" --instance-id "$GATEWAY_HOST_INSTANCE_ID" \
		--query "$stream" --output text || true
done
echo "==> status: $status"
[ "$status" = Success ]
