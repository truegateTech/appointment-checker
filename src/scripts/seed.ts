import "dotenv/config";
import { catalogService } from "@/services/catalog.service";
import { dbService } from "@/services/db.service";

const SEED_APPLICANTS = [
  {
    nie: "X1234567A",
    fullName: "RAHUL SHARMA",
    provinceCode: "8",
    procedureCode: "4010",
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
];

function seed(): void {
  const existing = dbService.getActiveApplicants();

  for (const item of SEED_APPLICANTS) {
    const alreadyExists = existing.some(
      (a) =>
        a.nie === item.nie.trim().toUpperCase() &&
        a.provinceCode === item.provinceCode &&
        a.procedureCode === item.procedureCode,
    );

    if (alreadyExists) {
      console.log(
        `Skipping ${item.nie} (${item.procedureCode}) — already exists.`,
      );
      continue;
    }

    const province = catalogService.getProvince(item.provinceCode);
    const procedure = catalogService.getProcedure(
      item.provinceCode,
      item.procedureCode,
    );

    const saved = dbService.createApplicant({
      nie: item.nie,
      fullName: item.fullName,
      provinceCode: province?.code ?? item.provinceCode,
      provinceName: province?.name ?? "Barcelona",
      provinceUrl:
        province?.url ??
        "https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es",
      procedureCode: procedure?.code ?? item.procedureCode,
      procedureName:
        procedure?.name ?? "POLICIA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA)",
      procedureGroup: procedure?.selectName ?? "tramiteGrupo[0]",
      chatId: item.chatId,
    });

    console.log(
      `Seeded applicant #${saved.id}: ${saved.fullName} (${saved.nie})`,
    );
  }

  dbService.close();
}

seed();
