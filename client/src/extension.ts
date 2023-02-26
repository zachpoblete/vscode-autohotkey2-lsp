/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
	commands,
	ConfigurationTarget,
	debug,
	DebugConfiguration,
	ExtensionContext,
	extensions,
	languages,
	OutputChannel,
	QuickPickItem,
	Range,
	SnippetString,
	StatusBarAlignment,
	StatusBarItem,
	TextEditor,
	Uri,
	window,
	workspace,
	WorkspaceEdit
} from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';
import * as child_process from 'child_process';
import { resolve } from 'path';
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';

let client: LanguageClient, outputchannel: OutputChannel, ahkStatusBarItem: StatusBarItem;
let ahkprocess: child_process.ChildProcess | undefined;
let ahkpath_cur = '', server_is_ready = false, zhcn = false;
const ahkconfig = workspace.getConfiguration('AutoHotkey2');
const textdecoders: TextDecoder[] = [new TextDecoder('utf8', { fatal: true }), new TextDecoder('utf-16le', { fatal: true })];

export async function activate(context: ExtensionContext) {
	// The server is implemented in node
	let serverModule: string, serverPath = process.env.VSCODE_AHK_SERVER_PATH;
	if (serverPath) serverModule = context.asAbsolutePath(`server/${serverPath}/server.js`);
	else serverModule = context.asAbsolutePath('server/' + __dirname.replace(/^.*[\\/]/, '') + '/server.js');

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: { kind: TransportKind.socket, port: 1219 },
			options: { execArgv: ['--nolazy', '--inspect=6009'] }
		}
	};

	const request_handlers: { [cmd: string]: any } = {
		'ahk2.executeCommands': async (params: { command: string, args?: string[], wait?: boolean }[]) => {
			let result: any[] = [];
			for (const cmd of params)
				result.push(cmd.wait ? await commands.executeCommand(cmd.command, cmd.args) : commands.executeCommand(cmd.command, cmd.args));
			return result;
		},
		'ahk2.getActiveTextEditorUriAndPosition': (params: any) => {
			const editor = window.activeTextEditor;
			if (!editor) return;
			const uri = editor.document.uri.toString(), position = editor.selection.end;
			return { uri, position };
		},
		'ahk2.insertSnippet': async (params: [string, Range?]) => {
			let editor = window.activeTextEditor;
			if (!editor) return;
			if (params[1]) {
				let { start, end } = params[1];
				await editor.insertSnippet(new SnippetString(params[0]), new Range(start.line, start.character, end.line, end.character));
			} else
				editor.insertSnippet(new SnippetString(params[0]));
		},
		'ahk2.setTextDocumentLanguage': async (params: [string, string?]) => {
			let lang = params[1] || 'ahk';
			if (!langs.includes(lang)) {
				window.showErrorMessage(`Unknown language id: ${lang}`);
				return;
			}
			let uri = params[0], it = workspace.textDocuments.find(it => it.uri.toString() === uri);
			it && languages.setTextDocumentLanguage(it, lang);
		},
		'ahk2.updateStatusBar': async (params: [string]) => {
			ahkpath_cur = params[0];
			onDidChangegetInterpreter();
		}
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: 'ahk2' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		},
		outputChannel: outputchannel = window.createOutputChannel('AutoHotkey2', '~ahk2-output'),
		outputChannelName: 'AutoHotkey2',
		initializationOptions: {
			commands: Object.keys(request_handlers), ...ahkconfig
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient('ahk2', 'AutoHotkey2', serverOptions, clientOptions);
	zhcn = client.getLocale().startsWith('zh-');
	textdecoders.push(new TextDecoder(zhcn ? 'gbk' : 'windows-1252'));

	// Start the client. This will also launch the server
	client.start().then(() => {
		Object.entries(request_handlers).forEach(handler => client.onRequest(...handler));
		onDidChangegetInterpreter();
		if (window.activeTextEditor?.document.languageId === 'ahk2')
			ahkStatusBarItem.show();
		server_is_ready = true;
	});

	let extlist: string[], debugexts: { [type: string]: string }, langs: string[] = [];
	function update_extensions_info() {
		debugexts = {};
		for (const ext of extensions.all) {
			if (ext.id.match(/ahk|autohotkey/i) && ext.packageJSON?.contributes?.debuggers) {
				for (const debuger of ext.packageJSON.contributes.debuggers)
					if (debuger.type)
						debugexts[debuger.type] = ext.id;
			}
		}
		extlist = Object.values(debugexts);
		languages.getLanguages().then(all => langs = all);
	}
	update_extensions_info();

	commands.executeCommand('setContext', 'ahk2:isRunning', false);
	ahkStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 75);
	ahkStatusBarItem.command = 'ahk2.setinterpreter';
	context.subscriptions.push(
		ahkStatusBarItem, outputchannel,
		extensions.onDidChange(() => update_extensions_info()),
		commands.registerCommand('ahk2.run', () => runCurrentScriptFile()),
		commands.registerCommand('ahk2.selection.run', () => runCurrentScriptFile(true)),
		commands.registerCommand('ahk2.stop', () => stopRunningScript()),
		commands.registerCommand('ahk2.compile', () => compileScript()),
		commands.registerCommand('ahk2.help', () => quickHelp()),
		commands.registerCommand('ahk2.debug', async () => begindebug(extlist, debugexts)),
		commands.registerCommand('ahk2.debug.attach', async () => begindebug(extlist, debugexts, false, true)),
		commands.registerCommand('ahk2.debug.params', async () => begindebug(extlist, debugexts, true)),
		commands.registerCommand('ahk2.setinterpreter', () => setInterpreter()),
		commands.registerCommand('ahk2.updateversioninfo', () => updateVersionInfo()),
		commands.registerCommand('ahk2.switch', () => {
			const doc = window.activeTextEditor?.document;
			if (doc) languages.setTextDocumentLanguage(doc, doc.languageId === 'ahk2' ? 'ahk' : 'ahk2');
		}),
		workspace.registerTextDocumentContentProvider('ahkres', {
			provideTextDocumentContent(uri: Uri, token) {
				return client.sendRequest('ahk2.getContent', uri.toString()).then(content => {
					setTimeout(() => {
						let it = workspace.textDocuments.find(it => it.uri.scheme === 'ahkres' && it.uri.path === uri.path);
						it && languages.setTextDocumentLanguage(it, 'ahk2');
					}, 100);
					return content as string;
				});
			}
		}),
		workspace.onDidCloseTextDocument(e => {
			client.sendNotification('onDidCloseTextDocument', e.isClosed ?
				{ uri: '', id: '' } : { uri: e.uri.toString(), id: e.languageId });
		}),
		window.onDidChangeActiveTextEditor(e => e?.document.languageId === 'ahk2'
			? ahkStatusBarItem.show() : ahkStatusBarItem.hide()),
	);
}

export function deactivate() {
	return client?.stop();
}

function decode(buf: Buffer) {
	for (let td of textdecoders) {
		try {
			return td.decode(buf);
		} catch { };
	}
	return buf.toString();
}

async function runCurrentScriptFile(selection = false): Promise<void> {
	let editor = window.activeTextEditor, executePath = ahkpath_cur || ahkconfig.InterpreterPath as string;
	if (!editor) return;
	if (executePath && !executePath.includes(':'))
		executePath = resolve(workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath ?? '', executePath);
	if (!executePath || !existsSync(executePath)) {
		executePath ||= 'AutoHotkey.exe';
		window.showErrorMessage(zhcn ? `"${executePath}"未找到!` : `"${executePath}" not find!`);
		return;
	}
	let selecttext = '', path = '*', command = `"${executePath}" /ErrorStdOut=utf-8 `;
	let startTime: Date;
	await stopRunningScript(true);
	outputchannel.show(true), outputchannel.clear();
	if (selection || editor.document.isUntitled)
		selecttext = editor.document.getText(editor.selection);
	executePath.replace(/^(.+[\\/])AutoHotkeyUX\.exe$/i, (...m) => {
		let lc = m[1] + 'launcher.ahk';
		if (existsSync(lc))
			command = `"${executePath}" "${lc}" `;
		return '';
	})
	if (selecttext !== '') {
		if (ahkStatusBarItem.text.endsWith('[UIAccess]')) {
			path = resolve(__dirname, 'temp.ahk');
			writeFileSync(path, selecttext);
			command += `"${path}"`, outputchannel.appendLine('[Running] ' + command), startTime = new Date();
			ahkprocess = child_process.spawn(command, { cwd: `${resolve(editor.document.fileName, '..')}`, shell: true });
		} else {
			command += path, outputchannel.appendLine('[Running] ' + command), startTime = new Date();
			ahkprocess = child_process.spawn(command, { cwd: `${resolve(editor.document.fileName, '..')}`, shell: true });
			ahkprocess.stdin?.write(selecttext), ahkprocess.stdin?.end(), path = '';
		}
	} else {
		commands.executeCommand('workbench.action.files.save');
		path = editor.document.fileName, command += `"${path}"`;
		outputchannel.appendLine('[Running] ' + command), startTime = new Date();
		ahkprocess = child_process.spawn(command, { cwd: resolve(path, '..'), shell: true }), path = '';
	}
	if (ahkprocess) {
		commands.executeCommand('setContext', 'ahk2:isRunning', true);
		ahkprocess.stderr?.on('data', (data) => {
			outputchannel.appendLine(`[Error] ${decode(data)}`);
		});
		ahkprocess.on('error', (error) => {
			console.error(error.message);
		});
		ahkprocess.stdout?.on('data', (data) => {
			outputchannel.append(decode(data));
		});
		ahkprocess.on('exit', (code) => {
			outputchannel.appendLine('');
			outputchannel.appendLine('[Done] exited with code=' + code + ' in ' + ((new Date()).getTime() - startTime.getTime()) / 1000 + ' seconds');
			ahkprocess = undefined;
			commands.executeCommand('setContext', 'ahk2:isRunning', false);
			if (path)
				unlinkSync(path);
		});
	} else
		commands.executeCommand('setContext', 'ahk2:isRunning', false);
}

async function stopRunningScript(wait = false) {
	if (ahkprocess) {
		child_process.execSync('taskkill /pid ' + ahkprocess.pid + ' /T /F');
		if (wait) {
			while (ahkprocess)
				await sleep(200);
		}
	}
}

async function compileScript() {
	let editor = window.activeTextEditor;
	if (!editor) return;
	let cmd = '', cmdop = ahkconfig.CompilerCMD as string;
	let ws = workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath ?? '';
	let compilePath = findfile(['Compiler\\Ahk2Exe.exe', '..\\Compiler\\Ahk2Exe.exe'], ws);
	let executePath = ahkpath_cur || getInterpreterPath().path;
	if (!compilePath) {
		window.showErrorMessage(zhcn ? `"Ahk2Exe.exe"未找到!` : `"Ahk2Exe.exe" was not found!`);
		return;
	}
	if (!executePath || !existsSync(executePath)) {
		executePath ||= 'AutoHotkey.exe';
		window.showErrorMessage(zhcn ? `"${executePath}"未找到!` : `"${executePath}" was not found!`);
		return;
	}
	if (editor.document.isUntitled) {
		window.showErrorMessage(zhcn ? '编译前请先保存脚本' : 'Please save the script before compiling');
		return;
	}
	commands.executeCommand('workbench.action.files.save');
	const currentPath = editor.document.uri.fsPath;
	const exePath = currentPath.replace(/\.\w+$/, '.exe');
	try {
		if (existsSync(exePath))
			unlinkSync(exePath);
	} catch (e: any) {
		window.showErrorMessage(e.message);
		return;
	}
	cmdop = cmdop.replace(/(['"]?)\$\{execPath\}\1/gi, `"${executePath}"`);
	if (cmdop.match(/\bahk2exe\w*\.exe/i)) {
		cmd = cmdop + ' /in ' + currentPath;
		if (!cmd.toLowerCase().includes(' /out '))
			cmd += '/out "' + exePath + '"';
	} else {
		cmd = `"${compilePath}" ${cmdop} /in "${currentPath}" `;
		if (!cmdop.toLowerCase().includes(' /out '))
			cmd += '/out "' + exePath + '"';
	}
	let process = child_process.exec(cmd, { cwd: resolve(currentPath, '..') });
	if (process.pid) {
		if ((cmd += ' ').toLowerCase().includes(' /gui '))
			return;
		outputchannel.show(true);
		outputchannel.clear();
		process.on('exit', () => {
			if (existsSync(exePath))
				window.showInformationMessage(zhcn ? '编译成功!' : 'Compiled successfully!');
			else
				window.showErrorMessage(zhcn ? '编译失败!' : 'Compiled failed!');
		});
		process.stderr?.on('data', (error) => outputchannel.appendLine(error));
		process.stdout?.on('data', (msg) => outputchannel.appendLine(msg));
	} else
		window.showErrorMessage(zhcn ? '编译失败!' : 'Compilation failed!');
}

async function quickHelp() {
	const editor = window.activeTextEditor;
	if (!editor) return;
	const document = editor.document, position = editor.selection.active;
	const range = document.getWordRangeAtPosition(position), line = position.line;
	let helpPath = findfile(['AutoHotkey.chm'], workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath ?? '');
	let word = '';
	if (range && (word = document.getText(range)).match(/^[a-z_]+$/i)) {
		if (range.start.character > 0 && document.getText(new Range(line, range.start.character - 1, line, range.start.character)) === '#')
			word = '#' + word;
	}
	if (!helpPath) {
		window.showErrorMessage(zhcn ? `"AutoHotkey.chm"未找到!` : `"AutoHotkey.chm" was not found!`);
		return;
	}
	const executePath = ahkconfig.InterpreterPath as string;
	if (executePath && existsSync(executePath)) {
		let script = `
#DllLoad oleacc.dll
chm_hwnd := 0, chm_path := '${helpPath}', DetectHiddenWindows(true), !(WinGetExStyle(top := WinExist('A')) & 8) && (top := 0)
for hwnd in WinGetList('AutoHotkey ahk_class HH Parent')
	for item in ComObjGet('winmgmts:').ExecQuery('SELECT CommandLine FROM Win32_Process WHERE ProcessID=' WinGetPID(hwnd))
		if InStr(item.CommandLine, chm_path) {
			chm_hwnd := WinExist(hwnd)
			break 2
		}
if top && top != chm_hwnd
	WinSetAlwaysOnTop(0, top)
if !chm_hwnd
	Run(chm_path, , , &pid), chm_hwnd := WinWait('AutoHotkey ahk_class HH Parent ahk_pid' pid)
WinShow(), WinActivate(), WinWaitActive(), ctl := ControlGetHwnd('Internet Explorer_Server1')
NumPut('int64', 0x11CF3C3D618736E0, 'int64', 0x719B3800AA000C81, IID_IAccessible := Buffer(16))
if ${!!word} && !DllCall('oleacc\\AccessibleObjectFromWindow', 'ptr', ctl, 'uint', 0, 'ptr', IID_IAccessible, 'ptr*', IAccessible := ComValue(13, 0)) {
	IServiceProvider := ComObjQuery(IAccessible, IID_IServiceProvider := '{6D5140C1-7436-11CE-8034-00AA006009FA}')
	NumPut('int64', 0x11D026CB332C4427, 'int64', 0x1901D94FC00083B4, IID_IHTMLWindow2 := Buffer(16))
	ComCall(3, IServiceProvider, 'ptr', IID_IHTMLWindow2, 'ptr', IID_IHTMLWindow2, 'ptr*', IHTMLWindow2 := ComValue(9, 0))
	IHTMLWindow2.execScript('
	(
		document.querySelector('#head > div > div.h-tabs > ul > li:nth-child(3) > button').click()
		searchinput = document.querySelector('#left > div.search > div.input > input[type=search]')
		keyevent = document.createEvent('KeyboardEvent')
		keyevent.initKeyboardEvent('keyup', false, true, document.defaultView, 13, null, false, false, false, false)
		searchinput.value = '${word}'
		searchinput.dispatchEvent(keyevent)
		Object.defineProperties(keyevent, { type: { get: function() { return 'keydown' } }, which: { get: function() { return 13 } } })
		searchinput.dispatchEvent(keyevent)
	)')
}`;
		if (ahkStatusBarItem.text.endsWith('[UIAccess]')) {
			let file = resolve(__dirname, 'temp.ahk');
			writeFileSync(file, script, { encoding: 'utf-8' });
			child_process.execSync(`"${executePath}" /ErrorStdOut ${file}`);
			unlinkSync(file);
		} else
			child_process.execSync(`"${executePath}" /ErrorStdOut *`, { input: script });
	}
}

async function begindebug(extlist: string[], debugexts: any, params = false, attach = false) {
	let editor = window.activeTextEditor, executePath = ahkpath_cur || ahkconfig.InterpreterPath as string;
	if (!editor) return;
	let extname: string | undefined;
	if (executePath && !executePath.includes(':'))
		executePath = resolve(workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath ?? '', executePath);
	if (params || attach) {
		if (!extlist.includes(extname = 'zero-plusplus.vscode-autohotkey-debug')) {
			window.showErrorMessage('zero-plusplus.vscode-autohotkey-debug was not found!');
			return;
		}
	} else if (extlist.length === 0) {
		window.showErrorMessage(zhcn ? '未找到debug扩展, 请先安装debug扩展!' : 'The debug extension was not found, please install the debug extension first!');
		extname = await window.showQuickPick(['zero-plusplus.vscode-autohotkey-debug', 'helsmy.autohotkey-debug', 'mark-wiemer.vscode-autohotkey-plus-plus', 'cweijan.vscode-autohotkey-plus']);
		if (extname)
			commands.executeCommand('workbench.extensions.installExtension', extname);
		return;
	} else if (extlist.length === 1)
		extname = extlist[0];
	else {
		let def = ahkconfig.DefaultDebugger as string;
		extname = extlist.includes(def) ? def : await window.showQuickPick(extlist);
	}
	if (extname) {
		let config: DebugConfiguration = {
			type: '',
			request: 'launch',
			name: 'AutoHotkey2 Debug',
			runtime: executePath,
			AhkExecutable: executePath,
			program: editor.document.uri.fsPath,
			port: '9002-9100',
			useAnnounce: 'detail',
			useAutoJumpToError: true,
			useDebugDirective: true,
			usePerfTips: true
		};
		for (const t in debugexts)
			if (debugexts[t] === extname) {
				config.type = t;
				if (extname === 'zero-plusplus.vscode-autohotkey-debug')
					if (ahkStatusBarItem.text.endsWith('[UIAccess]'))
						config.useUIAVersion = true;
				if (params) {
					let input = await window.showInputBox({ prompt: zhcn ? '输入需要传递的命令行参数' : 'Enter the command line parameters that need to be passed' });
					if (input === undefined)
						return;
					if (input = input.trim()) {
						let args: string[] = [];
						input.replace(/('|")(.*?(?<!\\))\1(?=(\s|$))|(\S+)/g, (...m) => {
							args.push(m[4] || m[2]);
							return '';
						});
						config.args = args;
					}
				} else if (attach) {
					config.request = 'attach';
					config.name = 'AutoHotkey2 Attach';
					delete config.program;
				}
				break;
			}
		debug.startDebugging(workspace.getWorkspaceFolder(editor.document.uri), config);
	}
}

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function setInterpreter() {
	let index = -1, { path: ahkpath, from } = getInterpreterPath();
	let list: QuickPickItem[] = [], it: QuickPickItem, _ = (ahkpath = ahkpath_cur || ahkpath).toLowerCase();
	let pick = window.createQuickPick(), active: QuickPickItem | undefined, sel: QuickPickItem = { label: '' };
	if (zhcn) {
		list.push({ alwaysShow: true, label: '输入解释器路径...', detail: '输入路径或选择一个现有的解释器' });
		it = { label: '浏览...', detail: '浏览文件系统来选择一个 AutoHotkey2 解释器。' };
	} else {
		list.push({ alwaysShow: true, label: 'Enter interpreter path...', detail: 'Enter path or find an existing interpreter' });
		it = { label: 'Find...', detail: 'Browse your file system to find a AutoHotkey2 interpreter.' };
	}
	if (ahkpath)
		await addpath(resolve(ahkpath, '..'), _.includes('autohotkey') ? 20 : 5);
	if (!_.includes('c:\\program files\\autohotkey\\'))
		await addpath('C:\\Program Files\\AutoHotkey\\', 20);
	if ((_ = ahkpath_cur.toLowerCase()) !== ahkpath.toLowerCase() && !ahkpath_cur.toLowerCase().includes('c:\\program files\\autohotkey\\'))
		await addpath(resolve(ahkpath_cur, '..'), _.includes('autohotkey') ? 20 : 5);
	index = list.map(it => it.detail?.toLowerCase()).indexOf((ahkpath_cur || ahkpath).toLowerCase());
	if (index !== -1)
		active = list[index];

	pick.matchOnDetail = true, pick.items = list;
	pick.title = zhcn ? '选择解释器' : 'Select Interpreter';
	if (active)
		pick.activeItems = [active];
	pick.placeholder = (zhcn ? '当前: ' : 'Current: ') + ahkpath_cur;
	pick.show();
	pick.onDidAccept(async e => {
		if (pick.selectedItems[0] === list[0]) {
			pick.title = undefined, pick.activeItems = [], pick.value = '', pick.items = [it];
			pick.placeholder = zhcn ? '请输入 AutoHotkey2 解释器的路径。' : 'Enter path to a AutoHotkey2 interpreter.';
			return;
		} else if (pick.selectedItems[0] === it) {
			pick.ignoreFocusOut = true;
			let path = await window.showOpenDialog({
				defaultUri: ahkpath ? Uri.file(ahkpath) : undefined,
				filters: { Executables: ['exe'] },
				openLabel: zhcn ? '选择解释器' : 'Select Interpreter'
			});
			if (path)
				sel.detail = path[0].fsPath;
		} else {
			if (it = pick.selectedItems[0]) {
				if ((!active || it !== active) && it.detail)
					sel = it;
			} else if (pick.value.match(/\.exe/i) && existsSync(pick.value))
				sel.detail = pick.value;
		}
		pick.dispose();
		if (sel.detail) {
			if (!sel.label)
				sel.label = (await getAHKversion([sel.detail]))[0];
			ahkStatusBarItem.text = sel.label;
			ahkStatusBarItem.tooltip = sel.detail;
			ahkpath_cur = sel.detail;
			if (server_is_ready)
				commands.executeCommand('ahk2.resetinterpreterpath', ahkpath_cur);
			ahkconfig.update('InterpreterPath', ahkpath_cur, from);
		}
	});
	pick.onDidHide(e => pick.dispose());

	async function addpath(dirpath: string, max: number) {
		let paths: string[] = [];
		if (!existsSync(dirpath))
			return;
		for (let file of readdirSync(dirpath)) {
			let path = resolve(dirpath, file);
			try {
				if (statSync(path).isDirectory()) {
					for (file of readdirSync(path)) {
						let path2 = resolve(path, file);
						if (file.toLowerCase().endsWith('.exe') && !statSync(path2).isDirectory())
							paths.push(path2);
					}
				} else if (file.toLowerCase().endsWith('.exe'))
					paths.push(path);
				if (paths.length >= max)
					break;
			} catch { }
		}
		(await getAHKversion(paths)).forEach((label, i) => {
			if (label.match(/\bautohotkey.*?2\./i) && !label.endsWith('[UIAccess]'))
				list.push({ label, detail: paths[i] });
		});
	}
}

function getAHKversion(paths: string[]): Thenable<string[]> {
	return client.sendRequest('ahk2.getAHKversion', paths);
}

function getInterpreterPath() {
	let t = ahkconfig.inspect('InterpreterPath');
	let path = '';
	if (t)
		if (path = t.workspaceFolderValue as string)
			return { path, from: ConfigurationTarget.WorkspaceFolder };
		else if (path = t.workspaceValue as string)
			return { path, from: ConfigurationTarget.Workspace };
		else if (path = t.globalValue as string)
			return { path, from: ConfigurationTarget.Global };
		else path = t.defaultValue as string ?? '';
	return { path };
}

function findfile(files: string[], workspace: string) {
	let paths: string[] = [], s: string;
	let t = ahkconfig.inspect('InterpreterPath');
	if (add(ahkpath_cur), t) {
		add(t.workspaceFolderValue as string);
		add(t.workspaceValue as string);
		add(t.globalValue as string);
		add(t.defaultValue as string);
	}
	for (const path of paths)
		for (const file of files)
			if (existsSync(s = resolve(path, '..', file)))
				return s;
	return '';

	function add(path: string) {
		if (!path) return;
		if (!path.includes(':'))
			path = resolve(workspace, path);
		path = path.toLowerCase();
		if (!paths.includes(path))
			paths.push(path);
	}
}

async function onDidChangegetInterpreter() {
	let path = ahkpath_cur;
	if (!path.toLowerCase().endsWith('.exe') || !existsSync(path))
		path = ahkconfig.InterpreterPath as string;
	if (path.toLowerCase().endsWith('.exe') && existsSync(path)) {
		if (path !== ahkStatusBarItem.tooltip) {
			ahkStatusBarItem.tooltip = path;
			ahkStatusBarItem.text = (await getAHKversion([path]))[0] || (zhcn ? '未知版本' : 'Unknown version');
		}
	} else {
		ahkStatusBarItem.text = (zhcn ? '选择AutoHotkey2解释器' : 'Select AutoHotkey2 Interpreter');
		ahkStatusBarItem.tooltip = undefined, path = '';
	}
	if (path !== ahkpath_cur && (ahkpath_cur = path, server_is_ready))
		commands.executeCommand('ahk2.resetinterpreterpath', ahkpath_cur);
}

async function updateVersionInfo() {
	const editor = window.activeTextEditor;
	if (server_is_ready && editor) {
		let info: { content: string, uri: string, range: Range } | null = await client.sendRequest('ahk2.getVersionInfo', editor.document.uri.toString());
		if (!info) {
			await editor.insertSnippet(new SnippetString([
				"/************************************************************************",
				" * @description ${1:}",
				" * @file $TM_FILENAME",
				" * @author ${2:}",
				" * @date ${3:$CURRENT_YEAR/$CURRENT_MONTH/$CURRENT_DATE}",
				" * @version ${4:0.0.0}",
				" ***********************************************************************/",
				"", ""
			].join('\n')), new Range(0, 0, 0, 0));
		} else {
			let d = new Date;
			let content = info.content, ver;
			content = content.replace(/(?<=^\s*[;*]?\s*@date[:\s]\s*)(\d+\/\d+\/\d+)/im, d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2));
			if (content.match(/(?<=^\s*[;*]?\s*@version[:\s]\s*)(\S*)/im) &&
				(ver = await window.showInputBox({ prompt: zhcn ? '输入版本信息' : 'Enter version info', value: content.match(/(?<=^[\s*]*@version[:\s]\s*)(\S*)/im)?.[1] })))
				content = content.replace(/(?<=^\s*[;*]?\s*@version[:\s]\s*)(\S*)/im, ver);
			if (content !== info.content) {
				let ed = new WorkspaceEdit();
				ed.replace(Uri.parse(info.uri), info.range, content);
				workspace.applyEdit(ed);
			}
		}
	}
}