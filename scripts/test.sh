#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/native-flags.sh
mkdir -p build
lilt_test_root=$(mktemp -d "$PWD/build/tests.XXXXXX")
trap 'rm -rf -- "$lilt_test_root"' EXIT
npm run build:web
npm test
swiftc -swift-version 5 -module-cache-path build/module-cache sources/Vault.swift sources/FolderSync.swift tests/VaultTests.swift -o "$lilt_test_root/vault-tests"
"$lilt_test_root/vault-tests"
swiftc -swift-version 5 -module-cache-path build/module-cache sources/Shortcuts.swift tests/ShortcutTests.swift -o "$lilt_test_root/shortcut-tests" -framework Carbon
"$lilt_test_root/shortcut-tests"
swiftc -swift-version 5 "${native_swift_flags[@]}" -target arm64-apple-macosx14.0 -module-cache-path build/module-cache sources/WritingAssistant.swift tests/WritingTests.swift -o "$lilt_test_root/writing-tests" -Xlinker -weak_framework -Xlinker FoundationModels
"$lilt_test_root/writing-tests"
if [[ "${LILT_TEST_LIVE:-0}" == 1 ]]; then "$lilt_test_root/writing-tests" --live; fi
swiftc -swift-version 5 -module-cache-path build/module-cache sources/Vault.swift sources/Spotlight.swift tests/SpotlightTests.swift -o "$lilt_test_root/spotlight-tests" -framework CoreSpotlight
"$lilt_test_root/spotlight-tests"
swiftc -swift-version 5 -module-cache-path build/module-cache sources/PanelPolicy.swift tests/PanelPolicyTests.swift -o "$lilt_test_root/panel-policy-tests" -framework AppKit
"$lilt_test_root/panel-policy-tests"
