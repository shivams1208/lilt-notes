import AppKit
import CoreSpotlight
import WebKit

extension AppDelegate {
    func runSpotlightAuditIfRequested() {
        guard isTest, args.contains("--test-spotlight"),
              Bundle.main.bundleIdentifier != "com.shivam.liltnotes",
              let i = args.firstIndex(of: "--spotlight-audit"), i + 1 < args.count else { return }
        let output = URL(fileURLWithPath: args[i + 1])
        try? Data("{\"phase\":\"starting\"}".utf8).write(to: output)
        Task { @MainActor in
            var report: [String: Any] = [:]
            func require(_ value: Bool, _ message: String) throws {
                if !value { throw NSError(domain: "SpotlightAudit", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
            }
            func library(_ notes: [[String: Any]]) throws -> Data {
                try JSONSerialization.data(withJSONObject: ["version": 1, "notes": notes])
            }
            func note(_ id: String, _ modified: Double) -> [String: Any] {
                ["id": id, "title": "Lilt Spotlight QA " + id, "markdown": "A searchable telescope", "text": "A searchable telescope", "createdAt": 1000, "updatedAt": modified]
            }
            func query(content: String? = nil) async throws -> [CSSearchableItem] {
                try await withCheckedThrowingContinuation { continuation in
                    let context = CSSearchQueryContext()
                    context.fetchAttributes = ["title", "textContent", "contentModificationDate", "rankingHint"]
                    let predicate = "title == 'Lilt Spotlight QA*'cd" + (content == nil ? "" : " && textContent == '*telescope*'cd")
                    let query = CSSearchQuery(queryString: predicate, queryContext: context)
                    let lock = NSLock()
                    var items: [CSSearchableItem] = []
                    query.foundItemsHandler = { batch in lock.lock(); items += batch; lock.unlock() }
                    query.completionHandler = { error in
                        _ = query // Keep the query alive until completion.
                        lock.lock(); let result = items; lock.unlock()
                        if let error = error { continuation.resume(throwing: error) }
                        else { continuation.resume(returning: result) }
                        query.completionHandler = nil
                        query.foundItemsHandler = nil
                    }
                    query.start()
                }
            }
            func awaitItems(_ ids: Set<String>, modified: [String: Double] = [:]) async throws -> [CSSearchableItem] {
                for _ in 0..<50 {
                    let items = try await query()
                    if Set(items.map(\.uniqueIdentifier)) == ids,
                       items.allSatisfy({ item in modified[item.uniqueIdentifier].map { item.attributeSet.contentModificationDate == Date(timeIntervalSince1970: $0 / 1000) } ?? true }) { return items }
                    try await Task.sleep(nanoseconds: 300_000_000)
                }
                throw NSError(domain: "SpotlightAudit", code: 2, userInfo: [NSLocalizedDescriptionKey: "The Spotlight index did not reach the expected state"])
            }
            do {
                try await Task.sleep(nanoseconds: 1_000_000_000)
                try? Data("{\"phase\":\"querying\"}".utf8).write(to: output)
                let first = [note("old", 2000), note("new", 5000), note("deleted", 1000)]
                self.spotlightIndex?.update(try library(first))
                let initial = try await awaitItems(["old", "new", "deleted"])
                try require(initial.first(where: { $0.uniqueIdentifier == "new" })?.attributeSet.rankingHint == 100, "Newest note is missing its ranking hint")
                let fullText = try await query(content: "telescope")
                try require(Set(fullText.map(\.uniqueIdentifier)) == ["old", "new", "deleted"], "Full-text search did not return the indexed notes")
                report["initialIndexAndContent"] = true
                var deleted = note("deleted", 10000); deleted["deletedAt"] = 10000
                self.spotlightIndex?.update(try library([note("old", 9000), note("new", 5000), deleted]))
                _ = try await awaitItems(["old", "new"], modified: ["old": 9000])
                report["editAndDeletion"] = true
                // Back-to-back saves must converge on the latest library.
                self.spotlightIndex?.update(try library([note("old", 11000)]))
                self.spotlightIndex?.update(try library([note("old", 12000), note("new", 13000)]))
                _ = try await awaitItems(["old", "new"], modified: ["old": 12000, "new": 13000])
                report["rapidUpdatesConverge"] = true
                self.spotlightIndex?.update(Data("{}".utf8))
                _ = try await awaitItems(["old", "new"])
                report["invalidLibraryPreservesIndex"] = true
                // Simulate restarting after a backup restored a smaller library.
                self.spotlightIndex = SpotlightNotesIndex(directory: self.directory)
                self.spotlightIndex?.update(try library([note("new", 14000)]))
                _ = try await awaitItems(["new"], modified: ["new": 14000])
                report["restartReconcilesMissingNotes"] = true
                self.spotlightIndex?.update(try library([]))
                _ = try await awaitItems([])
                report["emptyLibraryRemovesStaleResults"] = true
                report["passed"] = true
            } catch { report["passed"] = false; report["error"] = error.localizedDescription }
            if let data = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys, .prettyPrinted]) { try? data.write(to: output) }
        }
    }
}
