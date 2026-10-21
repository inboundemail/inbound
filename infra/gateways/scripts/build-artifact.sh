#!/usr/bin/env bash
# usage: build-artifact.sh smtp|imap|both [out-dir]
# Packs the gateway package(s) at HEAD (git archive: tracked files only, so no node_modules) into
# <out-dir>/<gateway>-<sha>.tar.gz and prints artifact=, key= and sha256= lines.
# With uncommitted changes in the package(s) it refuses unless ALLOW_DIRTY=1 (then packs the working tree).
set -euo pipefail

gateway="${1:-}"
out_dir="${2:-${TMPDIR:-/tmp}}"
case "$gateway" in
smtp | imap) packages=("$gateway-gateway") ;;
both) packages=(smtp-gateway imap-gateway) ;;
*)
	echo "usage: $0 smtp|imap|both [out-dir]" >&2
	exit 2
	;;
esac

root="$(git rev-parse --show-toplevel)"
sha="$(git -C "$root" rev-parse HEAD)"
paths=()
for pkg in "${packages[@]}"; do
	paths+=("packages/$pkg")
	git -C "$root" ls-files --error-unmatch "packages/$pkg/bun.lock" >/dev/null 2>&1 ||
		{ echo "packages/$pkg/bun.lock is not committed" >&2; exit 1; }
done

revision="$sha"
dirty="$(git -C "$root" status --porcelain -- "${paths[@]}")"
if [ -n "$dirty" ]; then
	[ "${ALLOW_DIRTY:-}" = 1 ] || { echo "uncommitted changes in ${paths[*]} (set ALLOW_DIRTY=1 to pack the working tree)" >&2; exit 1; }
	revision="$sha-dirty$(date +%s)"
fi

mkdir -p "$out_dir"
artifact="$(cd "$out_dir" && pwd)/$gateway-$revision.tar.gz"
if [ -z "$dirty" ]; then
	git -C "$root" archive --format=tar "HEAD:packages" "${packages[@]}" | gzip -n > "$artifact"
else
	(cd "$root/packages" && git ls-files -z -co --exclude-standard -- "${packages[@]}" |
		while IFS= read -r -d '' file; do if [ -e "$file" ] && [[ "$file" != */node_modules/* ]]; then printf '%s\0' "$file"; fi; done |
		COPYFILE_DISABLE=1 tar --no-xattrs --null -T - -czf "$artifact")
fi

if command -v sha256sum >/dev/null; then
	digest="$(sha256sum "$artifact" | cut -d' ' -f1)"
else
	digest="$(shasum -a 256 "$artifact" | cut -d' ' -f1)"
fi
echo "artifact=$artifact"
echo "key=releases/$gateway-$revision.tar.gz"
echo "sha256=$digest"
