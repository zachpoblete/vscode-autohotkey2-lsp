import { TextDocument } from 'vscode-languageserver-textdocument';
import { Command, CompletionItem, CompletionItemKind, DocumentSymbol, Hover, InsertTextFormat, MarkupKind, Range, SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { FormatOptions, FuncNode, Lexer, update_commentTags } from './Lexer';
import { completionitem } from './localize';
import { Connection } from 'vscode-languageserver';
export * from './Lexer';
export * from './codeActionProvider';
export * from './colorProvider';
export * from './commandProvider';
export * from './completionProvider';
export * from './definitionProvider';
export * from './formattingProvider';
export * from './hoverProvider';
export * from './localize';
export * from './referencesProvider';
export * from './renameProvider';
export * from './scriptrunner';
export * from './semanticTokensProvider';
export * from './signatureProvider';
export * from './symbolProvider';
import { diagnostic } from './localize';

export const inBrowser = typeof process === 'undefined';
export let connection: Connection, ahkpath_cur = '', workspaceFolders: string[] = [], dirname = '', isahk2_h = false;
export let ahkvars: { [key: string]: DocumentSymbol } = {}, ahkuris: { [name: string]: string } = {};
export let libfuncs: { [uri: string]: DocumentSymbol[] } = {};
export let symbolcache: { [uri: string]: SymbolInformation[] } = {};
export let hoverCache: { [key: string]: [string, Hover] } = {}, libdirs: string[] = [];
export let lexers: { [key: string]: Lexer } = {}, pathenv: { [key: string]: string } = {};
export let completionItemCache: { [key: string]: CompletionItem[] } = { sharp: [], method: [], key: [], other: [], constant: [], snippet: [] };
export let dllcalltpe: string[] = [], extsettings: AHKLSSettings = {
	InterpreterPath: 'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey.exe',
	ActionWhenV1IsDetected: 'Warn',
	AutoLibInclude: 0,
	CommentTags: '^;;\\s*(.*)',
	CompleteFunctionParens: false,
	CompletionCommitCharacters: {
		Class: '.(',
		Function: '('
	},
	SymbolFoldingFromOpenBrace: false,
	Diagnostics: {
		ParamsCheck: true,
		ClassStaticMemberCheck: true
	},
	FormatOptions: {},
	WorkingDirs: []
};
export const chinese_punctuations: { [c: string]: string } = {
	'，': ',',
	'。': '.',
	'；': ';',
	'‘': "'",
	'’': "'",
	'【': '[',
	'】': ']',
	'《': '<',
	'》': '>',
	'？': '?',
	'：': ':',
	'“': '"',
	'”': '"',
	'（': '(',
	'）': ')',
	'！': '!'
};
export let winapis: string[] = [];
export let utils = {
	get_DllExport: (paths: string[], onlyone: boolean = false) => [] as string[],
	get_RCDATA: (path?: string) => (0 ? { uri: '', path: '' } : undefined),
	get_ahkProvider: async () => null as any
};

export let locale = 'en-us';
export type Maybe<T> = T | undefined;

enum LibIncludeType {
	'Disabled',
	'Local',
	'User and Standard',
	'All'
}

export type ActionType = 'Continue' | 'Warn' | 'SkipLine' | 'SwitchToV1' | 'Stop';
export interface AHKLSSettings {
	locale?: string
	commands?: string[]
	ActionWhenV1IsDetected: ActionType
	AutoLibInclude: LibIncludeType
	CommentTags: string
	CompleteFunctionParens: boolean
	CompletionCommitCharacters?: {
		Class: string
		Function: string
	}
	SymbolFoldingFromOpenBrace: boolean
	Diagnostics: {
		ParamsCheck: boolean
		ClassStaticMemberCheck: boolean
	}
	FormatOptions: FormatOptions
	InterpreterPath: string
	WorkingDirs: string[]
}

export function openFile(path: string, showError = true): TextDocument | undefined {
	if (inBrowser) {
		let data = getwebfile(path);
		if (data)
			return TextDocument.create(data.url, 'ahk2', -10, data.text);
		return undefined;
	} else {
		let buf: Buffer | string;
		try { buf = readFileSync(path); }
		catch (e: any) {
			connection.window.showErrorMessage(e.message);
			return undefined;
		}
		if (buf[0] === 0xff && buf[1] === 0xfe)
			buf = buf.toString('utf16le');
		else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
			buf = buf.toString('utf8').substring(1);
		else {
			try {
				buf = new TextDecoder('utf8', { fatal: true }).decode(buf);
			} catch {
				if (showError)
					connection.window.showErrorMessage(diagnostic.invalidencoding(path));
				return undefined;
			}
		}
		if (path === path.toLowerCase())
			path = restorePath(path);
		return TextDocument.create(URI.file(path).toString(), 'ahk2', -10, buf);
	}
}

export function restorePath(path: string): string {
	if (!existsSync(path))
		return path;
	if (path.includes('..'))
		path = resolve(path);
	let dirs = path.toUpperCase().split('\\'), i = 1, s = dirs[0];
	while (i < dirs.length) {
		for (const d of readdirSync(s + '\\')) {
			if (d.toUpperCase() === dirs[i]) {
				s += '\\' + d;
				break;
			}
		}
		i++;
	}
	return s.toLowerCase() === path ? s : path;
}

export function getlocalefilepath(filepath: string): string | undefined {
	let t = filepath.match(/<>./), s: string;
	if (t) {
		if (existsSync(s = filepath.replace('<>', locale)))
			return s;
		else if (locale.toLowerCase() === 'zh-tw' && existsSync(s = filepath.replace('<>', 'zh-cn')))
			return s;
		else if (existsSync(s = filepath.replace(t[0], '')))
			return s;
	} else if (existsSync(filepath))
		return filepath;
	return undefined;
}

export function getlocalefile(filepath: string, encoding?: string) {
	let path = getlocalefilepath(filepath);
	if (path)
		return readFileSync(path, encoding ? { encoding: encoding } : undefined);
	return undefined;
}

export function getwebfile(filepath: string) {
	let t = filepath.match(/<>./), s: string | undefined;
	let ff: string[] = [];
	let req = new XMLHttpRequest();
	if (t) {
		ff.push(filepath.replace('<>', locale));
		if (locale.toLowerCase() === 'zh-tw')
			ff.unshift(filepath.replace('<>', 'zh-cn'));
		ff.unshift(filepath.replace(t[0], ''));
	} else ff.push(filepath);
	if (s = ff.pop())
		return get(s);

	function get(url: string): { url: string, text: string } | undefined {
		req.open('GET', url, false);
		req.send();
		if (req.status === 200) {
			return { url, text: req.responseText };
		} else if (s = ff.pop())
			return get(s);
		return undefined;
	}
}

export function sendDiagnostics() {
	let doc: Lexer;
	for (const uri in lexers) {
		doc = lexers[uri];
		connection.sendDiagnostics({
			uri: doc.document.uri,
			diagnostics: (!doc.actived && (!doc.relevance || !Object.keys(doc.relevance).length) ? [] : doc.diagnostics)
		});
	}
}

export function initahk2cache() {
	ahkvars = {}, ahkuris = {};
	dllcalltpe = ['str', 'astr', 'wstr', 'int64', 'int', 'uint', 'short', 'ushort', 'char', 'uchar', 'float', 'double', 'ptr', 'uptr', 'hresult'];
	completionItemCache = {
		sharp: [],
		method: [],
		key: [],
		other: [],
		constant: [],
		snippet: !inBrowser && process.env.AHK2_LS_CONFIG ? [] : [{
			label: 'zs-Comment',
			detail: completionitem.comment(),
			kind: CompletionItemKind.Snippet,
			command: { title: 'ahk2.generate.comment', command: 'ahk2.generate.comment', arguments: [] }
		},
		{
			label: 'zs-Author',
			detail: completionitem.author(),
			kind: CompletionItemKind.Snippet,
			command: { title: 'ahk2.generate.author', command: 'ahk2.generate.author' }
		}]
	};
}

export async function loadahk2(filename = 'ahk2') {
	let path: string | undefined;
	if (inBrowser) {
		const file = dirname + `/syntaxes/<>/${filename}`;
		let td = openFile(file + '.d.ahk');
		if (td) {
			let doc = new Lexer(td, undefined, 3);
			doc.parseScript(), lexers[doc.uri] = doc, ahkuris[filename] = doc.uri;
		}
		let data;
		if (filename === 'ahk2')
			if (data = getwebfile(dirname + '/syntaxes/ahk2_common.json'))
				build_item_cache(JSON.parse(data.text));
		if (data = getwebfile(file + '.json'))
			build_item_cache(JSON.parse(data.text));
	} else {
		const file = resolve(__dirname, `../../syntaxes/<>/${filename}`);
		let td: TextDocument | undefined;
		if ((path = getlocalefilepath(file + '.d.ahk')) && (td = openFile(path))) {
			let doc = new Lexer(td, undefined, 3);
			doc.parseScript(), lexers[doc.uri] = doc, ahkuris[filename] = doc.uri;
		}
		if (!(path = getlocalefilepath(file + '.json')))
			return;
		if (filename === 'ahk2')
			build_item_cache(JSON.parse(readFileSync(resolve(__dirname, '../../syntaxes/ahk2_common.json'), { encoding: 'utf8' })));
		build_item_cache(JSON.parse(readFileSync(path, { encoding: 'utf8' })));
	}
}

function build_item_cache(ahk2: any) {
	const cmd: Command = { title: 'Trigger Parameter Hints', command: 'editor.action.triggerParameterHints' };
	let type: CompletionItemKind, t = '', snip: { prefix: string, body: string, description?: string }, rg = Range.create(0, 0, 0, 0);
	for (const key in ahk2) {
		if (key === 'snippet') {
			for (snip of ahk2['snippet']) {
				const completionItem = CompletionItem.create(snip.prefix);
				completionItem.kind = CompletionItemKind.Snippet;
				completionItem.insertText = bodytostring(snip.body);
				completionItem.detail = snip.description;
				completionItem.insertTextFormat = InsertTextFormat.Snippet;
				completionItemCache.snippet.push(completionItem);
			}
		} else if (key === 'keys') {
			for (snip of ahk2['keys']) {
				const completionItem = CompletionItem.create(snip.prefix);
				completionItem.kind = CompletionItemKind.Keyword;
				completionItem.insertText = snip.body;
				completionItem.detail = snip.description;
				completionItemCache.key.push(completionItem);
			}
		} else {
			let arr: any[] = ahk2[key];
			switch (key) {
				case 'keywords': type = CompletionItemKind.Keyword; break;
				case 'variables':
					for (snip of arr) {
						ahkvars[snip.prefix.toUpperCase()] = {
							name: snip.prefix,
							kind: SymbolKind.Variable,
							range: rg, selectionRange: rg,
							detail: snip.description
						};
					}
					continue;
				case 'constants': type = CompletionItemKind.Constant; break;
				default: type = CompletionItemKind.Text; break;
			}
			for (snip of arr) additem();
		}
	}

	function additem() {
		const completionItem = CompletionItem.create(snip.prefix.replace('.', '')), hover: Hover = { contents: [] }, _low = snip.prefix.toLowerCase();
		completionItem.kind = type, completionItem.insertTextFormat = InsertTextFormat.Snippet;
		if (type === CompletionItemKind.Constant)
			completionItem.insertText = '${1:' + snip.prefix + ' := }' + snip.body + '$0', completionItem.detail = snip.description ?? snip.body, t = 'constant';
		else if (snip.prefix.startsWith('#'))
			t = 'sharp', snip.body = bodytostring(snip.body), completionItem.insertText = snip.body.replace(/^#/, ''), completionItem.detail = snip.description;
		else if (t = 'other', type === CompletionItemKind.Function && snip.body.indexOf('|}') === -1 && snip.body.indexOf('(') !== -1)
			completionItem.insertText = snip.prefix + '($0)', completionItem.command = cmd, completionItem.detail = snip.description;
		else completionItem.insertText = snip.body.replace(/\$\{\d:\s*\[,[^\]\}]+\]\}/, () => {
			completionItem.command = cmd;
			return '';
		}), completionItem.detail = snip.description;
		snip.body = snip.body.replace(/\$\{\d+((\|)|:)([^}]*)\2\}|\$\d/g, (...m) => {
			return m[2] ? m[3].replace(/,/g, '|') : m[3] || '';
		});
		completionItem.documentation = { kind: MarkupKind.Markdown, value: '```ahk2\n' + snip.body + '\n```' };
		completionItemCache[t].push(completionItem);
		if (type === CompletionItemKind.Constant || type === CompletionItemKind.Text || !snip.description)
			return;
		hover.contents = { kind: MarkupKind.Markdown, value: '```ahk2\n' + snip.body + '\n```\n\n' + snip.description };
		hoverCache[_low] = [snip.prefix, hover];
	}
	function bodytostring(body: any) { return (typeof body === 'object' ? body.join('\n') : body) };
}

export function getallahkfiles(dirpath: string, maxdeep = 3): string[] {
	let files: string[] = [];
	if (existsSync(dirpath) && statSync(dirpath).isDirectory())
		enumfile(dirpath, 0);
	return files;

	function enumfile(dirpath: string, deep: number) {
		readdirSync(dirpath).forEach(file => {
			let path = resolve(dirpath, file);
			if (statSync(path).isDirectory()) {
				if (deep < maxdeep)
					enumfile(path, deep + 1);
			} else if (file.match(/\.(ahk2?|ah2)$/i))
				files.push(path.toLowerCase());
		});
	}
}

export function inWorkspaceFolders(uri: string) {
	uri = uri.toLowerCase();
	for (let f of extsettings.WorkingDirs.concat(workspaceFolders))
		if (uri.startsWith(f))
			return f;
	return '';
}

export async function parseWorkspaceFolders() {
	let l: string;
	if (inBrowser) {
		let uris = (await connection.sendRequest('ahk2.getWorkspaceFiles', []) || []) as string[];
		for (let uri of uris)
			if (!lexers[l = uri.toLowerCase()]) {
				let v = await connection.sendRequest('ahk2.getWorkspaceFileContent', [uri]) as string;
				if (v) {
					let d = new Lexer(TextDocument.create(uri, 'ahk2', -10, v));
					d.parseScript();
					if (d.maybev1) {
						d.close();
						continue;
					}
					lexers[l] = d;
					await sleep(100);
				}
			}
	} else {
		for (let uri of workspaceFolders) {
			let dir = URI.parse(uri).fsPath, t;
			for (let file of getallahkfiles(dir)) {
				l = URI.file(file).toString().toLowerCase();
				if (!lexers[l] && (t = openFile(file, false))) {
					let d = new Lexer(t);
					d.parseScript();
					if (d.maybev1) {
						d.close();
						continue;
					}
					lexers[l] = d;
					await sleep(100);
				}
			}
		}
	}
}

export function update_settings(configs: AHKLSSettings) {
	if (typeof configs.AutoLibInclude === 'string')
		configs.AutoLibInclude = LibIncludeType[configs.AutoLibInclude] as unknown as LibIncludeType;
	else if (typeof configs.AutoLibInclude === 'boolean')
		configs.AutoLibInclude = configs.AutoLibInclude ? 3 : 0;
	if (typeof configs.FormatOptions.brace_style === 'string')
		switch (configs.FormatOptions.brace_style) {
			case '0':
			case 'Allman': configs.FormatOptions.brace_style = 0; break;
			case '1':
			case 'One True Brace': configs.FormatOptions.brace_style = 1; break;
			case '-1':
			case 'One True Brace Variant': configs.FormatOptions.brace_style = -1; break;
			default: delete configs.FormatOptions.brace_style; break;
		}
	try {
		update_commentTags(configs.CommentTags);
	} catch (e: any) {
		connection.console.error(e.message);
		configs.CommentTags = extsettings.CommentTags;
	}
	if (configs.WorkingDirs instanceof Array)
		configs.WorkingDirs = configs.WorkingDirs.map(dir => (dir = URI.file(dir).toString().toLowerCase()).endsWith('/') ? dir : dir + '/');
	else delete (configs as any).WorkingDirs;
	Object.assign(extsettings, configs);
}

export async function sendAhkRequest(method: string, params: any[]) {
	if (inBrowser)
		return undefined;
	return utils.get_ahkProvider().then((server: any) => server?.sendRequest(method, ...params));
}

export function clearLibfuns() { libfuncs = {}; }
export function set_ahk_h(v: boolean) { isahk2_h = v; }
export function set_ahkpath(path: string) { ahkpath_cur = path; }
export function set_Connection(conn: Connection) { connection = conn; }
export function set_dirname(dir: string) { dirname = dir.replace(/[/\\]$/, ''); }
export function set_locale(str?: string) { if (str) locale = str.toLowerCase(); }
export function set_Workspacefolder(folders?: string[]) { workspaceFolders = folders || []; }

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
