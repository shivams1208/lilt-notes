import AppKit
import WebKit
import CoreSpotlight

extension AppDelegate {
    static let integrationText = "# Prefilled note\n\nA+B & 50% — café 🚀\n\n- [ ] Review [link](https://example.com?a=1&b=2)\n\n```swift\nlet n = 7\n```"
    static func prefilledURL(_ text:String)->URL {
        var parts=URLComponents();parts.scheme="liltnotes";parts.host="new";parts.queryItems=[URLQueryItem(name:"text",value:text)]
        return parts.url!
    }
    func prepareIntegrationAuditIfRequested(){
        guard isTest,args.contains("--integration-audit") else{return}
        integrationAuditQueued = !loaded
        application(NSApp,open:[Self.prefilledURL(Self.integrationText)])
    }
    func runIntegrationAuditIfRequested(){
        guard isTest,let index=args.firstIndex(of:"--integration-audit"),index+1<args.count else{return}
        let output=URL(fileURLWithPath:args[index+1])
        Task { @MainActor in
            var report:[String:Any]=["queuedBeforeReady":self.integrationAuditQueued]
            func require(_ value:Bool,_ message:String)throws {
                if !value{throw NSError(domain:"LiltIntegrationAudit",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
            }
            @MainActor func state() async throws->[String:Any] {
                try await Task.sleep(nanoseconds:200_000_000)
                return try await withCheckedThrowingContinuation { (continuation:CheckedContinuation<[String:Any],Error>) in
                    self.web.callAsyncJavaScript("const s=Lilt.state();return {id:s.currentId,notes:s.notes,html:Lilt.editor.getHTML(),text:Lilt.editor.getText(),mode:document.querySelector('#overlay').dataset.mode||''};",arguments:[:],in:nil,in:.page){ result in
                        switch result{case .success(let value):continuation.resume(returning:value as? [String:Any] ?? [:]);case .failure(let error):continuation.resume(throwing:error)}
                    }
                }
            }
            do{
                let first=try await state(),id=first["id"] as? String ?? "",notes=first["notes"] as? [[String:Any]] ?? []
                let original=notes.first{$0["id"] as? String==id}?["markdown"] as? String ?? ""
                try require(self.integrationAuditQueued,"The startup URL did not enter the pending queue")
                try require((first["text"] as? String ?? "").contains("A+B & 50% — café 🚀"),"Prefilled URL lost literal characters")
                try require((first["html"] as? String ?? "").contains("<h1>Prefilled note</h1>") && original.contains("```swift"),"Prefilled Markdown did not render")
                report["coldPrefillPreservedUnicodeAndMarkdown"]=true
                self.application(NSApp,open:[Self.prefilledURL("# Second note\n\nKeep + signs & ampersands, 100%.")])
                let second=try await state(),secondNotes=second["notes"] as? [[String:Any]] ?? []
                try require(second["id"] as? String != id && secondNotes.count==notes.count+1,"Warm URL did not create a distinct note")
                try require((second["text"] as? String ?? "").contains("Keep + signs & ampersands, 100%."),"Warm URL text changed")
                report["warmPrefillCreatedDistinctNote"]=true
                self.application(NSApp,open:[URL(string:"liltnotes://note/"+id)!])
                let reopened=try await state()
                try require(reopened["id"] as? String==id,"Existing-note URL opened the wrong note")
                report["existingNoteURL"]=true
                let activity=NSUserActivity(activityType:CSSearchableItemActionType)
                activity.userInfo=[CSSearchableItemActivityIdentifier:second["id"] as? String ?? ""]
                try require(self.application(NSApp,continue:activity,restorationHandler:{_ in}),"Spotlight activity was not handled")
                let spotlightOpened=try await state()
                try require(spotlightOpened["id"] as? String==second["id"] as? String,"Spotlight opened the wrong note")
                report["spotlightActivityOpensNote"]=true
                let wasLoaded=self.loaded;self.loaded=false
                activity.userInfo=[CSSearchableItemActivityIdentifier:id]
                try require(self.application(NSApp,continue:activity,restorationHandler:{_ in}),"Startup Spotlight activity was not handled")
                self.loaded=wasLoaded
                try require(self.pendingURLs.last?.lastPathComponent==id,"Startup Spotlight activity did not queue the note")
                self.pendingURLs.forEach(self.handleURL);self.pendingURLs=[]
                let spotlightQueued=try await state()
                try require(spotlightQueued["id"] as? String==id,"Queued Spotlight activity opened the wrong note")
                report["spotlightActivityQueuesBeforeEditorReady"]=true
                self.application(NSApp,open:[URL(string:"liltnotes://note/missing-test-id")!])
                let missing=try await state()
                try require(missing["id"] as? String==id,"Missing-note URL changed the current note")
                report["missingNoteKeptCurrentNote"]=true
                self.application(NSApp,open:[URL(string:"liltnotes://search")!])
                let search=try await state()
                try require(search["mode"] as? String=="browse" && search["id"] as? String==id,"Search URL failed to open the browser")
                report["searchURL"]=true
                self.application(NSApp,open:[URL(string:"liltnotes://note/"+id)!])
                report["passed"]=true;report["error"]=NSNull();report["noteID"]=id
                report["delivery"]="Application URL delegate; isolated library. OS cold launch is covered by the separate Finder quicklink check."
            }catch{report["passed"]=false;report["error"]=error.localizedDescription}
            if let data=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:output)}
        }
    }
}
