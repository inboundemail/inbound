#!/usr/bin/env bash
# usage: put-secrets.sh smtp|imap|shared NAME [NAME...]
# Writes each NAME as a SecureString at /inbound/gateways/<scope>/<NAME>, encrypted with the stack's KMS key
# (alias/inbound-gateways, the only key the instance can decrypt with). The value comes from the
# environment variable NAME when set, otherwise it is prompted for (hidden) or read as one line from stdin.
# Values never appear in argv, output or shell history.
set -euo pipefail

scope="${1:-}"
[[ "$scope" =~ ^(smtp|imap|shared)$ ]] && [ "$#" -ge 2 ] || { echo "usage: $0 smtp|imap|shared NAME [NAME...]" >&2; exit 2; }
shift
export AWS_REGION="${AWS_REGION:-us-east-2}"
prefix="${GATEWAY_PARAMETER_PREFIX:-/inbound/gateways}"
key_id="${GATEWAY_KMS_KEY_ID:-alias/inbound-gateways}"

umask 077
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

for name in "$@"; do
	[[ "$name" =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "invalid variable name: $name" >&2; exit 2; }
	if [ -n "${!name:-}" ]; then
		value="${!name}"
	elif [ -t 0 ]; then
		read -r -s -p "$name: " value
		echo >&2
	else
		IFS= read -r value || true
	fi
	[ -n "$value" ] || { echo "empty value for $name" >&2; exit 1; }
	printf '%s' "$value" | jq -Rs --arg name "$prefix/$scope/$name" --arg key "$key_id" \
		'{Name: $name, Type: "SecureString", KeyId: $key, Overwrite: true, Tier: "Standard", Value: .}' > "$tmp"
	unset value
	aws ssm put-parameter --cli-input-json "file://$tmp" --query Version --output text |
		sed "s#^#$prefix/$scope/$name -> version #"
done
