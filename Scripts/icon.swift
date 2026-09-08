import AppKit
let size=CGSize(width:1024,height:1024)
let image=NSImage(size:size)
image.lockFocus()
let base=NSBezierPath(roundedRect:NSRect(x:40,y:40,width:944,height:944),xRadius:210,yRadius:210)
NSGradient(starting:NSColor(calibratedRed:0.23,green:0.23,blue:0.26,alpha:1),ending:NSColor(calibratedRed:0.1,green:0.1,blue:0.12,alpha:1))!.draw(in:base,angle:90)
let page=NSBezierPath(roundedRect:NSRect(x:244,y:210,width:536,height:620),xRadius:65,yRadius:65)
NSColor(calibratedRed:0.94,green:0.39,blue:0.4,alpha:1).setFill();page.fill()
NSColor.white.withAlphaComponent(0.94).setStroke()
for (i,w) in [350.0,350.0,235.0].enumerated(){let p=NSBezierPath();p.lineWidth=32;p.lineCapStyle = .round;p.move(to:NSPoint(x:337,y:663-Double(i)*114));p.line(to:NSPoint(x:337+w,y:663-Double(i)*114));p.stroke()}
image.unlockFocus()
let root=URL(fileURLWithPath:CommandLine.arguments[1]);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
for n in [16,32,128,256,512]{for scale in [1,2]{let pixels=n*scale;let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!;NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep);image.draw(in:NSRect(x:0,y:0,width:pixels,height:pixels));NSGraphicsContext.restoreGraphicsState();let suffix=scale==2 ? "@2x":"";try rep.representation(using:.png,properties:[:])!.write(to:root.appendingPathComponent("icon_\(n)x\(n)\(suffix).png"))}}
