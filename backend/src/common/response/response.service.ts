import { Injectable } from '@nestjs/common';
import { ResponseCode } from './response-code.enum';

export interface ApiResponse<T = any> {
  success: boolean;
  code: ResponseCode;
  message: string;
  data: T | null;
}

/**
 * Standardized response envelope, mirroring the pinaypal ResponseService.
 * Controllers never return raw objects — always success() / error().
 */
@Injectable()
export class ResponseService {
  success<T>(code: ResponseCode, message: string, data: T | null = null): ApiResponse<T> {
    return { success: true, code, message, data };
  }

  error(code: ResponseCode, message: string): ApiResponse<null> {
    return { success: false, code, message, data: null };
  }
}
