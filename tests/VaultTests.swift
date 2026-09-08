import Foundation

@main struct VaultTests {
 static func check(_ value: @autoclosure () throws -> Bool, _ message: String = "") throws { let passed = try value(); assert(passed, message) }
 static func main()throws {
  let root=FileManager.default.temporaryDirectory.appendingPathComponent("lilt-tests-"+UUID().uuidString)
  defer{try? FileManager.default.removeItem(at:root)}
  let vault=try Vault(directory:root)
  let id=UUID().uuidString.lowercased()
  func library(_ text:String,_ updated:Double=1)throws->Data{try JSONSerialization.data(withJSONObject:["version":1,"notes":[["id":id,"markdown":text,"title":text,"text":text,"updatedAt":updated]],"settings":[:],"snippets":[]])}
  let first=try library("Readable note body 9182")
  try vault.save(first)
  try check(vault.read()==first,"Readable storage round trip")
  let onDisk=try Data(contentsOf:vault.file)
  assert(String(data:onDisk,encoding:.utf8)!.contains("Readable note"),"Plain JSON on disk")
  assert(vault.file.lastPathComponent=="library.json")
  assert(!FileManager.default.fileExists(atPath:root.appendingPathComponent("test.key").path),"No key file needed")
  let reopened=try Vault(directory:root)
  try check(reopened.read()==first,"Persistence across reopened vault")
  let second=try library("Updated",2);try vault.save(second)
  try Data("damaged".utf8).write(to:vault.file)
  let recovered=try vault.read();assert(recovered==first,"Recover previous version from corruption");assert(vault.recoveredBackup)
  do{try vault.save(Data("invalid".utf8));assertionFailure("Invalid save accepted")}catch{}
  try vault.save(second)
  let corrupt=try Vault(directory:root.appendingPathComponent("corrupt"))
  try Data("broken".utf8).write(to:corrupt.file)
  do{_ = try corrupt.read();assertionFailure("Corrupt data accepted")}catch{}
  let duplicateIDs=try JSONSerialization.data(withJSONObject:["version":1,"notes":[["id":id,"markdown":"A"],["id":id,"markdown":"B"]]])
  do{try vault.save(duplicateIDs);assertionFailure("Duplicate IDs accepted")}catch{}
  let sync=FolderSync(),shared=root.appendingPathComponent("shared")
  try check(sync.exchange(library:first,folder:shared)==nil)
  try check(sync.exchange(library:second,folder:shared)==nil)
  let merged=try sync.exchange(library:first,folder:shared)!
  assert(String(data:merged,encoding:.utf8)!.contains("Updated"),"A second client receives newer notes")
  let tombstone=try JSONSerialization.data(withJSONObject:["version":1,"notes":[["id":id,"markdown":"Updated","title":"Updated","updatedAt":3,"deletedAt":3]]])
  _ = try sync.exchange(library:tombstone,folder:shared)
  let deletion=try sync.exchange(library:second,folder:shared)!
  assert(String(data:deletion,encoding:.utf8)!.contains("deletedAt"),"Deletion propagates")
  let portableRoot=root.appendingPathComponent("portable")
  _ = try sync.exchange(library:first,folder:portableRoot)
  let originalNote=(try Vault.validate(first)["notes"] as! [[String:Any]])[0]
  let originalURL=sync.noteURL(originalNote,in:portableRoot)
  try check(String(contentsOf:originalURL,encoding:.utf8)=="Readable note body 9182","Portable Markdown exported")
  assert(FileManager.default.fileExists(atPath:portableRoot.appendingPathComponent(".lilt/"+id+".json").path))
  try "# Changed on another device".write(to:originalURL,atomically:true,encoding:.utf8)
  let external=try sync.exchange(library:first,folder:portableRoot)!
  let externalNote=(try Vault.validate(external)["notes"] as! [[String:Any]])[0]
  assert(externalNote["markdown"] as? String=="# Changed on another device","External Markdown edit imported")
  assert(externalNote["doc"] is NSNull,"Stale rich document cleared after external edit")
  _ = try sync.exchange(library:external,folder:portableRoot)
  let activeFiles=try FileManager.default.contentsOfDirectory(at:portableRoot,includingPropertiesForKeys:nil).filter{$0.pathExtension=="md"}
  assert(activeFiles.count==1,"Title changes do not duplicate Markdown files")
  var deletedNote=externalNote;deletedNote["deletedAt"]=Date().timeIntervalSince1970*1000;deletedNote["updatedAt"]=(deletedNote["deletedAt"] as! Double)+1
  let deletedLibrary=try JSONSerialization.data(withJSONObject:["version":1,"notes":[deletedNote]])
  _ = try sync.exchange(library:deletedLibrary,folder:portableRoot)
  assert(FileManager.default.fileExists(atPath:sync.noteURL(deletedNote,in:portableRoot).path),"Deleted notes move to recoverable folder")
  assert(!FileManager.default.fileExists(atPath:sync.noteURL(externalNote,in:portableRoot).path),"Deleted note is not left in the active folder")
  print("PASS: portable Markdown files, cross-device Markdown edits, title renames, deleted-note recovery")
  print("PASS: readable JSON, persistence, backup recovery, invalid save protection, corrupt data rejection, duplicate ID rejection, two-client folder sync, deletion sync")
 }
}
