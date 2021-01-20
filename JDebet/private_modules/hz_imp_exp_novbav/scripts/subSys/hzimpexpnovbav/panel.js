include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
include("sys/File.js");
include("sys/Path.js");

function buildPanel()
{
	Caption(UR("Імпорт/експорт даних|Импорт/экспорт данных"));

	loadImpPanel();
	loadParamPanel();
}

function loadImpPanel()
{
	pClparam = PANELBAR.createPanel();
	pClparam.setCaption(UR("Імпорт даних|Импорт данных"));
	pClparam.addItem("IMP", UR("Імпорт замовлень з JSON-файлу мобільного додатку \"Debet+ connector\"|Импорт данных из JSON-файла мобильного приложения \"Debet+ connector\""), true);
	this.selHandler = selHandler;
	pClparam.setSelectHandler(this, "selHandler");
}

function loadParamPanel()
{
	pClparam = PANELBAR.createPanel();
	pClparam.setCaption(UR("Сервіс|Сервис"));

	pClparam.addItem("COMPARE", UR("Порівняти дані документів \"Замовлення\" та json-файлу|Сравнить данные документов \"Заказ\" та json-файла"), true);
	pClparam.addItem("PARAMS", UR("Параметри|Параметры"), true);
	this.selHandler = selHandler;
	pClparam.setSelectHandler(this, "selHandler");
}

function selHandler(sID, oPanel)
{
	switch(sID)
	{
		case "IMP":
			runInThread(function()
			{
					var dstPath = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR_PROCESSED");
					createDirectory(dstPath);
					var isDstPath = new DpFile(dstPath).isDirectory();
					if (!isDstPath)
					{
						throw new Error(ru("Не удалось создать папку для копирования обработанных файлов заказов "+dstPath+". Импорт прерван")
						, "Не вдалось створити папку для копіювання оброблених файлів замовлень "+dstPath+". Імпорт перерваний")
					}

					var oZvImporter = new DpZvImporter();

					oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
					var aFiles = oZvImporter.load();
					var bSuccess = oZvImporter.createZV();

					// если заявки созданы, то перемещаем файлы в папку processed
					if (bSuccess)
					{
						for (var i in aFiles)
						{
							runInTransaction(function()
							{
								File.copy(aFiles[i], Path.combine(dstPath, Path.getFileName(aFiles[i])));
								File.remove(aFiles[i]);
							});
						}
					}
			});
		break;

		case "COMPARE":
			var oZvImporter = new DpZvImporter();
			oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
			oZvImporter.compare();
			break;
		case "PARAMS":
			var par = new Object();
			sType = SW_MODAL;
			par.sel = "UPD";
			sDlg = "e_param.xml";
			showWindow(sDlg, sType, par);
			break;
	}

	return true;
}

include("sys/DpBaseDlg.js");