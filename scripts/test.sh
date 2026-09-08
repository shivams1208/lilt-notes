#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
mkdir -p build
npm run build:web
npm test
swiftc -swift-version 5 -module-cache-path build/module-cache sources/Vault.swift sources/FolderSync.swift tests/VaultTests.swift -o build/vault-tests
./build/vault-tests
swiftc -swift-version 5 -module-cache-path build/module-cache sources/Shortcuts.swift tests/ShortcutTests.swift -o build/shortcut-tests -framework Carbon
./build/shortcut-tests
swiftc -swift-version 5 -module-cache-path build/module-cache sources/WritingAssistant.swift tests/WritingTests.swift -o build/writing-tests -Xlinker -weak_framework -Xlinker FoundationModels
./build/writing-tests
