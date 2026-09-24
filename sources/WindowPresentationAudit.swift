import AppKit
import WebKit
import Carbon

extension AppDelegate {
    func runWindowPresentationAuditIfRequested() {
        guard isTest,let index=args.firstIndex(of:"--presentation-audit"),index+1<args.count else{return}
        let output=URL(fileURLWithPath:args[index+1])
        Task { @MainActor in
            var checks:[String]=[],failure:String?
            var host:NSWindow?
            func require(_ condition:Bool,_ name:String)throws {
                if !condition{throw NSError(domain:"WindowPresentationAudit",code:1,userInfo:[NSLocalizedDescriptionKey:name])}
                checks.append(name)
            }
            func settle() async throws {try await Task.sleep(nanoseconds:300_000_000)}
            func hotkey(_ id:UInt32,released:Bool=false)throws {
                var event:EventRef?,value=EventHotKeyID(signature:0x4c494c54,id:id)
                let kind=UInt32(released ? kEventHotKeyReleased:kEventHotKeyPressed)
                guard CreateEvent(nil,OSType(kEventClassKeyboard),kind,GetCurrentEventTime(),0,&event)==noErr,let event=event else{throw NSError(domain:"WindowPresentationAudit",code:3)}
                defer{ReleaseEvent(event)}
                SetEventParameter(event,EventParamName(kEventParamDirectObject),EventParamType(typeEventHotKeyID),MemoryLayout<EventHotKeyID>.size,&value)
                SendEventToEventTarget(event,GetEventDispatcherTarget())
            }
            @MainActor func waitForFullScreen(_ entering:Bool) async throws {
                for _ in 0..<30 {if host?.styleMask.contains(.fullScreen)==entering{try await settle();return};try await settle()}
                throw NSError(domain:"WindowPresentationAudit",code:4,userInfo:[NSLocalizedDescriptionKey:"Full-screen transition timed out"])
            }
            do {
                try await settle()
                guard let screen=NSScreen.screens.first else{throw NSError(domain:"WindowPresentationAudit",code:2,userInfo:[NSLocalizedDescriptionKey:"No WindowServer display available"])}
                let initial=self.panel.frame
                self.hide();self.performShortcut("toggle");try await settle()
                try require(self.panel.isVisible && self.panel.isKeyWindow,"Shortcut opens a hidden panel with keyboard focus")
                self.performShortcut("toggle");try await settle()
                try require(!self.panel.isVisible,"Second distinct shortcut hides a focused panel")
                self.show();try await settle()
                try require(self.panel.frame==initial,"Ordinary summon preserves manual size and position")
                self.panel.setFrameOrigin(NSPoint(x:screen.frame.maxX+5000,y:screen.frame.maxY+5000))
                self.performShortcut("toggle");try await settle()
                try require(self.panel.isVisible && screen.visibleFrame.intersects(self.panel.frame),"Shortcut recovers a focused panel stranded off-screen instead of hiding it")
                self.panel.miniaturize(nil);try await settle();self.show();try await settle()
                try require(!self.panel.isMiniaturized && self.panel.isVisible,"Summon restores a minimized panel")
                NSApp.hide(nil);try await settle();self.show();try await settle()
                try require(!NSApp.isHidden && self.panel.isVisible,"Summon restores an app hidden with Command-H")
                self.show();self.hide();try await Task.sleep(nanoseconds:1_200_000_000)
                try require(!self.panel.isVisible,"Hide cancels every pending presentation retry")
                try hotkey(1);try await settle()
                try require(self.panel.isVisible,"Carbon shortcut callback opens panel")
                for _ in 0..<8{try hotkey(1)};try await settle()
                try require(self.panel.isVisible,"Repeated Carbon press callbacks do not hide panel")
                try hotkey(1,released:true);try hotkey(1);try await settle()
                try require(!self.panel.isVisible,"Release then press toggles exactly once")
                try hotkey(1,released:true)
                self.show();try await settle()
                // Exercise actual AppKit occlusion and full-screen eligibility,
                // using an empty fixture window rather than personal documents.
                host=NSWindow(contentRect:NSRect(x:100,y:100,width:650,height:500),styleMask:[.titled,.closable,.resizable,.miniaturizable],backing:.buffered,defer:false)
                host!.title="Lilt window verification";host!.isReleasedWhenClosed=false;host!.collectionBehavior=[.fullScreenPrimary]
                host!.backgroundColor = .windowBackgroundColor
                for mode in ["regular","maximized","full-screen"] {
                    self.hide()
                    host!.makeKeyAndOrderFront(nil)
                    if mode=="maximized"{host!.setFrame(screen.visibleFrame,display:true)}
                    if mode=="full-screen"{host!.toggleFullScreen(nil);try await waitForFullScreen(true)}
                    try await settle()
                    for alwaysOnTop in [true,false] {
                        self.settings["alwaysOnTop"]=alwaysOnTop
                        self.show();try await settle()
                        try require(self.panelVisibility().shouldHide,"Panel visible, focused, and in active Space above \(mode), alwaysOnTop=\(alwaysOnTop)")
                        try require(self.panel.level.rawValue>host!.level.rawValue,"Panel has visible stacking order above \(mode), alwaysOnTop=\(alwaysOnTop)")
                        self.hide();try await settle()
                    }
                }
                host!.toggleFullScreen(nil);try await waitForFullScreen(false);host!.close();host=nil
                self.settings["alwaysOnTop"]=false;self.show();try await settle()
                self.panel.resignKey();try await Task.sleep(nanoseconds:1_200_000_000)
                try require(!self.panel.isKeyWindow,"Delayed retries do not take keyboard focus back after it leaves")
                try require(self.panel.level == .normal,"Keep-above preference resumes after focus leaves")
                self.settings["alwaysOnTop"]=true;self.show();try await settle()
                self.panel.setFrameOrigin(NSPoint(x:9999,y:9999));self.presentationScreensChanged()
                try require(screen.visibleFrame.contains(self.panel.frame),"Display-change notification recovers disconnected-screen placement")
                self.hide();self.presentationDidWake();try await settle()
                try require(!self.panel.isVisible,"Wake refreshes shortcut registration without opening notes")
            }catch{failure=error.localizedDescription}
            if let host=host{host.orderOut(nil);host.close()}
            let report:[String:Any]=["passed":failure==nil,"checks":checks,"error":failure ?? NSNull(),"os":ProcessInfo.processInfo.operatingSystemVersionString]
            if let data=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:output)}
            if args.contains("--quit-after-audit"){NSApp.terminate(nil)}
        }
    }
}
