include("Objects/DpAskEx.js");

function userMenuLoad()
{
	if (String(extPar.doc).equalsIgnoreCase("NK"))
	{
		var oServiceMenu = DataSource().getMenuByID("DOCSERVIS");
		if (oServiceMenu)
		{
			oServiceMenu.AddMenuItem("CORRECT_PROV_NDS", "Виправити похибки заокруглення ПДВ в проводках|Исправить ошибки округления в проводках");
		}
	}
}

function userMenuRun(nID)
{
	switch(nID)
	{
		case "CORRECT_PROV_NDS":
			var sc = 64;
			var su = 0;
			var st = 0;

			var txtSc = "";

			switch (String(extPar.doc))
			{
				case "NK":
					txtSc = ru("Счет налогового обязательства", "Рахунок податкового зобов'язання");
					sc = 64; su = 643; st = 0;
					break;
				case "PN":
					txtSc = ru("Счет налогового кредита", "Рахунок податкового кредиту");
					sc = 64; su = 644; st = 0;
					break;
				default:
					txtSc = ru("Счет налогового обязательства/кредита", "Рахунок податкового зобов'язання/кредиту");
					break;
			}

			var oA = new DpAskEx();
			oA.add("CUT", txtSc, "SC", sc+"|"+su+"|"+st);
			oA.doAsk();

			if (oA.escape)
			{
				return false;
			}

			var oSc = oA.get("SC");

			var strSQL = "select fwid from ^sch_zag where "+ds.sqlSelected()

			forEachSQL(strSQL, function(item)
			{
				correct_prov_nds("cr", item.FWID, oSc.sc, oSc.su, oSc.st, "Виправлення похибки заокруглення ПДВ.");
			});

			alert(ru("Выполнено!", "Виконано!"));

			break;
	}
}