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

if [ ! -f /var/lib/inbound/.base-upgraded ]; then
	log "first run: apt full-upgrade"
	apt_get update -q
	apt_get -yq full-upgrade
	mkdir -p /var/lib/inbound && touch /var/lib/inbound/.base-upgraded
fi
packages=(unattended-upgrades unzip xz-utils jq curl ca-certificates openssl iproute2)
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
systemctl daemon-reload
systemctl enable smtp-gateway.service imap-gateway.service >/dev/null
systemctl enable --now inbound-certs.timer >/dev/null
if [ "${#units_changed[@]}" -gt 0 ]; then
	log "units updated: ${units_changed[*]} (gateway unit changes apply on next deploy or restart)"
fi

log "host runtime settings from SSM"
artifact_bucket="$(aws ssm get-parameter --name "$PARAMETER_PREFIX/host/artifact-bucket" --query Parameter.Value --output text)"
acme_zone_id="$(aws ssm get-parameter --name "$PARAMETER_PREFIX/host/acme-zone-id" --query Parameter.Value --output text)"
runtime="$(mktemp /etc/inbound/.host-runtime.XXXXXX)"
printf 'ARTIFACT_BUCKET=%s\nACME_ZONE_ID=%s\n' "$artifact_bucket" "$acme_zone_id" > "$runtime"
chmod 0640 "$runtime"
mv -f "$runtime" /etc/inbound/host-runtime.env

for gateway in smtp imap; do
	/usr/local/sbin/inbound-render-env "$gateway" || log "env for $gateway not rendered yet (put secrets, then deploy)"
done

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
