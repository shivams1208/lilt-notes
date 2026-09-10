import Foundation
import CoreSpotlight
import UniformTypeIdentifiers

struct SpotlightNote: Equatable {
    let id: String
    let title: String
    let text: String
    let created: Date
    let modified: Date

    static func currentNotes(in data: Data) throws -> [SpotlightNote] {
        let library = try Vault.validate(data)
        return (library["notes"] as! [[String: Any]]).compactMap { note in
            guard let id = note["id"] as? String, !id.isEmpty,
                  (note["deletedAt"] as? NSNumber)?.doubleValue ?? 0 == 0,
                  (note["purgedAt"] as? NSNumber)?.doubleValue ?? 0 == 0 else { return nil }
            func date(_ key: String, fallback: Date) -> Date {
                guard let value = note[key] as? NSNumber, value.doubleValue.isFinite,
                      value.doubleValue > 0 else { return fallback }
                return Date(timeIntervalSince1970: value.doubleValue / 1000)
            }
            let text = note["text"] as? String ?? note["markdown"] as? String ?? ""
            let title = (note["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let created = date("createdAt", fallback: Date(timeIntervalSince1970: 0))
            return SpotlightNote(id: id, title: title.isEmpty ? "Untitled" : title,
                                 text: text, created: created, modified: date("updatedAt", fallback: created))
        }.sorted { $0.modified == $1.modified ? $0.id < $1.id : $0.modified > $1.modified }
    }

    func searchableItem(position: Int, count: Int) -> CSSearchableItem {
        let attributes = CSSearchableItemAttributeSet(contentType: .text)
        attributes.title = title
        attributes.displayName = title
        attributes.textContent = text
        attributes.contentDescription = String(text.prefix(300))
        attributes.contentCreationDate = created
        attributes.contentModificationDate = modified
        // Editing is the activity signal; merely opening a note must not promote it.
        attributes.lastUsedDate = modified
        attributes.metadataModificationDate = modified
        attributes.keywords = ["Lilt Notes", "note", "floating notes"]
        attributes.creator = "Lilt Notes"
        attributes.userCreated = true
        attributes.userOwned = true
        attributes.containerIdentifier = SpotlightNotesIndex.domain
        attributes.containerDisplayName = "Lilt Notes"
        attributes.containerOrder = NSNumber(value: position)
        // Spotlight owns final ranking. Provide recency as its documented 0...100 hint.
        attributes.rankingHint = NSNumber(value: 100 - (position * 100 / max(1, count - 1)))
        let item = CSSearchableItem(uniqueIdentifier: id, domainIdentifier: SpotlightNotesIndex.domain, attributeSet: attributes)
        item.expirationDate = .distantFuture
        return item
    }

    static func openingURL(identifier: String) -> URL? {
        guard !identifier.isEmpty else { return nil }
        var parts = URLComponents()
        parts.scheme = "liltnotes"
        parts.host = "note"
        parts.path = "/" + identifier
        return parts.url
    }
}

/// Owns only Lilt's on-device index. All changes are serialized, including retries.
final class SpotlightNotesIndex: NSObject, CSSearchableIndexDelegate {
    static let domain = "com.shivam.liltnotes.notes"
    private let index = CSSearchableIndex(name: "LiltNotes")
    private let queue = DispatchQueue(label: "com.shivam.liltnotes.spotlight", qos: .utility)
    private let manifest: URL
    private var knownIDs: Set<String>
    private var desired: [SpotlightNote]?
    private var committed: [SpotlightNote]?
    private var running = false
    private var scheduled: DispatchWorkItem?
    private var acknowledgements: [() -> Void] = []
    private(set) var lastError: String?

    init(directory: URL) {
        manifest = directory.appendingPathComponent("spotlight-identifiers.json")
        knownIDs = Set((try? JSONDecoder().decode([String].self, from: Data(contentsOf: manifest))) ?? [])
        super.init()
        index.indexDelegate = self
    }

    func update(_ data: Data) {
        // Invalid data must never clear an existing index.
        guard let notes = try? SpotlightNote.currentNotes(in: data) else { return }
        queue.async {
            self.desired = notes
            self.schedule(after: 0.6)
        }
    }

    private func schedule(after delay: Double) {
        scheduled?.cancel()
        let work = DispatchWorkItem { self.applyPending() }
        scheduled = work
        queue.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func applyPending() {
        guard !running, let notes = desired, notes != committed else { return }
        guard CSSearchableIndex.isIndexingAvailable() else { schedule(after: 30); return }
        running = true
        let ids = Set(notes.map(\.id))
        let removed = knownIDs.subtracting(ids)
        let union = knownIDs.union(ids)
        do {
            // Journal IDs before submitting. A crash/retry/backup restore can then
            // remove abandoned entries even when they no longer exist in the library.
            try JSONEncoder().encode(union.sorted()).write(to: manifest, options: .atomic)
            knownIDs = union
        } catch { finish(notes, error: error); return }
        let items = notes.enumerated().map { $0.element.searchableItem(position: $0.offset, count: notes.count) }
        let callbacks = acknowledgements
        acknowledgements = []
        index.indexSearchableItems(items) { error in
            self.queue.async {
                guard error == nil else { self.acknowledgements += callbacks; self.finish(notes, error: error); return }
                self.index.deleteSearchableItems(withIdentifiers: Array(removed)) { error in
                    self.queue.async {
                        if let error = error { self.acknowledgements += callbacks; self.finish(notes, error: error); return }
                        do {
                            try JSONEncoder().encode(ids.sorted()).write(to: self.manifest, options: .atomic)
                            self.knownIDs = ids
                            callbacks.forEach { $0() }
                            self.finish(notes, error: nil)
                        } catch { self.acknowledgements += callbacks; self.finish(notes, error: error) }
                    }
                }
            }
        }
    }

    private func finish(_ notes: [SpotlightNote], error: Error?) {
        running = false
        lastError = error?.localizedDescription
        if let error = error {
            NSLog("Lilt Spotlight indexing will retry: %@", error.localizedDescription)
            schedule(after: 10)
        } else {
            committed = acknowledgements.isEmpty ? notes : nil
            if desired != committed { schedule(after: 0) }
        }
    }

    func searchableIndex(_ searchableIndex: CSSearchableIndex, reindexAllSearchableItemsWithAcknowledgementHandler acknowledgementHandler: @escaping () -> Void) {
        requestReindex(missingIDs: [], acknowledgement: acknowledgementHandler)
    }

    func searchableIndex(_ searchableIndex: CSSearchableIndex, reindexSearchableItemsWithIdentifiers identifiers: [String], acknowledgementHandler: @escaping () -> Void) {
        requestReindex(missingIDs: identifiers, acknowledgement: acknowledgementHandler)
    }

    private func requestReindex(missingIDs: [String], acknowledgement: @escaping () -> Void) {
        queue.async {
            self.knownIDs.formUnion(missingIDs)
            self.committed = nil
            self.acknowledgements.append(acknowledgement)
            self.schedule(after: 0)
        }
    }
}
