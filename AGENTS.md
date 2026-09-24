# Lilt development and testing

The user permits temporary installs and files needed for testing and expects them to be cleaned up after verification.

- Keep test notes and sync folders isolated from the real library and iCloud Drive. Never point a test at the user's notes folder.
- After verification, stop test processes, unregister and remove temporary app copies, and remove generated fixture data and test executables. Include cleanup on ordinary test failure.
- Keep one installed user app at `/Applications/Lilt Notes.app`. Do not leave launchable demo or backup apps in workspace folders where Spotlight can discover them. If a rollback copy is needed, keep it as an archive outside iCloud.
- Preserve source code, intended deliverables, useful verification reports, and user data. A personal note containing “test” or “demo” is not sufficient evidence that it is disposable.
- The test scripts clean up their own temporary outputs. Apply the same cleanup to ad hoc UI tests and manually created fixtures.
