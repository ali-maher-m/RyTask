import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

/**
 * AuthN guard (FR-AUTH). STUB — M0 implements JWT + PAT verification and attaches the
 * principal to the request. It currently allows all traffic so the scaffold runs.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // TODO(M0): verify JWT/PAT, attach principal, reject on failure.
    return true;
  }
}
