#!/usr/bin/env bash
set -euo pipefail

HOST="${SMTPGW_HOST:-18.221.244.100}"
SSH_KEY="${SMTPGW_SSH_KEY:-$HOME/.ssh/inbound-smtp-gateway.pem}"
SSH_USER="${SMTPGW_SSH_USER:-ubuntu}"
SMTP_HOSTNAME="${SMTPGW_SMTP_HOSTNAME:-smtp.inboundemail.com}"

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$SSH_USER@$HOST")

echo "==> typecheck"
(cd "$PKG_DIR" && bunx tsc --noEmit)

echo "==> package"
TARBALL="$(mktemp "${TMPDIR:-/tmp}/smtp-gateway.XXXXXX")"
COPYFILE_DISABLE=1 tar czf "$TARBALL" --no-xattrs -C "$PKG_DIR/.." \
  --exclude node_modules --exclude '.DS_Store' smtp-gateway

echo "==> upload to $HOST"
scp -q -i "$SSH_KEY" "$TARBALL" "$SSH_USER@$HOST:/tmp/smtp-gateway.tgz"
rm -f "$TARBALL"

deployed=0
rollback() {
  echo "==> deploy failed, restoring the previous version"
  "${SSH[@]}" sudo bash -s << 'REMOTE'
set -euo pipefail
cd /opt/inbound/packages
[ -d smtp-gateway.prev ] || { echo "no previous version to restore"; exit 1; }
rm -rf smtp-gateway
mv smtp-gateway.prev smtp-gateway
if ! cmp -s smtp-gateway/deploy/smtp-gateway.service /etc/systemd/system/smtp-gateway.service; then
  cp smtp-gateway/deploy/smtp-gateway.service /etc/systemd/system/
  systemctl daemon-reload
fi
systemctl restart smtp-gateway
sleep 2
systemctl is-active smtp-gateway
REMOTE
}
trap '[ "$deployed" = 1 ] || rollback' EXIT

echo "==> install + restart"
"${SSH[@]}" sudo bash -s << 'REMOTE'
set -euo pipefail
cd /opt/inbound/packages
rm -rf smtp-gateway.prev
[ -d smtp-gateway ] && mv smtp-gateway smtp-gateway.prev
tar xzf /tmp/smtp-gateway.tgz -C /opt/inbound/packages/
rm -f /tmp/smtp-gateway.tgz
cd smtp-gateway
bun install --production --silent
chown -R smtpgw:smtpgw /opt/inbound/packages/smtp-gateway
if ! cmp -s deploy/smtp-gateway.service /etc/systemd/system/smtp-gateway.service; then
  cp deploy/smtp-gateway.service /etc/systemd/system/
  systemctl daemon-reload
  echo "systemd unit updated"
fi
systemctl restart smtp-gateway
for i in $(seq 1 10); do
  sleep 1
  systemctl is-active --quiet smtp-gateway && break
  [ "$i" = 10 ] && { echo "service failed to start"; journalctl -u smtp-gateway --no-pager | tail -20; exit 1; }
done
journalctl -u smtp-gateway --no-pager --since "-15s" | grep listening
REMOTE

echo "==> smoke test ($SMTP_HOSTNAME:587 STARTTLS + :465 TLS)"
for check in "smtp://$SMTP_HOSTNAME:587 --ssl-reqd" "smtps://$SMTP_HOSTNAME:465"; do
  # shellcheck disable=SC2086
  out=$(curl -s -m 20 -v --url ${check% *} ${check#* } --user 'inbound:deploy-smoke-test' \
    --mail-from smoke@example.com --mail-rcpt smoke@example.com \
    --upload-file /dev/null 2>&1 | grep -c '535 5.7.8' || true)
  if [ "$out" -ge 1 ]; then
    echo "    ${check% *} OK"
  else
    echo "    ${check% *} FAILED (expected 535 for bad key)"
    exit 1
  fi
done

deployed=1
echo "==> deployed"
