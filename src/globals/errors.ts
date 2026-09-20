/**
 * Domain errors.
 *
 * Every expected failure is one of these, carrying a stable `code` that maps to
 * an HTTP status and a Persian message. Modules throw them; exactly one place
 * (the route handler) turns them into responses, so no module needs to know
 * about HTTP.
 */

export const ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  LOT_UNAVAILABLE: "LOT_UNAVAILABLE",
  RESERVATION_EXPIRED: "RESERVATION_EXPIRED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_ALREADY_VERIFIED: "PAYMENT_ALREADY_VERIFIED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const HTTP_STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  OUT_OF_STOCK: 409,
  LOT_UNAVAILABLE: 409,
  RESERVATION_EXPIRED: 410,
  PAYMENT_FAILED: 402,
  PAYMENT_ALREADY_VERIFIED: 200,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  CONFLICT: 409,
};

/** Customer-facing Persian copy. Never leak internal detail into these. */
const MESSAGE_FA: Record<ErrorCode, string> = {
  NOT_FOUND: "موردی یافت نشد.",
  VALIDATION: "اطلاعات واردشده معتبر نیست.",
  OUT_OF_STOCK: "موجودی این محصول کافی نیست.",
  LOT_UNAVAILABLE: "این محموله در حال حاضر قابل فروش نیست.",
  RESERVATION_EXPIRED: "زمان رزرو سبد خرید شما به پایان رسید. لطفاً دوباره تلاش کنید.",
  PAYMENT_FAILED: "پرداخت ناموفق بود.",
  PAYMENT_ALREADY_VERIFIED: "این پرداخت قبلاً تأیید شده است.",
  UNAUTHENTICATED: "برای ادامه وارد حساب کاربری خود شوید.",
  FORBIDDEN: "دسترسی به این بخش مجاز نیست.",
  RATE_LIMITED: "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد تلاش کنید.",
  CONFLICT: "این عملیات با وضعیت فعلی سفارش سازگار نیست.",
};

export class DomainError extends Error {
  override readonly name = "DomainError";
  readonly code: ErrorCode;
  /** Structured detail for logs and for field-level form errors. */
  readonly detail: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, detail: Record<string, unknown> = {}) {
    super(message ?? code);
    this.code = code;
    this.detail = detail;
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }

  get messageFa(): string {
    return MESSAGE_FA[this.code];
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export interface ErrorResponseBody {
  error: { code: ErrorCode | "INTERNAL"; message: string; detail?: Record<string, unknown> };
}

/** The one mapping from thrown errors to an HTTP response shape. */
export function toErrorResponse(error: unknown): { status: number; body: ErrorResponseBody } {
  if (isDomainError(error)) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.messageFa,
          ...(Object.keys(error.detail).length > 0 ? { detail: error.detail } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "خطای غیرمنتظره‌ای رخ داد." } },
  };
}
