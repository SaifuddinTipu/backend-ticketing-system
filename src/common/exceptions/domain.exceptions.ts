import { HttpException, HttpStatus } from '@nestjs/common';

export class EventNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      { error: 'Event Not Found', message: `Event ${id} does not exist` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class VenueNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      { error: 'Venue Not Found', message: `Venue ${id} does not exist` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class SeatAlreadyHeldException extends HttpException {
  constructor(seatId: string) {
    super(
      { error: 'Seat Already Held', message: `Seat ${seatId} is already held by another user` },
      HttpStatus.CONFLICT,
    );
  }
}

export class SeatNotHeldByUserException extends HttpException {
  constructor(seatId: string) {
    super(
      { error: 'Seat Not Held By User', message: `Seat ${seatId} is not held by this user` },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class OrderAlreadyConfirmedException extends HttpException {
  constructor(id: string) {
    super(
      { error: 'Order Already Confirmed', message: `Order ${id} is already confirmed` },
      HttpStatus.CONFLICT,
    );
  }
}

export class SeatsNotHeldException extends HttpException {
  constructor() {
    super(
      { error: 'Seats Not Held', message: 'One or more seats are not held by this user' },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class OrderNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      { error: 'Order Not Found', message: `Order ${id} does not exist` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TicketNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      { error: 'Ticket Not Found', message: `Ticket ${id} does not exist` },
      HttpStatus.NOT_FOUND,
    );
  }
}
