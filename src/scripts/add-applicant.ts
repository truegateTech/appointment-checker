import { dbService } from "@/services/db.service";

const [nie, fullName, nationalityCode, procedureCode = "4010"] =
  process.argv.slice(2);

if (!nie || !fullName || !nationalityCode) {
  console.error(
    'Usage: npx tsx src/scripts/add-applicant.ts <NIE> "<FULL_NAME>" <NATIONALITY_CODE> [PROCEDURE_CODE]',
  );
  process.exit(1);
}

const saved = dbService.upsertApplicant({
  nie,
  fullName,
  nationalityCode,
  procedureCode,
});
console.log("Saved applicant:", saved);
dbService.close();
