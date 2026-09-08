#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
mkdir -p build
npm run build:web
npm test
swiftc -swift-version 5 -module-cache-path build/module-cache Sources/Vault.swift Sources/FolderSync.swift Tests/VaultTests.swift -o build/vault-tests
./build/vault-tests
swiftc -swift-version 5 -module-cache-path build/module-cache Sources/Shortcuts.swift Tests/ShortcutTests.swift -o build/shortcut-tests -framework Carbon
./build/shortcut-tests
swiftc -swift-version 5 -module-cache-path build/module-cache Sources/WritingAssistant.swift Tests/WritingTests.swift -o build/writing-tests -Xlinker -weak_framework -Xlinker FoundationModels
./build/writing-tests
