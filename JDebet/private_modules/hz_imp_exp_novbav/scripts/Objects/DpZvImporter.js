include("sys/File.js");
include("json2.js");
include("sys/Path.js");

function DpZvImporter(path)
{
	this.load = DpZvImporter_load;
	this.createZV = DpZvImporter_createZV;
	this.createTables = DpZvImporter_createTables;
	this.checkValid = DpZvImporter_checkValid;

	this.path = path;

	this.tmpHZV = getTmpTableName();
	this.tmpRZV = getTmpTableName();
	this.defForm = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DEF_FRM");
}

/**
 * Загрузка данных json-файла в таблицы this.tmpHZV (заголовки) и this.tmpRZV (строки)
 */
function DpZvImporter_load()
{
	if (isEmpty(this.path))
	{
		throw new Error(ru("Не указан путь к json-файлу, импорт прерван.", "Не вказаний шлях до json-файлу, імпорт перерваний."));
	}

	if (isEmpty(this.defForm))
	{
		throw new Error(ru("Не указано значение формы по-умолчанию в параметрах системы, импорт прерван.", "Не вказано значення форми за замовчуванням в параметрах системи, імпорт перерваний."));
	}

	// определимся что нам передали: файл или папку с файлами
	var isDirectory = new DpFile(this.path).isDirectory();

	var aFiles = [];
	// если передали папку, то запишем в массив все файлы этой папки
	if (isDirectory)
	{
		Directory.walkFiles(this.path, function(filePath)
		{
			aFiles.push(String(filePath.getAbsolutePath()));
		}, null, null, 0);
	}
	else
	{
		aFiles.push(this.path);
	}

	if (aFiles.length == 0)
	{
		return false;
	}

	// создадим таблицы заголовка и строк заказов, чтобы туда прочитать содержимое файлов
	this.createTables();

	for (var i in aFiles)
	{
		var filePath = aFiles[i];

		// обрабатываем только *.json файлы
		if (!Path.getExtension(filePath).equalsIgnoreCase(".json"))
		{
			continue;
		}

		var fileName = Path.getFileName(filePath);

		var fileText = File.readAllText(filePath);
		var arr = JSON.parse(fileText, JSON.dateTimeReviver);
		for (var h in arr)
		{
			var aHeaderEntities = [];
			for (var doc in arr[h])
			{
				var oHeader_row = arr[h][doc];
				var m = {};
				var mOrderId = 0;
				for (var fld in oHeader_row)
				{
					if (!fld.equalsIgnoreCase("ROWS"))
					{
						// заголовки
						m[fld] = oHeader_row[fld];

						// запомним ID заголовка, чтобы его записать строкам
						if (fld.equalsIgnoreCase("ORDER_ID"))
						{
							mOrderId = m[fld];
						}

						// запомним имя файла, из которого выполняется импорт
						m["FFILE"] = fileName;
						m["JSON_FDOC_DAT"] = String(oHeader_row["FDOC_DAT"]);
						m["JSON_FDBKR"] = oHeader_row["FDBKR"];
						m["JSON_FSHOP"] = oHeader_row["FSHOP"];

						// валидность даты
						var jsonDat = new Date(oHeader_row["FDOC_DAT"]);
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
						var dbkr = oHeader_row["FDBKR"];
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
						var dbkr = oHeader_row["FSHOP"];
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
						var oRows = oHeader_row[fld]
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
						insertIntoTable(this.tmpRZV, aRowEntities);
					}
				}
				aHeaderEntities.push(m);
			}
			insertIntoTable(this.tmpHZV, aHeaderEntities);
		}
	}

	this.createZV();
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

	var def = {};
	def.FDOC_DAT_VALID = true;
	def.FDBKR_VALID = true;
	def.FSHOP_VALID = true;
	CreateTable(this.tmpHZV, fld, {}, def);

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

	var def = {};
	def.FKOL_VALID = true;
	CreateTable(this.tmpRZV, fld, {}, def);

	return true;
}

/**
 * Создание документа ZV - заказ
 */
function DpZvImporter_createZV()
{
	// проверим валидность полей
	this.checkValid();

	// установим ID номенклатуры
	strSQL = "UPDATE "+this.tmpRZV
			+" SET FNMKL_ID = ("
				+" SELECT FWID FROM ^CL_NMK"
				+" WHERE FCOD = "+this.tmpRZV+".FNMKL"
			+")"
			+" WHERE EXISTS ("
				+" SELECT 1 FROM ^CL_NMK"
				+" WHERE FCOD = "+this.tmpRZV+".FNMKL"
			+")"
	ExecuteSQL(strSQL);

	// fwid'ы заголовка и строк
	resetTableUids(this.tmpHZV, "FWID");
	resetTableUids(this.tmpRZV, "FWID");

	strSQL = "UPDATE "+this.tmpRZV
			+" SET FID_DOC = ("
				+" SELECT FWID FROM "+this.tmpHZV
				+" WHERE ORDER_ID = "+this.tmpRZV+".ORDER_ID"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FWID FROM "+this.tmpHZV
				+" WHERE ORDER_ID = "+this.tmpRZV+".ORDER_ID"
			+")"
	ExecuteSQL(strSQL);

	// проанализируем, есть ли в базе заказы, которые есть в json-файле
	var aDocs = [];
	var tmpExists = getTmpTableName();
	strSQL = "SELECT DISTINCT H.FDOC_NUM, H.FDOC_DAT, H.FNOP, TMP.FWID"
			+" INTO "+tmpExists
			+" FROM ^HZV H INNER JOIN "+this.tmpHZV+" TMP ON H.FOUTID = TMP.ORDER_ID"
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
	strSQL = "DELETE FROM "+this.tmpHZV
			+" WHERE FWID IN ("
				+" SELECT FWID FROM "+tmpExists
			+")"
	ExecuteSQL(strSQL);

	strSQL = "DELETE FROM "+this.tmpRZV
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
	CreateTable(tmpNop, fld);

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
	CreateTable(tmpTuneAll, fld);
	CreateTable(tmpTune, fld);

	for (var dbkr in aDbkrFlds)
	{
		strSQL = "INSERT INTO "+tmpTuneAll+" (FDBKR, FDOC_DAT)"
				+" SELECT DISTINCT "+aDbkrFlds[dbkr]+" AS FDBKR, FDOC_DAT "
				+" FROM "+this.tmpHZV
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
			+" SET FFORM = "+sqlTo(this.defForm)
			+" WHERE EXISTS (SELECT FDBKR, FFORM FROM "+tmpEmpty
				+" WHERE FDBKR = "+tmpNop+".FDBKR"
					+" AND FFORM = "+tmpNop+".FFORM"
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
			+" SET FFORM = "+sqlTo(this.defForm)
			+" WHERE FFORM = 0"
	ExecuteSQL(strSQL);

/*
	for (var i = 0; i <= 6; i++)
	{
		if (!isEmpty(tblExtName42) && !isEmpty(tblExtName12))
		{
			// для FDBKR (покупатель) и FSHOP (магазин)
			for (var dbkr in aDbkrFlds)
			{
				strSQL = "INSERT INTO "+tmpNop+" (FFORM, FFORM_TXT, FDAY, FDOC_DAT, FNOP, FWID_CL_42, FDBKR)"
						+" SELECT L42.FCOD AS FFORM, L42.FTXT AS FFORM_TXT"
							+", "+sqlTo(i)+" AS FDAY"
							+", H.FDOC_DAT"
							+", 0 as FNOP, L42.FWID_CL AS FWID_CL_42"
							+", H."+aDbkrFlds[dbkr]
						+" FROM "+this.tmpHZV+" H"
							+" INNER JOIN ^LISTCL L12 ON H."+aDbkrFlds[dbkr]+" = L12.FCOD AND L12.FCL = "+sqlTo(sprOrg)
							+" INNER JOIN "+tblExtName12+" EXT12 ON L12.FWID_CL = EXT12.FMAINWID"
							+" INNER JOIN ^LISTCL L42 ON L42.FCOD = EXT12.FFORM_"+String(i)+" AND L42.FCL = "+sqlTo(sprVD)
				ExecuteSQL(strSQL);
			}
		}
	}

	//browse(tmpNop);
*/
	/*
	var tmpDays = getTmpTableName();
	strSQL = "SELECT S.FDBKR, MAX(S.FDAY) AS FDAY"
			+" INTO "+tmpDays
			+" FROM "+tmpNop+" S"
			+" WHERE S.FDAY <= S.FDAY_DOC_DAT"
			+" GROUP BY S.FDBKR"
	ExecuteSQL(strSQL);

	strSQL = "UPDATE "+tmpNop
			+" SET FFORM_FOR_DOC = ("
				+" SELECT DISTINCT T.FFORM FROM "+tmpNop+" T"
					+" INNER JOIN "+tmpDays+" D ON T.FDBKR = D.FDBKR  AND T.FDAY = D.FDAY"
				+" WHERE "+tmpNop+".FDBKR = T.FDBKR AND "+tmpNop+".FDAY = T.FDAY"
			+")"
			+" WHERE EXISTS ("
				+" SELECT 1 FROM "+tmpNop+" T"
					+" INNER JOIN "+tmpDays+" D ON T.FDBKR = D.FDBKR  AND T.FDAY = D.FDAY"
				+" WHERE "+tmpNop+".FDBKR = T.FDBKR AND "+tmpNop+".FDAY = T.FDAY"
			+")"
	ExecuteSQL(strSQL);

	browse(tmpDays)
*/
/*
	// также добавим форму, указанную в параметрах системы
	var m = {};
	m.FFORM = this.defForm;
	UpdateTable(tmpNop, m, true);

	strSQL = "UPDATE "+tmpNop
			+" SET FFORM_TXT = ("
				+" SELECT FTXT FROM ^LISTCL WHERE "+tmpNop+".FFORM = FCOD AND FCL = "+sqlTo(sprVD)
			+")"
			+", FWID_CL_42 = ("
				+" SELECT FWID_CL FROM ^LISTCL WHERE "+tmpNop+".FFORM = FCOD AND FCL = "+sqlTo(sprVD)
			+")"
			+" WHERE EXISTS ("
				+" SELECT 1 FROM ^LISTCL WHERE "+tmpNop+".FFORM = FCOD AND FCL = "+sqlTo(sprVD)
			+")"
	ExecuteSQL(strSQL);
*/

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

	strSQL = "UPDATE "+this.tmpHZV
			+" SET FNOP = ("
				+" SELECT FNOP FROM "+tmpTune
				+" WHERE FDBKR = "+this.tmpHZV+".FDBKR"
					+" AND FDOC_DAT = "+this.tmpHZV+".FDOC_DAT"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FNOP FROM "+tmpTune
				+" WHERE FDBKR = "+this.tmpHZV+".FDBKR"
					+" AND FDOC_DAT = "+this.tmpHZV+".FDOC_DAT"
			+")"
	ExecuteSQL(strSQL);

	// создание самой заявки


	browse(tmpTune)
	// browse("SELECT * FROM "+tmpNop+" ORDER BY FDBKR, FDAY")
	 browse(this.tmpHZV)
	// browse(this.tmpRZV)

	DropTable(tmpExists);
}

/**
 * Проверка корректности значений полей json-файла
 */
function DpZvImporter_checkValid()
{
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
		browse(OpenTable(tmpCheck), par, SW_MODAL);
		throw new Error(par.message);
	}

	return true;
}
/*
runInThread(function()
{
try {
	include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
	var oZvImporter = new DpZvImporter();
	oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
	oZvImporter.load();
} catch (ex) { globalExceptionHandler(ex); }
});

*/