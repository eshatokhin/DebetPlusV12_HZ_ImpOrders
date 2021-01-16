include("sys/File.js");
include("json2.js");
include("sys/Path.js");

function DpZvImporter(path)
{
	this.load = DpZvImporter_load;
	this.createZV = DpZvImporter_createZV;
	this.createTables = DpZvImporter_createTables;

	this.path = path;

	this.tmpHZV = getTmpTableName();
	this.tmpRZV = getTmpTableName();
}

function DpZvImporter_load()
{
	if (isEmpty(this.path))
	{
		throw new Error(ru("Не указан путь к json-файлу, импорт прерван.", "Не вказаний шлях до json-файлу, імпорт перерваний."));
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
	fld.FDBKR = "LONG";
	fld.FSHOP = "LONG";
	fld.ORDER_ID = "LONG";
	fld.FFILE = "TEXT";

	fld.FDRIVER = "LONG";
	fld.FPODR = "LONG";
	fld.FEXPED = "LONG";
	fld.FMOL = "LONG";
	fld.FAVTO = "LONG";
	fld.FTIME = "DATETIME";
	fld.FROUTE = "LONG";
	fld.FLYST = "TEXT";
	fld.FINSPECTOR = "LONG";

	fld.FWID = "LONG";
	CreateTable(this.tmpHZV, fld);

	// таблица строк
	var fld = {};
	fld.FNMKL = "TEXT";
	fld.FNMKL_ID = "LONG";
	fld.FKOL = "DOUBLE";
	fld.ORDER_ID = "LONG";
	fld.FID_DOC = "LONG";
	fld.FWID = "LONG";
	CreateTable(this.tmpRZV, fld);

	return true;
}

function DpZvImporter_createZV()
{
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

	// проставляем остальные данные, которые есть в документе ZV

	// форма
	var sprVD = 42;
	var tblExtName42 = new DpExtensionManager("CL", sprVD).getFullValueTableName();
	var tblExtName12 = new DpExtensionManager("CL", sprOrg).getFullValueTableName();

	var tmpNop = getTmpTableName();
	var fld = {};
	fld.FFORM = "LONG";
	fld.FFORM_TXT = "TEXT";
	fld.FNOP = "LONG";
	fld.FWID = "COUNTER";
	CreateTable(tmpNop, fld);

	for (var i = 0; i <= 6; i++)
	{
		if (!isEmpty(tblExtName42) && !isEmpty(tblExtName12))
		{
			strSQL = "INSERT INTO "+tmpNop+" (FFORM, FFORM_TXT, FNOP)"
					+" SELECT L42.FCOD AS FFORM, L42.FTXT AS FFORM_TXT"
						+", EXT42.FNOP"
					+" FROM "+this.tmpHZV+" H"
						+" INNER JOIN ^LISTCL L12 ON H.FDBKR = L12.FCOD AND L12.FCL = "+sqlTo(sprOrg)
						+" INNER JOIN "+tblExtName12+" EXT12 ON L12.FWID_CL = EXT12.FMAINWID"
						+" INNER JOIN ^LISTCL L42 ON L42.FCOD = EXT12.FORM"+String(i)+" AND L42.FCL = "+sqlTo(sprVD)
						+" INNER JOIN "+tblExtName42+" EXT42 ON L42.FWID_CL = EXT42.FMAINWID"
			ExecuteSQL(strSQL);
		}
	}
	DropTable(tmpExists);
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