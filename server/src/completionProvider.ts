import { existsSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { CancellationToken, CompletionItem, CompletionItemKind, CompletionParams, DocumentSymbol, InsertTextFormat, SymbolKind, TextEdit } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { ClassNode, cleardetectcache, detectExpType, FuncNode, getClassMembers, getFuncCallInfo, last_full_exp, Lexer, searchNode, Token, Variable } from './Lexer';
import { completionitem } from './localize';
import { ahkuris, ahkvars, completionItemCache, dllcalltpe, extsettings, inBrowser, inWorkspaceFolders, lexers, libfuncs, Maybe, pathenv, sendAhkRequest, utils, winapis } from './common';
import { TextDocument } from 'vscode-languageserver-textdocument';

export async function completionProvider(params: CompletionParams, token: CancellationToken): Promise<Maybe<CompletionItem[]>> {
	if (token.isCancellationRequested || params.context?.triggerCharacter === null) return;
	let { position, textDocument } = params, items: CompletionItem[] = [], vars: { [key: string]: any } = {}, txs: any = {};
	let scopenode: DocumentSymbol | undefined, other = true, triggerKind = params.context?.triggerKind;
	let uri = textDocument.uri.toLowerCase(), doc = lexers[uri], context = doc?.buildContext(position, false, true);
	if (!context) return;
	let quote = '', char = '', l = '', percent = false, lt = context.linetext, triggerchar = lt.charAt(context.range.start.character - 1);
	let list = doc.relevance, cpitem: CompletionItem = { label: '' }, temp: any, path: string, { line, character } = position;
	let expg = new RegExp(context.text.match(/[^\w]/) ? context.text.replace(/(.)/g, '$1.*') : '(' + context.text.replace(/(.)/g, '$1.*') + '|[^\\w])', 'i');
	let o = doc.document.offsetAt({ line, character: character - 1 }), tk = doc.find_token(o);
	let istr = tk.type === 'TK_STRING', right_is_paren = '(['.includes(context.suf.charAt(0) || '\0');
	let commitCharacters = Object.fromEntries(Object.entries(extsettings.CompletionCommitCharacters ?? {})
		.map((v: any) => (v[1] = (v[1] || undefined)?.split(''), v)));

	if (istr) {
		if (triggerKind === 2)
			return;
		triggerchar = '';
	} else if (tk.type.endsWith('COMMENT'))
		percent = true, tk.type === 'TK_COMMENT' && (lt = lt.replace(/^\s*;@include\b/i, '#include'));
	else if (context.pre.startsWith('#')) {
		for (let i = 0; i < position.character; i++) {
			char = lt.charAt(i);
			if (quote === char) {
				if (lt.charAt(i - 1) === '`')
					continue;
				else quote = '', percent = false;
			} else if (char === '%') {
				percent = !percent;
			} else if (quote === '' && (char === '"' || char === "'") && (i === 0 || lt.charAt(i - 1).match(/[([%,\s]/)))
				quote = char;
		}
	} else if (!tk.topofline) {
		while ((tk = tk.previous_token as Token) && tk.type) {
			if (tk.content === '%') {
				if (tk.next_pair_pos)
					percent = true;
				break;
			}
			if (tk.topofline)
				break;
		}
	}

	if (!percent && triggerchar === '.' && context.pre.match(/^#(include|dllload)/i))
		triggerchar = '###';
	if (temp = lt.match(/^\s*((class\s+(\w|[^\x00-\x7f])+\s+)?(extends)|class)\s/i)) {
		if (triggerchar === '.') {
			if (temp[3]) {
				searchNode(doc, doc.buildContext(position, true, true).text.replace(/\.[^.]*$/, '').toLowerCase(), position, SymbolKind.Class)?.forEach(it => {
					Object.values(getClassMembers(doc, it.node, true)).forEach(it => {
						if (it.kind === SymbolKind.Class && !vars[l = it.name.toUpperCase()] && expg.test(l))
							items.push(convertNodeCompletion(it)), vars[l] = true;
					});
				});
			}
			return items;
		}
		if (!temp[3] && !temp[2])
			return [{ label: 'extends', kind: CompletionItemKind.Keyword }];
		let glo = [doc.declaration];
		for (const uri in list)
			if (lexers[uri])
				glo.push(lexers[uri].declaration);
		glo.forEach(g => {
			for (const cl in g) {
				if (g[cl].kind === SymbolKind.Class && !vars[cl] && expg.test(cl))
					items.push(convertNodeCompletion(g[cl])), vars[cl] = true;
			}
		});
		for (const cl in ahkvars)
			if (ahkvars[cl].kind === SymbolKind.Class && !vars[cl] && expg.test(cl))
				items.push(convertNodeCompletion(ahkvars[cl])), vars[cl] = true;
		return items;
	}
	switch (triggerchar) {
		case '#':
			items.push(...completionItemCache.sharp);
			items.push(...completionItemCache.snippet);
			return items;
		case '.':
			context = doc.buildContext(position, true, true);
			if (context.text.match(/^\d+(\.\d*)*\.$/))
				return;
			let unknown = true, isstatic = true, tps = new Set<DocumentSymbol>();
			let props: any = {}, ts: any = {}, p = context.text.replace(/\.(\w|[^\x00-\x7f])*$/, '').toLowerCase();
			cleardetectcache(), detectExpType(doc, p, context.range.end, ts, doc.document.getText(context.range));
			delete ts['@comvalue'];
			let tsn = Object.keys(ts).length;
			if (ts['#any'] === undefined) {
				for (const tp in ts) {
					unknown = false, isstatic = !tp.match(/[@#][^.]+$/);
					if (ts[tp]) {
						let kind = ts[tp].node?.kind;
						if (kind === SymbolKind.Function || kind === SymbolKind.Method)
							tps.add(ahkvars['FUNC']), isstatic = false;
						else if (kind === SymbolKind.Class)
							tps.add(ts[tp].node);
					} else if (tp.match(/^@comobject\b/)) {
						let p: string[] = [];
						if (temp = tp.substring(10).match(/<([\w.{}-]+)(,([\w{}-]+))?>/))
							p.push(temp[1]), temp[3] && p.push(temp[3]);
						else if (tp === '@comobject' && (temp = last_full_exp.match(/^comobject\(\s*('|")([^'"]+)\1\s*\)$/i)))
							p.push(temp[2]);
						if (p.length) {
							let result = (await sendAhkRequest('GetDispMember', p) ?? {}) as { [func: string]: number };
							Object.entries(result).forEach(it => expg.test(it[0]) && additem(it[0], it[1] === 1 ? CompletionItemKind.Method : CompletionItemKind.Property));
						}
						if (tsn === 1)
							return items;
					} else if (tp.includes('=>')) {
						tps.add(ahkvars['FUNC']), isstatic = false;
					} else for (let it of searchNode(doc, tp, position, SymbolKind.Variable) ?? [])
						it.node.kind === SymbolKind.Class && tps.add(it.node);
				}
			}
			for (const node of tps) {
				let omems = getClassMembers(doc, node, isstatic);
				if (isstatic && (<FuncNode>omems['__NEW'])?.static === false)
					delete omems['__NEW'];
				for (const [k, it] of Object.entries(omems)) {
					if (expg.test(k)) {
						if (!(temp = props[k]))
							items.push(props[k] = convertNodeCompletion(it));
						else if (!temp.detail?.endsWith((it as Variable).full ?? '')) {
							temp.detail = '(...) ' + (temp.insertText = it.name);
							temp.commitCharacters = temp.command = temp.documentation = undefined;
						}
					}
				}
			}
			if (!unknown && (triggerKind !== 1 || context.text.match(/\..{0,2}$/)))
				return items;
			let objs = new Set([doc.object, lexers[ahkuris.ahk2]?.object, lexers[ahkuris.ahk2_h]?.object]);
			objs.delete(undefined as any);
			for (const uri in list)
				objs.add(lexers[uri].object);
			for (const k in (temp = doc.object.property)) {
				let v = temp[k];
				if (v.length === 1 && !v[0].full && ateditpos(v[0]))
					delete temp[k];
			}
			for (const obj of objs) {
				for (const arr of Object.values(obj))
					for (const [k, its] of Object.entries(arr))
						if (expg.test(k)) {
							if (!(temp = props[k])) {
								items.push(props[k] = temp = convertNodeCompletion(its[0]));
								if (its.length === 1)
									continue;
							} else if (temp.detail?.endsWith(its[0].full ?? ''))
								continue;
							temp.detail = '(...) ' + (temp.insertText = temp.label);
							temp.commitCharacters = temp.command = temp.documentation = undefined;
						}
			}
			return items;
		default:
			if (temp = lt.match(/^\s*#(include|(dllload))/i)) {
				if (inBrowser)
					return;
				lt = lt.replace(/\s+;.*/, '').trimRight();
				let tt = lt.replace(/^\s*#(include(again)?|dllload)\s+/i, '').replace(/\*i\s+/i, ''), paths: string[] = [], inlib = false, lchar = '';
				let pre = lt.substring(lt.length - tt.length, position.character), xg = '\\', m: any, a_ = '', isdll = !!temp[2];
				if (percent) {
					completionItemCache.other.forEach(it => {
						if (it.kind === CompletionItemKind.Variable && expg.test(it.label))
							items.push(it);
					})
					return items;
				} else if (!pre)
					return;
				else if (pre.match(/^['"<]/)) {
					if (pre.substring(1).match(/[">]/)) return;
					else {
						if ((lchar = pre[0]) === '<') {
							if (isdll) return;
							inlib = true, paths = doc.libdirs;
						} else if (!isdll)
							paths = (temp = doc.includedir.get(position.line)) ? [temp] : [doc.scriptpath];
						pre = pre.substring(1), lchar = lchar === '<' ? '>' : lchar;
						if (lt.substring(position.character).indexOf(lchar) !== -1)
							lchar = '';
					}
				} else if (!isdll)
					paths = (temp = doc.includedir.get(position.line)) ? [temp] : [doc.scriptpath];

				let extreg = isdll ? new RegExp(/\.(dll|ocx|cpl)$/i) : inlib ? new RegExp(/\.ahk$/i) : new RegExp(/\.(ahk2?|ah2)$/i), ts = '';
				pre = pre.replace(/[^\\/]*$/, m => (ts = m, ''));
				while (m = pre.match(/%a_(\w+)%/i))
					if (typeof pathenv[a_ = m[1].toLowerCase()] === 'string')
						pre = pre.replace(m[0], pathenv[a_]);
					else if (a_ === 'scriptdir')
						pre = pre.replace(m[0], doc.scriptdir);
					else if (a_ === 'linefile')
						pre = pre.replace(m[0], URI.parse(doc.uri).fsPath);
					else return;
				if (pre.endsWith('/'))
					xg = '/';
				if (ts.startsWith('*')) {
					if (inBrowser)
						return undefined;
					for (let k in utils.get_RCDATA() ?? {})
						additem(k, CompletionItemKind.File);
					return items;
				}
				ts = ts.replace(/`;/g, ';');
				let ep = new RegExp((ts.match(/[^\w]/) ? ts.replace(/(.)/g, '$1.*') : '(' + ts.replace(/(.)/g, '$1.*') + '|[^\\w])').replace(/\.\./, '\\..'), 'i');
				let textedit: TextEdit | undefined;
				if (isdll)
					paths = [(temp = doc.dlldir.get(position.line)) ? temp : doc.scriptpath, 'C:\\Windows\\System32'];
				if (ts.match(/[^\w]/))
					textedit = TextEdit.replace({ start: { line: position.line, character: position.character - ts.length }, end: position }, '');
				for (let path of paths) {
					if (!existsSync(path = resolve(path, pre) + '\\') || !statSync(path).isDirectory())
						continue;
					for (let it of readdirSync(path)) {
						try {
							if (statSync(path + it).isDirectory()) {
								if (ep.test(it)) {
									additem(it.replace(/;/g, '`;'), CompletionItemKind.Folder);
									cpitem.command = { title: 'Trigger Suggest', command: 'editor.action.triggerSuggest' };
									if (textedit)
										cpitem.textEdit = Object.assign({}, textedit, { newText: cpitem.label + xg });
									else
										cpitem.insertText = cpitem.label + xg;
								}
							} else if (extreg.test(it) && ep.test(inlib ? it = it.replace(extreg, '') : it)) {
								additem(it.replace(/;/g, '`;'), CompletionItemKind.File);
								if (textedit)
									cpitem.textEdit = Object.assign({}, textedit, { newText: cpitem.label + lchar });
								else
									cpitem.insertText = cpitem.label + lchar;
							}
						} catch { };
					}
					if (pre.includes(':'))
						break;
				}
				return items;
			} else if (temp = lt.match(/(?<!([\w.]|[^\x00-\x7f]))(goto|continue|break)(?!\s*:)(\s+|\(\s*('|")?)/i)) {
				let t = temp[2].trim();
				if (scopenode = doc.searchScopedNode(position))
					scopenode.children?.forEach(it => {
						if (it.kind === SymbolKind.Field && expg.test(it.name))
							items.push(convertNodeCompletion(it));
					});
				else {
					doc.children.forEach(it => {
						if (it.kind === SymbolKind.Field && expg.test(it.name))
							items.push(convertNodeCompletion(it));
					});
					for (const t in list) lexers[t].children.forEach(it => {
						if (it.kind === SymbolKind.Field && expg.test(it.name))
							items.push(convertNodeCompletion(it));
					});
				}
				if (t === '' || temp[3])
					return items;
				else for (let it of items)
					it.insertText = `'${it.insertText}'`;
			} else if (istr) {
				let res = getFuncCallInfo(doc, position);
				if (res) {
					let ismethod = lt.charAt(res.pos.character - 1) === '.';
					if (ismethod) {
						switch (res.name) {
							case 'add':
								if (res.index === 0) {
									let c = doc.buildContext(res.pos, true), ts: any = {};
									cleardetectcache(), detectExpType(doc, c.text.toLowerCase(), c.range.end, ts);
									if (ts['@gui.add'] !== undefined) {
										return ['Text', 'Edit', 'UpDown', 'Picture', 'Button', 'Checkbox', 'Radio', 'DropDownList',
											'ComboBox', 'ListBox', 'ListView', 'TreeView', 'Link', 'Hotkey', 'DateTime', 'MonthCal',
											'Slider', 'Progress', 'GroupBox', 'Tab', 'Tab2', 'Tab3', 'StatusBar', 'ActiveX', 'Custom'].map(maptextitem);
									}
								}
								break;
							case 'onevent':
								if (res.index === 0) {
									let c = doc.buildContext(res.pos, true), ts: any = {};
									cleardetectcache(), detectExpType(doc, c.text.toLowerCase(), c.range.end, ts);
									if (ts['@gui.onevent'] !== undefined)
										return ['Close', 'ContextMenu', 'DropFiles', 'Escape', 'Size'].map(maptextitem);
									else if (ts['gui.@control.onevent'] !== undefined)
										return ['Change', 'Click', 'DoubleClick', 'ColClick',
											'ContextMenu', 'Focus', 'LoseFocus', 'ItemCheck',
											'ItemEdit', 'ItemExpand', 'ItemFocus', 'ItemSelect'].map(maptextitem);;
								}
								break;
							case 'bind':
							case 'call': {
								let t = doc.buildContext(res.pos, true).text.toLowerCase();
								let n = searchNode(doc, t, res.pos, SymbolKind.Method)?.[0].node;
								if (n && (<FuncNode>n).full?.match(/\(func\)\s+\w+\(/i)) {
									res.name = t.slice(0, -5);
									ismethod = false;
								} else if (n && n.kind === SymbolKind.Function) {
									res.name = n.name.toLowerCase();
									ismethod = false;
								}
								break;
							}
						}
					}
					if (!ismethod && isbuiltin(res.name, res.pos)) {
						switch (res.name) {
							case 'dynacall':
								if (res.index !== 0)
									break;
							case 'dllcall':
								if (!isbuiltin(res.name, res.pos)) break;
								if (res.index === 0) {
									if (inBrowser) break;
									let tk = doc.tokens[doc.document.offsetAt(res.pos)], offset = doc.document.offsetAt(position);
									if (!tk) break;
									while ((tk = doc.tokens[tk.next_token_offset]) && tk.content === '(')
										continue;
									if (tk && tk.type === 'TK_STRING' && offset > tk.offset && offset <= tk.offset + tk.length) {
										let pre = tk.content.substring(1, offset - tk.offset);
										let docs = [doc], files: any = {};
										for (let u in list) docs.push(lexers[u]);
										items.splice(0);
										if (!pre.match(/[\\/]/)) {
											docs.forEach(d => d.dllpaths.forEach(path => {
												path = path.replace(/^.*[\\/]/, '').replace(/\.dll$/i, '');
												if (!files[l = path.toLowerCase()])
													files[l] = true, additem(path + '\\', CompletionItemKind.File);
											}));
											readdirSync('C:\\Windows\\System32').forEach(file => {
												if (file.toLowerCase().endsWith('.dll') && expg.test(file = file.slice(0, -4)))
													additem(file + '\\', CompletionItemKind.File);
											});
											winapis.forEach(f => { if (expg.test(f)) additem(f, CompletionItemKind.Function); });
											return items;
										} else {
											let dlls: { [key: string]: any } = {}, onlyfile = true;
											l = pre.replace(/[\\/][^\\/]*$/, '').replace(/\\/g, '/').toLowerCase();
											if (!l.match(/\.\w+$/))
												l = l + '.dll';
											if (l.includes(':')) onlyfile = false, dlls[l] = 1;
											else if (l.includes('/')) {
												if (l.startsWith('/'))
													dlls[doc.scriptpath + l] = 1;
												else dlls[doc.scriptpath + '/' + l] = 1;
											} else {
												docs.forEach(d => {
													d.dllpaths.forEach(path => {
														if (path.endsWith(l)) {
															dlls[path] = 1;
															if (onlyfile && path.includes('/'))
																onlyfile = false;
														}
													});
													if (onlyfile)
														dlls[l] = dlls[d.scriptpath + '/' + l] = 1;
												});
											}
											utils.get_DllExport(Object.keys(dlls), true).forEach(it => additem(it, CompletionItemKind.Function));
											return items;
										}
									}
								} else if (res.index > 0 && res.index % 2 === 1) {
									for (const name of ['cdecl'].concat(dllcalltpe))
										additem(name, CompletionItemKind.TypeParameter), cpitem.commitCharacters = ['*'];
									return items;
								}
								break;
							case 'comcall':
								if (res.index > 1 && res.index % 2 === 0) {
									for (const name of ['cdecl'].concat(dllcalltpe))
										additem(name, CompletionItemKind.TypeParameter), cpitem.commitCharacters = ['*'];
									return items;
								}
								break;
							case 'comobject':
								if (res.index === 0) {
									let ids = (await sendAhkRequest('GetProgID', []) ?? []) as string[];
									ids.forEach(s => additem(s, CompletionItemKind.Unit));
									return items;
								}
								break;
							case 'numget':
								if (res.index === 2 || res.index === 1) {
									for (const name of dllcalltpe.filter(v => (v.match(/str$/i) ? false : true)))
										additem(name, CompletionItemKind.TypeParameter);
									return items;
								}
								break;
							case 'numput':
								if (res.index % 2 === 0) {
									for (const name of dllcalltpe.filter(v => (v.match(/str$/i) ? false : true)))
										additem(name, CompletionItemKind.TypeParameter);
									return items;
								}
								break;
							case 'objbindmethod':
								if (res.index === 1) {
									let ns: any, funcs: { [key: string]: any } = {};
									['NEW', 'DELETE', 'GET', 'SET', 'CALL'].forEach(it => { funcs['__' + it] = true; });
									if (temp = context.pre.match(/objbindmethod\(\s*(([\w.]|[^\x00-\x7f])+)\s*,/i)) {
										let ts: any = {}, nd = new Lexer(TextDocument.create('', 'ahk2', -10, '_:=' + temp[1]));
										let ret = (nd.parseScript(), nd.children.shift() as FuncNode)?.returntypes ?? {};
										cleardetectcache(), detectExpType(doc, Object.keys(ret).pop() ?? '', position, ts);
										if (ts['#any'] === undefined) {
											for (const tp in ts) {
												if (ts[tp] === false) {
													ns = searchNode(doc, tp, position, SymbolKind.Class);
												} else if (ts[tp])
													ns = [ts[tp]];
												ns?.forEach((it: any) => {
													Object.values(getClassMembers(doc, it.node, !tp.match(/[@#][^.]+$/))).forEach(it => {
														if (it.kind === SymbolKind.Method && !funcs[temp = it.name.toUpperCase()] && expg.test(temp))
															funcs[temp] = true, additem(it.name, CompletionItemKind.Method);
													});
												});
											}
										}
									}
									if (!ns) {
										let meds = [doc.object.method];
										for (const uri in list)
											meds.push(lexers[uri].object.method);
										for (const med of meds)
											for (const it in med)
												if (!funcs[it] && expg.test(it))
													funcs[it] = true, additem(med[it][0].name, CompletionItemKind.Method);
									}
									return items;
								}
								break;
							case 'processsetpriority':
								if (res.index === 0)
									return ['Low', 'BelowNormal', 'Normal', 'AboveNormal', 'High', 'Realtime'].map(maptextitem);
								break;
							case 'thread':
								if (res.index === 0)
									return ['NoTimers', 'Priority', 'Interrupt'].map(maptextitem);
								break;
							case 'settitlematchmode':
								if (res.index === 0)
									return ['Fast', 'Slow', 'RegEx'].map(maptextitem);
								break;
							case 'setnumlockstate':
							case 'setcapslockstate':
							case 'setscrolllockstate':
								if (res.index === 0)
									return ['On', 'Off', 'AlwaysOn', 'AlwaysOff'].map(maptextitem);
								break;
							case 'sendmode':
								if (res.index === 0)
									return ['Event', 'Input', 'InputThenPlay', 'Play'].map(maptextitem);
								break;
							case 'blockinput':
								if (res.index === 0)
									return ['On', 'Off', 'Send', 'Mouse', 'SendAndMouse', 'Default', 'MouseMove', 'MouseMoveOff'].map(maptextitem);
								break;
							case 'coordmode':
								if (res.index === 0)
									return ['ToolTip', 'Pixel', 'Mouse', 'Caret', 'Menu'].map(maptextitem);
								else if (res.index === 1)
									return ['Screen', 'Window', 'Client'].map(maptextitem);
								break;
						}
					}
				}
				if (other)
					completionItemCache.other.forEach(it => {
						if (it.kind === CompletionItemKind.Text && expg.test(it.label))
							vars[it.label.toUpperCase()] = true, items.push(it);
					});
				for (const t in vars)
					txs[t] = true;
				for (const t in doc.texts)
					if (!txs[t] && expg.test(t))
						txs[t] = true, additem(doc.texts[t], CompletionItemKind.Text);
				for (const u in list)
					for (const t in (temp = lexers[u].texts))
						if (!txs[t] && expg.test(t))
							txs[t] = true, additem(temp[t], CompletionItemKind.Text);
				return items;
			} else if (percent)
				other = false;
			else if (!tk.content && !lt.includes('::'))
				return completionItemCache.other.filter(it => it.kind === CompletionItemKind.Text);

			let c = extsettings.FormatOptions.brace_style === 0 ? '\n' : ' ';
			if (other)
				for (let [label, arr] of [
					['switch', ['switch ${1:[SwitchValue, CaseSense]}', '{\n\tcase ${2:}:\n\t\t${3:}\n\tdefault:\n\t\t$0\n}']],
					['trycatch', ['try', '{\n\t$1\n}', 'catch ${2:Error} as ${3:e}', '{\n\t$0\n}']],
					['class', ['class $1', '{\n\t$0\n}']]
				] as [string, string[]][])
					items.push({ label, kind: CompletionItemKind.Keyword, insertTextFormat: InsertTextFormat.Snippet, insertText: arr.join(c) });
			if (scopenode ??= doc.searchScopedNode(position)) {
				if (scopenode.kind === SymbolKind.Class) {
					let metafns = ['__Init()', '__Call(${1:Name}, ${2:Params})', '__Delete()',
						'__Enum(${1:NumberOfVars})', '__Get(${1:Key}, ${2:Params})',
						'__Item[$1]', '__New($1)', '__Set(${1:Key}, ${2:Params}, ${3:Value})'
					], cls = scopenode as ClassNode, top = context.token?.topofline;
					if (top === 2 || (context.symbol as FuncNode)?.static) {
						metafns.splice(0, 1), items.length = 0;
						Object.values(cls.staticdeclaration).forEach(it => additem(it.name, it.kind === SymbolKind.Class
							? CompletionItemKind.Class : it.kind === SymbolKind.Method
								? CompletionItemKind.Method : CompletionItemKind.Property));
					} else {
						if (top === 1)
							items.push({ label: 'static', kind: CompletionItemKind.Keyword, insertText: 'static ' })
								, items = items.splice(-2, 2);
						Object.values(cls.declaration).forEach(it => additem(it.name,
							it.kind === SymbolKind.Method ? CompletionItemKind.Method : CompletionItemKind.Property));
					}
					if (top) {
						metafns.forEach(s => {
							let label = s.replace(/[(\[].*$/, '');
							if (!vars[label.toUpperCase()])
								items.push({
									label, kind: CompletionItemKind.Method,
									insertTextFormat: InsertTextFormat.Snippet,
									insertText: s + c + '{\n\t$0\n}'
								});
						});
					}
					return items;
				} else if (scopenode.kind === SymbolKind.Property && scopenode.children)
					return [{ label: 'get', kind: CompletionItemKind.Function }, { label: 'set', kind: CompletionItemKind.Function }]
			}
			for (const n in ahkvars)
				if (expg.test(n))
					vars[n] = convertNodeCompletion(ahkvars[n]);
			Object.values(doc.declaration).forEach(it => {
				if (expg.test(l = it.name.toUpperCase()) && !ateditpos(it) && (!vars[l] || it.kind !== SymbolKind.Variable))
					vars[l] = convertNodeCompletion(it);
			});
			for (const t in list) {
				path = list[t];
				for (const n in (temp = lexers[t]?.declaration)) {
					if (expg.test(n) && (!vars[n] || (vars[n].kind === CompletionItemKind.Variable && temp[n].kind !== SymbolKind.Variable))) {
						cpitem = convertNodeCompletion(temp[n]), cpitem.detail = `${completionitem.include(path)}  ` + (cpitem.detail || '');
						vars[n] = cpitem;
					}
				}
			}
			if (scopenode) {
				position = context.range.end;
				Object.entries(doc.getScopeChildren(scopenode)).forEach(([l, it]) => {
					if (expg.test(l) && (it.def !== false || !vars[l] && (
						it.selectionRange.end.line !== position.line || it.selectionRange.end.character !== position.character)))
						vars[l] = convertNodeCompletion(it);
				});
			}
			completionItemCache.other.forEach(it => {
				if (expg.test(it.label)) {
					if (it.kind === CompletionItemKind.Function) {
						vars[it.label.toUpperCase()] ??= it;
					} else if (other && it.kind !== CompletionItemKind.Text)
						items.push(it);
				}
			});
			if (!scopenode && !percent) {
				if (lt.includes('::'))
					items.push(...completionItemCache.key);
				else
					items.push(...completionItemCache.key.filter(it => !it.label.toLowerCase().includes('alttab')));
			}
			let dir = inWorkspaceFolders(doc.document.uri) || doc.scriptdir, exportnum = 0;
			if (extsettings.AutoLibInclude)
				for (const u in libfuncs) {
					if (!list || !list[u]) {
						path = URI.parse(u).fsPath;
						if ((extsettings.AutoLibInclude > 1 && (<any>libfuncs[u]).islib) || ((extsettings.AutoLibInclude & 1) && path.startsWith(dir))) {
							libfuncs[u].forEach(it => {
								if (!vars[l = it.name.toUpperCase()] && expg.test(l)) {
									cpitem = convertNodeCompletion(it);
									cpitem.detail = `${completionitem.include(path)}  ` + (cpitem.detail || '');
									cpitem.command = { title: 'ahk2.fix.include', command: 'ahk2.fix.include', arguments: [path, uri] };
									delete cpitem.commitCharacters;
									vars[l] = cpitem, exportnum++;
								}
							});
							if (exportnum > 300)
								break;
						}
					}
				}
			if (other) {
				items.push(...completionItemCache.snippet);
				if (triggerKind === 1 && context.text.length > 2 && context.text.includes('_')) {
					for (const it of completionItemCache.constant)
						if (expg.test(it.label))
							items.push(it);
				}
			}
			return items.concat(Object.values(vars));
	}
	function isbuiltin(name: string, pos: any) {
		let n = searchNode(doc, name, pos, SymbolKind.Variable)?.[0].node;
		return n && n === ahkvars[name];
	}
	function additem(label: string, kind: CompletionItemKind) {
		if (vars[l = label.toUpperCase()]) return;
		items.push(cpitem = CompletionItem.create(label)), cpitem.kind = kind, vars[l] = true;
	};
	function ateditpos(it: DocumentSymbol) {
		return it.selectionRange.end.line === line && character === it.selectionRange.end.character;
	}
	function maptextitem(name: string) {
		const cpitem = CompletionItem.create(name);
		cpitem.kind = CompletionItemKind.Text, cpitem.command = { title: 'cursorRight', command: 'cursorRight' };
		return cpitem
	}
	function convertNodeCompletion(info: any): CompletionItem {
		let ci = CompletionItem.create(info.name);
		switch (info.kind) {
			case SymbolKind.Function:
			case SymbolKind.Method:
				ci.kind = info.kind === SymbolKind.Method ? CompletionItemKind.Method : CompletionItemKind.Function;
				if (extsettings.CompleteFunctionParens) {
					if (right_is_paren)
						ci.command = { title: 'cursorRight', command: 'cursorRight' };
					else if ((<FuncNode>info).params.length) {
						ci.command = { title: 'Trigger Parameter Hints', command: 'editor.action.triggerParameterHints' };
						if ((<FuncNode>info).params[0].name.includes('|')) {
							ci.insertText = ci.label + '(${1|' + (<FuncNode>info).params[0].name.replace(/\|/g, ',') + '|})';
							ci.insertTextFormat = InsertTextFormat.Snippet;
						} else ci.insertText = ci.label + '($0)', ci.insertTextFormat = InsertTextFormat.Snippet;
					} else ci.insertText = ci.label + '()';
				} else
					ci.commitCharacters = commitCharacters.Function;
				ci.detail = info.full, ci.documentation = info.detail;
				break;
			case SymbolKind.Variable:
			case SymbolKind.TypeParameter:
				ci.kind = CompletionItemKind.Variable, ci.detail = info.detail; break;
			case SymbolKind.Class:
				ci.kind = CompletionItemKind.Class, ci.commitCharacters = commitCharacters.Class;
				ci.detail = 'class ' + (info.full || ci.label), ci.documentation = info.detail; break;
			case SymbolKind.Event:
				ci.kind = CompletionItemKind.Event; break;
			case SymbolKind.Field:
				ci.kind = CompletionItemKind.Field, ci.label = ci.insertText = ci.label.replace(/:$/, ''); break;
			case SymbolKind.Property:
				ci.kind = CompletionItemKind.Property, ci.detail = info.full || ci.label, ci.documentation = info.detail;
				if (info.get?.params.length)
					ci.insertTextFormat = InsertTextFormat.Snippet, ci.insertText = ci.label + '[$0]';
				break;
			default:
				ci.kind = CompletionItemKind.Text; break;
		}
		return ci;
	}
}