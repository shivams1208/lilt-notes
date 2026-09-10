import AppKit
import WebKit

extension AppDelegate {
    func runCompatibilityAuditIfRequested() {
        guard isTest,!compatibilityAuditStarted,
              let index=args.firstIndex(of:"--compatibility-audit"),index+1<args.count else{return}
        compatibilityAuditStarted=true
        let output=URL(fileURLWithPath:args[index+1])
        Task { @MainActor in
            var report:[String:Any]=["os":ProcessInfo.processInfo.operatingSystemVersionString,"nativeMaterials":self.nativeMaterialsEnabled]
            func require(_ condition:Bool,_ message:String)throws {
                if !condition{throw NSError(domain:"LiltCompatibilityAudit",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
            }
            @MainActor func evaluate(_ source:String) async throws -> Any {
                try await withCheckedThrowingContinuation { continuation in
                    self.web.callAsyncJavaScript(source,arguments:[:],in:nil,in:.page){continuation.resume(with:$0)}
                }
            }
            func settle() async throws {try await Task.sleep(nanoseconds:350_000_000)}
            do {
                try await settle()
                _ = try await evaluate("Lilt.init({version:1,currentId:'compatibility-note',settings:{autoSize:false,syncPath:null,hotkey:'none'},snippets:[],notes:[{id:'compatibility-note',title:'Compatibility check',markdown:'# Compatibility check\\n\\nA saved note with **bold** text.\\n\\n| Name | Status |\\n| --- | --- |\\n| Window | Ready |',text:'Compatibility check',doc:null,createdAt:1000,updatedAt:2000,deletedAt:null}]});")
                try await settle()
                var appearances:[[String:Any]]=[]
                for theme in ["light","dark","system"] {
                    _ = try await evaluate("Lilt.action('settings');const s=document.querySelector('#setting-theme');s.value='\(theme)';s.dispatchEvent(new Event('change'));Lilt.action('closeOverlay');Lilt.action('actions');")
                    try await settle()
                    let style=try await evaluate("const p=document.querySelector('#overlay'),css=getComputedStyle(p),before=getComputedStyle(p,'::before');return {theme:document.documentElement.dataset.theme,background:css.backgroundColor,foreground:css.color,material:before.getPropertyValue('-apple-visual-effect'),nativeFlag:document.documentElement.hasAttribute('data-native-materials'),width:p.getBoundingClientRect().width,table:!!document.querySelector('.tiptap table')};") as? [String:Any] ?? [:]
                    try require(style["theme"] as? String==theme,"Appearance setting did not apply")
                    try require(style["nativeFlag"] as? Bool==self.nativeMaterialsEnabled,"Native material capability disagrees with the editor")
                    if !self.nativeMaterialsEnabled {
                        try require(style["background"] as? String != "rgba(0, 0, 0, 0)","Fallback command panel became transparent")
                    }
                    try require(style["table"] as? Bool==true,"Table rendering disappeared")
                    appearances.append(style)
                    _ = try await evaluate("Lilt.action('closeOverlay');")
                }
                report["appearances"]=appearances
                _ = try await evaluate("Lilt.editor.commands.insertContent(' Recovery marker — café 🚀');Lilt.flush();")
                try await settle()
                let before=try await evaluate("return {id:Lilt.state().currentId,markdown:Lilt.editor.getMarkdown()};") as! [String:Any]
                // Exercise the same public delegate path used when WebKit terminates.
                self.webViewWebContentProcessDidTerminate(self.web)
                for _ in 0..<50 {
                    try await Task.sleep(nanoseconds:100_000_000)
                    if self.loaded {break}
                }
                try require(self.loaded,"Editor did not recover after a web-process termination notification")
                try await settle()
                let after=try await evaluate("return {id:Lilt.state().currentId,markdown:Lilt.editor.getMarkdown()};") as! [String:Any]
                try require(after["id"] as? String==before["id"] as? String && after["markdown"] as? String==before["markdown"] as? String,"Editor recovery lost saved content")
                report["simulatedWebProcessRecoveryPreservesSavedNote"]=true
                let disk=try Vault.validate(self.vault.read())
                try require((disk["notes"] as? [[String:Any]])?.contains(where:{($0["markdown"] as? String)?.contains("Recovery marker")==true})==true,"The saved edit did not reach disk")
                report["savedEditOnDisk"]=true
                if self.args.contains("--quit-after-audit") {
                    // No explicit save: termination must collect this final edit.
                    _ = try await evaluate("Lilt.editor.commands.insertContent(' Final quit marker');")
                    report["verifyFinalQuitMarkerOnDiskAfterExit"]=true
                }
                report["passed"]=true
            }catch{report["passed"]=false;report["error"]=error.localizedDescription}
            if let data=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:output)}
            if self.args.contains("--quit-after-audit"){DispatchQueue.main.async{NSApp.terminate(nil)}}
        }
    }
}
