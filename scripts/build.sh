#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/native-flags.sh
npm run build:web
mkdir -p build 'dist/Lilt Notes.app/Contents/MacOS' 'dist/Lilt Notes.app/Contents/Resources/web'
swiftc -O -swift-version 5 "${native_swift_flags[@]}" -target arm64-apple-macosx14.0 -module-cache-path build/module-cache sources/Vault.swift sources/FolderSync.swift sources/Shortcuts.swift sources/WritingAssistant.swift sources/NativeAppearance.swift sources/Spotlight.swift sources/SpotlightAudit.swift sources/CompatibilityAudit.swift sources/IntegrationAudit.swift sources/WindowSizingAudit.swift sources/main.swift -o 'dist/Lilt Notes.app/Contents/MacOS/LiltNotes' -framework AppKit -framework WebKit -framework Carbon -framework CoreSpotlight -Xlinker -weak_framework -Xlinker FoundationModels
cp web/index.html web/style.css web/bundle.js 'dist/Lilt Notes.app/Contents/Resources/web/'
cp -R web/fonts 'dist/Lilt Notes.app/Contents/Resources/web/'
cp LICENSE THIRD_PARTY_NOTICES.txt 'dist/Lilt Notes.app/Contents/Resources/'
cp Info.plist 'dist/Lilt Notes.app/Contents/Info.plist'
if [ -f resources/AppIcon.icns ]; then cp resources/AppIcon.icns 'dist/Lilt Notes.app/Contents/Resources/'; fi
codesign --force --deep --sign - 'dist/Lilt Notes.app'
codesign --verify --deep --strict 'dist/Lilt Notes.app'
