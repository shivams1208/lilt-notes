import Foundation
import FoundationModels

@main struct WritingTests {
 static func main() async throws {
  assert(WritingAssistant.cleanOutput("<passage>\nCorrected.\n</passage>",original:"Wrong.")=="Corrected.")
  assert(WritingAssistant.cleanOutput("<passage>Keep</passage>",original:"<passage>Keep</passage>")=="<passage>Keep</passage>")
  let fenced="Before.\n\n```swift\nlet text = \"She go.\"\n```\n\nAfter.\n"
  let unclosed="Text\n~~~python\nprint('unchanged')\n"
  for sample in ["", "\n\n",fenced,unclosed,String(repeating:"👩🏽‍💻 café 中文\n\n",count:1500),String(repeating:"word ",count:2000)] {
   for limit in [1,17,1000] {
    let parts=WritingAssistant.parts(sample,limit:limit)
    assert(parts.map(\.text).joined()==sample,"Chunking must preserve every character")
    assert(parts.allSatisfy{$0.verbatim||$0.text.count<=limit},"Prose must remain bounded")
   }
  }
  assert(WritingAssistant.parts(fenced).filter(\.verbatim).map(\.text).joined()=="```swift\nlet text = \"She go.\"\n```\n")
  assert(WritingAssistant.parts(unclosed).last!.verbatim)
  assert(WritingAssistant.parts(fenced,preserveCode:false).allSatisfy{!$0.verbatim})
  print("Chunk fidelity, Unicode, size limits, and fenced code preservation passed")
#if LILT_MACOS_27_SDK
  if #available(macOS 27.0, *) {
   let cases:[(Error,String)]=[
    (LanguageModelError.contextSizeExceeded(.init(contextSize:4096,tokenCount:5000,debugDescription:"private model detail")),"shorter section"),
    (LanguageModelError.rateLimited(.init(resetDate:nil,debugDescription:"private model detail")),"busy"),
    (LanguageModelError.timeout(.init(debugDescription:"private model detail")),"too long"),
    (LanguageModelError.guardrailViolation(.init(debugDescription:"private model detail")),"different selection"),
    (LanguageModelError.refusal(.init(explanation:"private detail",debugDescription:"private model detail")),"different selection"),
    (LanguageModelError.unsupportedLanguageOrLocale(.init(languageCode:.init("zz"),debugDescription:"private model detail")),"another language"),
    (SystemLanguageModel.Error.assetsUnavailable(.init(debugDescription:"private model detail")),"not ready"),
    (LanguageModelSession.Error.concurrentRequests,"busy"),
    (LanguageModelSession.Error.transcriptMutationWhileResponding,"busy")
   ]
   for(error,expected) in cases {
    let message=WritingAssistant.message(for:error)
    assert(message.contains(expected) && !message.contains("private"),"macOS 27 errors need actionable messages")
   }
   print("macOS 27 model and session error compatibility passed")
  }
#endif
  assert(WritingAssistant.message(for:CancellationError()).contains("cancelled"))
  guard CommandLine.arguments.contains("--live") else{return}
  if let reason=WritingAssistant.unavailableReason{throw WritingError.unavailable(reason)}
  let grammar=try await WritingAssistant.rewrite("# Meeting\n\nShe go to the store yesterday. We has three meeting tomorow.\n\n```swift\nlet text = \"She go.\"\n```\n",instruction:"Correct spelling and grammar. Make only necessary changes.",summary:false){_,_ in}
  assert(grammar.contains("```swift\nlet text = \"She go.\"\n```\n"))
  assert(grammar.lowercased().contains("went")&&grammar.lowercased().contains("tomorrow"))
  let translation=try await WritingAssistant.rewrite("Good morning, Maria.",instruction:"Translate into Spanish. Preserve names.",summary:false){_,_ in}
  assert(translation.contains("Maria")||translation.contains("María"))
  let summary=try await WritingAssistant.rewrite("The design review is on Tuesday. Maria will send the draft on Monday. The team approved a budget of $200.",instruction:"Summarize the key facts.",summary:true){_,_ in}
  assert(summary.contains("200"))
  let cancelled=Task{try Task.checkCancellation();return try await WritingAssistant.rewrite("She go.",instruction:"Fix grammar.",summary:false){_,_ in}}
  cancelled.cancel()
  do{_ = try await cancelled.value;assertionFailure("Cancelled request returned content")}catch is CancellationError{}catch{throw error}
  let report:[String:Any] = ["grammar":grammar,"translation":translation,"summary":summary,"cancellation":true]
  let data=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
  try data.write(to:URL(fileURLWithPath:"build/writing-model-verification.json"))
  print(String(data:data,encoding:.utf8)!)
 }
}
