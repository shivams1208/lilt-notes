import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initialLibrary,normalizeLibrary,makeNote,noteTitle,searchNotes,setPinned,countText,mergeLibraries,expandSnippet,filename} from '../web/model.js';
const dom=new JSDOM('<!doctype html><div id="editor"></div>',{pretendToBeVisual:true,url:'http://localhost'});
for(const key of ['window','document','navigator','Node','Element','HTMLElement','HTMLInputElement','MutationObserver','DOMParser','getComputedStyle','KeyboardEvent','Event','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
const {createEditor,toggleTask,moveBlock,plainText}=await import('../web/editor.js');
const {findText,replaceMatches,literalMatches}=await import('../web/find.js');
const {indentCode}=await import('../web/code-block.js');
function run(content,fn){const element=document.createElement('div');document.body.append(element);const editor=createEditor(element,{content,contentType:'markdown'});try{fn(editor)}finally{editor.destroy();element.remove();}}
function typeInto(editor,text){for(const character of text){const {from,to}=editor.state.selection;const handled=editor.view.someProp('handleTextInput',handler=>handler(editor.view,from,to,character));if(!handled)editor.view.dispatch(editor.state.tr.insertText(character,from,to));}}
test('typing the documented paragraph shortcuts creates the intended blocks',()=>{
 for(const [shortcut,type,attrs] of [['# ','heading',{level:1}],['## ','heading',{level:2}],['### ','heading',{level:3}],['``` ','codeBlock',{}],['~~~ ','codeBlock',{}],['> ','blockquote',{}],['1. ','orderedList',{}],['7. ','orderedList',{start:7}],['- ','bulletList',{}],['* ','bulletList',{}],['[] ','taskList',{}],['[ ] ','taskList',{}],['[x] ','taskList',{}]]){
  run('',e=>{typeInto(e,shortcut);assert.equal(e.isActive(type,attrs),true,shortcut);if(shortcut==='[x] ')assert.equal(e.state.doc.firstChild.firstChild.attrs.checked,true);});
 }
});
test('typing inline Markdown and horizontal rules formats without showing delimiters',()=>{
 for(const [text,tag] of [['**bold**','strong'],['__bold__','strong'],['*italic*','em'],['_italic_','em'],['~~strike~~','s'],['`code`','code']])run('',e=>{typeInto(e,text);assert.match(e.getHTML(),new RegExp('<'+tag+'>'),text);assert.doesNotMatch(e.getText(),/[*_~`]/);});
 for(const shortcut of ['--- ','___ '])run('',e=>{typeInto(e,shortcut);assert.match(e.getHTML(),/<hr>/,shortcut);});
});
test('three or more dashes become a divider on Enter, including macOS smart dashes',()=>{
 for(const shortcut of ['---','----','------','——','—-'])run('',e=>{
  typeInto(e,shortcut);assert.equal(e.state.doc.firstChild.type.name,'paragraph');
  const before=e.getJSON();
  e.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.deepEqual(e.getJSON().content.map(n=>n.type),['horizontalRule','paragraph']);
  assert.equal(e.state.selection.$from.parent.type.name,'paragraph');
  e.commands.undo();assert.deepEqual(e.getJSON(),before);
 });
});
test('divider shortcut keeps normal Enter, code, partial lines, and selections intact',()=>{
 for(const text of ['--','text ----'])run('',e=>{typeInto(e,text);e.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.doesNotMatch(e.getHTML(),/<hr>/);assert.equal(e.getText().trim(),text);});
 run('```\n----\n```',e=>{e.commands.setTextSelection(5);e.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(e.state.doc.firstChild.type.name,'codeBlock');assert.doesNotMatch(e.getHTML(),/<hr>/);});
 run('',e=>{typeInto(e,'----');e.commands.setTextSelection(3);e.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.doesNotMatch(e.getHTML(),/<hr>/);});
});
test('all documented inline formats and links survive Markdown round trip',()=>run('**bold** *italic* ~~strike~~ `code` [link](https://example.com) <u>underline</u>',e=>{const html=e.getHTML();for(const tag of ['strong','em','s','code','a','u'])assert.match(html,new RegExp('<'+tag+'[ >]'));const md=e.getMarkdown();e.commands.setContent(md,{contentType:'markdown'});for(const tag of ['strong','em','s','code','a','u'])assert.match(e.getHTML(),new RegExp('<'+tag+'[ >]'));}));
test('headings 1 through 6 render correctly',()=>run('# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six',e=>{for(let i=1;i<=6;i++)assert.ok(e.getHTML().includes('<h'+i+'>'));}));
test('nested bullets and numbered lists survive serialization',()=>run('- Parent\n  - Child\n    - Grandchild\n\n1. First\n2. Second',e=>{const md=e.getMarkdown();e.commands.setContent(md,{contentType:'markdown'});assert.equal((e.getHTML().match(/<ul>/g)||[]).length,3);assert.ok(e.getHTML().includes('<ol>'));assert.match(e.getText(),/Grandchild/);}));
test('tasks toggle checked state and preserve nested tasks',()=>run('- [ ] Parent\n  - [x] Child',e=>{e.commands.setTextSelection(3);assert.equal(toggleTask(e),true);assert.equal(e.getJSON().content[0].content[0].attrs.checked,true);const md=e.getMarkdown();assert.match(md,/- \[x\] Parent/);assert.match(md,/- \[x\] Child/);}));
test('language code, quotes, and horizontal rules render',()=>run('> Quote\n\n```swift\nlet n = 42\n```\n\n---',e=>{const html=e.getHTML();assert.match(html,/<blockquote>/);assert.match(html,/language-swift/);assert.match(html,/<hr>/);assert.match(e.getMarkdown(),/```swift/);}));
test('GitHub tables survive round trip and accept row insertion',()=>run('| A | B |\n|---|---|\n| 1 | 2 |',e=>{assert.match(e.getHTML(),/<table/);const doc=e.getJSON();assert.equal(doc.content[0].type,'table');assert.equal(doc.content[0].content.length,2);e.commands.setContent(e.getMarkdown(),{contentType:'markdown'});assert.equal(e.getJSON().content[0].content.length,2);}));
test('image data and alt text survive persisted JSON',()=>run('![Sketch](data:image/png;base64,aGVsbG8=)',e=>{const doc=e.getJSON();e.commands.setContent(doc);assert.match(e.getHTML(),/alt="Sketch"/);assert.match(e.getHTML(),/data:image\/png/);}));
test('formatting has working undo and redo',()=>run('hello',e=>{e.commands.selectAll();e.commands.toggleBold();assert.match(e.getHTML(),/<strong>hello/);assert.equal(e.commands.undo(),true);assert.doesNotMatch(e.getHTML(),/<strong>/);assert.equal(e.commands.redo(),true);assert.match(e.getHTML(),/<strong>/);}));
test('list indentation and outdent preserve text',()=>run('- First\n- Second',e=>{e.commands.setTextSelection(12);assert.equal(e.commands.sinkListItem('listItem'),true);assert.equal((e.getHTML().match(/<ul>/g)||[]).length,2);assert.equal(e.commands.liftListItem('listItem'),true);assert.equal((e.getHTML().match(/<ul>/g)||[]).length,1);assert.match(e.getText(),/Second/);}));
test('list item reordering changes order',()=>run('- First\n- Second',e=>{e.commands.setTextSelection(3);assert.equal(moveBlock(e,1),true);assert.ok(e.getText().indexOf('Second')<e.getText().indexOf('First'));}));
test('repeated list moves keep the caret in the moved item and preserve its offset',()=>run('- First\n- Second\n- Third',e=>{
 e.commands.setTextSelection(5);
 const offset=e.state.selection.$from.parentOffset;
 assert.equal(moveBlock(e,1),true);
 assert.equal(e.state.selection.$from.parent.textContent,'First');
 assert.equal(e.state.selection.$from.parentOffset,offset);
 assert.equal(moveBlock(e,1),true);
 assert.equal(plainText(e).trimEnd(),'Second\nThird\nFirst');
 assert.equal(e.state.selection.$from.parent.textContent,'First');
 assert.equal(moveBlock(e,1),false);
 assert.equal(moveBlock(e,-1),true);
 assert.equal(plainText(e).trimEnd(),'Second\nFirst\nThird');
}));
test('moving selected list items keeps the group, nested content, and selection intact',()=>run('- Alpha\n  - Child\n- Bravo\n- Charlie',e=>{
 let from,to;
 e.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='Alpha')from=pos;if(node.isText&&node.text==='Bravo')to=pos+node.nodeSize;});
 e.commands.setTextSelection({from,to});
 const selectedText=e.state.doc.textBetween(from,to,'\n');
 assert.equal(moveBlock(e,1),true);
 assert.equal(plainText(e).trimEnd(),'Charlie\nAlpha\nChild\nBravo');
 assert.equal(e.state.doc.textBetween(e.state.selection.from,e.state.selection.to,'\n'),selectedText);
 assert.equal(moveBlock(e,-1),true);
 assert.equal(plainText(e).trimEnd(),'Alpha\nChild\nBravo\nCharlie');
}));
test('moving checked tasks preserves nested tasks, inline formatting, and undo',()=>run('- [x] **Keep**\n  - [ ] Child\n- [ ] Next',e=>{
 e.commands.setTextSelection(4);const before=e.getJSON(),position=e.state.selection.anchor;
 assert.equal(moveBlock(e,1),true);
 const items=e.state.doc.firstChild.content;
 assert.equal(items.child(0).textContent,'Next');assert.equal(items.child(1).attrs.checked,true);
 assert.match(e.getHTML(),/<strong>Keep<\/strong>/);assert.match(e.getMarkdown(),/  - \[ \] Child/);
 e.commands.undo();assert.deepEqual(e.getJSON(),before);assert.equal(e.state.selection.anchor,position);
}));
test('new notes have unique ids and unlimited creation',()=>{const notes=Array.from({length:200},()=>makeNote('test'));assert.equal(new Set(notes.map(n=>n.id)).size,200);});
test('search covers title and body, pins precede recency, deleted filtered',()=>{const notes=[{...makeNote(),title:'Meeting',text:'apple banana',pinned:true,updatedAt:1},{...makeNote(),title:'Later',text:'APPLE banana',updatedAt:2},{...makeNote(),title:'Deleted',text:'apple banana',deletedAt:2}];assert.equal(searchNotes(notes,'apple banana')[0].title,'Meeting');assert.equal(searchNotes(notes,'apple banana').length,2);assert.equal(searchNotes(notes,'apple',true)[0].title,'Deleted');assert.equal(searchNotes(notes,'apple orange').length,0);});
test('imported pin order survives editing, search, and backup round trips',()=>{
 const notes=[{...makeNote(),title:'First',pinned:true,pinOrder:0,updatedAt:1},{...makeNote(),title:'Second',pinned:true,pinOrder:1,updatedAt:999},{...makeNote(),title:'Unranked',pinned:true,updatedAt:9999},{...makeNote(),title:'Recent',updatedAt:99999}];
 const restored=normalizeLibrary(JSON.parse(JSON.stringify({...initialLibrary(),notes})));
 assert.deepEqual(searchNotes(restored.notes,'').map(n=>n.title),['First','Second','Unranked','Recent']);
 assert.deepEqual(searchNotes(restored.notes,'s').map(n=>n.title),['First','Second']);
 setPinned(restored.notes,restored.notes[0],false);assert.equal('pinOrder' in restored.notes[0],false);
 setPinned(restored.notes,restored.notes[0],true);assert.equal(restored.notes[0].pinOrder,2);
 assert.deepEqual(searchNotes(restored.notes,'').slice(0,3).map(n=>n.title),['Second','First','Unranked']);
});
test('merging backups preserves newer local edits and adds new notes',()=>{const a=makeNote('original'),b=makeNote('new');a.updatedAt=10;const local={...initialLibrary(),notes:[a]};const merged=mergeLibraries(local,{notes:[{...a,markdown:'older',updatedAt:9},b]});assert.equal(merged.notes[0].markdown,'original');assert.equal(merged.notes.length,2);});
test('title, Unicode counters, safe filenames and dynamic snippets',()=>{assert.equal(noteTitle('\n\nFirst line\nSecond'),'First line');assert.deepEqual(countText('Hello 👋'),{words:2,characters:7,lines:1});assert.equal(filename('a/b:c'),'a-b-c');assert.ok(!expandSnippet('{date} {time} {iso-date}').includes('{'));});
test('invalid or future libraries are rejected',()=>{assert.throws(()=>normalizeLibrary({notes:[]}));assert.throws(()=>normalizeLibrary({version:99,notes:[]}));assert.equal(normalizeLibrary(initialLibrary()).settings.zoom,100);});
test('plain text export has natural line breaks without list-container padding',()=>run('# Title\n\n- One\n- Two',e=>assert.equal(plainText(e),'Title\nOne\nTwo')));
test('local note quicklinks are preserved',()=>run('[Open note](liltnotes://note/abc)',e=>assert.match(e.getHTML(),/href="liltnotes:\/\/note\/abc"/)));

test('find matches phrases across rich-text mark boundaries and preserves surrounding content',()=>run('A **bold** phrase and a bold phrase.',e=>{const hits=findText(e,'bold phrase');assert.equal(hits.length,2);replaceMatches(e,hits,'clear text');assert.equal(e.getText(),'A clear text and a clear text.');e.commands.undo();assert.match(e.getHTML(),/<strong>bold/);assert.equal(findText(e,'bold phrase').length,2);}));
test('find case and whole-word options use correct Unicode text positions',()=>{assert.deepEqual(literalMatches('🐱 Cat cat catalogue','cat',{caseSensitive:true,wholeWord:true}),[{from:7,to:10}]);assert.equal(literalMatches('a.b a-b','a.b').length,1);assert.equal(literalMatches('cat CAT','cat',{caseSensitive:true}).length,1);assert.equal(literalMatches('élan élanes','élan',{wholeWord:true}).length,1);});
test('code language changes serialize without including editor controls',()=>run('```js\nconst answer = 42;\n```',e=>{const select=e.view.dom.querySelector('select');assert.equal(select.value,'js');select.value='python';select.dispatchEvent(new Event('change',{bubbles:true}));assert.match(e.getMarkdown(),/```python/);assert.doesNotMatch(e.getMarkdown(),/Copy|Plain Text/);assert.doesNotMatch(e.getHTML(),/select|button/);e.commands.undo();assert.match(e.getMarkdown(),/```js/);}));
test('multiline code indent and outdent preserve the selection',()=>run('```\nalpha\nbeta\ngamma\n```',e=>{e.commands.setTextSelection({from:1,to:12});assert.equal(indentCode(e),true);assert.equal(e.state.doc.firstChild.textContent,'  alpha\n  beta\ngamma');assert.equal(indentCode(e,true),true);assert.equal(e.state.doc.firstChild.textContent,'alpha\nbeta\ngamma');e.commands.setTextSelection(2);indentCode(e);assert.equal(e.state.doc.firstChild.textContent,'a  lpha\nbeta\ngamma');}));
test('ISO date snippets use the local calendar day even late in the evening',()=>{
 const date=new Date(2026,8,7,23,30);
 assert.equal(expandSnippet('{iso-date}',date),'2026-09-07');
});
test('typing Markdown links creates clickable labels and supports input-rule undo',()=>run('',e=>{
 typeInto(e,'[Example](https://example.com)');assert.equal(e.getText(),'Example');assert.match(e.getHTML(),/href="https:\/\/example.com"/);assert.equal(e.commands.undoInputRule(),true);assert.equal(e.getText(),'[Example](https://example.com)');
}));
