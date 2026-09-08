# Lilt Notes

**Floating notes for macOS.** Keep a compact Markdown note above your other windows, capture ideas from the keyboard, and save your notes as readable files in iCloud Drive. No account, subscription, or API key is required.

Lilt Notes is a native AppKit app with a bundled rich-text editor. It works offline and lives in the menu bar.

- Floating, resizable window with a native macOS close button.
- Rich Markdown editing, source mode, tables, code, tasks, images, and emoji.
- Compact command palette, full-content search, pins, snippets, and shortcuts.
- Automatic local saving, optional iCloud Drive folder sync, and portable exports.
- Optional on-device writing assistance through Apple Intelligence.

[Install](#install) · [Build from source](#build-from-source) · [Shortcuts](#use-the-app) · [Your data](#notes-and-data) · [Troubleshooting](#troubleshooting) · [Development](#development)

## Install

### Requirements

| | Requirement |
|---|---|
| Downloadable app | Apple silicon Mac (M1 or newer); macOS 14 or newer |
| iCloud folder sync | iCloud Drive enabled for your Apple Account; optional |
| Writing assistance | macOS 26 or newer, an eligible Mac, Apple Intelligence enabled, and the on-device model downloaded |
| Build from source | Apple silicon Mac, Node.js 22 or newer with npm, and Apple developer tools containing the macOS 26 SDK or newer |

The release is **arm64 only**. Intel Macs, Windows, Linux, iPhone, and iPad do not have a native Lilt app. Files in iCloud Drive can still be opened with another Markdown editor on those devices. macOS 14 is the deployment target; every supported OS/hardware combination has not been physically tested.

### Download the app

1. Open the [Releases page](https://github.com/shivams1208/lilt-notes/releases/latest) and download `Lilt-Notes-1.0.0-macOS-arm64.zip`.
2. Unzip it and drag **Lilt Notes.app** into **Applications**.
3. Open the app. Look for the pencil icon in the menu bar; there is no normal Dock icon.
4. If prompted for a notes folder, select **iCloud Drive → Lilt Notes**, or choose another folder. You can change this later in Settings.
5. Press **Option-N** to show or hide the note, **Command-P** to browse notes, and **Command-K** for actions.

The downloadable build is **ad-hoc signed and not notarized**. macOS may require you to confirm that you trust it. After attempting to open it, use **System Settings → Privacy & Security → Open Anyway** if that option is offered. Follow [Apple’s instructions for opening an app from an unidentified developer](https://support.apple.com/en-us/102445). If your Mac is managed or does not permit this, build from source or ask your administrator. Do not disable Gatekeeper globally.

A `SHA256SUMS.txt` file accompanies each release. You can compare its app hash with:

```sh
shasum -a 256 Lilt-Notes-1.0.0-macOS-arm64.zip
```

### Updates and moving to another Mac

Lilt has no automatic updater. Quit it, download a newer release, and replace the app in Applications. Replacing the app does not replace your notes. Export a library backup before updating.

On a new Apple silicon Mac, install Lilt and choose the same iCloud notes folder. Keep the hidden `.lilt` folder along with the Markdown files: it holds identities, pin order, rich formatting, and deletion state. For a complete manual transfer, export **Library Backup** on the old Mac and use **Import Library Backup** on the new one. Re-select the folder and review local preferences and shortcuts on the new Mac.

## Use the app

Open **Lilt Notes.app**. Its pencil icon appears in the menu bar. Click it to show or hide the note, Option-click to create a new one, or right-click for its menu. The window stays above other apps, including full-screen windows, and can be moved by dragging the title bar.

Drag a window edge or corner to choose its size; no blank lines are needed. Manual resizing turns off content auto-sizing and remembers the window size after restarting. To resume automatic sizing, enable **Grow window with note content** in Settings. Actions (⌘K), note search (⌘P), and other panels fit inside the current window and scroll when needed; opening or closing them does not resize the note window.

| Shortcut | Action |
|---|---|
| ⌥ N | Show, focus, or hide Notes globally |
| ⇧ ⌥ N | Create a note globally |
| ⌥ P | Search notes globally |
| ⌘ N | New note |
| ⌘ P | Browse and search all notes |
| ⌘ K | Search all actions and formatting commands |
| ⇧ ⌘ C | Copy Note As menu |
| ⇧ ⌘ D / L | Copy deeplink / save a quicklink file |
| ⇧ ⌘ E | Export menu |
| ⇧ ⌘ . | Formatting menu |
| ⌥ ⌘ , | Toggle format bar |
| ⇧ ⌘ / | Toggle window auto-sizing |
| ⇧ ⌘ P | Pin or unpin the current note |
| ⌘ . in search | Pin or unpin the selected result |
| ⌘ 1–9 | Open a pinned note |
| ⌘ [ / ⌘ ] | Previous / next note in history |
| ⌘ F | Find text in the current note |
| ⌥ ⌘ F | Find and replace |
| ⌘ G / ⇧ ⌘ G | Next / previous match |
| ⌘ B / I / U | Bold / italic / underline |
| ⇧ ⌘ S | Strikethrough |
| ⌘ E / ⌘ L | Inline code / link |
| ⌥ ⌘ 1–3 | Headings |
| ⇧ ⌘ 7 / 8 / 9 | Numbered / bullet / task list |
| ⌘ Return | Check or uncheck a task |
| Tab / Shift-Tab | Indent / outdent lists or selected code lines |
| ⌃ ⌘ ↑ / ↓ | Move selected blocks or list items (⇧⌘↑/↓ also works) |
| ⇧ ⌘ B / ⌥ ⌘ C | Quote / code block |
| ⇧ ⌘ M | Toggle Markdown source editing |
| ⌘ + / − / 0 | Zoom in / out / reset |
| ⌘ , | Settings |
| Escape | Close a panel or hide Notes |

If another app already uses the global shortcuts, choose the **⌃⌥** set in Settings. Shortcuts inside the editor are unchanged.

The ⌘K command panel and ⌘P note browser are 320 points wide. Their height follows the results, up to 420 points, so short menus stay compact. The note browser shows character counts and recent opening times, with pin and delete controls on the selected row. On supported macOS versions, command panels and toolbar controls use system glass materials; older versions retain the translucent fallback.

## Editing

Type Markdown and it formats as you write, including `[label](https://example.com)` links. Paste Markdown to insert formatted text. You can also use shortcuts, the **Aa** format bar, or search for **Format** in Actions. The command menu groups Inline, Block, and List formatting, with a nested Heading menu. Supported formats include headings 1–6, bold, italic, underline, strikethrough, inline code, nested bullet/numbered/task lists, blockquotes, horizontal rules, links, highlighted code blocks, tables, highlights, and images. Code blocks have a language selector and a Copy button. The bottom format bar offers headings, text styles, links, inline code, code blocks, quotes, and lists. Click the counter to switch between character and word counts. Use Actions to insert and edit table rows/columns. Paste or drop an image, or choose **Insert Image**. Images up to 8 MB are stored with the note. Remote image fetching is disabled; attach images locally.

Type `:` to open emoji suggestions beside the cursor and keep typing to filter them. Use ↑/↓ and Return or Tab to choose; Escape keeps your typed text. The bundled Unicode catalog includes skin tones, and code blocks do not trigger suggestions. Snippets can contain Markdown and `{date}`, `{time}`, `{iso-date}`, and `{cursor}` placeholders. Search **Snippets** in Actions to create, insert, edit, or delete them. An optional keyword such as `!meeting` expands while you type in the rich-text note editor; Undo restores the keyword. The picker searches names, keywords, and content, and includes an expansion toggle. Use ⌘E to edit a selected snippet and ⌘N to add one. Snippets can also be inserted manually while editing Markdown source. Moving list items preserves the caret, selected text, checked states, and nested items. The first non-empty line becomes the note title automatically. Edits save automatically; ⌘S also saves explicitly.

## Writing assistance

Search **Writing Tools** in Actions (⌘K) for spelling and grammar, clearer writing, professional or friendly tone, shortening, expansion, summaries, translation, and a custom instruction. Select text to work on that passage, or leave the selection empty to use the whole note. Review the preview, then choose **Replace** or **Copy**. Escape cancels. Replacement supports Undo and Redo in both rich text and Markdown source. If the note changes while a suggestion is being prepared, Lilt prevents an outdated replacement.

These commands use Apple's on-device model and require **macOS 26 or newer, a supported Mac, and Apple Intelligence enabled with its model downloaded**. They have no API key or subscription. Your note text is processed on this Mac. Editing and iCloud saving still work on macOS 14 or newer without writing assistance. Long notes are processed in passages; editing commands preserve fenced code blocks. Generated suggestions should be reviewed for meaning and formatting before replacement.

## Notes and data

Notes are unlimited. New Note reuses an existing unpinned empty draft, so repeated shortcuts do not leave a trail of blank notes. Pinned, deleted, and meaningful notes are preserved. Search includes their titles and bodies. Pinned notes sort first. Deleted notes can be previewed and restored from **Actions → Recently Deleted**. They remain recoverable until you choose **Delete Permanently**; there is no 60-day expiry.

Export a note as Markdown, plain text, or HTML, or use the native Share menu. Export a library backup from Actions to preserve all notes, rich formatting, pins, and snippets. Restoring a backup merges notes by ID and modification time. A backup is a readable JSON file; store it somewhere you trust.

Notes use **iCloud Drive → Lilt Notes** by default. The first folder picker remembers access to that folder; it does not need to be selected again after restarting. Each note is saved as a readable Markdown file. On an iPhone or iPad, open **Files → iCloud Drive → Lilt Notes** using the same Apple Account. You can also access the files through iCloud Drive on another Mac, Windows, or iCloud.com. A Markdown editor can open and edit them. Lilt itself is currently a Mac app.

There is no encryption or Keychain dependency. A local working copy (`library.json`) and previous-save backup (`library.previous.json`) are kept in `~/Library/Application Support/Lilt Notes/` so editing and saving can continue while iCloud is unavailable. Local saves and cloud file operations run independently. Writes are atomic and invalid libraries are rejected. Use Export Library Backup for a portable copy.

**Settings → Notes folder** shows the default folder and has an **Open Folder** button. Choose a different folder if needed, or select **Save Only on This Mac** to disconnect. Each note has a Markdown file plus a formatting record in the hidden `.lilt` folder. Notes deleted in Lilt move into **Recently Deleted** and can be restored. Keep the ID suffix in Markdown filenames so Lilt recognizes edits from other devices. Changes to an existing Markdown file are imported automatically while Lilt is running.

Changes are written to the notes folder after saving. The folder is also checked every eight seconds for changes from other devices. iCloud handles uploading and downloading silently in the background. Routine saving and syncing show no status messages; a saving problem is shown only when it needs attention. The most recent edit wins for concurrent changes to the same note; equal-timestamp text conflicts are preserved as a conflict copy. Settings, snippets, and the local working copy stay on the current Mac. Library backup import restores notes and snippets; it keeps the receiving Mac’s existing settings, so configure preferences, the notes folder, and shortcuts on each Mac.

**Quicklinks:** `liltnotes://note/NOTE-ID` opens a note, `liltnotes://new?text=URL-ENCODED-MARKDOWN` creates a prefilled note, and `liltnotes://search` opens search. Copy a note deeplink or choose **Create Quicklink** in Actions to save an `.inetloc` file. Opening this file from Finder launches Lilt and opens that note. To open a particular note with a global shortcut, search **Set Note Shortcut** in Actions, record a key combination, then save it. Use the same command to change or remove the assignment. Lilt checks for duplicate assignments and macOS registration conflicts. Shortcuts are remembered on this Mac; deleting a note removes its shortcut. Disabling global shortcuts in Settings also disables note shortcuts. Deeplinks can also be used with a launcher or Apple Shortcuts after the app has been registered by macOS.

## Limitations to understand

- **Folder sync is not a general folder watcher.** Existing Lilt-managed Markdown files are refreshed automatically. To add arbitrary `.md`, `.txt`, or `.html` files, use **Import Notes** (Command-O); simply dropping unrelated files into the folder does not add them to the library. Re-importing ordinary files creates additional notes.
- Rich formatting such as underline, highlights, and embedded images can differ between Markdown editors. Keep a library backup or the `.lilt` metadata if you want Lilt’s full representation.
- Search is a case-insensitive, in-memory scan of note titles and content. Every whitespace-separated search term must match. There is no fuzzy search, OCR, or separate search index, and no guaranteed latency for very large libraries or image-heavy notes.
- Sync relies on your chosen folder provider. Lilt checks local folder changes every eight seconds; remote arrival also depends on iCloud and your connection. It does not provide live collaborative editing. Avoid editing the same note simultaneously on different devices.
- Lilt does not add application-level encryption. Local files and exports are readable by software with access to them. iCloud’s own account and storage protections are separate.
- The native close button hides the note window; **Quit** stops the app. When a command panel is open, the close control hides temporarily so it cannot overlap that panel in narrow windows.

## Build from source

Clone this repository, then run these commands from its root:

```sh
git clone https://github.com/shivams1208/lilt-notes.git
cd lilt-notes
npm ci
zsh Scripts/build.sh
zsh Scripts/test.sh
open "dist/Lilt Notes.app"
```

The first `npm ci` downloads dependencies; the app itself does not need Node.js or npm after building.

The build script bundles the editor, compiles the native Swift shell, copies fonts and assets, and applies an ad-hoc code signature. Output: **`dist/Lilt Notes.app`**. Quit any other copy of Lilt before launching your build: only one instance may open the same library at a time.

Check your tools if building fails:

```sh
node --version
xcrun --show-sdk-version
xcrun --find swiftc
```

Install Apple’s developer tools if needed (`xcode-select --install`), or select an installed Xcode that includes the macOS 26 SDK or newer. An older SDK cannot compile the optional FoundationModels integration, even though the resulting app targets macOS 14. The build currently targets `arm64-apple-macosx14.0`; changing that flag alone does not establish Intel support.

To install your own build, quit Lilt and copy `dist/Lilt Notes.app` to Applications using Finder. Local data remains in your user Library, outside the app bundle.

## Development

### Project layout

| Path | Purpose |
|---|---|
| `Sources/main.swift` | AppKit panel, WebKit bridge, menu bar, shortcuts, persistence orchestration |
| `Sources/Vault.swift` | Validated local JSON storage, atomic writes, previous-save recovery |
| `Sources/FolderSync.swift` | Portable Markdown files and per-note metadata exchange |
| `Sources/WritingAssistant.swift` | Optional on-device writing assistance |
| `Sources/Shortcuts.swift` | Shortcut validation and routing |
| `Sources/NativeAppearance.swift` | Guarded system-material integration and fallback |
| `web/` | Tiptap editor, command palette, note model, styling, snippets, and search |
| `Tests/` | Editor/application tests and native storage/shortcut/writing checks |
| `Scripts/` | Build, test, release packaging, and icon generation |
| `Resources/` | Original app icon and source icon sizes |

The UI is bundled locally inside a WKWebView. Native operations pass through a small message bridge. The content security policy blocks network requests from the editor; external links open through macOS. Runtime notes are never stored in this repository.

`Sources/NativeAppearance.swift` uses a guarded, **nonpublic WebKit appearance preference** to enable system materials on supported versions. A CSS fallback remains available; launch with `--no-glass` to disable that integration. This distribution is not prepared for App Store submission, and future WebKit changes may require an appearance update.

### Tests

```sh
zsh Scripts/test.sh
```

This rebuilds the browser bundle, runs the JavaScript tests, and compiles/runs the Swift storage, folder-sync, shortcut, and writing-helper tests. It uses synthetic notes and temporary folders. Optional real-model verification, on a Mac with Apple Intelligence ready:

```sh
./build/writing-tests --live
```

For manual UI testing with a separate library:

```sh
"dist/Lilt Notes.app/Contents/MacOS/LiltNotes" \
  --data-dir "$PWD/build/ui-test"
```

Test mode disables global shortcuts and default iCloud setup. It writes its own library and window diagnostics to that test directory. Do not point it at your real notes folder.

To run the native sizing, command navigation, and close/reopen audit:

```sh
"dist/Lilt Notes.app/Contents/MacOS/LiltNotes" \
  --data-dir "$PWD/build/sizing-test" \
  --sizing-audit "$PWD/build/sizing-audit.json"
```

The audit creates synthetic notes, exercises three window sizes and both auto-size settings, and writes a JSON report. Keep that test app open until the report appears, then quit it. Use a fresh test directory if another test instance is running. Automated checks complement manual UI testing; they do not certify all macOS versions, physical global shortcuts in every app, or end-to-end iCloud delivery to another device.

### Packaging a release

From a Git checkout with committed source:

```sh
zsh Scripts/release.sh
```

The script builds and tests the app, packages the app and tracked source into `release/`, and writes SHA-256 checksums. Only Git-tracked source is included in the source archive; build caches, personal libraries, and exports are excluded. Upload the two ZIPs and `SHA256SUMS.txt` to a GitHub release for the corresponding version tag. Distribute only a build you have tested. The script does not notarize the app or publish anything automatically.

### Contributing

Bug reports and pull requests are welcome. Include your macOS version, Mac architecture, steps to reproduce, and the expected versus actual behavior. Use a synthetic note or redacted screenshot; do not attach your personal library, folder bookmarks, or private notes. Run the test script and check the native UI for behavior changes before submitting a pull request.

## Troubleshooting

| Problem | What to check |
|---|---|
| No Dock icon / app seems hidden | Use the pencil in the menu bar or Option-N. Closing a note leaves the menu-bar app running. |
| Global shortcut does nothing | Choose the Control-Option shortcut set in Settings, remove a conflicting assignment, or use the menu-bar menu. |
| Newly copied Markdown files do not appear | Use Command-O to import them. Automatic folder refresh applies to files already managed by Lilt. |
| Notes have not appeared on another device | Check iCloud Drive and the chosen Notes folder, wait for the provider to finish uploading/downloading, and keep `.lilt` metadata with the files. |
| Notes folder is unavailable | Choose it again in Settings. Lilt keeps a local working copy while the folder is unavailable. |
| Writing tools are unavailable | Check macOS 26+, device eligibility, Apple Intelligence settings, and model download status. Regular note editing does not require them. |
| Window grows unexpectedly | Resize it manually or turn off **Grow window with note content**. |
| Visual materials look incorrect | Quit the app and launch its executable with `--no-glass`, or use a light/dark appearance in Settings. |
| Build cannot find FoundationModels | Select Apple developer tools with the macOS 26 SDK or newer. |
| Download will not open | Confirm Apple silicon/macOS requirements and read the installation note about ad-hoc signing. Build from source if your policy blocks downloaded unsigned apps. |

To uninstall, quit Lilt and move the app from Applications to Trash. Your local library and notes folder remain. Export a backup before deliberately removing any data. Do not remove the iCloud notes folder unless you intend that deletion to propagate to your other devices.

## License

Lilt Notes is released under the [MIT License](LICENSE). Bundled open-source packages and fonts retain their own licenses, reproduced in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). The editor uses Tiptap/ProseMirror, Lowlight, Lucide, and Emojibase; the interface uses Inter and JetBrains Mono.
