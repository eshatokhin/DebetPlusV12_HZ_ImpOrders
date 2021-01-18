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

	pClparam.addItem("PARAMS", UR("Параметри|Параметры"), true);
	this.selHandler = selHandler;
	pClparam.setSelectHandler(this, "selHandler");
}

function selHandler(sID, oPanel)
{
	switch(sID)
	{
		case "IMP":
			include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
			runInThread(function()
			{
				//runWithStatus(ru("Выполняется загрука данных...", "Виконується завантаження даних..."), function()
				//{
					include("Objects/DpAskEx.js");
					var oA = new DpAskEx();
					oA.add("CL", "Підрозділ|Подразделение", "PODR", getPar("HZ_COD_PODR"), sprPodr);
					oA.add("CL", "МВО|МОЛ", "MOL", getPar("HZ_COD_MOL"), getPar("CODMOL", "MTR"));
					oA.add("CL", "Контролер|Контролер", "INSPECTOR", 0, getPar("CODPERS"));
					oA.doAsk();

					if (oA.escape)
					{
						return false;
					}

					var oZvImporter = new DpZvImporter();
					oZvImporter.podr = oA.get("PODR").getCod();
					oZvImporter.mol = oA.get("MOL").getCod();
					oZvImporter.inspector = oA.get("INSPECTOR").getCod();

					oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
					oZvImporter.load();
					oZvImporter.createZV();
				//});
			});
		break;
	}

	return true;
}

include("sys/DpBaseDlg.js");