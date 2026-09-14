#!/usr/bin/env bash
set -euo pipefail

APP="cagent"
REPO="${CAGENT_REPO:-thisjulio/cagent}"
INSTALL_DIR="${CAGENT_INSTALL_DIR:-${XDG_BIN_DIR:-$HOME/.local/bin}}"
requested_version="${CAGENT_VERSION:-}"
modify_path=true

usage() {
  cat <<'EOF'
cagent installer

Usage: install.sh [options]

Options:
  -h, --help              Show this help
  -v, --version VERSION   Install a specific version
      --no-modify-path    Do not update shell configuration
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -v|--version)
      [[ -n "${2:-}" ]] || { echo "--version requires a value" >&2; exit 1; }
      requested_version="$2"
      shift 2
      ;;
    --no-modify-path) modify_path=false; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
  if [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" == "1" ]]; then
    arch="arm64"
  fi
fi

asset="$APP-$os-$arch"
if [[ -n "$requested_version" ]]; then
  tag="v${requested_version#v}"
  base_url="https://github.com/$REPO/releases/download/$tag"
else
  tag="latest"
  base_url="https://github.com/$REPO/releases/latest/download"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
binary="$tmp_dir/$asset"
checksums="$tmp_dir/SHA256SUMS"

echo "Downloading $APP ($os/$arch, $tag)"
curl -fsSL "$base_url/$asset" -o "$binary"
curl -fsSL "$base_url/SHA256SUMS" -o "$checksums"

expected="$(awk -v name="$asset" '$2 == name { print $1; exit }' "$checksums")"
[[ -n "$expected" ]] || { echo "Checksum not found for $asset" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$binary" | cut -d ' ' -f 1)"
else
  actual="$(shasum -a 256 "$binary" | cut -d ' ' -f 1)"
fi
[[ "$actual" == "$expected" ]] || { echo "Checksum verification failed" >&2; exit 1; }

mkdir -p "$INSTALL_DIR"
install -m 0755 "$binary" "$INSTALL_DIR/$APP"
echo "Installed $INSTALL_DIR/$APP"

if [[ "$modify_path" == true && ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  shell_name="${SHELL##*/}"
  case "$shell_name" in
    bash|zsh)
      config="$HOME/.${shell_name}rc"
      printf '\n# cagent\nexport PATH="%s:$PATH"\n' "$INSTALL_DIR" >> "$config"
      echo "Added $INSTALL_DIR to $config"
      ;;
    *)
      echo "Add this directory to PATH: $INSTALL_DIR"
      ;;
  esac
fi

if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
  echo "Run: $APP"
else
  echo "Open a new terminal, or run: export PATH=\"$INSTALL_DIR:\$PATH\""
  echo "Then run: $APP"
fi
