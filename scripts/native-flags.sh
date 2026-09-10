#!/bin/zsh
# SDK checks, rather than compiler-version checks, keep SDK 26 builds supported.
lilt_sdk_version=$(xcrun --sdk macosx --show-sdk-version)
native_swift_flags=()
if (( ${lilt_sdk_version%%.*} >= 27 )); then
  native_swift_flags+=(-D LILT_MACOS_27_SDK)
fi
