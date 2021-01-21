include("sys/File.js");
include("json2.js");
include("sys/Path.js");
include("sys/Args.js");
include("Objects/dpCmp.js");
include("hz:servis/hz.js");
include("doc/DpDoc.js");

function DpZvImporter(path)
{
	this.load = DpZvImporter_load;
	this.prepareData = DpZvImporter_prepareData;
	this.createZV = DpZvImporter_createZV;
	this.compare = DpZvImporter_compare;

	this.createTables = DpZvImporter_createTables;
	this.checkValid = DpZvImporter_checkValid;
	this.checkDirectory = DpZvImporter_checkDirectory;

	this.path = path;

	this.mol = 0;
	this.podr = 0;
	this.inspector = 0;
	this.tmpExists = getTmpTableName();
	this.isRecreate = false;
	this.tmpHZV = null;
	this.tmpRZV = null;
	this.aFiles = [];
	this.defForm = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DEF_FRM");
}

function DpZvImporter_checkDirectory()
{
	var self = this;

	if (isEmpty(self.path))
	{
		throw new Error(ru("Не указан путь к json-файлу, импорт прерван.", "Не вказаний шлях до json-файлу, імпорт перерваний."));
	}

	if (isEmpty(self.defForm))
	{
		throw new Error(ru("Не указано значение формы по-умолчанию в параметрах системы, импорт прерван.", "Не вказано значення форми за замовчуванням в параметрах системи, імпорт перерваний."));
	}

	// определимся что нам передали: файл или папку с файлами
	var isDirectory = new DpFile(self.path).isDirectory();

	// если передали папку, то запишем в массив все файлы этой папки
	if (isDirectory)
	{
		Directory.walkFiles(self.path, function(filePath)
		{
			if (Path.getExtension(filePath.getAbsolutePath()).equalsIgnoreCase(".json"))
			{
				self.aFiles.push(String(filePath.getAbsolutePath()));
			}
		}, null, null, 0);
	}
	else
	{
		self.aFiles.push(self.path);
	}
	if (self.aFiles.length == 0)
	{
		throw new Error(ru("Папка "+self.path+" пустая", "Папка "+self.path+" порожня"));
	}
	return true;
}

/**
 * Загрузка данных json-файла в таблицы this.tmpHZV (заголовки) и this.tmpRZV (строки)
 */
function DpZvImporter_load(bComapre)
{
	var args = Args([
		{bComapre: Args.BOOL | Args.Optional, _default: false},
	], arguments);

	bComapre = args.bComapre;

	var self = this;

	self.tmpHZV = getTmpTableName();
	self.tmpRZV = getTmpTableName();

	if (!self.checkDirectory())
	{
		return false;
	}

	// создадим таблицы заголовка и строк заказов, чтобы туда прочитать содержимое файлов
	self.createTables();

	forEach(self.aFiles, function(item)
	{
		var filePath = item;

		// обрабатываем только *.json файлы
		if (!Path.getExtension(filePath).equalsIgnoreCase(".json"))
		{
			return;
		}
		var fileName = Path.getFileName(filePath);

		var fileText = File.readAllText(filePath);
		var arr;

		try
		{
			arr = JSON.parse(fileText, JSON.dateTimeReviver);
		}
		catch(ex)
		{
			if (ex instanceof SyntaxError)
			{
				throw new Error(ru("Ошибка разбора файла (JSON.parse) "+filePath+".\nОбратитесь к разработчику WEB-приложения", "Помилка при розборі файла (JSON.parse) "+filePath+".\nЗверніться до розробника WEB-додатку"));
			}
		}

		var docs = arr.DOCS;
		var aHeaderEntities = [];
		forEach(docs, function(itemArr)
		{
			var m = {};
			var mOrderId = 0;
			for (var fld in itemArr)
			{
				if (!fld.equalsIgnoreCase("ROWS"))
				{
					// заголовки
					m[fld] = itemArr[fld];

					// запомним ID заголовка, чтобы его записать строкам
					if (fld.equalsIgnoreCase("ORDER_ID"))
					{
						mOrderId = m[fld];
					}

					// запомним имя файла, из которого выполняется импорт
					m["FFILE"] = fileName;
					m["JSON_FDOC_DAT"] = String(itemArr["FDOC_DAT"]);
					m["JSON_FDBKR"] = itemArr["FDBKR"];
					m["JSON_FROUTE"] = itemArr["FROUTE"];
					m["JSON_FSHOP"] = itemArr["FSHOP"];

					// валидность даты
					var jsonDat = new Date(itemArr["FDOC_DAT"]);
					var isDateValid = !isNaN(jsonDat.getTime());
					if (isDateValid)
					{
						m["FDAY"] = jsonDat.getDay();
						m["FDOC_DAT_VALID"] = true;
					}
					else
					{
						m["FDOC_DAT_VALID"] = false;
						m["FDOC_DAT"] = d00;
					}

					// валидность FDBKR
					var dbkr = itemArr["FDBKR"];
					if (isNaN(dbkr))
					{
						m["FDBKR_VALID"] = false;
						m["FDBKR"] = 0;
					}
					else
					{
						m["FDBKR_VALID"] = true;
					}

					// валидность FROUTE
					var route = itemArr["FROUTE"];
					if (isNaN(route))
					{
						m["FROUTE_VALID"] = false;
						m["FROUTE"] = 0;
					}
					else
					{
						m["FROUTE_VALID"] = true;
					}

					// валидность FSHOP
					var dbkr = itemArr["FSHOP"];
					if (isNaN(dbkr))
					{
						m["FSHOP_VALID"] = false;
						m["FSHOP"] = 0;
					}
					else
					{
						m["FSHOP_VALID"] = true;
					}
				}
				else
				{
					// строки
					var oRows = itemArr[fld]
					var aRowEntities = [];
					for (var oRow_row in oRows)
					{
						var oRow = oRows[oRow_row];

						var r = {};
						for (var fldRow in oRow)
						{
							r[fldRow] = oRow[fldRow];

							// ID заголовка
							r["ORDER_ID"] = mOrderId;
							r["JSON_FKOL"] = oRow["FKOL"];

							// валидность FKOL
							var mFkol = oRow["FKOL"];
							if (isNaN(mFkol))
							{
								r["FKOL_VALID"] = false;
								r["FKOL"] = 0;
							}
							else
							{
								r["FKOL_VALID"] = true;
							}
						}
						aRowEntities.push(r);
					}
					insertIntoTable(self.tmpRZV, aRowEntities);
				}
			}
			aHeaderEntities.push(m);
		}, null, new ModalProgressProvider(function(item, rateProvider)
		{
			return ru("Загрузка заказов из json-файла...", "Завантаження замовлень з json-файлу...");
		}));
		insertIntoTable(self.tmpHZV, aHeaderEntities);
	}, null, new ModalProgressProvider());
	self.prepareData(bComapre);
	return self.aFiles;
}

/**
 * создание таблиц заголовка и строк заказов, чтобы туда прочитать содержимое JSON файлов
 */
function DpZvImporter_createTables()
{
	// таблица заголовков
	var fld = {};
	fld.FDOC_DAT = "DATE";
	fld.FDAY = "LONG";
	fld.FDBKR = "LONG";
	fld.FSHOP = "LONG";
	fld.ORDER_ID = "LONG";
	fld.FFILE = "TEXT";
	fld.FNOP = "LONG";

	fld.FDRIVER = "LONG";
	fld.FPODR = "LONG";
	fld.FEXPED = "LONG";
	fld.FMOL = "LONG";
	fld.FAVTO = "LONG";
	fld.FTIME = "DATETIME";
	fld.FROUTE = "LONG";
	fld.FLYST = "TEXT";
	fld.FINSPECTOR = "LONG";

	fld.FDOC_DAT_VALID = "BIT";
	fld.FDBKR_VALID = "BIT";
	fld.FROUTE_VALID = "BIT";
	fld.FSHOP_VALID = "BIT";

	fld.JSON_FDOC_DAT = "TEXT";
	fld.JSON_FDBKR = "TEXT";
	fld.JSON_FROUTE = "TEXT";
	fld.JSON_FSHOP = "TEXT";
	fld.FWID = "LONG";

	var ind = {};
	ind.FWID = "FWID";
	ind.FSHOP = "FSHOP";
	ind.FDOC_DAT = "FDOC_DAT";

	var def = {};
	def.FDOC_DAT_VALID = true;
	def.FDBKR_VALID = true;
	def.FROUTE_VALID = true;
	def.FSHOP_VALID = true;
	CreateTable(this.tmpHZV, fld, ind, def);

	// таблица строк
	var fld = {};
	fld.FNMKL = "TEXT";
	fld.FNMKL_ID = "LONG";
	fld.FKOL = "DOUBLE";
	fld.FKOL_VALID = "BIT";
	fld.JSON_FKOL = "TEXT";
	fld.ORDER_ID = "LONG";
	fld.FID_DOC = "LONG";
	fld.FWID = "LONG";

	var ind = {};
	ind.FNMKL = "FNMKL";
	ind.ORDER_ID = "ORDER_ID";
	ind.FID_DOC = "FID_DOC";

	var def = {};
	def.FKOL_VALID = true;
	CreateTable(this.tmpRZV, fld, ind, def);

	return true;
}

function DpZvImporter_prepareData(bComapre)
{
	var args = Args([
		{bComapre: Args.BOOL | Args.Optional, _default: false},
	], arguments);

	bComapre = args.bComapre;

	var self = this;

	// проверим валидность полей
	self.checkValid(true, true);

	if (!self.checkDirectory())
	{
		return false;
	}

	// установим ID номенклатуры
	strSQL = "UPDATE "+self.tmpRZV
			+" SET FNMKL_ID = ("
				+" SELECT FWID FROM ^CL_NMK"
				+" WHERE FCOD = "+self.tmpRZV+".FNMKL"
			+")"
			+" WHERE EXISTS ("
				+" SELECT 1 FROM ^CL_NMK"
				+" WHERE FCOD = "+self.tmpRZV+".FNMKL"
			+")"
	ExecuteSQL(strSQL);

	// fwid'ы заголовка и строк
	resetTableUids(self.tmpHZV, "FWID");
	resetTableUids(self.tmpRZV, "FWID");

	strSQL = "UPDATE "+self.tmpRZV
			+" SET FID_DOC = ("
				+" SELECT FWID FROM "+self.tmpHZV
				+" WHERE ORDER_ID = "+self.tmpRZV+".ORDER_ID"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FWID FROM "+self.tmpHZV
				+" WHERE ORDER_ID = "+self.tmpRZV+".ORDER_ID"
			+")"
	ExecuteSQL(strSQL);

	var tmpOrdersExists = getTmpTableName();
	strSQL = "SELECT DISTINCT H.FDOC_NUM, H.FDOC_DAT, H.FNOP, TMP.FWID"
			+" INTO "+tmpOrdersExists
			+" FROM ^HZV H INNER JOIN "+self.tmpHZV+" TMP ON H.FOUTID = " + Convert("TMP.ORDER_ID", "NVC")
	ExecuteSQL(strSQL);

	var tbl = OpenTable("SELECT * FROM "+tmpOrdersExists+" ORDER BY FNOP, FDOC_DAT, FDOC_NUM");
	if (!bComapre && !tbl.IsEmpty())
	{
		var strMsgRu = "Внимание!"
			+"\nВ базе и в файле, который импортируется, есть"
			+" заказы с одинаковыми идентификаторами. При переносе они будут пропущены."
			+" Для дополнительного анализа воспользуйтесь функцией"
			+" сравнения базы и json-файла."
			+" Список одинаковых заказов:"

		var strMsgUr = "Увага!"
			+"\nВ базі та в файлі, який імпортується, існують"
			+" замовлення з однаковими ідентифікаторами. При переносі вони будуть пропущені."
			+" Для додаткового аналізу скористайтесь функцією"
			+" порівняння бази та json-файлу."
			+" Список однакових замовлень:"

		par = {};
		par.onDrawGrid = function(oGrid)
		{
			with (oGrid.page())
			{
				cell("FNOP", "Папка|Папка", 10);
				cell("FDOC_DAT", "Дата документа", 10);
				cell("FDOC_NUM", "№ документа", 15);
			}
		};
		par.icon = ICON_INFORMATION;
		par.message = ru(strMsgRu, strMsgUr);
		par.caption = ru("Заказы, которые уже существуют в программе", "Замовлення, які вже існують в програмі");
		par.filing = "fnop";
		if (!tbl.IsEmpty())
		{
			browse(tbl, par, SW_MODAL);
		}

		if (!confirm(ru("Продолжить создание заказов?", "Продовжити створення замовлень?")))
		{
			throw new Error(ru("Отменено пользователем", "Відмінено користувачем"));
		}
	}

	if (!bComapre)
	{
		// не импортируем то, что уже есть в базе
		strSQL = "DELETE FROM " + self.tmpHZV
				+" WHERE FWID IN ("
					+" SELECT FWID FROM " + tmpOrdersExists
				+")"
		ExecuteSQL(strSQL);

		strSQL = "DELETE FROM "+self.tmpRZV
				+" WHERE FID_DOC IN ("
					+" SELECT FWID FROM " + tmpOrdersExists
				+")"
		ExecuteSQL(strSQL);
	}
	DropTable(tmpOrdersExists);

	// проанализируем, есть ли в базе заказы, которые есть в json-файле
	strSQL = "SELECT DISTINCT H.FWID AS FZVWID, H.FID_NAKL as FID_NAKL, "
				+ "H.FDOC_NUM, H.FDOC_DAT, H.FNOP, TMP.FWID, H.FSHOP, TMP.FROUTE, "
				+ "H.FDBKR, SCH.FDOC_NUM as FNUM_NAKL, SCH.FDOC_DAT as FDOC_DAT_NAKL,"
				+ "H.FDOC, H.FDOC_NAKL, H.FNOP_NAKL"
			+" INTO "+self.tmpExists
			+" FROM ^HZV H INNER JOIN "+self.tmpHZV+" TMP ON H.FSHOP = TMP.FSHOP "
				+ " AND H.FDBKR = TMP.FDBKR AND H.FDOC_DAT=TMP.FDOC_DAT"
				+ " INNER JOIN ^RZV R on R.FID_DOC= H.FWID AND R.FROUTE = TMP.FROUTE "
				+ " LEFT JOIN ^SCH_ZAG SCH on SCH.FDOC = H.FDOC_NAKL AND SCH.FNOP = H.FNOP_NAKL AND SCH.FWID = H.FID_NAKL"
	ExecuteSQL(strSQL);

	if (!bComapre)
	{
		var strMsgRu = "Внимание!"
			+"\nВ базе и в файле, который импортируется, уже есть"
			+" одинаковые заказы."
			+"\nСписок одинаковых заказов:"

		var strMsgUr = "Увага!"
			+"\nВ базі та в файлі, який імпортується, вже існують"
			+" однакові замовлення."
			+"\nСписок однакових замовлень:"

		strSQL = "select * from " + self.tmpExists;

		var msg = "";
		var i=1;

		forEachSQL(strSQL, function(it)
		{
			msg += i + " | Папка: " + it.FNOP;
			msg += " | № документа: " + it.FDOC_NUM;
			msg += " | Дата документа: " + format("dd.mm.yyyy",it.FDOC_DAT);
			msg += " | Магазин: " + it.FSHOP;
			msg += " | Покуппець: " + it.FDBKR;
			msg += " | Маршрут: " + it.FROUTE;

			if (!isEmpty(it.FNUM_NAKL))
			{
				msg += " | Накладна: №" + it.FNUM_NAKL
				msg += " | Дата документа: " + format("dd.mm.yyyy", it.FDOC_DAT_NAKL)
			}

			msg += "\n"
			i++;
		});

		if (!isEmpty(msg))
		{
			var oMsg = new DpMsgBox();
			oMsg.set("!kzs", strMsgUr + "\n\n" + msg, ru("Заказы, которые уже существуют в программе", "Замовлення, які вже існують в програмі"));
			var answer = oMsg.ask();

			switch(answer)
			{
				case "k":
					// не импортируем то, что уже есть в базе
					strSQL = "DELETE FROM "+self.tmpHZV
							+" WHERE FWID IN ("
								+" SELECT FWID FROM "+self.tmpExists
							+")"
					ExecuteSQL(strSQL);

					strSQL = "DELETE FROM "+self.tmpRZV
							+" WHERE FID_DOC IN ("
								+" SELECT FWID FROM "+self.tmpExists
							+")"
					ExecuteSQL(strSQL);

					break;
				case "z":
					this.isRecreate = true;
					break;
				case "c":
				default:
					throw new Error(ru("Отменено пользователем", "Відмінено користувачем"));
			}
		}
	}

	// Контрагент -> по семи расширениям спр.12 определяем форму (справочник 42), к которой будет оноситься заказ ->
	// по расширению справочника 42 опрелеяем номер папки документов ZV и NK, куда будет сохранен заказ
	// далее проверяем чтобы везде было соответствие формы папке документов для контрагентов из json-файла
	// но есть еще параметр системы, "форма по-умолчанию", если у контрагента в расширении ничего не указано,
	// для нее тоже надо узнать папку.
	// Если хоть чего-то нет, то прерываем импорт
	var sprVD = 42;
	var tblExtName42 = new DpExtensionManager("CL", sprVD).getFullValueTableName();
	var tblExtName12 = new DpExtensionManager("CL", sprOrg).getFullValueTableName();

	var tmpNop = getTmpTableName();
	var fld = {};
	fld.FFORM = "LONG";
	fld.FDAY = "LONG";
	fld.FNOP = "LONG";
	fld.FDBKR = "LONG";
	fld.FROUTE = "LONG";
	fld.FWID = "COUNTER";

	var ind = {};
	ind.FFORM = "FFORM";
	ind.FDAY = "FDAY";
	ind.FDBKR = "FDBKR";
	ind.FROUTE = "FROUTE";
	CreateTable(tmpNop, fld, ind);

	// чтобы сократить код, буду использовать циклы
	var aDbkrFlds = ["FDBKR", "FSHOP"];

	// сгенерируем таблицу с днями недели из файла-заявок и кодами контрагентов
	var tmpTuneAll = getTmpTableName();
	var tmpTune = getTmpTableName();
	var fld = {};
	fld.FDBKR = "LONG";
	fld.FROUTE = "LONG";
	fld.FDOC_DAT = "DATE";
	fld.FDAY = "LONG";
	fld.FFORM = "LONG";
	fld.FNOP = "LONG";
	fld.FWID = "COUNTER";

	var ind = {};
	ind.FDBKR = "FDBKR";
	ind.FROUTE = "FROUTE";
	ind.FDAY = "FDAY";
	ind.FDOC_DAT = "FDOC_DAT";
	CreateTable(tmpTuneAll, fld);
	CreateTable(tmpTune, fld, ind);

	for (var dbkr in aDbkrFlds)
	{
		strSQL = "INSERT INTO "+tmpTuneAll+" (FDBKR, FROUTE, FDOC_DAT)"
				+" SELECT DISTINCT "+aDbkrFlds[dbkr]+" AS FDBKR, FROUTE, FDOC_DAT "
				+" FROM "+self.tmpHZV
		ExecuteSQL(strSQL);
	}

	// уникальные
	strSQL = "INSERT INTO "+tmpTune+" (FDBKR, FROUTE, FDOC_DAT)"
			+" SELECT DISTINCT FDBKR, FROUTE, FDOC_DAT "
			+" FROM "+tmpTuneAll
	ExecuteSQL(strSQL);

	DropTable(tmpTuneAll);

	// проставим день недели для даты документа из файла
	strSQL = "SELECT DISTINCT FDOC_DAT FROM "+tmpTune
	forEachSQL(strSQL, function(item)
	{
		var dat = new Date(item.FDOC_DAT);
		var weekDay = dat.getDay();
		strSQL = "UPDATE "+tmpTune
				+" SET FDAY = "+sqlTo(weekDay)
				+" WHERE FDOC_DAT = "+sqlTo(dat)
		ExecuteSQL(strSQL);
	});

	// теперь настройка расширений, вытянем за каждый день форму
	strSQL = "SELECT DISTINCT FDBKR, FROUTE FROM " + tmpTune
	forEachSQL(strSQL, function(item)
	{
		for (var i = 0; i <= 6; i++)
		{
			var m = {};
			m.FDBKR = item.FDBKR;
			m.FROUTE = item.FROUTE;
			m.FDAY = i;
			UpdateTable(tmpNop, m, true);

			strSQL = "UPDATE "+tmpNop
					+" SET FFORM = ("
						+" SELECT L42.FCOD"
						+" FROM ^LISTCL L12 "
							+" INNER JOIN "+tblExtName12+" EXT12 ON L12.FWID_CL = EXT12.FMAINWID"
								+" AND "+tmpNop+".FDBKR = L12.FCOD AND L12.FCL = "+sqlTo(sprOrg)
							+" INNER JOIN ^LISTCL L42 ON L42.FCOD = EXT12.FFORM_"+String(i)+" AND L42.FCL = "+sqlTo(sprVD)
						+" WHERE "+tmpNop+".FDAY = "+sqlTo(i)
					+")"
					+" WHERE EXISTS ("
						+" SELECT L42.FCOD"
						+" FROM ^LISTCL L12 "
							+" INNER JOIN "+tblExtName12+" EXT12 ON L12.FWID_CL = EXT12.FMAINWID"
								+" AND "+tmpNop+".FDBKR = L12.FCOD AND L12.FCL = "+sqlTo(sprOrg)
							+" INNER JOIN ^LISTCL L42 ON L42.FCOD = EXT12.FFORM_"+String(i)+" AND L42.FCL = "+sqlTo(sprVD)
						+" WHERE "+tmpNop+".FDAY = "+sqlTo(i)
					+")"
			ExecuteSQL(strSQL);
		}
	});

	var tmpEmpty = getTmpTableName();

	// у кого вообще ничего не проставлено - возьмем форму из параметров системы
	strSQL = "SELECT FDBKR, FROUTE, FFORM, COUNT(FFORM) AS FCNT"
			+" INTO "+tmpEmpty
			+" FROM "+tmpNop
			+" GROUP BY FDBKR, FROUTE, FFORM"
			+" HAVING COUNT(FFORM) = 7"
			+" ORDER BY FDBKR, FCNT"
	ExecuteSQL(strSQL);

	strSQL = "UPDATE "+tmpNop
			+" SET FFORM = "+sqlTo(self.defForm)
			+" WHERE EXISTS (SELECT FDBKR, FROUTE, FFORM FROM "+tmpEmpty
				+" WHERE FDBKR = "+tmpNop+".FDBKR"
					+" AND FROUTE = "+tmpNop+".FROUTE"
					+" AND FFORM = "+tmpNop+".FFORM"
					+" AND "+tmpNop+".FFORM = 0"
			+")"
	ExecuteSQL(strSQL);

	// у кого только одна форма в любом дне - возьмем эту форму для всех дней
	DropTable(tmpEmpty);
	strSQL = "SELECT FDBKR, FROUTE, FFORM, COUNT(FFORM) AS FCNT"
			+" INTO "+tmpEmpty
			+" FROM "+tmpNop
			+" GROUP BY FDBKR, FROUTE, FFORM"
			+" HAVING COUNT(FFORM) = 6 or COUNT(FFORM) = 1"
			+" ORDER BY FDBKR, FCNT"
	ExecuteSQL(strSQL);

	strSQL = "UPDATE "+tmpNop
			+" SET FFORM = ("
				+" SELECT FFORM FROM "+tmpEmpty
				+" WHERE FDBKR = "+tmpNop+".FDBKR"
					+" AND  FROUTE = "+tmpNop+".FROUTE"
					+" AND FFORM <> 0 "
					+" AND "+tmpNop+".FFORM = 0 "
			+")"
			+" WHERE EXISTS("
				+" SELECT FFORM FROM "+tmpEmpty
				+" WHERE FDBKR = "+tmpNop+".FDBKR"
					+" AND  FROUTE = "+tmpNop+".FROUTE"
					+" AND FFORM <> 0 "
					+" AND "+tmpNop+".FFORM = 0 "
			+")"
	ExecuteSQL(strSQL);

	DropTable(tmpEmpty);

	// где не проставлено - берем из параметров системы значение по-умолчанию
	strSQL = "UPDATE "+tmpNop
			+" SET FFORM = "+sqlTo(self.defForm)
			+" WHERE FFORM = 0"
	ExecuteSQL(strSQL);

	strSQL = "UPDATE "+tmpNop
			+" SET FNOP = ("
				+" SELECT EXT.FNOP "
				+" FROM "+tblExtName42+" EXT"
				+" INNER JOIN ^LISTCL L42 ON L42.FWID_CL = EXT.FMAINWID AND L42.FCL = "+sqlTo(sprVD)
				+" WHERE "+tmpNop+".FFORM = L42.FCOD"
			+")"
			+" WHERE EXISTS ("
				+" SELECT EXT.FNOP "
				+" FROM "+tblExtName42+" EXT"
				+" INNER JOIN ^LISTCL L42 ON L42.FWID_CL = EXT.FMAINWID AND L42.FCL = "+sqlTo(sprVD)
				+" WHERE "+tmpNop+".FFORM = L42.FCOD"
			+")"
	ExecuteSQL(strSQL);

	// если в справочнике 42 не проставлена папка документов для формы, значит надо об этом сообщить
	strSQL = "SELECT DISTINCT T.FFORM, L42.FTXT AS FFORM_TXT FROM "+tmpNop+" T"
				+" INNER JOIN ^LISTCL L42 ON L42.FCL = "+sqlTo(sprVD)
					+" AND L42.FCOD = T.FFORM"
			+" WHERE T.FNOP = 0"
			+" ORDER BY T.FFORM"
	var aForms = [];
	forEachSQL(strSQL, function(item)
	{
		aForms.push(item.FFORM+" ("+item.FFORM_TXT+")")
	});

	if (aForms.length != 0)
	{
		var strRu = "Внимание!"
				+" В расширении справочника аналитики № "+sprVD
				+" у некоторых элементов не проставлено соответствие"
				+" формы папке документов. Импорт прерван."
				+" Список форм, у которых необходимо проставить соответствия:"
				+"\n"+aForms.join(",")

		var strUr = "Увага!"
				+"\nВ розширенні довідника аналітики № "+sprVD
				+" у деяких елементів не проставлена відповідність"
				+" форми папці документів. Імпорт перерваний."
				+" Список форм, у яких необхідно проставити відповідності:"
				+"\n"+aForms.join(",")

		throw new Error(ru(strRu, strUr));
	}

	// проставляем папку документов в tmpTune, а потом уже в импортированной таблице с заказами
	strSQL = "UPDATE "+tmpTune
			+" SET FFORM = ("
				+" SELECT FFORM FROM "+tmpNop
				+" WHERE FDBKR = "+tmpTune+".FDBKR"
					+" AND FROUTE = "+tmpTune+".FROUTE"
					+" AND FDAY = "+tmpTune+".FDAY"
			+")"
			+", FNOP = ("
				+" SELECT FNOP FROM "+tmpNop
				+" WHERE FDBKR = "+tmpTune+".FDBKR"
					+" AND FROUTE = "+tmpTune+".FROUTE"
					+" AND FDAY = "+tmpTune+".FDAY"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FFORM FROM "+tmpNop
				+" WHERE FDBKR = "+tmpTune+".FDBKR"
					+" AND FROUTE = "+tmpTune+".FROUTE"
					+" AND FDAY = "+tmpTune+".FDAY"
			+")"
	ExecuteSQL(strSQL);

	strSQL = "UPDATE "+self.tmpHZV
			+" SET FNOP = ("
				+" SELECT FNOP FROM "+tmpTune
				+" WHERE FDBKR = "+self.tmpHZV+".FDBKR"
					+" AND FROUTE = "+self.tmpHZV+".FROUTE"
					+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FNOP FROM "+tmpTune
				+" WHERE FDBKR = "+self.tmpHZV+".FDBKR"
					+" AND FROUTE = "+self.tmpHZV+".FROUTE"
					+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
			+")"
	ExecuteSQL(strSQL);

	strSQL = "UPDATE "+self.tmpHZV
			+" SET FNOP = ("
				+" SELECT FNOP FROM "+tmpTune
				+" WHERE FDBKR = "+self.tmpHZV+".FSHOP"
					+" AND FROUTE = "+self.tmpHZV+".FROUTE"
					+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FNOP FROM "+tmpTune
				+" WHERE FDBKR = "+self.tmpHZV+".FSHOP"
					+" AND FROUTE = "+self.tmpHZV+".FROUTE"
					+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
			+")"
	ExecuteSQL(strSQL);

	// по результатам разговора с Сергеем:
	// если в файле есть "одинаковые" заявки, берем последнюю.
	// "Одинаковость" заключается в том, что у заявок одинаковые значения fdbkr, fshop.
	var tmpDist = getTmpTableName();
	strSQL = "select s.fdbkr, s.fshop, max(s.order_id) as order_id"
			+", count(s.order_id) as fcnt"
			+" into "+tmpDist
			+" from "+self.tmpHZV+" s"
			+" group by s.fdbkr, s.fshop"
	ExecuteSQL(strSQL);

	strSQL = "delete from "+self.tmpHZV
			+" where 1=1"
				+" and order_id not in ("
					+" select order_id from "+tmpDist
				+")"
	ExecuteSQL(strSQL);

	strSQL = "delete from "+self.tmpRZV
			+" where 1=1"
				+" and order_id not in ("
					+" select order_id from "+tmpDist
				+")"
	ExecuteSQL(strSQL);
	DropTable(tmpDist);

	var oRet = {};
	oRet.tblH = self.tmpHZV;
	oRet.tblR = self.tmpRZV;
	return oRet;
}

/**
 * Создание документа ZV - заказ
 */
function DpZvImporter_createZV(isSilent)
{
	var args = Args([
		{isSilent: Args.BOOL | Args.Optional, _default: false},
	], arguments);

	isSilent = args.isSilent;

	var self = this;

	// проверим валидность полей
	self.checkValid(true);

	if (!self.checkDirectory())
	{
		return false;
	}

	include("Objects/DpAskEx.js");
	var oA = new DpAskEx();
	oA.add("SMARTCL", "Підрозділ|Подразделение", "PODR", getPar("HZ_COD_PODR"), sprPodr);
	oA.add("SMARTCL", "МВО|МОЛ", "MOL", getPar("HZ_COD_MOL"), getPar("CODMOL", "MTR"));
	oA.add("SMARTCL", "Контролер|Контролер", "INSPECTOR", 0, getPar("CODPERS"));
	oA.doAsk();

	if (oA.escape)
	{
		return false;
	}

	self.podr = oA.get("PODR").getCod();
	self.mol = oA.get("MOL").getCod();
	self.inspector = oA.get("INSPECTOR").getCod();

	// создание самой заявки
	var mFdoc = "hz:ZV";
	var mol = self.mol;
	var podr = self.podr;
	var inspector = self.inspector;

	var docNum = "";
	var aKolDocs = [];
	aKolDocs[0] = 0;

	if (self.isRecreate)
	{
		runInTransaction(function()
		{
			strSQL = " select * from " + self.tmpExists
			forEachSQL(strSQL, function(it)
			{
				var oDoc = new DpDoc(it.FDOC, it.FNOP);
				oDoc.del(it.FZVWID);
			});

			strSQL = " select * from " + self.tmpExists + " where fid_nakl is not null or fid_nakl <> 0"
			forEachSQL(strSQL, function(it)
			{
				var oDoc = new DpDoc(it.FDOC_NAKL, it.FNOP_NAKL);
				oDoc.del(it.FID_NAKL);
			});
		});
	}

	strSQL = "select distinct fnop from "+self.tmpHZV
	forEachSQL(strSQL, function(item)
	{
		aKolDocs[item.FNOP] = 0;
	});

	var naklIds = [];

	strSQL = "SELECT * FROM " + self.tmpHZV
	forEachSQL(strSQL, function(hItem)
	{
		var mainFwid = hItem.FWID;
		var mFnop = hItem.FNOP;
		var oDoc = new DpDoc(mFdoc, mFnop);
		var sMode = "ADD";
		docNum = oDoc.getAutoNo().get();
		var dbkr = hItem.FDBKR;
		var shop = hItem.FSHOP;
		var route = hItem.FROUTE;
		var order_id = hItem.ORDER_ID;

		var codAvto = hItem.FAVTO;
		var codDriver = hItem.FDRIVER;
		var mFlyst = hItem.FLYST;
		var mFtime = hItem.FTIME;

		var numStr = 0;
		var kol = 0;


		strSQL = "select * from "+self.tmpRZV
				+" where order_id = "+sqlTo(order_id)
		forEachSQL(strSQL, function(rItem)
		{
			var oRow = oDoc.createRow("ROW");
			if (!isEmpty(oRow))
			{
				var kolRow = rItem.FKOL;
				numStr++;
				oRow.setVar("RID", rItem.FWID);
				oRow.setVar("RDBKR", dbkr);
				oRow.setVar("RNOM", numStr);
				oRow.setVar("RKOL", kolRow);
				oRow.setVar("RNMKL", rItem.FNMKL_ID);
				oRow.setVar("RROUTE", route);
				oRow.setVar("RSHOP", shop);
				oRow.setVar("par.HDOC", mFdoc);
				oRow.setVar("par.ID", mainFwid);
				oRow.setVar("RTIME", mFtime);
				kol += kolRow;
			}

			oDoc.appendRow("ROW", oRow);
		});

		// заголовок
		oDoc.setVar("HDRIVER", codDriver);
		oDoc.setVar("HPODR", podr);
		oDoc.setVar("HKOL", Number(kol));
		oDoc.setVar("HMOL", mol);
		oDoc.setVar("HINSPECTOR", inspector);
		oDoc.setVar("HTIME", mFtime);

		oDoc.setVar("HNOM", docNum);
		oDoc.setVar("HLYST", mFlyst);

		oDoc.setVar("HDAT", hItem.FDOC_DAT);
		oDoc.setVar("HAVTO", codAvto);
		oDoc.setVar("HDBKR", dbkr);
		oDoc.setVar("HSHOP", shop);
		oDoc.setVar("HOUTID", order_id);
		oDoc.setDocID(mainFwid);

		// запишем контролера в расширения
		oDoc.setExt("FILENAME", hItem.FFILE);
		oDoc.saveExtToDB();
		oDoc.save(true, sMode);
		oDoc.saveExtToDB();
		aKolDocs[mFnop]++;
		aKolDocs[0]++;

		// нужно чтобы записались часы и минуты, так как oDoc.setVar их отрезает
		strSQL = "UPDATE ^HZV SET FTIME = "+sqlDateTo(mFtime)+" WHERE FWID = "+sqlTo(mainFwid)
		ExecuteSQL(strSQL);

		if (self.isRecreate)
		{
			var strSQLexists = "select * from " + self.tmpExists + " where fwid = " + sqlTo(mainFwid);
			var snE = snapRecord(strSQLexists);

			if (snE)
			{
				if (snE.FID_NAKL)
				{
					naklIds.push(mainFwid);
				}
			}
		}
	}, null, new ModalProgressProvider(function(item, rateProvider)
	{
		return ru("Создание документа заказа № "+docNum, "Створення документу замовлення № "+docNum);
	}));

	if (self.isRecreate)
	{
		if(naklIds.length)
		{
			include("hz:servis/hz.js");
			mkDocNakl("", naklIds);
		}
	}

	if (!isSilent)
	{
		var strMsg = "";
		var aMsg = [];
		for (var i in aKolDocs)
		{
			if (i == 0)
			{
				continue;
			}
			aMsg.push(ru("Папка "+mFdoc+":"+String(i)+", созданных документов - "+aKolDocs[i],
				"Папка "+mFdoc+":"+String(i)+", створених документів - "+aKolDocs[i]))
		}
		aMsg.push(ru("Всего созданных документов "+aKolDocs[0], "Всього створених документів "+aKolDocs[0]));
		alert(aMsg.join("\n"));
	}

	if (self.isRecreate)
	{
		self.isRecreate = false;
	}

	DropTable(self.tmpExists);

	return true;
}

/**
 * Проверка корректности значений полей json-файла
 */
function DpZvImporter_checkValid(isSilent, check)
{
	var args = Args([
		{isSilent: Args.BOOL | Args.Optional, _default: false},
	], arguments);

	isSilent = args.isSilent;

	var self = this;

	if (!self.checkDirectory())
	{
		return false;
	}

	var aHFields = ["FDOC_DAT", "FDBKR", "FROUTE", "FSHOP"];
	var aRFields = ["FKOL"];

	var tmpCheck = getTmpTableName();
	var fld = {};
	fld.ORDER_ID = "LONG";
	fld.FFILE = "TEXT";
	fld.DESCR = "TEXT";
	fld.FVALUE = "TEXT";
	fld.FWID = "COUNTER";
	CreateTable(tmpCheck, fld);

	var isErr = false;
	for (var i in aHFields)
	{
		var fld = aHFields[i];
		var strSQL = "SELECT ORDER_ID, FFILE"
						+", JSON_"+fld+" AS FVALUE"
					+" FROM "+self.tmpHZV
					+" WHERE "+fld+"_VALID = "+sqlFalse
		forEachSQL(strSQL, function(item)
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			m.FFILE = item.FFILE;
			m.DESCR = ru("заголовок заказа - некорректное значение поля "+fld, "заголовок замовлення - некоректне значення поля "+fld);
			m.FVALUE = item.FVALUE;
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		});
	}

	strSQL = "select * from " + self.tmpHZV
	var skipOrderIds = [];

	forEachSQL(strSQL, function(it) {

		strSQL = "select * from ^clrelclcl where fcl=" + getPar("CODPLAT")
			+ " and fcod =" + sqlTo(it.FDBKR);
		sn = snapRecord(strSQL);

		if (!sn)
		{
			var m = {};
			m.ORDER_ID = it.ORDER_ID;
			m.FFILE = it.FFILE;
			m.FVALUE = it.FDBKR;
			m.DESCR = ru("строка заказа - не найдено контрагента с кодом "  + it.FDBKR, "рядок замовлення - не знайдено контрагента з кодом " + it.FDBKR);
			UpdateTable(tmpCheck, m, true);
			isErr = true;
			skipOrderIds.push(it.ORDER_ID);
		}

		strSQL = "select * from ^clrelclcl where fcl=" + getPar("CODPLAT")
			+ " and fcod =" + sqlTo(it.FSHOP);
		sn = snapRecord(strSQL);

		if (!sn)
		{
			var m = {};
			m.ORDER_ID = it.ORDER_ID;
			m.FFILE = it.FFILE;
			m.FVALUE = it.FSHOP;
			m.DESCR = ru("строка заказа - не найдено магазин с кодом " + it.FSHOP, "рядок замовлення - не знайдено магазин з кодом " + it.FSHOP);
			UpdateTable(tmpCheck, m, true);
			isErr = true;
			skipOrderIds.push(it.ORDER_ID);
		}

		strSQLR = "select r.*, h.ffile from " + self.tmpRZV+" r"
				+" inner join "+self.tmpHZV+" h on r.order_id = h.order_id"
			+ " where r.order_id = " + sqlTo(it.ORDER_ID)

		forEachSQL(strSQLR, function(item) {
			strSQL = "select * from ^cl_nmk where fcod = " + sqlTo(item.FNMKL);
			sn = snapRecord(strSQL);

			if (!sn)
			{
				var m = {};
				m.ORDER_ID = item.ORDER_ID;
				m.FFILE = item.FFILE;
				m.FVALUE = item.FNMKL;
				m.DESCR = ru("строка заказа - не найдено номенклатуру с кодом " + item.FNMKL, "рядок замовлення - не знайдено номенклатуру з кодом " + item.FNMKL);
				UpdateTable(tmpCheck, m, true);
				isErr = true;
				skipOrderIds.push(item.ORDER_ID);
			}
		})
	})

	if (isErr)
	{
		par = {};
		par.onDrawGrid = function(oGrid)
		{
			with (oGrid.page())
			{
				cell("ORDER_ID", "ID замовлення|ID заказа", 12);
				cell("FFILE", "Ім'я файлу|Имя файла", 15, "w");
				cell("DESCR", "Опис помилки|Описание ошибки", 50, "w");
				cell("FVALUE", "Значення поля в json-файлі|Значение поля в json-файле", 30, "w");
			}
		};

		par.icon = ICON_ERROR;
		par.message = ru("json файл содержит ошибки, эти заказы будут пропущены. Обратитесь к разработчику WEB-приложения", "json файл містить помилки, ці замовлення будуть пропущені. Зверніться до розробника WEB-додатку");
		par.caption = ru("Протокол ошибок json-файла", "Протокол помилок json-файлу");

		browse(OpenTable(tmpCheck), par, SW_MODAL);

		ExecuteSQL("delete from " + self.tmpHZV + " where order_id in (" + skipOrderIds.join(",")+")");
		ExecuteSQL("delete from " + self.tmpRZV + " where order_id in (" + skipOrderIds.join(",")+")");
		ExecuteSQL("delete from " + tmpCheck + " where order_id in (" + skipOrderIds.join(",")+")");

		isErr = false;
	}

	for (var i in aRFields)
	{
		var fld = aRFields[i];
		var strSQL = "SELECT R.ORDER_ID, R.FNMKL, H.FFILE"
						+", R.JSON_"+fld+" AS FVALUE"
					+" FROM "+self.tmpRZV+" R"
					+" INNER JOIN "+self.tmpHZV+" H ON R.ORDER_ID = H.ORDER_ID"
					+" WHERE R."+fld+"_VALID = "+sqlFalse
		forEachSQL(strSQL, function(item)
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			m.FFILE = item.FFILE;
			m.FVALUE = item.FVALUE;
			m.DESCR = ru("строка заказа - файл некорректное значение поля "+fld+" для номенклатуры "+item.FNMKL, "рядок замовлення - некоректне значення поля "+fld+" для номенклатури "+item.FNMKL);
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		});
	}

	var strSQL = "select distinct ffile, fdoc_dat from "+self.tmpHZV
	var td = new Date();
	td = new Date(td.getFullYear(), td.getMonth(), td.getDate());
	forEachSQL(strSQL, function(item)
	{
		var zvDat = item.FDOC_DAT;
		if (day_difference(td, zvDat) < 1 && !getPar("HZ_ALLOW_PAST_DATE4ZV"))
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			m.FFILE = item.FFILE;
			m.FVALUE = d_m_y(zvDat);
			m.DESCR = ru("Создание заказов задним числом не разрешено, дата заказа в файле - "+d_m_y(zvDat)+", текущая дата "+d_m_y(td)
				, "Створення замовлень заднім числом не дозволене, дата замовлення в файлі - "+d_m_y(zvDat)+", поточна дата "+d_m_y(td));
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		}
	});

	strSQL = "SELECT DISTINCT FDOC_DAT FROM "+self.tmpHZV
	forEachSQL(strSQL, function(item)
	{
		strSQL = "SELECT FWID FROM ^HROUTE"
				+" WHERE FDOC_DAT ="+sqlTo(item.FDOC_DAT)
		var sn = getSnap(strSQL);

		if (sn != null && !isEmpty(sn[0]))
		{
			retVal = true;
		}
		else
		{
			var m = {};
			m.FVALUE = d_m_y(item.FDOC_DAT);
			m.DESCR = ru("На дату "+d_m_y(item.FDOC_DAT)+" отсутствует документ \"Маршрутное задание\""
			, "На дату "+d_m_y(item.FDOC_DAT)+" відсутній документ \"Маршрутне завдання\"");
			UpdateTable(tmpCheck, m, true);
			isErr = true;
			retVal = false;
		}
	});

	// проставление маршрута и остальных данных, если что-то не проставилось, надо об этом сказать и ничего дальше не делать
	var tmpTbl = getTmpTableName();
	strSQL = "select "
				+" hzv.fshop"
				+", hzv.fdoc_dat"
				+", hzv.order_id"
				+", max(r.froute) as froute_auto"
				+", max(hzv.froute) as froute"
				+", max(r.favto) as favto"
				+", max(r.fdriver) as fdriver"
				+", max(r.flyst) as flyst"
				+", max(r.ftime) as ftime"
			+" into "+tmpTbl
			+" from ^rroute r"
				+" inner join ^hroute h on r.fid_doc = h.fwid"
				+" inner join "+self.tmpHZV+" hzv on h.fdoc_dat = hzv.fdoc_dat"
				+" inner join ^listcl cl250 on r.froute = cl250.fcod and cl250.fcl = "+sqlTo(getPar(const_GETPAR_CL_ROUTE))
				+" inner join ^cl_route clr on cl250.fwid_cl = clr.fwid_cl and clr.fshop = hzv.fshop"
			+" group by "
				+" hzv.fshop"
				+", hzv.fdoc_dat"
				+", hzv.order_id"
	ExecuteSQL(strSQL);

	strSQL = " select order_id from " + tmpTbl;

	var orderIds = fetchSQL(strSQL).map(function(e) { return e.ORDER_ID; });
	if (check)
	{
		strSQL = "select froute, order_id, fdoc_dat, fshop from " + self.tmpHZV + " where 1=1 "
			+ (orderIds.length ? " and order_id not in (" + orderIds + ")" : "")

		forEachSQL(strSQL, function(it)
		{
			var m = {};
			m.ORDER_ID = it.ORDER_ID;
			m.FSHOP = it.FSHOP;
			m.FDOC_DAT = it.FDOC_DAT;

			m.FROUTE = it.FROUTE;
			m.FROUTE_AUTO = 0;
			m.FLYST = 0;
			m.FDRIVER = 0;
			m.FAVTO = 0;
			UpdateTable(tmpTbl, m, true);
		});

		strSQL = " select froute, froute_auto, order_id, fdoc_dat, fshop from " + tmpTbl
			 + " where froute <> froute_auto or froute_auto = 0 or froute_auto is null"

		skipOrderIds = [];

		forEachSQL(strSQL, function(item) {
			var fRoute = 0;

			if (item.FROUTE_AUTO == 0 || item.FROUTE_AUTO == null)
			{
				var oA = new DpAskEx();
				var rem1 = ru("Внимание!", "Увага!");
				var rem2 = ru("Для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+" для магазина с кодом " + item.FSHOP + ": " + tfcl("TXT",  getPar("CODPLAT"), item.FSHOP),
					"Для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+" для магазина з кодом " + item.FSHOP + ": " + tfcl("TXT",  getPar("CODPLAT"), item.FSHOP))
				var rem3 = ru("не удалось установить код маршрута автоматически.\nУкажите маршрут вручную или используйте код, указанный в json-файле", "не вдалося встановити код маршруту автоматично.\nВкажіть маршрут вручну або використовуйте код, вказаний в json-файлі");
				oA.add("REM", rem1, "AREM1");
				oA.add("REM", rem2, "AREM2");
				oA.add("REM", rem3, "AREM3");
				oA.add("CL", "Маршрут", "ROUTE", item.FROUTE, getPar(const_GETPAR_CL_ROUTE));

				if (!oA.doAsk())
				{
					if (!confirm(ru("Продолжить создание заказов?", "Продовжити створення замовлень?")))
					{
						throw new Error(ru("Отменено пользователем", "Відмінено користувачем"));
					}
					skipOrderIds.push(item.ORDER_ID);
					isErr = true;
				}
				else
				{
					fRoute = oA.get("ROUTE").getCod();
				}
			}
			else if (item.FROUTE != item.FROUTE_AUTO)
			{
				var oA = new DpAskEx();
				var rem1 = ru("Внимание!", "Увага!");
				var rem2 = ru("Для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+" для магазина с кодом " + item.FSHOP + ": " + tfcl("TXT",  getPar("CODPLAT"), item.FSHOP),
					"Для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+" для магазина з кодом " + item.FSHOP + ": " + tfcl("TXT",  getPar("CODPLAT"), item.FSHOP) )
				var rem3 = ru("Код маршрута, указанный в json-файле (" + item.FROUTE + ") отличается от кода, установленного автоматически ("+item.FROUTE_AUTO+")."
							, "Код маршруту, вказаний в json-файлі (" + item.FROUTE + ") відрізняється від коду, встановленого автоматично ("+item.FROUTE_AUTO+").");
				var rem4 = ru("Выберете код маршрута, который нужно использовать, или укажите новый из справочника маршрутов"
							,"Вкажіть код маршруту, який необхідно використовувати, або виберіть новий з довідника маршрутів");
				oA.add("REM", rem1, "AREM1");
				oA.add("REM", rem2, "AREM2");
				oA.add("REM", rem3, "AREM3");
				oA.add("REM", rem4, "AREM4");

				var rText = ru("Использовать код из json-файла ", "Використовувати код з json-файлу")
						+ "|" + ru("Использовать код установленный автоматически ", "Використовувати код встановлений автоматично")
				oA.add("RADIO", " ", "RROUTE", 0, rText);
				oA.add("B", "Вибрати маршрут з довідника|Выбрать маршрут из справочника", "CLUSE", false);
				oA.add("CL", "Маршрут", "ROUTE", item.FROUTE, getPar(const_GETPAR_CL_ROUTE));

				oA.defCond("this.immediate(\"CLUSE\") == true","USECL");
				oA.enable("ROUTE","USECL");

				if (!oA.doAsk())
				{
					if (!confirm(ru("Продолжить создание заказов?", "Продовжити створення замовлень?")))
					{
						throw new Error(ru("Отменено пользователем", "Відмінено користувачем"));
					}
					skipOrderIds.push(item.ORDER_ID);
					isErr = true;
				}
				else
				{
					var useCl = oA.get("CLUSE");
					if (useCl)
						fRoute = oA.get("ROUTE").getCod();
					else
					{
						var codeUse = oA.get("RROUTE");
						switch (codeUse) {
							case 0:
								fRoute = item.FROUTE;
								break;
							case 1:
								fRoute = item.FROUTE_AUTO;
								break;
						}
					}
				}
			}

			strSQL = "update " + tmpTbl
					+ " set froute = ("
						+ " select r.froute as froute from ^hroute h "
						+ " inner join ^rroute r on r.fid_doc=h.fwid "
						+ " where r.froute = " + sqlTo(fRoute)
							+ " and h.fdoc_dat=" + sqlTo(item.FDOC_DAT)
						+ ") "
					+ ", favto = ("
						+ " select r.favto as favto from ^hroute h "
						+ " inner join ^rroute r on r.fid_doc=h.fwid "
						+ " where r.froute = " + sqlTo(fRoute)
							+ " and h.fdoc_dat=" + sqlTo(item.FDOC_DAT)
						+ ") "
					+ ", fdriver = ("
						+ " select r.fdriver as fdriver from ^hroute h "
						+ " inner join ^rroute r on r.fid_doc=h.fwid "
						+ " where r.froute = " + sqlTo(fRoute)
							+ " and h.fdoc_dat=" + sqlTo(item.FDOC_DAT)
						+ ") "
					+ ", flyst = ("
						+ " select r.flyst as flyst from ^hroute h "
						+ " inner join ^rroute r on r.fid_doc=h.fwid "
						+ " where r.froute = " + sqlTo(fRoute)
							+ " and h.fdoc_dat=" + sqlTo(item.FDOC_DAT)
						+ ") "
					+ ", ftime = ("
						+ " select r.ftime as ftime from ^hroute h "
						+ " inner join ^rroute r on r.fid_doc=h.fwid "
						+ " where r.froute = " + sqlTo(fRoute)
							+ " and h.fdoc_dat=" + sqlTo(item.FDOC_DAT)
						+ ") "
					+ " where order_id = " + item.ORDER_ID
						+ " and exists ( "
							+ " select 1 from ^hroute h "
							+ " inner join ^rroute r on r.fid_doc=h.fwid "
							+ " where r.froute = " + sqlTo(fRoute)
								+ " and h.fdoc_dat=" + sqlTo(item.FDOC_DAT)
							+ ") "
			ExecuteSQL(strSQL);
		});

		if (isErr)
		{
			if (skipOrderIds.length)
			{
				ExecuteSQL("delete from " + self.tmpHZV + " where order_id in (" + skipOrderIds.join(",")+")");
				ExecuteSQL("delete from " + self.tmpRZV + " where order_id in (" + skipOrderIds.join(",")+")");
				ExecuteSQL("delete from " + tmpTbl + " where order_id in (" + skipOrderIds.join(",")+")");
				ExecuteSQL("delete from " + tmpCheck + " where order_id in (" + skipOrderIds.join(",")+")");

			}
			isErr = false;
		}

		strSQL = "update "+self.tmpHZV
				+" set froute = ("
					+" select froute"
					+" from "+tmpTbl
					+" where fshop = "+self.tmpHZV+".fshop"
						+" and fdoc_dat = "+self.tmpHZV+".fdoc_dat"
						+" and order_id = "+self.tmpHZV+".order_id"
				+")"
				+", favto = ("
					+" select favto"
					+" from "+tmpTbl
					+" where fshop = "+self.tmpHZV+".fshop"
						+" and fdoc_dat = "+self.tmpHZV+".fdoc_dat"
						+" and order_id = "+self.tmpHZV+".order_id"
				+")"
				+", fdriver = ("
					+" select fdriver"
					+" from "+tmpTbl
					+" where fshop = "+self.tmpHZV+".fshop"
						+" and fdoc_dat = "+self.tmpHZV+".fdoc_dat"
						+" and order_id = "+self.tmpHZV+".order_id"
				+")"
				+", flyst = ("
					+" select flyst"
					+" from "+tmpTbl
					+" where fshop = "+self.tmpHZV+".fshop"
						+" and fdoc_dat = "+self.tmpHZV+".fdoc_dat"
						+" and order_id = "+self.tmpHZV+".order_id"
				+")"
				+", ftime = ("
					+" select ftime"
					+" from "+tmpTbl
					+" where fshop = "+self.tmpHZV+".fshop"
						+" and fdoc_dat = "+self.tmpHZV+".fdoc_dat"
						+" and order_id = "+self.tmpHZV+".order_id"
				+")"
				+" where exists ("
					+" select 1"
					+" from "+tmpTbl
					+" where fshop = "+self.tmpHZV+".fshop"
						+" and fdoc_dat = "+self.tmpHZV+".fdoc_dat"
				+")"
		ExecuteSQL(strSQL);

		// проверка на наличие маршрута
		strSQL = "select * from "+self.tmpHZV+" where froute = 0"
		forEachSQL(strSQL, function(item)
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			m.FFILE = item.FFILE;
			m.FVALUE = d_m_y(item.FDOC_DAT);
			m.DESCR = ru("заголовок заказа - не удалось установить код маршрута для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+" для магазина с кодом "+item.FSHOP+". Проверьте документ маршрутное задание на дату "+d_m_y(item.FDOC_DAT)
			, "заголовок замовлення - не вдалось встановити код маршрута для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+" для магазина з кодом "+item.FSHOP+". Перевірте документ маршрутне завдання на дату "+d_m_y(item.FDOC_DAT));
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		});

		// проверка на наличие автомобиля
		strSQL = "select * from "+self.tmpHZV+" where favto = 0"
		forEachSQL(strSQL, function(item)
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			m.FFILE = item.FFILE;
			m.FVALUE = d_m_y(item.FDOC_DAT);
			m.DESCR = ru("заголовок заказа - не удалось установить код автомобиля для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+" для магазина с кодом "+item.FSHOP+". Проверьте документ маршрутное задание на дату "+d_m_y(item.FDOC_DAT)
			, "заголовок замовлення - не вдалось встановити код автмобіля для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+" для магазина з кодом "+item.FSHOP+". Перевірте документ маршрутне завдання на дату "+d_m_y(item.FDOC_DAT));
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		});

		// проверка на наличие водителя
		strSQL = "select * from "+self.tmpHZV+" where fdriver = 0"
		forEachSQL(strSQL, function(item)
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			m.FFILE = item.FFILE;
			m.FVALUE = d_m_y(item.FDOC_DAT);
			m.DESCR = ru("заголовок заказа - не удалось установить код водителя для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+" для магазина с кодом "+item.FSHOP+". Проверьте документ маршрутное задание на дату "+d_m_y(item.FDOC_DAT)
			, "заголовок замовлення - не вдалось встановити код водія для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+" для магазина з кодом "+item.FSHOP+". Перевірте документ маршрутне завдання на дату "+d_m_y(item.FDOC_DAT));
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		});

		// не должно быть одинаковых order_id
		strSQL = "select order_id, count(order_id) as fcnt from "+self.tmpHZV+" group by order_id having count(order_id) > 1"
		forEachSQL(strSQL, function(item)
		{
			var m = {};
			m.ORDER_ID = item.ORDER_ID;
			//m.FFILE = item.FFILE;
			m.FVALUE = item.FCNT;
			m.DESCR = ru("заголовок заказа - для разных документов существуют одинаковые идентификаторы, ID заказа - "+item.ORDER_ID+", количество документов - "+item.FCNT
				, "заголовок замовлення - для різних документів існують однакові ідентифікатори, ID замовлення - "+item.ORDER_ID+", кількість документів - "+item.FCNT);
			UpdateTable(tmpCheck, m, true);
			isErr = true;
		});


		if (isErr)
		{
			par = {};
			par.onDrawGrid = function(oGrid)
			{
				with (oGrid.page())
				{
					cell("ORDER_ID", "ID замовлення|ID заказа", 12);
					cell("FFILE", "Ім'я файлу|Имя файла", 15, "w");
					cell("DESCR", "Опис помилки|Описание ошибки", 50, "w");
					cell("FVALUE", "Значення поля в json-файлі|Значение поля в json-файле", 30, "w");
				}
			};
			par.icon = ICON_ERROR;
			par.message = ru("json файл содержит ошибки, эти заказы будут пропущены. Обратитесь к разработчику WEB-приложения", "json файл містить помилки, ці замовлення будуть пропущені. Зверніться до розробника WEB-додатку");
			par.caption = ru("Протокол ошибок json-файла", "Протокол помилок json-файлу");

			browse(OpenTable(tmpCheck), par, SW_MODAL);

			strSQL = "select * from " + self.tmpHZV
				+ " where froute = 0 or favto = 0 or fdriver = 0"
			forEachSQL(strSQL, function(it) {
				ExecuteSQL("delete from " + self.tmpHZV + " where order_id = " + sqlTo(it.ORDER_ID));
				ExecuteSQL("delete from " + self.tmpRZV + " where order_id = " + sqlTo(it.ORDER_ID));
			});
		}
	}


	return true;
}

/**
 * Сравнение содержимого базы с json-файлом по ключу order_id, который при импорте заказов прописывается в поле FOUTID
 */
function DpZvImporter_compare()
{
	var self = this;

	var isDiff = false;

	// спросим период, за который будем сравнивать
	include("Objects/DpAskEx.js");
	var oA = new DpAskEx();
	oA.add("D", "Дата початку|Дата начала", "BDAT", new Date().getVarDate());
	oA.add("D", "Дата закінчення|Дата окончания", "EDAT", new Date().getVarDate());
	oA.setRel("<=", "BDAT", "EDAT");
	oA.doAsk();

	if (oA.escape)
	{
		return false;
	}

	var D1 = new Date(oA.get("BDAT"));
	var D2 = new Date(oA.get("EDAT"));

	// читаем json-файл и на выходе получаем две таблицы с заголовками и строками заказов
	self.load(true);

	var tHzv = getTmpTableName();
	var tRzv = getTmpTableName();
	var tJsonHzv = getTmpTableName();
	var tJsonRzv = getTmpTableName();

	strSQL = "select *, foutid as order_id into "+tHzv
			+" from ^hzv"
			+" where fdoc_dat >= "+sqlTo(D1)
				+" and fdoc_dat <= "+sqlTo(D2)
	ExecuteSQL(strSQL);

	strSQL = "select r.*, h.foutid as order_id, r.fnmkl as fnmkl_id, nmk.ftxts"
				+", h.fdoc_num, h.fdoc_dat, h.fnop"
			+" into "+tRzv
			+" from ^rzv r"
			+" inner join ^hzv h on r.fid_doc = h.fwid"
				+" and h.fdoc_dat >= "+sqlTo(D1)
				+" and h.fdoc_dat <= "+sqlTo(D2)
			+" inner join ^cl_nmk nmk on r.fnmkl = nmk.fwid"
	ExecuteSQL(strSQL);

	// оставим в импортированных данных из файла только данные за указанный период
	strSQL = "select *, '' as fdoc_num into "+tJsonHzv
			+" from "+this.tmpHZV
			+" where fdoc_dat >= "+sqlTo(D1)
				+" and fdoc_dat <= "+sqlTo(D2)
	ExecuteSQL(strSQL);

	strSQL = "select r.*, nmk.ftxts"
				+", h.fdbkr, h.fshop"
				+", '' as fdoc_num, h.fdoc_dat"
				+", 0 as fnop"
			+" into "+tJsonRzv
			+" from "+this.tmpRZV+" r"
			+" inner join "+this.tmpHZV+" h on r.fid_doc = h.fwid"
				+" and h.fdoc_dat >= "+sqlTo(D1)
				+" and h.fdoc_dat <= "+sqlTo(D2)
			+" inner join ^cl_nmk nmk on r.fnmkl_id = nmk.fwid"
	ExecuteSQL(strSQL);

	var oCmp = new DpCmp();
	var sKeyFields = "order_id";
	oCmp.tblLeft	= tJsonHzv;			//из файла
	oCmp.tblRight	= tHzv;				//из Дебета
	oCmp.tblDstName = "ZVDIFF";			//префикс имен результирующих таблиц
	oCmp.setKeyFields("", sKeyFields);
	oCmp.doCmp();

	par = {};
	par.onDrawGrid = function(oGrid)
	{
		with (oGrid.page())
		{
			cell("fnop", "Папка|Папка", 10);
			cell("fdoc_dat", "Дата", 12);
			cell("fdoc_num", "№ док.", 12);
			cell("=^fdbkr+': '+tcl('CL', 'TXT', sprOrg, ^fdbkr)", "Покупець|Покупатель", 30, "w");
			cell("=^fshop+': '+tcl('CL', 'TXT', sprOrg, ^fshop)", "Магазин|Магазин", 30, "w");
			cell("order_id", "ID замовлення|ID заказа", 12);
		}
	};
	par.icon = ICON_INFORMATION;
	par.message = ru("Заголовок - заказы, которые есть в json-файле, но нет в документах или есть различия в содержимом","Заголовок - замовлення, які є в json-файлі, але нема в документах або існують розбіжності у вмісті")+"\n"+ru("Период с ", "Період з ")+d_m_y(D1)+" по "+d_m_y(D2);
	par.caption = par.message;
	par.filing = "fnop";
	var tL1 = OpenTable("select * from "+oCmp.tblDstName+"_LEFT order by fnop, fdoc_dat, fdoc_num");
	if (!tL1.IsEmpty())
	{
		browse(tL1, par, SW_NOMODAL);
		isDiff = true;
	}

	par.message = ru("Заголовок - заказы, которые есть в документах, но нет в json-файле или есть различия в содержимом","Заголовок - замовлення, які є в документах, але нема в json-файлі або існують розбіжності у вмісті")+"\n"+ru("Период с ", "Період з ")+d_m_y(D1)+" по "+d_m_y(D2);
	par.caption = par.message;
	var tR1 = OpenTable("select * from "+oCmp.tblDstName+"_RIGHT order by fnop, fdoc_dat, fdoc_num");
	if (!tR1.IsEmpty())
	{
		browse(tR1, par, SW_NOMODAL);
		isDiff = true;
	}

	// разница в строках
	var oCmp = new DpCmp();
	var sKeyFields = "order_id, fnmkl_id, fkol";
	oCmp.tblLeft	= tJsonRzv;				//из файла
	oCmp.tblRight	= tRzv;					//из Дебета
	oCmp.tblDstName = "ZVDIFF_R";			//префикс имен результирующих таблиц
	oCmp.setKeyFields("", sKeyFields);
	oCmp.doCmp();

	par = {};
	par.onDrawGrid = function(oGrid)
	{
		with (oGrid.page())
		{
			cell("fdoc_dat", "Дата", 12);
			cell("fdoc_num", "№ док.", 12);
			cell("=^fdbkr+': '+tcl('CL', 'TXT', sprOrg, ^fdbkr)", "Покупець|Покупатель", 30, "w");
			cell("=^fshop+': '+tcl('CL', 'TXT', sprOrg, ^fshop)", "Магазин|Магазин", 30, "w");
			cell("=tfnmk('COD', ^fnmkl_id)+': '+tfnmk('TXTS', ^fnmkl_id)", "Товар|Товар", 30, "w");
			cell("=tfnmk('EDI', ^fnmkl_id)", "Од. вим.|Ед. изм.", 8);
			cell("order_id", "ID замовлення|ID заказа", 12);
			cell("fkol", "Кількість|Количество", 12, null, DP_FORMAT_KOL);
		}
	};
	par.icon = ICON_INFORMATION;
	par.message = ru("Строки - заказы, которые есть в json-файле, но нет в документах или есть различия в содержимом","Рядки - замовлення, які є в json-файлі, але нема в документах або існують розбіжності у вмісті")+"\n"+ru("Период с ", "Період з ")+d_m_y(D1)+" по "+d_m_y(D2);
	par.caption = par.message;
	par.filing = "order_id";
	var tL2 = OpenTable("select * from "+oCmp.tblDstName+"_LEFT order by fdoc_dat, order_id, fnmkl_id");
	if (!tL2.IsEmpty())
	{
		browse(tL2, par, SW_NOMODAL);
		isDiff = true;
	}

	par.message = ru("Строки - заказы, которые есть в документах, но нет в json-файле или есть различия в содержимом","Рядки - замовлення, які є в документах, але нема в json-файлі або існують розбіжності у вмісті")+"\n"+ru("Период с ", "Період з ")+d_m_y(D1)+" по "+d_m_y(D2);
	par.caption = par.message;
	var tR2 = OpenTable("select * from "+oCmp.tblDstName+"_RIGHT order by fdoc_dat, order_id, fnmkl_id");
	if (!tR2.IsEmpty())
	{
		browse(tR2, par, SW_NOMODAL);
		isDiff = true;
	}

	if (!isDiff)
	{
		alert(ru("Отличий не найдено", "Відмінностей не знайдено"));
	}
}

/*
//ExecuteSQL("delete from ^rzv where fid_doc in (select fwid from ^hzv where fdoc_dat >= "+sqlTo(new Date(2020,0,1))+")"); ExecuteSQL("delete from ^hzv where fdoc_dat >= "+sqlTo(new Date(2020,0,1)));

runInThread(function()
{
try {
			include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
			var oZvImporter = new DpZvImporter();
			oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
			//oZvImporter.load();
			//oZvImporter.createZV();
			oZvImporter.compare();
} catch (ex) { globalExceptionHandler(ex); }
});
*/