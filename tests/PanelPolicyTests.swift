import AppKit

@main struct PanelPolicyTests {
    static func main(){
        var outcomes=0
        for bits in 0..<128 {
            func b(_ n:Int)->Bool{bits & (1<<n) != 0}
            let state=PanelVisibility(visible:b(0),key:b(1),onActiveSpace:b(2),unoccluded:b(3),appHidden:b(4),miniaturized:b(5),onTargetDisplay:b(6))
            let expected=b(0)&&b(1)&&b(2)&&b(3)&&(!b(4))&&(!b(5))&&b(6)
            precondition(state.shouldHide==expected,"An unseen panel must show instead of hide: \(bits)")
            if state.shouldHide{outcomes += 1}
        }
        precondition(outcomes==1)
        let laptop=NSRect(x:0,y:0,width:1512,height:950)
        let left=NSRect(x:-2560,y:0,width:2560,height:1400)
        let above=NSRect(x:0,y:950,width:1920,height:1080)
        let right=NSRect(x:1512,y:-700,width:1920,height:1080)
        let frames=[laptop,left,above,right]
        for (i,area) in frames.enumerated(){
            precondition(PanelPlacement.targetScreen(frames:frames,pointer:NSPoint(x:area.midX,y:area.midY))==i)
            for original in [NSRect(x:200,y:200,width:480,height:480),NSRect(x:-9999,y:9999,width:480,height:480),NSRect(x:1400,y:850,width:600,height:600),NSRect(x:-2500,y:500,width:800,height:700),NSRect(x:0,y:0,width:6000,height:4000)] {
                let fitted=PanelPlacement.fitted(original,to:area)
                precondition(area.contains(fitted),"Repaired window is fully accessible")
                precondition(fitted.width==min(original.width,area.width)&&fitted.height==min(original.height,area.height))
                precondition(PanelPlacement.fitted(fitted,to:area)==fitted,"Repeated summons must not drift or resize")
            }
        }
        precondition(PanelPlacement.targetScreen(frames:[],pointer:.zero)==nil)
        precondition(PanelPlacement.targetScreen(frames:frames,pointer:NSPoint(x:99999,y:99999),fallback:1)==1)
        let normal=NSRect(x:200,y:200,width:480,height:480)
        precondition(PanelPlacement.fitted(normal,to:laptop)==normal)
        var gate=ShortcutPressGate()
        precondition(gate.press(45));for _ in 0..<20 {precondition(!gate.press(45));precondition(!gate.press(45,isRepeat:true))}
        gate.release(45);precondition(gate.press(45));precondition(gate.press(35))
        gate.reset();precondition(gate.press(45));gate.release(45)
        precondition(!gate.press(45,isRepeat:true));precondition(gate.press(45))
        print("PASS: 128 visibility/focus/Space states, 20 display geometries, no placement drift, repeated and held shortcut gating")
    }
}
