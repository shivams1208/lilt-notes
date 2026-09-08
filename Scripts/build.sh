#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
npm run build:web
mkdir -p build 'dist/Lilt Notes.app/Contents/MacOS' 'dist/Lilt Notes.app/Contents/Resources/web'
swiftc -O -swift-version 5 -target arm64-apple-macosx14.0 -module-cache-path build/module-cache Sources/Vault.swift Sources/FolderSync.swift Sources/Shortcuts.swift Sources/WritingAssistant.swift Sources/NativeAppearance.swift Sources/IntegrationAudit.swift Sources/WindowSizingAudit.swift Sources/main.swift -o 'dist/Lilt Notes.app/Contents/MacOS/LiltNotes' -framework AppKit -framework WebKit -framework Carbon -Xlinker -weak_framework -Xlinker FoundationModels
cp web/index.html web/style.css web/bundle.js 'dist/Lilt Notes.app/Contents/Resources/web/'
cp -R web/fonts 'dist/Lilt Notes.app/Contents/Resources/web/'
cp LICENSE THIRD_PARTY_NOTICES.txt 'dist/Lilt Notes.app/Contents/Resources/'
cp Info.plist 'dist/Lilt Notes.app/Contents/Info.plist'
if [ -f Resources/AppIcon.icns ]; then cp Resources/AppIcon.icns 'dist/Lilt Notes.app/Contents/Resources/'; fi
codesign --force --deep --sign - 'dist/Lilt Notes.app'
codesign --verify --deep --strict 'dist/Lilt Notes.app'
