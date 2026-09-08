import Foundation
import Carbon

struct NoteShortcut:Equatable {
    let keyCode:UInt32,modifiers:UInt32,label:String
    init?(dictionary:[String:Any]) {
        let allowed=UInt32(cmdKey|controlKey|optionKey|shiftKey)
        guard let key=dictionary["keyCode"] as? Int,(0...127).contains(key),
              let mods=dictionary["modifiers"] as? Int,mods>=0,mods<=Int(allowed),
              UInt32(mods) & ~allowed==0,UInt32(mods)&UInt32(cmdKey|controlKey|optionKey) != 0,
              let label=dictionary["label"] as? String,!label.isEmpty,label.count<=50 else{return nil}
        keyCode=UInt32(key);modifiers=UInt32(mods);self.label=label
    }
    var dictionary:[String:Any]{["keyCode":Int(keyCode),"modifiers":Int(modifiers),"label":label]}
}
struct ShortcutBinding {
    let id:UInt32,keyCode:UInt32,modifiers:UInt32,target:String
}
enum ShortcutPlan {
    static func notes(_ settings:[String:Any])->[String:NoteShortcut] {
        (settings["noteHotkeys"] as? [String:[String:Any]] ?? [:]).compactMapValues(NoteShortcut.init)
    }
    static func bindings(mode:String,notes:[String:NoteShortcut])->[ShortcutBinding] {
        guard mode != "none" else{return []}
        let base=UInt32(optionKey|(mode == "controlOption" ? controlKey:0))
        var result=[ShortcutBinding(id:1,keyCode:UInt32(kVK_ANSI_N),modifiers:base,target:"toggle"),
                    ShortcutBinding(id:2,keyCode:UInt32(kVK_ANSI_N),modifiers:base|UInt32(shiftKey),target:"new"),
                    ShortcutBinding(id:3,keyCode:UInt32(kVK_ANSI_P),modifiers:base,target:"browse")]
        for (index,id) in notes.keys.sorted().enumerated(){let shortcut=notes[id]!;result.append(ShortcutBinding(id:UInt32(index+4),keyCode:shortcut.keyCode,modifiers:shortcut.modifiers,target:"note:"+id))}
        return result
    }
    static func hasConflict(_ shortcut:NoteShortcut,noteID:String,mode:String,notes:[String:NoteShortcut])->Bool {
        bindings(mode:mode == "none" ? "option":mode,notes:notes.filter{$0.key != noteID})
            .contains{$0.keyCode==shortcut.keyCode && $0.modifiers==shortcut.modifiers}
    }
}
