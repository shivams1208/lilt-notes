# Lilt Notes 1.1.2 verification

Tested on macOS 27.0 (26A428), Apple silicon.

## Regression reproduced

The previous toggle used only the native window's visible and key flags. An isolated native test moved the focused window outside the display, then invoked the shortcut path. Version 1.1.1 hid the window instead of recovering it. The same check passes with the updated presentation logic.

## Automated coverage

| Area | Evidence |
| --- | --- |
| Editor, Markdown, sync replacement, source mode, import, search | All 88 JavaScript tests pass. |
| Saving and recovery | Native storage, note history, two-client folder sync, and invalid-save tests pass. |
| Shortcut configuration | Validation, conflicts, routing, and disabled-mode tests pass. |
| Visibility decisions | 128 combinations of visible, focused, active-Space, occluded, hidden, minimized, and target-display state. |
| Display geometry | 20 window/display combinations, including negative coordinates, vertically arranged displays, off-screen windows, oversized windows, and repeated placement without drift. These are geometry simulations; one physical display was available. |
| Actual native window presentation | 26 checks pass, including hidden/minimized recovery; an off-screen focused window; regular, maximized, and full-screen fixture windows with Keep above enabled and disabled; cancellation after hiding or losing focus; display-change recovery; and wake handling. |
| Shortcut event delivery | The native Carbon callback is exercised with repeated press events and release/press sequences. Held callbacks do not repeatedly toggle the window. This tests the callback, not a physical global key press. |
| Window sizing and command menus | All 24 size/menu combinations pass, including scrolling selection, native close control, unchanged notes, and unchanged window size. |
| Native appearance and saving | Native-material and fallback appearance checks pass, including final-save-on-Quit and editor recovery. |
| App entry points | Cold/warm URL handling, existing/missing-note URLs, search, and queued Spotlight actions pass. |

Run `zsh scripts/test.sh` and `zsh scripts/check-compatibility.sh` from the repository root. Native tests require access to the logged-in macOS WindowServer. All automated fixtures use isolated note libraries. Test scripts remove their temporary apps, fixture data, and executables on exit; verification reports remain available. The updated test cleanup workflow was rerun successfully.

## Installed build and manual verification

The installed 1.1.2 app matches the tested build. Its three default shortcuts register without conflicts. All user note records and snippets were unchanged immediately after installation.

The computer-control screen-capture service failed during the separate-app test. The user then verified physical Option-N over the affected app with its window maximized, in full screen, and after switching Spaces, confirming: “Works in all three cases.” This manual verification complements the isolated native tests above.
