import AppKit
import WebKit

extension AppDelegate {
    func runWindowSizingAuditIfRequested() {
        guard isTest,let index=args.firstIndex(of:"--sizing-audit"),index+1<args.count else{return}
        let output=URL(fileURLWithPath:args[index+1])
        Task { @MainActor in
            var report:[String:Any]=[:],checks:[[String:Any]]=[]
            @MainActor func evaluate(_ script:String) async throws -> Any {
                try await withCheckedThrowingContinuation { continuation in
                    self.web.callAsyncJavaScript(script,arguments:[:],in:nil,in:.page){continuation.resume(with:$0)}
                }
            }
            func require(_ condition:Bool,_ message:String)throws {
                if !condition{throw NSError(domain:"WindowSizingAudit",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
            }
            @MainActor func settle() async throws {try await Task.sleep(nanoseconds:250_000_000)}
            @MainActor func automatic(_ enabled:Bool) async throws {
                _ = try await evaluate("Lilt.action('settings');const c=document.querySelector('#setting-size');c.checked=\(enabled);c.dispatchEvent(new Event('change'));Lilt.action('closeOverlay');")
                try await settle()
            }
            do {
                try await settle()
                _ = try await evaluate("Lilt.init({version:1,currentId:null,settings:{autoSize:false},snippets:[],notes:Array.from({length:12},(_,i)=>({id:crypto.randomUUID(),markdown:'# Sizing note '+(i+1)+'\\n\\nA short note without padding.',title:'Sizing note '+(i+1),text:'A short note without padding.',doc:null,pinned:false,createdAt:i+1,updatedAt:i+1,deletedAt:null}))});window.sizingOriginal=Lilt.editor.getMarkdown();")
                try await settle()
                for size in [NSSize(width:360,height:200),NSSize(width:480,height:300),NSSize(width:700,height:640)] {
                    for enabled in [false,true] {
                        try await automatic(false)
                        let old=self.panel.frame
                        self.panel.setFrame(NSRect(x:old.minX,y:old.maxY-size.height,width:size.width,height:size.height),display:true)
                        try await settle();try await automatic(enabled)
                        let baseline=self.panel.frame
                        let close=self.closeButton!,surface=close.superview!
                        let closeGeometry:[String:Double]=["x":close.frame.midX,"y":surface.bounds.height-close.frame.midY,"width":close.frame.width,"height":close.frame.height]
                        for key in ["x","y"] {try require(abs((closeGeometry[key] ?? 0)-24)<0.1,"Native close button is off-center: \(key)")}
                        try require(close.window===self.panel && !close.isHidden && close.isEnabled,"Native close button is unavailable")
                        for action in ["actions","copyMenu","browse","settings"] {
                            self.resizeEvents=[]
                            _ = try await evaluate("Lilt.action('\(action)');")
                            try await settle()
                            let geometry=try await evaluate("const p=document.querySelector('#overlay'),r=p.getBoundingClientRect(),c=p.querySelector('.overlay-content,.form');return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,inside:r.x>=15&&r.y>=15&&r.right<=innerWidth-15&&r.bottom<=innerHeight-15,scrollable:c.scrollHeight>c.clientHeight,contentHeight:c.clientHeight};") as? [String:Any] ?? [:]
                            try require(self.panel.frame==baseline && self.resizeEvents.isEmpty,"Opening \(action) resized the native window")
                            try require(self.closeButton.isHidden,"Native close button drew over the command panel")
                            try require(geometry["inside"] as? Bool == true,"\(action) extended outside the note window")
                            try require((geometry["contentHeight"] as? Double ?? 0)>=36,"\(action) left insufficient room for controls")
                            if action=="actions" || action=="browse" {
                                let navigation=try await evaluate("""
                                const input=document.querySelector('#overlay-search'),root=document.querySelector('#results');
                                const original=[...root.querySelectorAll('[data-index]')],enabled=original.filter(el=>!el.disabled);
                                const hover=(el,x=100,y=100)=>el.dispatchEvent(new MouseEvent('mousemove',{clientX:x,clientY:y,bubbles:true}));
                                hover(root,-1,-1);hover(enabled[0]);
                                let moves=0;
                                for(const direction of ['ArrowDown','ArrowUp']){
                                  const targets=direction==='ArrowDown'?enabled.slice(1):enabled.slice(0,-1).reverse();
                                  for(const target of targets){
                                    input.dispatchEvent(new KeyboardEvent('keydown',{key:direction,bubbles:true}));
                                    if(root.querySelector('.selected')!==target)throw Error('Keyboard navigation skipped a row');
                                    if(original.some((el,i)=>el!==root.querySelectorAll('[data-index]')[i]))throw Error('Arrow key replaced row elements');
                                    hover(original[Math.max(0,Number(target.dataset.index)-2)]);
                                    if(root.querySelector('.selected')!==target)throw Error('Stationary pointer moved selection backwards');
                                    const c=root.getBoundingClientRect(),r=target.getBoundingClientRect();
                                    if(r.top<c.top-1||r.bottom>c.bottom+1)throw Error('Selected row is outside the scrolling viewport');
                                    moves++;
                                  }
                                }
                                hover(enabled[1],101,100);
                                if(root.querySelector('.selected')!==enabled[1])throw Error('Moving the pointer did not restore hover selection');
                                return {moves,rowsStable:true,stationaryPointerIgnored:true,pointerMovementWorks:true};
                                """) as? [String:Any] ?? [:]
                                try require((navigation["moves"] as? Int ?? 0)>0,"Navigation audit did not exercise any rows")
                                let reachable=try await evaluate("const input=document.querySelector('#overlay-search');for(let i=0;i<100;i++)input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));const c=document.querySelector('#results').getBoundingClientRect(),s=document.querySelector('#results .selected').getBoundingClientRect();return s.top>=c.top-1&&s.bottom<=c.bottom+1;") as? Bool ?? false
                                try require(reachable,"Keyboard selection was clipped in \(action)")
                            }
                            _ = try await evaluate("Lilt.action('closeOverlay');return Lilt.editor.getMarkdown();")
                            try await settle()
                            try require(self.panel.frame==baseline && self.resizeEvents.isEmpty,"Closing \(action) resized the native window")
                            let unchanged=try await evaluate("return Lilt.editor.getMarkdown()===window.sizingOriginal;") as? Bool ?? false
                            try require(unchanged,"Opening a menu changed the note content")
                            checks.append(["width":size.width,"height":size.height,"autoSize":enabled,"menu":action,"geometry":geometry,"closeGeometry":closeGeometry,"keyboardAndHoverVerified":action=="actions" || action=="browse","resizeEvents":self.resizeEvents.count,"noteUnchanged":unchanged])
                        }
                    }
                }
                try await automatic(false)
                let old=self.panel.frame
                self.panel.setFrame(NSRect(x:old.minX,y:old.maxY-300,width:480,height:300),display:true)
                try await settle();try await automatic(true)
                self.closeButton.performClick(nil)
                try require(!self.panel.isVisible,"Native close button did not hide the window")
                self.show();try await settle()
                try require(self.panel.isVisible,"Note could not reopen after closing")
                let preserved=try await evaluate("return Lilt.editor.getMarkdown()===window.sizingOriginal;") as? Bool ?? false
                try require(preserved,"Closing and reopening changed the note")
                report["nativeCloseAndReopenVerified"]=true
                report["passed"]=true;report["error"]=NSNull()
                report["manualDragReady"]=true
            }catch{report["passed"]=false;report["error"]=error.localizedDescription}
            report["checks"]=checks
            self.writeWindowAudit()
            if let data=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:output)}
            if self.args.contains("--quit-after-audit"){DispatchQueue.main.async{NSApp.terminate(nil)}}
        }
    }
}
