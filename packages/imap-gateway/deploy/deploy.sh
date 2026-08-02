#!/usr/bin/env bash
set -euo pipefail

HOST="${IMAPGW_HOST:-18.223.141.122}"
SSH_KEY="${IMAPGW_SSH_KEY:-$HOME/.ssh/inbound-smtp-gateway.pem}"
SSH_USER="${IMAPGW_SSH_USER:-ubuntu}"
IMAP_HOSTNAME="${IMAPGW_IMAP_HOSTNAME:-imap.inboundemail.com}"

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$SSH_USER@$HOST")

echo "==> typecheck"
(cd "$PKG_DIR" && bunx tsc --noEmit)

echo "==> package"
TARBALL="$(mktemp -t imap-gateway).tgz"
COPYFILE_DISABLE=1 tar czf "$TARBALL" --no-xattrs -C "$PKG_DIR/.." \
  --exclude node_modules --exclude '.DS_Store' imap-gateway

echo "==> upload to $HOST"
scp -q -i "$SSH_KEY" "$TARBALL" "$SSH_USER@$HOST:/tmp/imap-gateway.tgz"
rm -f "$TARBALL"

echo "==> install + restart"
"${SSH[@]}" sudo bash -s << 'REMOTE'
set -euo pipefail
cd /opt/inbound/packages
rm -rf imap-gateway.prev
[ -d imap-gateway ] && cp -a imap-gateway imap-gateway.prev
tar xzf /tmp/imap-gateway.tgz -C /opt/inbound/packages/
rm -f /tmp/imap-gateway.tgz
cd imap-gateway
bun install --production --silent
chown -R imapgw:imapgw /opt/inbound/packages/imap-gateway
if ! cmp -s deploy/imap-gateway.service /etc/systemd/system/imap-gateway.service; then
  cp deploy/imap-gateway.service /etc/systemd/system/
  systemctl daemon-reload
  echo "systemd unit updated"
fi
systemctl restart imap-gateway
for i in $(seq 1 10); do
  sleep 1
  systemctl is-active --quiet imap-gateway && break
  [ "$i" = 10 ] && { echo "service failed to start"; journalctl -u imap-gateway --no-pager | tail -20; exit 1; }
done
journalctl -u imap-gateway --no-pager --since "-15s" | grep -i listening
REMOTE

echo "==> smoke test ($IMAP_HOSTNAME:993)"
out=$(curl -s -m 20 --resolve "$IMAP_HOSTNAME:993:$HOST" --url "imaps://$IMAP_HOSTNAME:993/" --user 'smoke@example.com:bad-key' -o /dev/null -w '%{exitcode}' || true)
if [ "$out" = "67" ]; then
  echo "    imaps://$IMAP_HOSTNAME:993 OK (login denied for bad creds)"
else
  echo "    imaps://$IMAP_HOSTNAME:993 unexpected curl exit: $out"
  exit 1
fi

echo "==> deployed"
