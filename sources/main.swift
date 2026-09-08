import AppKit
import WebKit
import Carbon
import UniformTypeIdentifiers
import ServiceManagement
import Darwin

final class NotesPanel:NSPanel {override var canBecomeKey:Bool{true};override var canBecomeMain:Bool{true}}
final class DragRegion:NSView {override func mouseDown(with event:NSEvent){window?.performDrag(with:event)}}
final class NoteSurfaceView:NSView {
    var hoverChanged:((Bool)->Void)?
    private var hoverArea:NSTrackingArea?
    override func viewDidMoveToWindow(){super.viewDidMoveToWindow();updateSurface()}
    override func viewDidChangeEffectiveAppearance(){super.viewDidChangeEffectiveAppearance();updateSurface()}
    private func updateSurface(){
        wantsLayer=true
        let dark=effectiveAppearance.bestMatch(from:[.aqua,.darkAqua]) == .darkAqua
        layer?.backgroundColor=(dark ? NSColor.black.withAlphaComponent(0.24):NSColor.clear).cgColor
    }
    override func updateTrackingAreas(){
        super.updateTrackingAreas()
        if let area=hoverArea{removeTrackingArea(area)}
        let area=NSTrackingArea(rect:.zero,options:[.mouseEnteredAndExited,.activeAlways,.inVisibleRect],owner:self,userInfo:nil)
        addTrackingArea(area);hoverArea=area
    }
    override func mouseEntered(with event:NSEvent){hoverChanged?(true)}
    override func mouseExited(with event:NSEvent){hoverChanged?(false)}
}

final class AppDelegate:NSObject,NSApplicationDelegate,WKScriptMessageHandler,WKNavigationDelegate,NSWindowDelegate {
    var panel:NotesPanel!,web:WKWebView!,status:NSStatusItem!,vault:Vault!
    var closeButton:NSButton!
    var instanceLock:Int32 = -1
    var localKeyMonitor:Any?
    var nativeMaterialsEnabled=false,integrationAuditQueued=false
    var overlayOpen=false,manualResizeActive=false
    var resizeEvents:[[String:Double]]=[]
    var loaded=false,settings:[String:Any]=[:],hotkeys:[EventHotKeyRef]=[],hotkeyMode="",handler:EventHandlerRef?
    var lastSyncError:String?
    var scopedNotesFolder:URL?,syncAuthorized=false,requestedFolderAccess=false
    let cloudQueue=DispatchQueue(label:"com.shivam.liltnotes.cloud",qos:.utility)
    var pendingURLs:[URL]=[],latestData:Data?,latestRevision=0,storeError:Error?,syncTimer:Timer?,syncFolder:URL?,syncRunning=false
    let saveQueue=DispatchQueue(label:"com.shivam.liltnotes.storage",qos:.userInitiated)
    let sync=FolderSync()
    let args=CommandLine.arguments
    var isTest:Bool{args.contains("--data-dir")}
    var receivedHotkeys:[UInt32]=[]
    var hotkeyBindings:[ShortcutBinding]=[],hotkeyFailures:[String:Int32]=[:],hotkeyConfiguration=""
    var writingTask:Task<Void,Never>?,writingRequestID:String?
    var shortcutRecording:String?
    var hotkeysEnabled:Bool{!isTest || args.contains("--test-hotkeys")}
    var directory:URL {if let i=args.firstIndex(of:"--data-dir"),i+1<args.count{return URL(fileURLWithPath:args[i+1],isDirectory:true)};return FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Lilt Notes",isDirectory:true)}
    func applicationDidFinishLaunching(_ notification:Notification){
        NSApp.setActivationPolicy(.accessory)
        do {try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true);instanceLock=Darwin.open(directory.appendingPathComponent("session.lock").path,O_CREAT|O_RDWR,0o600);guard instanceLock>=0,flock(instanceLock,LOCK_EX|LOCK_NB)==0 else{NSRunningApplication.runningApplications(withBundleIdentifier:"com.shivam.liltnotes").first(where:{$0.processIdentifier != ProcessInfo.processInfo.processIdentifier})?.activate(options:[]);NSApp.terminate(nil);return}}catch{NSApp.terminate(nil);return}
        do {vault=try Vault(directory:directory);latestData=try vault.read()}
        catch {let alert=NSAlert();alert.messageText="Lilt Notes could not open your library";alert.informativeText=error.localizedDescription;alert.runModal();NSApp.terminate(nil);return}
        configureDefaultNotesFolder();createMenu();createWindow();createStatusItem();installLocalHotkeys()
        syncTimer=Timer.scheduledTimer(withTimeInterval:8,repeats:true){[weak self] _ in self?.syncNow();self?.writeWindowAudit()}
        show();prepareIntegrationAuditIfRequested()
    }
    var iCloudNotesFolder:URL {FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs/Lilt Notes",isDirectory:true)}
    func configureDefaultNotesFolder(){
        guard !isTest,let data=latestData,var library=try? Vault.validate(data) else{return}
        var preferences=library["settings"] as? [String:Any] ?? [:]
        guard preferences["syncDefaultInitialized"] as? Bool != true else{return}
        if preferences["syncPath"] as? String == nil,FileManager.default.fileExists(atPath:iCloudNotesFolder.deletingLastPathComponent().path){
            do{try FileManager.default.createDirectory(at:iCloudNotesFolder,withIntermediateDirectories:true);preferences["syncPath"]=iCloudNotesFolder.path}catch{return}
        }
        preferences["syncDefaultInitialized"]=true;library["settings"]=preferences
        if let updated=try? JSONSerialization.data(withJSONObject:library){latestData=updated;try? vault.save(updated)}
    }
    func writeWindowAudit(){guard isTest else{return};let report:[String:Any]=["autoSize":settings["autoSize"] as? Bool ?? true,"manualResizeActive":manualResizeActive,"resizeEventCount":resizeEvents.count,"x":panel.frame.minX,"y":panel.frame.minY,"nativeMaterialsEnabled":nativeMaterialsEnabled,"visible":panel.isVisible,"onActiveSpace":panel.isOnActiveSpace,"notOccluded":panel.occlusionState.contains(.visible),"keyWindow":panel.isKeyWindow,"floating":panel.level == .floating,"registeredHotkeys":hotkeys.count,"receivedHotkeys":receivedHotkeys,"shortcutTargets":hotkeyBindings.filter{hotkeyFailures[$0.target]==nil}.map{$0.target},"shortcutFailures":hotkeyFailures,"handlerInstalled":handler != nil,"frontmostApp":NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "", "width":panel.frame.width,"height":panel.frame.height];if let data=try? JSONSerialization.data(withJSONObject:report,options:[.sortedKeys,.prettyPrinted]){try? data.write(to:directory.appendingPathComponent("window-state.json"))}}
    func createWindow(){
        panel=NotesPanel(contentRect:NSRect(x:0,y:0,width:480,height:480),styleMask:[.titled,.resizable,.fullSizeContentView,.nonactivatingPanel],backing:.buffered,defer:false)
        panel.title="Lilt Notes";panel.titleVisibility = .hidden;panel.titlebarAppearsTransparent=true;panel.isFloatingPanel=true;panel.hidesOnDeactivate=false;panel.becomesKeyOnlyIfNeeded=false
        panel.level = .floating;panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.stationary];panel.isReleasedWhenClosed=false;panel.isOpaque=false;panel.backgroundColor = .clear;panel.hasShadow=true;panel.minSize=NSSize(width:360,height:200);panel.maxSize=NSSize(width:1400,height:1600);panel.delegate=self
        panel.standardWindowButton(.closeButton)?.isHidden=true;panel.standardWindowButton(.miniaturizeButton)?.isHidden=true;panel.standardWindowButton(.zoomButton)?.isHidden=true
        let bounds=panel.contentView!.bounds
        let content=NoteSurfaceView(frame:bounds);content.autoresizingMask=[.width,.height]
        let root=NSVisualEffectView(frame:bounds);root.material = .hudWindow;root.blendingMode = .behindWindow;root.state = .active;root.addSubview(content)
        root.autoresizingMask=[.width,.height];root.wantsLayer=true;root.layer?.cornerRadius=24;root.layer?.cornerCurve = .continuous;root.layer?.masksToBounds=true
        let configuration=WKWebViewConfiguration();if !args.contains("--no-glass"){nativeMaterialsEnabled=NativeAppearance.enableMaterials(configuration.preferences)};configuration.websiteDataStore = .nonPersistent();configuration.userContentController.add(self,name:"lilt")
        web=WKWebView(frame:content.bounds,configuration:configuration);web.autoresizingMask=[.width,.height];web.navigationDelegate=self;web.setValue(false,forKey:"drawsBackground");web.allowsBackForwardNavigationGestures=false
        content.addSubview(web)
        content.hoverChanged={ [weak self] hovering in
            guard let self=self,self.loaded else{return}
            self.web.evaluateJavaScript("document.documentElement.toggleAttribute('data-window-hover',\(hovering))",completionHandler:nil)
        }
        let drag=DragRegion(frame:NSRect(x:40,y:root.bounds.height-52,width:root.bounds.width-147,height:52));drag.autoresizingMask=[.width,.minYMargin];content.addSubview(drag)
        // AppKit supplies the traffic-light drawing and its native hover/pressed states.
        closeButton=NSWindow.standardWindowButton(.closeButton,for:[.titled,.closable,.resizable])!
        closeButton.setFrameOrigin(NSPoint(x:24-closeButton.frame.width/2,y:content.bounds.height-24-closeButton.frame.height/2))
        closeButton.autoresizingMask=[.minYMargin]
        closeButton.target=self;closeButton.action=#selector(hideMenu)
        closeButton.toolTip="Hide Notes · Esc";closeButton.setAccessibilityLabel("Close")
        content.addSubview(closeButton)
        panel.contentView=root;panel.center()
        let frameName=isTest ? "LiltNotesTestWindow-\(directory.lastPathComponent)":"LiltNotesMainWindow"
        panel.setFrameAutosaveName(frameName);panel.setFrameUsingName(frameName)
        guard let url=Bundle.main.url(forResource:"index",withExtension:"html",subdirectory:"web") else {fatalError("Bundled editor is missing")}
        web.loadFileURL(url,allowingReadAccessTo:url.deletingLastPathComponent())
    }
    func createStatusItem(){status=NSStatusBar.system.statusItem(withLength:NSStatusItem.squareLength);status.button?.image=NSImage(systemSymbolName:"square.and.pencil",accessibilityDescription:"Lilt Notes");status.button?.toolTip="Lilt Notes — click to toggle, Option-click for a new note";status.button?.target=self;status.button?.action=#selector(statusClicked);status.button?.sendAction(on:[.leftMouseUp,.rightMouseUp])}
    @objc func statusClicked(){let event=NSApp.currentEvent;if event?.type == .rightMouseUp {let menu=NSMenu();add(menu,"Open Notes","",#selector(showMenu));add(menu,"New Note","",#selector(newMenu));add(menu,"Search Notes","",#selector(searchMenu));menu.addItem(.separator());add(menu,"Settings…","",#selector(settingsMenu));add(menu,"Quit Lilt Notes","",#selector(quitMenu));status.menu=menu;status.button?.performClick(nil);status.menu=nil}else if event?.modifierFlags.contains(.option)==true {show();js("action",["new"])}else{toggle()}}
    @objc func showMenu(){show()};@objc func hideMenu(){hide()};@objc func newMenu(){show();js("action",["new"])};@objc func searchMenu(){show();js("action",["browse"])};@objc func settingsMenu(){show();js("action",["settings"])};@objc func quitMenu(){NSApp.terminate(nil)}
    @objc func menuCommand(_ sender:NSMenuItem){js("action",[sender.representedObject as? String ?? ""])}
    func add(_ menu:NSMenu,_ title:String,_ key:String,_ selector:Selector,modifiers:NSEvent.ModifierFlags = .command){let item=NSMenuItem(title:title,action:selector,keyEquivalent:key);item.target=self;item.keyEquivalentModifierMask=modifiers;menu.addItem(item)}
    func command(_ menu:NSMenu,_ title:String,_ key:String,_ name:String,modifiers:NSEvent.ModifierFlags = .command){let item=NSMenuItem(title:title,action:#selector(menuCommand(_:)),keyEquivalent:key);item.target=self;item.representedObject=name;item.keyEquivalentModifierMask=modifiers;menu.addItem(item)}
    func createMenu(){let main=NSMenu();let appItem=NSMenuItem();let appMenu=NSMenu(title:"Lilt Notes");appItem.submenu=appMenu;main.addItem(appItem);add(appMenu,"Settings…",",",#selector(settingsMenu));appMenu.addItem(.separator());add(appMenu,"Quit Lilt Notes","q",#selector(quitMenu))
        let file=NSMenu(title:"File");let fileItem=NSMenuItem();fileItem.submenu=file;main.addItem(fileItem);add(file,"New Note","n",#selector(newMenu));add(file,"Browse Notes","p",#selector(searchMenu));command(file,"Import Notes…","o","import");command(file,"Export…","e","exportMenu",modifiers:[.command,.shift]);command(file,"Hide Notes","w","hide")
        let edit=NSMenu(title:"Edit");let editItem=NSMenuItem();editItem.submenu=edit;main.addItem(editItem);command(edit,"Undo","z","undo");command(edit,"Redo","z","redo",modifiers:[.command,.shift]);edit.addItem(.separator());for(title,key,selector) in [("Cut","x",#selector(NSText.cut(_:))),("Copy","c",#selector(NSText.copy(_:))),("Paste","v",#selector(NSText.paste(_:))),("Select All","a",#selector(NSText.selectAll(_:)))]{edit.addItem(withTitle:title,action:selector,keyEquivalent:key)};command(edit,"Find in Note…","f","find")
        let view=NSMenu(title:"View");let viewItem=NSMenuItem();viewItem.submenu=view;main.addItem(viewItem);command(view,"Actions","k","actions");command(view,"Back","[","back");command(view,"Forward","]","forward");command(view,"Zoom In","=","zoomIn");command(view,"Zoom Out","-","zoomOut");command(view,"Actual Size","0","zoomReset");NSApp.mainMenu=main
    }
    func show(){panel.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true);if loaded{web.evaluateJavaScript("document.querySelector('.tiptap')?.focus()",completionHandler:nil)}}
    func hide(){if loaded{js("flush")};panel.orderOut(nil)}
    func toggle(){if panel.isVisible && panel.isKeyWindow {hide()}else{show()}}
    func windowDidBecomeKey(_ notification:Notification){if loaded{web.evaluateJavaScript("document.documentElement.toggleAttribute('data-window-inactive',false)",completionHandler:nil)}}
    func windowDidResignKey(_ notification:Notification){if loaded{web.evaluateJavaScript("document.documentElement.toggleAttribute('data-window-inactive',true)",completionHandler:nil)}}
    func windowWillStartLiveResize(_ notification:Notification){
        manualResizeActive=true;settings["autoSize"]=false
        if loaded{js("manualResize")}
    }
    func windowDidEndLiveResize(_ notification:Notification){
        manualResizeActive=false;settings["autoSize"]=false
        if loaded{js("manualResize")};writeWindowAudit()
    }
    func windowDidResize(_ notification:Notification){
        if isTest{resizeEvents.append(["x":panel.frame.minX,"y":panel.frame.minY,"width":panel.frame.width,"height":panel.frame.height]);writeWindowAudit()}
    }
    func windowShouldClose(_ sender:NSWindow)->Bool{hide();return false}
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool{show();return true}
    func application(_ application:NSApplication,open urls:[URL]){if !loaded{pendingURLs += urls}else{urls.forEach(handleURL)}}
    func handleURL(_ url:URL){if url.isFileURL{importURLs([url]);return};guard url.scheme=="liltnotes" else{return};show();switch url.host {case "note":js("openNote",[url.lastPathComponent]);case "new":let content=URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name=="text"})?.value ?? "";js("action",["new",["markdown":content]]);case "search":js("action",["browse"]);default:break}}
    func js(_ method:String,_ arguments:[Any]=[],completion:((Any?,Error?)->Void)?=nil){guard JSONSerialization.isValidJSONObject(arguments),let data=try? JSONSerialization.data(withJSONObject:arguments,options:[.fragmentsAllowed]),let json=String(data:data,encoding:.utf8)else{return};web.evaluateJavaScript("window.Lilt?.\(method)(...\(json))",completionHandler:completion)}
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
        guard message.frameInfo.isMainFrame,let body=message.body as? [String:Any],let type=body["type"] as? String else{return}
        switch type {
        case "ready":loaded=true;if let data=latestData,let object=try? JSONSerialization.jsonObject(with:data){js("init",[object])};pendingURLs.forEach(handleURL);pendingURLs=[];if vault.recoveredBackup{js("toast",["Recovered your previous saved library"])};runUIAuditIfRequested();runIntegrationAuditIfRequested();runWindowSizingAuditIfRequested()
        case "save":guard let library=body["library"],let data=try? JSONSerialization.data(withJSONObject:library),let revision=body["revision"] as? Int else{return};latestData=data;latestRevision=revision;persist(data,revision:revision)
        case "settings":if let s=body["settings"] as? [String:Any]{applySettings(s)}
        case "resize":if settings["autoSize"] as? Bool != false,!manualResizeActive,!panel.inLiveResize,!overlayOpen,let h=body["height"] as? Double {resize(height:h)}
        case "overlay":overlayOpen=body["open"] as? Bool == true;closeButton.isHidden=overlayOpen;writeWindowAudit()
        case "hide":panel.orderOut(nil)
        case "quit":NSApp.terminate(nil)
        case "recordShortcut":if let request=body["requestId"] as? String{shortcutRecording=request;hotkeys.forEach{UnregisterEventHotKey($0)};hotkeys=[]}
        case "cancelShortcutRecording":cancelShortcutRecording()
        case "setNoteShortcut":setNoteShortcut(body)
        case "write":startWriting(body)
        case "cancelWriting":if body["id"] as? String == writingRequestID {writingTask?.cancel();writingTask=nil;writingRequestID=nil}
        case "copy":if let text=body["text"] as? String{NSPasteboard.general.clearContents();NSPasteboard.general.setString(text,forType:.string)}
        case "export":exportFile(name:body["filename"] as? String ?? "Note.md",content:body["content"] as? String ?? "")
        case "import":let dialog=NSOpenPanel();dialog.allowedContentTypes=[.plainText,.html,UTType(filenameExtension:"md") ?? .plainText];dialog.allowsMultipleSelection=true;if isTest {dialog.directoryURL=directory.deletingLastPathComponent()};dialog.beginSheetModal(for:panel){if $0 == .OK{self.importURLs(dialog.urls)}}
        case "image":chooseImage()
        case "share":if let text=body["text"] as? String {let picker=NSSharingServicePicker(items:[text]);picker.show(relativeTo:NSRect(x:panel.contentView!.bounds.width-35,y:20,width:10,height:10),of:panel.contentView!,preferredEdge:.minY)}
        case "openURL":if let value=body["url"] as? String,let url=URL(string:value),["https","http","mailto","liltnotes"].contains(url.scheme?.lowercased() ?? ""){NSWorkspace.shared.open(url)}
        case "importBackup":importBackup()
        case "chooseSync":chooseSync()
        case "showNotesFolder":if let folder=syncFolder{NSWorkspace.shared.open(folder)}
        case "useICloud":chooseSync(defaultFolder:iCloudNotesFolder)
        case "loginSettings":configureLogin()
        case "error":showError(body["message"] as? String ?? "Unknown error")
        default:break
        }
    }
    func startWriting(_ body:[String:Any]) {
        guard let id=body["id"] as? String,let text=body["text"] as? String,let instruction=body["instruction"] as? String,!text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,!instruction.isEmpty,instruction.count<=1000 else{return}
        writingTask?.cancel();writingRequestID=id
        let summary=body["summary"] as? Bool == true
        writingTask=Task { @MainActor [weak self] in
            guard let self=self else{return}
            do {
                let output=try await WritingAssistant.rewrite(text,instruction:instruction,summary:summary){ [weak self] completed,total in
                    Task { @MainActor in guard let self=self,self.writingRequestID==id else{return};self.js("writingProgress",[id,completed,total]) }
                }
                guard !Task.isCancelled,self.writingRequestID==id else{return}
                self.js("writingResult",[id,output,NSNull()])
            }catch{
                guard !Task.isCancelled,self.writingRequestID==id else{return}
                self.js("writingResult",[id,NSNull(),WritingAssistant.message(for:error)])
            }
            if self.writingRequestID==id{self.writingRequestID=nil;self.writingTask=nil}
        }
    }
    func persist(_ data:Data,revision:Int){saveQueue.async{do{try self.vault.save(data);DispatchQueue.main.async{self.storeError=nil;self.js("saved",[revision]);self.syncNow()}}catch{DispatchQueue.main.async{self.storeError=error;self.js("error",[error.localizedDescription])}}}}
    func applySettings(_ s:[String:Any]){settings=s;panel.level=(s["alwaysOnTop"] as? Bool != false) ? .floating : .normal;let theme=s["theme"] as? String ?? "system";panel.appearance=theme=="dark" ? NSAppearance(named:.darkAqua):theme=="light" ? NSAppearance(named:.aqua):nil;let mode=s["hotkey"] as? String ?? "option";if shortcutRecording==nil && shortcutConfiguration(mode) != hotkeyConfiguration {registerHotkeys(mode)};let folder=(s["syncPath"] as? String).map{URL(fileURLWithPath:$0,isDirectory:true)};if folder?.path != syncFolder?.path || !syncAuthorized{restoreFolderAccess(folder)};if !isTest,folder != nil,!syncAuthorized,!requestedFolderAccess{requestedFolderAccess=true;DispatchQueue.main.async{self.chooseSync(defaultFolder:folder)}}}
    func resize(height:Double){let screen=panel.screen ?? NSScreen.main;let maxHeight=min(780,screen?.visibleFrame.height ?? 780);let h=max(240,min(maxHeight,height));let frame=panel.frame;if abs(frame.height-h)>2 {var next=NSRect(x:frame.minX,y:frame.maxY-h,width:frame.width,height:h);if let area=screen?.visibleFrame {next.origin.y=max(area.minY,min(next.origin.y,area.maxY-h))};panel.setFrame(next,display:true,animate:false)}}
    func shortcutConfiguration(_ mode:String)->String {
        let notes=settings["noteHotkeys"] as? [String:[String:Any]] ?? [:]
        return mode+((try? JSONSerialization.data(withJSONObject:notes,options:.sortedKeys))?.base64EncodedString() ?? "")
    }
    func carbonModifiers(_ flags:NSEvent.ModifierFlags)->UInt32 {
        var result:UInt32=0
        if flags.contains(.command){result |= UInt32(cmdKey)};if flags.contains(.control){result |= UInt32(controlKey)}
        if flags.contains(.option){result |= UInt32(optionKey)};if flags.contains(.shift){result |= UInt32(shiftKey)}
        return result
    }
    func performShortcut(_ target:String) {
        if target=="toggle"{toggle()}else{show();if target.hasPrefix("note:"){js("openNote",[String(target.dropFirst(5))])}else{js("action",[target])}}
    }
    func applicationDidResignActive(_ notification:Notification){if let request=shortcutRecording{cancelShortcutRecording();js("shortcutRecorded",[request,NSNull()])}}
    func cancelShortcutRecording(){guard shortcutRecording != nil else{return};shortcutRecording=nil;registerHotkeys(settings["hotkey"] as? String ?? "option")}
    func installLocalHotkeys(){localKeyMonitor=NSEvent.addLocalMonitorForEvents(matching:.keyDown){[weak self] event in
        guard let self=self else{return event}
        let flags=event.modifierFlags.intersection([.command,.control,.option,.shift]),mods=self.carbonModifiers(flags)
        if let request=self.shortcutRecording {
            if event.keyCode==UInt16(kVK_Escape){self.cancelShortcutRecording();self.js("shortcutRecorded",[request,NSNull()]);return nil}
            if event.keyCode==UInt16(kVK_Tab) && mods==0{self.cancelShortcutRecording();self.js("shortcutRecorded",[request,NSNull()]);return event}
            guard mods&UInt32(cmdKey|controlKey|optionKey) != 0 else{self.js("toast",["Include Command, Control, or Option in the shortcut"]);return nil}
            let names:[UInt16:String]=[UInt16(kVK_Space):"Space",UInt16(kVK_Return):"↵",UInt16(kVK_Delete):"⌫",UInt16(kVK_ForwardDelete):"⌦",UInt16(kVK_LeftArrow):"←",UInt16(kVK_RightArrow):"→",UInt16(kVK_UpArrow):"↑",UInt16(kVK_DownArrow):"↓",UInt16(kVK_Tab):"⇥"]
            let functionKeys:[UInt16]=[UInt16(kVK_F1),UInt16(kVK_F2),UInt16(kVK_F3),UInt16(kVK_F4),UInt16(kVK_F5),UInt16(kVK_F6),UInt16(kVK_F7),UInt16(kVK_F8),UInt16(kVK_F9),UInt16(kVK_F10),UInt16(kVK_F11),UInt16(kVK_F12),UInt16(kVK_F13),UInt16(kVK_F14),UInt16(kVK_F15),UInt16(kVK_F16),UInt16(kVK_F17),UInt16(kVK_F18),UInt16(kVK_F19),UInt16(kVK_F20)]
            let key=names[event.keyCode] ?? functionKeys.firstIndex(of:event.keyCode).map{"F\($0+1)"} ?? event.characters(byApplyingModifiers:[])?.uppercased() ?? String(event.keyCode)
            let label=(flags.contains(.control) ? "⌃ ":"")+(flags.contains(.option) ? "⌥ ":"")+(flags.contains(.shift) ? "⇧ ":"")+(flags.contains(.command) ? "⌘ ":"")+key
            let value:[String:Any]=["keyCode":Int(event.keyCode),"modifiers":Int(mods),"label":label]
            self.cancelShortcutRecording();self.js("shortcutRecorded",[request,value]);return nil
        }
        guard self.hotkeysEnabled,self.hotkeyMode != "none",let binding=self.hotkeyBindings.first(where:{$0.keyCode==UInt32(event.keyCode) && $0.modifiers==mods}),self.hotkeyFailures[binding.target]==nil else{return event}
        if !event.isARepeat{self.performShortcut(binding.target)};return nil
    }}
    func registerHotkeys(_ mode:String){
        hotkeys.forEach{UnregisterEventHotKey($0)};hotkeys=[];hotkeyFailures=[:];hotkeyMode=mode;hotkeyConfiguration=shortcutConfiguration(mode)
        hotkeyBindings=ShortcutPlan.bindings(mode:mode,notes:ShortcutPlan.notes(settings))
        if handler==nil {var spec=EventTypeSpec(eventClass:OSType(kEventClassKeyboard),eventKind:UInt32(kEventHotKeyPressed));InstallEventHandler(GetEventDispatcherTarget(),{_,event,userData in
            guard let event=event,let userData=userData else{return OSStatus(eventNotHandledErr)}
            var id=EventHotKeyID();GetEventParameter(event,EventParamName(kEventParamDirectObject),EventParamType(typeEventHotKeyID),nil,MemoryLayout<EventHotKeyID>.size,nil,&id)
            let app=Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
            guard let target=app.hotkeyBindings.first(where:{$0.id==id.id})?.target else{return noErr}
            DispatchQueue.main.async{if app.isTest{app.receivedHotkeys.append(id.id)};app.performShortcut(target)};return noErr
        },1,&spec,Unmanaged.passUnretained(self).toOpaque(),&handler)}
        guard hotkeysEnabled else{return}
        for binding in hotkeyBindings {
            var ref:EventHotKeyRef?
            let result=RegisterEventHotKey(binding.keyCode,binding.modifiers,EventHotKeyID(signature:0x4c494c54,id:binding.id),GetEventDispatcherTarget(),OptionBits(kEventHotKeyExclusive),&ref)
            if result==noErr,let ref=ref{hotkeys.append(ref)}else{hotkeyFailures[binding.target]=result}
        }
        if !hotkeyFailures.isEmpty{js("toast",["A shortcut is already in use. Choose another shortcut in Settings or Set Note Shortcut."])}
    }
    func setNoteShortcut(_ body:[String:Any]) {
        guard let noteID=body["noteId"] as? String else{return}
        let mode=settings["hotkey"] as? String ?? "option",previous=settings["noteHotkeys"] as? [String:[String:Any]] ?? [:]
        var next=previous
        if let data=body["shortcut"] as? [String:Any] {
            guard let shortcut=NoteShortcut(dictionary:data),!ShortcutPlan.hasConflict(shortcut,noteID:noteID,mode:mode,notes:ShortcutPlan.notes(settings)) else{js("noteShortcutResult",[noteID,NSNull(),"This shortcut is already used or is invalid"]);return}
            next[noteID]=shortcut.dictionary
        }else{next.removeValue(forKey:noteID)}
        settings["noteHotkeys"]=next;registerHotkeys(mode)
        if hotkeyFailures["note:"+noteID] != nil {settings["noteHotkeys"]=previous;registerHotkeys(mode);js("noteShortcutResult",[noteID,NSNull(),"This shortcut is used by another app. Choose another combination."]);return}
        js("noteShortcutResult",[noteID,next[noteID] as Any? ?? NSNull(),NSNull()])
    }
    func exportFile(name:String,content:String){let dialog=NSSavePanel();dialog.nameFieldStringValue=name;dialog.canCreateDirectories=true;if isTest {dialog.directoryURL=directory.deletingLastPathComponent()};dialog.beginSheetModal(for:panel){response in guard response == .OK,let url=dialog.url else{return};do{try content.write(to:url,atomically:true,encoding:.utf8);self.js("toast",["Exported \(url.lastPathComponent)"])}catch{self.showError(error.localizedDescription)}}}
    func importURLs(_ urls:[URL]){var notes:[[String:String]]=[];for url in urls{do{let text=try String(contentsOf:url,encoding:.utf8);notes.append([url.pathExtension.lowercased()=="html" ? "html":"markdown":text])}catch{showError("Could not import \(url.lastPathComponent): \(error.localizedDescription)")}};if !notes.isEmpty{show();js("importNotes",[notes])}}
    func chooseImage(){let dialog=NSOpenPanel();dialog.allowedContentTypes=[.png,.jpeg,.gif,.webP,.tiff];dialog.beginSheetModal(for:panel){response in guard response == .OK,let url=dialog.url else{return};do{let data=try Data(contentsOf:url);guard data.count<=8*1024*1024 else{self.showError("Choose an image smaller than 8 MB.");return};let mime=UTType(filenameExtension:url.pathExtension)?.preferredMIMEType ?? "image/png";self.js("insertImage",["data:\(mime);base64,\(data.base64EncodedString())",url.lastPathComponent])}catch{self.showError(error.localizedDescription)}}}
    func importBackup(){let dialog=NSOpenPanel();dialog.allowedContentTypes=[.json];dialog.beginSheetModal(for:panel){response in guard response == .OK,let url=dialog.url else{return};do{let value=try Vault.validate(Data(contentsOf:url));self.js("importBackup",[value])}catch{self.showError(error.localizedDescription)}}}
    var folderBookmarkFile:URL {directory.appendingPathComponent("notes-folder.bookmark")}
    func restoreFolderAccess(_ folder:URL?){
        scopedNotesFolder?.stopAccessingSecurityScopedResource();scopedNotesFolder=nil;syncFolder=folder;syncAuthorized=isTest
        guard let folder=folder else{return}
        if let data=try? Data(contentsOf:folderBookmarkFile){var stale=false
            if let resolved=try? URL(resolvingBookmarkData:data,options:[.withSecurityScope,.withoutUI],relativeTo:nil,bookmarkDataIsStale:&stale),resolved.standardizedFileURL.path==folder.standardizedFileURL.path {
                _ = resolved.startAccessingSecurityScopedResource();scopedNotesFolder=resolved;syncFolder=resolved;syncAuthorized=true
                if stale,let refreshed=try? resolved.bookmarkData(options:.withSecurityScope,includingResourceValuesForKeys:nil,relativeTo:nil){try? refreshed.write(to:folderBookmarkFile,options:.atomic)}
            }
        }
    }
    func chooseSync(defaultFolder:URL?=nil){
        let dialog=NSOpenPanel();dialog.canChooseDirectories=true;dialog.canChooseFiles=false;dialog.canCreateDirectories=true
        dialog.directoryURL=defaultFolder ?? syncFolder ?? iCloudNotesFolder
        dialog.prompt="Use Notes Folder";dialog.message="Choose your notes folder. Lilt saves each note here as Markdown so you can open it on other devices."
        dialog.beginSheetModal(for:panel){if $0 == .OK,let url=dialog.url{
            do{
                let bookmark=try url.bookmarkData(options:.withSecurityScope,includingResourceValuesForKeys:nil,relativeTo:nil)
                try bookmark.write(to:self.folderBookmarkFile,options:.atomic)
                self.scopedNotesFolder?.stopAccessingSecurityScopedResource()
                _ = url.startAccessingSecurityScopedResource();self.scopedNotesFolder=url;self.syncFolder=url;self.syncAuthorized=true
                self.js("syncPath",[url.path]);self.syncNow()
            }catch{self.showError("Could not remember the notes folder: \(error.localizedDescription)")}
        }}
    }
    func syncNow(){
        guard syncAuthorized,let folder=syncFolder,let data=latestData,!syncRunning else{return}
        syncRunning=true;let revisionAtStart=latestRevision
        DispatchQueue.main.asyncAfter(deadline:.now()+6){if self.syncRunning{self.js("syncStatus",["Saved on this Mac · iCloud pending"])}}
        cloudQueue.async{do{
            let merged=try self.sync.exchange(library:data,folder:folder)
            DispatchQueue.main.async{
                self.syncRunning=false;self.lastSyncError=nil
                if let merged=merged,let value=try? JSONSerialization.jsonObject(with:merged){self.js("merge",[value])}
                else if revisionAtStart != self.latestRevision{self.syncNow()}
                else{self.js("syncStatus",[folder.path==self.iCloudNotesFolder.path ? "Saved to iCloud Drive":"Saved to notes folder"])}
            }
        }catch{DispatchQueue.main.async{
            self.syncRunning=false
            let message="Could not save to notes folder: \(error.localizedDescription)"
            self.js("syncStatus",["Saved on this Mac; folder unavailable"])
            if self.lastSyncError != message {self.lastSyncError=message;self.js("toast",[message])}
        }}}
    }
    func configureLogin(){if #available(macOS 13.0,*){let service=SMAppService.mainApp;do{if service.status == .enabled{try service.unregister();js("toast",["Open at login disabled"])}else{try service.register();if service.status == .requiresApproval{SMAppService.openSystemSettingsLoginItems()}else{js("toast",["Open at login enabled"])}}}catch{showError("Could not change login setting: \(error.localizedDescription)")}}}
    func showError(_ message:String){let alert=NSAlert();alert.messageText="Lilt Notes";alert.informativeText=message;alert.beginSheetModal(for:panel,completionHandler:nil)}
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){if navigationAction.navigationType == .linkActivated {if let url=navigationAction.request.url,["https","http","mailto","liltnotes"].contains(url.scheme ?? ""){NSWorkspace.shared.open(url)};decisionHandler(.cancel)}else if navigationAction.request.url?.isFileURL==true || navigationAction.request.url?.absoluteString=="about:blank"{decisionHandler(.allow)}else{decisionHandler(.cancel)}}
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView){writingTask?.cancel();writingTask=nil;writingRequestID=nil;loaded=false;web.reload()}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {writingTask?.cancel();guard loaded else{return .terminateNow};js("flush",[],completion:{value,error in if let error=error {self.showError("Could not collect your latest edits: \(error.localizedDescription)");NSApp.reply(toApplicationShouldTerminate:false);return};let data=(value as? String)?.data(using:.utf8) ?? self.latestData;self.saveQueue.async{do{if let data=data{try self.vault.save(data)};DispatchQueue.main.async{self.syncNow();self.finishTermination(deadline:Date().addingTimeInterval(3))}}catch{DispatchQueue.main.async{self.showError("Could not save your notes: \(error.localizedDescription)");NSApp.reply(toApplicationShouldTerminate:false)}}}});return .terminateLater}
    func finishTermination(deadline:Date){
        if !syncRunning || Date()>=deadline{NSApp.reply(toApplicationShouldTerminate:true)}
        else{DispatchQueue.main.asyncAfter(deadline:.now()+0.1){self.finishTermination(deadline:deadline)}}
    }
    func runUIAuditIfRequested(){guard isTest,let i=args.firstIndex(of:"--ui-audit"),i+1<args.count else{return};let output=URL(fileURLWithPath:args[i+1]);DispatchQueue.main.asyncAfter(deadline:.now()+1){
        let script="""
        return await (async () => { const settle=()=>new Promise(resolve=>setTimeout(resolve,180));const e=Lilt.editor; const md='# Native audit\\n\\n**Bold** and *italic* and ~~strike~~ and `code`\\n\\n- [ ] Task one\\n- [x] Task two\\n\\n1. First\\n2. Second\\n\\n> Quote\\n\\n```swift\\nlet value = 42\\n```\\n\\n| A | B |\\n|---|---|\\n| 1 | 2 |\\n'; e.commands.setContent(md,{contentType:'markdown'}); const html=e.getHTML(); Lilt.action('actions'); await settle();const panel=document.querySelector('#overlay'),bounds=panel.getBoundingClientRect(); const palette={width:bounds.width,height:bounds.height,searchHeight:panel.querySelector('.overlay-head').getBoundingClientRect().height,rowHeight:panel.querySelector('.row').getBoundingClientRect().height,cornerRadius:getComputedStyle(panel).borderRadius,searchVisible:!!document.querySelector('#overlay-search'),actionCount:panel.querySelectorAll('[data-index]').length}; Lilt.action('copyMenu');await settle();const copyBounds=panel.getBoundingClientRect();const copyMenu={width:copyBounds.width,height:copyBounds.height,labels:[...panel.querySelectorAll('.row .name')].map(n=>n.textContent)};Lilt.action('browse');await settle();const browseBounds=panel.getBoundingClientRect();const browseMenu={width:browseBounds.width,height:browseBounds.height};Lilt.action('closeOverlay'); return {materials:{glass:CSS.supports('-apple-visual-effect','-apple-system-glass-material'),controls:CSS.supports('-apple-visual-effect','-apple-system-glass-material-media-controls'),command:getComputedStyle(panel,'::before').getPropertyValue('-apple-visual-effect'),toolbar:getComputedStyle(document.querySelector('.toolbar'),'::before').getPropertyValue('-apple-visual-effect')},palette,copyMenu,browseMenu,typography:{body:getComputedStyle(document.body).fontFamily,heading:getComputedStyle(e.view.dom.querySelector('h1')).fontSize,code:getComputedStyle(e.view.dom.querySelector('pre code')).fontFamily,codeCorner:getComputedStyle(e.view.dom.querySelector('.code-block')).borderRadius,interLoaded:document.fonts.check('13px Inter')},codeLanguage:!!e.view.dom.querySelector('select[aria-label=\"Code language\"]'),codeCopy:!!e.view.dom.querySelector('.copy-code'),heading:html.includes('<h1>'),bold:html.includes('<strong>'),italic:html.includes('<em>'),strike:html.includes('<s>'),code:html.includes('<code>'),tasks:html.includes('taskList'),checked:html.includes('data-checked=\"true\"'),ordered:html.includes('<ol>'),quote:html.includes('<blockquote>'),codeBlock:html.includes('<pre>'),table:html.includes('<table'),markdown:e.getMarkdown(),editable:e.isEditable,body:e.getText()}; })()
        """
        self.web.callAsyncJavaScript(script,arguments:[:],in:nil,in:.page){result in let value:Any?,error:Error?;switch result{case .success(let resultValue):value=resultValue;error=nil;case .failure(let resultError):value=nil;error=resultError};var report=value as? [String:Any] ?? [:];report["error"]=error?.localizedDescription ?? NSNull();report["noteCornerRadius"]=self.panel.contentView?.layer?.cornerRadius ?? 0;report["storageFile"]=self.vault.file.lastPathComponent;report["floating"]=self.panel.level == .floating;report["allSpaces"]=self.panel.collectionBehavior.contains(.canJoinAllSpaces);report["fullScreenAuxiliary"]=self.panel.collectionBehavior.contains(.fullScreenAuxiliary);report["hidesOnDeactivate"]=self.panel.hidesOnDeactivate;report["visible"]=self.panel.isVisible;if let data=try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:output)}
        }
    }}
}

let app=NSApplication.shared
let delegate=AppDelegate()
app.delegate=delegate
app.run()
