import AppKit
import WebKit

/// Enables WebKit's system materials when this OS exposes them. Kept isolated
/// because this embedder preference is not part of the public WebKit SDK.
enum NativeAppearance {
    static func enableMaterials(_ preferences:WKPreferences)->Bool {
        guard #available(macOS 26.0, *) else{return false}
        let selector=NSSelectorFromString("_setUseSystemAppearance:")
        guard preferences.responds(to:selector),let implementation=preferences.method(for:selector) else{return false}
        typealias Setter = @convention(c) (AnyObject,Selector,Bool)->Void
        let set=unsafeBitCast(implementation,to:Setter.self)
        set(preferences,selector,true)
        return true
    }
}
