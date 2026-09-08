import Foundation
import Carbon

@main struct ShortcutTests {
 static func main(){
  let sample:[String:Any]=["keyCode":Int(kVK_ANSI_9),"modifiers":Int(controlKey|optionKey|shiftKey),"label":"⌃ ⌥ ⇧ 9"]
  let shortcut=NoteShortcut(dictionary:sample)!
  assert(NoteShortcut(dictionary:shortcut.dictionary)==shortcut)
  var bad=sample;bad["keyCode"] = -1;assert(NoteShortcut(dictionary:bad)==nil)
  bad=sample;bad["keyCode"] = 128;assert(NoteShortcut(dictionary:bad)==nil)
  bad=sample;bad["modifiers"]=Int(shiftKey);assert(NoteShortcut(dictionary:bad)==nil)
  bad=sample;bad["modifiers"]=Int(optionKey|alphaLock);assert(NoteShortcut(dictionary:bad)==nil)
  let notes=["target":shortcut]
  let bindings=ShortcutPlan.bindings(mode:"option",notes:notes)
  assert(bindings.count==4&&bindings[3].target=="note:target")
  assert(bindings[3].keyCode==UInt32(kVK_ANSI_9)&&bindings[3].modifiers==UInt32(controlKey|optionKey|shiftKey))
  assert(ShortcutPlan.hasConflict(shortcut,noteID:"other",mode:"option",notes:notes))
  assert(!ShortcutPlan.hasConflict(shortcut,noteID:"target",mode:"option",notes:notes))
  let reserved=NoteShortcut(dictionary:["keyCode":Int(kVK_ANSI_N),"modifiers":Int(optionKey),"label":"⌥ N"])!
  assert(ShortcutPlan.hasConflict(reserved,noteID:"target",mode:"option",notes:notes))
  assert(ShortcutPlan.bindings(mode:"none",notes:notes).isEmpty)
  assert(ShortcutPlan.bindings(mode:"controlOption",notes:[:])[0].modifiers==UInt32(controlKey|optionKey))
  assert(ShortcutPlan.notes(["noteHotkeys":["valid":sample,"invalid":bad]]).count==1)
  print("Shortcut validation, conflicts, routing, and disabled-mode checks passed")
 }
}
