import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnThis();
const mockType = jest.fn().mockReturnThis();

const mockResponse = { status: mockStatus, type: mockType, json: mockJson };
const mockRequest = { url: '/test/path' };

const mockHost = {
  switchToHttp: () => ({
    getResponse: () => mockResponse,
    getRequest: () => mockRequest,
  }),
} as unknown as ArgumentsHost;

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jest.clearAllMocks();
  });

  it('formats an HttpException as RFC 7807 problem+json', () => {
    const exception = new HttpException(
      { error: 'Not Found', message: 'Resource missing' },
      HttpStatus.NOT_FOUND,
    );
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockType).toHaveBeenCalledWith('application/problem+json');
    expect(mockJson).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Resource missing',
      instance: '/test/path',
    });
  });

  it('joins array message fields into a single string', () => {
    const exception = new HttpException(
      { error: 'Bad Request', message: ['field is required', 'field must be string'] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'field is required; field must be string',
        status: 400,
      }),
    );
  });

  it('handles non-HttpException as 500 Internal Server Error', () => {
    const exception = new Error('Something exploded');
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        title: 'Internal Server Error',
      }),
    );
  });

  it('handles string HttpException response', () => {
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(403);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
  });
});
