import AppKit
import WebKit
import ObjectiveC.runtime

/// Enables WebKit's system materials when this OS exposes them. Kept isolated
/// because this embedder preference is not part of the public WebKit SDK.
enum NativeAppearance {
    static func enableMaterials(_ preferences:WKPreferences)->Bool {
        guard #available(macOS 26.0, *) else{return false}
        let selector=NSSelectorFromString("_setUseSystemAppearance:")
        // An OS update can retain the selector but change its calling convention.
        // Only call the known void/bool setter; the editor has a standard CSS fallback.
        guard preferences.responds(to:selector),
              let method=class_getInstanceMethod(type(of:preferences),selector),
              method_getNumberOfArguments(method)==3,
              let valueType=method_copyArgumentType(method,2) else{return false}
        let resultType=method_copyReturnType(method)
        defer{free(resultType);free(valueType)}
        guard String(cString:resultType)=="v",["B","c"].contains(String(cString:valueType)),
              let implementation=preferences.method(for:selector) else{return false}
        typealias Setter = @convention(c) (AnyObject,Selector,Bool)->Void
        let set=unsafeBitCast(implementation,to:Setter.self)
        set(preferences,selector,true)
        return true
    }
}
