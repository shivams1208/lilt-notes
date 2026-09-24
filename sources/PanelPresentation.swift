import AppKit

extension AppDelegate {
    var targetPresentationScreen:NSScreen? {
        let screens=NSScreen.screens
        guard let index=PanelPlacement.targetScreen(frames:screens.map(\.frame),pointer:NSEvent.mouseLocation) else{return nil}
        return screens[index]
    }
    func panelVisibility(on screen:NSScreen?=nil)->PanelVisibility {
        let area=(screen ?? targetPresentationScreen)?.visibleFrame
        return PanelVisibility(visible:panel.isVisible,key:panel.isKeyWindow,onActiveSpace:panel.isOnActiveSpace,
            unoccluded:panel.occlusionState.contains(.visible),appHidden:NSApp.isHidden,miniaturized:panel.isMiniaturized,
            onTargetDisplay:area.map{$0.contains(panel.frame)} ?? false)
    }
    func presentPanel(on screen:NSScreen?) {
        isPresentingPanel=true
        defer{isPresentingPanel=false}
        if NSApp.isHidden{NSApp.unhideWithoutActivation()}
        if panel.isMiniaturized{panel.deminiaturize(nil)}
        if let area=screen?.visibleFrame {
            let fitted=PanelPlacement.fitted(panel.frame,to:area)
            if fitted != panel.frame{panel.setFrame(fitted,display:true,animate:false)}
        }
        // A normal-level panel can remain behind another app's full-screen
        // window. Float while summoned; restore the preference when focus leaves.
        panel.level = .floating
        if panel.isVisible && (!panel.isOnActiveSpace || !panel.occlusionState.contains(.visible)) {panel.orderOut(nil)}
        panel.orderFrontRegardless();panel.makeKey()
    }
    func show(){
        let screen=targetPresentationScreen
        presentationGeneration += 1
        let generation=presentationGeneration
        presentationDeadline=ProcessInfo.processInfo.systemUptime+1.2
        presentationOwner=NSWorkspace.shared.frontmostApplication?.processIdentifier
        presentPanel(on:screen)
        if loaded{web.evaluateJavaScript("(document.querySelector('#overlay:not([hidden]) #overlay-search') || document.querySelector('#source:not([hidden])') || document.querySelector('.tiptap'))?.focus()",completionHandler:nil)}
        recordPresentation("show")
        // Space animations may accept the first order request before the new
        // Space can display the panel. Never retry after Hide or a focus change.
        for delay in [0.15,0.45,0.9] {
            DispatchQueue.main.asyncAfter(deadline:.now()+delay){[weak self] in self?.retryPresentation(generation,on:screen)}
        }
    }
    func retryPresentation(_ generation:Int,on screen:NSScreen?) {
        guard generation==presentationGeneration,ProcessInfo.processInfo.systemUptime<presentationDeadline else{return}
        let front=NSWorkspace.shared.frontmostApplication?.processIdentifier
        guard front==presentationOwner || front==ProcessInfo.processInfo.processIdentifier else{return}
        let target=NSScreen.screens.first(where:{$0==screen}) ?? targetPresentationScreen
        if !panelVisibility(on:target).shouldHide {presentPanel(on:target)}
        recordPresentation("settled")
    }
    func hide(){
        presentationGeneration += 1;presentationDeadline=0
        if loaded{js("flush")};panel.orderOut(nil)
        panel.level=(settings["alwaysOnTop"] as? Bool != false) ? .floating : .normal
        recordPresentation("hide")
    }
    func toggle(){
        recordPresentation("toggle-before")
        if panelVisibility().shouldHide{hide()}else{show()}
    }
    func installPresentationObservers(){
        let workspace=NSWorkspace.shared.notificationCenter
        workspace.addObserver(self,selector:#selector(presentationSpaceChanged),name:NSWorkspace.activeSpaceDidChangeNotification,object:nil)
        workspace.addObserver(self,selector:#selector(presentationDidWake),name:NSWorkspace.didWakeNotification,object:nil)
        NotificationCenter.default.addObserver(self,selector:#selector(presentationScreensChanged),name:NSApplication.didChangeScreenParametersNotification,object:nil)
    }
    @objc func presentationSpaceChanged(){
        let generation=presentationGeneration
        DispatchQueue.main.asyncAfter(deadline:.now()+0.1){[weak self] in self?.retryPresentation(generation,on:self?.targetPresentationScreen)}
    }
    @objc func presentationDidWake(){
        shortcutPressGate.reset()
        if shortcutRecording==nil{registerHotkeys(settings["hotkey"] as? String ?? "option")}
        presentationScreensChanged()
    }
    @objc func presentationScreensChanged(){
        guard panel.isVisible,!NSScreen.screens.contains(where:{$0.visibleFrame.contains(panel.frame)}),let area=targetPresentationScreen?.visibleFrame else{return}
        panel.setFrame(PanelPlacement.fitted(panel.frame,to:area),display:true,animate:false)
    }
    // Opt-in diagnostics contain window state only, never note contents/titles.
    func recordPresentation(_ action:String){
        guard args.contains("--window-diagnostics") else{return}
        let state=panelVisibility()
        presentationEvents.append(["action":action,"time":Date().timeIntervalSince1970,"visible":state.visible,"key":state.key,
            "onActiveSpace":state.onActiveSpace,"unoccluded":state.unoccluded,"appHidden":state.appHidden,"miniaturized":state.miniaturized,
            "onTargetDisplay":state.onTargetDisplay,"frame":NSStringFromRect(panel.frame),
            "frontmostApp":NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "","registeredHotkeys":hotkeys.count,"shortcutFailures":hotkeyFailures])
        presentationEvents=Array(presentationEvents.suffix(80))
        if let data=try? JSONSerialization.data(withJSONObject:presentationEvents,options:[.prettyPrinted,.sortedKeys]){try? data.write(to:directory.appendingPathComponent("window-diagnostics.json"),options:.atomic)}
    }
}
