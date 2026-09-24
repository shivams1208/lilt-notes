import Foundation

enum VaultError: LocalizedError {
    case invalidLibrary, corruptLibrary
    var errorDescription: String? {switch self {
    case .invalidLibrary: return "The library format is invalid. Your saved notes have not been changed."
    case .corruptLibrary: return "The notes library and its previous-save backup could not be read. Restore a library backup. Your files have not been changed."
    }}
}

final class Vault {
    let directory: URL
    let file: URL
    private(set) var recoveredBackup = false
    init(directory: URL) throws {
        self.directory=directory
        self.file=directory.appendingPathComponent("library.json")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions:0o700])
    }
    static func validate(_ data:Data)throws->[String:Any] {
        guard let value=try JSONSerialization.jsonObject(with:data) as? [String:Any],value["version"] as? Int==1,let notes=value["notes"] as? [[String:Any]],notes.allSatisfy({$0["id"] is String && $0["markdown"] is String}),Set(notes.compactMap{$0["id"] as? String}).count==notes.count else {throw VaultError.invalidLibrary}
        return value
    }
    func read() throws -> Data {
        if !FileManager.default.fileExists(atPath:file.path) {return Data("{\"version\":1,\"notes\":[],\"settings\":{},\"snippets\":[]}".utf8)}
        do {let data=try Data(contentsOf:file);_ = try Self.validate(data);return data}
        catch {
            let backup=directory.appendingPathComponent("library.previous.json")
            if let data=try? Data(contentsOf:backup),(try? Self.validate(data)) != nil {recoveredBackup=true;return data}
            throw VaultError.corruptLibrary
        }
    }
    func save(_ data:Data)throws {
        let next=try Self.validate(data)
        if let old=try? Data(contentsOf:file),let previous=try? Self.validate(old) {
            if NSDictionary(dictionary:previous).isEqual(to:next){return}
            try preserveHistory(previous:previous,next:next)
            // Opening a note or saving unchanged content must not consume the
            // previous content backup by rotating an identical library into it.
            if !NSDictionary(dictionary:["notes":previous["notes"] ?? [],"snippets":previous["snippets"] ?? []]).isEqual(to:["notes":next["notes"] ?? [],"snippets":next["snippets"] ?? []]) {
                let backup=directory.appendingPathComponent("library.previous.json")
                try old.write(to:backup,options:.atomic)
                try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:backup.path)
            }
        }
        try data.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
    }
    private func preserveHistory(previous:[String:Any],next:[String:Any])throws {
        let fm=FileManager.default,now=Date()
        let nextNotes=Dictionary(uniqueKeysWithValues:(next["notes"] as! [[String:Any]]).map{($0["id"] as! String,$0)})
        for old in previous["notes"] as! [[String:Any]] {
            guard let id=old["id"] as? String,UUID(uuidString:id) != nil else{continue}
            let folder=directory.appendingPathComponent("history").appendingPathComponent(id)
            let replacement=nextNotes[id]
            if replacement?["purgedAt"] is NSNumber {
                if fm.fileExists(atPath:folder.path){try fm.removeItem(at:folder)}
                continue
            }
            guard !(old["purgedAt"] is NSNumber),
                  replacement == nil || !NSDictionary(dictionary:["markdown":old["markdown"] ?? "","doc":old["doc"] ?? NSNull()]).isEqual(to:["markdown":replacement?["markdown"] ?? "","doc":replacement?["doc"] ?? NSNull()]) else{continue}
            try fm.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            let filename="\(Int64(now.timeIntervalSince1970*1000))-\(UUID().uuidString.lowercased()).json"
            let target=folder.appendingPathComponent(filename)
            try JSONSerialization.data(withJSONObject:old,options:[.sortedKeys]).write(to:target,options:.atomic)
            try fm.setAttributes([.posixPermissions:0o600],ofItemAtPath:target.path)
            // Keep recent exact edits plus hourly/day checkpoints, so normal
            // typing does not immediately evict all older recoverable content.
            let versions=try fm.contentsOfDirectory(at:folder,includingPropertiesForKeys:[.contentModificationDateKey])
                .filter{$0.pathExtension=="json"}
                .map{($0,(try $0.resourceValues(forKeys:[.contentModificationDateKey])).contentModificationDate ?? .distantPast)}
                .sorted{$0.1>$1.1}
            var hours=Set<Int>(),days=Set<Int>()
            for (index,version) in versions.enumerated() {
                let age=now.timeIntervalSince(version.1),hour=Int(version.1.timeIntervalSince1970/3600),day=Int(version.1.timeIntervalSince1970/86400)
                let hourly=age<86400 && hours.insert(hour).inserted
                let daily=age<30*86400 && days.insert(day).inserted
                if index>=20 && !hourly && !daily {try fm.removeItem(at:version.0)}
            }
        }
    }
}
