import {createIcons,icons} from 'lucide';
import {createEditor,toggleTask,moveBlock,plainText} from './editor.js';
import {EditorState} from '@tiptap/pm/state';
import {findText,literalMatches,highlightMatches,replaceMatches} from './find.js';
import {InlineEmojiPicker} from './inline-emoji.js';
import {insertSnippet,expandTypedSnippet} from './snippets.js';
import {writingSnapshot,writingUnchanged,replaceWriting} from './writing.js';
import emojiData from 'emojibase-data/en/compact.json';
import {initialLibrary,normalizeLibrary,makeNote,isEmptyNote,reusableDraft,noteTitle,searchNotes,comparePins,setPinned,countText,openedDescription,expandSnippet,filename,mergeLibraries} from './model.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shortcut=s=>`<span class="shortcut" aria-label="${esc(s)}">${s.split(' ').map(k=>`<kbd>${esc(k)}</kbd>`).join('')}</span>`;
const icon=n=>n==='note-stack'?'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="4" width="8" height="10" rx="1.5" transform="rotate(-12 7 9)"/><rect x="6" y="2" width="8" height="11" rx="1.5" transform="rotate(9 10 7)"/></svg>':`<i data-lucide="${n}"></i>`, drawIcons=()=>createIcons({icons,attrs:{'aria-hidden':'true'}});
let library=initialLibrary(),loading=true,sourceMode=false,overlayMode='',commandCategory='',selected=0,rows=[],saveTimer,revision=0,history=[],historyIndex=-1,findQuery='',inlineEmoji,resizeRequest,findState={matches:[],active:-1,caseSensitive:false,wholeWord:false};
let localSaveError=false,folderSaveWarning='',shortcutFormState=null,writingState=null;
let pointerPosition=null,keyboardSelecting=false;
const bridge=(type,payload={})=>window.webkit?.messageHandlers?.lilt?.postMessage({type,...payload});
let editor=createEditor($('#editor'),{onCopyCode(text){bridge('copy',{text});toast('Code copied');},onUpdate(){if(loading)return;capture();scheduleSave();updateFooter();updateTitle();autoSize();if(!$('#findbar').hidden)updateFind();maybeEmoji();},onSelectionUpdate(){updateFormat();maybeEmoji();},editorProps:{attributes:{'aria-label':'Note editor',role:'textbox','aria-multiline':'true',spellcheck:'true'},handleTextInput(view,from,to,text){return !loading&&!overlayMode&&library.settings.expandSnippetKeywords!==false&&expandTypedSnippet(editor,library.snippets,from,to,text);},handlePaste(view,event){const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();insertImages(files);return true;}const text=event.clipboardData?.getData('text/plain');const html=event.clipboardData?.getData('text/html');if(text&&!html&&/(^#{1,6} |^[-*] |^\d+\. |^```|\*\*[^*]+\*\*|^> |\[[ x]\]|\[[^\]]+\]\(|^\|)/m.test(text)){editor.commands.insertContent(text,{contentType:'markdown'});return true;}return false;},handleDrop(view,event){const files=[...(event.dataTransfer?.files||[])];if(files.length){event.preventDefault();insertImages(files);return true;}return false;},handleClick(view,pos,event){const link=event.target.closest('a');if(link&&(event.metaKey||!view.editable)){bridge('openURL',{url:link.href});return true;}return false;}}});
function current(){return library.notes.find(n=>n.id===library.currentId);}
function capture({preserveEditedAt=false}={}){const n=current();if(!n||loading||n.deletedAt)return;let markdown,doc,text;if(sourceMode){markdown=$('#source').value;doc=null;text=markdown;}else{markdown=editor.getMarkdown();doc=editor.getJSON();text=plainText(editor);}if(n.markdown!==markdown||JSON.stringify(n.doc)!==JSON.stringify(doc)){Object.assign(n,{markdown,doc,text,title:noteTitle(text),updatedAt:preserveEditedAt?n.updatedAt:Date.now()});}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,140);}
function save(){clearTimeout(saveTimer);capture();revision++;bridge('save',{library,revision});if(!window.webkit){localStorage.setItem('lilt-preview',JSON.stringify(library));saved(revision);}return library;}
function updateSaveStatus(){const status=$('#save-state');status.textContent=localSaveError?'Not saved':folderSaveWarning;status.classList.toggle('visible',Boolean(status.textContent));}
function saved(r){if(r!==revision)return;localSaveError=false;updateSaveStatus();}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,2600);}
function updateTitle(){const n=current();$('#note-title').textContent=n?.title||'Untitled';document.title=(n?.title||'Untitled')+' — Lilt Notes';}
function updateFooter(){const text=sourceMode?$('#source').value:plainText(editor),stats=countText(text),words=library.settings.counterMode==='words',count=words?stats.words:stats.characters;$('#stats').textContent=`${count} ${words?(count===1?'word':'words'):(count===1?'character':'characters')}`;$('#stats').title=`${stats.words} words · ${stats.characters} characters · ${stats.lines} lines. Click to switch count.`;}
function applySettings(){const s=library.settings;s.noteHotkeys=Object.fromEntries(Object.entries(s.noteHotkeys||{}).filter(([id])=>library.notes.some(n=>n.id===id&&!n.deletedAt)));if(!s.syncPath){folderSaveWarning='';updateSaveStatus();}document.documentElement.dataset.theme=s.theme;document.documentElement.style.setProperty('--font-size',14*s.zoom/100+'px');$('#formatbar').hidden=!s.formatbar;editor.view.dom.spellcheck=s.spellcheck;bridge('settings',{settings:s});updateFormat();}
function autoSize(){
 if(!library.settings.autoSize||overlayMode)return;
 cancelAnimationFrame(resizeRequest);
 resizeRequest=requestAnimationFrame(()=>{
  if(!library.settings.autoSize||overlayMode||sourceMode)return;
  const dom=editor.view.dom,last=dom.lastElementChild,style=getComputedStyle(dom);
  const height=(last?last.getBoundingClientRect().bottom-dom.getBoundingClientRect().top:parseFloat(style.paddingTop))+parseFloat(style.paddingBottom);
  const chrome=$('header').offsetHeight+$('footer').offsetHeight+($('#findbar').hidden?0:$('#findbar').offsetHeight);
  bridge('resize',{height:Math.ceil(height+chrome)});
 });
}
window.addEventListener('resize',autoSize);
document.fonts?.ready.then(autoSize);
$('#writing').addEventListener('load',autoSize,true);
function selectNote(id,{record=true}={}){capture();closeFind();const n=library.notes.find(x=>x.id===id&&!x.deletedAt);if(!n)return;loading=true;library.currentId=id;library.settings.noteOpenedAt={...library.settings.noteOpenedAt,[id]:Date.now()};sourceMode=false;$('#source').hidden=true;$('#editor').hidden=false;editor.commands.setContent(n.doc||n.markdown,{contentType:n.doc?'json':'markdown',emitUpdate:false});editor.view.updateState(EditorState.create({schema:editor.schema,doc:editor.state.doc,plugins:editor.state.plugins}));loading=false;capture({preserveEditedAt:true});closeOverlay();if(record){history=history.slice(0,historyIndex+1);if(history.at(-1)!==id)history.push(id);historyIndex=history.length-1;}$('#writing').scrollTop=0;updateTitle();updateFooter();save();editor.commands.focus('end');autoSize();}
function newNote(markdown='',{reuse=true}={}){
 capture();
 const draft=reuse&&markdown===''?reusableDraft(library.notes,library.currentId):null;
 if(draft){if(draft.id===library.currentId&&!sourceMode){closeOverlay();editor.commands.focus('end');}else selectNote(draft.id);return;}
 const note=makeNote(markdown);library.notes.push(note);selectNote(note.id);
}
function historyTarget(delta){for(let i=historyIndex+delta;i>=0&&i<history.length;i+=delta){if(history[i]!==library.currentId&&library.notes.some(n=>n.id===history[i]&&!n.deletedAt))return i;}return -1;}
function navigate(delta){const index=historyTarget(delta);if(index<0){toast('No more notes in history');return;}historyIndex=index;selectNote(history[index],{record:false});}
function init(data){try{library=normalizeLibrary(data||initialLibrary());}catch(e){bridge('error',{message:e.message});return;}loading=true;applySettings();if(!library.notes.some(n=>!n.deletedAt)){newNote();}else{selectNote(library.notes.find(n=>n.id===library.currentId&&!n.deletedAt)?.id||searchNotes(library.notes,'')[0].id);}drawIcons();}
function toggleSource(){inlineEmoji?.close();capture();closeFind();sourceMode=!sourceMode;$('#editor').hidden=sourceMode;$('#source').hidden=!sourceMode;if(sourceMode){$('#source').value=current().markdown;$('#source').focus();}else{loading=true;editor.commands.setContent($('#source').value,{contentType:'markdown',emitUpdate:false});loading=false;capture();editor.commands.focus();}save();toast(sourceMode?'Editing Markdown source':'Rich text editing');}
$('#source').addEventListener('input',()=>{capture();scheduleSave();updateTitle();updateFooter();});
function togglePin(id=library.currentId){const n=library.notes.find(n=>n.id===id);if(!n)return;setPinned(library.notes,n,!n.pinned);n.updatedAt=Date.now();save();updateTitle();toast(n.pinned?'Note pinned':'Note unpinned');}
function trashNote(id=library.currentId){capture();const n=library.notes.find(x=>x.id===id);if(!n)return;n.deletedAt=Date.now();n.updatedAt=Date.now();if(library.settings.noteHotkeys?.[id]){delete library.settings.noteHotkeys[id];applySettings();}if(id===library.currentId){const next=searchNotes(library.notes,'')[0];if(next)selectNote(next.id);else newNote();}save();toast('Moved to Recently Deleted');}
function restoreNote(id){const n=library.notes.find(x=>x.id===id);n.deletedAt=null;n.updatedAt=Date.now();save();selectNote(id);toast('Note restored');}
function noteRepresentation(note=current()){if(!sourceMode && note.id===library.currentId)return {html:editor.getHTML(),text:plainText(editor)};const temporary=createEditor(document.createElement('div'),{content:note.doc||note.markdown,contentType:note.doc?'json':'markdown'});const result={html:temporary.getHTML(),text:plainText(temporary)};temporary.destroy();return result;}
function previewDeleted(note){const rep=noteRepresentation(note);formShell('Recently Deleted',`<p>Deleted ${esc(new Date(note.deletedAt).toLocaleDateString())}</p><div class="deleted-preview tiptap" style="padding:4px 0 16px;min-height:0">${rep.html}</div><button class="primary" id="restore-note">Restore Note</button><button class="secondary" id="purge-note">Delete Permanently…</button>`);$('#overlay').querySelectorAll('input[type=checkbox]').forEach(e=>e.disabled=true);$('#restore-note').onclick=()=>restoreNote(note.id);$('#purge-note').onclick=()=>{formShell('Delete Permanently',`<p>Delete “${esc(note.title)}”? This cannot be undone.</p><button class="primary" id="confirm-purge">Delete Permanently</button><button class="secondary" id="cancel-purge">Cancel</button>`);$('#cancel-purge').onclick=()=>previewDeleted(note);$('#confirm-purge').onclick=()=>{Object.assign(note,{markdown:'',doc:null,text:'',title:'Deleted note',purgedAt:Date.now(),updatedAt:Date.now()});save();browse(true);toast('Note permanently deleted');};};}
function duplicate(){capture();if(isEmptyNote(current()))return;const n={...structuredClone(current()),id:crypto.randomUUID(),pinned:false,createdAt:Date.now(),updatedAt:Date.now()};delete n.pinOrder;library.notes.push(n);selectNote(n.id);toast('Note duplicated');}
function closeOverlay(focus=true){cancelWriting();bridge('cancelShortcutRecording');shortcutFormState=null;inlineEmoji?.close();closeFormatMenu();bridge('overlay',{open:false});$('#overlay').hidden=true;$('#overlay').innerHTML='';delete $('#overlay').dataset.mode;overlayMode='';commandCategory='';rows=[];selected=0;if(focus)(sourceMode?$('#source'):editor.view.dom).focus();}
function overlayShell(mode,placeholder,foot){cancelAnimationFrame(resizeRequest);cancelWriting();inlineEmoji?.close();bridge('overlay',{open:true,mode});overlayMode=mode;selected=0;const el=$('#overlay');el.dataset.mode=mode;el.setAttribute('role','dialog');el.setAttribute('aria-label',mode==='actions'?'Actions':placeholder);el.hidden=false;el.innerHTML=`<div class="overlay-head">${['actions','browse','trash'].includes(mode)?'':icon('command')}<input id="overlay-search" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}" autocomplete="off"><button data-action="closeOverlay" aria-label="Close panel"><kbd>esc</kbd></button></div><div class="overlay-content" id="results"></div><div class="overlay-foot">${foot}</div>`;drawIcons();const input=$('#overlay-search');input.focus();requestAnimationFrame(()=>{if(input.isConnected&&!el.hidden)input.focus();});}
function setRows(next){rows=next;selected=Math.min(selected,Math.max(0,rows.length-1));if(rows[selected]?.disabled)selected=Math.max(0,rows.findIndex(r=>!r.disabled));renderRows();}
function highlightSelectedRow(){
 $('#results')?.querySelectorAll('[data-index]').forEach(el=>el.classList.toggle('selected',Number(el.dataset.index)===selected));
}
function renderRows(){
 const html=rows.map((r,i)=>{
  const divider=r.section?'<div class="command-divider" role="separator"></div>':'';
  const section=r.group&&r.group!==rows[i-1]?.group?`<div class="command-section">${esc(r.group)}</div>`:'';
  if(r.snippet){
   const s=r.snippet;
   return `<div class="row snippet-row ${i===selected?'selected':''}" data-index="${i}" role="group" aria-label="${esc(s.name)}"><button class="snippet-insert" aria-label="Insert ${esc(s.name)}">${icon('braces')}<span class="note-copy"><strong>${esc(s.name)}</strong><small>${esc(s.keyword||s.text.replace(/\s+/g,' ').slice(0,65))}</small></span></button><button class="snippet-edit" data-snippet-edit="${esc(s.id)}" aria-label="Edit ${esc(s.name)}" title="Edit Snippet · ⌘E">${icon('pencil')}</button></div>`;
  }
  if(r.browse){
   const n=r.browse;
   return divider+section+`<div class="row note-row ${i===selected?'selected':''}" data-index="${i}" role="group" aria-label="${esc(n.title)}"><button class="note-open" aria-label="Open ${esc(n.title)}">${r.html}</button><span class="note-accessories"><button data-browse-pin="${esc(n.id)}" aria-label="${n.pinned?'Unpin':'Pin'} ${esc(n.title)}" title="${n.pinned?'Unpin':'Pin'} Note · ⌘.">${icon(n.pinned?'pin-off':'pin')}</button><button data-browse-delete="${esc(n.id)}" aria-label="Delete ${esc(n.title)}" title="Delete Note">${icon('trash-2')}</button></span></div>`;
  }
  return divider+section+(r.html?`<button class="row ${r.className||''} ${i===selected?'selected':''}" data-index="${i}">${r.html}</button>`:`<button ${r.disabled?'disabled aria-disabled="true"':''} class="row ${r.danger?'danger':''} ${i===selected?'selected':''}" data-index="${i}">${icon(r.icon||'file-text')}<span class="name">${esc(r.name)}</span>${r.shortcut?shortcut(r.shortcut):r.submenu&&r.showSubmenuIndicator!==false?icon('chevron-right'):''}</button>`);
 }).join('');
 $('#results').innerHTML=(commandCategory==='Formatting'&&!$('#overlay-search').value?'<div class="command-menu-title">Inline</div>':'')+(html||'<div class="empty">No results found.</div>');drawIcons();
}
function browse(deleted=false){
 capture();overlayShell(deleted?'trash':'browse',deleted?'Search deleted notes…':'Search for notes…','');
 const update=(initial=false)=>{
  const query=$('#overlay-search').value;
  const opened=library.settings.noteOpenedAt||{};
  const notes=searchNotes(library.notes,query,deleted);
  if(!deleted)notes.sort((a,b)=>comparePins(a,b)||(opened[b.id]||b.updatedAt)-(opened[a.id]||a.updatedAt));
  const next=notes.map(n=>{
   const chars=countText(n.text||'').characters;
   const currentNote=n.id===library.currentId;
   const subtitle=deleted?`Deleted ${new Date(n.deletedAt).toLocaleDateString()}`:`${currentNote?'Current':openedDescription(opened[n.id]||n.updatedAt)} • ${chars} ${chars===1?'character':'characters'}`;
   return {html:`<span class="note-copy"><strong>${esc(n.title)}</strong><small>${currentNote&&!deleted?'<span class="current-dot"></span>':''}${esc(subtitle)}</small></span>`,className:'note-row',run:()=>deleted?previewDeleted(n):selectNote(n.id),noteId:n.id,browse:deleted?null:n,group:query?'':(deleted?'Recently Deleted':n.pinned?'Pinned Notes':'Notes')};
  });
  if(initial&&!deleted)selected=Math.max(0,next.findIndex(r=>r.noteId===library.currentId));
  setRows(next);
  if(initial)$(`[data-index="${selected}"]`)?.scrollIntoView({block:'nearest'});
 };
 $('#overlay-search').addEventListener('input',()=>{selected=0;update();});update(true);
}
function browseOperation(id,operation){
 const query=$('#overlay-search')?.value||'';
 const index=selected;
 if(operation==='pin')togglePin(id);else trashNote(id);
 browse();$('#overlay-search').value=query;$('#overlay-search').dispatchEvent(new Event('input'));
 selected=operation==='pin'?Math.max(0,rows.findIndex(r=>r.noteId===id)):Math.min(index,Math.max(0,rows.length-1));
 renderRows();$('#overlay-search').focus();
}
const formats=[
['bold','Bold','bold','⌘ B',()=>editor.chain().focus().toggleBold().run()],['italic','Italic','italic','⌘ I',()=>editor.chain().focus().toggleItalic().run()],['underline','Underline','underline','⌘ U',()=>editor.chain().focus().toggleUnderline().run()],['strike','Strikethrough','strikethrough','⇧ ⌘ S',()=>editor.chain().focus().toggleStrike().run()],['code','Inline Code','code','⌘ E',()=>editor.chain().focus().toggleCode().run()],['link','Link','link','⌘ L',()=>linkForm()],
['removeLink','Remove Link','unlink','',()=>editor.chain().focus().unsetLink().run()],
['heading1','Heading 1','heading-1','⌥ ⌘ 1',()=>editor.chain().focus().toggleHeading({level:1}).run()],['heading2','Heading 2','heading-2','⌥ ⌘ 2',()=>editor.chain().focus().toggleHeading({level:2}).run()],['heading3','Heading 3','heading-3','⌥ ⌘ 3',()=>editor.chain().focus().toggleHeading({level:3}).run()],['paragraph','Paragraph','pilcrow','',()=>editor.chain().focus().setParagraph().run()],
['bulletList','Bullet List','list','⇧ ⌘ 8',()=>editor.chain().focus().toggleBulletList().run()],['orderedList','Numbered List','list-ordered','⇧ ⌘ 7',()=>editor.chain().focus().toggleOrderedList().run()],['taskList','Task List','list-todo','⇧ ⌘ 9',()=>editor.chain().focus().toggleTaskList().run()],['toggleTask','Check / Uncheck Task','check-square','⌘ ↵',()=>toggleTask(editor)],['blockquote','Blockquote','text-quote','⇧ ⌘ B',()=>editor.chain().focus().toggleBlockquote().run()],['codeBlock','Code Block','square-code','⌥ ⌘ C',()=>editor.chain().focus().toggleCodeBlock().run()],['rule','Horizontal Rule','minus','',()=>editor.chain().focus().setHorizontalRule().run()],['highlight','Highlight','highlighter','',()=>editor.chain().focus().toggleHighlight().run()],
['table','Insert Table','table','',()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()],['tableRow','Add Table Row','rows-3','',()=>editor.chain().focus().addRowAfter().run()],['tableColumn','Add Table Column','columns-3','',()=>editor.chain().focus().addColumnAfter().run()],['deleteRow','Delete Table Row','rows-3','',()=>editor.chain().focus().deleteRow().run()],['deleteColumn','Delete Table Column','columns-3','',()=>editor.chain().focus().deleteColumn().run()],['deleteTable','Delete Table','table','',()=>editor.chain().focus().deleteTable().run()],
['indent','Indent List Item','indent-increase','⇥',()=>editor.chain().focus().sinkListItem(editor.isActive('taskItem')?'taskItem':'listItem').run()],['outdent','Outdent List Item','indent-decrease','⇧ ⇥',()=>editor.chain().focus().liftListItem(editor.isActive('taskItem')?'taskItem':'listItem').run()],['moveUp','Move Block Up','arrow-up','⇧ ⌘ ↑',()=>moveBlock(editor,-1)],['moveDown','Move Block Down','arrow-down','⇧ ⌘ ↓',()=>moveBlock(editor,1)]];
const formatGroups={heading:['paragraph','heading1','heading2','heading3'],format:['bold','italic','underline','strike','code','highlight'],list:['bulletList','orderedList','taskList','blockquote','codeBlock','rule']};
function formatActive(id){return id.startsWith('heading')?editor.isActive('heading',{level:Number(id.slice(-1))}):editor.isActive(id);}
function updateFormat(){
 if(!$('#formatbar').children.length){$('#formatbar').innerHTML=`<div class="format-pill" role="toolbar" aria-label="Formatting"><button data-format-group="heading" aria-label="Heading" aria-haspopup="menu" title="Heading">${icon('heading')}${icon('chevron-down')}</button><button data-format-group="format" aria-label="Format" aria-haspopup="menu" title="Format">${icon('text-cursor')}${icon('chevron-down')}</button><button data-format="link" aria-label="Link" title="Link · ⌘ L">${icon('link')}</button><button data-format="code" aria-label="Inline Code" title="Inline Code · ⌘ E">${icon('code')}</button><span></span><button data-format="codeBlock" aria-label="Code Block" title="Code Block · ⌥⌘ C">${icon('square-code')}</button><button data-format="blockquote" aria-label="Blockquote" title="Blockquote · ⇧⌘ B">${icon('text-quote')}</button><span></span><button data-format-group="list" aria-label="List" aria-haspopup="menu" title="List">${icon('list')}${icon('chevron-down')}</button></div>`;drawIcons();}
 document.querySelectorAll('[data-format]').forEach(b=>b.classList.toggle('active',formatActive(b.dataset.format)));
 document.querySelectorAll('[data-format-group]').forEach(b=>{b.classList.toggle('active',formatGroups[b.dataset.formatGroup].some(id=>id!=='paragraph'&&formatActive(id)));b.setAttribute('aria-expanded',String($('#format-menu')?.dataset.group===b.dataset.formatGroup));});
 $('#format-toggle').classList.toggle('active',library.settings.formatbar);
}
function closeFormatMenu(focus=false){$('#format-menu')?.remove();document.querySelectorAll('[data-format-group]').forEach(b=>b.setAttribute('aria-expanded','false'));if(focus)editor.commands.focus();}
function showFormatMenu(group){
 const wasOpen=$('#format-menu')?.dataset.group===group;closeFormatMenu();if(wasOpen)return;
 const menu=document.createElement('div');menu.id='format-menu';menu.dataset.group=group;menu.setAttribute('role','menu');menu.setAttribute('aria-label',group[0].toUpperCase()+group.slice(1));
 menu.innerHTML='<div class="format-options">'+formatGroups[group].map(id=>{const f=formats.find(f=>f[0]===id);return `<button role="menuitemcheckbox" aria-checked="${formatActive(id)}" data-format="${id}">${icon(f[2])}<span>${f[1]}</span>${f[3]?shortcut(f[3]):''}</button>`;}).join('')+'</div>';
 document.body.append(menu);drawIcons();updateFormat();
 menu.querySelector('button').focus();
 menu.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length].focus();}});
}
function runFormat(id){if(sourceMode)toggleSource();formats.find(f=>f[0]===id)?.[4]();updateFormat();}
function exportNote(format){capture();const rep=noteRepresentation();const content=format==='md'?current().markdown:format==='html'?`<!doctype html><html><head><meta charset="utf-8"><title>${esc(current().title)}</title></head><body>${rep.html}</body></html>`:rep.text;bridge('export',{filename:filename(current().title)+'.'+format,content});}
function createQuicklink(){bridge('export',{filename:filename(current().title)+'.inetloc',content:`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>URL</key><string>liltnotes://note/${esc(current().id)}</string></dict></plist>`});}
function getActions(){return [
{name:'Create Note',icon:'square-pen',shortcut:'⌘ N',run:()=>newNote()},
{name:'Browse Notes',icon:'panels-top-left',shortcut:'⌘ P',run:()=>browse()},
{name:current()?.pinned?'Unpin Note':'Pin Note',icon:'pin',shortcut:'⇧ ⌘ P',run:togglePin},
{name:'Find in Note',icon:'search',shortcut:'⌘ F',run:()=>findForm()},
{name:'Find and Replace',icon:'replace',shortcut:'⌥ ⌘ F',run:()=>findForm(true)},
{name:'Duplicate Note',icon:'copy-plus',shortcut:'⌘ D',run:duplicate},
{name:'Copy as Markdown',icon:'copy',shortcut:'⇧ ⌘ C',run:()=>{capture();bridge('copy',{text:current().markdown});toast('Markdown copied');}},
{name:'Copy as Plain Text',icon:'copy',run:()=>{bridge('copy',{text:noteRepresentation().text});toast('Text copied');}},
{name:'Copy as HTML',icon:'code',run:()=>{bridge('copy',{text:noteRepresentation().html});toast('HTML copied');}},
{name:'Set Note Shortcut…',icon:'keyboard',run:noteShortcutForm},
{name:'Copy Note Quicklink',icon:'link-2',run:()=>{bridge('copy',{text:'liltnotes://note/'+current().id});toast('Quicklink copied');}},
{name:'Export Markdown…',icon:'download',run:()=>exportNote('md')},
{name:'Export Plain Text…',icon:'download',run:()=>exportNote('txt')},
{name:'Export HTML…',icon:'download',run:()=>exportNote('html')},
{name:'Share Note…',icon:'share',run:()=>bridge('share',{text:noteRepresentation().text,html:noteRepresentation().html})},
{name:'Open Notes Folder',icon:'folder-open',run:()=>bridge('showNotesFolder')},
{name:'Import Notes…',icon:'file-input',run:()=>bridge('import')},
{name:'Export Library Backup…',icon:'archive',run:()=>bridge('export',{filename:'Lilt Notes Backup.json',content:JSON.stringify(save(),null,2)})},
{name:'Restore Library Backup…',icon:'archive-restore',run:()=>bridge('importBackup')},
{name:'Recently Deleted',icon:'trash-2',run:()=>browse(true)},
{name:'Snippets',icon:'braces',run:snippetList},
{name:'Writing Tools…',icon:'sparkles',run:()=>commandMenu('Writing')},
...writingCommands.map(command=>({name:command.name,icon:'sparkles',run:()=>writingForm(command)})),
{name:'Insert Emoji',icon:'smile',run:()=>emojiPicker()},
{name:'Insert Image…',icon:'image',run:()=>bridge('image')},
{name:'Insert Current Date',icon:'calendar',run:()=>editor.chain().focus().insertContent(new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})).run()},
{name:sourceMode?'Show Rich Text':'Edit Markdown Source',icon:'file-code',shortcut:'⇧ ⌘ M',run:toggleSource},
{name:library.settings.formatbar?'Hide Format Bar':'Show Format Bar',icon:'type',run:()=>action('formatbar')},
{name:'Undo',icon:'undo-2',shortcut:'⌘ Z',run:()=>action('undo')},
{name:'Redo',icon:'redo-2',shortcut:'⇧ ⌘ Z',run:()=>action('redo')},
...formats.map(f=>({name:'Format: '+f[1],icon:f[2],shortcut:f[3],run:()=>runFormat(f[0])})),
{name:'Settings',icon:'settings-2',shortcut:'⌘ ,',run:settingsForm},
{name:'Hide Notes',icon:'panel-top-close',shortcut:'Esc',run:()=>action('hide')},
{name:'Move Note to Trash',icon:'trash-2',shortcut:'⇧ ⌘ ⌫',danger:true,run:()=>trashNote()},
{name:'Quit Lilt Notes',icon:'power',shortcut:'⌘ Q',run:()=>bridge('quit')}
];}
function actions(){if(overlayMode==='actions'){closeOverlay();return;}commandMenu();}
function commandMenu(category=''){
 commandCategory=category;overlayShell('actions',['Copy','Export','Heading'].includes(category)?'Search…':'Search for actions…','');
 const all=getActions(),empty=isEmptyNote(current()),inList=editor.isActive('listItem')||editor.isActive('taskItem');
 const named=(name,changes={})=>({...all.find(a=>a.name===name),...changes});
 const submenu=(name,category,icon,shortcut)=>({name,icon,shortcut,submenu:true,run:()=>commandMenu(category)});
 const primary=[
  named('Create Note',{name:'New Note',icon:'plus',disabled:empty&&!current()?.pinned}),named('Duplicate Note',{disabled:empty}),named(current()?.pinned?'Unpin Note':'Pin Note'),named('Browse Notes',{icon:'note-stack'}),
  {name:'Go Back',icon:'circle-arrow-left',shortcut:'⌘ [',disabled:historyTarget(-1)<0,run:()=>navigate(-1)},
  {name:'Go Forward',icon:'circle-arrow-right',shortcut:'⌘ ]',disabled:historyTarget(1)<0,run:()=>navigate(1)},
  named('Find in Note',{name:'Find in Note',icon:'text-search',section:1}),submenu('Copy Note As…','Copy','clipboard','⇧ ⌘ C'),
  named('Copy Note Quicklink',{name:'Copy Deeplink',shortcut:'⇧ ⌘ D',icon:'copy'}),
  {name:'Create Quicklink',shortcut:'⇧ ⌘ L',icon:'link',run:createQuicklink},submenu('Export…','Export','upload','⇧ ⌘ E'),
  {name:'Move List Item Up',icon:'arrow-up',section:2,shortcut:'⌃ ⌘ ↑',disabled:!inList,run:()=>moveBlock(editor,-1)},
  {name:'Move List Item Down',icon:'arrow-down',shortcut:'⌃ ⌘ ↓',disabled:!inList,run:()=>moveBlock(editor,1)},
  submenu('Format…','Formatting','type','⇧ ⌘ .'),
  {name:(library.settings.autoSize?'Disable':'Enable')+' Window Auto-Sizing',icon:'panel-top',section:3,shortcut:'⇧ ⌘ /',run:()=>action('autoSize')},
  named(library.settings.formatbar?'Hide Format Bar':'Show Format Bar',{name:'Toggle Format Bar',shortcut:'⌥ ⌘ ,'}),
  {name:'Actual Size',icon:'zoom-in',section:4,shortcut:'⌘ 0',disabled:library.settings.zoom===100,run:()=>action('zoomReset')},
  {name:'Zoom In',icon:'zoom-in',shortcut:'⌘ +',run:()=>action('zoomIn')},{name:'Zoom Out',icon:'zoom-out',shortcut:'⌘ −',run:()=>action('zoomOut')},
  named('Settings',{name:'Open Lilt Notes Settings',icon:'settings',section:5}),
  named('Recently Deleted',{name:'Show Recently Deleted Notes',section:6}),named('Move Note to Trash',{name:'Delete Note',shortcut:'⌃ X'})
 ];
 const update=()=>{
  const q=$('#overlay-search').value.toLowerCase();
  if(category==='Writing'){setRows(writingCommands.filter(command=>command.name.toLowerCase().includes(q)).map(command=>({name:command.name,icon:'sparkles',group:'Writing Tools',run:()=>writingForm(command)})));return;}
  if(category==='Formatting'||category==='Heading'){
   const format=(id,group,changes={})=>{const f=formats.find(f=>f[0]===id);return {name:f[1],icon:f[2],shortcut:f[3],run:()=>runFormat(id),group,...changes};};
   const commands=category==='Heading'?['paragraph','heading1','heading2','heading3'].map(id=>format(id,'Heading')):[
    {...submenu('Heading…','Heading','heading',''),group:'Inline',showSubmenuIndicator:false},
    format('bold','Inline'),format('italic','Inline'),format('strike','Inline'),format('underline','Inline'),format('code','Inline',{name:'Code'}),format('link','Inline'),
    format('codeBlock','Block',{section:1}),format('blockquote','Block'),
    format('orderedList','List',{name:'Ordered List',section:2}),format('bulletList','List'),format('taskList','List')
   ];
   setRows(commands.filter(a=>q.split(' ').every(term=>a.name.toLowerCase().includes(term))).map(a=>q?{...a,section:undefined,group:''}:a));return;
  }
  if(category){
   const names=category==='Copy'?['Copy as Markdown','Copy as HTML','Copy as Plain Text']:['Export Markdown…','Export HTML…','Export Plain Text…'];
   setRows(names.map(name=>all.find(a=>a.name===name)).map(a=>({...a,name:a.name.replace(/^(Copy as |Export )/,'').replace(/…$/,''),shortcut:'',group:category==='Copy'?'Copy Note As…':'Export…'})).filter(a=>a.name.toLowerCase().includes(q)));return;
  }
  if(q){
   const extras=all.map(a=>({...a,name:a.name.replace(/^Format: /,'')}));
   const found=[...primary,...extras].filter(a=>q.split(' ').every(t=>a.name.toLowerCase().includes(t)));
   setRows(found.filter((a,i)=>found.findIndex(b=>b.name===a.name||b.run===a.run)===i).map(a=>({...a,section:undefined})));return;
  }
  setRows(primary);
 };
 $('#overlay-search').addEventListener('input',()=>{selected=0;update();});update();
}

function formShell(title,body,{mode='form'}={}){cancelAnimationFrame(resizeRequest);if(mode!=='writing')cancelWriting();bridge('overlay',{open:true,mode});overlayMode='form';commandCategory='';$('#overlay').dataset.mode=mode;$('#overlay').setAttribute('aria-label',title);$('#overlay').hidden=false;$('#overlay').innerHTML=`<div class="overlay-head"><strong>${esc(title)}</strong><span class="footer-spacer"></span><button data-action="closeOverlay" aria-label="Close panel"><kbd>esc</kbd></button></div><div class="form">${body}</div>`;drawIcons();$('#overlay input')?.focus();}
function linkForm(){const selectedText=editor.state.doc.textBetween(editor.state.selection.from,editor.state.selection.to);formShell('Link',`<label class="field">Text<input id="link-text" value="${esc(selectedText)}" placeholder="Link text"></label><label class="field">URL<input id="link-url" value="${esc(editor.getAttributes('link').href||'')}" placeholder="https://example.com"></label><button class="primary" id="apply-link">Save Link</button><button class="secondary" id="remove-link">Remove Link</button>`);$('#link-url').focus();$('#apply-link').onclick=()=>{let url=$('#link-url').value.trim();const text=$('#link-text').value;if(url&&!/^[a-z][\w+.-]*:/i.test(url))url='https://'+url;if(!/^(https?:|mailto:|liltnotes:)/i.test(url)){toast('Enter an https, mailto, or note link');return;}closeOverlay();if(selectedText)editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();else editor.chain().focus().insertContent({type:'text',text:text||url,marks:[{type:'link',attrs:{href:url}}]}).run();};$('#remove-link').onclick=()=>{closeOverlay();editor.chain().focus().extendMarkRange('link').unsetLink().run();};}
function findForm(showReplace=false){
 closeOverlay(false);
 const bar=$('#findbar');bar.hidden=false;
 bar.innerHTML=`<div class="find-row"><button id="find-replace-toggle" aria-label="Show replacement field" title="Find and Replace">${icon('chevron-right')}</button><input id="find-input" aria-label="Find in note" value="${esc(findQuery)}" placeholder="Find in note…"><span id="find-count" aria-live="polite"></span><button id="find-case" title="Match Case" aria-label="Match Case" aria-pressed="${findState.caseSensitive}">Aa</button><button id="find-word" title="Whole Words" aria-label="Whole Words" aria-pressed="${findState.wholeWord}">W</button><button id="find-prev" aria-label="Previous match" title="Previous · ⇧⌘G">${icon('chevron-up')}</button><button id="find-next" aria-label="Next match" title="Next · ⌘G">${icon('chevron-down')}</button><button id="find-close" aria-label="Close find">${icon('x')}</button></div><div class="find-row replace-row" id="replace-row" ${showReplace?'':'hidden'}><input id="replace-input" aria-label="Replace with" placeholder="Replace with…"><button id="replace-one">Replace</button><button id="replace-all">All</button></div>`;
 drawIcons();
 $('#find-input').oninput=()=>{findQuery=$('#find-input').value;findState.active=-1;updateFind();};
 $('#find-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();moveFind(e.shiftKey?-1:1);}};
 $('#find-case').onclick=()=>{findState.caseSensitive=!findState.caseSensitive;$('#find-case').setAttribute('aria-pressed',findState.caseSensitive);findState.active=-1;updateFind();};
 $('#find-word').onclick=()=>{findState.wholeWord=!findState.wholeWord;$('#find-word').setAttribute('aria-pressed',findState.wholeWord);findState.active=-1;updateFind();};
 $('#find-next').onclick=()=>moveFind(1);$('#find-prev').onclick=()=>moveFind(-1);
 $('#find-close').onclick=()=>closeFind(true);
 $('#find-replace-toggle').onclick=()=>{$('#replace-row').hidden=!$('#replace-row').hidden;$('#find-replace-toggle').classList.toggle('expanded',!$('#replace-row').hidden);autoSize();};
 $('#find-replace-toggle').classList.toggle('expanded',showReplace);
 $('#replace-one').onclick=()=>replaceFound(false);$('#replace-all').onclick=()=>replaceFound(true);
 $('#replace-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();replaceFound(e.metaKey);}};
 updateFind();$('#find-input').focus();$('#find-input').select();autoSize();
}
function updateFind(){
 if($('#findbar').hidden)return;
 findState.matches=sourceMode?literalMatches($('#source').value,findQuery,findState):findText(editor,findQuery,findState);
 findState.active=findState.matches.length?Math.max(0,Math.min(findState.active,findState.matches.length-1)):-1;
 const count=findState.matches.length;
 $('#find-count').textContent=findQuery?(count?`${findState.active+1} of ${count}`:'No matches'):'';
 for(const id of ['find-prev','find-next','replace-one','replace-all'])$('#'+id).disabled=!count;
 if(!sourceMode)highlightMatches(editor,findState.matches,findState.active);
 const match=findState.matches[findState.active];
 if(match){if(sourceMode){$('#source').setSelectionRange(match.from,match.to);}else{editor.commands.setTextSelection(match);editor.commands.scrollIntoView();}}
}
function moveFind(direction){if($('#findbar').hidden){findForm();return;}const n=findState.matches.length;if(n){findState.active=(findState.active+direction+n)%n;updateFind();}}
function replaceFound(all){
 const matches=all?findState.matches:[findState.matches[findState.active]].filter(Boolean),replacement=$('#replace-input').value;
 if(!matches.length)return;
 if(sourceMode){let text=$('#source').value;for(const m of [...matches].reverse())text=text.slice(0,m.from)+replacement+text.slice(m.to);$('#source').value=text;capture();scheduleSave();updateTitle();updateFooter();}
 else replaceMatches(editor,matches,replacement);
 updateFind();
}
function closeFind(focus=false){if(!$('#findbar')||$('#findbar').hidden)return;$('#findbar').hidden=true;if(!sourceMode)highlightMatches(editor,[]);findState.matches=[];findState.active=-1;if(focus)(sourceMode?$('#source'):editor.view.dom).focus();autoSize();}
function settingsForm(){const s=library.settings;formShell('Settings',`<div class="setting-row"><span>Appearance</span><select id="setting-theme" aria-label="Appearance">${['system','light','dark'].map(t=>`<option value="${t}" ${s.theme===t?'selected':''}>${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select></div><div class="setting-row"><span>Text size</span><select id="setting-zoom" aria-label="Text size">${[80,90,100,110,125,150,175,200].map(z=>`<option ${s.zoom===z?'selected':''} value="${z}">${z}%</option>`).join('')}</select></div><label class="checkfield"><input type="checkbox" id="setting-top" ${s.alwaysOnTop?'checked':''}>Keep above other windows</label><label class="checkfield"><input type="checkbox" id="setting-size" ${s.autoSize?'checked':''}>Grow window with note content</label><label class="checkfield"><input type="checkbox" id="setting-spell" ${s.spellcheck?'checked':''}>Check spelling while typing</label><div class="setting-row"><span>Global shortcuts</span><select id="setting-hotkey" aria-label="Global shortcuts"><option value="option" ${s.hotkey==='option'?'selected':''}>⌥ N / ⇧⌥ N / ⌥ P</option><option value="controlOption" ${s.hotkey==='controlOption'?'selected':''}>⌃⌥ N / ⇧⌃⌥ N / ⌃⌥ P</option><option value="none" ${s.hotkey==='none'?'selected':''}>Disabled</option></select></div><p>Toggle Notes / Create Note / Search Notes. If another app uses a shortcut, choose the second set.</p><div class="setting-row"><span>Open at login</span><button class="secondary" id="login-settings">Configure…</button></div><hr style="border:0;border-top:1px solid var(--border);margin:20px 0"><div class="setting-row"><span>Notes folder</span><button class="secondary" id="sync-folder">${s.syncPath?'Change Folder…':'Choose Folder…'}</button></div><p>${s.syncPath?esc(s.syncPath):'Choose a folder in iCloud Drive, Dropbox, or another service you already use. iCloud Drive is used by default when available.'} Each note is saved as a Markdown file you can open on other devices. Notes save here automatically. No encryption or Keychain is used.</p><button class="secondary" id="icloud-folder">Use iCloud Drive</button> ${s.syncPath?'<button class="secondary" id="reveal-folder">Open Folder</button> <button class="secondary" id="sync-disable">Save Only on This Mac</button>':''}<p>Lilt Notes 1.1 · Unlimited notes · No account required</p>`);
for(const [id,key,isBool] of [['theme','theme',false],['zoom','zoom',false],['top','alwaysOnTop',true],['size','autoSize',true],['spell','spellcheck',true],['hotkey','hotkey',false]])$('#setting-'+id).onchange=e=>{s[key]=isBool?e.target.checked:key==='zoom'?Number(e.target.value):e.target.value;applySettings();save();};$('#sync-folder').onclick=()=>bridge('chooseSync');$('#icloud-folder').onclick=()=>bridge('useICloud');$('#reveal-folder')?.addEventListener('click',()=>bridge('showNotesFolder'));$('#sync-disable')?.addEventListener('click',()=>{s.syncPath=null;s.syncDefaultInitialized=true;applySettings();save();settingsForm();});$('#login-settings').onclick=()=>bridge('loginSettings');}
const writingCommands=[
 {id:'grammar',name:'Fix Spelling and Grammar',instruction:'Correct spelling, grammar, and punctuation. Make the fewest changes necessary. Keep the original tone, meaning, and formatting.'},
 {id:'improve',name:'Improve Writing',instruction:'Improve clarity, flow, and readability while preserving meaning and tone.'},
 {id:'professional',name:'Make Professional',instruction:'Rewrite in a clear, professional tone. Preserve all facts and details.'},
 {id:'friendly',name:'Make Friendly',instruction:'Rewrite in a warm, friendly tone. Preserve all facts and details.'},
 {id:'shorter',name:'Make Shorter',instruction:'Make the writing more concise. Remove repetition while retaining the key facts and meaning.'},
 {id:'longer',name:'Make Longer',instruction:'Expand the writing for clarity using fuller explanations of what is already stated. Do not invent facts, examples, commitments, or details.'},
 {id:'summary',name:'Summarize',instruction:'Summarize the key facts and action items.',summary:true},
 {id:'translate',name:'Translate…',field:'Language',placeholder:'Spanish'},
 {id:'custom',name:'Custom Writing Instruction…',field:'Instruction',placeholder:'Turn this into a concise project update'}
];
function cancelWriting(){if(writingState){bridge('cancelWriting',{id:writingState.id});writingState=null;}}
function writingForm(command){
 const snapshot=writingSnapshot(editor,sourceMode?$('#source'):null),noteId=library.currentId;
 if(!snapshot.text.trim()){toast('Write or select some text first');return;}
 if(!command.field){startWriting(command,snapshot,noteId,command.instruction);return;}
 formShell(command.name.replace('…',''),`<label class="field">${esc(command.field)}<input id="writing-instruction" maxlength="500" placeholder="${esc(command.placeholder)}"></label><p>${snapshot.whole?'Uses the whole note':'Uses your selected text'}. Runs on this Mac.</p><button class="primary" id="start-writing">Generate Preview</button><button class="secondary" data-action="closeOverlay">Cancel</button>`,{mode:'writing'});
 $('#start-writing').onclick=()=>{const value=$('#writing-instruction').value.trim();if(!value){$('#writing-instruction').focus();return;}startWriting(command,snapshot,noteId,command.id==='translate'?`Translate this text into ${value}. Preserve Markdown formatting and all facts.`:value);};
 $('#writing-instruction').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#start-writing').click();}});
}
function startWriting(command,snapshot,noteId,instruction){
 cancelWriting();
 if(noteId!==library.currentId||!writingUnchanged(snapshot,editor,sourceMode?$('#source'):null)){toast('The note changed. Select the text again and retry.');closeOverlay();return;}
 const state=writingState={id:crypto.randomUUID(),command,snapshot,noteId,instruction};
 formShell(command.name.replace('…',''),`<p>${snapshot.whole?'Whole note':'Selected text'} · On this Mac</p><p id="writing-progress" role="status" aria-live="polite">Preparing your suggestion…</p><button class="secondary" data-action="closeOverlay">Cancel</button>`,{mode:'writing'});
 if(!window.webkit){showWritingResult(state.id,null,'On-device writing assistance is available in the Mac app.');return;}
 bridge('write',{id:state.id,text:snapshot.text,instruction,summary:!!command.summary});
}
function showWritingResult(id,output,error){
 const state=writingState;if(!state||state.id!==id)return;
 const changed=state.noteId!==library.currentId||!writingUnchanged(state.snapshot,editor,sourceMode?$('#source'):null);
 formShell(state.command.name.replace('…',''),`${error?`<p role="alert">${esc(error)}</p>`:'<div id="writing-preview" class="writing-preview tiptap" aria-label="Writing suggestion"></div>'}<p id="writing-help">${changed?'The note changed while this suggestion was being prepared. You can copy it or generate a new preview.':error?'Your note has not changed.':'Review the suggestion before replacing '+(state.snapshot.whole?'the note.':'your selected text.')}</p><div class="writing-buttons">${error?'':`<button class="primary" id="replace-writing" ${changed?'disabled':''}>Replace</button><button class="secondary" id="copy-writing">Copy</button>`}<button class="secondary" id="retry-writing">Retry</button><button class="secondary" data-action="closeOverlay">Cancel</button></div>`,{mode:'writing'});
 if(!error){const preview=createEditor(document.createElement('div'),{content:output,contentType:'markdown'});$('#writing-preview').innerHTML=preview.getHTML();preview.destroy();$('#writing-preview').querySelectorAll('input,select,button').forEach(control=>control.disabled=true);$('#writing-preview').querySelectorAll('a').forEach(link=>link.removeAttribute('href'));}
 $('#retry-writing').onclick=()=>startWriting(state.command,writingSnapshot(editor,sourceMode?$('#source'):null),library.currentId,state.instruction);
 $('#copy-writing')?.addEventListener('click',()=>{bridge('copy',{text:output});toast('Suggestion copied');});
 $('#replace-writing')?.addEventListener('click',()=>{if(state.noteId!==library.currentId||!replaceWriting(state.snapshot,output,editor,sourceMode?$('#source'):null)){$('#writing-help').textContent='The note changed. Copy this suggestion or generate a new preview.';$('#replace-writing').disabled=true;return;}closeOverlay();});
}
function noteShortcutForm(){
 const note=current(),existing=library.settings.noteHotkeys?.[note.id]||null;
 formShell('Note Shortcut',`<p>Open “${esc(note.title)}” from any app.</p><label class="field">Shortcut<button class="shortcut-recorder" id="record-note-shortcut" aria-label="Record note shortcut">${esc(existing?.label||'Record Shortcut')}</button></label><p id="shortcut-help">Click to record a key with Command, Control, or Option. Escape cancels recording.</p><button class="primary" id="save-note-shortcut" ${existing?'':'disabled'}>Save Shortcut</button><button class="secondary" id="remove-note-shortcut" ${existing?'':'disabled'}>Remove</button>`);
 shortcutFormState={noteId:note.id,shortcut:existing,requestId:null};
 $('#record-note-shortcut').onclick=()=>{const state=shortcutFormState;state.requestId=crypto.randomUUID();$('#record-note-shortcut').textContent='Press your shortcut…';$('#save-note-shortcut').disabled=true;bridge('recordShortcut',{requestId:state.requestId});};
 $('#save-note-shortcut').onclick=()=>{bridge('cancelShortcutRecording');$('#save-note-shortcut').disabled=true;bridge('setNoteShortcut',{noteId:note.id,shortcut:shortcutFormState.shortcut});};
 $('#remove-note-shortcut').onclick=()=>{bridge('cancelShortcutRecording');bridge('setNoteShortcut',{noteId:note.id,shortcut:null});};
}
function snippetList(query=''){
 overlayShell('snippets','Search snippets…','<label class="snippet-expansion"><input type="checkbox" id="snippet-expansion">Expand keywords</label><span class="footer-spacer"></span><button id="add-snippet">Add Snippet</button>');
 $('#overlay-search').value=query;
 const render=()=>{const q=$('#overlay-search').value.toLocaleLowerCase();setRows(library.snippets.filter(s=>(s.name+' '+(s.keyword||'')+' '+s.text).toLocaleLowerCase().includes(q)).map(s=>({name:s.name,snippet:s,run:()=>{closeOverlay();if(sourceMode){const source=$('#source'),start=source.selectionStart,text=expandSnippet(s.text),cursor=text.indexOf('{cursor}');source.setRangeText(text.replaceAll('{cursor}',''),start,source.selectionEnd,'end');if(cursor>=0)source.setSelectionRange(start+cursor,start+cursor);source.dispatchEvent(new Event('input'));source.focus();}else{insertSnippet(editor,s.text);editor.commands.focus();}}})));};
 $('#overlay-search').oninput=()=>{selected=0;render();};
 $('#add-snippet').onclick=()=>snippetForm(null,$('#overlay-search').value);
 $('#snippet-expansion').checked=library.settings.expandSnippetKeywords!==false;
 $('#snippet-expansion').onchange=e=>{library.settings.expandSnippetKeywords=e.target.checked;save();};
 render();
}
function snippetForm(snippet=null,query=''){
 formShell(snippet?'Edit Snippet':'New Snippet',`<label class="field">Name<input id="snippet-name" value="${esc(snippet?.name||'')}" placeholder="Meeting template"></label><label class="field">Keyword (optional)<input id="snippet-keyword" value="${esc(snippet?.keyword||'')}" placeholder="!meeting" autocapitalize="off" spellcheck="false"></label><label class="field">Content<textarea id="snippet-text" placeholder="## Meeting · {date}">${esc(snippet?.text||'')}</textarea></label><p>Use {date}, {time}, {iso-date}, or {cursor}. Keywords expand as you type in a note.</p><button class="primary" id="save-snippet">Save Snippet</button><button class="secondary" id="cancel-snippet">Cancel</button>${snippet?'<button class="secondary" id="delete-snippet">Delete…</button>':''}`,{mode:'snippetForm'});
 $('#cancel-snippet').onclick=()=>snippetList(query);
 $('#save-snippet').onclick=()=>{
  const name=$('#snippet-name').value.trim(),text=$('#snippet-text').value,keyword=$('#snippet-keyword').value.trim();
  if(!name||!text.trim()){toast('Add a name and content');return;}
  if(/[\s`'"‘’“”]/u.test(keyword)){toast('Keywords cannot contain spaces or quotes');return;}
  if(keyword&&library.snippets.some(s=>s.id!==snippet?.id&&s.keyword===keyword)){toast('This keyword is already used');return;}
  if(snippet)Object.assign(snippet,{name,text,keyword});else library.snippets.push({id:crypto.randomUUID(),name,text,keyword});
  save();snippetList(query);
 };
 $('#delete-snippet')?.addEventListener('click',()=>{
  formShell('Delete Snippet',`<p>Delete “${esc(snippet.name)}”? Your notes will keep text already inserted from it.</p><button class="primary" id="confirm-delete-snippet">Delete Snippet</button><button class="secondary" id="cancel-delete-snippet">Cancel</button>`);
  $('#cancel-delete-snippet').onclick=()=>snippetForm(snippet,query);
  $('#confirm-delete-snippet').onclick=()=>{library.snippets=library.snippets.filter(s=>s.id!==snippet.id);save();snippetList(query);};
 });
}
const favoriteEmojis=[['😀','smile happy'],['😊','blush happy'],['😂','joy laugh'],['🥹','touched'],['😍','love eyes'],['😎','cool sunglasses'],['🤔','think'],['🙌','celebrate'],['👍','thumbsup yes'],['👎','thumbsdown'],['👏','clap'],['👋','wave'],['🙏','thanks pray'],['💪','strong muscle'],['❤️','heart love'],['🔥','fire'],['✨','sparkles'],['⭐','star'],['🎉','party tada'],['🚀','rocket launch'],['✅','check done'],['❌','cross no'],['⚠️','warning'],['💡','idea bulb'],['📝','memo note'],['📌','pin'],['📅','calendar'],['📎','clip'],['📚','books'],['🎯','target'],['🧠','brain'],['💻','computer'],['☕','coffee'],['🌱','seedling'],['🏃','run'],['🏋️','gym workout'],['🏠','home'],['🌍','earth'],['🔗','link'],['🔒','lock'],['⏰','alarm time'],['💬','chat'],['📊','chart'],['🛠️','tools'],['🐛','bug'],['💯','hundred'],['🎨','art'],['🎵','music'],['🙂','smile'],['🥳','party'],['🫡','salute'],['🫶','heart hands'],['🤝','handshake'],['💥','boom'],['👀','eyes'],['🧩','puzzle']];
const emojis=[...favoriteEmojis,...emojiData.flatMap(e=>[[e.unicode,[e.label,...(e.tags||[])].join(' ')],...(e.skins||[]).map(s=>[s.unicode,s.label||e.label])])].filter((seen=>e=>{if(seen.has(e[0]))return false;seen.add(e[0]);return true;})(new Set()));
inlineEmoji=new InlineEmojiPicker(editor,emojis);
function maybeEmoji(){if(!inlineEmoji)return;if(loading||overlayMode||sourceMode){inlineEmoji.close();return;}inlineEmoji.update();}
window.addEventListener('resize',()=>inlineEmoji.position());
$('#writing').addEventListener('scroll',()=>inlineEmoji.position());
function emojiPicker(query=''){overlayShell('emoji','Search emoji…','Choose an emoji, or press Esc to keep typing.');$('#overlay-search').value=query;const render=()=>{const q=$('#overlay-search').value.toLowerCase();setRows(emojis.filter(e=>e[1].toLowerCase().includes(q)).slice(0,120).map(e=>({html:`<span style="font-size:21px">${e[0]}</span><span class="name">${esc(e[1])}</span>`,run:()=>{closeOverlay();editor.chain().focus().insertContent({type:'text',text:e[0]}).run();}})));};$('#overlay-search').oninput=render;render();}
async function insertImages(files){for(const file of files){if(!file.type.startsWith('image/'))continue;if(file.size>8*1024*1024){toast('Choose an image smaller than 8 MB');continue;}const reader=new FileReader();reader.onload=()=>editor.chain().focus().setImage({src:reader.result,alt:file.name}).run();reader.readAsDataURL(file);}}
function action(name,payload){switch(name){case'new':newNote(payload?.markdown||'');break;case'browse':browse();break;case'pin':togglePin();break;case'actions':overlayMode==='actions'?closeOverlay():actions();break;case'hide':if(writingState)closeOverlay(false);save();bridge('hide');break;case'closeOverlay':closeOverlay();break;case'formatbar':closeFormatMenu();library.settings.formatbar=!library.settings.formatbar;applySettings();save();autoSize();break;case'stats':library.settings.counterMode=library.settings.counterMode==='words'?'characters':'words';updateFooter();save();break;case'settings':settingsForm();break;case'snippets':snippetList();break;case'noteShortcut':noteShortcutForm();break;case'writing':{const command=writingCommands.find(c=>c.id===payload?.id);if(command)writingForm(command);else commandMenu('Writing');break;}case'import':bridge('import');break;case'export':exportNote('md');break;case'exportMenu':commandMenu('Export');break;case'copyMenu':commandMenu('Copy');break;case'formatMenu':commandMenu('Formatting');break;case'quicklink':createQuicklink();break;case'copyDeeplink':bridge('copy',{text:'liltnotes://note/'+current().id});toast('Deeplink copied');break;case'share':bridge('share',{text:noteRepresentation().text,html:noteRepresentation().html});break;case'autoSize':library.settings.autoSize=!library.settings.autoSize;applySettings();save();autoSize();break;case'find':findForm();break;case'replace':findForm(true);break;case'findNext':moveFind(1);break;case'findPrevious':moveFind(-1);break;case'undo':case'redo':if(sourceMode){$('#source').focus();document.execCommand?.(name);}else editor.commands[name]();break;case'back':navigate(-1);break;case'forward':navigate(1);break;case'zoomIn':case'zoomOut':case'zoomReset':library.settings.zoom=name==='zoomReset'?100:Math.max(70,Math.min(200,library.settings.zoom+(name==='zoomIn'?10:-10)));applySettings();save();break;case'trash':trashNote();break;case'source':toggleSource();break;case'duplicate':duplicate();break;default:if(name?.startsWith('format:'))runFormat(name.slice(7));}}
document.addEventListener('mousemove',e=>{
 const moved=pointerPosition?e.clientX!==pointerPosition.x||e.clientY!==pointerPosition.y:!keyboardSelecting||Boolean(e.movementX||e.movementY);
 pointerPosition={x:e.clientX,y:e.clientY};
 // WebKit can emit mousemove when scrolling changes the row beneath a still pointer.
 if(!moved)return;
 keyboardSelecting=false;
 const row=e.target.closest('#results [data-index]');if(!row||row.disabled)return;
 selected=Number(row.dataset.index);highlightSelectedRow();
});
document.addEventListener('mousedown',e=>{if(!e.target.closest('#inline-emoji'))inlineEmoji?.close(true);if(!e.target.closest('#format-menu,[data-format-group]'))closeFormatMenu();if(overlayMode&&e.target.closest('#writing'))closeOverlay(false);if(e.target.closest('[data-format]'))e.preventDefault();});
document.addEventListener('click',e=>{const snippetControl=e.target.closest('[data-snippet-edit]');if(snippetControl){const snippet=library.snippets.find(s=>s.id===snippetControl.dataset.snippetEdit);if(snippet)snippetForm(snippet,$('#overlay-search').value);return;}const noteControl=e.target.closest('[data-browse-pin],[data-browse-delete]');if(noteControl){browseOperation(noteControl.dataset.browsePin||noteControl.dataset.browseDelete,noteControl.dataset.browsePin?'pin':'delete');return;}const b=e.target.closest('[data-action],[data-format],[data-format-group],[data-index]');if(!b)return;if(b.dataset.index!==undefined){const r=rows[Number(b.dataset.index)];if(r&&!r.disabled){closeOverlay(false);r.run();}}else if(b.dataset.format){closeFormatMenu();runFormat(b.dataset.format);}else if(b.dataset.formatGroup)showFormatMenu(b.dataset.formatGroup);else action(b.dataset.action);});
document.addEventListener('keydown',e=>{if(e.isComposing)return;if(inlineEmoji?.handleKey(e))return;const physical={Comma:',',Period:'.',Slash:'/',BracketLeft:'[',BracketRight:']',Equal:'=',Minus:'-'};const key=((e.metaKey||e.ctrlKey)&&(e.code?.startsWith('Key')?e.code.slice(3).toLowerCase():e.code?.startsWith('Digit')?e.code.slice(5):physical[e.code]))||e.key.toLowerCase();if(key==='escape'){e.preventDefault();e.stopPropagation();if($('#format-menu')){closeFormatMenu(true);return;}if(overlayMode){const search=$('#overlay-search');if(overlayMode==='actions'&&search?.value){search.value='';search.dispatchEvent(new Event('input'));return;}if(commandCategory){commandMenu(commandCategory==='Heading'?'Formatting':'');return;}closeOverlay();}else if(!$('#findbar').hidden){closeFind(true);}else action('hide');return;}if(overlayMode&&$('#overlay-search')){if(overlayMode==='snippets'&&e.metaKey&&['e','n'].includes(key)){e.preventDefault();const snippet=rows[selected]?.snippet;if(key==='n'||snippet)snippetForm(key==='n'?null:snippet,$('#overlay-search').value);return;}if(e.key==='ArrowRight'&&rows[selected]?.submenu&&!$('#overlay-search').value){e.preventDefault();const row=rows[selected];closeOverlay(false);row.run();return;}if(e.key==='ArrowLeft'&&commandCategory&&!$('#overlay-search').value){e.preventDefault();commandMenu(commandCategory==='Heading'?'Formatting':'');return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();keyboardSelecting=true;{const step=e.key==='ArrowDown'?1:-1;let next=selected+step;while(next>=0&&next<rows.length&&rows[next].disabled)next+=step;if(next>=0&&next<rows.length)selected=next;}highlightSelectedRow();$(`[data-index="${selected}"]`)?.scrollIntoView({block:'nearest'});return;}if(e.key==='Enter'){e.preventDefault();const r=rows[selected];if(r&&!r.disabled){closeOverlay(false);r.run();}return;}}
if(e.ctrlKey&&!e.metaKey&&key==='x'&&!overlayMode){e.preventDefault();trashNote();return;}if(!e.metaKey)return;if(key==='.'&&overlayMode==='browse'){e.preventDefault();const id=rows[selected]?.noteId;if(id)browseOperation(id,'pin');return;}const shift=e.shiftKey,alt=e.altKey;let a=null;if(key==='n'&&!alt)a='new';else if(key==='p'&&!alt)a=shift?'pin':'browse';else if(key==='k')a='actions';else if(key===',')a=alt?'formatbar':'settings';else if((key==='.'||key==='>')&&shift)a='formatMenu';else if(key==='/'&&shift||key==='?'&&shift)a='autoSize';else if(alt&&/^[1-3]$/.test(key))a='format:heading'+key;else if(alt&&key==='c')a='format:codeBlock';else if(shift&&['7','8','9'].includes(key))a='format:'+({7:'orderedList',8:'bulletList',9:'taskList'}[key]);else if(key==='f')a=alt?'replace':'find';else if(key==='g')a=shift?'findPrevious':'findNext';else if(key==='d')a=shift?'copyDeeplink':'duplicate';else if(key==='e'&&shift)a='exportMenu';else if(key==='w')a='hide';else if(key==='[')a='back';else if(key===']')a='forward';else if(key==='+'||key==='=')a='zoomIn';else if(key==='-')a='zoomOut';else if(key==='0')a='zoomReset';else if(key==='m'&&shift)a='source';else if(key==='backspace'&&shift)a='trash';else if(key==='s'&&!shift){e.preventDefault();save();toast('Saved');return;}else if(key==='c'&&shift)a='copyMenu';else if(key==='l'){e.preventDefault();if(shift)createQuicklink();else linkForm();return;}else if(/^[1-9]$/.test(key)&&!alt&&!shift){const note=searchNotes(library.notes,'').filter(n=>n.pinned)[Number(key)-1];if(note){e.preventDefault();selectNote(note.id);}return;}if(a){e.preventDefault();e.stopPropagation();action(a);}
},true);
window.addEventListener('blur',()=>{if(!loading)save();});
window.Lilt={init,action,saved,
manualResize(){cancelAnimationFrame(resizeRequest);if(!library.settings.autoSize)return;library.settings.autoSize=false;const control=$('#setting-size');if(control)control.checked=false;applySettings();save();},
writingResult:showWritingResult,
writingProgress(id,completed,total){if(writingState?.id===id&&$('#writing-progress'))$('#writing-progress').textContent=total>1?`Working on passage ${completed} of ${total}…`:'Preparing your suggestion…';},flush:()=>JSON.stringify(save()),state:()=>structuredClone(library),editor,
error(message){localSaveError=true;updateSaveStatus();toast(message);},
importNotes(notes){for(const data of notes){if(data.markdown!==undefined){const note=makeNote(data.markdown);library.notes.push(note);selectNote(note.id);}else if(data.html){newNote('',{reuse:false});editor.commands.setContent(data.html);capture();}}save();toast(`Imported ${notes.length} ${notes.length===1?'note':'notes'}`);},
importBackup(data){try{const incoming=normalizeLibrary(data);library=mergeLibraries(library,incoming);for(const s of incoming.snippets)if(!library.snippets.some(x=>x.id===s.id))library.snippets.push(s);selectNote(library.currentId);toast('Backup merged into your library');}catch(e){toast(e.message);}},
merge(data){capture();const old=JSON.stringify(current());library=mergeLibraries(library,data);applySettings();if(JSON.stringify(current())!==old){const next=current()?.deletedAt?searchNotes(library.notes,'')[0]:current();if(next)selectNote(next.id);else newNote();}save();},
shortcutRecorded(requestId,shortcut){const state=shortcutFormState;if(!state||state.requestId!==requestId)return;state.requestId=null;if(shortcut)state.shortcut=shortcut;$('#record-note-shortcut').textContent=state.shortcut?.label||'Record Shortcut';$('#save-note-shortcut').disabled=!state.shortcut;},
noteShortcutResult(noteId,shortcut,error){if(error){if(shortcutFormState?.noteId===noteId){$('#shortcut-help').textContent=error;$('#save-note-shortcut').disabled=false;}return;}library.settings.noteHotkeys={...library.settings.noteHotkeys};if(shortcut)library.settings.noteHotkeys[noteId]=shortcut;else delete library.settings.noteHotkeys[noteId];applySettings();save();if(shortcutFormState?.noteId===noteId)closeOverlay();toast(shortcut?'Note shortcut saved':'Note shortcut removed');},
openNote(id){if(library.notes.some(n=>n.id===id&&!n.deletedAt))selectNote(id);else toast('This note could not be found');},
syncStatus(message){if(message==='Saved on this Mac; folder unavailable')folderSaveWarning=message;else if(message.startsWith('Saved to '))folderSaveWarning='';else return;updateSaveStatus();},
syncPath(path){library.settings.syncPath=path;library.settings.syncDefaultInitialized=true;applySettings();save();settingsForm();},
insertImage(src,name){editor.chain().focus().setImage({src,alt:name}).run();},toast,
};
drawIcons();bridge('ready');
if(!window.webkit){try{init(JSON.parse(localStorage.getItem('lilt-preview'))||initialLibrary());}catch{init(initialLibrary());}}
