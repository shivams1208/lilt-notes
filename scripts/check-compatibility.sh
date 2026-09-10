#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
zsh scripts/build.sh
lilt_audit_root=$(mktemp -d "$PWD/build/compatibility.XXXXXX")
lilt_audit_app="$lilt_audit_root/Lilt Compatibility Check.app"
ditto 'dist/Lilt Notes.app' "$lilt_audit_app"
/usr/libexec/PlistBuddy -c 'Set CFBundleIdentifier com.shivam.liltnotes.compatibility-check' "$lilt_audit_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set CFBundleName Lilt Compatibility Check' "$lilt_audit_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set CFBundleDisplayName Lilt Compatibility Check' "$lilt_audit_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Delete CFBundleURLTypes' "$lilt_audit_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Delete CFBundleDocumentTypes' "$lilt_audit_app/Contents/Info.plist"
codesign --force --deep --sign - "$lilt_audit_app"
for lilt_audit_mode in native fallback sizing; do
  lilt_audit_options=(--compatibility-audit "$lilt_audit_root/$lilt_audit_mode.json")
  if [[ "$lilt_audit_mode" == fallback ]]; then lilt_audit_options+=(--no-glass); fi
  if [[ "$lilt_audit_mode" == sizing ]]; then lilt_audit_options=(--sizing-audit "$lilt_audit_root/$lilt_audit_mode.json"); fi
  python3 - "$lilt_audit_app/Contents/MacOS/LiltNotes" --data-dir "$lilt_audit_root/$lilt_audit_mode-data" --quit-after-audit "${lilt_audit_options[@]}" <<'PY'
import subprocess, sys
try:
    subprocess.run(sys.argv[1:], check=True, timeout=90)
except subprocess.TimeoutExpired:
    raise SystemExit('Compatibility test timed out; the isolated test process was stopped')
PY
  python3 - "$lilt_audit_root/$lilt_audit_mode.json" "$lilt_audit_root/$lilt_audit_mode-data/library.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    result = json.load(f)
if result.get('passed') is not True:
    raise SystemExit('Compatibility check failed: ' + str(result.get('error', 'missing result')))
if result.get('verifyFinalQuitMarkerOnDiskAfterExit'):
    with open(sys.argv[2]) as f:
        library = json.load(f)
    if not any('Final quit marker' in n['markdown'] for n in library['notes']):
        raise SystemExit('The final edit was not saved before quitting')
    result['finalEditSavedBeforeExit'] = True
    with open(sys.argv[1], 'w') as f:
        json.dump(result, f, indent=2)
print('Passed: ' + sys.argv[1])
PY
done
print "Compatibility reports: $lilt_audit_root"
