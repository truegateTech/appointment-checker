import "dotenv/config";
import { catalogService } from "@/services/catalog.service";
import { dbService } from "@/services/db.service";

const [
  nie,
  fullName,
  nationalityCode,
  provinceCode = "8",
  procedureCode = "4010",
  chatId = process.env.TELEGRAM_CHAT_ID,
] = process.argv.slice(2);

if (!nie || !fullName || !nationalityCode) {
  console.error(
    'Usage: npx tsx src/scripts/add-applicant.ts <NIE> "<FULL_NAME>" <NATIONALITY_CODE> [PROVINCE_CODE=8] [PROCEDURE_CODE=4010] [CHAT_ID]',
  );
  process.exit(1);
}

const province = catalogService.getProvince(provinceCode);
const procedure = catalogService.getProcedure(provinceCode, procedureCode);
const country = catalogService.getCountry(nationalityCode);

const saved = dbService.createApplicant({
  nie,
  fullName,
  provinceCode: province?.code ?? provinceCode,
  provinceName: province?.name ?? "Barcelona",
  provinceUrl:
    province?.url ??
    "https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es",
  procedureCode: procedure?.code ?? procedureCode,
  procedureName: procedure?.name ?? "POLICIA-TOMA DE HUELLAS",
  procedureGroup: procedure?.selectName ?? "tramiteGrupo[1]",
  nationalityCode: country?.code ?? nationalityCode,
  nationalityName: country?.name ?? "",
  chatId,
});

console.log("Saved applicant:", saved);
dbService.close();
