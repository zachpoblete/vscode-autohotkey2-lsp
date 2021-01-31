import * as fs from 'fs';
import { resolve } from 'path';
import { argv0 } from 'process';
import {
	Position,
	Range,
	SymbolKind,
	DocumentSymbol,
	Diagnostic,
	DiagnosticSeverity,
	FoldingRange
} from 'vscode-languageserver';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { SemanticTokensBuilder } from 'vscode-languageserver/lib/sematicTokens.proposed';
import { URI } from 'vscode-uri';
import { builtin_variable } from './constants';
import { pathanalyze, libdirs } from './server';

export interface AhkDoc {
	statement: StateMent
	include: string[]
	children: DocumentSymbol[]
	funccall: DocumentSymbol[]
}

export enum FuncScope {
	DEFAULT = 0, LOCAL = 1, STATIC = 2, GLOBAL = 4
}

export interface StateMent {
	assume: FuncScope
	static?: boolean
	closure?: boolean
	global?: { [key: string]: Variable | ClassNode }
	local?: { [key: string]: Variable }
	define?: { [key: string]: Variable }
	function?: { [key: string]: FuncNode }
}

export interface FuncNode extends DocumentSymbol {
	params: Variable[]
	full: string
	statement: StateMent
	parent?: DocumentSymbol
}

export interface ClassNode extends DocumentSymbol {
	extends: string
	parent?: DocumentSymbol
}

export interface Word {
	name: string
	range: Range
}

export interface Variable extends DocumentSymbol {
	byref?: boolean
	static?: boolean
	globalspace?: boolean
	defaultVal?: string
}

export interface ReferenceInfomation {
	name: string
	line: number
}

export namespace SymbolNode {
	export function create(name: string, kind: SymbolKind, range: Range, selectionRange: Range, children?: DocumentSymbol[]): DocumentSymbol {
		return { name, kind, range, selectionRange, children };
	}
}

export namespace FuncNode {
	export function create(name: string, kind: SymbolKind, range: Range, selectionRange: Range, params: Variable[], children?: DocumentSymbol[]): FuncNode {
		let full = '', statement = { assume: FuncScope.DEFAULT };
		params.map(param => {
			full += ', ' + (param.byref ? 'ByRef ' : '') + param.name + (param.defaultVal ? ' := ' + param.defaultVal : '');
		});
		full = name + '(' + full.substring(2) + ')';
		return { name, kind, range, selectionRange, params, full, children, statement };
	}
}

export namespace Word {
	export function create(name: string, range: Range): Word {
		return { name, range };
	}
}

namespace Variable {
	export function create(name: string, kind: SymbolKind, range: Range, selectionRange: Range): Variable {
		return { name, kind, range, selectionRange };
	}
}

export namespace ReferenceInfomation {
	export function create(name: string, line: number): ReferenceInfomation {
		return { name, line };
	}
}

export namespace acorn {
	export function isIdentifierChar(code: number) {
		let nonASCIIidentifier = new RegExp("[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc\u0300-\u036f\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u0620-\u0649\u0672-\u06d3\u06e7-\u06e8\u06fb-\u06fc\u0730-\u074a\u0800-\u0814\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0840-\u0857\u08e4-\u08fe\u0900-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962-\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09d7\u09df-\u09e0\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5f-\u0b60\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2-\u0ce3\u0ce6-\u0cef\u0d02\u0d03\u0d46-\u0d48\u0d57\u0d62-\u0d63\u0d66-\u0d6f\u0d82\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e34-\u0e3a\u0e40-\u0e45\u0e50-\u0e59\u0eb4-\u0eb9\u0ec8-\u0ecd\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f41-\u0f47\u0f71-\u0f84\u0f86-\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1029\u1040-\u1049\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u170e-\u1710\u1720-\u1730\u1740-\u1750\u1772\u1773\u1780-\u17b2\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1920-\u192b\u1930-\u193b\u1951-\u196d\u19b0-\u19c0\u19c8-\u19c9\u19d0-\u19d9\u1a00-\u1a15\u1a20-\u1a53\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1b46-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1bb0-\u1bb9\u1be6-\u1bf3\u1c00-\u1c22\u1c40-\u1c49\u1c5b-\u1c7d\u1cd0-\u1cd2\u1d00-\u1dbe\u1e01-\u1f15\u200c\u200d\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2d81-\u2d96\u2de0-\u2dff\u3021-\u3028\u3099\u309a\ua640-\ua66d\ua674-\ua67d\ua69f\ua6f0-\ua6f1\ua7f8-\ua800\ua806\ua80b\ua823-\ua827\ua880-\ua881\ua8b4-\ua8c4\ua8d0-\ua8d9\ua8f3-\ua8f7\ua900-\ua909\ua926-\ua92d\ua930-\ua945\ua980-\ua983\ua9b3-\ua9c0\uaa00-\uaa27\uaa40-\uaa41\uaa4c-\uaa4d\uaa50-\uaa59\uaa7b\uaae0-\uaae9\uaaf2-\uaaf3\uabc0-\uabe1\uabec\uabed\uabf0-\uabf9\ufb20-\ufb28\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f]");
		if (code < 48) return code === 36;
		if (code < 58) return true;
		if (code < 65) return false;
		if (code < 91) return true;
		if (code < 97) return code === 95;
		if (code < 123) return true;
		return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code));
	}
	export function isIdentifierStart(code: number) {
		let nonASCIIidentifierStart = new RegExp("[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]");
		if (code < 65) return code === 36;
		if (code < 91) return true;
		if (code < 97) return code === 95;
		if (code < 123) return true;
		return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code));
	}
}

export class Lexer {
	public beautify: Function;
	public parseScript: Function;
	public get_tokon: Function;
	public symboltree: DocumentSymbol[] = [];
	public blocks: DocumentSymbol[] | undefined;
	public flattreecache: DocumentSymbol[] = [];
	public reflat: boolean = false;
	public scriptpath: string;
	public uri: string;
	public global: { [key: string]: DocumentSymbol } = {};
	public define: { [key: string]: DocumentSymbol } = {};
	public function: { [key: string]: DocumentSymbol } = {};
	public label: DocumentSymbol[] = [];
	public funccall: DocumentSymbol[] = [];
	public texts: { [key: string]: string } = {};
	public include: { [uri: string]: { url: string, path: string, raw: string } } = {};
	public relevance: { [uri: string]: { url: string, path: string, raw: string } } | undefined;
	public semantoken: SemanticTokensBuilder | undefined;
	public diagnostics: Diagnostic[] = [];
	public foldingranges: FoldingRange[] = [];
	public libdirs: string[] = [];
	public includedir: Map<number, string> = new Map();
	public object: { method: { [key: string]: any }, property: { [key: string]: any } } = { method: {}, property: {} };
	private reference: ReferenceInfomation[] = [];
	public document: TextDocument;
	public actived: boolean = false;
	constructor(document: TextDocument) {
		let input: string, output_lines: { text: any[]; }[], flags: any, opt: any, previous_flags: any, prefix: string, flag_store: any[], includetable: { [uri: string]: { path: string, raw: string } };
		let token_text: string, token_text_low: string, token_type: string, last_type: string, last_text: string, last_last_text: string, indent_string: string, includedir: string, _this: Lexer = this;
		let whitespace: string[], wordchar: string[], punct: string[], parser_pos: number, line_starters: any[], reserved_words: any[], digits: string[], scriptpath: string, _root_: DocumentSymbol[] = [];
		let input_wanted_newline: boolean, output_space_before_token: boolean, following_bracket: boolean, keep_Object_line: boolean, begin_line: boolean, tks: Token[] = [];
		let input_length: number, n_newlines: number, last_LF: number, bracketnum: number, whitespace_before_token: any[], beginpos: number, preindent_string: string;;
		let handlers: any, MODE: { BlockStatement: any; Statement: any; ArrayLiteral: any; Expression: any; ForInitializer: any; Conditional: any; ObjectLiteral: any; };

		this.document = document, this.scriptpath = URI.parse(this.uri = document.uri.toLowerCase()).fsPath.replace(/\\[^\\]+$/, ''), this.initlibdirs();
		whitespace = "\n\r\t ".split(''), digits = '0123456789'.split(''), wordchar = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'.split('');
		punct = '+ - * / % & ++ -- ** // = += -= *= /= //= .= == := != !== ~= > < >= <= >> << >>= <<= && &= | || ! ~ , : ? ^ ^= |= :: =>'.split(' ');
		line_starters = 'class,try,throw,return,global,local,static,if,switch,case,for,while,loop,continue,break,goto'.split(',');
		reserved_words = line_starters.concat(['extends', 'in', 'is', 'contains', 'else', 'until', 'catch', 'finally', 'and', 'or', 'not']);
		MODE = { BlockStatement: 'BlockStatement', Statement: 'Statement', ObjectLiteral: 'ObjectLiteral', ArrayLiteral: 'ArrayLiteral', ForInitializer: 'ForInitializer', Conditional: 'Conditional', Expression: 'Expression' };
		handlers = {
			'TK_START_EXPR': handle_start_expr,
			'TK_END_EXPR': handle_end_expr,
			'TK_START_BLOCK': handle_start_block,
			'TK_END_BLOCK': handle_end_block,
			'TK_WORD': handle_word,
			'TK_RESERVED': handle_word,
			'TK_SEMICOLON': handle_semicolon,
			'TK_STRING': handle_string,
			'TK_EQUALS': handle_equals,
			'TK_OPERATOR': handle_operator,
			'TK_COMMA': handle_comma,
			'TK_BLOCK_COMMENT': handle_block_comment,
			'TK_INLINE_COMMENT': handle_inline_comment,
			'TK_COMMENT': handle_comment,
			'TK_DOT': handle_dot,
			'TK_HOT': handle_word2,
			'TK_SHARP': handle_word2,
			'TK_NUMBER': handle_word2,
			'TK_LABEL': handle_label,
			'TK_HOTLINE': handle_unknown,
			'TK_UNKNOWN': handle_unknown
		};

		this.get_tokon = function (offset?: number) {
			if (offset !== undefined) parser_pos = offset;
			return get_next_token();
		}

		this.beautify = function (options: any) {
			/*jshint onevar:true */
			let t: Token, i: number, keep_whitespace: boolean, sweet_code: string;
			options = options ? options : {}, opt = {};
			if (options.braces_on_own_line !== undefined) { //graceful handling of deprecated option
				opt.brace_style = options.braces_on_own_line ? "expand" : "collapse";
			}
			opt.brace_style = options.brace_style ? options.brace_style : (opt.brace_style ? opt.brace_style : "collapse");
			if (opt.brace_style === "expand-strict") {
				opt.brace_style = "expand";
			}
			opt.indent_size = options.indent_size ? parseInt(options.indent_size, 10) : 4;
			opt.indent_char = options.indent_char ? options.indent_char : ' ';
			opt.preserve_newlines = (options.preserve_newlines === undefined) ? true : options.preserve_newlines;
			opt.break_chained_methods = (options.break_chained_methods === undefined) ? false : options.break_chained_methods;
			opt.max_preserve_newlines = (options.max_preserve_newlines === undefined) ? 0 : parseInt(options.max_preserve_newlines, 10);
			opt.space_in_paren = (options.space_in_paren === undefined) ? false : options.space_in_paren;
			opt.space_in_empty_paren = (options.space_in_empty_paren === undefined) ? false : options.space_in_empty_paren;
			opt.keep_array_indentation = (options.keep_array_indentation === undefined) ? false : options.keep_array_indentation;
			opt.space_before_conditional = (options.space_before_conditional === undefined) ? true : options.space_before_conditional;
			opt.wrap_line_length = (options.wrap_line_length === undefined) ? 0 : parseInt(options.wrap_line_length, 10);
			if (options.indent_with_tabs) {
				opt.indent_char = '\t', opt.indent_size = 1;
			}
			indent_string = '';
			while (opt.indent_size > 0) {
				indent_string += opt.indent_char, opt.indent_size -= 1;
			}
			last_type = 'TK_START_BLOCK', last_last_text = '', output_lines = [create_output_line()];
			output_space_before_token = false, flag_store = [], flags = null, set_mode(MODE.BlockStatement), preindent_string = '';
			let source_text = this.document.getText();
			while (source_text && (source_text.charAt(0) === ' ' || source_text.charAt(0) === '\t')) {
				preindent_string += source_text.charAt(0), source_text = source_text.substring(1);
			}
			input = source_text, input_length = input.length, whitespace_before_token = [];
			following_bracket = false, begin_line = true, bracketnum = 0, parser_pos = 0, last_LF = -1;
			while (true) {
				t = get_next_token();
				token_text = t.content, token_text_low = token_text.toLowerCase();
				token_type = t.type;

				if (token_type === 'TK_EOF') {
					// Unwind any open statements
					while (flags.mode === MODE.Statement) {
						restore_mode();
					}
					break;
				}

				keep_whitespace = opt.keep_array_indentation && is_array(flags.mode);
				input_wanted_newline = n_newlines > 0;

				if (keep_whitespace) {
					for (i = 0; i < n_newlines; i += 1) {
						print_newline(i > 0);
					}
				} else {
					if (opt.max_preserve_newlines && n_newlines > opt.max_preserve_newlines) {
						n_newlines = opt.max_preserve_newlines;
					}

					if (opt.preserve_newlines) {
						if (n_newlines > 1) {
							// if (n_newlines && token_text !== ',') {
							print_newline();
							for (i = 1; i < n_newlines; i += 1) {
								print_newline(true);
							}
						}
					}
				}

				handlers[token_type]();

				// The cleanest handling of inline comments is to treat them as though they aren't there.
				// Just continue formatting and the behavior should be logical.
				// Also ignore unknown tokens.  Again, this should result in better behavior.
				if (token_type !== 'TK_INLINE_COMMENT' && token_type !== 'TK_COMMENT' &&
					token_type !== 'TK_BLOCK_COMMENT') {
					if (!following_bracket && token_type === 'TK_RESERVED' && in_array(token_text_low, ['if', 'for', 'while', 'loop', 'catch', 'switch'])) {
						output_space_before_token = true;
						following_bracket = true;
						bracketnum = 0;
						last_last_text = token_text;
						flags.last_text = '(';
						last_type = 'TK_START_EXPR';
						if (token_text_low === 'switch') {
							set_mode(MODE.Conditional), flags.had_comment = false;
							continue;
						} else if (in_array(token_text_low, ['if', 'while'])) {
							set_mode(MODE.Conditional);
						} else {
							set_mode(MODE.ForInitializer);
						}
						indent();
					}
					else {
						last_last_text = flags.last_text;
						last_type = token_type;
						flags.last_text = token_text;
					}
					flags.had_comment = false;
				} else flags.had_comment = token_type === 'TK_INLINE_COMMENT';
			}

			sweet_code = output_lines[0].text.join('');
			for (let line_index = 1; line_index < output_lines.length; line_index++) {
				sweet_code += '\n' + output_lines[line_index].text.join('');
			}
			sweet_code = sweet_code.replace(/[\r\n ]+$/, '');
			return sweet_code;
		};

		this.parseScript = function (): void {
			input = this.document.getText(), input_length = input.length, includedir = this.scriptpath, tks.length = 0;
			whitespace_before_token = [], beginpos = 0, last_text = '', last_type = 'TK_BLOCK';
			following_bracket = false, begin_line = true, bracketnum = 0, parser_pos = 0, last_LF = -1;
			let gg: any = {}, dd: any = {}, ff: any = {}, _low = '';
			this.global = gg, this.define = dd, this.function = ff, this.label.length = this.funccall.length = this.diagnostics.length = 0;
			this.object = { method: {}, property: {} }, this.includedir = new Map(), this.blocks = [], this.texts = {}, this.reflat = true;
			this.include = includetable = {}, scriptpath = this.scriptpath, this.semantoken = new SemanticTokensBuilder, this.foldingranges.length = 0;
			this.symboltree = parse(), this.symboltree.push(...this.blocks), this.blocks = undefined;
			for (const it of this.symboltree)
				if (it.kind === SymbolKind.Function) { if (!ff[_low = it.name.toLowerCase()]) ff[_low] = it; }
				else if (it.kind === SymbolKind.Variable && !gg[_low = it.name.toLowerCase()]) dd[_low] = it;
			// for (const it in this.define) this.symboltree.push(this.define[it]);
		}

		function parse(mode = 0, scopevar = new Map<string, any>()): DocumentSymbol[] {
			const result: DocumentSymbol[] = [], cmm: Token = { content: '', offset: 0, type: '', length: 0 };
			let tk: Token = { content: '', type: '', offset: 0, length: 0 }, lk: Token = tk, next: boolean = true, LF: number = 0, comment = '';
			let blocks = 0, inswitch = -1, blockpos: number[] = [], tn: DocumentSymbol | FuncNode | Variable | undefined, m: any, sub: DocumentSymbol[];
			if (mode !== 0) blockpos.push(parser_pos - 1);
			while (nexttoken()) {
				switch (tk.type) {
					case 'TK_SHARP':
						let raw = '', o: any = '';
						if (m = tk.content.match(/^\s*#include((again)?)\s+(<.+>|(['"]?)(\s*\*i\s+)?[^*]+?\4)?\s*(\s;.*)?$/i)) {
							raw = (m[3] || '').trim(), o = m[5], m = raw.replace(/%(a_scriptdir|a_workingdir)%/i, _this.libdirs[0]).replace(/\s*\*i\s+/i, '').replace(/['"]/g, '');
							_this.includedir.set(_this.document.positionAt(tk.offset).line, includedir);
							if (m === '') includedir = _this.libdirs[0]; else {
								if (!(m = pathanalyze(m.toLowerCase(), _this.libdirs, includedir))) break;
								if (!fs.existsSync(m.path)) { if (!o) _this.addDiagnostic('文件不存在', tk.offset, tk.length); }
								else if (fs.statSync(m.path).isDirectory()) includedir = m.path; else includetable[m.uri] = { path: m.path, raw };
							}
							if (mode !== 0) _this.addDiagnostic('在函数、类中的#include无法正确地推导作用域和代码补全', tk.offset, tk.length, DiagnosticSeverity.Warning);
						}
						break;
					case 'TK_LABEL':
						if (inswitch > -1 && tk.content.toLowerCase() === 'default:') break;
						tn = SymbolNode.create(tk.content, SymbolKind.Field, makerange(tk.offset, tk.length), makerange(tk.offset, tk.length - 1)), result.push(tn);
						if (mode === 0) _this.label.push(tn); if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) tn.detail = trimcomment(lk.content); break;
					case 'TK_HOT':
						if (mode !== 0) _this.addDiagnostic('热键/热字串不能在函数/类中定义', tk.offset, tk.length);
						else if (tk.content.match(/\s::$/) || ((m = tk.content.match(/\S(\s*)&(\s*)\S+::/)) && (m[1] === '' || m[2] === '')))
							_this.addDiagnostic('无效的热键定义', tk.offset, tk.length);
						tn = SymbolNode.create(tk.content, SymbolKind.Event, makerange(tk.offset, tk.length), makerange(tk.offset, tk.length - 2));
						if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) tn.detail = trimcomment(lk.content);
						lk = tk, tk = get_token_ingore_comment(cmm), comment = cmm.content;
						if (tk.content === '{') {
							let ht = lk, vars = new Map<string, any>(), sm: StateMent = { assume: FuncScope.DEFAULT };
							sub = parse(1, vars), tn.children = sub, tn.range = makerange(ht.offset, parser_pos - ht.offset), (<FuncNode>tn).statement = sm;
							(<FuncNode>tn).params = [Variable.create('ThisHotkey', SymbolKind.Variable, makerange(0, 0), makerange(0, 0))];
							_this.addFoldingRangePos(tn.range.start, tn.range.end);
							if (vars.has('#assume')) sm.assume = vars.get('#assume');
							for (const tp of ['global', 'local', 'define']) {
								if (vars.has('#' + tp)) {
									let oo: { [key: string]: Variable } = {}, _name = '';
									for (const it of vars.get('#' + tp)) if (!oo[_name = it.name.toLowerCase()]) oo[_name] = it;
									sm[tp === 'global' ? 'global' : tp === 'local' ? 'local' : 'define'] = oo;
								}
							}
						} else next = false;
						result.push(tn); break;
					case 'TK_HOTLINE':
						if (mode !== 0) _this.addDiagnostic('热键/热字串不能在函数/类中定义', tk.offset, tk.length);
						tn = SymbolNode.create(tk.content, SymbolKind.Event, makerange(tk.offset, tk.length), makerange(tk.offset, tk.length - 2));
						if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) tn.detail = trimcomment(lk.content);
						LF = input.indexOf('\n', parser_pos), parser_pos = LF > -1 ? LF + 1 : input_length, tn.range.end = document.positionAt(parser_pos - 2), result.push(tn);
						break;
					case 'TK_START_BLOCK': blocks++, blockpos.push(parser_pos - 1); break;
					case 'TK_END_BLOCK':
						if (inswitch === blocks - 1) inswitch = -1;
						if ((--blocks) < 0) {
							if (mode === 0) _this.addDiagnostic('多余的"}"', tk.offset, 1), blocks = 0, blockpos.length = 0;
							else return result;
						} else if (mode === 0) _this.addFoldingRange(blockpos[blocks], parser_pos - 1);
						else _this.addFoldingRange(blockpos[blocks + 1], parser_pos - 1);
						break;
					case 'TK_END_EXPR': _this.addDiagnostic(`多余的"${tk.content}"`, tk.offset, 1); break;
					case 'TK_START_EXPR':
						if (tk.content === '[') parsepair('[', ']');
						else parsepair('(', ')');
						break;
					case 'TK_UNKNOWN':
						_this.addDiagnostic(`未知的Token, "${tk.content}"`, tk.offset, tk.length);
						break;
					default: break;
					case 'TK_OPERATOR':
						if (tk.content === '%') parsepair('%', '%');
						break;
					case 'TK_WORD':
						if (input.charAt(parser_pos) === '%') break;
						let comm = '', predot = (input.charAt(tk.offset - 1) === '.'), isstatic = (tk.topofline && lk.content.toLowerCase() === 'static');
						if (!predot && input.charAt(parser_pos) === '(') {
							if (input.charAt(tk.offset - 1) === '.') continue;
							if (isstatic) { if (cmm.type !== '') comm = trimcomment(cmm.content); }
							else if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) comm = trimcomment(lk.content);
							lk = tk, tk = { content: '(', offset: parser_pos, length: 1, type: 'TK_START_EXPR' }, parser_pos++;
							let fc = lk, rof = result.length, par = parsequt(), quoteend = parser_pos, nk = get_token_ingore_comment(), tn: FuncNode | undefined;
							if (nk.content === '=>') {
								if (!par) { par = [], result.splice(rof), _this.addDiagnostic('无效的参数默认值', fc.offset, tk.offset - fc.offset + 1); }
								let storemode = mode;
								mode = mode | 1;
								let sub = parseline(), pars: { [key: string]: any } = {}, _low = fc.content.toLowerCase();
								mode = storemode;
								if (fc.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${fc.content}"`, fc.offset, fc.length);
								tn = FuncNode.create(fc.content, mode === 2 ? SymbolKind.Method : SymbolKind.Function, makerange(fc.offset, parser_pos - fc.offset), makerange(fc.offset, fc.length), <Variable[]>par);
								tn.range.end = document.positionAt(lk.offset + lk.length), tn.statement.closure = mode === 0, _this.addFoldingRangePos(tn.range.start, tn.range.end, 'line');
								if (mode === 2) { if (!_this.object.method[_low]) _this.object.method[_low] = []; _this.object.method[_low].push(tn) };
								tn.statement.static = isstatic, tn.children = []; for (const it of par) pars[it.name.toLowerCase()] = true;
								for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) tn.children.push(sub[i]), sub.splice(i, 1); }
								if (comm) tn.detail = comm; result.push(tn), result.push(...sub);
							} else if (nk.content === '{' && fc.topofline) {
								if (!par) { par = [], result.splice(rof), _this.addDiagnostic('无效的参数默认值', fc.offset, tk.offset - fc.offset + 1); }
								let vars = new Map<string, any>(), _low = fc.content.toLowerCase();
								sub = parse(mode | 1, vars);
								if (fc.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${fc.content}"`, fc.offset, fc.length);
								tn = FuncNode.create(fc.content, mode === 2 ? SymbolKind.Method : SymbolKind.Function, makerange(fc.offset, parser_pos - fc.offset), makerange(fc.offset, fc.length), par, sub);
								tn.statement.static = isstatic, _this.addFoldingRangePos(tn.range.start, tn.range.end);
								if (mode === 2) { if (!_this.object.method[_low]) _this.object.method[_low] = []; _this.object.method[_low].push(tn) };
								if (vars.has('#assume')) tn.statement.assume = vars.get('#assume');
								for (const tp of ['global', 'local', 'define']) {
									if (vars.has('#' + tp)) {
										let oo: { [key: string]: Variable } = {}, _name = '';
										for (const it of vars.get('#' + tp)) if (!oo[_name = it.name.toLowerCase()]) oo[_name] = it;
										tn.statement[tp === 'global' ? 'global' : tp === 'local' ? 'local' : 'define'] = oo;
									}
								}
								if (comm) tn.detail = comm; result.push(tn);
							} else {
								next = false, lk = tk, tk = nk;
								if (par) for (const it of par) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it);
							}
							if (!tn) _this.funccall.push(DocumentSymbol.create(fc.content, undefined, SymbolKind.Function, makerange(fc.offset, quoteend - fc.offset), makerange(fc.offset, fc.length)));
						} else {
							if (isstatic) { if (cmm.type !== '') comm = trimcomment(cmm.content); }
							else if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) comm = trimcomment(lk.content);
							let bak = lk, restore = false, nn = 0, byref = false, rg: Range, par: DocumentSymbol[] = [];
							lk = tk, tk = get_next_token(), next = false;
							if (mode === 2 && lk.topofline && tk.content.match(/^(\[|=>|\{)$/)) {
								let fc = lk;
								next = true;
								if (tk.content === '[') {
									loop:
									while (nexttoken()) {
										switch (tk.type) {
											case 'TK_WORD':
												let nk = get_next_token();
												if (nk.type === 'TK_WORD' && tk.content.toLowerCase() === 'byref') byref = true;
												else if ((lk.content === ',' || lk.content === '[') && (nk.content.match(/^(:=|,|\])$/))) {
													if (tk.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic('非法的变量命名', tk.offset, tk.length);
													tn = Variable.create(tk.content, SymbolKind.Variable, rg = makerange(tk.offset, tk.length), rg);
													if (byref) byref = false, (<Variable>tn).byref = true;
													par.push(tn), lk = tk, tk = nk;
													if (nk.content === ':=') parseexp(); else next = false; continue;
												}
												lk = tk, tk = nk, next = false;
												break;
											case 'TK_START_EXPR':
												if (tk.content === '[') nn++;
												break;
											case 'TK_END_EXPR':
												if (tk.content === ']' && (--nn) < 0) { nexttoken(); break loop; }
												break;
										}
									}
								}
								let prop = DocumentSymbol.create(fc.content, comm, SymbolKind.Property, rg = makerange(fc.offset, fc.length), rg);
								(<Variable>prop).static = isstatic, result.push(prop), prop.children = [], _this.object.property[fc.content.toLowerCase()] = fc.content;
								if (tk.content === '{') {
									let nk: Token, sk: Token;
									tk = get_token_ingore_comment(), next = false;
									while (nexttoken() && tk.type !== 'TK_END_BLOCK') {
										if (tk.topofline && (tk.content = tk.content.toLowerCase()).match(/^[gs]et$/)) {
											nk = tk, sk = get_token_ingore_comment();
											if (sk.content === '=>') {
												tk = sk, mode = 3;
												let off = parser_pos, sub = parseline(), pars: { [key: string]: any } = {};
												mode = 2, tn = FuncNode.create(nk.content.toLowerCase(), SymbolKind.Function, makerange(off, parser_pos - off), rg, <Variable[]>par);
												if (nk.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${nk.content}"`, nk.offset, nk.length);
												tn.range.end = document.positionAt(lk.offset + lk.length), prop.range.end = tn.range.end, _this.addFoldingRangePos(tn.range.start, tn.range.end, 'line');
												tn.children = [], pars['value'] = true; for (const it of par) pars[it.name.toLowerCase()] = true;
												for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) tn.children.push(sub[i]), sub.splice(i, 1); }
											} else if (sk.content === '{') {
												let vars = new Map<string, any>(), sub = parse(3, vars);
												tn = FuncNode.create(nk.content, SymbolKind.Function, makerange(nk.offset, parser_pos - nk.offset), makerange(nk.offset, 3), par, sub), _this.addFoldingRangePos(tn.range.start, tn.range.end);
												if (nk.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${nk.content}"`, nk.offset, nk.length);
												if (vars.has('#assume')) (<FuncNode>tn).statement.assume = vars.get('#assume');
												for (const tp of ['global', 'local', 'define']) {
													if (vars.has('#' + tp)) {
														let oo: { [key: string]: Variable } = {}, _name = '';
														for (const it of vars.get('#' + tp)) if (!oo[_name = it.name.toLowerCase()]) oo[_name] = it;
														(<FuncNode>tn).statement[tp === 'global' ? 'global' : tp === 'local' ? 'local' : 'define'] = oo;
													}
												}
											} else {
												_this.addDiagnostic('不是有效的getter/setter属性', sk.offset);
												if (sk.content === '}') { next = false; break; } else return result;
											}
											if (nk.content === 'set') (<FuncNode>tn).params.push(Variable.create('Value', SymbolKind.Variable, Range.create(0, 0, 0, 0), Range.create(0, 0, 0, 0)));
											prop.children.push(tn);
										} else {
											_this.addDiagnostic('不是有效的getter/setter属性', tk.offset);
											return result;
										}
									}
									prop.range.end = document.positionAt(parser_pos - 1);
								} else if (tk.content === '=>') {
									mode = 3;
									let off = parser_pos, sub = parseline(), pars: { [key: string]: any } = {};
									mode = 2, tn = FuncNode.create('get', SymbolKind.Function, makerange(off, parser_pos - off), rg, <Variable[]>par);
									tn.range.end = document.positionAt(lk.offset + lk.length), prop.range.end = tn.range.end, _this.addFoldingRangePos(tn.range.start, tn.range.end, 'line');
									tn.children = [], pars['value'] = true; for (const it of par) pars[it.name.toLowerCase()] = true;
									for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) tn.children.push(sub[i]), sub.splice(i, 1); }
									prop.children.push(tn);
								}
							} else {
								if (!lk.topofline && (bak.type === 'TK_HOT' || bak.content === '{' || (bak.type === 'TK_RESERVED' && bak.content.match(/^(try|else|finally)$/i)))) lk.topofline = restore = true;
								if (!predot && (!lk.topofline || tk.type === 'TK_EQUALS' || tk.content === '=' || input.charAt(lk.offset + lk.length).match(/[^\s,]/))) {
									if (!lk.topofline && bak.type === 'TK_SHARP' && bak.content.match(/^#(MenuMaskKey|SingleInstance|Warn)/i)) break;
									addvariable(lk, mode);
									if (mode === 2 && tk.type !== 'TK_EQUALS' && input.charAt(lk.offset + lk.length) !== '.') _this.addDiagnostic('属性声明未初始化', lk.offset);
								} else if (mode === 2) { if (input.charAt(lk.offset + lk.length) !== '.') _this.addDiagnostic('属性声明未初始化', lk.offset); }
								else if ((m = input.charAt(lk.offset + lk.length)).match(/^(\s|,|)$/)) {
									if (lk.topofline) {
										if (m === ',') _this.addDiagnostic('函数调用需要一个空格或"("', tk.offset, 1);
										let fc = lk, sub = parseline();
										if (restore) lk.topofline = false;
										result.push(...sub), _this.funccall.push(DocumentSymbol.create(fc.content, undefined, SymbolKind.Function, makerange(fc.offset, lk.offset + lk.length - fc.offset), makerange(fc.offset, fc.length)));
										break;
									} else if (predot && !(tk.type === 'TK_EQUALS' || tk.content === '=')) {
										let prestr = input.substring(last_LF + 1, lk.offset);
										if (prestr.match(/^\s*(\w+\.)+$/)) {
											if (m === ',') _this.addDiagnostic('函数调用需要一个空格或"("', tk.offset, 1);
											let fc = lk, sub = parseline();
											result.push(...sub), _this.funccall.push(DocumentSymbol.create(fc.content, undefined, SymbolKind.Method, makerange(fc.offset, lk.offset + lk.length - fc.offset), makerange(fc.offset, fc.length)));
											break;
										}
									}
								}
								if (tk.content === ':=') {
									next = true;
									let ep = parseexp();
									result.push(...ep);
								} else if (tk.type === 'TK_UNKNOWN') {
									_this.addDiagnostic(`未知的Token, "${tk.content}"`, tk.offset, tk.length);
								}
							}
							break;
						}
						break;
					case 'TK_RESERVED':
						parse_reserved(); break;
				}
			}
			if (tk.type === 'TK_EOF' && blocks > (mode === 0 ? 0 : -1)) _this.addDiagnostic('丢失对应的"}"', blockpos[blocks - (mode === 0 ? 1 : 0)], 1);
			return result;

			function parse_reserved() {
				let _low = '', bak = lk, t = parser_pos, nk: Token | undefined;
				switch (_low = tk.content.toLowerCase()) {
					case 'class':
						if (!tk.topofline) {
							if (mode !== 2 && input.charAt(parser_pos) !== '(') _this.addDiagnostic('保留字不能用作变量名', tk.offset);
							next = false, tk.type = 'TK_WORD'; break;
						}
						let cl: Token, ex: string = '', sv = new Map(), beginpos = tk.offset, comm = '';
						if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) comm = trimcomment(lk.content), beginpos = lk.offset;
						nexttoken();
						if (tk.type === 'TK_WORD') {
							if (mode & 1) _this.addDiagnostic('函数不能包含类', tk.offset);
							cl = tk, lk = tk, tk = get_token_ingore_comment();
							if (tk.content.toLowerCase() === 'extends') {
								ex = get_next_token().content;
								while (parser_pos < input_length && input.charAt(parser_pos) === '.') parser_pos++, ex += '.' + get_next_token().content;
								tk = get_token_ingore_comment();
							}
							if (tk.type !== 'TK_START_BLOCK') { next = false; break; }
							if (cl.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic('非法的类命名', cl.offset, cl.length);
							tn = DocumentSymbol.create(cl.content, undefined, SymbolKind.Class, makerange(0, 0), makerange(cl.offset, cl.length));
							sv.set('#class', tn), tn.children = parse(2, sv), tn.range = makerange(beginpos, parser_pos - beginpos);
							if (comm) tn.detail = comm; if (ex) (<ClassNode>tn).extends = ex;
							for (const item of tn.children) if (item.children && item.kind != SymbolKind.Property) (<FuncNode>item).parent = tn;
							if (mode === 0) (<{ [key: string]: Variable }>_this.global)[cl.content.toLowerCase()] = tn;
							result.push(tn);
						} else {
							if (mode !== 2 && input.charAt(lk.offset + lk.length) !== '(') _this.addDiagnostic('保留字不能用作变量名', lk.offset);
							next = false, lk.type = 'TK_WORD', parser_pos = lk.offset + lk.length, tk = lk, lk = bak;
						}
						break;
					case 'global':
					case 'static':
					case 'local':
						if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) nk = lk;
						lk = tk, tk = get_token_ingore_comment(cmm);
						if (tk.topofline) {
							if (_low === 'global') scopevar.set('#assume', FuncScope.GLOBAL);
							else scopevar.set('#assume', scopevar.get('#assume') | (_low === 'local' ? FuncScope.LOCAL : FuncScope.STATIC));
							if (mode === 2 && lk.content.toLowerCase() !== 'static') _this.addDiagnostic('类属性声明不能使用global/local', lk.offset);
							if (cmm.type !== '') lk = cmm;
						} else if (tk.type === 'TK_WORD' || tk.type === 'TK_RESERVED') {
							while (parser_pos < input_length && input.charAt(parser_pos).match(/( |\t)/)) parser_pos++;
							if (input.substr(parser_pos, 2).match(/^(\(|\[|\{|=>)/)) {
								if (nk) cmm.content = nk.content, cmm.type = nk.type; else cmm.type = '';
								tk.topofline = true;
							} else {
								let sta: any[];
								next = false;
								if (nk) lk = nk;
								sta = parsestatement();
								if (_low === 'global') {
									if (!scopevar.has('#global')) scopevar.set('#global', sta);
									else (scopevar.get('#global')).push(...sta);
									let p: { [key: string]: Variable };
									if (mode === 0) {
										p = <{ [key: string]: Variable }>_this.global;
									} else p = <{ [key: string]: Variable }>_this.define;
									for (const it of sta) p[it.name.toLowerCase()] = p[it.name.toLowerCase()] || it;
								} else {
									if (mode === 2 && _low === 'static')
										for (const it of sta) if (it.kind === SymbolKind.Property) it.static = true;
									if (!scopevar.has('#local')) scopevar.set('#local', sta);
									else (scopevar.get('#local')).push(...sta);
								}
								result.push(...sta);
							}
						} else if (tk.content === ':=') {
							parser_pos = lk.offset + lk.length, lk.type = 'TK_WORD', tk = lk, lk = bak;
							if (mode !== 2) _this.addDiagnostic('保留字不能用作变量名', tk.offset);
						}
						next = false;
						break;
					case 'loop':
						lk = tk, tk = get_next_token();
						if (['TK_COMMA', 'TK_OPERATOR', 'TK_EQUALS'].includes(tk.type)) {
							parser_pos = lk.offset + lk.length, lk.type = 'TK_WORD', tk = lk, lk = bak, next = false;
							if (mode !== 2) _this.addDiagnostic('保留字不能用作变量名', tk.offset);
						} else if (next = (tk.type === 'TK_WORD' && ['parse', 'files', 'read', 'reg'].includes(tk.content.toLowerCase())))
							tk.type = 'TK_RESERVED';
						break;
					case 'continue':
					case 'break':
					case 'goto':
						lk = tk, tk = get_next_token(), next = false;
						if (!tk.topofline) {
							if (tk.type === 'TK_WORD') tk.ignore = true;
							else if (tk.content !== '(') {
								parser_pos = lk.offset + lk.length, lk.type = 'TK_WORD', tk = lk, lk = bak, next = false;
								if (mode !== 2) _this.addDiagnostic('保留字不能用作变量名', tk.offset);
							}
						}
						break;
					default:
						nk = get_token_ingore_comment();
						if (nk.type === 'TK_EQUALS' || nk.content.match(/^([<>]=?|~=|&&|\|\||[,.&|?:^]|\*\*?|\/\/?|<<|>>|!?==?)$/)) tk.type = 'TK_WORD', parser_pos = t, _this.addDiagnostic('保留字不能用作变量名', tk.offset);
						else {
							lk = tk, tk = nk, next = false;
							if (_low === 'switch') inswitch = blocks;
							else if (_low === 'return') result.push(...parseline());
						}
						break;
				}
			}

			function parseline(): DocumentSymbol[] {
				// let result: DocumentSymbol[] = [];
				let index = result.length;
				while (nexttoken()) {
					if (tk.topofline && !(['TK_COMMA', 'TK_OPERATOR', 'TK_EQUALS'].includes(tk.type) && !tk.content.match(/^(!|~|not)$/i))) { next = false; break; }
					switch (tk.type) {
						case 'TK_WORD':
							if (input.charAt(tk.offset - 1) === '.') { lk = tk; continue; }
							if (input.charAt(parser_pos) === '(') {
								lk = tk, tk = { content: '(', offset: parser_pos, length: 1, type: 'TK_START_EXPR' }, parser_pos++;
								let fc = lk, par = parsequt(), quoteend = parser_pos, nk = get_next_token(), pars: any = {};
								if (nk.content === '=>') {
									let storemode = mode;
									mode = mode | 1;
									let sub = parseexp();
									mode = storemode;
									if (fc.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${fc.content}"`, fc.offset, fc.length);
									tn = FuncNode.create(fc.content, SymbolKind.Function, makerange(fc.offset, parser_pos - fc.offset), makerange(fc.offset, fc.length), <Variable[]>par);
									tn.range.end = document.positionAt(lk.offset + lk.length), (<FuncNode>tn).statement.closure = mode === 0, tn.children = [], _this.addFoldingRangePos(tn.range.start, tn.range.end, 'line');
									if (par) for (const it of par) pars[it.name.toLowerCase()] = true;
									for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) tn.children.push(sub[i]), sub.splice(i, 1); }
									result.push(tn), result.push(...sub);
								} else {
									_this.funccall.push(DocumentSymbol.create(fc.content, undefined, SymbolKind.Function, makerange(fc.offset, quoteend - fc.offset), makerange(fc.offset, fc.length)));
									if (par) for (const it of par) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it);
									lk = tk, tk = nk, next = false;
								}
							} else {
								if (n_newlines === 1 && (lk.type === 'TK_COMMENT' || lk.type === 'TK_BLOCK_COMMENT')) comment = lk.content; else comment = '';
								if (tk.topofline) {
									lk = tk, tk = get_next_token();
									if (tk.topofline || (whitespace.includes(input.charAt(lk.offset + lk.length)) && !(['TK_OPERATOR', 'TK_EQUALS'].includes(tk.type) && tk.content.match(/.=$/)))) continue;
									addvariable(lk, mode, result); next = false;
								} else addvariable(tk, mode, result);
							}
							break;
						case 'TK_START_EXPR':
							if (tk.content === '[') parsepair('[', ']'); else {
								let ptk = lk, par = parsequt(), quoteend = parser_pos, nk = get_next_token(), pars: any = {};
								if (nk.content === '=>') {
									let storemode = mode;
									mode = mode | 1;
									let sub = parseexp();
									mode = storemode;
									if (par) for (const it of par) pars[it.name.toLowerCase()] = true;
									for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) sub.splice(i, 1); }
									result.push(...sub);
								} else {
									if (ptk.type === 'TK_WORD' && input.charAt(ptk.offset + ptk.length) === '(')
										_this.funccall.push(DocumentSymbol.create(ptk.content, undefined, SymbolKind.Method, makerange(ptk.offset, quoteend - ptk.offset), makerange(ptk.offset, ptk.length)));
									if (par) for (const it of par) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it);
									lk = tk, tk = nk, next = false;
								}
								// parsepair('(', ')')
							} break;
						case 'TK_START_BLOCK': parseobj(); break;
						case 'TK_END_BLOCK':
						case 'TK_END_EXPR': _this.addDiagnostic(`多余的"${tk.content}"`, tk.offset, 1); break;
						case 'TK_UNKNOWN': _this.addDiagnostic(`未知的Token, "${tk.content}"`, tk.offset, tk.length); break;
						case 'TK_RESERVED':
							if (tk.content.match(/\b(and|or|not)\b/i)) {
								let t = parser_pos, nk = get_token_ingore_comment();
								if (nk.type !== 'TK_EQUALS' && !nk.content.match(/^([<>]=?|~=|&&|\|\||[,.&|?:^]|\*\*?|\/\/?|<<|>>|!?==?)$/)) { lk = tk, tk = nk, next = false; break; }
								parser_pos = t;
							}
							_this.addDiagnostic('保留字不能用作变量名', tk.offset), next = false, tk.type = 'TK_WORD'; break;
					}
				}
				return result.splice(index);
			}

			function parsestatement() {
				let sta: DocumentSymbol[] | Variable[] = [], trg: Range, nk: Token = lk;
				loop:
				while (nexttoken()) {
					if (tk.topofline && !(['TK_COMMA', 'TK_OPERATOR', 'TK_EQUALS', 'TK_COMMENT', 'TK_BLOCK_COMMENT'].includes(tk.type) && !tk.content.match(/^(!|~|not)$/i))) { next = false; break; }
					switch (tk.type) {
						case 'TK_WORD':
							lk = tk, tk = get_token_ingore_comment();
							if (tk.content === ':=') {
								if (addvariable(lk, mode, sta) && ['TK_COMMENT', 'TK_BLOCK_COMMENT'].includes(nk.type))
									sta[sta.length - 1].detail = trimcomment(nk.content);
								result.push(...parseexp());
							} else {
								if (mode === 2 && input.charAt(lk.offset + lk.length) !== '.') _this.addDiagnostic('属性声明未初始化', lk.offset);
								if (tk.type === 'TK_COMMA') { addvariable(lk, mode, sta); continue; }
								else if (tk.topofline && !(['TK_COMMA', 'TK_OPERATOR', 'TK_EQUALS'].includes(tk.type) && !tk.content.match(/^(!|~|not)$/i))) {
									addvariable(lk, mode, sta);
									break loop;
								}
							}
							nk.type = '';
							break;
						case 'TK_COMMENT':
						case 'TK_BLOCK_COMMENT':
						case 'TK_INLINE_COMMENT':
							nk = tk;
							continue;
						case 'TK_COMMA':
							if (n_newlines > 1) nk.type = '';
							continue;
						case 'TK_UNKNOWN': nk.type = '', _this.addDiagnostic(`未知的Token, "${tk.content}"`, tk.offset, tk.length); break;
						case 'TK_RESERVED':
							nk.type = '';
							if (tk.content.match(/\b(and|or|not)\b/i)) {
								let t = parser_pos, nk = get_token_ingore_comment();
								if (nk.type !== 'TK_EQUALS' && !nk.content.match(/^([<>]=?|~=|&&|\|\||[,.&|?:^]|\*\*?|\/\/?|<<|>>|!?==?)$/)) { lk = tk, tk = nk, next = false; break; }
								parser_pos = t;
							}
							_this.addDiagnostic('保留字不能用作变量名', tk.offset), next = false, tk.type = 'TK_WORD'; break;
						case 'TK_END_BLOCK':
						case 'TK_END_EXPR': nk.type = '', _this.addDiagnostic(`多余的"${tk.content}"`, tk.offset, 1); break;
						default: break loop;
					}
				}
				return sta;
			}

			function parseexp(inpair = false): DocumentSymbol[] {
				let pres = result.length;
				while (nexttoken()) {
					if (tk.topofline && !inpair && !(['TK_OPERATOR', 'TK_EQUALS'].includes(tk.type) && !tk.content.match(/^(!|~|not)$/i))) { next = false; break; }
					switch (tk.type) {
						case 'TK_WORD':
							let predot = (input.charAt(tk.offset - 1) === '.');
							if (input.charAt(parser_pos) === '(') {
								lk = tk, tk = { content: '(', offset: parser_pos, length: 1, type: 'TK_START_EXPR' }, parser_pos++;
								let ptk = lk, par = parsequt(), quoteend = parser_pos, nk = get_next_token();
								if (nk.content === '=>') {
									let sub = parseexp(), pars: any = {};
									if (par) for (const it of par) pars[it.name.toLowerCase()] = true;
									for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) sub.splice(i, 1); }
									result.push(...sub);
								} else {
									_this.funccall.push(DocumentSymbol.create(ptk.content, undefined, SymbolKind.Method, makerange(ptk.offset, quoteend - ptk.offset), makerange(ptk.offset, ptk.length)));
									next = false, tk = nk;
									if (par) for (const it of par) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it);
									break;
								}
							}
							lk = tk, tk = get_token_ingore_comment(cmm), comment = cmm.content;
							if (tk.topofline) {
								next = false; if (!predot) addvariable(lk, mode); return result.splice(pres);
							} else if (tk.content === ',') {
								if (!predot) addvariable(lk, mode); return result.splice(pres);
							} else if (tk.type === 'TK_OPERATOR' && input.charAt(lk.offset - 1) !== '.') {
								if (!predot) addvariable(lk, mode); continue;
							}
							if (!predot) addvariable(lk, mode); next = false; break;
						case 'TK_START_EXPR':
							if (tk.content === '[') parsepair('[', ']'); else {
								let fc: Token | undefined, par: any, nk: Token, quoteend: number;
								if (lk.type === 'TK_WORD' && input.charAt(lk.offset + lk.length) === '(')
									if (input.charAt(lk.offset - 1) === '.') {
										let ptk = lk;
										parsepair('(', ')');
										_this.funccall.push(DocumentSymbol.create(ptk.content, undefined, SymbolKind.Method, makerange(ptk.offset, parser_pos - ptk.offset), makerange(ptk.offset, ptk.length)));
										continue;
									} else fc = lk;
								par = parsequt(), quoteend = parser_pos, nk = get_token_ingore_comment(cmm), comment = cmm.content;
								if (nk.content === '=>' && par) {
									let sub = parseexp(inpair), pars: { [key: string]: boolean } = {}, cds: DocumentSymbol[] = [];
									for (const it of par) pars[it.name.toLowerCase()] = true;
									for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) cds.push(sub[i]), sub.splice(i, 1); }
									if (fc) {
										if (fc.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${fc.content}"`, fc.offset, fc.length);
										result.push(tn = FuncNode.create(fc.content, SymbolKind.Function, makerange(fc.offset, parser_pos - fc.offset), makerange(fc.offset, fc.length), par, cds));
										(<FuncNode>tn).statement.closure = mode === 0, _this.addFoldingRangePos(tn.range.start, tn.range.end, 'line');
									}
									return sub;
								} else {
									if (fc) _this.funccall.push(DocumentSymbol.create(fc.content, undefined, SymbolKind.Function, makerange(fc.offset, quoteend - fc.offset), makerange(fc.offset, fc.length)));
									if (par) for (const it of par) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it);
									next = false, lk = tk, tk = nk;
								}
							} break;
						case 'TK_START_BLOCK':
							if (lk.type === 'TK_EQUALS' || lk.type === 'TK_OPERATOR') {
								parseobj(); break;
							} else {
								next = false; return result.splice(pres);
							}
						case 'TK_END_BLOCK':
						case 'TK_END_EXPR': next = false;
						case 'TK_COMMA': return result.splice(pres);
						case 'TK_UNKNOWN': _this.addDiagnostic(`未知的Token, "${tk.content}"`, tk.offset, tk.length); break;
						case 'TK_RESERVED':
							if (tk.content.match(/\b(and|or|not)\b/i)) {
								let t = parser_pos, nk = get_token_ingore_comment();
								if (nk.type !== 'TK_EQUALS' && !nk.content.match(/^([<>]=?|~=|&&|\|\||[,.&|?:^]|\*\*?|\/\/?|<<|>>|!?==?)$/)) { lk = tk, tk = nk, next = false; break; }
								parser_pos = t;
							}
							_this.addDiagnostic('保留字不能用作变量名', tk.offset); break;
						case 'TK_OPERATOR':
							if (tk.content === '%') parsepair('%', '%');
							else if (lk.type === 'TK_OPERATOR' && lk.content !== '%' && !tk.content.match(/[+\-%!]/)) _this.addDiagnostic('未知的操作符使用', tk.offset);
							break;
					}
				}
				return result.splice(pres);
			}

			function parsequt() {
				let pairnum = 0, paramsdef = true, beg = parser_pos - 1;
				if (!tk.topofline && ((lk.type === 'TK_OPERATOR' && !lk.content.match(/(:=|\?|:)/)) || !in_array(lk.type, ['TK_START_EXPR', 'TK_WORD', 'TK_EQUALS', 'TK_OPERATOR', 'TK_COMMA'])
					|| (lk.type === 'TK_WORD' && in_array(input.charAt(tk.offset - 1), whitespace))))
					paramsdef = false;
				let cache = [], rg, byref = false;
				if (paramsdef)
					while (nexttoken()) {
						if (tk.content === ')') { if ((--pairnum) < 0) break; } //else if (tk.content === '(') pairnum++;
						else if (tk.type.indexOf('COMMENT') > -1) continue;
						else if (tk.type === 'TK_WORD') {
							if (in_array(lk.content, [',', '('])) {
								if (tk.content.toLowerCase() === 'byref') {
									nexttoken();
									if (tk.type !== 'TK_WORD') { addvariable(lk, mode), next = false; break; } else byref = true;
								}
								lk = tk, tk = get_token_ingore_comment(cmm), comment = cmm.content;
								if (tk.content === ',' || tk.content === ')') {
									if (lk.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic('非法的变量命名', lk.offset, lk.length);
									tn = Variable.create(lk.content, SymbolKind.Variable, rg = makerange(lk.offset, lk.length), rg);
									if (byref) byref = false, (<Variable>tn).byref = true; cache.push(tn);
									if (tk.content === ')' && ((--pairnum) < 0)) break;
								} else if (tk.content === ':=') {
									tk = get_token_ingore_comment(cmm), comment = cmm.content;
									if (tk.content === '-' || tk.content === '+') {
										let nk = get_next_token();
										if (nk.type === 'TK_NUMBER')
											tk.content = tk.content + nk.content, tk.length = tk.content.length, tk.type = 'TK_NUMBER';
										else { next = false, paramsdef = false, lk = tk, tk = nk; break; }
									}
									if (tk.type === 'TK_STRING' || tk.type === 'TK_NUMBER' || (tk.type === 'TK_WORD' && ['unset', 'true', 'false'].includes(tk.content.toLowerCase()))) {
										if (lk.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic('非法的变量命名', lk.offset, lk.length);
										tn = Variable.create(lk.content, SymbolKind.Variable, rg = makerange(lk.offset, lk.length), rg);
										if (byref) byref = false, (<Variable>tn).byref = true;
										(<Variable>tn).defaultVal = tk.content, cache.push(tn), lk = tk, tk = get_token_ingore_comment(cmm), comment = cmm.content;
										if (tk.type === 'TK_COMMA') continue; else if (tk.content === ')' && ((--pairnum) < 0)) break; else { paramsdef = false, next = false; break; }
									} else { paramsdef = false, next = false; break; }
								} else if (tk.type === 'TK_OPERATOR') {
									if (tk.content === '*') {
										let nk = get_next_token();
										if (nk.content !== ')') { next = false, paramsdef = false, lk = tk, tk = nk; break; }
										else { lk = tk, tk = nk, next = false; }
									} else { next = false, paramsdef = false; break; }
									continue;
								} else if (tk.content === '(') {
									next = false, paramsdef = false, parser_pos = lk.offset + lk.length, tk = lk; break;
								} else { paramsdef = false, next = false; addvariable(lk, mode); break; }
							} else { paramsdef = false, next = false; break; }
						} else if (tk.content === '*' && [',', '('].includes(lk.content)) {
							lk = tk, tk = get_next_token();
							if (tk.content === ')') {
								if ((--pairnum) < 0) break;
							} else {
								paramsdef = false, next = false; break;
							}
						} else {
							paramsdef = false, next = false; break;
						}
					}
				if (!paramsdef) {
					if (cache.length)
						for (const it of cache) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it); cache.length = 0;
					parsepair('(', ')', beg);
					return;
				}
				return cache;
			}

			function parseobj() {
				let beg = tk.offset;
				while (objkey()) objval();
				if (tk.type === 'TK_END_BLOCK')
					_this.addFoldingRange(beg, tk.offset);

				function objkey(): boolean {
					while (nexttoken()) {
						switch (tk.type) {
							case 'TK_RESERVED':
							case 'TK_WORD': break;
							case 'TK_STRING': _this.addDiagnostic('无效的对象属性名', tk.offset, tk.length); break;
							case 'TK_START_EXPR': _this.addDiagnostic('无效的对象属性名', tk.offset); return false;
							case 'TK_OPERATOR':
								if (tk.content === ':') return true; else if (tk.content === '%') parsepair('%', '%'); else return false;
							case 'TK_LABEL':
								if (tk.content.match(/^\w+:$/)) { addtext({ content: tk.content.replace(':', ''), type: '', offset: 0, length: 0 }); return true; }
								return false;
							case 'TK_COMMA':
							case 'TK_COMMENT':
							case 'TK_BLOCK_COMMENT':
							case 'TK_INLINE_COMMENT':
								break;
							default: return false;
						}
					}
					return false;
				}

				function objval() {
					let exp = parseexp(true);
					result.push(...exp);
				}
			}

			function parsepair(b: string, e: string, pairbeg?: number) {
				let pairnum = 0, apos = result.length, tp = parser_pos, llk = lk, pairpos: number[], rpair = 0;
				pairpos = pairbeg === undefined ? [parser_pos - 1] : [pairbeg];
				while (nexttoken()) {
					if (b === '%' && tk.topofline && !(['TK_COMMA', 'TK_OPERATOR', 'TK_EQUALS'].includes(tk.type) && !tk.content.match(/^(!|~|not)$/i))) {
						_this.addDiagnostic('丢失对应的"%"', pairpos[0], 1);
						next = false; break;
					}
					if (b !== '(' && tk.content === '(') parsepair('(', ')'); else if (tk.content === e) { rpair++; if ((--pairnum) < 0) break; }
					else if (tk.content === b) {
						pairnum++, apos = result.length, tp = parser_pos, llk = lk, pairpos.push(tp - 1), rpair = 0;
					} else if (tk.content === '=>') {
						if (b !== '(' || rpair !== 1) {
							_this.addDiagnostic('未知的操作符使用', tk.offset, 2), next = true;
							continue;
						}
						result.splice(apos);
						lk = llk, tk = { content: '(', offset: tp - 1, length: 1, type: 'TK_START_EXPR' }, parser_pos = tp;
						let par = parsequt(), nk = get_token_ingore_comment(cmm), comment = cmm.content, sub = parseexp(true), pars: { [key: string]: boolean } = {};
						if (par) {
							for (const it of par) pars[it.name.toLowerCase()] = true;
							for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) sub.splice(i, 1); }
							result.push(...sub);
						}
					} else if (tk.type === 'TK_WORD') {
						if (input.charAt(tk.offset - 1) !== '.') {
							if (input.charAt(parser_pos) !== '(') {
								addvariable(tk, mode);
							} else {
								lk = tk, tk = { content: '(', offset: parser_pos, length: 1, type: 'TK_START_EXPR' }, parser_pos++;
								let fc = lk, par = parsequt(), quoteend = parser_pos, nk = get_token_ingore_comment(cmm), comment = cmm.content;
								if (nk.content === '=>') {
									let sub = parseexp(true), pars: any = {};
									if (fc.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic(`非法的函数命名, "${fc.content}"`, fc.offset, fc.length);
									tn = FuncNode.create(fc.content, SymbolKind.Function, makerange(fc.offset, parser_pos - fc.offset), makerange(fc.offset, fc.length), <Variable[]>par, sub);
									tn.range.end = document.positionAt(lk.offset + lk.length), (<FuncNode>tn).statement.closure = mode === 0, result.push(tn), _this.addFoldingRangePos(tn.range.start, tn.range.end, 'line');
									if (par) for (const it of par) pars[it.name.toLowerCase()] = true;
									for (let i = sub.length - 1; i >= 0; i--) { if (pars[sub[i].name.toLowerCase()]) sub.splice(i, 1); }
									result.push(...sub);
								} else {
									_this.funccall.push(DocumentSymbol.create(fc.content, undefined, SymbolKind.Method, makerange(fc.offset, quoteend - fc.offset), makerange(fc.offset, fc.length)));
									next = false, lk = tk, tk = nk;
									if (par) for (const it of par) if (!builtin_variable.includes(it.name.toLowerCase())) result.push(it);
								}
							}
						} else if (input.charAt(parser_pos) === '(') {
							let ptk = tk;
							tk = { content: '(', offset: parser_pos, length: 1, type: 'TK_START_EXPR' }, parser_pos++;
							parsepair('(', ')');
							_this.funccall.push(DocumentSymbol.create(ptk.content, undefined, SymbolKind.Method, makerange(ptk.offset, parser_pos - ptk.offset), makerange(ptk.offset, ptk.length)));
						}
					} else if (tk.type === 'TK_START_BLOCK') parseobj();
					else if (tk.type === 'TK_STRING') { if (b === '[' && is_next(']') && !tk.content.match(/\n|`n/)) addtext({ type: '', content: tk.content.substring(1, tk.content.length - 1), offset: 0, length: 0 }); }
					else if (tk.content === '[') parsepair('[', ']');
					else if (tk.content === '{') parseobj();
					else if (tk.content === '%') parsepair('%', '%');
					else if (tk.content.match(/^[)}]$/)) { _this.addDiagnostic('丢失对应的"' + e + '"', pairpos[pairnum], 1), next = false; return; }
					else if (tk.type === 'TK_RESERVED') {
						if (tk.content.match(/\b(and|or|not)\b/i)) {
							let t = parser_pos, nk = get_token_ingore_comment();
							if (nk.type !== 'TK_EQUALS' && !nk.content.match(/^([<>]=?|~=|&&|\|\||[,.&|?:^]|\*\*?|\/\/?|<<|>>|!?==?)$/)) { lk = tk, tk = nk, next = false; continue; }
							parser_pos = t;
						}
						_this.addDiagnostic('保留字不能用作变量名', tk.offset);
					} else if (tk.type === 'TK_END_BLOCK' || tk.type === 'TK_END_EXPR') _this.addDiagnostic(`多余的"${tk.content}"`, tk.offset, 1);
				}
				if (tk.type === 'TK_EOF') _this.addDiagnostic('丢失对应的"' + e + '"', pairpos[pairnum], 1);
			}

			function addvariable(token: Token, md: number = 0, p?: DocumentSymbol[]): boolean {
				let _low = token.content.toLowerCase();
				if (token.ignore || builtin_variable.includes(_low) || ((md & 2) && ['this', 'super'].includes(token.content.toLowerCase()))) return false;
				if (token.content.charAt(0).match(/[\d$]/)) _this.addDiagnostic('非法的变量命名', token.offset, token.length);
				let rg = makerange(token.offset, token.length), tn = Variable.create(token.content, md === 2 ? SymbolKind.Property : SymbolKind.Variable, rg, rg);
				if (comment) tn.detail = comment; if (md === 0) tn.globalspace = true; else if (md === 2) _this.object.property[_low] = _this.object.property[_low] || token.content;
				if (p) p.push(tn); else result.push(tn); return true;
			}

			function addtext(token: Token) {
				_this.texts[token.content.toLowerCase()] = token.content;
			}

			function nexttoken() {
				if (next) lk = tk, tk = get_next_token(); else next = true;
				if (tk.type === 'TK_BLOCK_COMMENT') _this.addFoldingRange(tk.offset, tk.offset + tk.length, 'comment');
				return tk.type !== 'TK_EOF';
			}
		}

		function trimcomment(comment: string): string {
			if (comment.charAt(0) === ';') return comment.replace(/^\s*;\s*/, '');
			let c = comment.split('\n'), cc = '';
			c.slice(1, c.length - 1).map(l => {
				cc += '\n' + l.replace(/^\s*\?*\s*/, '');
			})
			return cc.substring(1);
		}

		function makerange(offset: number, length: number): Range {
			return Range.create(document.positionAt(offset), document.positionAt(offset + length));
		}

		function get_token_ingore_comment(comment?: Token): Token {
			let tk: Token;
			if (comment) comment.type = '';
			while (true) {
				tk = get_next_token();
				switch (tk.type) {
					case 'TK_BLOCK_COMMENT':
						_this.addFoldingRange(tk.offset, tk.offset + tk.length, 'comment');
					case 'TK_COMMENT':
					case 'TK_INLINE_COMMENT':
						if (comment) comment.content = tk.content, comment.type = tk.type;
						continue;
				}
				break;
			}
			return tk;
		}

		interface Token {
			type: string;
			content: string;
			offset: number;
			length: number;
			topofline?: boolean;
			ignore?: boolean;
		}

		function createToken(content: string, type: string, offset: number, length: number, topofline?: boolean): Token {
			return { content, type, offset, length, topofline };
		}

		function create_flags(flags_base: any, mode: any) {
			let next_indent_level = 0;
			if (flags_base) {
				next_indent_level = flags_base.indentation_level;
				if (!just_added_newline() &&
					flags_base.line_indent_level > next_indent_level) {
					next_indent_level = flags_base.line_indent_level;
				}
			}

			let next_flags = {
				mode: mode,
				parent: flags_base,
				last_text: flags_base ? flags_base.last_text : '',
				last_word: flags_base ? flags_base.last_word : '',
				declaration_statement: false,
				in_html_comment: false,
				multiline_frame: false,
				if_block: false,
				else_block: false,
				do_block: false,
				do_while: false,
				in_case_statement: false,
				in_case: false,
				case_body: false,
				indentation_level: next_indent_level,
				line_indent_level: flags_base ? flags_base.line_indent_level : next_indent_level,
				start_line_index: output_lines.length,
				had_comment: false,
				ternary_depth: 0
			};
			return next_flags;
		}

		// Using object instead of string to allow for later expansion of info about each line
		function create_output_line() {
			return {
				text: []
			};
		}

		function trim_output(eat_newlines = false): void {
			if (output_lines.length) {
				trim_output_line(output_lines[output_lines.length - 1], eat_newlines);

				while (eat_newlines && output_lines.length > 1 &&
					output_lines[output_lines.length - 1].text.length === 0) {
					output_lines.pop();
					trim_output_line(output_lines[output_lines.length - 1], eat_newlines);
				}
			}
		}

		function trim_output_line(line: any, lines: any): void {
			while (line.text.length &&
				(line.text[line.text.length - 1] === ' ' ||
					line.text[line.text.length - 1] === indent_string ||
					line.text[line.text.length - 1] === preindent_string)) {
				line.text.pop();
			}
		}

		function trim(s: string): string {
			return s.replace(/^\s+|\s+$/g, '');
		}

		// we could use just string.split, but
		// IE doesn't like returning empty strings
		function split_newlines(s: string): string[] {
			//return s.split(/\x0d\x0a|\x0a/);
			s = s.replace(/\x0d/g, '');
			let out = [],
				idx = s.indexOf("\n");
			while (idx !== -1) {
				out.push(s.substring(0, idx));
				s = s.substring(idx + 1);
				idx = s.indexOf("\n");
			}
			if (s.length) {
				out.push(s);
			}
			return out;
		}

		function just_added_newline(): boolean {
			let line = output_lines[output_lines.length - 1];
			return line.text.length === 0;
		}

		function just_added_blankline(): boolean {
			if (just_added_newline()) {
				if (output_lines.length === 1) {
					return true; // start of the file and newline = blank
				}

				let line = output_lines[output_lines.length - 2];
				return line.text.length === 0;
			}
			return false;
		}

		function allow_wrap_or_preserved_newline(force_linewrap = false): void {
			if (opt.wrap_line_length && !force_linewrap) {
				let line = output_lines[output_lines.length - 1];
				let proposed_line_length = 0;
				// never wrap the first token of a line.
				if (line.text.length > 0) {
					proposed_line_length = line.text.join('').length + token_text.length +
						(output_space_before_token ? 1 : 0);
					if (proposed_line_length >= opt.wrap_line_length) {
						force_linewrap = true;
					}
				}
			}
			if (((opt.preserve_newlines && input_wanted_newline) || force_linewrap) && !just_added_newline()) {
				print_newline(false, true);
			}
		}

		function print_newline(force_newline = false, preserve_statement_flags = false): void {
			output_space_before_token = false;

			if (!preserve_statement_flags) {
				if (flags.last_text !== ',' && flags.last_text !== '=' && (last_type !== 'TK_OPERATOR' || in_array(flags.last_text, ['++', '--', '%']))) {
					while (flags.mode === MODE.Statement && !flags.if_block && !flags.do_block) {
						restore_mode();
					}
				}
			}

			if (output_lines.length === 1 && just_added_newline()) {
				return; // no newline on start of file
			}

			if (force_newline || !just_added_newline()) {
				flags.multiline_frame = true;
				output_lines.push(create_output_line());
			}
		}

		function print_token_line_indentation(): void {
			if (just_added_newline()) {
				let line = output_lines[output_lines.length - 1];
				if (opt.keep_array_indentation && is_array(flags.mode) && input_wanted_newline) {
					// prevent removing of this whitespace as redundundant
					// line.text.push('');
					// for (let i = 0; i < whitespace_before_token.length; i += 1) {
					// 	line.text.push(whitespace_before_token[i]);
					// }
					if (preindent_string) {
						line.text.push(preindent_string);
					}
					if (is_expression(flags.parent.mode)) print_indent_string(flags.parent.indentation_level);
					else print_indent_string(flags.indentation_level);
				} else {
					if (preindent_string) {
						line.text.push(preindent_string);
					}

					print_indent_string(flags.indentation_level);
				}
			}
		}

		function print_indent_string(level: number): void {
			// Never indent your first output indent at the start of the file
			if (output_lines.length > 1) {
				let line = output_lines[output_lines.length - 1];

				flags.line_indent_level = level;
				for (let i = 0; i < level; i += 1) {
					line.text.push(indent_string);
				}
			}
		}

		function print_token_space_before(): void {
			let line = output_lines[output_lines.length - 1];
			if (output_space_before_token && line.text.length) {
				let last_output = line.text[line.text.length - 1];
				if (last_output !== ' ' && last_output !== indent_string) { // prevent occassional duplicate space
					line.text.push(' ');
				}
			}
		}

		function print_token(printable_token = ""): void {
			printable_token = printable_token || token_text;
			print_token_line_indentation();
			print_token_space_before();
			output_space_before_token = false;
			output_lines[output_lines.length - 1].text.push(printable_token);
		}

		function indent(): void {
			flags.indentation_level += 1;
		}

		function deindent(): void {
			if (flags.indentation_level > 0 &&
				((!flags.parent) || flags.indentation_level > flags.parent.indentation_level))
				flags.indentation_level -= 1;
		}

		function remove_redundant_indentation(frame: { multiline_frame: any; start_line_index: any; }): void {
			// This implementation is effective but has some issues:
			//     - less than great performance due to array splicing
			//     - can cause line wrap to happen too soon due to indent removal
			//           after wrap points are calculated
			// These issues are minor compared to ugly indentation.
			if (frame.multiline_frame)
				return;

			// remove one indent from each line inside this section
			let index = frame.start_line_index;
			let splice_index = 0;
			let line: { text: any; };

			while (index < output_lines.length) {
				line = output_lines[index];
				index++;

				// skip empty lines
				if (line.text.length === 0) {
					continue;
				}

				// skip the preindent string if present
				if (preindent_string && line.text[0] === preindent_string) {
					splice_index = 1;
				} else {
					splice_index = 0;
				}

				// remove one indent, if present
				if (line.text[splice_index] === indent_string) {
					line.text.splice(splice_index, 1);
				}
			}
		}

		function set_mode(mode: any): void {
			if (flags) {
				flag_store.push(flags);
				previous_flags = flags;
			} else {
				previous_flags = create_flags(null, mode);
			}

			flags = create_flags(previous_flags, mode);
		}

		function is_array(mode: any): boolean {
			return mode === MODE.ArrayLiteral;
		}

		function is_expression(mode: any): boolean {
			return in_array(mode, [MODE.Expression, MODE.ForInitializer, MODE.Conditional]);
		}

		function restore_mode(): void {
			if (flag_store.length > 0) {
				previous_flags = flags;
				flags = flag_store.pop();
				if (previous_flags.mode === MODE.Statement) {
					remove_redundant_indentation(previous_flags);
				}
			}
		}

		function start_of_object_property(): boolean {
			return flags.parent.mode === MODE.ObjectLiteral && flags.mode === MODE.Statement && flags.last_text === ':' &&
				flags.ternary_depth === 0;
		}

		function start_of_statement(): boolean {
			if ((last_type === 'TK_RESERVED' && !input_wanted_newline && in_array(flags.last_text.toLowerCase(), ['local', 'static', 'global']) && token_type === 'TK_WORD') ||
				(last_type === 'TK_RESERVED' && flags.last_text.match(/^loop|try|catch|finally$/i)) ||
				(last_type === 'TK_RESERVED' && flags.last_text.match(/^return$/i) && !input_wanted_newline) ||
				(last_type === 'TK_RESERVED' && flags.last_text.match(/^else$/i) && !(token_type === 'TK_RESERVED' && token_text_low === 'if')) ||
				(last_type === 'TK_END_EXPR' && (previous_flags.mode === MODE.ForInitializer || previous_flags.mode === MODE.Conditional)) ||
				(last_type === 'TK_WORD' && flags.mode === MODE.BlockStatement
					&& !flags.in_case && !in_array(token_type, ['TK_WORD', 'TK_RESERVED', 'TK_START_EXPR'])
					&& !in_array(token_text, ['--', '++', '%', '::'])) ||
				(flags.mode === MODE.ObjectLiteral && flags.last_text === ':' && flags.ternary_depth === 0)) {

				set_mode(MODE.Statement);
				indent();

				if (last_type === 'TK_RESERVED' && in_array(flags.last_text.toLowerCase(), ['local', 'static', 'global']) && token_type === 'TK_WORD') {
					flags.declaration_statement = true;
				}
				// Issue #276:
				// If starting a new statement with [if, for, while, do], push to a new line.
				// if (a) if (b) if(c) d(); else e(); else f();
				if (!start_of_object_property()) {
					allow_wrap_or_preserved_newline(token_type === 'TK_RESERVED' && flags.last_text.toLowerCase() !== 'try' && in_array(token_text_low, ['loop', 'for', 'if', 'while']));
				}

				return true;
			} else if (token_text === '=>')
				set_mode(MODE.Statement), indent(), flags.declaration_statement = true;
			return false;
		}

		function all_lines_start_with(lines: string[], c: string): boolean {
			for (let i = 0; i < lines.length; i++) {
				let line = trim(lines[i]);
				if (line.charAt(0) !== c) {
					return false;
				}
			}
			return true;
		}

		function is_special_word(word: string): boolean {
			return in_array(word.toLowerCase(), ['return', 'loop', 'if', 'throw', 'else']);
		}

		function in_array(what: string, arr: string | any[]): boolean {
			for (let i = 0; i < arr.length; i += 1) {
				if (arr[i] === what) {
					return true;
				}
			}
			return false;
		}

		function unescape_string(s: string): string {
			let esc = false, out = '', pos = 0, s_hex = '', escaped = 0, c = '';

			while (esc || pos < s.length) {
				c = s.charAt(pos), pos++;
				if (esc) {
					esc = false;
					if (c === 'x') {
						// simple hex-escape \x24
						s_hex = s.substr(pos, 2);
						pos += 2;
					} else if (c === 'u') {
						// unicode-escape, \u2134
						s_hex = s.substr(pos, 4);
						pos += 4;
					} else {
						// some common escape, e.g \n
						out += '\\' + c;
						continue;
					}
					if (!s_hex.match(/^[0123456789abcdefABCDEF]+$/)) {
						// some weird escaping, bail out,
						// leaving whole string intact
						return s;
					}

					escaped = parseInt(s_hex, 16);

					if (escaped >= 0x00 && escaped < 0x20) {
						// leave 0x00...0x1f escaped
						if (c === 'x') {
							out += '\\x' + s_hex;
						} else {
							out += '\\u' + s_hex;
						}
						continue;
					} else if (escaped === 0x22 || escaped === 0x27 || escaped === 0x5c) {
						// single-quote, apostrophe, backslash - escape these
						out += '\\' + String.fromCharCode(escaped);
					} else if (c === 'x' && escaped > 0x7e && escaped <= 0xff) {
						// we bail out on \x7f..\xff,
						// leaving whole string escaped,
						// as it's probably completely binary
						return s;
					} else {
						out += String.fromCharCode(escaped);
					}
				} else if (c === '\\') {
					esc = true;
				} else {
					out += c;
				}
			}
			return out;
		}

		function is_next(find: string): boolean {
			let local_pos = parser_pos;
			let c = input.charAt(local_pos);
			while (in_array(c, whitespace) && c !== find) {
				local_pos++;
				if (local_pos >= input_length) {
					return false;
				}
				c = input.charAt(local_pos);
			}
			return c === find;
		}

		function end_bracket_of_expression(pos: number): void {
			let pLF = input.indexOf('\n', pos);
			if (pLF === -1) {
				pLF = input_length;
			}
			let LF = input.substring(parser_pos, pLF).trim();
			if (!is_array(flags.mode) && !(LF.length === 0 || bracketnum > 0 || LF.match(/^([;#]|\/\*|(and|or|is|in)\b)/i) || (!LF.match(/^(\+\+|--|!|~|%)/) && in_array(LF.charAt(0), punct)))) {
				following_bracket = false;
				restore_mode();
				remove_redundant_indentation(previous_flags);
				last_type = 'TK_END_EXPR';
				flags.last_text = ')';
			}
		}

		function get_next_token(): Token {
			let resulting_string: string, bg: boolean = false;
			n_newlines = 0;
			if (parser_pos >= input_length) {
				return createToken('', 'TK_EOF', input_length - 1, 0, true);
			}

			let c = input.charAt(parser_pos);
			input_wanted_newline = false, whitespace_before_token = [], parser_pos += 1;

			while (in_array(c, whitespace)) {

				if (c === '\n') {
					last_LF = parser_pos - 1;
					if (following_bracket) {
						end_bracket_of_expression(parser_pos);
					}
					n_newlines += 1, begin_line = true;
					whitespace_before_token = [];
				} else if (n_newlines) {
					if (c === indent_string) {
						whitespace_before_token.push(indent_string);
					} else if (c !== '\r') {
						whitespace_before_token.push(' ');
					}
				}

				if (parser_pos >= input_length) {
					return createToken('', 'TK_EOF', input_length - 1, 0, true);
				}

				c = input.charAt(parser_pos);
				parser_pos += 1;
			}

			let offset = parser_pos - 1, len = 1;
			beginpos = offset;
			if (begin_line) {
				begin_line = false, bg = true;
				let next_LF = input.indexOf('\n', parser_pos);
				if (next_LF === -1) {
					next_LF = input_length;
				}
				let line = input.substring(last_LF + 1, next_LF).trim();
				let m: RegExpMatchArray | null;
				if (line.indexOf('::') === -1) {

				} else if (m = line.match(/^(:(\s|\*|\?|c[01]?|[pk]\d+|s[ipe]|[brto]0?|x|z)*:[\x09\x20-\x7E]+?::)(.*)$/i)) {
					if ((m[2] && m[2].match(/[xX]/)) || (m[3] && m[3].trim().match(/^\{\s*(\s;.*)?$/))) {
						parser_pos += m[1].length - 1;
						return createToken(m[1], 'TK_HOT', offset, m[1].length, true);
					} else {
						last_LF = next_LF, parser_pos += m[1].length - 1, begin_line = true;
						return createToken(m[1], 'TK_HOTLINE', offset, m[1].length, true);
					}
				} else if (m = line.match(/^(\$?[~*]{0,2}((([<>]?[!+#^]){0,4}(`;|[\x21-\x3A\x3C-\x7E]|[a-z][a-z\d_]+))|(`;|[\x21-\x3A\x3C-\x7E]|[a-z][a-z\d_]+)\s*&\s*(`;|[\x21-\x3A\x3C-\x7E]|[a-z][a-z\d_]+))(\s+up)?\s*::)(.*)$/i)) {
					if (m[9].trim().match(/^([~*]{0,2}[<>]?[!+#^]){0,4}(`{|[\x21-\x7A\x7C-\x7E]|[a-z][a-z\d_]+)\s*(\s;.*)?$/i)) {
						last_LF = next_LF, begin_line = true;
						parser_pos = input.indexOf('::', parser_pos) + m[9].length - m[9].trimLeft().length + 2;
						return createToken(m[1].replace(/\s+/g, ' '), 'TK_HOTLINE', offset, m[1].length, true);
					} else {
						parser_pos = input.indexOf('::', parser_pos) + 2;
						return createToken(m[1].replace(/\s+/g, ' '), 'TK_HOT', offset, m[1].length, true);
					}
				}
			}

			// NOTE: because beautifier doesn't fully parse, it doesn't use acorn.isIdentifierStart.
			// It just treats all identifiers and numbers and such the same.
			if (acorn.isIdentifierChar(input.charCodeAt(parser_pos - 1))) {
				if (parser_pos < input_length) {
					while (acorn.isIdentifierChar(input.charCodeAt(parser_pos))) {
						c += input.charAt(parser_pos);
						parser_pos += 1;
						if (parser_pos === input_length) {
							break;
						}
					}
				}

				// small and surprisingly unugly hack for 1E-10 representation
				if (parser_pos !== input_length && c.match(/^[0-9]+[Ee]$/) && (input.charAt(parser_pos) === '-' || input.charAt(parser_pos) === '+')) {
					let sign = input.charAt(parser_pos);
					parser_pos += 1, c += sign + get_next_token().content;
					return createToken(c, 'TK_NUMBER', offset, c.length, bg);
				} else if (input.charAt(offset - 1) !== '.' && in_array(c.toLowerCase(), reserved_words)) {
					if (c.match(/^(and|or|not|in|is|contains)$/i)) { // hack for 'in' operator
						return createToken(c, 'TK_OPERATOR', offset, c.length, bg);
					}
					return createToken(c, 'TK_RESERVED', offset, c.length, bg);
				} else if (bg && input.charAt(parser_pos) === ':') {
					let LF = input.indexOf('\n', parser_pos);
					if (LF === -1) LF = input_length;
					if (input.substring(parser_pos + 1, LF).trim().match(/^($|;)/)) {
						parser_pos += 1;
						return createToken(c + ':', 'TK_LABEL', offset, c.length + 1, true);
					}
				}
				let t: any;
				if (t = c.match(/^(0[xX][0-9a-fA-F]+|([0-9]+))$/)) {
					if (t[2] !== undefined && input.charAt(parser_pos) === '.' && input.charAt(offset - 1) !== '.') {
						let cc = '', p = parser_pos + 1;
						while (p < input_length && acorn.isIdentifierChar(input.charCodeAt(p)))
							cc += input.charAt(p), p += 1;
						if (input.charAt(p) !== '.' && cc.match(/^\d*$/)) c += '.' + cc, parser_pos = p;
					}
					return createToken(c, 'TK_NUMBER', offset, c.length, bg);
				}
				return createToken(c, 'TK_WORD', offset, c.length, bg);
			}

			if (c === '(' || c === '[') {
				if (following_bracket && c === '(') {
					bracketnum++;
				}
				return createToken(c, 'TK_START_EXPR', offset, 1, bg);
			}

			if (c === ')' || c === ']') {
				if (following_bracket && c === ')') {
					bracketnum--;
				}
				return createToken(c, 'TK_END_EXPR', offset, 1, bg);
			}

			if (c === '{') {
				return createToken(c, 'TK_START_BLOCK', offset, 1, bg);
			}

			if (c === '}') {
				return createToken(c, 'TK_END_BLOCK', offset, 1, bg);
			}

			if (c === ';') {
				if (following_bracket) {
					end_bracket_of_expression(input.indexOf('\n', parser_pos));
				}
				let comment = '', comment_type = 'TK_INLINE_COMMENT';
				if (bg) {
					comment_type = 'TK_COMMENT'
				}
				while (parser_pos <= input_length && c != '\n') {
					comment += c;
					c = input.charAt(parser_pos);
					parser_pos += 1;
				}
				if (c === '\n') {
					parser_pos--;
					last_LF = parser_pos;
				}
				comment = comment.trimRight();
				if (bg && _this.blocks && comment.match(/^;;/)) _this.blocks.push(DocumentSymbol.create(comment.replace(/^[;\s]+/, ''), undefined, SymbolKind.Object, makerange(offset, comment.length), makerange(offset, comment.length)));
				return createToken(comment, comment_type, offset, comment.length, bg);
			}

			if (c === '/' && bg) {
				let comment = '';
				// peek for comment /* ... */
				if (input.charAt(parser_pos) === '*') {
					parser_pos += 1;
					let LF = input.indexOf('\n', parser_pos), b = parser_pos;
					while (LF !== -1 && !input.substring(parser_pos, LF).match(/\*\/\s*$/)) {
						LF = input.indexOf('\n', parser_pos = LF + 1);
					}
					if (LF === -1) {
						parser_pos = input_length;
						return createToken(input.substring(offset, input_length) + '*/', 'TK_BLOCK_COMMENT', offset, input_length - offset, bg);
					} else {
						parser_pos = LF;
						return createToken(input.substring(offset, LF).trimRight(), 'TK_BLOCK_COMMENT', offset, LF - offset, bg)
					}
				}
			}

			if (c === "'" || c === '"') { // string
				let sep = c, esc = false;
				resulting_string = c;
				if (parser_pos < input_length) {
					// handle string
					while ((c = input.charAt(parser_pos)) !== sep || esc) {
						resulting_string += c;
						if (c === '\n') {
							let pos = parser_pos + 1, LF = input.substring(pos, (parser_pos = input.indexOf('\n', pos)) + 1);
							last_LF = parser_pos;
							while (LF.trim() === '') {
								pos = parser_pos + 1, parser_pos = input.indexOf('\n', pos);
								if (parser_pos === -1) {
									resulting_string += input.substring(pos, parser_pos = input_length);
									return createToken(resulting_string, 'TK_STRING', offset, resulting_string.trimRight().length, bg);
								}
								last_LF = parser_pos, LF = input.substring(pos, parser_pos + 1);
							}
							let whitespace: any = LF.match(/^(\s*)\(/);
							if (!whitespace) {
								parser_pos = pos, n_newlines++;
								return createToken(resulting_string = resulting_string.trimRight(), 'TK_UNKNOWN', offset, resulting_string.length, bg);
							}
							whitespace = whitespace[1];
							while (LF.trim().indexOf(')' + sep) !== 0) {
								resulting_string += LF, pos = parser_pos + 1, parser_pos = input.indexOf('\n', pos);
								if (parser_pos === -1) {
									resulting_string += input.substring(pos, parser_pos = input_length);
									return createToken(resulting_string, 'TK_STRING', offset, parser_pos - offset, bg);
								}
								last_LF = parser_pos, LF = input.substring(pos, parser_pos + 1);
							}
							parser_pos = pos + LF.indexOf(')' + sep) + 2;
							resulting_string += whitespace + input.substring(pos, parser_pos).trim();
							return createToken(resulting_string, 'TK_STRING', offset, parser_pos - offset, bg);
						}
						if (esc) {
							esc = false;
						} else {
							esc = input.charAt(parser_pos) === '`';
						}
						parser_pos += 1;
						if (parser_pos >= input_length) {
							// incomplete string/rexp when end-of-file reached.
							// bail out with what had been received so far.
							return createToken(resulting_string, 'TK_STRING', offset, parser_pos - offset, bg);
						}
					}
				}

				parser_pos += 1;
				resulting_string += sep;

				return createToken(resulting_string, 'TK_STRING', offset, parser_pos - offset, bg);
			}

			if (c === '#') {
				// Spidermonkey-specific sharp variables for circular references
				// https://developer.mozilla.org/En/Sharp_variables_in_JavaScript
				// http://mxr.mozilla.org/mozilla-central/source/js/src/jsscan.cpp around line 1935
				let sharp = '#';
				c = input.charAt(parser_pos);
				if (bg && parser_pos < input_length && !in_array(c, whitespace)) {
					while (parser_pos < input_length && !in_array(c = input.charAt(parser_pos), whitespace)) {
						sharp += c;
						parser_pos += 1;
					}
					if ((c === ' ' || c === '\t') && sharp.match(/#(dllload|hotstring|include|requires|errorstdout)/i)) {
						let LF = input.indexOf('\n', parser_pos);
						if (LF === -1) {
							LF = input_length;
						}
						sharp += ' ' + input.substring(parser_pos, LF).trim();
						last_LF = parser_pos = LF;
					}
					return createToken(sharp, 'TK_SHARP', offset, parser_pos - offset, bg);
				}
			}

			if (c === '.') {
				let nextc = input.charAt(parser_pos);
				if (nextc === '=') {
					parser_pos++
					return createToken('.=', 'TK_OPERATOR', offset, 2, bg);
				}
				else if (in_array(nextc, [' ', '\t'])) {
					return createToken(c, 'TK_OPERATOR', offset, 1, bg);
				}
				return createToken(c, 'TK_DOT', offset, 1, bg);
			}

			if (in_array(c, punct)) {
				let f = parser_pos;
				while (parser_pos < input_length && in_array(c + input.charAt(parser_pos), punct)) {
					c += input.charAt(parser_pos);
					parser_pos += 1;
					if (parser_pos >= input_length) {
						break;
					}
				}

				if (c === ',') {
					return createToken(c, 'TK_COMMA', offset, 1, bg);
				}
				return createToken(c, c.match(/([:.+\-*/|&^]|\/\/|>>|<<)=/) ? 'TK_EQUALS' : 'TK_OPERATOR', offset, c.length, bg);
			}
			if (c === '`') {
				if (parser_pos < input_length) {
					c += input.charAt(parser_pos), parser_pos++;
				}
				return createToken(c, 'TK_WORD', offset, 2, bg);
			}
			return createToken(c, 'TK_UNKNOWN', offset, c.length, bg);
		}

		function handle_start_expr(): void {
			if (start_of_statement()) {
				// The conditional starts the statement if appropriate.
				switch (flags.last_word.toLowerCase()) {
					case 'try':
						if (!input_wanted_newline && in_array(token_text_low, ['if', 'while', 'loop', 'for']))
							restore_mode();
					case 'if':
					case 'catch':
					case 'finally':
					case 'else':
					case 'while':
					case 'loop':
					case 'for':
						flags.declaration_statement = true;
						break;
				}
			}

			let next_mode = MODE.Expression;
			if (token_text === '[') {

				if (last_type === 'TK_WORD' || flags.last_text === ')') {
					// this is array index specifier, break immediately
					// a[x], fn()[x]
					if (last_type === 'TK_RESERVED' && in_array(flags.last_text.toLowerCase(), line_starters)) {
						output_space_before_token = true;
					}
					set_mode(next_mode);
					print_token();
					indent();
					if (opt.space_in_paren) {
						output_space_before_token = true;
					}
					return;
				}

				next_mode = MODE.ArrayLiteral;
				if (is_array(flags.mode)) {
					if (flags.last_text === '[' ||
						(flags.last_text === ',' && (last_last_text === ']' || last_last_text === '}'))) {
						// ], [ goes to new line
						// }, [ goes to new line
						if (!opt.keep_array_indentation) {
							print_newline();
						}
					}
				}

			} else {
				if (last_type === 'TK_RESERVED' && in_array(flags.last_text.toLowerCase(), ['for', 'loop'])) {
					next_mode = MODE.ForInitializer;
				} else if (last_type === 'TK_RESERVED' && in_array(flags.last_text.toLowerCase(), ['if', 'while'])) {
					next_mode = MODE.Conditional;
				} else {
					// next_mode = MODE.Expression;
				}
			}

			if (last_type === 'TK_START_BLOCK') {
				print_newline();
			} else if (last_type === 'TK_END_EXPR' || last_type === 'TK_START_EXPR' || last_type === 'TK_END_BLOCK' || flags.last_text === '.') {
				// TODO: Consider whether forcing this is required.  Review failing tests when removed.
				allow_wrap_or_preserved_newline(input_wanted_newline);
				// do nothing on (( and )( and ][ and ]( and .(
			} else if (!(last_type === 'TK_RESERVED' && token_text === '(') && (last_type !== 'TK_WORD' || flags.last_text.match(/^#[a-z]+/i)) && last_type !== 'TK_OPERATOR') {
				output_space_before_token = true;
			} else if (last_type === 'TK_RESERVED' && (in_array(flags.last_text.toLowerCase(), line_starters) || flags.last_text.match(/^catch$/i))) {
				if (opt.space_before_conditional) {
					output_space_before_token = true;
				}
			}

			// Support of this kind of newline preservation.
			// a = (b &&
			//     (c || d));
			if (token_text === '(') {
				if (last_type === 'TK_EQUALS' || last_type === 'TK_OPERATOR') {
					if (!start_of_object_property()) {
						allow_wrap_or_preserved_newline();
					}
				}
				else if (last_type === 'TK_END_EXPR') {
					output_space_before_token = true;
				}
				else if (last_type === 'TK_WORD') {
					if (parser_pos > 1 && in_array(input.charAt(parser_pos - 2), [' ', '\t'])) {
						output_space_before_token = true;
					}
				}
				else if (flags.last_text.toLowerCase() === 'until') {
					output_space_before_token = true;
				}
			}

			if (input_wanted_newline) {
				print_newline(false, flags.declaration_statement);
				// print_newline(false, true);
			}
			set_mode(next_mode);
			print_token();
			if (opt.space_in_paren) {
				output_space_before_token = true;
			}

			// In all cases, if we newline while inside an expression it should be indented.
			indent();
		}

		function handle_end_expr() {
			// statements inside expressions are not valid syntax, but...
			// statements must all be closed when their container closes
			while (flags.mode === MODE.Statement) {
				restore_mode();
			}

			if (flags.multiline_frame) {
				allow_wrap_or_preserved_newline(token_text === ']' && is_array(flags.mode) && !opt.keep_array_indentation);
			}

			if (opt.space_in_paren) {
				if (last_type === 'TK_START_EXPR' && !opt.space_in_empty_paren) {
					// () [] no inner space in empty parens like these, ever, ref #320
					trim_output();
					output_space_before_token = false;
				} else {
					output_space_before_token = true;
				}
			}
			restore_mode();
			print_token();
			remove_redundant_indentation(previous_flags);

			// do {} while () // no statement required after
			if (flags.do_while && previous_flags.mode === MODE.Conditional) {
				previous_flags.mode = MODE.Expression;
				flags.do_block = false;
				flags.do_while = false;

			}
		}

		function handle_start_block() {
			if (following_bracket) {
				following_bracket = false;
				restore_mode();
				remove_redundant_indentation(previous_flags);
				last_type = 'TK_END_EXPR';
				flags.last_text = ')';
			}
			set_mode(MODE.BlockStatement);

			let empty_braces = is_next('}');
			let empty_anonymous_function = empty_braces && flags.last_word === 'function' &&
				last_type === 'TK_END_EXPR';

			if (opt.brace_style === "expand") {
				if (last_type !== 'TK_OPERATOR' &&
					(empty_anonymous_function ||
						last_type === 'TK_EQUALS' ||
						(last_type === 'TK_RESERVED' && is_special_word(flags.last_text) && flags.last_text.toLowerCase() !== 'else'))) {
					output_space_before_token = true;
				} else {
					print_newline(false, true);
				}
			} else { // collapse
				if (last_type === 'TK_UNKNOWN' || last_type === 'TK_HOTLINE') {

				} else if (last_type !== 'TK_OPERATOR' && last_type !== 'TK_START_EXPR') {
					if (input_wanted_newline || last_type === 'TK_START_BLOCK') {
						print_newline();
					} else {
						output_space_before_token = true;
					}
				} else {
					// if TK_OPERATOR or TK_START_EXPR
					if (is_array(previous_flags.mode) && flags.last_text === ',') {
						if (last_last_text === '}') {
							// }, { in array context
							output_space_before_token = true;
						} else {
							print_newline(); // [a, b, c, {
						}
					}
				}
			}
			print_token();
			indent();
		}

		function handle_end_block() {
			// statements must all be closed when their container closes
			while (flags.mode === MODE.Statement) {
				restore_mode();
			}
			let empty_braces = last_type === 'TK_START_BLOCK';

			if (opt.brace_style === "expand") {
				if (!empty_braces) {
					print_newline();
				}
			} else {
				// skip {}
				if (!empty_braces) {
					if (is_array(flags.mode) && opt.keep_array_indentation) {
						// we REALLY need a newline here, but newliner would skip that
						opt.keep_array_indentation = false;
						print_newline();
						opt.keep_array_indentation = true;
					} else if (input_wanted_newline || !(flags.mode === MODE.ObjectLiteral && keep_Object_line)) {
						print_newline();
					}
				}
			}
			restore_mode();
			print_token();
		}

		function handle_word() {
			if (start_of_statement()) {
				// The conditional starts the statement if appropriate.
				switch (flags.last_word.toLowerCase()) {
					case 'try':
						if (!input_wanted_newline && in_array(token_text_low, ['if', 'while', 'loop', 'for']))
							restore_mode();
					case 'if':
					case 'catch':
					case 'finally':
					case 'else':
					case 'while':
					case 'loop':
					case 'for':
						flags.declaration_statement = true;
						break;
				}
			} else if (input_wanted_newline && !is_expression(flags.mode) &&
				(last_type !== 'TK_OPERATOR' || in_array(flags.last_text, ['--', '++', '%'])) && last_type !== 'TK_EQUALS' &&
				(opt.preserve_newlines || !(last_type === 'TK_RESERVED' && in_array(flags.last_text.toLowerCase(), ['local', 'static', 'global', 'set', 'get'])))) {
				print_newline();
			}

			if (flags.do_block && !flags.do_while) {
				if (last_type === 'TK_RESERVED' && flags.last_text.match(/^until$/i)) {
					// do {} ## while ()
					output_space_before_token = true;
					print_token();
					output_space_before_token = true;
					flags.do_while = true;
					return;
				} else {
					// loop .. \n .. \n throw ..
					// print_newline();
					flags.do_block = false;
				}
			}

			// if may be followed by else, or not
			// Bare/inline ifs are tricky
			// Need to unwind the modes correctly: if (a) if (b) c(); else d(); else e();
			if (flags.if_block) {
				if (!flags.else_block && (token_type === 'TK_RESERVED' && token_text_low === 'else')) {
					flags.else_block = true;
				} else {
					if (token_text_low !== 'if') {
						while (flags.mode === MODE.Statement) {
							restore_mode();
						}
					}
					flags.if_block = false;
					flags.else_block = false;
				}
			}
			if (flags.in_case_statement || (flags.mode === 'BlockStatement' && flags.last_word.toLowerCase() === 'switch')) {
				if ((token_text_low === 'case' && token_type === 'TK_RESERVED') || token_text_low === 'default') {
					print_newline();
					if (flags.case_body) {
						// switch cases following one another
						deindent();
						flags.case_body = false;
					}
					print_token();
					flags.in_case = true;
					flags.in_case_statement = true;
					return;
				}
			}
			if (last_type === 'TK_COMMA' || last_type === 'TK_START_EXPR' || flags.last_text === '::') {
				if (!start_of_object_property()) {
					allow_wrap_or_preserved_newline();
				}
			}

			prefix = 'NONE';

			if (last_type === 'TK_END_BLOCK') {
				if (!(token_type === 'TK_RESERVED' && in_array(token_text_low, ['else', 'until', 'catch', 'finally']))) {
					prefix = 'NEWLINE';
				} else {
					if (opt.brace_style === "expand" || opt.brace_style === "end-expand") {
						prefix = 'NEWLINE';
					} else {
						prefix = 'SPACE';
						output_space_before_token = true;
					}
				}
			} else if (last_type === 'TK_SEMICOLON' && flags.mode === MODE.BlockStatement) {
				// TODO: Should this be for STATEMENT as well?
				prefix = 'NEWLINE';
			} else if (last_type === 'TK_SEMICOLON' && is_expression(flags.mode)) {
				prefix = 'SPACE';
			} else if (last_type === 'TK_STRING') {
				prefix = 'SPACE';
			} else if (last_type === 'TK_RESERVED' || last_type === 'TK_WORD') {
				prefix = 'SPACE';
			} else if (last_type === 'TK_START_BLOCK') {
				prefix = 'NEWLINE';
			} else if (last_type === 'TK_END_EXPR') {
				output_space_before_token = true;
				prefix = 'NEWLINE';
			}

			if (token_type === 'TK_RESERVED' && in_array(token_text_low, line_starters) && flags.last_text !== ')') {
				if (flags.last_text.match(/^else$/i)) {
					prefix = 'SPACE';
				} else if (flags.last_text.toLowerCase() === 'try' && in_array(token_text_low, ['if', 'while', 'loop', 'for'])) {
					prefix = 'SPACE';
				} else if (flags.last_text !== '::') {
					prefix = 'NEWLINE';
				}
			}

			if (token_type === 'TK_RESERVED' && in_array(token_text_low, ['else', 'until', 'catch', 'finally'])) {
				if (last_type !== 'TK_END_BLOCK' || opt.brace_style === "expand" || opt.brace_style === "end-expand") {
					print_newline();
				} else if ((token_text_low === 'else' && flags.last_word.toLowerCase() === 'if')
					|| (token_text_low === 'until' && flags.last_word.toLowerCase() === 'loop')
					|| (token_text_low === 'catch' && flags.last_word.toLowerCase() === 'try')
					|| (token_text_low === 'finally' && flags.last_word.toLowerCase() === 'catch')) {
					trim_output(true);
					let line = output_lines[output_lines.length - 1];
					// If we trimmed and there's something other than a close block before us
					// put a newline back in.  Handles '} // comment' scenario.
					if (line.text[line.text.length - 1] !== '}') {
						print_newline();
					}
					output_space_before_token = true;
				} else
					restore_mode();
			} else if (prefix === 'NEWLINE') {
				if (flags.had_comment) {
					print_newline();
				} else if (last_type === 'TK_RESERVED' && is_special_word(flags.last_text)) {
					// no newline between 'return nnn'
					output_space_before_token = true;
				} else if (last_type !== 'TK_END_EXPR') {
					if ((last_type !== 'TK_START_EXPR' || !(token_type === 'TK_RESERVED' && in_array(token_text_low, ['local', 'static', 'global']))) && flags.last_text !== ':') {
						// no need to force newline on 'let': for (let x = 0...)
						if (token_type === 'TK_RESERVED' && token_text_low === 'if' && flags.last_word.match(/^else$/i) && flags.last_text !== '{') {
							// no newline for } else if {
							output_space_before_token = true;
						} else {
							print_newline();
						}
					}
				} else if (token_type === 'TK_RESERVED' && in_array(token_text_low, line_starters) && flags.last_text !== ')') {
					print_newline();
				}
				// } else if (is_array(flags.mode) && flags.last_text === ',' && last_last_text === '}') {
				//     print_newline(); // }, in lists get a newline treatment
			} else if (prefix === 'SPACE') {
				output_space_before_token = true;
			} else if (is_array(flags.mode) && just_added_newline())
				print_token_line_indentation();

			if (prefix === 'NONE' && !just_added_newline() && (flags.had_comment)) {
				print_newline();
			}
			print_token();
			flags.last_word = token_text;

			if (token_type === 'TK_RESERVED' && token_text_low === 'loop') {
				flags.do_block = true;
			}

			if (token_type === 'TK_RESERVED' && token_text_low === 'if') {
				flags.if_block = true;
			}
		}

		function handle_semicolon() {
			if (start_of_statement()) {
				// The conditional starts the statement if appropriate.
				// Semicolon can be the start (and end) of a statement
				output_space_before_token = false;
			}
			while (flags.mode === MODE.Statement && !flags.if_block && !flags.do_block) {
				restore_mode();
			}
			print_token();
			if (flags.mode === MODE.ObjectLiteral) {
				// if we're in OBJECT mode and see a semicolon, its invalid syntax
				// recover back to treating this as a BLOCK
				flags.mode = MODE.BlockStatement;
			}
		}

		function handle_string() {
			if (start_of_statement()) {
				// The conditional starts the statement if appropriate.
				// One difference - strings want at least a space before
				output_space_before_token = true;
			} else if (last_type === 'TK_RESERVED' || last_type === 'TK_WORD') {
				if (input_wanted_newline) {
					print_newline();
				}
				output_space_before_token = true;
			} else if (last_type === 'TK_COMMA' || last_type === 'TK_START_EXPR' || last_type === 'TK_EQUALS' || last_type === 'TK_OPERATOR') {
				if (!start_of_object_property()) {
					allow_wrap_or_preserved_newline();
				}
			} else {
				// print_newline();
				if (input_wanted_newline || flags.last_text === '{') {
					print_newline();
				}
				output_space_before_token = true;
			}
			print_token();
		}

		function handle_equals() {
			if (start_of_statement()) {
				// The conditional starts the statement if appropriate.
			}

			output_space_before_token = true;
			print_token();
			output_space_before_token = true;
		}

		function handle_comma() {
			if (flags.declaration_statement) {
				if (input_wanted_newline) {
					print_newline(false, true);
				}
				print_token();
				output_space_before_token = true;
				return;
			}

			if (last_type === 'TK_END_BLOCK' && flags.mode !== MODE.Expression) {
				print_token();
				if (flags.mode === MODE.ObjectLiteral && flags.last_text === '}') {
					print_newline();
				} else {
					output_space_before_token = true;
				}
			} else {
				if (flags.mode === MODE.ObjectLiteral ||
					(flags.mode === MODE.Statement && flags.parent.mode === MODE.ObjectLiteral)) {
					let had_comment = flags.had_comment;
					if (flags.mode === MODE.Statement) {
						restore_mode();
					}
					if (had_comment) {
						let line = output_lines[output_lines.length - 1].text, comment = [];
						if (line[line.length - 1].charAt(0) === ';') {
							comment.push(line.pop());
							while (line.length > 0 && in_array(line[line.length - 1], ['\t', ' ']))
								comment.unshift(line.pop());
							output_space_before_token = false;
						}
						print_token(), line.push(...comment);
						if (comment.length) print_newline(); else output_space_before_token = true;
					} else {
						print_token();
						if (is_next(';')) {
							print_token('\t'), print_token(get_next_token().content);
							print_newline();
						} else if (keep_Object_line) {
							output_space_before_token = true;
						} else {
							print_newline();
						}
					}
				} else {
					// EXPR or DO_BLOCK
					if (input_wanted_newline) {
						print_newline();
					}
					print_token();
					output_space_before_token = true;
				}
			}
		}

		function handle_operator() {
			if (token_text === ':' && flags.ternary_depth === 0 && !flags.in_case) {
				// Check if this is a BlockStatement that should be treated as a ObjectLiteral
				// if (flags.mode === MODE.BlockStatement && last_last_text === '{' && (last_type === 'TK_WORD' || last_type === 'TK_RESERVED')) {
				if (flags.mode === MODE.BlockStatement && last_last_text === '{') {
					flags.mode = MODE.ObjectLiteral, keep_Object_line = true;
					let pos = parser_pos - 1, c = '';
					while (pos >= 0 && (c = input.charAt(pos)) !== '{') {
						if (c === '\n') {
							keep_Object_line = false;
							break;
						}
						pos--;
					}
					if (keep_Object_line && output_lines.length > 1) {
						let t = output_lines.pop();
						output_lines[output_lines.length - 1].text.push(t?.text.join('').trim());
					}
				}
			}

			if (start_of_statement() && token_text === '%') {
				// The conditional starts the statement if appropriate.
				switch (flags.last_word.toLowerCase()) {
					case 'try':
						if (!input_wanted_newline && in_array(token_text_low, ['if', 'while', 'loop', 'for']))
							restore_mode();
					case 'if':
					case 'catch':
					case 'finally':
					case 'else':
					case 'while':
					case 'loop':
					case 'for':
						flags.declaration_statement = true;
						break;
				}
			}

			let space_before = true;
			let space_after = true;
			if (last_type === 'TK_RESERVED' && is_special_word(flags.last_text)) {
				// "return" had a special handling in TK_WORD. Now we need to return the favor
				output_space_before_token = true;
				print_token();
				return;
			}

			if (token_text === ':' && flags.in_case) {
				flags.case_body = true;
				indent(); print_token();
				let local_pos = parser_pos, c = '';
				while (local_pos < input_length && in_array(c = input.charAt(local_pos), [' ', '\t']))
					local_pos++;
				parser_pos = local_pos;
				if (c == '\r' || c == '\n') {
					print_newline();
				} else if (c == ';') {
					// let t = get_next_token();
					// token_text = t.content; output_space_before_token = true;
					// print_token(); print_newline();
				} else output_space_before_token = true;
				flags.in_case = false;
				return;
			}

			if (token_text === '::') {
				// no spaces around exotic namespacing syntax operator
				print_token();
				return;
			}

			// http://www.ecma-international.org/ecma-262/5.1/#sec-7.9.1
			// if there is a newline between -- or ++ and anything else we should preserve it.
			if (input_wanted_newline && (token_text === '--' || token_text === '++')) {
				print_newline(false, true);
			}

			// Allow line wrapping between operators
			if (last_type === 'TK_OPERATOR') {
				allow_wrap_or_preserved_newline();
			}

			if (in_array(token_text, ['--', '++', '!', '%']) || (in_array(token_text, ['-', '+']) && (in_array(last_type, ['TK_START_BLOCK', 'TK_START_EXPR', 'TK_EQUALS', 'TK_OPERATOR']) || in_array(flags.last_text.toLowerCase(), line_starters) || flags.last_text === ','))) {
				// unary operators (and binary +/- pretending to be unary) special cases
				space_before = false;
				space_after = false;

				if (flags.last_text === ';' && is_expression(flags.mode)) {
					// for (;; ++i)
					//        ^^^
					space_before = true;
				}

				if (last_type === 'TK_RESERVED') {
					space_before = true;
				}

				if (token_text === '%') {
					if (in_array(input.charAt(parser_pos - 2), [' ', '\t'])) {
						space_before = true;
					}
					if (in_array(input.charAt(parser_pos), [' ', '\t'])) {
						space_after = true;
					}
					if (input_wanted_newline) {
						output_space_before_token = false;
						print_newline(false, flags.declaration_statement);
					}
					else {
						output_space_before_token = output_space_before_token || space_before;
					}
					print_token();
					output_space_before_token = space_after;
					return;
				}
				if ((flags.mode === MODE.BlockStatement || flags.mode === MODE.Statement) && (flags.last_text === '{' || flags.last_text === ';')) {
					// { foo; --i }
					// foo(); --bar;
					print_newline();
				}
			} else if (token_text === ':') {
				if (flags.ternary_depth === 0) {
					if (flags.mode === MODE.BlockStatement) {
						flags.mode = MODE.ObjectLiteral;
					}
					space_before = false;
				} else {
					flags.ternary_depth -= 1;
				}
			} else if (token_text === '?') {
				flags.ternary_depth += 1;
			} else if (token_text === '&') {
				if (last_type !== 'TK_WORD' && last_type !== 'TK_END_EXPR') {
					space_after = false;
				}
			} else if (token_text === '*') {
				if (flags.last_text === '(' || (flags.last_type === 'TK_WORD' && is_next(')'))) {
					space_before = false;
				}
				if (input.charAt(parser_pos) === ')') {
					space_after = false;
				}
			}
			if (input_wanted_newline) {
				output_space_before_token = false;
				print_newline(false, true);
			}
			else {
				output_space_before_token = output_space_before_token || space_before;
			}
			print_token();
			output_space_before_token = space_after;
		}

		function handle_block_comment() {
			let lines = split_newlines(token_text);
			let j: number; // iterator for this case
			let javadoc = lines[0].match(/^\/\*@ahk2exe-keep/i) ? false : true;

			// block comment starts with a new line
			print_newline(false, true);

			// first line always indented
			print_token(lines[0]);
			for (j = 1; j < lines.length - 1; j++) {
				print_newline(false, true);
				if (javadoc) {
					print_token(' * ' + lines[j].replace(/^[\s\*]+|\s+$/g, ''));
				} else {
					print_token(lines[j].trim());
				}
			}
			if (lines.length > 1) {
				print_newline(false, true);
				print_token(' ' + trim(lines[lines.length - 1]));
			}
			// for comments of more than one line, make sure there's a new line after
			print_newline(false, true);
		}

		function handle_inline_comment() {
			// print_newline(false, true);
			output_space_before_token = false, output_lines[output_lines.length - 1].text.push('\t');
			print_token();
			output_space_before_token = true;
		}

		function handle_comment() {
			if (input_wanted_newline) {
				print_newline();
			}
			//  else {
			//     trim_output(true);
			// }
			print_token();
			// print_newline(false, true);
		}

		function handle_dot() {
			if (start_of_statement()) {
				// The conditional starts the statement if appropriate.
			}

			if (last_type === 'TK_RESERVED' && is_special_word(flags.last_text)) {
				output_space_before_token = true;
			} else {
				// allow preserved newlines before dots in general
				// force newlines on dots after close paren when break_chained - for bar().baz()
				allow_wrap_or_preserved_newline(flags.last_text === ')' && opt.break_chained_methods);
			}
			print_token();
		}

		function handle_word2() {
			token_type = 'TK_WORD';
			handle_word();
		}

		function handle_label() {
			if (token_text_low === 'default:' && (flags.in_case_statement || (flags.mode === 'BlockStatement' && flags.last_word.toLowerCase() === 'switch'))) {
				if (flags.case_body) {
					deindent();
					flags.case_body = false;
				}
				token_text_low = 'default', token_text = token_text.substr(0, token_text.length - 1), token_type = 'TK_WORD', parser_pos--;
				print_newline();
				print_token();
				flags.in_case = true;
				flags.in_case_statement = true;
				return;
			}
			print_newline();
			print_token();
			let t = output_lines[output_lines.length - 1].text;
			if (t[0].trim() === '')
				output_lines[output_lines.length - 1].text = t.slice(1);
			else
				indent();
			token_text = '::';
		}

		function handle_unknown() {
			if (input_wanted_newline && (last_type === 'TK_HOTLINE' || !just_added_newline()))
				print_newline(n_newlines === 1);
			print_token();
			if (token_type === 'TK_HOTLINE')
				output_lines[output_lines.length - 1].text.push(input.substring(parser_pos, last_LF).trimRight()), parser_pos = last_LF + 1;
			print_newline();
		}
	}

	public getWordAtPosition(position: Position, full: boolean = false): { text: string, range: Range } {
		let start = position.character, l = position.line;
		let line = this.document.getText(Range.create(Position.create(l, 0), Position.create(l + 1, 0)));
		let len = line.length, end = start;
		while (end < len && acorn.isIdentifierChar(line.charCodeAt(end)))
			end++;
		for (start = position.character - 1; start >= 0; start--)
			if ((!full || line.charAt(start) !== '.') && !acorn.isIdentifierChar(line.charCodeAt(start)))
				break;
		if (start + 1 < end)
			return { text: line.substring(start + 1, end), range: Range.create(Position.create(l, start + 1), Position.create(l, end)) };
		return { text: '', range: Range.create(position, position) };
	}

	public searchNode(name: string, position?: Position, kind?: SymbolKind | SymbolKind[], root?: DocumentSymbol[])
		: DocumentSymbol | null {
		let node: DocumentSymbol | null = null, temp: any, { line, character } = position || { line: 0, character: 0 }, same = false;
		if (!root) root = this.symboltree;
		if (kind === SymbolKind.Method || kind === SymbolKind.Property) {

		} else {
			for (const item of root) {
				if (position && ((same = (item.range.start.line === item.range.end.line)) && item.range.start.line === line && character >= item.range.start.character && character <= item.range.end.character)
					|| (!same && line >= item.range.start.line && line <= item.range.end.line)) {
					if (iskinds(item.kind, kind) && item.name.toLowerCase() === name) {
						for (const first of root) if (item.kind === first.kind && first.name.toLowerCase() === name) return node = first;
						return node = item;
					} else if (item.children) {
						if ((item.kind === SymbolKind.Function || item.kind === SymbolKind.Method) && iskinds(SymbolKind.Variable, kind)) {
							for (const it of (<FuncNode>item).params) if (it.name.toLowerCase() === name) return node = it;
							for (const stt of [(<FuncNode>item).statement.global, (<FuncNode>item).statement.define, (<FuncNode>item).statement.local])
								for (const key in stt) if (key === name) return node = stt[key];
							if (!((<FuncNode>item).statement.assume & FuncScope.LOCAL) && this.global)
								for (const key in this.global) if (key.toLowerCase() === name) return node = this.global[key];
						}
						if (temp = this.searchNode(name, position, kind, item.children)) return node = temp;
					}
				}
				if (!node && iskinds(item.kind, kind) && item.name.toLowerCase() === name) node = item;
			}
		}
		return node;

		function iskinds(kind: SymbolKind, kinds?: SymbolKind | SymbolKind[]): boolean {
			if (kinds === undefined) return true;
			else if (typeof kinds === 'object') {
				for (let it of kinds) if (it === kind) return true;
				return false;
			} else return kinds === kind;
		}
	}

	public buildContext(position: Position, full: boolean = true) {
		let word = this.getWordAtPosition(position, full), linetext = '';
		let { line, character } = word.range.end, pre = '', kind: SymbolKind = SymbolKind.Variable;
		if (word.range.start.character)
			pre = this.document.getText(Range.create(line, 0, line, word.range.start.character)).trim();
		let suf = this.document.getText(Range.create(line, character, line + 1, 0));
		if (word.text.indexOf('.') === -1) {
			if (suf.match(/^\(/) || (pre === '' && suf.match(/^\s*([\w,]|$)/)))
				kind = SymbolKind.Function;
		} else if (suf.match(/^\(/) || (pre === '' && suf.match(/^\s*([\w,]|$)/)))
			kind = SymbolKind.Method;
		else
			kind = SymbolKind.Property;
		linetext = this.document.getText(Range.create(line, 0, line + 1, 0)), suf = suf.trimRight();
		return { text: word.text, range: word.range, kind, pre, suf, linetext };
	}

	public getNodeAtPosition(position: Position): DocumentSymbol | null {
		let node: DocumentSymbol | null = null, context = this.buildContext(position);
		if (context) node = this.searchNode(context.text.toLowerCase(), context.range.end, context.kind);
		return node;
	}

	public searchScopedNode(position: Position, root?: DocumentSymbol[]): DocumentSymbol | undefined {
		let { line, character } = position, its: DocumentSymbol[] | undefined = undefined, it: DocumentSymbol | undefined;
		if (!root) root = this.flattreecache;
		for (const item of root) {
			if ((item.range.start.line === line && item.range.start.line === item.range.end.line && character >= item.range.start.character && character <= item.range.end.character)
				|| (item.range.end.line > item.range.start.line && line >= item.range.start.line && line <= item.range.end.line))
				if (item.kind !== SymbolKind.Variable && (its = item.children))
					if (!(it = this.searchScopedNode(position, its))) return item;
		}
		return it;
	}

	public getScopeChildren(scopenode?: DocumentSymbol) {
		let p: DocumentSymbol | undefined, nodes: DocumentSymbol[] = [], it: DocumentSymbol, vars: { [key: string]: any } = {}, _l = '';
		if (scopenode) {
			if ((<FuncNode>scopenode).params)
				for (it of (<FuncNode>scopenode).params) if (vars[_l = it.name.toLowerCase()]) continue; else vars[_l] = true, nodes.push(it);
			if (scopenode.children) for (it of scopenode.children) {
				if (it.kind === SymbolKind.Variable)
					if (vars[_l = it.name.toLowerCase()]) continue; else vars[_l] = true;
				nodes.push(it);
			}
			p = (<FuncNode>scopenode).parent;
			while (p && p.children && (p.kind === SymbolKind.Function || p.kind === SymbolKind.Method)) {
				if ((<FuncNode>p).params)
					for (it of (<FuncNode>p).params) if (vars[_l = it.name.toLowerCase()]) continue; else vars[_l] = true, nodes.push(it);
				for (it of p.children) {
					if (it.kind === SymbolKind.Event || it.kind === SymbolKind.Field) continue;
					if (it.kind === SymbolKind.Variable)
						if (vars[_l = it.name.toLowerCase()]) continue; else vars[_l] = true;
					nodes.push(it);
				}
				scopenode = p, p = (<FuncNode>p).parent;
			}
			nodes.push(scopenode);
			return nodes;
		} else {
			for (const it of this.symboltree) {
				if (it.kind === SymbolKind.Event) continue;
				if (it.kind === SymbolKind.Variable || it.kind === SymbolKind.Class)
					if (vars[_l = it.name.toLowerCase()]) continue; else vars[_l] = true;
				nodes.push(it);
			}
			return nodes;
		}
	}

	public initlibdirs() {
		const workfolder = resolve().toLowerCase();
		if (workfolder !== this.scriptpath && workfolder !== argv0.toLowerCase() && this.scriptpath.indexOf(workfolder) !== -1) {
			this.libdirs = [workfolder.replace(/\\lib$/, '') + '\\lib'];
		} else this.libdirs = [this.scriptpath.replace(/\\lib$/, '') + '\\lib'];
		for (const t of libdirs) if (this.libdirs[0] !== t.toLowerCase()) this.libdirs.push(t);
	}

	private addDiagnostic(message: string, offset: number, length?: number, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
		let beg = this.document.positionAt(offset), end = beg;
		if (length !== undefined) end = this.document.positionAt(offset + length);
		this.diagnostics.push({ range: Range.create(beg, end), message, severity });
	}

	private addFoldingRange(start: number, end: number, kind: string = 'block') {
		let l1 = this.document.positionAt(start).line, l2 = this.document.positionAt(end).line - (kind === 'block' ? 1 : 0);
		if (l1 < l2) this.foldingranges.push(FoldingRange.create(l1, l2, undefined, undefined, kind));
	}

	private addFoldingRangePos(start: Position, end: Position, kind: string = 'block') {
		let l1 = start.line, l2 = end.line - (kind === 'block' ? 1 : 0);
		if (l1 < l2) this.foldingranges.push(FoldingRange.create(l1, l2, undefined, undefined, kind));
	}
}