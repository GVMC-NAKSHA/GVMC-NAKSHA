import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (err instanceof HttpException) {
      return res.status(err.getStatus()).json({ message: err.message, ...(err.getResponse() as object) });
    }
    const msg = (err as Error)?.message ?? 'Internal server error';
    const code = /not found/i.test(msg) ? HttpStatus.NOT_FOUND
               : /invalid|required|must be/i.test(msg) ? HttpStatus.BAD_REQUEST
               : HttpStatus.INTERNAL_SERVER_ERROR;
    return res.status(code).json({ message: code === 500 ? 'Internal server error' : msg });
  }
}
