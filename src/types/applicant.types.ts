import type { CheckStatus } from "@/types/monitor.types";

export interface Applicant {
  id: number;
  fullName: string;
  nie: string;
  nationalityCode: string;
  procedureCode: string;
  chatId: string | null;
  isActive: boolean;
  lastStatus: CheckStatus | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface CreateApplicantInput {
  fullName: string;
  nie: string;
  nationalityCode: string;
  procedureCode?: string;
  chatId?: string;
}
