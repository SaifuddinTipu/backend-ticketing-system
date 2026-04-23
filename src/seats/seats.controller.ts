import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SeatsService } from './seats.service';
import { HoldSeatsDto } from './dto/hold-seats.dto';
import { ReleaseSeatsDto } from './dto/release-seats.dto';

@ApiTags('seats')
@Controller('events/:id/seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Get()
  @ApiOperation({ summary: 'Get seat map with live availability (merges MongoDB + Redis)' })
  @ApiParam({ name: 'id', description: 'Event MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Seat map with availability summary' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getSeatMap(@Param('id') id: string) {
    return this.seatsService.getSeatMap(id);
  }

  @Post('hold')
  @ApiOperation({ summary: 'Atomically hold seats (Lua script — all or nothing)' })
  @ApiParam({ name: 'id', description: 'Event MongoDB ObjectId' })
  @ApiHeader({ name: 'x-user-id', description: 'Caller user ID', required: true })
  @ApiResponse({ status: 201, description: 'Seats held — returns holdToken and expiresAt' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 409, description: 'One or more seats already held' })
  holdSeats(
    @Param('id') id: string,
    @Body() dto: HoldSeatsDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.seatsService.holdSeats(id, dto.seatIds, userId);
  }

  @Post('release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release held seats (only owner can release)' })
  @ApiParam({ name: 'id', description: 'Event MongoDB ObjectId' })
  @ApiHeader({ name: 'x-user-id', description: 'Caller user ID', required: true })
  @ApiResponse({ status: 200, description: 'Seats released' })
  @ApiResponse({ status: 403, description: 'Seat not held by this user' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  releaseSeats(
    @Param('id') id: string,
    @Body() dto: ReleaseSeatsDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.seatsService.releaseSeats(id, dto.seatIds, userId);
  }
}
