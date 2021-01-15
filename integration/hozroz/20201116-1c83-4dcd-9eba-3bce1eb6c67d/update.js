//sup-81303
function do_update(update)
{
	include("upd:Objects/DpUpdate.js");
	include("sys/dbmain.js");
	include("sys/servis.js");
	include("sys/udfs.js");
	include("sys/Path.js");						// работа с путями файловой системы
	include("sys/linq.js");						// LINQ-аналог
	include("Objects/DpAdministration.js");		// управление пользователями и группами (JDebet\administration.xml)
	include("Objects/DpPermissions.js");		// управление полномочиями (JDebet\proxy_group.xml)
	include("Objects/DpExtension.js");			// управление расширениями (base\org*\settings\extentions)
	include("Objects/DpOperationEx.js");		// управление операциями (base\org*\settings\operations)
	include("Objects/DpVarDef.js");				// управление значениями по умолчанию (base\org*\settings\vardef)
	include("Objects/DpUserVars.js");			// управление пользовательскими переменными документов (base\org*\settings\docvars)
	include("Objects/DpCalculation.js");		// управление калькуляциями (base\org*\settings\calculations)
	include("Objects/DpCl.js");
	include("Objects/DpConst.js");
	include("Objects/DpSc.js");
	include("Objects/DpFwidUpdater.js");
	include("doc/DpDoc.js");
	include("settings_imp.js");


	var par = new Object();
	var oUpd = new DpUpdate();
	oUpd.isSilent = true;	// режим тихого выполнения (алерты и прочее только в случае ошибок)

	// %cut start%
	//sup-81303
	var aDocs = ["PP", "PV"];
	var reScFinReplace =/\bSCFIN\b/gi;

	aDocs.forEach(function(mFdoc)
	{
		var ol = new DpOperationList(mFdoc);
		ol.load();
		ol.loadDetails();

		var aOper = ol.getOperations();
		aOper.forEach(function(oper)
		{
			var mFnop = Number(oper.nop);
			var aProv = oper.getAllProv();
			aProv.forEach(function(prov)
			{
				var section = prov.section;
				for (var i = 1; i <= 6; i++)
				{
					// заменяем в аналитиках переменную SCFIN на HSCFIN
					prov["db_cod"+i] = prov["db_cod"+i].replace(reScFinReplace, "HSCFIN");
					prov["cr_cod"+i] = prov["cr_cod"+i].replace(reScFinReplace, "HSCFIN");

					// в аналитики проводок, не касающихся кассовых расходов, надо добавить пару для определения банковского счета
					// так как есть те, кто додумался на 7-м классе вести в виде аналитики банковский счет
					// пара значений добавляется после пары "sprOrg, HORG"
					// меняем 2 проводки, (для заголовков) и (для строк, где счет берется из заголовка)
					if (mFdoc.equalsIgnoreCase("PP") && mFnop == 100)
					{
						if (prov.db_sc.equalsIgnoreCase("HSC")
							&& prov.db_su.equalsIgnoreCase("HSU")
							&& prov.db_st.equalsIgnoreCase("HST")
						)
						{
							var re = /\s*sprOrg\s*,\s*HORG\s*(?!\s*,\s*53\s*,\s*\(\s*HSC\s*==\s*31\s*\?\s*GT_RASSC\s*\(\s*["']COD["']\s*\+\s*tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*HSC\s*,\s*HSU\s*,\s*HST\s*,\s*53\s*\)\s*,\s*HCRSC\s*,\s*HMFOTO\s*,\s*HVAL\s*\)\s*:\s*GT_RASSC\s*\(\s*["']COD["']\+tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*ASC\s*,\s*ASU\s*,\s*AST\s*,\s*53\s*\)\s*,\s*HDBSC\s*,\s*HMFOOT\s*,\s*HVAL\s*\)\s*\)s*)/gi
							var dstExpr = " sprOrg, HORG, 53, (HSC==31 ? GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", HSC, HSU, HST , 53), HCRSC, HMFOTO, HVAL) : GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", ASC, ASU, AST, 53), HDBSC, HMFOOT, HVAL))";
							prov["db_cod"+i] = prov["db_cod"+i].replace(re, dstExpr);
						}
						else if (prov.db_sc.equalsIgnoreCase("PAR.HSC")
							&& prov.db_su.equalsIgnoreCase("PAR.HSU")
							&& prov.db_st.equalsIgnoreCase("PAR.HST")
						)
						{
							var re = /\s*sprOrg\s*,\s*PAR\.HORG\s*(?!\s*53\s*,\s*\(\s*PAR\.HSC\s*==\s*31\s*\?\s*GT_RASSC\s*\(\s*["']COD["']\s*\+\s*tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*PAR\.HSC\s*,\s*PAR\.HSU\s*,\s*PAR\.HST\s*,\s*53\s*\)\s*,\s*PAR\.HCRSC\s*,\s*PAR\.HMFOTO\s*,\s*PAR\.HVAL\s*\)\s*:\s*GT_RASSC\s*\(\s*["']COD["']\+tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*ASC\s*,\s*ASU\s*,\s*AST\s*,\s*53\s*\)\s*,\s*PAR\.HDBSC\s*,\s*PAR\.HMFOOT\s*,\s*PAR\.HVAL\s*\)\s*\)s*)/gi
							var dstExpr = " sprOrg, PAR.HORG, 53, (PAR.HSC==31 ? GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", PAR.HSC, PAR.HSU, PAR.HST , 53), PAR.HCRSC, PAR.HMFOTO, PAR.HVAL) : GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", ASC, ASU, AST, 53), PAR.HDBSC, PAR.HMFOOT, PAR.HVAL))";
							prov["db_cod"+i] = prov["db_cod"+i].replace(re, dstExpr);
						}
					}

					if (mFdoc.equalsIgnoreCase("PV") && mFnop == 100)
					{
						if (prov.cr_sc.equalsIgnoreCase("HSC")
							&& prov.cr_su.equalsIgnoreCase("HSU")
							&& prov.cr_st.equalsIgnoreCase("HST")
						)
						{
							var re = /\s*sprOrg\s*,\s*HORG\s*(?!\s*53\s*,\s*\(\s*HSC\s*==\s*31\s*\?\s*GT_RASSC\s*\(\s*["']COD["']\s*\+\s*tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*HSC\s*,\s*HSU\s*,\s*HST\s*,\s*53\s*\)\s*,\s*HDBSC\s*,\s*HMFOOT\s*,\s*HVAL\s*\)\s*:\s*GT_RASSC\s*\(\s*["']COD["']\+tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*ASC\s*,\s*ASU\s*,\s*AST\s*,\s*53\s*\)\s*,\s*HCRSC\s*,\s*HMFOTO\s*,\s*HVAL\s*\)\s*\)s*)/gi
							var dstExpr = " sprOrg, HORG, 53, (HSC==31 ? GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", HSC, HSU, HST , 53), HDBSC, HMFOOT, HVAL) : GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", ASC, ASU, AST, 53), HCRSC, HMFOTO, HVAL))";
							prov["cr_cod"+i] = prov["cr_cod"+i].replace(re, dstExpr);
						}
						else if (prov.cr_sc.equalsIgnoreCase("PAR.HSC")
							&& prov.cr_su.equalsIgnoreCase("PAR.HSU")
							&& prov.cr_st.equalsIgnoreCase("PAR.HST")
						)
						{
							var re = /\s*sprOrg\s*,\s*PAR\.HORG\s*(?!\s*53\s*,\s*\(\s*PAR\.HSC\s*==\s*31\s*\?\s*GT_RASSC\s*\(\s*["']COD["']\s*\+\s*tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*PAR\.HSC\s*,\s*PAR\.HSU\s*,\s*PAR\.HST\s*,\s*53\s*\)\s*,\s*PAR\.HDBSC\s*,\s*PAR\.HMFOOT\s*,\s*PAR\.HVAL\s*\)\s*:\s*GT_RASSC\s*\(\s*["']COD["']\+tfsc\s*\(\s*["']ANLEVEL["']\s*,\s*ASC\s*,\s*ASU\s*,\s*AST\s*,\s*53\s*\)\s*,\s*PAR\.HCRSC\s*,\s*PAR\.HMFOTO\s*,\s*PAR\.HVAL\s*\)\s*\)s*)/gi
							var dstExpr = " sprOrg, PAR.HORG, 53, (PAR.HSC==31 ? GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", PAR.HSC, PAR.HSU, PAR.HST , 53), PAR.HDBSC, PAR.HMFOOT, PAR.HVAL) : GT_RASSC(\"COD\"+tfsc(\"ANLEVEL\", ASC, ASU, AST, 53), PAR.HCRSC, PAR.HMFOTO, PAR.HVAL))";
							prov["cr_cod"+i] = prov["cr_cod"+i].replace(re, dstExpr);
						}
					}
				}

				// sup-81261
				// в дате проводки документа PP надо учесть дату проведения платежа
				if (mFdoc.equalsIgnoreCase("PP"))
				{
					var re1 = /^\s*HDAT\s*$/i;
					var re2 = /^\s*PAR\.HDAT\s*$/i;
					prov.date = prov.date.replace(re1, "isEmpty(HPRDAT) ? HDAT : HPRDAT");
					prov.date = prov.date.replace(re2, "isEmpty(PAR.HPRDAT) ? PAR.HDAT : PAR.HPRDAT");
				}
			});
			oper.save();
		});

		// удалим переменную SCFIN
		var varlist = new DpUserVarsList(mFdoc, 0);
		varlist.load();
		varlist.remove("SCFIN");
		varlist.save();
	});

	// %cut end%
	return true;
}
