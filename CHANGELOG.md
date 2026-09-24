# Changelog

## 1.1.2

- Restore Notes on the display containing the pointer when summoned, including off-screen, minimized, hidden, and inactive-Space states.
- Hide on the toggle shortcut only when the panel is actually visible and focused on the current display.
- Retry presentation briefly during Space transitions without reopening after Hide or taking focus back after the user leaves.
- Suppress held-key repeats and duplicate shortcut delivery; refresh registration after wake.
- Float while summoned even when Keep above other windows is off, then restore that preference when focus leaves.
- Add native presentation tests and regression coverage for display geometry, shortcut delivery, and visibility states.
- Isolate test libraries from iCloud and automatically remove temporary test apps, fixture data, and test executables after verification.

## 1.1.1

- Keep the floating panel in the foreground application’s full-screen Space, including Microsoft Teams, without activating a different desktop.
- Prevent the old editor contents from overwriting newer sync or backup-import updates to the open note.
- Preserve local note-history checkpoints and avoid rotating content backups for unchanged saves or preference-only changes.
- Add regression tests for synced tables, backup imports, undo preservation, and note-history retention.

## 1.0.0

Initial public release of Lilt Notes, a floating notes app for macOS.

- Floating, resizable note window with a native macOS close control.
- Rich Markdown editor, source mode, tables, highlighted code, task lists, and local images.
- Compact actions and note search, pins, history, snippets, emoji, and global/per-note shortcuts.
- Silent local saving, iCloud Drive folder sync, portable Markdown, and library backup import/export.
- Optional on-device writing assistance on supported Macs.
- Keyboard-scrolling stability and command panels that fit without resizing the note window.

The downloadable app targets Apple silicon and macOS 14 or newer. It is ad-hoc signed and not notarized. See the README for setup, data behavior, and compatibility limitations.
