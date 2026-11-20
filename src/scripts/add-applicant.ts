import "dotenv/config";
import { catalogService } from "@/services/catalog.service";
import { dbService } from "@/services/db.service";

const [
  nie,
  fullName,
  provinceCode = "8",
  procedureCode = "4010",
  chatId = process.env.TELEGRAM_CHAT_ID,
] = process.argv.slice(2);

if (!nie || !fullName) {
  console.error(
    'Usage: npm run db:add -- <NIE> "<FULL_NAME>" [PROVINCE_CODE=8] [PROCEDURE_CODE=4010] [CHAT_ID]',
  );
  process.exit(1);
}

const province = catalogService.getProvince(provinceCode);
const procedure = catalogService.getProcedure(provinceCode, procedureCode);

const saved = dbService.createApplicant({
  nie,
  fullName,
  provinceCode: province?.code ?? provinceCode,
  provinceName: province?.name ?? "Barcelona",
  provinceUrl:
    province?.url ??
    "https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es",
  procedureCode: procedure?.code ?? procedureCode,
  procedureName:
    procedure?.name ?? "POLICIA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA)",
  procedureGroup: procedure?.selectName ?? "tramiteGrupo[0]",
  chatId,
});

console.log("Saved applicant:", saved);
dbService.close();
