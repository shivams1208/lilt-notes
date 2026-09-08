import Foundation

/// Plain Markdown is the portable representation; per-note records retain rich
/// formatting and deletion state for another Mac running Lilt Notes.
final class FolderSync {
    let fm=FileManager.default
    func noteURL(_ note:[String:Any],in folder:URL)->URL {
        let title=(note["title"] as? String ?? "Untitled").components(separatedBy:CharacterSet(charactersIn:"/:\\\0")).joined(separator:"-").trimmingCharacters(in:.whitespacesAndNewlines)
        let name=String((title.isEmpty ? "Untitled":title).prefix(90))+" -- "+(note["id"] as! String)+".md"
        let directory=note["deletedAt"] is NSNumber ? folder.appendingPathComponent("Recently Deleted",isDirectory:true):folder
        return directory.appendingPathComponent(name)
    }
    func date(_ note:[String:Any])->Double{(note["updatedAt"] as? Double) ?? 0}
    func readRecord(_ url:URL)->[String:Any]? {
        guard let data=try? Data(contentsOf:url),let value=try? JSONSerialization.jsonObject(with:data) as? [String:Any],let id=value["id"] as? String,UUID(uuidString:id) != nil,value["markdown"] is String else{return nil}
        return value
    }
    func markdownFiles(in folder:URL)->[URL] {
        [folder,folder.appendingPathComponent("Recently Deleted")].flatMap{(try? fm.contentsOfDirectory(at:$0,includingPropertiesForKeys:[.contentModificationDateKey])) ?? []}.filter{$0.pathExtension.lowercased()=="md"}
    }
    func editedRecord(_ note:[String:Any],at url:URL)throws->[String:Any]? {
        let stamp=try url.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate?.timeIntervalSince1970 ?? 0
        // iCloud preserves the modification timestamp set when exporting. A newer,
        // different Markdown file is an edit made outside this app.
        guard stamp*1000>date(note)+2 else{return nil}
        let text=try String(contentsOf:url,encoding:.utf8)
        guard text != note["markdown"] as? String else{return nil}
        var edited=note;edited["markdown"]=text;edited["doc"]=NSNull();edited["text"]=text
        let first=text.components(separatedBy:.newlines).first(where:{!$0.trimmingCharacters(in:.whitespaces).isEmpty}) ?? "Untitled"
        edited["title"]=String(first.replacingOccurrences(of:"^#{1,6}\\s+",with:"",options:.regularExpression).prefix(150))
        edited["updatedAt"]=max(stamp*1000,date(note)+1)
        return edited
    }
    func coordinate(_ url:URL,_ action:(URL)throws->Void)throws {
        var coordinationError:NSError?,actionError:Error?
        NSFileCoordinator().coordinate(writingItemAt:url,options:.forReplacing,error:&coordinationError){target in do{try action(target)}catch{actionError=error}}
        if let error=coordinationError{throw error};if let error=actionError{throw error}
    }
    func exchange(library:Data,folder:URL)throws->Data? {
        let local=try Vault.validate(library)
        let records=folder.appendingPathComponent(".lilt",isDirectory:true)
        try fm.createDirectory(at:records,withIntermediateDirectories:true)
        var merged=Dictionary(uniqueKeysWithValues:(local["notes"] as! [[String:Any]]).map{($0["id"] as! String,$0)})
        var changed=false
        func merge(_ remote:[String:Any]) {
            let id=remote["id"] as! String
            if let existing=merged[id] {
                if date(remote)>date(existing){merged[id]=remote;changed=true}
                else if date(remote)==date(existing) && remote["markdown"] as? String != existing["markdown"] as? String {
                    var conflict=remote;let newID=UUID().uuidString.lowercased();conflict["id"]=newID
                    conflict["title"]="\(remote["title"] as? String ?? "Note") (conflict copy)"
                    conflict["updatedAt"]=Date().timeIntervalSince1970*1000;merged[newID]=conflict;changed=true
                }
            }else{merged[id]=remote;changed=true}
        }
        // Accept the older folder format as well, without deleting its records.
        for directory in [records,folder] {
            for url in (try? fm.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil)) ?? [] where url.pathExtension=="json" {
                if let remote=readRecord(url){merge(remote)}
            }
        }
        let files=markdownFiles(in:folder)
        for (id,note) in merged where note["purgedAt"] == nil || note["purgedAt"] is NSNull {
            for url in files where url.lastPathComponent.hasSuffix(" -- "+id+".md") {
                if let edited=try editedRecord(note,at:url){merge(edited)}
            }
        }
        for id in Array(merged.keys) {
            guard UUID(uuidString:id) != nil,var note=merged[id] else{continue}
            let recordURL=records.appendingPathComponent(id+".json")
            try coordinate(recordURL){url in
                if let disk=self.readRecord(url),self.date(disk)>self.date(note){note=disk;merged[id]=disk;changed=true}
                if note["purgedAt"] is NSNumber {
                    for file in files where file.lastPathComponent.hasSuffix(" -- "+id+".md"){try self.fm.removeItem(at:file)}
                }else{
                    // Recheck source files before replacing or renaming them.
                    for file in files where file.lastPathComponent.hasSuffix(" -- "+id+".md") {
                        if let edited=try self.editedRecord(note,at:file){note=edited;merged[id]=edited;changed=true}
                    }
                    let markdownURL=self.noteURL(note,in:folder)
                    try self.fm.createDirectory(at:markdownURL.deletingLastPathComponent(),withIntermediateDirectories:true)
                    let content=Data((note["markdown"] as! String).utf8)
                    try self.coordinate(markdownURL){target in
                        if self.fm.fileExists(atPath:target.path),let edited=try self.editedRecord(note,at:target){note=edited;merged[id]=edited;changed=true;return}
                        if (try? Data(contentsOf:target)) != content {
                            try content.write(to:target,options:.atomic)
                            try self.fm.setAttributes([.modificationDate:Date(timeIntervalSince1970:self.date(note)/1000)],ofItemAtPath:target.path)
                        }
                    }
                    for old in files where old.standardizedFileURL.path != markdownURL.standardizedFileURL.path && old.lastPathComponent.hasSuffix(" -- "+id+".md") {
                        // Only remove this app's superseded copy. Never remove a
                        // different edit that arrived during the exchange.
                        if self.fm.fileExists(atPath:old.path),(try self.editedRecord(note,at:old)) == nil {try self.fm.removeItem(at:old)}
                    }
                }
                let data=try JSONSerialization.data(withJSONObject:note,options:[.sortedKeys])
                if (try? Data(contentsOf:url)) != data {try data.write(to:url,options:.atomic)}
            }
        }
        if changed{var result=local;result["notes"]=Array(merged.values);return try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys])}
        return nil
    }
}
