#!/usr/bin/env bash
# usage: verify.sh <host-ip> [smtp|imap|both]
# Checks the gateways on <host-ip> using the real hostnames for SNI and certificate verification,
# so it works against the new Elastic IP before DNS cutover. Needs OpenSSL >= 1.1.1 (not LibreSSL).
# VERIFY_IMAP_143=0 skips the port 143 checks (the old imap box does not serve 143).
set -uo pipefail

ip="${1:-}"
gateway="${2:-both}"
[ -n "$ip" ] && [[ "$gateway" =~ ^(smtp|imap|both)$ ]] || { echo "usage: $0 <host-ip> [smtp|imap|both]" >&2; exit 2; }
smtp_host="${SMTP_HOSTNAME:-smtp.inboundemail.com}"
imap_host="${IMAP_HOSTNAME:-imap.inboundemail.com}"
openssl_bin="${OPENSSL:-openssl}"
"$openssl_bin" version | grep -q '^OpenSSL [1-9]' || { echo "need OpenSSL (set OPENSSL=/path/to/openssl); got: $("$openssl_bin" version)" >&2; exit 2; }

failures=0
pass() { echo "PASS  $*"; }
fail() {
	echo "FAIL  $*"
	failures=$((failures + 1))
}
with_timeout() { perl -e 'alarm shift; exec @ARGV' "$@"; }
crlf_strip() { tr -d '\r'; }

tls_check() {
	local port="$1" host="$2" starttls="${3:-}" out args
	args=(s_client -connect "$ip:$port" -servername "$host" -verify_hostname "$host" -verify_return_error)
	[ -n "$starttls" ] && args+=(-starttls "$starttls")
	if ! out="$(with_timeout 20 "$openssl_bin" "${args[@]}" </dev/null 2>&1)"; then
		fail "$host:$port TLS handshake/verification ($(printf '%s\n' "$out" | grep -m1 -iE 'verify error|error|refused' || echo 'no detail'))"
		return
	fi
	local cert enddate
	cert="$(printf '%s\n' "$out" | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p')"
	enddate="$(printf '%s\n' "$cert" | "$openssl_bin" x509 -noout -enddate | cut -d= -f2)"
	if printf '%s\n' "$cert" | "$openssl_bin" x509 -noout -checkend 1209600 >/dev/null; then
		pass "$host:$port TLS${starttls:+ (STARTTLS)} valid for $host, expires $enddate"
	else
		fail "$host:$port certificate expires within 14 days ($enddate)"
	fi
}

tls_session() {
	local port="$1" host="$2" starttls="$3"
	shift 3
	local args=(s_client -connect "$ip:$port" -servername "$host" -quiet -crlf)
	[ -n "$starttls" ] && args+=(-starttls "$starttls")
	{
		sleep 2
		for line in "$@"; do
			printf '%s\n' "$line"
			sleep 1
		done
	} | with_timeout 20 "$openssl_bin" "${args[@]}" 2>/dev/null | crlf_strip
}

# Plaintext dialogue over bash /dev/tcp: reads until a line matching $2 after sending $1.
plain_exchange() {
	local port="$1" command="$2" until="$3" greeting_until="$4" line out=""
	exec 3<>"/dev/tcp/$ip/$port" || return 1
	while IFS= read -r -t 10 line <&3; do
		line="${line%$'\r'}"
		[[ "$line" =~ $greeting_until ]] && break
	done
	printf '%s\r\n' "$command" >&3
	while IFS= read -r -t 10 line <&3; do
		line="${line%$'\r'}"
		out="$out$line"$'\n'
		[[ "$line" =~ $until ]] && break
	done
	exec 3<&- 3>&-
	printf '%s' "$out"
}

check_smtp() {
	local ehlo
	if ehlo="$(plain_exchange 587 "EHLO verify.inbound" '^250 ' '^220 ')" && [ -n "$ehlo" ]; then
		if grep -q '^250[- ]STARTTLS' <<<"$ehlo"; then pass "$smtp_host:587 offers STARTTLS"; else fail "$smtp_host:587 does not offer STARTTLS"; fi
		if grep -q '^250[- ]AUTH' <<<"$ehlo"; then fail "$smtp_host:587 offers AUTH before TLS"; else pass "$smtp_host:587 hides AUTH before TLS"; fi
	else
		fail "$smtp_host:587 no EHLO response"
	fi
	tls_check 587 "$smtp_host" smtp
	if tls_session 587 "$smtp_host" smtp "EHLO verify.inbound" QUIT | grep -q '^250[- ]AUTH'; then
		pass "$smtp_host:587 offers AUTH after STARTTLS"
	else
		fail "$smtp_host:587 no AUTH after STARTTLS"
	fi

	tls_check 465 "$smtp_host"
	local session
	session="$(tls_session 465 "$smtp_host" "" "EHLO verify.inbound" QUIT)"
	if grep -q '^220 ' <<<"$session" && grep -q '^250[- ]AUTH' <<<"$session"; then
		pass "$smtp_host:465 implicit TLS greets and offers AUTH"
	else
		fail "$smtp_host:465 unexpected implicit TLS session"
	fi
}

check_imap() {
	tls_check 993 "$imap_host"
	local session
	session="$(tls_session 993 "$imap_host" "" "a1 CAPABILITY" "a2 LOGOUT")"
	if grep -q '^\* CAPABILITY .*IMAP4rev1' <<<"$session" && grep -q '^a1 OK' <<<"$session"; then
		if grep -q 'LOGINDISABLED' <<<"$session"; then fail "$imap_host:993 reports LOGINDISABLED over TLS"; else pass "$imap_host:993 CAPABILITY ok"; fi
	else
		fail "$imap_host:993 CAPABILITY failed"
	fi

	[ "${VERIFY_IMAP_143:-0}" = 1 ] || return 0
	local caps
	if caps="$(plain_exchange 143 "a1 CAPABILITY" '^a1 ' '^\* OK')" && grep -q '^\* CAPABILITY' <<<"$caps"; then
		if grep -q 'STARTTLS' <<<"$caps"; then pass "$imap_host:143 offers STARTTLS"; else fail "$imap_host:143 does not offer STARTTLS"; fi
		if grep -q 'LOGINDISABLED' <<<"$caps"; then pass "$imap_host:143 disables LOGIN before TLS"; else fail "$imap_host:143 allows LOGIN before TLS"; fi
	else
		fail "$imap_host:143 no CAPABILITY response"
	fi
	tls_check 143 "$imap_host" imap
}

echo "verifying $gateway on $ip"
case "$gateway" in
smtp) check_smtp ;;
imap) check_imap ;;
both)
	check_smtp
	check_imap
	;;
esac

if [ "$failures" -gt 0 ]; then
	echo "$failures check(s) failed"
	exit 1
fi
echo "all checks passed"
