import Foundation
import CoreSpotlight

@main struct SpotlightTests {
    static func main() throws {
        func note(_ id: String, _ edited: Double, extras: [String: Any] = [:]) -> [String: Any] {
            ["id": id, "title": id, "markdown": "# \(id)", "text": "\(id) searchable body", "createdAt": 1000.0, "updatedAt": edited].merging(extras) { _, new in new }
        }
        func data(_ notes: [[String: Any]]) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["version": 1, "notes": notes])
        }
        let raw = try data([
            note("old-pinned", 2000, extras: ["pinned": true, "pinOrder": 0]),
            note("new", 5000), note("tie-b", 3000), note("tie-a", 3000),
            note("trash", 9000, extras: ["deletedAt": 8000]),
            note("purged", 9000, extras: ["purgedAt": 8000]),
            note("restored", 4000, extras: ["deletedAt": NSNull()])
        ])
        let notes = try SpotlightNote.currentNotes(in: raw)
        precondition(notes.map(\.id) == ["new", "restored", "tie-a", "tie-b", "old-pinned"], "Recency must ignore pins and exclude trash/purged notes")
        let items = notes.enumerated().map { $0.element.searchableItem(position: $0.offset, count: notes.count) }
        precondition(items.map { $0.attributeSet.rankingHint!.intValue } == [100, 75, 50, 25, 0])
        precondition(items[0].attributeSet.contentModificationDate == Date(timeIntervalSince1970: 5), "JavaScript milliseconds must convert to seconds")
        precondition(items[0].attributeSet.lastUsedDate == items[0].attributeSet.contentModificationDate)
        precondition(items[0].attributeSet.textContent == "new searchable body")
        precondition(items[0].attributeSet.title == "new")
        precondition(items[0].expirationDate == .distantFuture)
        precondition(items.allSatisfy { $0.domainIdentifier == SpotlightNotesIndex.domain })
        let edited = try SpotlightNote.currentNotes(in: data([note("old-pinned", 10000), note("new", 5000)]))
        precondition(edited.first?.id == "old-pinned", "An edit must promote an older note")
        let fallback = try SpotlightNote.currentNotes(in: data([note("fallback", 0, extras: ["title": "  ", "updatedAt": "bad"])]))[0]
        precondition(fallback.title == "Untitled" && fallback.modified == fallback.created)
        precondition(fallback.searchableItem(position: 0, count: 1).attributeSet.rankingHint == 100)
        let empty = try SpotlightNote.currentNotes(in: data([]))
        precondition(empty.isEmpty)
        do { _ = try SpotlightNote.currentNotes(in: Data("{}".utf8)); preconditionFailure("Invalid library accepted") } catch {}
        let unicodeID = "café + ?&%"
        precondition(SpotlightNote.openingURL(identifier: unicodeID)?.lastPathComponent == unicodeID)
        precondition(SpotlightNote.openingURL(identifier: "") == nil)
        print("Spotlight metadata, recency, deletion, restore, date, and opening tests passed")
    }
}
