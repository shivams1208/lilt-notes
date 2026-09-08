import {TextSelection} from '@tiptap/pm/state';
import {closeHistory} from '@tiptap/pm/history';
import {expandSnippet} from './model.js';

export function insertSnippet(editor,text,range=editor.state.selection){
 const marker='LiltCursor'+crypto.randomUUID().replaceAll('-','');
 const expanded=expandSnippet(text).replace('{cursor}',marker).replaceAll('{cursor}','');
 const literal=editor.isActive('codeBlock')||editor.isActive('code');
 const parsed=literal?null:editor.markdown.parse(expanded);
 const content=literal?{type:'text',text:expanded}:parsed.content?.length===1&&parsed.content[0].type==='paragraph'&&!expanded.includes('\n')?parsed.content[0].content||[]:parsed;
 return editor.chain().command(({tr})=>{closeHistory(tr);return true;})
  .insertContentAt({from:range.from,to:range.to},content)
  .command(({tr})=>{
   let cursor=null;
   tr.doc.descendants((node,pos)=>{if(node.isText&&cursor===null){const index=node.text.indexOf(marker);if(index>=0)cursor=pos+index;}});
   if(cursor!==null){tr.delete(cursor,cursor+marker.length);tr.setSelection(TextSelection.near(tr.doc.resolve(cursor)));}
   return true;
  }).run();
}

export function expandTypedSnippet(editor,snippets,from,to,text){
 if(editor.view.composing||!text)return false;
 const start=editor.state.doc.resolve(from);
 if(!start.parent.isTextblock)return false;
 const before=start.parent.textBetween(0,start.parentOffset,'','\ufffc')+text;
 const snippet=snippets.filter(s=>s.keyword&&before.endsWith(s.keyword))
  .sort((a,b)=>b.keyword.length-a.keyword.length)
  .find(s=>before.length===s.keyword.length||/[\s([{>]/u.test(before[before.length-s.keyword.length-1]));
 if(!snippet)return false;
 // Commit the final typed character separately so Undo restores the full keyword.
 editor.view.dispatch(editor.state.tr.insertText(text,from,to));
 const end=from+text.length;
 insertSnippet(editor,snippet.text,{from:end-snippet.keyword.length,to:end});
 return true;
}
