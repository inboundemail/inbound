#!/bin/bash
# Idempotent host setup. Run as root by cloud-init and by inbound-host-sync.
set -euo pipefail
umask 022

HOST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_URL="${1:-}"
LOG=/var/log/inbound-bootstrap.log
if [ "${INBOUND_BOOTSTRAP_LOGGING:-}" != 1 ]; then
	export INBOUND_BOOTSTRAP_LOGGING=1
	(umask 027 && touch "$LOG") && chown root:adm "$LOG" && chmod 0640 "$LOG"
	exec > >(tee -a "$LOG") 2>&1
fi
log() { echo "[bootstrap $(date -Is)] $*"; }

. "$HOST_DIR/host.env"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION" DEBIAN_FRONTEND=noninteractive
export PATH="$PATH:/snap/bin"

log "starting (bundle: ${BUNDLE_URL:-local})"

apt_get() {
	apt-get -o DPkg::Lock::Timeout=300 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@"
}

# Writes stdin to a root-owned file when its content differs. Returns 1 when the file was unchanged.
put_file() {
	local mode="$1" path="$2" staged
	staged="$(mktemp)"
	cat > "$staged"
	if cmp -s "$staged" "$path"; then
		rm -f "$staged"
		return 1
	fi
	install -D -m "$mode" -o root -g root "$staged" "$path"
	rm -f "$staged"
}

if [ ! -f /var/lib/inbound/.base-upgraded ]; then
	log "first run: apt full-upgrade"
	apt_get update -q
	apt_get -yq full-upgrade
	mkdir -p /var/lib/inbound && touch /var/lib/inbound/.base-upgraded
fi
packages=(unattended-upgrades unzip xz-utils jq curl ca-certificates openssl iproute2 nftables)
missing=()
for pkg in "${packages[@]}"; do
	dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q "install ok installed" || missing+=("$pkg")
done
if [ "${#missing[@]}" -gt 0 ]; then
	log "installing ${missing[*]}"
	apt_get update -q
	apt_get -yq install "${missing[@]}"
fi
command -v aws >/dev/null || snap install aws-cli --classic

log "configuring unattended-upgrades (security only, reboot=${AUTO_REBOOT} at ${AUTO_REBOOT_TIME} UTC, snap refresh ${SNAP_REFRESH_TIMER})"
timedatectl set-timezone Etc/UTC
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52inbound-unattended-upgrades <<EOF
Unattended-Upgrade::Allowed-Origins {
	"\${distro_id}:\${distro_codename}-security";
	"\${distro_id}ESMApps:\${distro_codename}-apps-security";
	"\${distro_id}ESM:\${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "${AUTO_REBOOT}";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "${AUTO_REBOOT_TIME}";
EOF
systemctl enable --now unattended-upgrades.service >/dev/null

log "needrestart: never restart the gateways outside the reboot window"
install -d -m 0755 /etc/needrestart/conf.d
cat > /etc/needrestart/conf.d/50-inbound.conf <<'EOF'
$nrconf{override_rc}{qr(^(smtp|imap)-gateway\.service$)} = 0;
EOF
snap set system refresh.timer="$SNAP_REFRESH_TIMER"

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
	log "swap: ${SWAP_SIZE_MIB} MiB /swapfile"
	rm -f /swapfile
	(umask 077 && fallocate -l "${SWAP_SIZE_MIB}M" /swapfile)
	chmod 0600 /swapfile
	mkswap /swapfile >/dev/null
	swapon /swapfile
fi
grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness = 10' > /etc/sysctl.d/60-inbound-swap.conf
sysctl -q -p /etc/sysctl.d/60-inbound-swap.conf

fetch_verified() {
	local url="$1" sha="$2" out="$3"
	curl -fsSL --proto '=https' --tlsv1.2 --retry 3 -o "$out" "$url"
	echo "$sha  $out" | sha256sum -c --quiet - || { log "checksum mismatch for $url"; return 1; }
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if [ "$(/usr/local/bin/bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
	log "installing bun $BUN_VERSION"
	fetch_verified "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-aarch64.zip" "$BUN_SHA256" "$tmp/bun.zip"
	unzip -q "$tmp/bun.zip" -d "$tmp/bun"
	install -D -m 0755 "$tmp/bun/bun-linux-aarch64/bun" "/opt/bun/$BUN_VERSION/bun"
	ln -sfn "/opt/bun/$BUN_VERSION/bun" /usr/local/bin/bun
fi

if [ "$(/usr/local/bin/node --version 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
	log "installing node $NODE_VERSION"
	fetch_verified "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz" "$NODE_SHA256" "$tmp/node.tar.xz"
	rm -rf "/opt/node/$NODE_VERSION"
	mkdir -p "/opt/node/$NODE_VERSION"
	tar -xJf "$tmp/node.tar.xz" -C "/opt/node/$NODE_VERSION" --strip-components=1 --no-same-owner
	ln -sfn "/opt/node/$NODE_VERSION/bin/node" /usr/local/bin/node
fi

if ! /usr/local/bin/lego --version 2>/dev/null | grep -q "$LEGO_VERSION"; then
	log "installing lego $LEGO_VERSION"
	fetch_verified "https://github.com/go-acme/lego/releases/download/v${LEGO_VERSION}/lego_v${LEGO_VERSION}_linux_arm64.tar.gz" "$LEGO_SHA256" "$tmp/lego.tar.gz"
	tar -xzf "$tmp/lego.tar.gz" -C "$tmp" --no-same-owner lego
	install -m 0755 "$tmp/lego" /usr/local/bin/lego
fi

log "users and directories"
getent group inboundgw >/dev/null || groupadd --system inboundgw
for user in smtpgw imapgw; do
	id "$user" >/dev/null 2>&1 || useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$user"
	usermod -aG inboundgw "$user"
done
id inboundbuild >/dev/null 2>&1 || useradd --system --user-group --create-home --home-dir /var/lib/inbound-build --shell /usr/sbin/nologin inboundbuild
chmod 0750 /var/lib/inbound-build

install -d -m 0755 -o root -g root /opt/inbound /opt/inbound/releases
install -d -m 0755 -o root -g root /opt/inbound/staging
install -d -m 0750 -o root -g inboundgw /etc/inbound /etc/inbound/tls
install -d -m 0750 -o root -g smtpgw /etc/inbound/tls/smtp
install -d -m 0750 -o root -g imapgw /etc/inbound/tls/imap
install -d -m 0700 -o root -g root /var/lib/lego /var/lib/inbound

log "host scripts and units"
install -m 0640 -o root -g root "$HOST_DIR/host.env" /etc/inbound/host.env
for script in "$HOST_DIR"/sbin/*; do
	install -m 0755 -o root -g root "$script" "/usr/local/sbin/$(basename "$script")"
done
units_changed=()
for unit in "$HOST_DIR"/systemd/*; do
	name="$(basename "$unit")"
	if ! cmp -s "$unit" "/etc/systemd/system/$name"; then
		install -m 0644 -o root -g root "$unit" "/etc/systemd/system/$name"
		units_changed+=("$name")
	fi
done
# A failed gateway or certificate run publishes an alert (inbound-alert, at most one per unit per
# ALERT_MIN_INTERVAL_SECONDS). Gateway units pass through "failed" on every crash before restarting.
for name in smtp-gateway.service imap-gateway.service inbound-certs.service inbound-health-check.service inbound-health-report.service; do
	put_file 0644 "/etc/systemd/system/$name.d/50-inbound-alert.conf" <<'EOF' && units_changed+=("$name.d/50-inbound-alert.conf")
[Unit]
OnFailure=inbound-alert@%n.service
EOF
done
systemctl daemon-reload
systemctl enable smtp-gateway.service imap-gateway.service >/dev/null
systemctl enable --now inbound-certs.timer inbound-disk-check.timer inbound-health-check.timer inbound-health-report.timer >/dev/null
if [ "${#units_changed[@]}" -gt 0 ]; then
	log "units updated: ${units_changed[*]} (gateway unit changes apply on next deploy or restart)"
fi

log "ssh: disabled and masked (access is through SSM Session Manager)"
for unit in ssh.socket ssh.service; do
	if [ "$(systemctl is-enabled "$unit" 2>/dev/null || true)" != masked ]; then
		systemctl disable --now "$unit" >/dev/null 2>&1 || true
		systemctl mask "$unit" >/dev/null 2>&1
		log "ssh: masked $unit"
	fi
done

log "journald: the only log store, ${JOURNAL_MAX_USE} max, rate-limited"
[[ "$JOURNAL_MAX_USE" =~ ^[1-9][0-9]{0,5}[KMG]$ ]] || { log "invalid JOURNAL_MAX_USE: $JOURNAL_MAX_USE"; exit 1; }
journald_changed=0
put_file 0644 /etc/systemd/journald.conf.d/50-inbound.conf <<EOF && journald_changed=1
[Journal]
Storage=persistent
SystemMaxUse=${JOURNAL_MAX_USE}
SystemKeepFree=2G
SystemMaxFileSize=64M
RuntimeMaxUse=64M
RateLimitIntervalSec=30s
RateLimitBurst=5000
EOF
# Same name as Ubuntu's /usr/lib/systemd/journald.conf.d/syslog.conf (ForwardToSyslog=yes), which
# would otherwise sort after 50-inbound.conf. Without forwarding, rsyslog's /var/log/syslog no
# longer duplicates (and escapes the limits of) the journal.
put_file 0644 /etc/systemd/journald.conf.d/syslog.conf <<'EOF' && journald_changed=1
[Journal]
ForwardToSyslog=no
EOF
if [ "$journald_changed" = 1 ]; then
	systemctl restart systemd-journald.service
	log "journald: settings applied"
fi

log "firewall: per source IPv4 and gateway port, at most ${FIREWALL_MAX_CONNECTIONS_PER_IP} connections and ${FIREWALL_NEW_CONNECTIONS_PER_MINUTE}/min (burst ${FIREWALL_NEW_CONNECTIONS_BURST}) new ones"
for var in FIREWALL_MAX_CONNECTIONS_PER_IP FIREWALL_NEW_CONNECTIONS_PER_MINUTE FIREWALL_NEW_CONNECTIONS_BURST; do
	[[ "${!var}" =~ ^[1-9][0-9]{0,4}$ ]] || { log "invalid $var: ${!var}"; exit 1; }
done
gateway_ports="465, 587, 993"
[ "$IMAP_STARTTLS_PORT_ENABLED" = true ] && gateway_ports+=", 143"
firewall_changed=0
put_file 0644 /etc/inbound/conntrack.sysctl <<'EOF' && firewall_changed=1
# Applied by inbound-firewall.service. Only gateway connections are tracked (see firewall.nft).
net.netfilter.nf_conntrack_max = 131072
net.netfilter.nf_conntrack_tcp_timeout_syn_sent = 30
net.netfilter.nf_conntrack_tcp_timeout_syn_recv = 30
net.netfilter.nf_conntrack_tcp_timeout_established = 7200
EOF
firewall="$(mktemp)"
cat > "$firewall" <<EOF
#!/usr/sbin/nft -f
# Managed by infra/gateways/host/bootstrap.sh (values from host.env). Loaded by inbound-firewall.service.
# Only touches its own table, so it never flushes rules anything else adds.
table inet inbound_limits
delete table inet inbound_limits

table inet inbound_limits {
	set gateway_connections {
		type ipv4_addr . inet_service
		flags dynamic
		size 65536
	}

	set gateway_new_connections {
		type ipv4_addr . inet_service
		flags dynamic,timeout
		timeout 5m
		size 65536
	}

	# Connection tracking only for the gateway ports. Everything else (SSM agent, apt, S3, the
	# gateways' own outbound connections) stays untracked, so a full conntrack table can't affect it.
	chain prerouting_raw {
		type filter hook prerouting priority raw; policy accept;
		iif "lo" notrack
		tcp dport { ${gateway_ports} } return
		notrack
	}

	chain output_raw {
		type filter hook output priority raw; policy accept;
		oif "lo" notrack
		tcp sport { ${gateway_ports} } return
		notrack
	}

	chain input {
		type filter hook input priority filter - 10; policy accept;
		meta nfproto ipv4 tcp dport { ${gateway_ports} } tcp flags & (fin | syn | rst | ack) == syn ct state new jump gateway_new
	}

	chain gateway_new {
		add @gateway_new_connections { ip saddr . tcp dport limit rate over ${FIREWALL_NEW_CONNECTIONS_PER_MINUTE}/minute burst ${FIREWALL_NEW_CONNECTIONS_BURST} packets } counter drop comment "new connections per source"
		add @gateway_connections { ip saddr . tcp dport ct count over ${FIREWALL_MAX_CONNECTIONS_PER_IP} } counter drop comment "concurrent connections per source"
	}
}
EOF
nft -c -f "$firewall" || { log "firewall: ruleset check failed, not applying"; rm -f "$firewall"; exit 1; }
put_file 0644 /etc/inbound/firewall.nft < "$firewall" && firewall_changed=1
rm -f "$firewall"
systemctl enable inbound-firewall.service >/dev/null 2>&1
if ! systemctl is-active --quiet inbound-firewall.service; then
	systemctl start inbound-firewall.service
elif [ "$firewall_changed" = 1 ]; then
	systemctl reload inbound-firewall.service
fi

log "host runtime settings from SSM"
ssm_value() { aws ssm get-parameter --name "$PARAMETER_PREFIX/host/$1" --query Parameter.Value --output text; }
artifact_bucket="$(ssm_value artifact-bucket)"
acme_zone_id="$(ssm_value acme-zone-id)"
alert_topic_arn="$(ssm_value alert-topic-arn)"
# root sources host-runtime.env: accept only values that can't carry shell syntax.
[[ "$artifact_bucket" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { log "refusing artifact-bucket from SSM: not a bucket name"; exit 1; }
[[ "$acme_zone_id" =~ ^Z[A-Z0-9]{1,32}$ ]] || { log "refusing acme-zone-id from SSM: not a hosted zone ID"; exit 1; }
[[ "$alert_topic_arn" =~ ^arn:aws:sns:${AWS_REGION}:[0-9]{12}:[A-Za-z0-9_-]{1,256}$ ]] || { log "refusing alert-topic-arn from SSM: not an SNS topic ARN in $AWS_REGION"; exit 1; }
runtime="$(mktemp /etc/inbound/.host-runtime.XXXXXX)"
printf 'ARTIFACT_BUCKET=%s\nACME_ZONE_ID=%s\nALERT_TOPIC_ARN=%s\n' "$artifact_bucket" "$acme_zone_id" "$alert_topic_arn" > "$runtime"
chmod 0640 "$runtime"
mv -f "$runtime" /etc/inbound/host-runtime.env

for gateway in smtp imap; do
	/usr/local/sbin/inbound-render-env "$gateway" || log "env for $gateway not rendered yet (put secrets, then deploy)"
done
/usr/local/sbin/inbound-render-env health || log "health thresholds not rendered (inbound-health uses the host.env defaults)"

if [ -n "$BUNDLE_URL" ]; then
	printf '%s\n' "$BUNDLE_URL" > /etc/inbound/host-bundle
fi
log "done"

if [ "${INBOUND_BOOTSTRAP_FROM_USER_DATA:-}" = 1 ] && [ ! -e /var/lib/inbound/.first-bootstrap-done ]; then
	touch /var/lib/inbound/.first-bootstrap-done
	if [ -e /var/run/reboot-required ]; then
		log "first bootstrap: reboot required by the base upgrade, rebooting in 1 minute"
		shutdown -r +1 "inbound first-boot reboot" >/dev/null 2>&1
	fi
fi
