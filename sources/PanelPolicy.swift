import AppKit

/// AppKit's ordered-in/key flags can outlive the Space or display a panel was on.
/// A toggle should hide only a panel the user can actually see and type into.
struct PanelVisibility {
    var visible:Bool,key:Bool,onActiveSpace:Bool,unoccluded:Bool
    var appHidden:Bool,miniaturized:Bool,onTargetDisplay:Bool
    var shouldHide:Bool {visible && key && onActiveSpace && unoccluded && !appHidden && !miniaturized && onTargetDisplay}
}

enum PanelPlacement {
    static func targetScreen(frames:[NSRect],pointer:NSPoint,fallback:Int=0)->Int? {
        guard !frames.isEmpty else{return nil}
        return frames.firstIndex(where:{$0.contains(pointer)}) ?? min(max(0,fallback),frames.count-1)
    }
    static func fitted(_ frame:NSRect,to area:NSRect)->NSRect {
        let width=min(frame.width,area.width),height=min(frame.height,area.height)
        // Retain a user's placement on this display; center when arriving from
        // a different/disconnected display, then clamp the complete window.
        let origin=area.intersects(frame) ? frame.origin : NSPoint(x:area.midX-width/2,y:area.midY-height/2)
        return NSRect(x:min(max(origin.x,area.minX),area.maxX-width),
                      y:min(max(origin.y,area.minY),area.maxY-height),width:width,height:height)
    }
}

struct ShortcutPressGate {
    private var down=Set<UInt32>()
    mutating func press(_ key:UInt32,isRepeat:Bool=false)->Bool {
        guard !isRepeat else{return false}
        return down.insert(key).inserted
    }
    mutating func release(_ key:UInt32){down.remove(key)}
    mutating func reset(){down.removeAll()}
}

