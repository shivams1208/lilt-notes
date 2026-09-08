import {Editor, Extension, nodeInputRule} from '@tiptap/core';
import {Selection,TextSelection} from '@tiptap/pm/state';
import {Fragment} from '@tiptap/pm/model';
import {closeHistory} from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
import {TaskList,TaskItem} from '@tiptap/extension-list';
import {Table,TableRow,TableCell,TableHeader} from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import {LiltCodeBlock,indentCode} from './code-block.js';
import {SearchHighlights} from './find.js';
export function plainText(editor){return editor.state.doc.textBetween(0,editor.state.doc.content.size,'\n',node=>node.type.name==='image'?(node.attrs.alt||''):'');}
export function toggleTask(editor){const {$from}=editor.state.selection;for(let depth=$from.depth;depth>0;depth--){const node=$from.node(depth);if(node.type.name==='taskItem'){editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(depth),undefined,{...node.attrs,checked:!node.attrs.checked}));return true;}}return false;}
export function moveBlock(editor,direction){
 if(direction!==-1&&direction!==1)return false;
 const {selection,doc}=editor.state,{$from}=selection;
 let parent,first,last,start;
 if(selection.node){parent=$from.parent;first=last=$from.index();start=selection.from;}
 else{
  let depth=$from.depth;
  while(depth>1&&!['listItem','taskItem'].includes($from.node(depth).type.name))depth--;
  if(!depth)return false;
  const $end=doc.resolve(selection.to>selection.from?selection.to-1:selection.from);
  while(depth>1&&($end.depth<depth-1||$end.node(depth-1)!==$from.node(depth-1)))depth--;
  parent=$from.node(depth-1);first=$from.index(depth-1);last=$end.index(depth-1);start=$from.before(depth);
 }
 const adjacentIndex=direction<0?first-1:last+1;
 if(adjacentIndex<0||adjacentIndex>=parent.childCount)return false;
 const adjacent=parent.child(adjacentIndex),moved=[];
 for(let i=first;i<=last;i++)moved.push(parent.child(i));
 const length=moved.reduce((sum,node)=>sum+node.nodeSize,0),offset=direction*adjacent.nodeSize;
 const from=direction<0?start-adjacent.nodeSize:start,to=start+length+(direction>0?adjacent.nodeSize:0);
 const tr=editor.state.tr.replaceWith(from,to,direction<0?[...moved,adjacent]:[adjacent,...moved]);
 const nextSelection=selection.toJSON();
 if(typeof nextSelection.anchor==='number')nextSelection.anchor+=offset;
 if(typeof nextSelection.head==='number')nextSelection.head+=offset;
 tr.setSelection(Selection.fromJSON(tr.doc,nextSelection));
 editor.view.dispatch(tr.scrollIntoView());editor.commands.focus();return true;
}

const Divider=HorizontalRule.extend({addInputRules(){return [nodeInputRule({find:/^(?:-{3,}|—[-—]+|[-—]+—|_{3,}|\*{3,})\s$/,type:this.type})];}});
function dividerOnEnter(editor){
 const {selection}=editor.state,{$from}=selection;
 if(!selection.empty||$from.parent.type.name!=='paragraph'||$from.parentOffset!==$from.parent.content.size)return false;
 const text=$from.parent.textContent;
 if(!/^-{3,}$/.test(text.replaceAll('—','--')))return false;
 const content=Fragment.fromArray([editor.schema.nodes.horizontalRule.create(),editor.schema.nodes.paragraph.create()]);
 if(!$from.node(-1).canReplace($from.index(-1),$from.index(-1)+1,content))return false;
 return editor.commands.command(({tr,dispatch})=>{
  if(dispatch){const start=$from.before();closeHistory(tr);tr.replaceWith(start,$from.after(),content);tr.setSelection(TextSelection.create(tr.doc,start+2));tr.scrollIntoView();}
  return true;
 });
}
const Keys=Extension.create({name:'liltKeys',priority:1100,addKeyboardShortcuts(){return {
 'Enter':()=>dividerOnEnter(this.editor),
 'Mod-Enter':()=>toggleTask(this.editor),'Mod-e':()=>this.editor.commands.toggleCode(),'Mod-Shift-s':()=>this.editor.commands.toggleStrike(),'Mod-Shift-b':()=>this.editor.commands.toggleBlockquote(),'Mod-Alt-c':()=>this.editor.commands.toggleCodeBlock(),
 'Tab':()=>indentCode(this.editor)||this.editor.commands.sinkListItem(this.editor.isActive('taskItem')?'taskItem':'listItem'),
 'Shift-Tab':()=>indentCode(this.editor,true)||this.editor.commands.liftListItem(this.editor.isActive('taskItem')?'taskItem':'listItem'),
 'Mod-Shift-ArrowUp':()=>moveBlock(this.editor,-1),'Mod-Shift-ArrowDown':()=>moveBlock(this.editor,1)
 ,'Mod-Control-ArrowUp':()=>moveBlock(this.editor,-1),'Mod-Control-ArrowDown':()=>moveBlock(this.editor,1)
};}});
export function createEditor(element,{onCopyCode,...options}={}) {return new Editor({element,extensions:[
StarterKit.configure({codeBlock:false,horizontalRule:false,link:{openOnClick:false,autolink:true,markdownLinks:true,defaultProtocol:'https',protocols:['liltnotes']}}),Divider,
Markdown.configure({markedOptions:{gfm:true}}),TaskList,TaskItem.configure({nested:true,HTMLAttributes:{'data-type':'taskItem'}}),
Table.configure({resizable:false}),TableRow,TableCell,TableHeader,Image.configure({allowBase64:true}),Highlight,
LiltCodeBlock.configure({onCopy:onCopyCode}),Placeholder.configure({placeholder:'Start writing…'}),SearchHighlights,Keys
],editorProps:{attributes:{'aria-label':'Note editor',role:'textbox','aria-multiline':'true',spellcheck:'true'},...options.editorProps},...options});}
