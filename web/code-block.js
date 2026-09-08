import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {common,createLowlight} from 'lowlight';
import {TextSelection} from '@tiptap/pm/state';

const lowlight=createLowlight(common);
const labels={plaintext:'Plain Text',javascript:'JavaScript',typescript:'TypeScript',json:'JSON',xml:'HTML / XML',css:'CSS',cpp:'C++',csharp:'C#',bash:'Shell',sql:'SQL',php:'PHP',objectivec:'Objective-C'};
export const languages=['plaintext',...lowlight.listLanguages().sort()];

export const LiltCodeBlock=CodeBlockLowlight.extend({
 addOptions(){return {...this.parent?.(),lowlight,onCopy:null};},
 addNodeView(){return ({node,editor,getPos})=>{
  let current=node;
  const dom=document.createElement('div');dom.className='code-block';
  const toolbar=document.createElement('div');toolbar.className='code-toolbar';toolbar.contentEditable='false';
  const copy=document.createElement('button');copy.type='button';copy.className='copy-code';copy.setAttribute('aria-label','Copy code');copy.title='Copy code';copy.textContent='Copy';
  const select=document.createElement('select');select.setAttribute('aria-label','Code language');
  for(const language of languages){const option=document.createElement('option');option.value=language;option.textContent=labels[language]||language[0].toUpperCase()+language.slice(1);select.append(option);}
  function updateLanguage(){const language=current.attrs.language||'plaintext';if(![...select.options].some(o=>o.value===language)){const option=document.createElement('option');option.value=language;option.textContent=language;select.append(option);}select.value=language;}
  updateLanguage();
  copy.addEventListener('mousedown',event=>event.preventDefault());
  copy.addEventListener('click',()=>this.options.onCopy?.(current.textContent));
  select.addEventListener('change',()=>{const pos=getPos();if(typeof pos==='number')editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,language:select.value==='plaintext'?null:select.value}));});
  toolbar.append(copy,select);
  const pre=document.createElement('pre'),contentDOM=document.createElement('code');pre.append(contentDOM);dom.append(toolbar,pre);
  return {dom,contentDOM,update(next){if(next.type!==current.type)return false;current=next;updateLanguage();return true;},stopEvent:event=>toolbar.contains(event.target),ignoreMutation:mutation=>mutation.type!=='selection'&&!contentDOM.contains(mutation.target)};
 };}
});

export function indentCode(editor,outdent=false){
 const {state}=editor,{$from,$to,from,to}=state.selection;
 if($from.parent.type.name!=='codeBlock'||!$from.sameParent($to))return false;
 if(from===to&&!outdent)return editor.commands.insertContent('  ');
 const start=$from.start(),text=$from.parent.textContent,a=from-start,b=to-start;
 const lineStart=text.lastIndexOf('\n',a-1)+1;
 const edits=[];let offset=lineStart;
 while(offset<=b){if(offset===b&&offset!==lineStart)break;const count=outdent?(text.slice(offset).match(/^(?: {1,2}|\t)/)?.[0].length||0):0;if(!outdent||count)edits.push({pos:start+offset,count});const next=text.indexOf('\n',offset);if(next<0||next>=b)break;offset=next+1;}
 const tr=state.tr;for(const edit of edits.reverse())outdent?tr.delete(edit.pos,edit.pos+edit.count):tr.insertText('  ',edit.pos);
 tr.setSelection(TextSelection.create(tr.doc,tr.mapping.map(from,1),tr.mapping.map(to,1)));
 editor.view.dispatch(tr);return true;
}
