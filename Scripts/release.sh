#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
git rev-parse --is-inside-work-tree >/dev/null
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  print -u2 'Commit your source changes before packaging a release.'
  exit 1
fi
release_version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')
app_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' Info.plist)
if [[ "$release_version" != "$app_version" ]]; then
  print -u2 'package.json and Info.plist versions must match.'
  exit 1
fi
zsh Scripts/build.sh
zsh Scripts/test.sh
git diff --exit-code
mkdir -p release
app_archive="Lilt-Notes-${release_version}-macOS-arm64.zip"
source_archive="Lilt-Notes-${release_version}-Source.zip"
ditto -c -k --sequesterRsrc --keepParent 'dist/Lilt Notes.app' "release/${app_archive}"
git archive --format=zip --prefix="lilt-notes-${release_version}/" --output="release/${source_archive}" HEAD
cd release
shasum -a 256 "$app_archive" "$source_archive" > SHA256SUMS.txt
print "Release files are ready in release/ for version ${release_version}."
