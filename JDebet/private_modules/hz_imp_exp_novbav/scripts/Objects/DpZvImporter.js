include("sys/File.js");
include("json2.js");
include("sys/Path.js");

function DpZvImporter(path)
{
	RO("DpZvImporter", this);
	this.load = DpZvImporter_load;
	this.createZV = DpZvImporter_createZV;

	this.path = path;
	this.tmpHZV = "";
	this.tmpRZV = "";
}

function DpZvImporter_load()
{
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
	this.tmpHZV = getTmpTableName();
	this.tmpRZV = getTmpTableName();
	createTables(this.tmpHZV, this.tmpRZV);

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

	this.createZV(this.tmpHZV, this.tmpRZV);
}

/**
 * создание таблиц заголовка и строк заказов, чтобы туда прочитать содержимое JSON файлов
 */
function createTables(tblH, tblR)
{
	// таблица заголовков
	var fld = {};
	fld.FDOC_DAT = "DATE";
	fld.FDBKR = "LONG";
	fld.FSHOP = "LONG";
	fld.ORDER_ID = "LONG";
	fld.FFILE = "TEXT";
	fld.FWID = "LONG";
	CreateTable(tblH, fld);

	// таблица строк
	var fld = {};
	fld.FNMKL = "TEXT";
	fld.FNMKL_ID = "LONG";
	fld.FKOL = "DOUBLE";
	fld.ORDER_ID = "LONG";
	fld.FID_DOC = "LONG";
	fld.FWID = "LONG";
	CreateTable(tblR, fld);

	return true;
}

function DpZvImporter_createZV(tblH, tblR)
{
	// установим ID номенклатуры
	strSQL = "UPDATE "+tblR
			+" SET FNMKL_ID = ("
				+" SELECT FWID FROM ^CL_NMK"
				+" WHERE FCOD = "+tblR+".FNMKL"
			+")"
			+" WHERE EXISTS ("
				+" SELECT 1 FROM ^CL_NMK"
				+" WHERE FCOD = "+tblR+".FNMKL"
			+")"
	ExecuteSQL(strSQL);

	// fwid'ы заголовка и строк
	resetTableUids(tblH, "FWID");
	resetTableUids(tblR, "FWID");

	strSQL = "UPDATE "+tblR
			+" SET FID_DOC = ("
				+" SELECT FWID FROM "+tblH
				+" WHERE ORDER_ID = "+tblR+".ORDER_ID"
			+")"
			+" WHERE EXISTS ("
				+" SELECT FWID FROM "+tblH
				+" WHERE ORDER_ID = "+tblR+".ORDER_ID"
			+")"
	ExecuteSQL(strSQL);

	// проанализируем, есть ли в базе заказы, которые есть в json-файле
	var aDocs = [];
	var tmpExists = getTmpTableName();
	strSQL = "SELECT FDOC_NUM, FDOC_DAT, FNOP, FWID"
			+" INTO "+tmpExists
			+" FROM ^HZV"
			+" WHERE FOUTID IN ("
				+" SELECT ORDER_ID FROM "+tblH
			+" )"
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
			+"\nВот список одинаковых заказов:"
			+"\n"+aDocs.join("; ")
		alert(strMsgRu);

		if (!confirm(ru("Продолжить создание заказов?", "Продовжити створення замовлень?")))
		{
			return false;
		}
	}

	// не импортируем то, что уже есть в базе

	DropTable(tmpExists);
}

/*
try {
			include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
			runInTransaction(function()
			{
				var oZvImporter = new DpZvImporter();
				oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
				oZvImporter.load();
			});
} catch (ex) { globalExceptionHandler(ex); }
*/