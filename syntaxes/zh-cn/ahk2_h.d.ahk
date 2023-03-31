; AutoHotkey_H https://github.com/thqby/AutoHotkey_H

/**
 * 将局部变量转换为别名以表示另一个变量, 例如在另一个线程中.
 */
Alias(VariableOrName [, VariableOrPointer]) => void

/**
 * 将值从一种数据类型转换为另一种数据类型.
 */
Cast(DataType, Value, NewDataType) => Number

/**
 * 从dll创建一个COM对象.
 */
ComObjDll(hModule, CLSID [, IID]) => ComObject

/**
 * 加密和解密数据.
 */
CryptAES(AddOrBuf [, Size], password [, EncryptOrDecrypt := true, Algorithm := 256])

/**
 * 内置函数, 类似于DllCall, 但可用于DllCall结构并使用Object语法.它通常比DllCall更快, 更易于使用, 并且节省了大量的键入和代码.
 */
DynaCall(DllFunc, ParameterDefinition, Params*) => Number | String

/**
 * 检索指向变量的低级指针.
 */
GetVar(VarName, ResolveAlias := true) => Number

MemoryCallEntryPoint(hModule [, cmdLine]) => Number

/**
 * 在先前加载了MemoryLoadLibrary的指定dll中找到资源.类似于FindResource和FindResourceEx.
 */
MemoryFindResource(hModule, Name, Type [, Language]) => Number

/**
 * 释放指定的 dll 先前加载的 MemoryLoadLibrary.类似于 FreeLibrary.
 */
MemoryFreeLibrary(hModule) => String

/**
 * 在先前加载了MemoryLoadLibrary的指定dll中找到函数指针.类似于GetProcAddress.
 */
MemoryGetProcAddress(hModule, FuncName) => Number

/**
 * 将指定的dll加载到进程中.与LoadLibrary类似, 但是从内存而不是从磁盘加载模块, 并允许多次加载模块.
 */
MemoryLoadLibrary(PathOrData, Size := 0 [, DefaultLoadLibrary, DefaultGetProcAddress, DefaultFreeLibrary]) => Number

/**
 * 将资源加载到以前通过MemoryLoadLibrary加载的指定dll中.类似于LoadResource.
 */
MemoryLoadResource(hModule, hResource) => Number

/**
 * 在之前使用 MemoryLoadLibrary 加载的指定 dll 中加载字符串资源.类似于 LoadString.
 */
MemoryLoadString(hModule, Id [, Language]) => String

/*
 * 找出之前使用 MemoryLoadLibrary 加载的指定 dll 中的资源大小.类似于 SizeOfResource.
 */
MemorySizeOfResource(hModule, hReslnfo) => Number

/**
 * 将对象转储到内存或保存到文件以供以后使用.
 */
ObjDump(obj [, compress, password]) => Buffer

/**
 * 从内存或文件加载转储的对象.
 */
ObjLoad(AddOrPath [, password]) => Array | Map | Object

/**
 * 从资源中将指定的dll加载到进程中.类似于MemoryLoadLibrary.
 */
ResourceLoadLibrary(ResName) => Number

/**
 * 交换两个变量.
 */
Swap(Var1, Var2) => void

/**
 * 内置函数可以计算结构或类型的大小, 例如TCHAR或PTR或VOID ..., 有关用法和示例, 另请参见Struct.
 */
sizeof(Definition [, offset]) => Number

/*
 * 创建未排序的 Array(适用于属性).
 */
UArray(Values*) => Array

/*
 * 创建未排序的 Map(适用于项目/属性).
 */
UMap([Key1, Value1, ...]) => Map

/*
 * 创建未排序的 Object(适用于属性).
 */
UObject([Key1, Value1, ...]) => Object

/**
 * 从zip文件中提取一项或所有项到硬盘.
 */
UnZip(BufOrAddOrFile [, Size], DestinationFolder [, FileToExtract, DestinationFileName, Password]) => void

/**
 * 从zip文件中提取一项.
 */
UnZipBuffer(AddOrBufOrFile [, Size], FileToExtract [, Password]) => Buffer

/**
 * 此功能用于解压缩和解密原始内存, 例如从资源中解压缩.
 */
UnZipRawMemory(AddOrBuf [, Size, Password]) => Buffer

/**
 * 将内存中的文件添加到使用ZipCreateBuffer或ZipCreateFile创建的zip存档中.
 */
ZipAddBuffer(ZipHandle, AddOrBuf [, Size], FileName) => Number

/**
 * 将文件添加到使用ZipCreateFile或ZipCreateBuffer创建的zip存档中.
 */
ZipAddFile(ZipHandle, FileName [, ZipFileName]) => Number

/**
 * 将空文件夹添加到使用ZipCreateFile或ZipCreateBuffer创建的zip存档中.
 */
ZipAddFolder(ZipHandle, ZipFoldName) => Number

/**
 * 关闭使用ZipCreateBuffer创建的zip存档, 将其保存到变量中.
 */
ZipCloseBuffer(ZipHandle) => Buffer

/**
 * 关闭使用ZipCreateFile创建的zip存档.
 */
ZipCloseFile(ZipHandle) => Number

/**
 * 此函数用于在内存中创建一个新的空zip文件, 使用ZipAddBuffer或ZipAddFile将文件添加到zip存档中
 */
ZipCreateBuffer(MaxSize [, Password]) => Number

/**
 * 此函数用于创建一个新的空zip文件, 使用ZipAddFile或ZipAddBuffer将文件添加到zip存档中.
 */
ZipCreateFile(FileName [, Password]) => Number

/**
 * 返回一个对象, 其中包含有关zip归档文件中所有项目的信息.
 */
ZipInfo(AddOrBufOrFile [, Size]) => Array

/**
 * 更改使用ZipCreateFile创建的zip存档的选项.
 * @param Options 支持的选项, TZIP_OPTION_GZIP = 0x80000000.
 */
ZipOptions(ZipHandle, Options) => Number

/**
 * 此功能用于压缩和解密原始内存, 例如用于资源.
 */
ZipRawMemory(AddOrBuf [, Size , Password]) => Buffer

; dll/exe export functions
; https://hotkeyit.github.io/v2/docs/commands/NewThread.htm
NewThread(Script, CmdLine := '', Title := 'AutoHotkey') => Integer
addScript(Script, WaitToExecute := 0, ThreadID := 0) => Integer
ahkAssign(VarName, Value, ThreadID := 0) => Integer
ahkExec(Script, ThreadID := 0) => Integer
ahkExecuteLine(LinePtr, Mode, Wait, ThreadID := 0) => Integer
ahkFindFunc(FuncName, ThreadID := 0) => Integer
ahkFindLabel(LabelName, ThreadID := 0) => Integer
ahkFunction(FuncName, Param1?, Param2?, Param3?, Param4?, Param5?, Param6?, Param7?, Param8?, Param9?, Param10?, ThreadID := 0) => Integer
ahkGetVar(VarName, GetVar := 0, ThreadID := 0) => Integer
ahkLabel(LabelName, NoWait := 0, ThreadID := 0) => Integer
ahkPause(ChangeTo, ThreadID := 0) => Integer
ahkPostFunction(FuncName, Param1?, Param2?, Param3?, Param4?, Param5?, Param6?, Param7?, Param8?, Param9?, Param10?, ThreadID := 0) => Integer
ahkReady(ThreadID := 0) => Integer
MinHookDisable(pHook) => Integer
MinHookEnable(Target, Detour, &Original?) => Integer

/** @extends {ahk2/Array} */
class Array {
	/**
	 * 返回满足回调函数中指定条件的数组元素.
	 * @param {(Value [, Index]) => Boolean} Predicate Filter方法为数组中的每个元素调用一次Predicate函数.
	 */
	Filter(Predicate) => Array

	/**
	 * 返回数组中Predicate为true的第一个元素的索引, 否则为0.
	 * @param {(Value [, Index]) => Boolean} Predicate FindIndex为数组的每个元素调用Predicate一次, 
	 * 直到它找到一个Predicate返回true的值. 如果找到这样的元素, FindIndex立即返回该元素索引. 否则, FindIndex返回0.
	 * @param {Integer} StartingPosition 开始搜索的数组索引. 指定1从第一个元素开始升序搜索; 指定-1从最后一个元素开始降序搜索.
	 */
	FindIndex(Predicate, StartingPosition := 1) => Integer

	/**
	 * 返回数组中值第一次出现的索引, 如果不存在, 则返回0.
	 * @param {Any} SearchElement 要在数组中定位的值.
	 * @param {Integer} StartingPosition 开始搜索的数组索引. 指定1从第一个元素开始升序搜索; 指定-1从最后一个元素开始降序搜索.
	 */
	IndexOf(SearchElement, StartingPosition := 1) => Integer

	/**
	 * 将数组中的所有元素添加到一个字符串中, 用指定的分隔符字符串分隔.
	 * @param {String} Separator 用于将数组中的一个元素与结果字符串中的下一个元素分隔开的字符串. 如果省略, 数组元素用逗号分隔.
	 */
	Join(Separator := ',') => String

	/**
	 * 对数组的每个元素调用定义的回调函数, 并返回包含结果的数组.
	 * @param {(Value [, Index]) => Any} CallbackFn Map方法为数组中的每个元素调用一次CallbackFn函数.
	 */
	Map(CallbackFn) => Array

	/**
	 * 对数组进行排序. 此方法会使数组发生变化, 并返回对同一数组的引用.
	 * @param {(a, b) => Number} CompareFn 用于确定元素顺序的函数. 如果第一个参数小于第二个参数, 则返回负值;
	 * 如果相等则返回零, 否则返回正值. 如果省略, 则元素按随机顺序排序.
	 */
	Sort(CompareFn?) => $this
}

/** @extends {ahk2/Gui} */
class Gui {
	/**
	 * 当脚本接收到指定消息时, 会自动调用指定的函数.
	 * @param {Integer} Msg 需要监听或查询的消息编号, 应该介于 0 和 4294967295(0xFFFFFFFF) 之间.
	 * @param {String|(GuiObj, wParam, lParam, Msg) => Integer} Callback 事件发生时要调用的函数, 方法或对象.
	 * 如果 GUI 有事件接收器(即, 如果指定了 Gui() 的 EventObj 参数), 那么这个参数可能是属于事件接收器的方法的名称.
	 * 否则, 这个参数必须是一个函数对象. 该函数还可以查询内置变量 A_EventInfo, 如果消息是通过 SendMessage 发送的, 则其为 0.
	 * 如果是通过 PostMessage 发送的, 则其为消息发出时的 tick-count 时间.
	 * @param {Integer} AddRemove 如果省略, 则默认为 1(在任何先前注册的回调之后调用回调). 否则, 指定下列数字之一:
	 * - 1 = 在任何先前注册的回调之后调用回调.
	 * - -1 = 在任何先前注册的回调之前调用回调.
	 * - 0 = 不调用该回调.
	 */
	OnMessage(Msg, Callback [, AddRemove]) => void

	/** @extends {ahk2/Gui.Control} */
	class Control {
		/**
		 * 当脚本接收到指定消息时, 会自动调用指定的函数.
		 * @param {Integer} Msg 需要监听或查询的消息编号, 应该介于 0 和 4294967295(0xFFFFFFFF) 之间.
		 * @param {String|(GuiCtrlObj, wParam, lParam, Msg) => Integer} Callback 事件发生时要调用的函数, 方法或对象.
		 * 如果 GUI 有事件接收器(即, 如果指定了 Gui() 的 EventObj 参数), 那么这个参数可能是属于事件接收器的方法的名称.
		 * 否则, 这个参数必须是一个函数对象. 该函数还可以查询内置变量 A_EventInfo, 如果消息是通过 SendMessage 发送的, 则其为 0.
		 * 如果是通过 PostMessage 发送的, 则其为消息发出时的 tick-count 时间.
		 * @param {Integer} AddRemove 如果省略, 则默认为 1(在任何先前注册的回调之后调用回调). 否则, 指定下列数字之一:
		 * - 1 = 在任何先前注册的回调之后调用回调.
		 * - -1 = 在任何先前注册的回调之前调用回调.
		 * - 0 = 不调用该回调.
		 */
		OnMessage(Msg, Callback [, AddRemove]) => void
	}
}

class Decimal extends Number {
	/**
	 * 设置计算精度和tostring()精度
	 * @param prec 有效数字位数, 大于零只影响除法
	 * @param outputprec tostring() 如果大于0, 则保留到小数点后n位. 如果小于0, 则保留n位有效数字
	 * @return 返回旧的prec值
	 */
	static SetPrecision(prec := 20, outputprec := 0) => Integer

	; 将整数、浮点数和数字字符串转换为Decimal对象
	; 像数字一样加、减、乘、除
	static Call(val?) => Decimal

	ToString() => String

	; 转换为ahk值, 在__int64范围之外的整数被转换为double
	; Number(decimal_obj) => Integer | Float
}

class JSON {
	static null => ComValue
	static true => ComValue
	static false => ComValue

	/**
	 * 将JSON字符串转换为AutoHotkey对象.
	 * @param KeepType 如果为true, 则将true/false/null转换为JSON.true/JSON.false/JSON.null，否则为1/0/''
	 * @param AsMap 如果为true, 转换`{}`为Map, 否则为Object
	 */
	static parse(Text, KeepType := true, AsMap := true) => Map | Array

	/**
	 * 对象包括映射、数组、对象和Com对象.
	 * @param Space 用于缩进的空格的数量或字符串.
	 */
	static stringify(Obj, Space := 0) => String
}

class Struct {
	/**
	* Struct是一个内置函数, 用于创建并返回结构对象. 该对象可用于使用对象语法访问定义的结构. SetCapacity方法可用于将内存分配给结构和指针.
	*/
	static Call(Definition [, StructMemory, InitObject]) => Struct

	/**
	 * 返回数组定义的大小; 如果结构或字段不是数组, 则返回0.
	 */
	CountOf([field]) => Number

	/**
	 * 返回字段的编码.
	 */
	Encoding([field]) => Number

	/**
	 * 返回字段或结构的地址.
	 */
	GetAddress([field]) => Number

	/*
	 * 返回先前使用. SetCapacity()或分配字符串分配的容量.
	 */
	GetCapacity([field]) => Number

	/**
	 * 返回保存在结构或字段中的已分配内存的指针.
	 */
	GetPointer([field]) => Number

	/**
	 * 如果字段或结构是指针, 则返回true.
	 */
	IsPointer([field]) => Number

	/**
	 * 返回字段的偏移量.
	 */
	Offset(field) => Number

	/**
	 * 为一个字段分配内存, 如果分配了新的内存, 则返回分配的大小.
	 */
	SetCapacity([field,] newsize) => Number

	/**
	 * 返回结构或字段的大小(以字节为单位).
	 */
	Size([field]) => Number
}

class Worker {
	/**
	 * 在当前进程中创建一个真AutoHotkey线程或关联一个已有AutoHotkey线程, 并返回一个与之交流的对象.
	 * @param ScriptOrThreadID 当ScriptOrThreadID为脚本时, 创建一个AutoHotkey线程;
	 * 当ScriptOrThreadID为已创建的线程ID时, 则与之关联;
	 * 当ScriptOrThreadID = 0时, 关联主线程.
	 */
	__New(ScriptOrThreadID, Cmd := '', Title := 'AutoHotkey') => Worker

	/**
	 * 获取/设置线程全局变量. 其他线程的对象将转换为线程Com对象安全访问, 线程退出后将无法访问.
	 * @param VarName 全局变量名.
	 */
	__Item[VarName] {
		get => Any
		set => void
	}

	/**
	 * 异步调用线程函数. 其他线程的返回值为对象时, 将转换为线程Com对象.
	 * @param VarName 全局变量名, 当前线程时可以为对象.
	 * @param Params 调用时需要的参数, 传递给其他线程时对象类型将转换为线程Com对象.
	 */
	AsyncCall(VarName, Params*) => Worker.Promise

	/**
	 * 异步方法结束线程.
	 */
	ExitApp() => void

	/**
	 * 线程准备就绪.
	 */
	Ready => Number

	/**
	 * 异步方法重启线程.
	 */
	Reload() => void

	/**
	 * 返回线程ID.
	 */
	ThreadID => Number

	/**
	 * 等待线程退出, 超时返回0, 否则为1.
	 * @param Timeout 等待的毫秒数, Timeout为0时一直等待至线程退出.
	 */
	Wait(Timeout := 0) => Number

	class Promise {
		/**
		 * 异步调用完成后执行.
		 * @param {(result)=>void} Callback
		 */
		Then(Callback) => Worker.Promise

		/**
		 * 异步调用抛出异常后执行.
		 * @param {(exception)=>void} Callback
		 */
		Catch(Callback) => Worker.Promise
	}
}