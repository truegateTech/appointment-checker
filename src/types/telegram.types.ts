import type {
  ErrorReport,
  MonitorStats,
  NonErrorCheckStatus,
} from "@/types/monitor.types";

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export interface TelegramInlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
}

export interface SendMessageOptions {
  chatId?: string;
  disable_notification?: boolean;
  disable_web_page_preview?: boolean;
  reply_markup?: TelegramReplyMarkup;
  skipDevPrefix?: boolean;
}

export interface SlotAlertParams {
  checkNumber: number;
  message: string;
  url: string;
  chatId?: string;
  details?: string;
  screenshotPath?: string;
}

export interface CheckStatusUpdateParams {
  checkNumber: number;
  status: NonErrorCheckStatus;
  applicantLabel: string;
  durationMs: number;
  message: string;
  url: string;
  chatId?: string;
}

export interface FailureAlertParams {
  title: string;
  reason: string;
  stats: MonitorStats;
  errorReport?: ErrorReport;
  chatId?: string;
}

export type WizardStep =
  | "PROVINCE"
  | "PROCEDURE"
  | "COUNTRY"
  | "NIE"
  | "FULL_NAME"
  | "CONFIRM";

export interface WizardDraft {
  step: WizardStep;
  provinceCode?: string;
  provinceName?: string;
  provinceUrl?: string;
  procedureCode?: string;
  procedureName?: string;
  procedureGroup?: string;
  nationalityCode?: string;
  nationalityName?: string;
  nie?: string;
  fullName?: string;
}
