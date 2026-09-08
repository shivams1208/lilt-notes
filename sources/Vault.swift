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
        _ = try Self.validate(data)
        if let old=try? Data(contentsOf:file), (try? Self.validate(old)) != nil {
            let backup=directory.appendingPathComponent("library.previous.json")
            try old.write(to:backup,options:.atomic)
            try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:backup.path)
        }
        try data.write(to:file,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
    }
}

