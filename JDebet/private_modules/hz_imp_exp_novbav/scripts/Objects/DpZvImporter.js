include("sys/File.js");
include("json2.js");
include("sys/Path.js");
include("hz:servis/hz.js");

function DpZvImporter(path)
{
	this.load = DpZvImporter_load;
	this.prepareData = DpZvImporter_prepareData;
	this.createZV = DpZvImporter_createZV;
	this.createTables = DpZvImporter_createTables;
	this.checkValid = DpZvImporter_checkValid;

	this.path = path;

	this.mol = 0;
	this.podr = 0;
	this.inspector = 0;

	this.tmpHZV = getTmpTableName();
	this.tmpRZV = getTmpTableName();
	this.defForm = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DEF_FRM");
}

/**
 * Загрузка данных json-файла в таблицы this.tmpHZV (заголовки) и this.tmpRZV (строки)
 */
function DpZvImporter_load()
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

	var aFiles = [];
	// если передали папку, то запишем в массив все файлы этой папки
	if (isDirectory)
	{
		Directory.walkFiles(self.path, function(filePath)
		{
			aFiles.push(String(filePath.getAbsolutePath()));
		}, null, null, 0);
	}
	else
	{
		aFiles.push(self.path);
	}

	if (aFiles.length == 0)
	{
		return false;
	}

	// создадим таблицы заголовка и строк заказов, чтобы туда прочитать содержимое файлов
	self.createTables();

	forEach(aFiles, function(item)
	{
		var filePath = item;

		// обрабатываем только *.json файлы
		if (!Path.getExtension(filePath).equalsIgnoreCase(".json"))
		{
			return;
		}
		var fileName = Path.getFileName(filePath);

		var fileText = File.readAllText(filePath);
		var arr = JSON.parse(fileText, JSON.dateTimeReviver);
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

	self.prepareData();
	return aFiles;
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
	fld.FSHOP_VALID = "BIT";

	fld.JSON_FDOC_DAT = "TEXT";
	fld.JSON_FDBKR = "TEXT";
	fld.JSON_FSHOP = "TEXT";
	fld.FWID = "LONG";

	var ind = {};
	ind.FWID = "FWID";
	ind.FSHOP = "FSHOP";
	ind.FDOC_DAT = "FDOC_DAT";

	var def = {};
	def.FDOC_DAT_VALID = true;
	def.FDBKR_VALID = true;
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

function DpZvImporter_prepareData()
{
	var self = this;
	runWithStatus(ru("Выполняется загрука данных...", "Виконується завантаження даних..."), function()
	{
		// проверим валидность полей
		if (!self.checkValid())
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

		// проанализируем, есть ли в базе заказы, которые есть в json-файле
		var aDocs = [];
		var tmpExists = getTmpTableName();
		strSQL = "SELECT DISTINCT H.FDOC_NUM, H.FDOC_DAT, H.FNOP, TMP.FWID"
				+" INTO "+tmpExists
				+" FROM ^HZV H INNER JOIN "+self.tmpHZV+" TMP ON H.FOUTID = TMP.ORDER_ID"
		ExecuteSQL(strSQL);

		forEachSQL("SELECT * FROM "+tmpExists+" ORDER BY FDOC_DAT, FDOC_NUM", function(item)
		{
			aDocs.push("№ "+item.FDOC_NUM+" "+ru("от", "від")+" "+d_m_y(item.FDOC_NUM)+", папка "+item.FNOP)
		});

		if (aDocs.length != 0)
		{
			var strMsgRu = "Внимание!"
				+"\nВ базе и в файле, который импортируется, уже есть "
				+"\nодинаковые заказы. При переносе они будут пропущены."
				+"\nДля дполнительного анализа воспользуйтесь функцией"
				+"\nсравнения базы и json-файла."
				+"\nСписок одинаковых заказов:"
				+"\n"+aDocs.join("; ")

			var strMsgUr = "Увага!"
				+"\nВ базі та в файлі, який імпортується, вже існують "
				+"\nоднакові замовлення. При переносі вони будуть пропущені."
				+"\nДля додаткового аналізу скористайтесь функцією"
				+"\nпорівняння бази та json-файлу."
				+"\nСписок однакових замовлень:"
				+"\n"+aDocs.join("; ")
			alert(strMsgRu, strMsgUr);

			if (!confirm(ru("Продолжить создание заказов?", "Продовжити створення замовлень?")))
			{
				return false;
			}
		}

		// не импортируем то, что уже есть в базе
		strSQL = "DELETE FROM "+self.tmpHZV
				+" WHERE FWID IN ("
					+" SELECT FWID FROM "+tmpExists
				+")"
		ExecuteSQL(strSQL);

		strSQL = "DELETE FROM "+self.tmpRZV
				+" WHERE FID_DOC IN ("
					+" SELECT FWID FROM "+tmpExists
				+")"
		ExecuteSQL(strSQL);

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
		fld.FWID = "COUNTER";

		var ind = {};
		ind.FFORM = "FFORM";
		ind.FDAY = "FDAY";
		ind.FDBKR = "FDBKR";
		CreateTable(tmpNop, fld, ind);

		// чтобы сократить код, буду использовать циклы
		var aDbkrFlds = ["FDBKR", "FSHOP"];

		// сгенерируем таблицу с днями недели из файла-заявок и кодами контрагентов
		var tmpTuneAll = getTmpTableName();
		var tmpTune = getTmpTableName();
		var fld = {};
		fld.FDBKR = "LONG";
		fld.FDOC_DAT = "DATE";
		fld.FDAY = "LONG";
		fld.FFORM = "LONG";
		fld.FNOP = "LONG";
		fld.FWID = "COUNTER";

		var ind = {};
		ind.FDBKR = "FDBKR";
		ind.FDAY = "FDAY";
		ind.FDOC_DAT = "FDOC_DAT";
		CreateTable(tmpTuneAll, fld);
		CreateTable(tmpTune, fld, ind);

		for (var dbkr in aDbkrFlds)
		{
			strSQL = "INSERT INTO "+tmpTuneAll+" (FDBKR, FDOC_DAT)"
					+" SELECT DISTINCT "+aDbkrFlds[dbkr]+" AS FDBKR, FDOC_DAT "
					+" FROM "+self.tmpHZV
			ExecuteSQL(strSQL);
		}

		// уникальные
		strSQL = "INSERT INTO "+tmpTune+" (FDBKR, FDOC_DAT)"
				+" SELECT DISTINCT FDBKR, FDOC_DAT "
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
		strSQL = "SELECT DISTINCT FDBKR FROM "+tmpTune
		forEachSQL(strSQL, function(item)
		{
			for (var i = 0; i <= 6; i++)
			{
				var m = {};
				m.FDBKR = item.FDBKR;
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
		strSQL = "SELECT FDBKR, FFORM, COUNT(FFORM) AS FCNT"
				+" INTO "+tmpEmpty
				+" FROM "+tmpNop
				+" GROUP BY FDBKR, FFORM"
				+" HAVING COUNT(FFORM) = 7"
				+" ORDER BY FDBKR, FCNT"
		ExecuteSQL(strSQL);

		strSQL = "UPDATE "+tmpNop
				+" SET FFORM = "+sqlTo(self.defForm)
				+" WHERE EXISTS (SELECT FDBKR, FFORM FROM "+tmpEmpty
					+" WHERE FDBKR = "+tmpNop+".FDBKR"
						+" AND FFORM = "+tmpNop+".FFORM"
						+" AND "+tmpNop+".FFORM = 0"
				+")"
		ExecuteSQL(strSQL);

		// у кого только одна форма в любом дне - возьмем эту форму для всех дней
		DropTable(tmpEmpty);
		strSQL = "SELECT FDBKR, FFORM, COUNT(FFORM) AS FCNT"
				+" INTO "+tmpEmpty
				+" FROM "+tmpNop
				+" GROUP BY FDBKR, FFORM"
				+" HAVING COUNT(FFORM) = 6 or COUNT(FFORM) = 1"
				+" ORDER BY FDBKR, FCNT"
		ExecuteSQL(strSQL);

		strSQL = "UPDATE "+tmpNop
				+" SET FFORM = ("
					+" SELECT FFORM FROM "+tmpEmpty
					+" WHERE FDBKR = "+tmpNop+".FDBKR"
						+" AND FFORM <> 0 "
						+" AND "+tmpNop+".FFORM = 0 "
				+")"
				+" WHERE EXISTS("
					+" SELECT FFORM FROM "+tmpEmpty
					+" WHERE FDBKR = "+tmpNop+".FDBKR"
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
						+" AND FDAY = "+tmpTune+".FDAY"
				+")"
				+", FNOP = ("
					+" SELECT FNOP FROM "+tmpNop
					+" WHERE FDBKR = "+tmpTune+".FDBKR"
						+" AND FDAY = "+tmpTune+".FDAY"
				+")"
				+" WHERE EXISTS ("
					+" SELECT FFORM FROM "+tmpNop
					+" WHERE FDBKR = "+tmpTune+".FDBKR"
						+" AND FDAY = "+tmpTune+".FDAY"
				+")"
		ExecuteSQL(strSQL);

		strSQL = "UPDATE "+self.tmpHZV
				+" SET FNOP = ("
					+" SELECT FNOP FROM "+tmpTune
					+" WHERE FDBKR = "+self.tmpHZV+".FDBKR"
						+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
				+")"
				+" WHERE EXISTS ("
					+" SELECT FNOP FROM "+tmpTune
					+" WHERE FDBKR = "+self.tmpHZV+".FDBKR"
						+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
				+")"
		ExecuteSQL(strSQL);

		strSQL = "UPDATE "+self.tmpHZV
				+" SET FNOP = ("
					+" SELECT FNOP FROM "+tmpTune
					+" WHERE FDBKR = "+self.tmpHZV+".FSHOP"
						+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
				+")"
				+" WHERE EXISTS ("
					+" SELECT FNOP FROM "+tmpTune
					+" WHERE FDBKR = "+self.tmpHZV+".FSHOP"
						+" AND FDOC_DAT = "+self.tmpHZV+".FDOC_DAT"
				+")"
		ExecuteSQL(strSQL);

		DropTable(tmpExists);

	});
	var oRet = {};
	oRet.tblH = self.tmpHZV;
	oRet.tblR = self.tmpRZV;
	return oRet;
}

/**
 * Создание документа ZV - заказ
 */
function DpZvImporter_createZV()
{
	// проверим валидность полей
	if (!this.checkValid(true))
	{
		return false;
	}

	var self = this;

	// создание самой заявки
	var mFdoc = "hz:ZV";
	var podr = this.mol;
	var mol = this.podr;
	var inspector = this.inspector;

	var docNum = "";
	strSQL = "SELECT * FROM "+this.tmpHZV
	forEachSQL(strSQL, function(hItem)
	{
		var mainFwid = GetUID();
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
				numStr++;
				oRow.setVar("RID", GetUID());
				oRow.setVar("RDBKR", dbkr);
				oRow.setVar("RNOM", numStr);
				var kolRow = rItem.FKOL;
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

		// нужно чтобы записались часы и минуты, так как oDoc.setVar их отрезает
		strSQL = "UPDATE ^HZV SET FTIME = "+sqlDateTo(mFtime)+" WHERE FWID = "+sqlTo(mainFwid)
		ExecuteSQL(strSQL);
	}, null, new ModalProgressProvider(function(item, rateProvider)
	{
		return ru("Создание документа заказа № "+docNum, "Створення документу замовлення № "+docNum);
	}));

	// browse(tmpTune)
	// browse("SELECT * FROM "+tmpNop+" ORDER BY FDBKR, FDAY")
	// browse(this.tmpHZV)
	// browse(this.tmpRZV)
}

/**
 * Проверка корректности значений полей json-файла
 */
function DpZvImporter_checkValid(isSilent)
{
	if (typeof(isSilent) == "undefined")
	{
		isSilent = false;
	}
	var aHFields = ["FDOC_DAT", "FDBKR", "FSHOP"];
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
					+" FROM "+this.tmpHZV
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

	for (var i in aRFields)
	{
		var fld = aRFields[i];
		var strSQL = "SELECT R.ORDER_ID, R.FNMKL, H.FFILE"
						+", R.JSON_"+fld+" AS FVALUE"
					+" FROM "+this.tmpRZV+" R"
					+" INNER JOIN "+this.tmpHZV+" H ON R.ORDER_ID = H.ORDER_ID"
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

	var datMsg = "";
	var strSQL = "select distinct ffile, fdoc_dat from "+this.tmpHZV
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

	strSQL = "SELECT DISTINCT FDOC_DAT FROM "+this.tmpHZV
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
				+", max(r.froute) as froute"
				+", max(r.favto) as favto"
				+", max(r.fdriver) as fdriver"
				+", max(r.flyst) as flyst"
				+", max(r.ftime) as ftime"
			+" into "+tmpTbl
			+" from ^rroute r"
				+" inner join ^hroute h on r.fid_doc = h.fwid"
				+" inner join "+this.tmpHZV+" hzv on h.fdoc_dat = hzv.fdoc_dat"
				+" inner join ^listcl cl250 on r.froute = cl250.fcod and cl250.fcl = "+sqlTo(getPar(const_GETPAR_CL_ROUTE))
				+" inner join ^cl_route clr on cl250.fwid_cl = clr.fwid_cl and clr.fshop = hzv.fshop"
			+" group by "
				+" hzv.fshop"
				+", hzv.fdoc_dat"
	ExecuteSQL(strSQL);

	strSQL = "update "+this.tmpHZV
			+" set froute = ("
				+" select froute"
				+" from "+tmpTbl
				+" where fshop = "+this.tmpHZV+".fshop"
					+" and fdoc_dat = "+this.tmpHZV+".fdoc_dat"
			+")"
			+", favto = ("
				+" select favto"
				+" from "+tmpTbl
				+" where fshop = "+this.tmpHZV+".fshop"
					+" and fdoc_dat = "+this.tmpHZV+".fdoc_dat"
			+")"
			+", fdriver = ("
				+" select fdriver"
				+" from "+tmpTbl
				+" where fshop = "+this.tmpHZV+".fshop"
					+" and fdoc_dat = "+this.tmpHZV+".fdoc_dat"
			+")"
			+", flyst = ("
				+" select flyst"
				+" from "+tmpTbl
				+" where fshop = "+this.tmpHZV+".fshop"
					+" and fdoc_dat = "+this.tmpHZV+".fdoc_dat"
			+")"
			+", ftime = ("
				+" select ftime"
				+" from "+tmpTbl
				+" where fshop = "+this.tmpHZV+".fshop"
					+" and fdoc_dat = "+this.tmpHZV+".fdoc_dat"
			+")"
			+" where exists ("
				+" select 1"
				+" from "+tmpTbl
				+" where fshop = "+this.tmpHZV+".fshop"
					+" and fdoc_dat = "+this.tmpHZV+".fdoc_dat"
			+")"
	ExecuteSQL(strSQL);

	// проверка на наличие маршрута
	strSQL = "select * from "+this.tmpHZV+" where froute = 0"
	forEachSQL(strSQL, function(item)
	{
		var m = {};
		m.ORDER_ID = item.ORDER_ID;
		m.FFILE = item.FFILE;
		m.FVALUE = d_m_y(item.FDOC_DAT);
		m.DESCR = ru("заголовок заказа - не удалось установить код маршрута для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+". Проверьте документ маршрутное задание на дату "+d_m_y(item.FDOC_DAT)
		, "заголовок замовлення - не вдалось встановити код маршрута для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+". Перевірте документ маршрутне завдання на дату "+d_m_y(item.FDOC_DAT));
		UpdateTable(tmpCheck, m, true);
		isErr = true;
	});

	// проверка на наличие автомобиля
	strSQL = "select * from "+this.tmpHZV+" where favto = 0"
	forEachSQL(strSQL, function(item)
	{
		var m = {};
		m.ORDER_ID = item.ORDER_ID;
		m.FFILE = item.FFILE;
		m.FVALUE = d_m_y(item.FDOC_DAT);
		m.DESCR = ru("заголовок заказа - не удалось установить код автомобиля для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+". Проверьте документ маршрутное задание на дату "+d_m_y(item.FDOC_DAT)
		, "заголовок замовлення - не вдалось встановити код автмобіля для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+". Перевірте документ маршрутне завдання на дату "+d_m_y(item.FDOC_DAT));
		UpdateTable(tmpCheck, m, true);
		isErr = true;
	});

	// проверка на наличие водителя
	strSQL = "select * from "+this.tmpHZV+" where fdriver = 0"
	forEachSQL(strSQL, function(item)
	{
		var m = {};
		m.ORDER_ID = item.ORDER_ID;
		m.FFILE = item.FFILE;
		m.FVALUE = d_m_y(item.FDOC_DAT);
		m.DESCR = ru("заголовок заказа - не удалось установить код водителя для заказа с идентификатором "+item.ORDER_ID+" от "+d_m_y(item.FDOC_DAT)+". Проверьте документ маршрутное задание на дату "+d_m_y(item.FDOC_DAT)
		, "заголовок замовлення - не вдалось встановити код водія для замовлення з ідентифікатором "+item.ORDER_ID+" від "+d_m_y(item.FDOC_DAT)+". Перевірте документ маршрутне завдання на дату "+d_m_y(item.FDOC_DAT));
		UpdateTable(tmpCheck, m, true);
		isErr = true;
	});

	// не должно быть одинаковых order_id
	strSQL = "select order_id, count(order_id) as fcnt from "+this.tmpHZV+" group by order_id having count(order_id) > 1"
	forEachSQL(strSQL, function(item)
	{
		var m = {};
		m.ORDER_ID = item.ORDER_ID;
		//m.FFILE = item.FFILE;
		m.FVALUE = item.FCNT;
		m.DESCR = ru("заголовок заказа - для разных документов существуют одинаковые идентификаторы, ID заказа - "+item.ORDER_ID+", количество документов - "+item.FCNT
			, "заголовок замовлення - для різних документів існують однакові ідентификатори, ID замовлення - "+item.ORDER_ID+", кількість документів - "+item.FCNT);
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
		par.message = ru("json файл содержит ошибки, импорт прерван. Обратитесь к разработчику WEB-приложения", "json файл містить помилки, імпорт перерваний. Зверніться до розробника WEB-додатку");
		par.caption = ru("Протокол ошибок json-файла", "Протокол помилок json-файлу");

		if (!isSilent)
		{
			browse(OpenTable(tmpCheck), par, SW_MODAL);
		}
		return false;
	}

	return true;
}


/*
ExecuteSQL("delete from ^rzv where fid_doc in (select fwid from ^hzv where fdoc_dat >= "+sqlTo(new Date(2020,0,1))+")");
ExecuteSQL("delete from ^hzv where fdoc_dat >= "+sqlTo(new Date(2020,0,1)));

runInThread(function()
{
try {
			include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
			var oZvImporter = new DpZvImporter();
			oZvImporter.podr = 10;
			oZvImporter.mol = 3;
			oZvImporter.inspector = 3;
			oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
			oZvImporter.load();
			oZvImporter.createZV();
} catch (ex) { globalExceptionHandler(ex); }
});
*/