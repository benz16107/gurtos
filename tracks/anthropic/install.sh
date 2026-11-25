#!/bin/sh
# The installer moved to install.sh at the top of the repository. This stays so old links keep working.
set -eu
curl -fsSL https://raw.githubusercontent.com/benz16107/gurtos/main/install.sh | sh -s -- "$@"
