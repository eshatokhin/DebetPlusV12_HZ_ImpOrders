/**
 * Функции пользователя.
 */

include("tvidos.js");
include("Objects/DpSc.js");
include("Objects/DpClcl.js");
include("servis/format.js");
include("Objects/DpNmkl.js");
include("Objects/DpObsl.js");
include("Objects/DpEdi.js");
include("Objects/DpFile.js");
include("Objects/DpExtension.js");
include("servis/date.js");
include("Objects/DpVal.js");
include("Objects/DpAnDat.js");
include("sys/kursval.js");
include("servis/barCode.js");
include("tvidos.js");
include("izosdat.js");
include("izosdatb.js");
include("izos0b.js");
include("izos0.js");
include("izvnpr.js");
include("izvnprdt.js");
include("sub/mtr.js");
include("sub/bil.js");
include("servis/zrp.js");
include("servis/uos.js");
include("r_sredsp.js");
include("sys/docinfo.js");	//для getDocTblName()
include("sys/Args.js");
include("sys/linq.js");
include("sys/progress.js");
include("sys/Regex.js");

includeModulesUDFS();

/**
  * Выравнивание суммы НДС в проводке документа.
  * Для этого сравнивается сумма НДС документа с суммой НДС в проводках
  * @param {string} mode - "db", "cr" - счет НДС по дебету или по кредиту в проводке
  * @param {number} mFwid - fwid документа
  * @param {number} sc - счет налогового обязательства/кредита
  * @param {number} su - субсчет налогового обязательства/кредита
  * @param {number} st - статья налогового обязательства/кредита
  * @param {string} provTxtPrefix - текст, который будет дописан в соержимом операции в начале
  */
function correct_prov_nds(mode, mFwid, sc, su, st, provTxtPrefix)
{
	var args = Args([
		{mode: Args.STRING | Args.Required},
		{mFwid: Args.INT | Args.Required},
		{sc: Args.INT | Args.Required},
		{su: Args.INT | Args.Optional, _default: 0},
		{st: Args.INT | Args.Optional, _default: 0},
		{provTxtPrefix: Args.STRING | Args.Optional, _default: ""},
	], arguments);

	su = args.su;
	st = args.st;

	// проверим, есть ли нужная проводка к документу, и если ее нет, то дальше и делать нечего
	var strSQL = "select max(s.fwid) as fwid from ^schet s"
				+" where s.fid_doc = "+sqlTo(mFwid)
					+" and s.f"+mode+"_sc = "+sqlTo(sc)
					+" and s.f"+mode+"_su = "+sqlTo(su)
					+" and s.f"+mode+"_st = "+sqlTo(st)
	//browse(strSQL, [], SW_MODAL);
	var sn = snapRecord(strSQL);
	if (!sn)
	{
		return false;
	}

	// сумма НДС в документе
	strSQL = "select fnds from ^sch_zag where fwid = "+sqlTo(mFwid)
	var sn = snapRecord(strSQL);
	var sumNdsDoc = 0;
	var sumNdsProv = 0;
	if (sn)
	{
		sumNdsDoc = sn.FNDS;
	}

	// сумма НДС в проводках
	var strSQL = "select sum(fsum) as fnds from ^schet"
				+" where fid_doc = "+sqlTo(mFwid)
					+" and f"+mode+"_sc = "+sqlTo(sc)
					+" and f"+mode+"_su = "+sqlTo(su)
					+" and f"+mode+"_st = "+sqlTo(st)
	var sn = snapRecord(strSQL);
	if (sn)
	{
		sumNdsProv = sn.FNDS;
	}

	// если есть разница - то скопируем проводку с максимальным fwid'ом на сумму разницы
	var sumDiff = sumNdsDoc - sumNdsProv;
	if (sumDiff != 0)
	{
		var fldList = GetPatternIntersection("schet", "schet", null, ["fsum", "fwid"]);

		// нам нужна только одна проводка для копирования, чтобы не изголяться с TOP и LIMIT
		// для разных СУБД, найдем ее fwid
		strSQL = "select max(fwid) as fwid"
				+" from ^schet s"
				+" where fid_doc = "+sqlTo(mFwid)
					+" and f"+mode+"_sc = "+sqlTo(sc)
					+" and f"+mode+"_su = "+sqlTo(su)
					+" and f"+mode+"_st = "+sqlTo(st)
		var sn = snapRecord(strSQL);
		var provID = 0;
		if (sn)
		{
			provID = sn.FWID;
		}

		//добавляем проводку
		var newProvID = GetUID();
		strSQL = "insert into ^schet ("+fldList+", fsum, fwid)"
				+" select "+fldList
					+", "+sqlTo(sumDiff)+" as fsum"
					+", "+sqlTo(newProvID)+" as fwid"
				+" from ^schet s"
				+" where 1=1"
					+" and fwid = "+sqlTo(provID)
		ExecuteSQL(strSQL);

		// допишем в текстовку проводки что это корректировка
		if (!isEmpty(provTxtPrefix))
		{
			strSQL = "update ^schet"
					+" set ftxt = "+SqlConCat(sqlTo(provTxtPrefix), sqlTo(" "), "ftxt")
					+" where 1=1"
						+" and fwid = "+sqlTo(newProvID)
			ExecuteSQL(strSQL);
		}
	}
}