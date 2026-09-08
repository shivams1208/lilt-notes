import {closeHistory} from '@tiptap/pm/history';

export function writingSnapshot(editor,source){
 if(source){const from=source.selectionStart,to=source.selectionEnd,whole=from===to;return {source:true,whole,from:whole?0:from,to:whole?source.value.length:to,text:whole?source.value:source.value.slice(from,to),original:source.value};}
 const {from,to,empty,$from,$to}=editor.state.selection;
 const selection=editor.state.selection.content().content.toJSON();
 const inline=$from.sameParent($to)&&$from.parent.isTextblock&&$from.parent.type.name!=='codeBlock';
 const selected=inline?{type:'doc',content:[{type:'paragraph',content:$from.parent.cut($from.parentOffset,$to.parentOffset).toJSON().content||[]}]}:{type:'doc',content:selection||[]};
 return {source:false,whole:empty,from,to,text:empty?editor.getMarkdown():editor.markdown.serialize(selected),original:JSON.stringify(editor.getJSON())};
}
export function writingUnchanged(snapshot,editor,source){return snapshot.source?Boolean(source)&&source.value===snapshot.original:!source&&JSON.stringify(editor.getJSON())===snapshot.original;}
export function replaceWriting(snapshot,text,editor,source){
 if(!writingUnchanged(snapshot,editor,source))return false;
 if(snapshot.source){source.focus();source.setSelectionRange(snapshot.from,snapshot.to);if(!source.ownerDocument.execCommand?.('insertText',false,text)){source.setRangeText(text,snapshot.from,snapshot.to,'select');source.dispatchEvent(new Event('input'));}return true;}
 const chain=editor.chain().command(({tr})=>{closeHistory(tr);return true;});
 if(snapshot.whole)chain.setContent(text,{contentType:'markdown'});
 else {const parsed=editor.markdown.parse(text);const content=parsed.content?.length===1&&parsed.content[0].type==='paragraph'?parsed.content[0].content||[]:parsed;chain.insertContentAt({from:snapshot.from,to:snapshot.to},content);}
 chain.focus().run();return true;
}
