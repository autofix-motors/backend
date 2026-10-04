export class BaseResponseDto<T> {
  success: boolean;
  message: string;
  data: any | T;
  error?: any;
  statusCode?: number;
  meta?: Record<string, any>;

  constructor(
    success: boolean,
    message: string,
    data?: T,
    error?: any,
    statusCode?: number,
    meta?: Record<string, any>,
  ) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.error = error;
    this.statusCode = statusCode;
    this.meta = meta;
  }

  static success<T>(
    data: T,
    message: string,
    statusCode?: number,
    meta?: Record<string, any>,
  ): BaseResponseDto<T> {
    return new BaseResponseDto<T>(
      true,
      message,
      data,
      undefined,
      statusCode,
      meta,
    );
  }

  static error<T>(
    message: string,
    statusCode?: number,
    error?: any,
  ): BaseResponseDto<T> {
    return new BaseResponseDto<T>(false, message, undefined, error, statusCode);
  }
}
