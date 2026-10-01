#!/bin/bash
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
exec /bin/bash "$script_dir/manage-plugin.sh" install "$@"
