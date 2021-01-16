function buildPanel()
{
	Caption(UR("Імпорт/експорт даних|Импорт/экспорт данных"));

	loadImpPanel();
	//loadExpPanel();
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

function loadExpPanel()
{
	pClparam = PANELBAR.createPanel();
	pClparam.setCaption(UR("Обмін даними|Обмен данными"));

	pClparam.addItem("EXP_ARCH", UR("Відправити архів|Отправить архив"), true);
	pClparam.addItem("PROT", UR("Протокол відправки|Протокол отправки"), true);
	this.selHandler = selHandler;
	pClparam.setSelectHandler(this, "selHandler");
}

function loadParamPanel()
{
	pClparam = PANELBAR.createPanel();
	pClparam.setCaption(UR("Сервіс|Сервис"));

	//pClparam.addItem("UPDATE_LOG", UR("Журнал оновлень|Журнал обновлений"), true);
	pClparam.addItem("PARAMS", UR("Параметри|Параметры"), true);
	this.selHandler = selHandler;
	pClparam.setSelectHandler(this, "selHandler");
}

function selHandler(sID, oPanel)
{
	var sDlg = "";
	var par = new Object();
	var sType = SW_NOMODAL;

	switch(sID)
	{
		case "PARAMS":
			sType = SW_MODAL;
			par.sel = "UPD";
			sDlg = "e_param.xml";
		break;
		case "IMP":
			include("hz_imp_exp_novbav:Objects/DpZvImporter.js");
			runInTransaction(function()
			{
				var oZvImporter = new DpZvImporter();
				oZvImporter.path = getPar("HZ_IMP_EXP_NOVBAV_MOBAPP_ZV_DIR");
				oZvImporter.load();

			});
		break;
		case "UNPACK":
			sType = SW_NOMODAL;
			sDlg = "upd:unpack_updates.js";
		break;
		case "EXP_ARCH":
			sType = SW_NOMODAL;
			par.menuMode = "CALC";
			sDlg = "upd:l_ftp.js";
		break;
		case "PROT":
			sType = SW_NOMODAL;
			par.menuMode = "VIEW";
			sDlg = "upd:l_ftp.js";
		break;
		case "UPDATE_LOG":
			sType = SW_NOMODAL;
			par.menuMode = "updates";
			sDlg = "logger:l_viewlog.xml";
		break;
		default:
			return;
		break;
	}

	showWindow(sDlg, sType, par);

	return true;
}

include("sys/DpBaseDlg.js");